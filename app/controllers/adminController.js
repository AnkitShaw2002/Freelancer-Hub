const User = require('../models/User');
const Project = require('../models/Project');
const Transaction = require('../models/Transaction');
const Dispute = require('../models/Dispute');
const logger = require('../utils/logger');

class AdminController {
    async getDashboard(req, res) {
        try {
            // 1. User 
            const totalUsers = await User.countDocuments({ isDeleted: false });
            const totalFreelancers = await User.countDocuments({ role: 'freelancer', isDeleted: false });
            const totalClients = await User.countDocuments({ role: 'client', isDeleted: false });

            // 2. Project 
            const totalProjects = await Project.countDocuments({ isDeleted: false });
            const openProjects = await Project.countDocuments({ status: 'open', isDeleted: false });
            const completedProjects = await Project.countDocuments({ status: 'completed', isDeleted: false });

            // 3. Financial 
            const totalTx = await Transaction.countDocuments({ isDeleted: false });
            const earningsData = await Transaction.aggregate([
                { $match: { status: 'completed' } },
                { $group: { _id: null, total: { $sum: "$platformFee" } } }
            ]);
            const totalEarnings = earningsData.length > 0 ? earningsData[0].total : 0;

            // 4. Recent Activity Lists
            const recentUsers = await User.find({ isDeleted: false })
                .sort({ createdAt: -1 })
                .limit(5)
                .lean();

            const recentProjects = await Project.find({ isDeleted: false })
                .sort({ createdAt: -1 })
                .limit(5)
                .lean();

            res.render('admin/dashboard',
                {
                    title: 'Admin Dashboard',
                    totalUsers,
                    totalFreelancers,
                    totalClients,
                    totalProjects,
                    openProjects,
                    completedProjects,
                    totalTx,
                    totalEarnings,
                    recentUsers,
                    recentProjects
                });
        } catch (err) {
            logger.error('admin getDashboard: ' + err.message);
            req.flash('error', 'Failed to load admin dashboard');
            res.redirect('/');
        }
    }

    async getUsers(req, res) {
        try {
            const { role, search, page = 1 } = req.query;
            const filter = { isDeleted: false };

            if (role) filter.role = role;

            if (search) filter.$or = [{
                displayName: { $regex: search, $options: 'i' }
            },
            { email: { $regex: search, $options: 'i' } }];

            const limit = 20, skip = (Number(page) - 1) * limit;

            const [users, total] = await Promise.all([
                User.find(filter,
                    { password: 0, refreshToken: 0, notifications: 0 })
                    .sort({ createdAt: -1 }).
                    skip(skip).limit(limit).lean(),
                User.countDocuments(filter)
            ]);

            res.render('admin/users',
                {
                    title: 'Manage Users',
                    users, total,
                    totalPages: Math.ceil(total / limit),
                    currentPage: Number(page),
                    query: req.query
                });
        } catch (err) {
            logger.error('getUsers logic Error: ' + err.message);
            req.flash('error', 'Failed to load users');
            res.redirect('/admin');
        }
    }

    async toggleBan(req, res) {
        try {
            const user = await User.findById(req.params.id);

            if (!user) {
                req.flash('error','User not found');
                return res.redirect('/admin/users');
            }
            if (user.role === 'admin') {
                req.flash('error', 'Cannot ban admin');
                return res.redirect('/admin/users');
            }

            user.isBanned = !user.isBanned;

            await user.save();

            req.flash('success',
                `User ${user.isBanned ? 'banned' : 'unbanned'}
                  successfully`);

            res.redirect('/admin/users');
        } catch (err) {
            logger.error('toggleBan logic Error: ' + err.message);
            req.flash('error', 'Operation failed');
            res.redirect('/admin/users');
        }
    }

