const Project = require('../models/Project');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

/**
 * Stripe initialization helper
 */
function getStripe() {
    if (!process.env.STRIPE_SECRET_KEY) return null;
    try {
        return require('stripe')(process.env.STRIPE_SECRET_KEY);
    } catch (e) {
        logger.error('Stripe init error: ' + e.message);
        return null;
    }
}

class PaymentApiController {
    /**
     * @route GET /api/payments/checkout/:id
     * @desc Get data required to initialize the checkout UI
     */
    async getCheckout(req, res) {
        try {
            const project = await Project.findById(req.params.id).lean();
            const userId = (req.user._id || req.user.id).toString();

            if (!project) {
                return res.status(404).json({ success: false, message: 'Project not found' });
            }

            // Ensure the requester is the client of the project
            if (project.clientId.toString() !== userId) {
                return res.status(403).json({ success: false, message: 'Unauthorized' });
            }

            // Validations for payment state
            if (project.status !== 'assigned') {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Payment is only available for assigned projects' 
                });
            }

            if (project.isPaid) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'This project has already been paid' 
                });
            }

            // Find the bid that was accepted
            const selectedBid = project.bids.find(b => 
                project.selectedBidId && b._id.toString() === project.selectedBidId.toString()
            );

            if (!selectedBid) {
                return res.status(400).json({ success: false, message: 'No accepted bid found' });
            }

            const stripeAvailable = !!process.env.STRIPE_SECRET_KEY;

            return res.status(200).json({
                success: true,
                data: {
                    title: 'Secure Payment',
                    project: {
                        id: project._id,
                        title: project.title,
                        category: project.category
                    },
                    selectedBid: {
                        amount: selectedBid.amount,
                        deliveryTime: selectedBid.deliveryTime
                    },
                    stripePublicKey: process.env.STRIPE_PUBLIC_KEY || '',
                    stripeAvailable
                }
            });

        } catch (e) {
            logger.error('getCheckout logic error: ' + e.message);
            return res.status(500).json({ success: false, message: 'Internal Server Error' });
        }
    }

    /**
     * @route POST /api/payments/create-intent/:id
     * @desc Create a Stripe PaymentIntent or process a simulated payment
     */
    async createPaymentIntent(req, res) {
        try {
            const project = await Project.findById(req.params.id);
            const userId = (req.user._id || req.user.id).toString();

            if (!project || project.clientId.toString() !== userId) {
                return res.status(403).json({ success: false, error: 'Unauthorized' });
            }

            if (project.isPaid) {
                return res.status(400).json({ success: false, error: 'Already paid' });
            }

            if (project.status !== 'assigned') {
                return res.status(400).json({ success: false, error: 'Project not in assigned state' });
            }

            const selectedBid = project.bids.find(b => 
                project.selectedBidId && b._id.toString() === project.selectedBidId.toString()
            );

            if (!selectedBid) {
                return res.status(400).json({ success: false, error: 'No accepted bid' });
            }

            const stripe = getStripe();
            const simulatePayment = process.env.NODE_ENV === 'test' || process.env.PAYMENT_MODE === 'demo' || !stripe;

            // Handle Simulated Payment if Stripe is not configured or demo mode is enabled
            if (simulatePayment) {
                project.isPaid = true;
                project.amountPaid = selectedBid.amount;
                project.status = 'in-progress';
                await project.save();

                const fee = Math.round(selectedBid.amount * 0.1);
                const tx = new Transaction({
                    projectId: project._id,
                    projectTitle: project.title,
                    fromUserId: project.clientId,
                    fromUserName: project.clientName,
                    toUserId: project.freelancerId,
                    toUserName: project.freelancerName,
                    amount: selectedBid.amount,
                    platformFee: fee,
                    netAmount: selectedBid.amount - fee,
                    type: 'escrow',
                    status: 'completed',
                    transactionRef: uuidv4(),
                    description: 'Simulated payment (no Stripe key set)'
                });
                await tx.save();

                await User.findByIdAndUpdate(project.clientId, { 
                    $inc: { totalSpent: selectedBid.amount } 
                });

                return res.status(200).json({ 
                    success: true, 
                    simulated: true, 
                    message: 'Simulated payment successful',
                    redirect: `/projects/${project._id}` 
                });
            }

            // Real Stripe Payment Logic
            const amountPaise = selectedBid.amount * 100; // Convert to smallest currency unit (paise/cents)
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amountPaise,
                currency: 'inr',
                metadata: { 
                    projectId: project._id.toString(), 
                    clientId: userId, 
                    freelancerId: project.freelancerId.toString() 
                },
                description: `FreelancerHub — ${project.title}`
            });

            return res.status(200).json({ 
                success: true,
                clientSecret: paymentIntent.client_secret 
            });

        } catch (e) {
            logger.error('createPaymentIntent error: ' + e.message);
            return res.status(500).json({ success: false, error: e.message });
        }
    }

    /**
     * @route POST /api/payments/webhook
     * @desc Handle Stripe Webhooks for asynchronous payment confirmation
     */
    async stripeWebhook(req, res) {
        const stripe = getStripe();
        if (!stripe) return res.sendStatus(200);

        const sig = req.headers['stripe-signature'];
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        let event;

        try {
            if (webhookSecret) {
                event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
            } else {
                event = JSON.parse(req.body.toString());
            }
        } catch (e) {
            return res.status(400).send(`Webhook Error: ${e.message}`);
        }

        if (event.type === 'payment_intent.succeeded') {
            const pi = event.data.object;
            const { projectId } = pi.metadata;

            try {
                const project = await Project.findById(projectId);

                if (project && !project.isPaid) {
                    const actualAmount = pi.amount / 100;
                    
                    project.isPaid = true;
                    project.amountPaid = actualAmount;
                    project.status = 'in-progress';
                    await project.save();

                    const fee = Math.round(actualAmount * 0.1);
                    const net = actualAmount - fee;

                    await Transaction.create({
                        projectId: project._id,
                        projectTitle: project.title,
                        fromUserId: project.clientId,
                        fromUserName: project.clientName,
                        toUserId: project.freelancerId,
                        toUserName: project.freelancerName,
                        amount: actualAmount,
                        platformFee: fee,
                        netAmount: net,
                        type: 'escrow',
                        status: 'completed',
                        transactionRef: pi.id,
                        description: `Stripe PaymentIntent: ${pi.id}`
                    });

                    // Update client total and notify both parties
                    await User.findByIdAndUpdate(project.clientId, { 
                        $inc: { totalSpent: actualAmount },
                        $push: { 
                            notifications: { 
                                message: `Payment of ₹${actualAmount} confirmed for "${project.title}"`, 
                                type: 'payment', 
                                link: `/projects/${project._id}` 
                            } 
                        } 
                    });

                    await User.findByIdAndUpdate(project.freelancerId, { 
                        $push: { 
                            notifications: { 
                                message: `Client paid for "${project.title}" — funds in escrow`, 
                                type: 'payment', 
                                link: `/projects/${project._id}` 
                            } 
                        } 
                    });
                }
            } catch (e) {
                logger.error('Webhook DB error: ' + e.message);
            }
        }

        return res.status(200).json({ received: true });
    }
}

module.exports = new PaymentApiController();