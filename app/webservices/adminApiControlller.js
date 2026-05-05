const User = require('../models/User');
const Project = require('../models/Project');
const Transaction = require('../models/Transaction');
const Dispute = require('../models/Dispute');
const logger = require('../utils/logger');

class AdminApiController {
    /**
     * @route GET /api/admin/dashboard
     * @desc Get summary metrics for the admin dashboard
     */
    async getDashboard(req, res) {
        try {
            // 1. User Metrics
            const totalUsers = await User.countDocuments({ isDeleted: false });
            const totalFreelancers = await User.countDocuments({ role: 'freelancer', isDeleted: false });
            const totalClients = await User.countDocuments({ role: 'client', isDeleted: false });

            // 2. Project Metrics
            const totalProjects = await Project.countDocuments({ isDeleted: false });
            const openProjects = await Project.countDocuments({ status: 'open', isDeleted: false });
            const completedProjects = await Project.countDocuments({ status: 'completed', isDeleted: false });

            // 3. Financial Metrics
            const totalTx = await Transaction.countDocuments({ isDeleted: false });
            const earningsData = await Transaction.aggregate([
                { $match: { status: 'completed' } },
                { $group: { _id: null, total: { $sum: "$platformFee" } } }
            ]);
            const totalEarnings = earningsData.length > 0 ? earningsData[0].total : 0;

            // 4. Recent Activity Lists (No-Populate Strategy)
            const recentUsers = await User.find({ isDeleted: false })
                .select('-password -refreshToken -notifications')
                .sort({ createdAt: -1 })
                .limit(5)
                .lean();

            const recentProjects = await Project.find({ isDeleted: false })
                .sort({ createdAt: -1 })
                .limit(5)
                .lean();

            return res.status(200).json({
                success: true,
                data: {
                    metrics: {
                        users: { total: totalUsers, freelancers: totalFreelancers, clients: totalClients },
                        projects: { total: totalProjects, open: openProjects, completed: completedProjects },
                        finance: { totalTransactions: totalTx, totalEarnings }
                    },
                    recentUsers,
                    recentProjects
                }
            });
        } catch (err) {
            logger.error('API Admin getDashboard: ' + err.message);
            return res.status(500).json({ success: false, message: 'Failed to load dashboard data', error: err.message });
        }
    }

