const Project = require('../models/Project');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

function getStripe() {
    if (!process.env.STRIPE_SECRET_KEY) return null;
    try { return require('stripe')(process.env.STRIPE_SECRET_KEY); }
    catch (e) { console.error('Stripe init error:', e.message); return null; }
}

class PaymentController {
    async getCheckout(req, res) {
        try {
            const project = await Project.findById(req.params.id).lean();

            const userId = (req.user._id || req.user.id).toString();

            if (!project) {
                req.flash('error',
                    'Project not found');
                return res.redirect('/client/projects');
            }
            if (project.clientId.toString() !== userId) {
                req.flash('error', 'Unauthorized');
                return res.redirect('/dashboard');
            }

            if (project.status !== 'assigned') {
                req.flash('error', 'Payment is only available for assigned projects');
                return res.redirect(`/projects/${project._id}`);
            }

            if (project.isPaid) {
                req.flash('error',
                    'This project has already been paid');
                return res.redirect(`/projects/${project._id}`);
            }

            const selectedBid = project.bids.find(b => project.selectedBidId && b._id.toString() === project.selectedBidId.toString());

            if (!selectedBid) {
                req.flash('error', 'No accepted bid found');
                return res.redirect(`/projects/${project._id}`);
            }

            const stripeAvailable = !!process.env.STRIPE_SECRET_KEY;
            res.render('client/checkout',
                {
                    title: 'Secure Payment',
                    project, selectedBid,
                    stripePublicKey: process.env.STRIPE_PUBLIC_KEY || '', stripeAvailable
                });

        } catch (e) {
            logger.error('getCheckout logic error : ' + e.message);
            req.flash('error', 'Failed to load checkout');
            res.redirect('/client/projects');
        }
    }

    async createPaymentIntent(req, res) {
        try {
            const project = await Project.findById(req.params.id);

            const userId = (req.user._id || req.user.id).toString();

            if (!project || project.clientId.toString() !== userId) return res.status(403).json({ error: 'Unauthorized' });

            if (project.isPaid) return res.status(400).json({ error: 'Already paid' });

            if (project.status !== 'assigned') return res.status(400).json({ error: 'Project not in assigned state' });

            const selectedBid = project.bids.find(b => project.selectedBidId && b._id.toString() === project.selectedBidId.toString());

            if (!selectedBid) return res.status(400).json({ error: 'No accepted bid' });

            const stripe = getStripe();
            const simulatePayment = process.env.NODE_ENV === 'test' || process.env.PAYMENT_MODE === 'demo' || !stripe;
            if (simulatePayment) {
                project.isPaid = true;
                project.amountPaid = selectedBid.amount;
                project.status = 'in-progress';
                await project.save();
                const fee = Math.round(selectedBid.amount * 0.1);
                const tx = new Transaction({ projectId: project._id, projectTitle: project.title, fromUserId: project.clientId, fromUserName: project.clientName, toUserId: project.freelancerId, toUserName: project.freelancerName, amount: selectedBid.amount, platformFee: fee, netAmount: selectedBid.amount - fee, type: 'escrow', status: 'completed', transactionRef: uuidv4(), description: 'Simulated payment (no Stripe key set)' });
                await tx.save();
                await User.findByIdAndUpdate(project.clientId, { $inc: { totalSpent: selectedBid.amount } });
                return res.json({ simulated: true, redirect: `/projects/${project._id}` });
            }

            const amountPaise = selectedBid.amount * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amountPaise, currency: 'inr',
                metadata: { projectId: project._id.toString(), clientId: userId, freelancerId: project.freelancerId.toString() },
                description: `FreelancerHub — ${project.title}`
            });

            res.json({ clientSecret: paymentIntent.client_secret });

        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    async stripeWebhook(req, res) {
        const stripe = getStripe();

        if (!stripe) return res.sendStatus(200);

        const sig = req.headers['stripe-signature'];

        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

        let event;

        try {

            if (webhookSecret) { event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret); }
            else {
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

                    project.isPaid = true; project.amountPaid = pi.amount / 100; project.status = 'in-progress';

                    await project.save();

                    const fee = Math.round((pi.amount / 100) * 0.1);

                    const net = (pi.amount / 100) - fee;

                    await Transaction.create({
                        projectId: project._id,
                        projectTitle: project.title,
                        fromUserId: project.clientId,
                        fromUserName: project.clientName,
                        toUserId: project.freelancerId,
                        toUserName: project.freelancerName,
                        amount: pi.amount / 100,
                        platformFee: fee,
                        netAmount: net,
                        type: 'escrow',
                        status: 'completed',
                        transactionRef: pi.id,
                        description: `Stripe PaymentIntent: ${pi.id}`
                    });
                    await User.findByIdAndUpdate(project.clientId, { $inc: { totalSpent: pi.amount / 100 }, $push: { notifications: { message: `Payment of ₹${pi.amount / 100} confirmed for "${project.title}"`, type: 'payment', link: `/projects/${project._id}` } } });
                    await User.findByIdAndUpdate(project.freelancerId, { $push: { notifications: { message: `Client paid for "${project.title}" — funds in escrow`, type: 'payment', link: `/projects/${project._id}` } } });
                }
            } catch (e) {
                console.error('Webhook DB error:', e.message);
            }
        }
        res.sendStatus(200);
    }
}

module.exports = new PaymentController();
