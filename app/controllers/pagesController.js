const User = require('../models/User');
const Project = require('../models/Project');
const logger = require('../utils/logger');

const CATEGORIES = ['Web Development', 'Mobile Development', 'Design & Creative', 'Writing & Content', 'Marketing & SEO',
    'Data Science & AI', 'DevOps & Cloud', 'Video & Animation', 'Finance & Accounting', 'Legal', 'Other'];

class PagesController {
    async landingPage(req, res) {
        try {
            const stats = { activeUsers: "10K+", projectsCompleted: "5K+", successRate: "98%", totalEarned: "$2M+" };
            res.render('landingPage',
                {
                    title: 'Freelancer Hub | Connect. Collaborate. Create.',
                    stats, user: req.user ? {
                        name: req.user.displayName,
                        role: req.user.role, avatar: req.user.avatar
                    } : null
                });

        } catch (error) {
            logger.error('landingPage error: ' + error.message);
            req.flash('error', 'Fail to load landing page');
            res.status(500).render('error', 
                {
                message: 'Internal Server Error'
            });
        }
    }

    getRegister(req, res) {
        if (req.user || req.cookies.token) return res.redirect('/dashboard');
        res.render('register', { title: 'Register' });
    }

    getVerify(req, res) {
        res.render('verify', { title: 'Verify Email' });
    }

    getLogin(req, res) {
        if (req.user || req.cookies.token) return res.redirect('/dashboard');
        res.render('login', { title: 'Login' });
    }

    async getDashboard(req, res) {
        try {
            const user = req.user || res.locals.currentUser;
            if (!user) return res.redirect('/login');
            let data = {};
            const userId = user._id || user.id;

            if (user.role === 'client') {
                const myProjects = await Project.find({ clientId: userId, isDeleted: false }).sort({ createdAt: -1 }).limit(5).lean();

                const totalProjects = await Project.countDocuments({ clientId: userId, isDeleted: false });

                const openProjects = await Project.countDocuments({ clientId: userId, status: 'open', isDeleted: false });

                const completedProjects = await Project.countDocuments({ clientId: userId, status: 'completed', isDeleted: false });

                const totalBidsReceived = myProjects.reduce((s, p) => s + p.totalBids, 0);

                data = {
                    myProjects,
                    totalProjects,
                    openProjects,
                    completedProjects,
                    totalBidsReceived
                };


            } else if (user.role === 'freelancer') {

                const appliedProjects = await Project.find({
                    'bids.freelancerId': userId,
                    isDeleted: false
                }).sort({ createdAt: -1 }).limit(5).lean();

                const activeProjects = await Project.find({
                    freelancerId: userId,
                    status: { $in: ['assigned', 'in-progress'] }, isDeleted: false
                }).lean();

                const completedProjects = await Project.countDocuments({
                    freelancerId: userId,
                    status: 'completed',
                    isDeleted: false
                });

                const totalBids = await Project.countDocuments({
                    'bids.freelancerId': userId,
                    isDeleted: false
                });

                data = {
                    appliedProjects,
                    activeProjects,
                    completedProjects,
                    totalBids
                };

            } else if (user.role === 'admin') {

                const totalUsers = await User.countDocuments({ isDeleted: false });

                const totalProjects = await Project.countDocuments({ isDeleted: false });

                const openProjects = await Project.countDocuments({ status: 'open', isDeleted: false });

                const completedProjects = await Project.countDocuments({ status: 'completed', isDeleted: false });

                const recentUsers = await User.find({ isDeleted: false },
                    { password: 0, notifications: 0 }).sort({ createdAt: -1 }).limit(5).lean();

                const recentProjects = await Project.find(
                    { isDeleted: false }).sort({ createdAt: -1 }).limit(5).lean();

                data = {
                    totalUsers,
                    totalProjects,
                    openProjects,
                    completedProjects,
                    recentUsers,
                    recentProjects
                };
            }
            res.render('dashboard', {
                title: 'Dashboard',
                currentUser: user, ...data
            });

        } catch (error) {
            logger.error('getDashboard error: ' + error.message);
            req.flash('error', 'Fail to load dashboard');
            res.status(500).render('error', { message: 'Internal Server Error' });
        }
    }

    async getProjects(req, res) {
        try {
            const { search, category, budget_min, budget_max, complexity, sort, page = 1 } = req.query;

            const filter = { status: 'open', isDeleted: false, visibility: 'public' };

            if (search) filter.$or = [{ title: { $regex: search, $options: 'i' } }, { description: { $regex: search, $options: 'i' } }, { skills: { $in: [new RegExp(search, 'i')] } }];
            if (category) filter.category = category;

            if (complexity) filter.aiComplexity = complexity;

            if (budget_min || budget_max) {

                filter['budget.min'] = {};

                if (budget_min) filter['budget.min'].$gte = Number(budget_min);

                if (budget_max) filter['budget.max'] = { $lte: Number(budget_max) };
            }
            const sortOptions = { newest: { createdAt: -1 }, oldest: { createdAt: 1 }, budget_high: { 'budget.max': -1 }, budget_low: { 'budget.min': 1 }, bids: { totalBids: -1 } };
            const sortBy = sortOptions[sort] || sortOptions.newest;
            const limit = 12;
            const skip = (Number(page) - 1) * limit;
            const [projects, total] = await Promise.all([Project.find(filter).sort(sortBy).skip(skip).limit(limit).select('-bids -milestones').lean(), Project.countDocuments(filter)]);
            res.render('projectsPage', { title: 'Browse Projects', projects, total, totalPages: Math.ceil(total / limit), currentPage: Number(page), query: req.query, categories: CATEGORIES });
        } catch (e) {
            logger.error("getProjects Error: " + e.message);
            req.flash('error', 'Failed to load projects');
            res.redirect('/');
        }
    }

    async getdetialsProject(req, res) {
        try {
            const project = await Project.findById(req.params.id).lean();

            if (!project || project.isDeleted) {
                req.flash('error', 'Project not found');
                return res.redirect('/projects');
            }

            Project.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } }).exec();

            let myBid = null;
            const activeUser = req.user || res.locals.currentUser;
            if (activeUser && activeUser.role === 'freelancer') {

                myBid = project.bids.find(b => b.freelancerId.toString() === (activeUser._id || activeUser.id).toString()) || null;
            }
            res.render('project-detail', {
                title: project.title,
                project, myBid, currentUser: activeUser
            });
        } catch (e) {
            logger.error("getdetialsProject Error: " + e.message);
            req.flash('error', 'Could not retrieve project details.');
            res.redirect('/projects');
        }
    }

    getCreateProject(req, res) {
        res.render('create-project', {
            title: 'Post a Project',
            categories: CATEGORIES,
            query: {}
        });
    }

    getSettings(req, res) {
        res.render('settings', {
            title: 'Settings',
            currentUser: req.user
        });
    }

    getForgotPassword(req, res) {
        res.render('forgot-password',
            { title: 'Forgot Password' });
    }

    getResetPassword(req, res) {
        const { token } = req.params;
        res.render('reset-password',
            { title: 'Reset Password', token });
    }
}

module.exports = new PagesController();
