const mongoose = require('mongoose');
const transactionSchema = new mongoose.Schema({
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    projectTitle: { type: String, required: true },
    
    // Party A (Sender)
    fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    fromUserName: { type: String, required: true },
    
    // Party B (Receiver)
    toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    toUserName: { type: String, required: true },
    
    // Financial Breakdown
    amount: { type: Number, required: true },
    platformFee: { type: Number, default: 0 },
    netAmount: { type: Number, required: true }, // Amount after fee
    
    type: { 
        type: String, 
        enum: ['escrow', 'release', 'milestone', 'refund', 'withdrawal', 'deposit'], 
        required: true 
    },
    status: { 
        type: String, 
        enum: ['pending', 'completed', 'failed', 'refunded'], 
        default: 'pending' 
    },
    
    transactionRef: { type: String, unique: true }, // e.g., Stripe PaymentIntent ID
    description: { type: String, default: '' },
    isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

transactionSchema.index({ fromUserId: 1, toUserId: 1, createdAt: -1 });
module.exports = mongoose.model('Transaction', transactionSchema);