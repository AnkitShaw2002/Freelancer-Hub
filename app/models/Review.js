const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
    projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project', required: true
    },

    projectTitle: {
        type: String,
        required: true
    },

    // The person writing the review
    reviewerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', required: true
    },
    reviewerName: {
        type: String,
        required: true
    },
    reviewerAvatar: {
        type: String,
        default: '/images/default-avatar.png'
    },

    // The person being reviewed
    revieweeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', required: true
    },

    revieweeName: {
        type: String,
        required: true
    },

    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    comment: {
        type: String,
        required: true,
        maxlength: 1000
    },

    type: {
        type: String,
        enum: ['client-to-freelancer', 'freelancer-to-client'],
        required: true
    }
}, { timestamps: true });

reviewSchema.index({ revieweeId: 1, createdAt: -1 });
module.exports = mongoose.model('Review', reviewSchema);