    async softDeleteUser(req, res) {
        try {
            const user = await User.findById(req.params.id);

            if (!user || user.role === 'admin') {
                req.flash('error', 'Cannot delete this user');
                return res.redirect('/admin/users');
            }

            user.isDeleted = true;
            user.deletedAt = new Date();

            await user.save();

            req.flash('success', 'User deleted');
            res.redirect('/admin/users');

        } catch (err) {
            logger.error('softDeleteUser logic Error: ' + err.message);
            req.flash('error', 'Failed to delete user');
            res.redirect('/admin/users');
        }
    }

    async getProjects(req, res) {
        try {
            const status = req.query.status;
            const page = Number(req.query.page) || 1;
            const limit = 20;
            const skip = (page - 1) * limit;

            // 2. Build Filter
            const filter = { isDeleted: false };
            if (status) {
                filter.status = status;
            }

            // 3. Fetch Data Sequentially
            // First: Get the total count for pagination
            const total = await Project.countDocuments(filter);

            // Second: Get the actual project data (No-Populate Strategy)
            const projects = await Project.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean();

            // 4. Calculate Pagination
            const totalPages = Math.ceil(total / limit);

            res.render('admin/projects', {
                title: 'Manage Projects',
                projects,
                total,
                totalPages,
                currentPage: page,
                query: req.query
            });
        } catch (err) {
            logger.error('getProject logic Error: ' + err.message);
            req.flash('error', 'Failed to load projects');
            res.redirect('/admin');
        }
    }

    async deleteProject(req, res) {
        try {
            await Project.findByIdAndUpdate(req.params.id, { isDeleted: true });

            req.flash('success', 'Project deleted'); 
            res.redirect('/admin/projects');

        } catch (err) {
            req.flash('error', 'Project deletion failed');
            res.redirect('/admin/projects');
        }
    }

    async getNotifications(req, res) {
        try {
            const userId = req.user._id || req.user.id;

            const user = await User.findById(userId, 'notifications displayName').lean();

            await User.findByIdAndUpdate(userId, { 'notifications.$[].isRead': true });

            const notifications = (user.notifications || []).reverse();
            res.render('notifications',
                {
                    title: 'Notifications',
                    notifications
                });
        } catch (err) {
            logger.error(' logic Error: ' + err.message);
            req.flash('error', 'Failed to load notifications');
            res.redirect('/dashboard');
        }
    }

