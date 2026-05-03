const mongoose = require('mongoose');
const User = require('../models/User');
const Project = require('../models/Project');
const Transaction = require('../models/Transaction');

class dashboardController {
  async getDashboard(req, res) {
    try {
      // const user = req.user;
      // if (!user) return res.redirect('/login');

      // let data = {};

      // const userId = new mongoose.Types.ObjectId(user._id || user.id);

      // if (user.role === 'client') {
      //   const [myProjects, stats] = await Promise.all([
      //     Project.aggregate([
      //       { $match: { clientId: userId, isDeleted: false } },
      //       { $sort: { createdAt: -1 } },
      //       { $limit: 5 }
      //     ]),
      //     Project.aggregate([
      //       { $match: { clientId: userId, isDeleted: false } },
      //       {
      //         $group: {
      //           _id: null,
      //           total: { $sum: 1 },
      //           open: { $sum: { $cond: [{ $eq: ["$status", "open"] }, 1, 0] } },
      //           completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
      //           bids: { $sum: "$totalBids" }
      //         }
      //       }
      //     ])
      //   ]);
      //   const s = stats[0] || { total: 0, open: 0, completed: 0, bids: 0 };
      //   data = { 
      //     myProjects, 
      //     totalProjects: s.total, 
      //     openProjects: s.open, 
      //     completedProjects: s.completed, 
      //     totalBidsReceived: s.bids 
      //   };

      // } else if (user.role === 'freelancer') {
      //   const [appliedProjects, activeProjects, stats] = await Promise.all([
      //     Project.aggregate([
      //       { $match: { 'bids.freelancerId': userId, isDeleted: false } },
      //       { $sort: { createdAt: -1 } },
      //       { $limit: 5 }
      //     ]),
      //     Project.aggregate([
      //       { $match: { freelancerId: userId, status: { $in: ['assigned', 'in-progress'] }, isDeleted: false } }
      //     ]),
      //     Project.aggregate([
      //       { $match: { freelancerId: userId, status: 'completed', isDeleted: false } },
      //       { $count: "count" }
      //     ])
      //   ]);
      //   const bidCountResult = await Project.aggregate([
      //       { $match: { 'bids.freelancerId': userId, isDeleted: false } },
      //       { $count: "count" }
      //   ]);
      //   data = { 
      //     appliedProjects, 
      //     activeProjects, 
      //     completedProjects: stats[0]?.count || 0, 
      //     totalBids: bidCountResult[0]?.count || 0 
      //   };

      // } else if (user.role === 'admin') {
      //   const [userStats, projectStats, recentUsers, recentProjects] = await Promise.all([
      //     User.aggregate([{ $count: "total" }]),
      //     Project.aggregate([
      //       { $match: { isDeleted: false } },
      //       {
      //         $group: {
      //           _id: null,
      //           total: { $sum: 1 },
      //           open: { $sum: { $cond: [{ $eq: ["$status", "open"] }, 1, 0] } },
      //           completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } }
      //         }
      //       }
      //     ]),
      //     User.aggregate([{ $sort: { createdAt: -1 } }, { $limit: 5 }]),
      //     Project.aggregate([{ $match: { isDeleted: false } }, { $sort: { createdAt: -1 } }, { $limit: 5 }])
      //   ]);
      //   const ps = projectStats[0] || { total: 0, open: 0, completed: 0 };

      //   data = { 
      //     totalUsers: userStats[0]?.total || 0, 
      //     totalProjects: ps.total, 
      //     openProjects: ps.open, 
      //     completedProjects: ps.completed, 
      //     recentUsers, 
      //     recentProjects 
      //   };
      // }

      // res.render('dashboard', { 
      //   title: 'Dashboard',
      //    ...data });



      const user = req.user;
        if (!user) return res.redirect('/login');

        const userId = new mongoose.Types.ObjectId(user._id || user.id);

        // --- CLIENT ROLE ---
        if (user.role === 'client') {
            const myProjects = await Project.find({ clientId: userId, isDeleted: false })
                .sort({ createdAt: -1 })
                .limit(5)
                .lean();

            const totalProjects = await Project.countDocuments({ clientId: userId, isDeleted: false });
            const openProjects = await Project.countDocuments({ clientId: userId, status: 'open', isDeleted: false });
            const completedProjects = await Project.countDocuments({ clientId: userId, status: 'completed', isDeleted: false });

            // Calculate total bids received across all client projects
            const bidStats = await Project.aggregate([
                { $match: { clientId: userId, isDeleted: false } },
                { $group: { _id: null, totalBids: { $sum: "$totalBids" } } }
            ]);
            const totalBidsReceived = bidStats.length > 0 ? bidStats[0].totalBids : 0;

            return res.render('dashboard', {
                title: 'Dashboard',
                myProjects,
                totalProjects,
                openProjects,
                completedProjects,
                totalBidsReceived
            });
        }

        // --- FREELANCER ROLE ---
        if (user.role === 'freelancer') {
            // Projects where freelancer has placed a bid
            const appliedProjects = await Project.find({ 'bids.freelancerId': userId, isDeleted: false })
                .sort({ createdAt: -1 })
                .limit(5)
                .lean();

            // Projects currently assigned to the freelancer
            const activeProjects = await Project.find({ 
                freelancerId: userId, 
                status: { $in: ['assigned', 'in-progress'] }, 
                isDeleted: false 
            }).lean();

            const completedProjects = await Project.countDocuments({ freelancerId: userId, status: 'completed', isDeleted: false });
            const totalBids = await Project.countDocuments({ 'bids.freelancerId': userId, isDeleted: false });

            return res.render('dashboard', {
                title: 'Dashboard',
                appliedProjects,
                activeProjects,
                completedProjects,
                totalBids
            });
        }

        // --- ADMIN ROLE ---
        if (user.role === 'admin') {
            const totalUsers = await User.countDocuments({ isDeleted: false });
            const totalProjects = await Project.countDocuments({ isDeleted: false });
            const openProjects = await Project.countDocuments({ status: 'open', isDeleted: false });
            const completedProjects = await Project.countDocuments({ status: 'completed', isDeleted: false });

            const recentUsers = await User.find({ isDeleted: false })
                .sort({ createdAt: -1 })
                .limit(5)
                .lean();

            const recentProjects = await Project.find({ isDeleted: false })
                .sort({ createdAt: -1 })
                .limit(5)
                .lean();

            return res.render('dashboard', {
                title: 'Dashboard',
                totalUsers,
                totalProjects,
                openProjects,
                completedProjects,
                recentUsers,
                recentProjects
            });
        }



    } catch (e) {
      console.error(e);
      req.flash('error', 'Failed to load dashboard');
      res.redirect('/');
    }
  }
}

module.exports = new dashboardController();
