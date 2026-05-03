const mongoose = require('mongoose');

const bidSchema = new mongoose.Schema({
    freelancerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    freelancerName: { type: String, required: true },
    freelancerAvatar: { type: String, default: '' },
    freelancerRating: { type: Number, default: 0 },
    amount: { type: Number, required: true },
    deliveryDays: { type: Number, required: true },
    proposal: { type: String, required: true, maxlength: 2000 },
    status: { type: String, enum: ['pending', 'accepted', 'rejected', 'withdrawn'], default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});

const milestoneSchema = new mongoose.Schema({
    title: { type: String, required: true },
    amount: { type: Number, required: true },
    dueDate: { type: Date, default: null },
    status: { type: String, enum: ['pending', 'in-progress', 'submitted', 'approved', 'rejected'], default: 'pending' },
    submittedWork: { type: String, default: '' }
});

const projectSchema = new mongoose.Schema({
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    clientName: { type: String, required: true },
    clientAvatar: { type: String, default: '' },

    freelancerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    freelancerName: { type: String, default: '' },
    freelancerAvatar: { type: String, default: '' },
    selectedBidId: { type: mongoose.Schema.Types.ObjectId, default: null },

    title: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, required: true, maxlength: 5000 },
    category: { type: String, required: true, index: true },
    skills: [{ type: String }],
    visibility: { type: String, enum: ['public', 'private'], default: 'public' },
    deadline: { type: Date, default: null },
    experience: { type: String, enum: ['beginner', 'intermediate', 'expert'], default: 'intermediate' },

    budget: {
        type: { type: String, enum: ['fixed', 'hourly'], default: 'fixed' },
        min: { type: Number, required: true },
        max: { type: Number, required: true }
    },

    aiSummary: { type: String, default: '' },
    aiSkillsMatched: [{ type: String }],
    aiComplexity: { type: String, enum: ['low', 'medium', 'high', 'beginner', 'intermediate', 'expert'], default: 'medium' },
    aiEstimatedDays: { type: Number, default: null },

    status: {
        type: String,
        enum: ['open', 'assigned', 'in-progress', 'completed', 'cancelled', 'disputed'],
        default: 'open',
        index: true
    },

    isPaid: { type: Boolean, default: false },
    amountPaid: { type: Number, default: 0 },

    finalWorkSubmitted: { type: Boolean, default: false },
    finalWorkDescription: { type: String, default: '' },
    finalWorkSubmittedAt: { type: Date, default: null },

    bids: [bidSchema],
    milestones: [milestoneSchema],

    totalBids: { type: Number, default: 0 },
    views: { type: Number, default: 0 },

    clientReviewed: { type: Boolean, default: false },
    freelancerReviewed: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
    isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

projectSchema.index({ status: 1, createdAt: -1 });
projectSchema.index({ title: 'text', description: 'text' });
projectSchema.index({ clientId: 1 });
projectSchema.index({ freelancerId: 1 });

module.exports = mongoose.model('Project', projectSchema);