const mongoose = require('mongoose');
const Project = require('../models/Project');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { v4: uuidv4 } = require('uuid');
const emailService = require('../services/emailService');
const aiService = require('../services/aiService');
const logger = require('../utils/logger');

const CATEGORIES = [
    'Web Development', 'Mobile Development', 'Design & Creative', 'Writing & Content', 'Marketing & SEO',
    'Data Science & AI', 'DevOps & Cloud', 'Video & Animation', 'Finance & Accounting', 'Legal', 'Other'
];

class ProjectController {
    static CATEGORIES = CATEGORIES;

    async getProjects(req, res) {
        try {
            const { search, category, budget_min, budget_max, complexity, sort, page = 1 } = req.query;

            const filter = { status: 'open', isDeleted: false, visibility: 'public' };

            if (search) filter.$or = [
                {
                    title: { $regex: search, $options: 'i' }
                }, { description: { $regex: search, $options: 'i' } }
                , { skills: { $in: [new RegExp(search, 'i')] } }];

            if (category) filter.category = category;

            if (complexity) filter.aiComplexity = complexity;

            if (budget_min || budget_max) {

                filter['budget.min'] = {};

                if (budget_min) filter['budget.min'].$gte = Number(budget_min);
                if (budget_max) filter['budget.max'] = { $lte: Number(budget_max) };
            }
            const sortOptions = {
                newest: { createdAt: -1 },
                oldest: { createdAt: 1 },
                budget_high: { 'budget.max': -1 },
                budget_low: { 'budget.min': 1 },
                bids: { totalBids: -1 }
            };

            const sortBy = sortOptions[sort] || sortOptions.newest;
            const limit = 8;
            const skip = (Number(page) - 1) * limit;
            const pipeline = [
                { $match: filter },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'clientId',
                        foreignField: '_id',
                        as: 'clientInfo'
                    }
                },
                {
                    $addFields: {
                        clientDetails: { $arrayElemAt: ['$clientInfo', 0] }
                    }
                },
                {
                    $addFields: {
                        clientName: { $ifNull: ['$clientDetails.displayName', '$clientName'] },
                        clientAvatar: { $ifNull: ['$clientDetails.profilePicture.url', '$clientAvatar'] },
                        clientRating: { $ifNull: ['$clientDetails.avgRating', 0] }
                    }
                },
                {
                    $project: {
                        bids: 0,
                        milestones: 0,
                        clientInfo: 0,
                        clientDetails: 0
                    }
                },
                { $sort: sortBy },
                { $skip: skip },
                { $limit: limit }
            ];