    /**
     * @route GET /api/admin/users
     * @desc Paginated and filterable user list
     */
    async getUsers(req, res) {
        try {
            const { role, search, page = 1 } = req.query;
            const filter = { isDeleted: false };

            if (role) filter.role = role;

            if (search) {
                filter.$or = [
                    { displayName: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } }
                ];
            }

            const limit = 20;
            const skip = (Number(page) - 1) * limit;

            const [users, total] = await Promise.all([
                User.find(filter, { password: 0, refreshToken: 0, notifications: 0 })
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                User.countDocuments(filter)
            ]);

            return res.status(200).json({
                success: true,
                users,
                pagination: {
                    total,
                    totalPages: Math.ceil(total / limit),
                    currentPage: Number(page),
                    limit
                }
            });
        } catch (err) {
            logger.error('API Admin getUsers: ' + err.message);
            return res.status(500).json({ success: false, message: 'Failed to fetch users' });
        }
    }

    /**
     * @route PATCH /api/admin/users/:id/toggle-ban
     * @desc Ban or unban a user
     */
    async toggleBan(req, res) {
        try {
            const user = await User.findById(req.params.id);

            if (!user) {
                return res.status(404).json({ success: false, message: 'User not found' });
            }
            if (user.role === 'admin') {
                return res.status(403).json({ success: false, message: 'Cannot ban admin users' });
            }

            user.isBanned = !user.isBanned;
            await user.save();

            return res.status(200).json({
                success: true,
                message: `User ${user.isBanned ? 'banned' : 'unbanned'} successfully`,
                isBanned: user.isBanned
            });
        } catch (err) {
            logger.error('API Admin toggleBan: ' + err.message);
            return res.status(500).json({ success: false, message: 'Operation failed' });
        }
    }

    /**
     * @route DELETE /api/admin/users/:id
     * @desc Soft delete a user
     */
    async softDeleteUser(req, res) {
        try {
            const user = await User.findById(req.params.id);

            if (!user || user.role === 'admin') {
                return res.status(403).json({ success: false, message: 'Cannot delete this user' });
            }

            user.isDeleted = true;
            user.deletedAt = new Date();
            await user.save();

            return res.status(200).json({ success: true, message: 'User soft-deleted successfully' });
        } catch (err) {
            logger.error('API Admin softDeleteUser: ' + err.message);
            return res.status(500).json({ success: false, message: 'Failed to delete user' });
        }
    }

    /**
     * @route GET /api/admin/projects
     */
    async getProjects(req, res) {
        try {
            const { status, page = 1 } = req.query;
            const limit = 20;
            const skip = (Number(page) - 1) * limit;

            const filter = { isDeleted: false };
            if (status) filter.status = status;

            const total = await Project.countDocuments(filter);
            const projects = await Project.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean();

            return res.status(200).json({
                success: true,
                projects,
                pagination: {
                    total,
                    totalPages: Math.ceil(total / limit),
                    currentPage: Number(page)
                }
            });
        } catch (err) {
            logger.error('API Admin getProjects: ' + err.message);
            return res.status(500).json({ success: false, message: 'Failed to fetch projects' });
        }
    }

    /**
     * @route GET /api/admin/stats
     * @desc Comprehensive analytics data (JSON for charts)
     */
    async getStats(req, res) {
        try {
            const totalUsers = await User.countDocuments({ isDeleted: false });
            const totalProjects = await Project.countDocuments({ isDeleted: false });
            const totalTransactions = await Transaction.countDocuments({ isDeleted: false });

            const byCategory = await Project.aggregate([
                { $match: { isDeleted: false } },
                { $group: { _id: '$category', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]);

            const byStatus = await Project.aggregate([
                { $match: { isDeleted: false } },
                { $group: { _id: '$status', count: { $sum: 1 } } }
            ]);

            const byRole = await User.aggregate([
                { $match: { isDeleted: false } },
                { $group: { _id: '$role', count: { $sum: 1 } } }
            ]);

            const bidResult = await Project.aggregate([
                { $match: { isDeleted: false } },
                { $group: { _id: null, total: { $sum: '$totalBids' } } }
            ]);

            const earningsResult = await Transaction.aggregate([
                { $match: { status: 'completed' } },
                { $group: { _id: null, total: { $sum: '$platformFee' } } }
            ]);

            const earningsByMonth = await Transaction.aggregate([
                { $match: { status: 'completed' } },
                {
                    $group: {
                        _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
                        earnings: { $sum: "$platformFee" }
                    }
                },
                { $sort: { "_id": 1 } }
            ]);

            return res.status(200).json({
                success: true,
                stats: {
                    totals: {
                        users: totalUsers,
                        projects: totalProjects,
                        transactions: totalTransactions,
                        bids: bidResult[0]?.total || 0,
                        revenue: earningsResult[0]?.total || 0
                    },
                    distributions: { byCategory, byStatus, byRole },
                    trends: { earningsByMonth }
                }
            });
        } catch (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
    }

    /**
     * @route GET /api/admin/disputes
     */
    async getDisputes(req, res) {
        try {
            const { status, page = 1 } = req.query;
            const limit = 15;
            const skip = (Number(page) - 1) * limit;

            const filter = status ? { status } : {};

            const [openC, reviewC, resolvedC, total, disputes] = await Promise.all([
                Dispute.countDocuments({ status: 'open' }),
                Dispute.countDocuments({ status: 'under-review' }),
                Dispute.countDocuments({ status: 'resolved' }),
                Dispute.countDocuments(filter),
                Dispute.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean()
            ]);

            return res.status(200).json({
                success: true,
                disputes,
                counts: {
                    all: openC + reviewC + resolvedC,
                    open: openC,
                    underReview: reviewC,
                    resolved: resolvedC
                },
                pagination: {
                    total,
                    totalPages: Math.ceil(total / limit),
                    currentPage: Number(page)
                }
            });
        } catch (err) {
            logger.error('API Admin getDisputes: ' + err.message);
            return res.status(500).json({ success: false, message: 'Failed to fetch disputes' });
        }
    }

    /**
     * @route POST /api/admin/disputes/:id/resolve
     */
    async resolveDispute(req, res) {
        try {
            const { resolution, action } = req.body;
            const dispute = await Dispute.findById(req.params.id);

            if (!dispute) {
                return res.status(404).json({ success: false, message: 'Dispute not found' });
            }

            if (action === 'review') {
                dispute.status = 'under-review';
            } else {
                dispute.status = 'resolved';
                dispute.resolution = resolution || '';
                dispute.resolutionNotes = resolution || '';
                dispute.resolvedBy = req.user.displayName || 'Admin';
                dispute.resolvedAt = new Date();
                
                await Project.findByIdAndUpdate(dispute.projectId, { status: 'in-progress' });

                // Notifications
                const notifyIds = [dispute.initiatorId, dispute.respondentId].filter(Boolean);
                const notification = {
                    message: `Dispute for "${dispute.projectTitle}" has been resolved.`,
                    type: 'dispute',
                    link: `/projects/${dispute.projectId}`
                };

                for (const uid of notifyIds) {
                    await User.findByIdAndUpdate(uid, { $push: { notifications: notification } });
                }
            }

            await dispute.save();
            return res.status(200).json({
                success: true,
                message: action === 'review' ? 'Marked as under review' : 'Dispute resolved',
                status: dispute.status
            });

        } catch (err) {
            logger.error('API Admin resolveDispute: ' + err.message);
            return res.status(500).json({ success: false, message: 'Failed to resolve dispute' });
        }
    }


    async deleteProject(req, res) {
    try {
        const { id } = req.params;

        // 1. Perform Soft Delete
        // We use findByIdAndUpdate to ensure we get the document back if needed
        const project = await Project.findByIdAndUpdate(
            id, 
            { isDeleted: true },
            { returnDocument: 'after' } // returns the updated document
        );
        if (!project) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }

        // 3. API Success Response
        return res.status(200).json({
            success: true,
            message: 'Project successfully deleted (soft-delete)',
            data: {
                projectId: project._id,
                isDeleted: project.isDeleted
            }
        });

    } catch (err) {
        logger.error('adminDeleteProject Error: ' + err.message);
        
        return res.status(500).json({
            success: false,
            message: 'An internal error occurred while deleting the project',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
}


async getNotifications(req, res) {
    try {
        const userId = req.user._id || req.user.id;

        // 1. Fetch the user's notifications
        // We select only notifications to keep the payload light
        const user = await User.findById(userId, 'notifications').lean();

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // 2. Logic: Mark all as read
        // The original logic marks them all as read when the list is viewed.
        // We do this in the background to ensure a fast response.
        await User.findByIdAndUpdate(userId, { 
            $set: { 'notifications.$[].isRead': true } 
        });

        // 3. Prepare data
        // Reverse so the newest notifications appear first
        const notifications = (user.notifications || []).reverse();

        // 4. API Success Response
        return res.status(200).json({
            success: true,
            message: 'Notifications retrieved and marked as read',
            count: notifications.length,
            unreadCount: 0, // Since we just marked them all as read
            data: notifications
        });

    } catch (err) {
        logger.error('apiGetNotifications Error: ' + err.message);
        
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve notifications',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
}


}

module.exports = new AdminApiController();