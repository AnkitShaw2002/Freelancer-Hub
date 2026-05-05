const mongoose = require('mongoose');
const Review = require('../models/Review');
const User = require('../models/User');
const Project = require('../models/Project');
const logger = require('../utils/logger');

class ReviewController {
    async postReview(req, res) {
        try {
            const projects = await Project.aggregate([
                { $match: { _id: new mongoose.Types.ObjectId(req.params.projectId) } }
            ]);
            const project = projects[0];
            if (!project || project.status !== 'completed') {
                req.flash('error', 'Can only review completed projects');
                return res.redirect('/dashboard');
            }
            const userId = (req.user._id || req.user.id).toString();

            const isClient = project.clientId.toString() === userId;

            const isFreelancer = project.freelancerId && project.freelancerId.toString() === userId;

            if (!isClient && !isFreelancer) {
                req.flash('error', 'Unauthorized');
                return res.redirect('/dashboard');
            }

            if (isClient && project.clientReviewed) {
                req.flash('error', 'You have already reviewed this project');
                return res.redirect(`/projects/${project._id}`);
            }

            if (isFreelancer && project.freelancerReviewed) {
                req.flash('error', 'You have already reviewed this project');
                return res.redirect(`/projects/${project._id}`);
            }

            const revieweeId = isClient ? project.freelancerId : project.clientId;

            const revieweeName = isClient ? project.freelancerName : project.clientName;

            const { rating, comment } = req.body;

            const reviewerName = req.user.displayName || req.user.name;

            const reviewerAvatar = req.user.avatar || '';

            const review = new Review({
                projectId: project._id,
                projectTitle: project.title,
                reviewerId: userId,
                reviewerName,
                reviewerAvatar,
                revieweeId,
                revieweeName,
                rating: Number(rating),
                comment, type: isClient ? 'client-to-freelancer' : 'freelancer-to-client'
            });

            await review.save();
            
            const statsRes = await Review.aggregate([
                { $match: { revieweeId: new mongoose.Types.ObjectId(revieweeId) } },
                { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } }
            ]);
            const stats = statsRes[0] || { avg: 0, count: 0 };
            
            await User.findByIdAndUpdate(revieweeId, { 
                avgRating: Math.round(stats.avg * 10) / 10, 
                totalReviews: stats.count 
            });

            const updateData = {};
            if (isClient) updateData.clientReviewed = true;
            else updateData.freelancerReviewed = true;

            await Project.findByIdAndUpdate(project._id, { $set: updateData });

            req.flash('success', 'Review submitted successfully!');

            res.redirect(`/projects/${project._id}`);

        } catch (err) {
            logger.error('postReview: ' + err.message);
            req.flash('error', 'Failed to submit review');
             res.redirect('/dashboard');
        }
    }
}

module.exports = new ReviewController();