    async getStats(req, res) {
        try {
            // 1. Basic Counts (Direct & Simple)
            const totalUsers = await User.countDocuments({ isDeleted: false });
            const totalProjects = await Project.countDocuments({ isDeleted: false });
            const totalTransactions = await Transaction.countDocuments({ isDeleted: false });

            // 2. Project Distribution (By Category & Status)
            const byCategory = await Project.aggregate([
                { $match: { isDeleted: false } },
                { $group: { _id: '$category', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]);

            const byStatus = await Project.aggregate([
                { $match: { isDeleted: false } },
                { $group: { _id: '$status', count: { $sum: 1 } } }
            ]);

            // 3. User Distribution (By Role)
            const byRole = await User.aggregate([
                { $match: { isDeleted: false } },
                { $group: { _id: '$role', count: { $sum: 1 } } }
            ]);

            // 4. Bidding Stats
            const bidResult = await Project.aggregate([
                { $match: { isDeleted: false } },
                { $group: { _id: null, total: { $sum: '$totalBids' } } }
            ]);
            const totalBids = bidResult.length > 0 ? bidResult[0].total : 0;

            // 5. Earnings Analytics (Overall)
            const earningsResult = await Transaction.aggregate([
                { $match: { status: 'completed' } },
                { $group: { _id: null, total: { $sum: '$platformFee' } } }
            ]);
            const totalEarnings = earningsResult.length > 0 ? earningsResult[0].total : 0;

            // 6. Monthly Earnings Trend (For Charts)
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

            // 7. Earnings by Category (Revenue Analysis)
            const earningsByCategory = await Transaction.aggregate([
                { $match: { status: 'completed' } },
                {
                    $lookup: {
                        from: 'projects',
                        localField: 'projectId',
                        foreignField: '_id',
                        as: 'proj'
                    }
                },
                { $unwind: '$proj' },
                { $group: { _id: '$proj.category', earnings: { $sum: '$platformFee' } } },
                { $sort: { earnings: -1 } }
            ]);


            res.json({
                totalUsers,
                totalProjects,
                totalTransactions,
                // totalBids: bidResult[0]?.total || 0,
                totalBids,
                byCategory,
                byStatus,
                byRole,
                // totalEarnings: earningsResult[0]?.total || 0,
                totalEarnings,
                earningsByMonth,
                earningsByCategory
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }

    async getDisputes(req, res) {
        try {
            // 1. Get Query Parameters
            const status = req.query.status;
            const page = Number(req.query.page) || 1;
            const limit = 15;
            const skip = (page - 1) * limit;

            // 2. Build Filter for the list
            const filter = {};
            if (status) {
                filter.status = status;
            }

            // 3. Fetch Individual Counts 
            const openC = await Dispute.countDocuments({ status: 'open' });
            const reviewC = await Dispute.countDocuments({ status: 'under-review' });
            const resolvedC = await Dispute.countDocuments({ status: 'resolved' });

            // Get total count for the filtered results 
            const total = await Dispute.countDocuments(filter);

            // 4. Fetch the Dispute List 
            const disputes = await Dispute.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean();

            // 5. counts object for frontend
            const counts = {
                all: openC + reviewC + resolvedC,
                open: openC,
                'under-review': reviewC,
                resolved: resolvedC
            };

            // 6. Pagination Logic
            const totalPages = Math.ceil(total / limit);



            res.render('admin/disputes',
                {
                    title: 'Manage Disputes',
                    disputes,
                    total, // total count for the filtered view
                    totalPages,
                    currentPage: page,
                    query: req.query,
                    counts,
                });
        } catch (err) {
            logger.error('getDisputes logic Error: ' + err.message);
            req.flash('error', 'Failed to load disputes');
            res.redirect('/admin');
        }
    }

    async resolveDispute(req, res) {
        try {
            const { resolution, action } = req.body;

            const dispute = await Dispute.findById(req.params.id);

            if (!dispute) {
                req.flash('error', 'Dispute not found');
                return res.redirect('/admin/disputes');
            }
            if (action === 'review') {
                dispute.status = 'under-review';
            } else {
                dispute.status = 'resolved';
                dispute.resolution = resolution || '';
                dispute.resolutionNotes = resolution || '';
                dispute.resolvedBy = req.user.displayName || req.user.name;
                dispute.resolvedAt = new Date();
                await Project.findByIdAndUpdate(dispute.projectId, { status: 'in-progress' });

                const notifyIds = [dispute.initiatorId, dispute.respondentId].filter(Boolean);

                for (const uid of notifyIds) {
                    await User.findByIdAndUpdate(uid,
                        {
                            $push: {
                                notifications:
                                {
                                    message: `Dispute for "${dispute.projectTitle}" has been resolved.`,
                                    type: 'dispute', link: `/projects/${dispute.projectId}`
                                }
                            }
                        });
                }
            }
            await dispute.save();

            req.flash('success', action === 'review' ? 'Marked as under review' : 'Dispute resolved');

            res.redirect('/admin/disputes');

        } catch (err) {
            logger.error('resolveDispute: ' + err.message);
            req.flash('error', 'Failed to resolve dispute'); 
            res.redirect('/admin/disputes');
        }
    }

    getAnalytics(req, res) {
        try {
            res.render('admin/analytics', { title: 'Analytics' });
        } catch (error) {
            logger.error('resolveDispute: ' + err.message);
            req.flash('error', 'Failed to load Analytics page'); 
            res.redirect('/admin');
        }
        
    }
}

module.exports = new AdminController();
