const mongoose = require('mongoose');
const User = require('../models/User');
const Project = require('../models/Project');
const logger = require('../utils/logger');

class DashboardApiController {
    /**
     * @route GET /api/dashboard
     * @desc Get aggregated dashboard data based on user role
     */
    async getDashboard(req, res) {
        try {
            const user = req.user;
            if (!user) {
                return res.status(401).json({ success: false, message: 'Unauthorized' });
            }

            const userId = new mongoose.Types.ObjectId(user._id || user.id);
            let dashboardData = {
                role: user.role,
                user: {
                    id: user._id,
                    displayName: user.displayName,
                    email: user.email
                }
            };

            // --- CLIENT ROLE ---
            if (user.role === 'client') {
                const [myProjects, totalProjects, openProjects, completedProjects, bidStats] = await Promise.all([
                    Project.find({ clientId: userId, isDeleted: false })
                        .sort({ createdAt: -1 })
                        .limit(5)
                        .lean(),
                    Project.countDocuments({ clientId: userId, isDeleted: false }),
                    Project.countDocuments({ clientId: userId, status: 'open', isDeleted: false }),
                    Project.countDocuments({ clientId: userId, status: 'completed', isDeleted: false }),
                    Project.aggregate([
                        { $match: { clientId: userId, isDeleted: false } },
                        { $group: { _id: null, totalBids: { $sum: "$totalBids" } } }
                    ])
                ]);

                dashboardData.stats = {
                    totalProjects,
                    openProjects,
                    completedProjects,
                    totalBidsReceived: bidStats.length > 0 ? bidStats[0].totalBids : 0
                };
                dashboardData.recentProjects = myProjects;
            }

            // --- FREELANCER ROLE ---
            else if (user.role === 'freelancer') {
                const [appliedProjects, activeProjects, completedCount, totalBids] = await Promise.all([
                    Project.find({ 'bids.freelancerId': userId, isDeleted: false })
                        .sort({ createdAt: -1 })
                        .limit(5)
                        .lean(),
                    Project.find({ 
                        freelancerId: userId, 
                        status: { $in: ['assigned', 'in-progress'] }, 
                        isDeleted: false 
                    }).lean(),
                    Project.countDocuments({ freelancerId: userId, status: 'completed', isDeleted: false }),
                    Project.countDocuments({ 'bids.freelancerId': userId, isDeleted: false })
                ]);

                dashboardData.stats = {
                    totalBidsPlaced: totalBids,
                    activeProjectsCount: activeProjects.length,
                    completedProjectsCount: completedCount
                };
                dashboardData.appliedProjects = appliedProjects;
                dashboardData.activeProjects = activeProjects;
            }

            // --- ADMIN ROLE ---
            else if (user.role === 'admin') {
                const [totalUsers, totalProjects, openProjects, completedProjects, recentUsers, recentProjects] = await Promise.all([
                    User.countDocuments({ isDeleted: false }),
                    Project.countDocuments({ isDeleted: false }),
                    Project.countDocuments({ status: 'open', isDeleted: false }),
                    Project.countDocuments({ status: 'completed', isDeleted: false }),
                    User.find({ isDeleted: false }).sort({ createdAt: -1 }).limit(5).lean(),
                    Project.find({ isDeleted: false }).sort({ createdAt: -1 }).limit(5).lean()
                ]);

                dashboardData.stats = {
                    totalUsers,
                    totalProjects,
                    openProjects,
                    completedProjects
                };
                dashboardData.recentUsers = recentUsers;
                dashboardData.recentProjects = recentProjects;
            } else {
                return res.status(403).json({ success: false, message: 'Invalid user role' });
            }

            return res.status(200).json({
                success: true,
                data: dashboardData
            });

        } catch (error) {
            logger.error('Dashboard API Error: ' + error.message);
            return res.status(500).json({ 
                success: false, 
                message: 'Failed to load dashboard data', 
                error: error.message 
            });
        }
    }
}

module.exports = new DashboardApiController();