            const [projects, total] = await Promise.all([
                Project.aggregate(pipeline),
                Project.countDocuments(filter)
            ]);
            res.render('projectsPage', {
                title: 'Browse Projects',
                projects, total,
                totalPages: Math.ceil(total / limit),
                currentPage: Number(page),
                query: req.query,
                categories: CATEGORIES
            });
        } catch (err) {
            logger.error('getProjects: ' + err.message);
            req.flash('error', 'Failed to load projects');
            res.redirect('/');
        }
    }

    async getProject(req, res, next) {
        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return next();
            }
            const projects = await Project.aggregate([
                { $match: { _id: new mongoose.Types.ObjectId(req.params.id), isDeleted: false } },
                { $limit: 1 }
            ]);

            const project = projects[0];
            if (!project) {
                req.flash('error','Project not found');
                return res.redirect('/projects');
            }

            await Project.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } });

            let myBid = null;

            const activeUser = req.user || res.locals.currentUser;
            if (activeUser && activeUser.role === 'freelancer') {

                const userId = (activeUser._id || activeUser.id).toString();

                myBid = project.bids.find(b => b.freelancerId.toString() === userId) || null;
            }

            res.render('project-detail', {
                title: project.title,
                project, myBid,
                currentUser: activeUser
            });
        } catch (err) {
            logger.error('getProject: ' + err.message);
            req.flash('error', 'Project not found');
            res.redirect('/projects');
        }
    }

    getCreateProject(req, res) {
        res.render('create-project', {
            title: 'Post a Project',
            categories: CATEGORIES
        });
    }

    async postCreateProject(req, res) {
        try {
            const { title, description, category, skills, budget_type, budget_min,
                budget_max, deadline, experience, milestones: milestonesRaw } = req.body;

            const activeUser = req.user;
            const clientId = activeUser._id || activeUser.id;
            const clientName = activeUser.displayName || activeUser.name;
            const clientAvatar = activeUser.avatar || (activeUser.profilePicture && activeUser.profilePicture.url) || '';

            let skillsArr = skills ? skills.split(',').map(s => s.trim()).filter(Boolean) : [];
            let aiSummary = '', aiSkillsMatched = [], aiComplexity = 'medium', aiEstimatedDays = null;
            try {
                // Summary and bullets (15s timeout)
                const aiResult = await Promise.race([
                    aiService.summarizeProject(title, description),
                    new Promise(r => setTimeout(() => r(null), 15000))
                ]);
                
                if (aiResult) {
                    aiSummary = aiResult.summary || '';
                    aiSkillsMatched = aiResult.bullets || [];
                    aiComplexity = aiResult.difficulty || 'medium';
                    aiEstimatedDays = aiResult.estimatedDays || null;
                }

                // Skill extraction if not provided (12s timeout)
                if (skillsArr.length === 0) {
                    const extracted = await Promise.race([
                        aiService.extractSkills(description),
                        new Promise(r => setTimeout(() => r([]), 12000))
                    ]);
                    skillsArr = extracted;
                }
            } catch (aiErr) {
                logger.error('AI error: ' + aiErr.message);
            }

            let milestones = [];
            if (milestonesRaw) {
                try {
                    milestones = JSON.parse(milestonesRaw);
                    milestones = milestones.map(m => ({
                        ...m,
                        amount: Number(m.amount),
                        dueDate: m.dueDate ? new Date(m.dueDate) : null
                    }));
                } catch (e) {
                     logger.error('Milestone parse error: ' + e.message); }
            }

            const project = new Project({
                clientId, clientName, clientAvatar,
                title, description, category,
                skills: skillsArr,
                budget: { type: budget_type || 'fixed', min: Number(budget_min), max: Number(budget_max) },
                deadline: deadline ? new Date(deadline) : null,
                experience: experience || 'intermediate',
                milestones,
                aiSummary, aiSkillsMatched, aiComplexity, aiEstimatedDays,
                status: 'open', visibility: 'public'
            });

            await project.save();
            req.flash('success',
                'Project posted successfully!' + (aiSummary ? ' AI summary generated.' : ''));

            res.redirect(`/projects/${project._id}`);

        } catch (err) {
            logger.error('postCreateProject: ' + err.message);
            req.flash('error', 'Failed to create project: ' + err.message);
            res.redirect('/client/projects/create');
        }
    }

    async postBid(req, res) {
        try {
            const project = await Project.findById(req.params.id);

            if (!project || project.status !== 'open') {
                req.flash('error', 'Project is not open for bids');
                return res.redirect(`/projects/${req.params.id}`);
            }

            const userId = (req.user._id || req.user.id).toString();

            if (project.clientId.toString() === userId) {
                req.flash('error', 'You cannot bid on your own project');
                return res.redirect(`/projects/${req.params.id}`);
            }

            if (project.bids.some(b => b.freelancerId.toString() === userId)) {
                req.flash('error', 'You have already placed a bid');
                return res.redirect(`/projects/${req.params.id}`);
            }

            const { amount, deliveryDays, proposal } = req.body;

            if (!amount || !deliveryDays || !proposal) {
                req.flash('error', 'All bid fields are required');
                return res.redirect(`/projects/${req.params.id}`);
            }

            const freelancerName = req.user.displayName || req.user.name;

            const freelancerAvatar = req.user.avatar || '';

            project.bids.push({
                freelancerId: userId, freelancerName, freelancerAvatar,
                freelancerRating: req.user.avgRating || 0, amount: Number(amount),
                deliveryDays: Number(deliveryDays), proposal
            });

            project.totalBids = project.bids.filter(b => ['pending', 'accepted'].includes(b.status)).length;

            await project.save();
            try {
                const client = await User.findById(project.clientId).select('email displayName notifications').lean();
                if (client) {
                    await emailService.sendNewBidEmail({
                        clientEmail: client.email,
                        clientName: client.displayName, freelancerName,
                        projectTitle: project.title, projectId: project._id, bidAmount: Number(amount)
                    });

                    await User.findByIdAndUpdate(project.clientId,
                        {
                            $push: {
                                notifications: {
                                    message: `New bid from ${freelancerName} on "${project.title}"`,
                                    type: 'bid', link: `/projects/${project._id}`
                                }
                            }
                        });
                }
            } catch (e) {

                logger.error('Bid notification error: ' + e.message);
            }

            req.flash('success', 'Bid submitted successfully!');

            res.redirect(`/projects/${req.params.id}`);

        } catch (err) {
            logger.error('postBid: ' + err.message);
            req.flash('error', 'Failed to submit bid');
            res.redirect(`/projects/${req.params.id}`);
        }
    }

    async awardProject(req, res) {
        try {
            const project = await Project.findById(req.params.id);

            const userId = (req.user._id || req.user.id).toString();

            if (!project || project.clientId.toString() !== userId) {
                req.flash('error', 'Unauthorized');
                return res.redirect('/dashboard');
            }

            const bid = project.bids.id(req.params.bidId);

            if (!bid) {
                req.flash('error', 'Bid not found');
                return res.redirect(`/projects/${req.params.id}`);
            }

            project.status = 'assigned';

            project.freelancerId = bid.freelancerId;

            project.freelancerName = bid.freelancerName;

            project.freelancerAvatar = bid.freelancerAvatar;

            project.selectedBidId = bid._id;

            bid.status = 'accepted';

            project.bids.forEach(b => { if (b._id.toString() !== bid._id.toString()) b.status = 'rejected'; });

            await project.save();
            try {
                const freelancer = await User.findById(bid.freelancerId).select('email displayName').lean();

                if (freelancer) {

                    await emailService.sendBidAwardedEmail({
                        freelancerEmail: freelancer.email,
                        freelancerName: freelancer.displayName,
                        clientName: req.user.displayName || req.user.name, projectTitle: project.title,
                        projectId: project._id, amount: bid.amount
                    });

                    await User.findByIdAndUpdate(bid.freelancerId,
                        {
                            $push: {
                                notifications: {
                                    message: `You were awarded "${project.title}"!`,
                                    type: 'project', link: `/projects/${project._id}`
                                }
                            }
                        });
                }
            } catch (e) {
                logger.error('Award email error: ' + e.message);
            }

            req.flash('success', `Project awarded to ${bid.freelancerName}!`);

            res.redirect(`/projects/${project._id}`);

        } catch (err) {
            logger.error('awardProject: ' + err.message);

            req.flash('error', 'Failed to award project');

            res.redirect(`/projects/${req.params.id}`);
        }
    }

    async updateStatus(req, res) {
        try {
            const { newStatus } = req.body;

            const project = await Project.findById(req.params.id);

            if (!project) {
                req.flash('error', 'Not found');
                return res.redirect('/dashboard');

            }

            const userId = (req.user._id || req.user.id).toString();

            const isClient = project.clientId.toString() === userId;

            const isFreelancer = project.freelancerId && project.freelancerId.toString() === userId;

            if (!isClient && !isFreelancer && req.user.role !== 'admin') {
                req.flash('error', 'Unauthorized');
                return res.redirect('/dashboard');
            }


            if (newStatus === 'completed') {

                if (isFreelancer && !isClient && req.user.role !== 'admin') {

                    req.flash('error', 'Only the client can mark the project as complete and release final payment.');

                    return res.redirect(`/projects/${project._id}`);
                }

                if (!project.finalWorkSubmitted && project.status === 'in-progress') {
                    req.flash('error', 'Freelancer must submit final work before you can mark this as complete.');
                    return res.redirect(`/projects/${project._id}`);
                }

                project.completedAt = new Date();

                if (project.freelancerId && project.selectedBidId) {

                    const selectedBid = project.bids.find(b => b._id.toString() === project.selectedBidId.toString());
                    if (selectedBid) {
                        // Calculate if we already paid milestones
                        const totalPaidMilestones = project.milestones.filter(m => m.status === 'approved').reduce((acc, m) => acc + m.amount, 0);
                        const remaining = selectedBid.amount - totalPaidMilestones;

                        if (remaining > 0) {
                            const fee = Math.round(remaining * 0.1);
                            const net = remaining - fee;
                            await Transaction.create({
                                projectId: project._id,
                                projectTitle: project.title,
                                fromUserId: project.clientId,
                                fromUserName: project.clientName,
                                toUserId: project.freelancerId,
                                toUserName: project.freelancerName,
                                amount: remaining, platformFee: fee,
                                netAmount: net,
                                type: 'release',
                                status: 'completed',
                                transactionRef: uuidv4(),
                                description: 'Final project completion'
                            });

                            await User.findByIdAndUpdate(project.freelancerId, {
                                $inc: {
                                    walletBalance: net,
                                    totalEarnings: net,
                                    completedProjects: 1
                                },

                                $push: {
                                    notifications: {
                                        message: `Project completed! ₹${net.toLocaleString('en-IN')} released to your wallet.`,
                                        type: 'payment', link: `/projects/${project._id}`
                                    }
                                }
                            });

                            await User.findByIdAndUpdate(project.clientId, {
                                $inc: {
                                    totalSpent: remaining,
                                    completedProjects: 1
                                }
                            });

                        } else {
                            // Already fully paid via milestones
                            await User.findByIdAndUpdate(project.freelancerId,
                                { $inc: { completedProjects: 1 } });

                            await User.findByIdAndUpdate(project.clientId,
                                { $inc: { completedProjects: 1 } });
                        }
                    }
                }
            }
            project.status = newStatus;
            await project.save();

            req.flash('success', `Project marked as ${newStatus}`);

            res.redirect(`/projects/${project._id}`);

        } catch (err) {
            logger.error('updateStatus: ' + err.message);
            req.flash('error', 'Status update failed');
            res.redirect('/dashboard');
        }
    }

    async submitFinalWork(req, res) {
        try {
            const project = await Project.findById(req.params.id);

            if (!project) { req.flash('error', 'Project not found'); return res.redirect('/projects'); }

            const userId = (req.user._id || req.user.id).toString();

            if (!project.freelancerId || project.freelancerId.toString() !== userId) {
                req.flash('error', 'Unauthorized');
                return res.redirect(`/projects/${project._id}`);
            }

            const { description } = req.body;
            if (!description || !description.trim()) {
                req.flash('error', 'Please provide a description of the final work');
                return res.redirect(`/projects/${project._id}`);
            }

            project.finalWorkSubmitted = true;
            project.finalWorkDescription = description.trim();
            project.finalWorkSubmittedAt = new Date();
            await project.save();

            await User.findByIdAndUpdate(project.clientId,
                {
                    $push: {
                        notifications: {
                            message: `${req.user.displayName || req.user.name}
                 submitted the final work for "${project.title}". Please review and mark as complete.`,
                            type: 'project', link: `/projects/${project._id}`
                        }
                    }
                });

            req.flash('success', 'Final work submitted! Waiting for client approval.');
            res.redirect(`/projects/${project._id}`);
        } catch (err) {
            logger.error('submitFinalWork: ' + err.message);
            req.flash('error', 'Failed to submit final work');
            res.redirect(`/projects/${req.params.id}`);
        }
    }

    async getMyProjects(req, res) {
        try {
            const userId = new mongoose.Types.ObjectId(req.user._id || req.user.id);

            const projects = await Project.aggregate([

                { $match: { clientId: userId, isDeleted: false } },

                { $sort: { createdAt: -1 } }
            ]);

            res.render('client/my-projects', { title: 'My Projects', projects });

        } catch (err) {
            logger.error('getMyProjects: ' + err.message);
            req.flash('error', 'Failed to load projects');
            res.redirect('/dashboard');
        }
    }

    async getMyBids(req, res) {
        try {
            const userId = (req.user._id || req.user.id).toString();

            const userIdObj = new mongoose.Types.ObjectId(userId);

            const projects = await Project.aggregate([

                { $match: { 'bids.freelancerId': userIdObj } },

                { $sort: { createdAt: -1 } },
                {
                    $addFields: {
                        myBid: {
                            $filter: {
                                input: '$bids',
                                as: 'bid',
                                cond: { $eq: ['$$bid.freelancerId', userIdObj] }
                            }
                        }
                    }
                },
                { $addFields: { myBid: { $arrayElemAt: ['$myBid', 0] } } }
            ]);
            res.render('freelancer/my-bids', { title: 'My Bids', projects });
        } catch (err) {
            logger.error('getMyBids: ' + err.message);
            req.flash('error', 'Failed to load bids');
            res.redirect('/dashboard');
        }
    }

    async withdrawBid(req, res) {
        try {
            const project = await Project.findById(req.params.id);

            if (!project) { req.flash('error', 'Not found'); return res.redirect('/dashboard'); }

            const bid = project.bids.id(req.params.bidId);

            const userId = (req.user._id || req.user.id).toString();

            if (!bid || bid.freelancerId.toString() !== userId) {
                req.flash('error', 'Unauthorized');
                return res.redirect('/dashboard');
            }

            if (bid.status !== 'pending') {
                req.flash('error', 'Cannot withdraw this bid');
                return res.redirect(`/projects/${project._id}`);
            }

            bid.status = 'withdrawn';

            project.totalBids = project.bids.filter(b => ['pending', 'accepted'].includes(b.status)).length;

            await project.save();

            req.flash('success', 'Bid withdrawn');

            res.redirect('/freelancer/bids');

        } catch (err) {
            logger.error('withdrawBid error: ' + err.message);
            req.flash('error', 'Failed to withdraw bid');
            res.redirect('/dashboard');
        }
    }

    async deleteProject(req, res) {
        try {
            const project = await Project.findById(req.params.id);

            const userId = (req.user._id || req.user.id).toString();

            if (!project || project.clientId.toString() !== userId) {
                req.flash('error', 'Unauthorized');
                return res.redirect('/client/projects');
            }

            if (!['open', 'cancelled'].includes(project.status)) {
                req.flash('error', 'Cannot delete active project');
                return res.redirect('/client/projects');
            }

            project.isDeleted = true;

            await project.save();

            req.flash('success', 'Project deleted');

            res.redirect('/client/projects');

        } catch (err) {
            logger.error('deleteProject error: ' + err.message);
            req.flash('error', 'Failed to delete');
            res.redirect('/client/projects');
        }
    }

    async getEditProject(req, res) {
        try {
            const project = await Project.findById(req.params.id).lean();

            if (!project) {
                req.flash('error', 'Project not found');
                return res.redirect('/client/projects');
            }

            const userId = (req.user._id || req.user.id).toString();

            if (project.clientId.toString() !== userId) {
                req.flash('error', 'Unauthorized');
                return res.redirect('/client/projects');
            }

            if (project.status !== 'open') {
                req.flash('error', 'Only open projects can be edited');
                return res.redirect(`/projects/${project._id}`);
            }

            res.render('client/edit-project', {
                title: 'Edit Project',
                project,
                categories: CATEGORIES
            });

        } catch (err) {
            logger.error('getEditProject error: ' + err.message);
            req.flash('error', 'Failed to load project');
            res.redirect('/client/projects');
        }
    }

    async postEditProject(req, res) {
        try {
            const project = await Project.findById(req.params.id);

            const userId = (req.user._id || req.user.id).toString();

            if (!project || project.clientId.toString() !== userId) {
                req.flash('error', 'Unauthorized');
                return res.redirect('/client/projects');
            }

            if (project.status !== 'open') {
                req.flash('error', 'Only open projects can be edited');
                return res.redirect(`/projects/${project._id}`);
            }

            const { title, description, category, skills, budget_type, budget_min,
                budget_max, deadline, experience, milestones: milestonesRaw } = req.body;

            project.title = title;
            project.description = description;
            project.category = category;
            project.skills = skills ? skills.split(',').map(s => s.trim()).filter(Boolean) : [];
            project.budget.type = budget_type || 'fixed';
            project.budget.min = Number(budget_min);
            project.budget.max = Number(budget_max);
            project.deadline = deadline ? new Date(deadline) : null;
            project.experience = experience || 'intermediate';

            if (milestonesRaw) {
                try {
                    let milestones = JSON.parse(milestonesRaw);
                    project.milestones = milestones.map(m => ({
                        ...m,
                        amount: Number(m.amount),
                        dueDate: m.dueDate ? new Date(m.dueDate) : null
                    }));
                } catch (e) { logger.error('Milestone parse error: ' + e.message); }
            }

            await project.save();
            req.flash('success', 'Project updated!');
            res.redirect(`/projects/${project._id}`);
        } catch (err) {
            logger.error('postEditProject: ' + err.message);
            req.flash('error', 'Failed to update project: ' + err.message);
            res.redirect(`/client/projects/${req.params.id}/edit`);
        }
    }

    async submitMilestone(req, res) {
        try {
            const project = await Project.findById(req.params.id);

            if (!project) {
                req.flash('error', 'Project not found');
                return res.redirect('/projects');

            }
            const userId = (req.user._id || req.user.id).toString();

            if (!project.freelancerId || project.freelancerId.toString() !== userId) {
                req.flash('error', 'Unauthorized');

                return res.redirect(`/projects/${project._id}`);
            }

            const ms = project.milestones.id(req.params.msId);

            if (!ms) {
                req.flash('error', 'Milestone not found');
                return res.redirect(`/projects/${project._id}`);
            }

            const { submittedWork } = req.body;

            if (!submittedWork || !submittedWork.trim()) {
                req.flash('error', 'Please describe the work completed');
                return res.redirect(`/projects/${project._id}`);
            }

            ms.status = 'submitted'; ms.submittedWork = submittedWork.trim();

            await project.save();

            await User.findByIdAndUpdate(
                project.clientId,
                {
                    $push: {
                        notifications: {
                            message: `${req.user.displayName || req.user.name} submitted work for milestone "${ms.title}"`,
                            type: 'project', link: `/projects/${project._id}`
                        }
                    }
                });

            req.flash('success', 'Milestone submitted!');

            res.redirect(`/projects/${project._id}`);

        } catch (err) {
            logger.error('submitMilestone eror: ' + err.message);
            req.flash('error', 'Failed to submit milestone');
            res.redirect(`/projects/${req.params.id}`);
        }
    }

    async approveMilestone(req, res) {
        try {
            const project = await Project.findById(req.params.id);

            if (!project) {
                req.flash('error', 'Project not found');
                return res.redirect('/projects');
            }

            const userId = (req.user._id || req.user.id).toString();

            if (project.clientId.toString() !== userId) {
                req.flash('error', 'Unauthorized');
                return res.redirect(`/projects/${project._id}`);
            }

            const ms = project.milestones.id(req.params.msId);

            if (!ms || ms.status !== 'submitted') {
                req.flash('error', 'Milestone not ready for approval');
                return res.redirect(`/projects/${project._id}`);
            }

            ms.status = 'approved';

            await project.save();

            const fee = Math.round(ms.amount * 0.1);

            const net = ms.amount - fee;

            await Transaction.create({
                projectId: project._id,
                projectTitle: project.title,
                fromUserId: project.clientId,
                fromUserName: project.clientName,
                toUserId: project.freelancerId, toUserName: project.freelancerName,
                amount: ms.amount,
                platformFee: fee,
                netAmount: net,
                type: 'milestone',
                status: 'completed',
                transactionRef: uuidv4(),
                description: `Milestone: ${ms.title}`
            });

            await User.findByIdAndUpdate(
                project.freelancerId,
                {
                    $inc: { walletBalance: net, totalEarnings: net },
                    $push:
                    {
                        notifications: {
                            message: `Milestone "${ms.title}" approved! ₹${net} added to wallet.`,
                            type: 'payment', link: `/projects/${project._id}`
                        }
                    }
                });
            req.flash('success', `Milestone approved! ₹${net.toLocaleString()} released.`);

            res.redirect(`/projects/${project._id}`);
        } catch (err) {
            logger.error('approveMilestone eror: ' + err.message);
            req.flash('error', 'Failed to approve milestone');
            res.redirect(`/projects/${req.params.id}`);
        }
    }

    async rejectMilestone(req, res) {
        try {
            const project = await Project.findById(req.params.id);

            const userId = (req.user._id || req.user.id).toString();

            if (!project || project.clientId.toString() !== userId) {

                req.flash('error', 'Unauthorized'); return res.redirect('/projects');
            }
            const ms = project.milestones.id(req.params.msId);

            if (!ms || ms.status !== 'submitted') {

                req.flash('error', 'Invalid action');

                return res.redirect(`/projects/${project._id}`);
            }

            ms.status = 'in-progress'; ms.submittedWork = '';

            await project.save();

            await User.findByIdAndUpdate(project.freelancerId,
                {
                    $push: {
                        notifications:
                        {
                            message: `Milestone "${ms.title}" was sent back for revision`,
                            type: 'project', link: `/projects/${project._id}`
                        }
                    }
                });

            req.flash('success', 'Milestone sent back for revision.');

            res.redirect(`/projects/${project._id}`);

        } catch (err) {
            logger.error('rejectMilestone eror: ' + err.message);
            req.flash('error', 'Failed to reject milestone');
            res.redirect(`/projects/${req.params.id}`);
        }
    }

    async analyseBids(req, res) {
        try {
            const project = await Project.findById(req.params.id).lean();

            const userId = (req.user._id || req.user.id).toString();

            if (!project || project.clientId.toString() !== userId) return res.status(403).json({ error: 'Unauthorized' });

            const result = await aiService.analyseBids(project.title, project.description, project.bids);

            if (!result) return res.json({ error: 'AI unavailable' });

            res.json(result);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }

    async getContract(req, res) {
        try {
            const project = await Project.findById(req.params.id).lean();

            const userId = (req.user._id || req.user.id).toString();

            if (!project || project.clientId.toString() !== userId) {
                req.flash('error', 'Unauthorized');
                return res.redirect('/dashboard');
            }

            if (!project.freelancerId) {
                req.flash('error', 'No freelancer assigned yet');
                return res.redirect(`/projects/${project._id}`);
            }

            const selectedBid = project.bids.find(b => project.selectedBidId && b._id.toString() === project.selectedBidId.toString());

            let contract = null;

            if (selectedBid) contract = await aiService.generateContract(project, selectedBid);

            res.render('client/contract', {
                title: 'Project Contract',
                project,
                selectedBid,
                contract
            });

        } catch (err) {
            logger.error('getContract: ' + err.message);
            req.flash('error', 'Failed to generate contract');
            res.redirect('/dashboard');
        }
    }
}

module.exports = new ProjectController();
