const mongoose = require('mongoose');

const disputeSchema = new mongoose.Schema({
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    projectTitle: { type: String, required: true },

    initiatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    initiatorName: { type: String, required: true },

    respondentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    respondentName: { type: String, default: '' },

    reason: { type: String, required: true },
    description: { type: String, required: true },
    evidence: [{ type: String }],

    status: { type: String, enum: ['open', 'under-review', 'resolved'], default: 'open' },
    resolution: { type: String, default: '' },
    resolutionNotes: { type: String, default: '' },
    resolvedBy: { type: String, default: '' },
    resolvedAt: { type: Date, default: null }
}, { timestamps: true });

disputeSchema.index({ status: 1 });
disputeSchema.index({ projectId: 1 });

module.exports = mongoose.model('Dispute', disputeSchema);