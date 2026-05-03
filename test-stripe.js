require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function testStripe() {
    console.log("Creating a test payment intent on your Stripe account...");
    try {
        const pi = await stripe.paymentIntents.create({
            amount: 50000,
            currency: 'inr',
            payment_method: 'pm_card_visa', // Automatic test card
            confirm: true,
            automatic_payment_methods: { enabled: true, allow_redirects: 'never' }
        });
        console.log("✅ Payment Intent Succeeded! ID:", pi.id);
        console.log("Check your Stripe CLI terminal now! Did a 'payment_intent.succeeded' event just appear?");
    } catch (e) {
        console.error("Error:", e.message);
    }
}

testStripe();
