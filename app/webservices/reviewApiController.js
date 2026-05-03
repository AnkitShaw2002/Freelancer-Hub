/**
 * ReviewApiController.js
 * * This controller manages the creation and retrieval of project reviews via API.
 * Features:
 * - JSON-based error and success responses.
 * - Automatic recalculation of user aggregate ratings (average and count).
 * - Multi-role support (Client-to-Freelancer and Freelancer-to-Client).
 */

const mongoose = require('mongoose');
const Review = require('../models/Review');
const User = require('../models/User');
const Project = require('../models/Project');
const logger = require('../utils/logger');

class ReviewApiController {
    /**
     * POST /api/reviews/:projectId
     * Submits a review for a completed project.
     */
    async postReview(req, res) {
        try {
            const { projectId } = req.params;
            const { rating, comment } = req.body;
            const userId = (req.user._id || req.user.id).toString();

            // 1. Validate Project existence and status
            const project = await Project.findById(projectId).lean();
            
            if (!project) {
                return res.status(404).json({
                    success: false,
                    message: "Project not found."
                });
            }

            if (project.status !== 'completed') {
                return res.status(400).json({
                    success: false,
                    message: "Reviews can only be submitted for completed projects."
                });
            }

            // 2. Determine Role and Authorization
            const isClient = project.clientId.toString() === userId;
            const isFreelancer = project.freelancerId && project.freelancerId.toString() === userId;

            if (!isClient && !isFreelancer) {
                return res.status(403).json({
                    success: false,
                    message: "You are not authorized to review this project."
                });
            }

            // 3. Prevent Duplicate Reviews
            if (isClient && project.clientReviewed) {
                return res.status(400).json({
                    success: false,
                    message: "You have already reviewed the freelancer for this project."
                });
            }

            if (isFreelancer && project.freelancerReviewed) {
                return res.status(400).json({
                    success: false,
                    message: "You have already reviewed the client for this project."
                });
            }

            // 4. Setup Review Data
            const revieweeId = isClient ? project.freelancerId : project.clientId;
            const revieweeName = isClient ? project.freelancerName : project.clientName;
            const reviewerName = req.user.displayName || req.user.name;
            const reviewerAvatar = req.user.avatar || (req.user.profilePicture ? req.user.profilePicture.url : '');

            const review = new Review({
                projectId: project._id,
                projectTitle: project.title,
                reviewerId: userId,
                reviewerName,
                reviewerAvatar,
                revieweeId,
                revieweeName,
                rating: Number(rating),
                comment: comment?.trim(),
                type: isClient ? 'client-to-freelancer' : 'freelancer-to-client'
            });

            // 5. Save Review
            await review.save();

            // 6. Update User Stats (Aggregate Average Rating)
            const statsRes = await Review.aggregate([
                { $match: { revieweeId: new mongoose.Types.ObjectId(revieweeId) } },
                { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } }
            ]);

            const stats = statsRes[0] || { avg: 0, count: 0 };
            
            await User.findByIdAndUpdate(revieweeId, { 
                avgRating: Math.round(stats.avg * 10) / 10, 
                totalReviews: stats.count 
            });

            // 7. Update Project Metadata (Flag as Reviewed)
            const updateData = {};
            if (isClient) updateData.clientReviewed = true;
            else updateData.freelancerReviewed = true;

            await Project.findByIdAndUpdate(project._id, { $set: updateData });

            return res.status(201).json({
                success: true,
                message: "Review submitted successfully.",
                data: {
                    reviewId: review._id,
                    newAverageRating: Math.round(stats.avg * 10) / 10
                }
            });

        } catch (err) {
            logger.error(`postReview API Error: ${err.message}`);
            return res.status(500).json({
                success: false,
                message: "An internal server error occurred while submitting your review."
            });
        }
    }

    /**
     * GET /api/reviews/user/:userId
     * Retrieves all reviews received by a specific user.
     */
    async getUserReviews(req, res) {
        try {
            const { userId } = req.params;
            const reviews = await Review.find({ revieweeId: userId })
                .sort({ createdAt: -1 })
                .lean();

            return res.status(200).json({
                success: true,
                count: reviews.length,
                data: reviews
            });
        } catch (err) {
            logger.error(`getUserReviews API Error: ${err.message}`);
            return res.status(500).json({
                success: false,
                message: "Failed to fetch user reviews."
            });
        }
    }
}

module.exports = new ReviewApiController();