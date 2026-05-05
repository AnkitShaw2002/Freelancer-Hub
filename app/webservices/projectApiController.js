const mongoose = require('mongoose');
const Project = require('../models/Project');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { v4: uuidv4 } = require('uuid');
const emailService = require('../services/emailService');
const aiService = require('../services/aiService');
const logger = require('../utils/logger');
const { getCache, setCache } = require('../utils/redisCache');

const CATEGORIES = [
    'Web Development', 'Mobile Development', 'Design & Creative', 'Writing & Content', 'Marketing & SEO',
    'Data Science & AI', 'DevOps & Cloud', 'Video & Animation', 'Finance & Accounting', 'Legal', 'Other'
];

class ProjectController {
    static CATEGORIES = CATEGORIES;

   async getProjects(req, res) {
    try {
        const { search, category, budget_min, budget_max, complexity, sort, page = 1 } = req.query;

        // 1. Build Filter
        const filter = { status: 'open', isDeleted: false, visibility: 'public' };

        if (search) {
            filter.$or = [
                { title: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { skills: { $in: [new RegExp(search, 'i')] } }
            ];
        }

        if (category) filter.category = category;
        if (complexity) filter.aiComplexity = complexity;

        if (budget_min || budget_max) {
            filter['budget.min'] = {};
            if (budget_min) filter['budget.min'].$gte = Number(budget_min);
            if (budget_max) filter['budget.max'] = { $lte: Number(budget_max) };
        }

        // 2. Sorting & Pagination Logic
        const sortOptions = {
            newest: { createdAt: -1 },
            oldest: { createdAt: 1 },
            budget_high: { 'budget.max': -1 },
            budget_low: { 'budget.min': 1 },
            bids: { totalBids: -1 }
        };

        const sortBy = sortOptions[sort] || sortOptions.newest;
        const limit = parseInt(req.query.limit) || 12; // Allow dynamic limits for API
        const skip = (Number(page) - 1) * limit;

        // 3. Aggregation Pipeline
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

        // 4. Execute Queries
        const [projects, total] = await Promise.all([
            Project.aggregate(pipeline),
            Project.countDocuments(filter)
        ]);

        // 5. API Response
        return res.status(200).json({
            success: true,
            message: 'Projects retrieved successfully',
            data: {
                projects,
                pagination: {
                    totalResults: total,
                    totalPages: Math.ceil(total / limit),
                    currentPage: Number(page),
                    limit: limit
                }
            }
        });

    } catch (err) {
        logger.error('apiGetProjects Error: ' + err.message);
        
        return res.status(500).json({
            success: false,
            message: 'Failed to load projects',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
}

    async getProject(req, res, next) {
        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return next();
            }
            const cacheKey = `project_detail:${req.params.id}`;
            let project = await getCache(cacheKey);
            if (!project) {
                const projects = await Project.aggregate([
                    { $match: { _id: new mongoose.Types.ObjectId(req.params.id), isDeleted: false } },
                    { $limit: 1 }
                ]);
                project = projects[0];
                if (!project) {
                    req.flash('error', 'Project not found');
                    return res.redirect('/projects');
                }
                await setCache(cacheKey, project, 120);
            }

            const updatedProject = await Project.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } }, { returnDocument: 'after' }).lean();
            if (updatedProject) {
                project.views = updatedProject.views;
            }

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
    try {
        // In an API, we don't render a page. 
        // Instead, we return the configuration data the frontend needs to build the form.
        
        return res.status(200).json({
            success: true,
            message: 'Metadata for creating a project retrieved successfully',
            data: {
                categories: CATEGORIES, // Array of allowed categories
                experienceLevels: ['entry', 'intermediate', 'expert'],
                budgetTypes: ['fixed', 'hourly'],
                defaultCurrency: 'INR'
            }
        });
        
    } catch (err) {
        // Standardized error response
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve project creation metadata',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
}

    async postCreateProject(req, res) {
    try {
        const { 
            title, description, category, skills, budget_type, budget_min,
            budget_max, deadline, experience, milestones: milestonesInput 
        } = req.body;

        // 1. Identify User (Auth middleware usually attaches user to req.user)
        const activeUser = req.user;
        if (!activeUser) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        const clientId = activeUser._id || activeUser.id;
        const clientName = activeUser.displayName || activeUser.name;
        const clientAvatar = activeUser.avatar || (activeUser.profilePicture?.url) || '';

        // 2. Process Skills (Handle both Array from JSON or String from Form-Data)
        let skillsArr = [];
        if (Array.isArray(skills)) {
            skillsArr = skills;
        } else if (typeof skills === 'string') {
            skillsArr = skills.split(',').map(s => s.trim()).filter(Boolean);
        }

        // 3. AI Enhancement Logic
        let aiSummary = '', aiSkillsMatched = [], aiComplexity = 'medium', aiEstimatedDays = null;
        try {
            const aiResult = await Promise.race([
                aiService.summarizeProject(title, description), 
                new Promise(r => setTimeout(() => r(null), 8000))
            ]);
            
            if (aiResult) { 
                aiSummary = aiResult.summary || ''; 
                aiSkillsMatched = aiResult.bullets || []; 
                aiComplexity = aiResult.difficulty || 'medium'; 
                aiEstimatedDays = aiResult.estimatedDays || null; 
            }

            if (skillsArr.length === 0) { 
                const extracted = await Promise.race([
                    aiService.extractSkills(description), 
                    new Promise(r => setTimeout(() => r([]), 6000))
                ]); 
                skillsArr = extracted; 
            }
        } catch (aiErr) { 
            logger.error('AI Processing error: ' + aiErr.message); 
        }

        // 4. Process Milestones
        let milestones = [];
        if (milestonesInput) {
            // In API calls, this is usually already an array. 
            // If it's a string (from multipart/form-data), we parse it.
            const rawM = typeof milestonesInput === 'string' ? JSON.parse(milestonesInput) : milestonesInput;
            
            milestones = rawM.map(m => ({
                ...m,
                amount: Number(m.amount),
                dueDate: m.dueDate ? new Date(m.dueDate) : null
            }));
        }

        // 5. Create and Save Project
        const project = new Project({
            clientId, clientName, clientAvatar,
            title, description, category,
            skills: skillsArr,
            budget: { 
                type: budget_type || 'fixed', 
                min: Number(budget_min), 
                max: Number(budget_max) 
            },
            deadline: deadline ? new Date(deadline) : null,
            experience: experience || 'intermediate',
            milestones,
            aiSummary, aiSkillsMatched, aiComplexity, aiEstimatedDays,
            status: 'open', visibility: 'public'
        });

        await project.save();

        // 6. API Success Response
        return res.status(201).json({
            success: true,
            message: 'Project posted successfully' + (aiSummary ? ' with AI enhancement.' : '.'),
            data: project
        });

    } catch (err) {
        logger.error('apiPostCreateProject Error: ' + err.message);
        
        return res.status(500).json({
            success: false,
            message: 'Failed to create project',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
}

    async postBid(req, res) {
    try {
        const { id } = req.params;
        const { amount, deliveryDays, proposal } = req.body;
        const activeUser = req.user;

        // 1. Validate Project Existence and Status
        const project = await Project.findById(id);
        if (!project || project.status !== 'open') {
            return res.status(400).json({
                success: false,
                message: 'Project is not found or no longer open for bids'
            });
        }

        const userId = (activeUser._id || activeUser.id).toString();

        // 2. Business Logic Validations
        // Prevent bidding on own project
        if (project.clientId.toString() === userId) {
            return res.status(403).json({
                success: false,
                message: 'You cannot bid on your own project'
            });
        }

        // Prevent duplicate bids
        if (project.bids.some(b => b.freelancerId.toString() === userId)) {
            return res.status(409).json({
                success: false,
                message: 'You have already placed a bid on this project'
            });
        }

        // 3. Input Validation
        if (!amount || !deliveryDays || !proposal) {
            return res.status(400).json({
                success: false,
                message: 'All bid fields (amount, deliveryDays, proposal) are required'
            });
        }

        // 4. Update Project with New Bid
        const freelancerName = activeUser.displayName || activeUser.name;
        const freelancerAvatar = activeUser.avatar || (activeUser.profilePicture?.url) || '';

        const newBid = {
            freelancerId: userId,
            freelancerName,
            freelancerAvatar,
            freelancerRating: activeUser.avgRating || 0,
            amount: Number(amount),
            deliveryDays: Number(deliveryDays),
            proposal,
            createdAt: new Date()
        };

        project.bids.push(newBid);

        // Update total count based on active bids
        project.totalBids = project.bids.filter(b => 
            ['pending', 'accepted'].includes(b.status || 'pending')
        ).length;

        await project.save();

        // 5. Async Notifications (Handled via try-catch to not block the response)
        try {
            const client = await User.findById(project.clientId).select('email displayName').lean();
            if (client) {
                // Send Email
                await emailService.sendNewBidEmail({
                    clientEmail: client.email,
                    clientName: client.displayName,
                    freelancerName,
                    projectTitle: project.title,
                    projectId: project._id,
                    bidAmount: Number(amount)
                });

                // Push In-App Notification
                await User.findByIdAndUpdate(project.clientId, {
                    $push: {
                        notifications: {
                            message: `New bid from ${freelancerName} on "${project.title}"`,
                            type: 'bid',
                            link: `/projects/${project._id}`,
                            createdAt: new Date()
                        }
                    }
                });
            }
        } catch (notifErr) {
            logger.error('Bid notification background error: ' + notifErr.message);
            // We don't return an error to the user here because the bid was actually saved successfully
        }

        // 6. Return Success Response
        return res.status(201).json({
            success: true,
            message: 'Bid submitted successfully!',
            data: {
                bid: newBid,
                totalBids: project.totalBids
            }
        });

    } catch (err) {
        logger.error('apiPostBid Error: ' + err.message);
        return res.status(500).json({
            success: false,
            message: 'An internal error occurred while submitting your bid',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
}

    async awardProject(req, res) {
    try {
        const { id, bidId } = req.params;
        const activeUser = req.user;

        // 1. Fetch Project
        const project = await Project.findById(id);

        // 2. Authorization Check (Only the client who created it can award it)
        const userId = (activeUser._id || activeUser.id).toString();
        if (!project || project.clientId.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized: You do not own this project'
            });
        }

        // 3. Find the specific bid
        // Mongoose sub-document .id() helper finds a bid by its _id in the array
        const bid = project.bids.id(bidId);
        if (!bid) {
            return res.status(404).json({
                success: false,
                message: 'The specified bid was not found'
            });
        }

        // 4. Update Project and Bid Status
        project.status = 'assigned';
        project.freelancerId = bid.freelancerId;
        project.freelancerName = bid.freelancerName;
        project.freelancerAvatar = bid.freelancerAvatar;
        project.selectedBidId = bid._id;

        // Set this bid to accepted and others to rejected
        bid.status = 'accepted';
        project.bids.forEach(b => {
            if (b._id.toString() !== bid._id.toString()) {
                b.status = 'rejected';
            }
        });

        await project.save();

        // 5. Background Notifications (Try-Catch to prevent blocking the response)
        try {
            const freelancer = await User.findById(bid.freelancerId).select('email displayName').lean();

            if (freelancer) {
                // Send Email Notification
                await emailService.sendBidAwardedEmail({
                    freelancerEmail: freelancer.email,
                    freelancerName: freelancer.displayName,
                    clientName: activeUser.displayName || activeUser.name,
                    projectTitle: project.title,
                    projectId: project._id,
                    amount: bid.amount
                });

                // Push In-App Notification to Freelancer
                await User.findByIdAndUpdate(bid.freelancerId, {
                    $push: {
                        notifications: {
                            message: `You were awarded the project: "${project.title}"!`,
                            type: 'project',
                            link: `/projects/${project._id}`,
                            createdAt: new Date()
                        }
                    }
                });
            }
        } catch (notifErr) {
            logger.error('Award notification background error: ' + notifErr.message);
        }

        // 6. Final API Response
        return res.status(200).json({
            success: true,
            message: `Project successfully awarded to ${bid.freelancerName}`,
            data: {
                projectId: project._id,
                status: project.status,
                assignedTo: project.freelancerName
            }
        });

    } catch (err) {
        logger.error('apiAwardProject Error: ' + err.message);
        return res.status(500).json({
            success: false,
            message: 'An internal error occurred while awarding the project',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
}

    async updateStatus(req, res) {
    try {
        const newStatus = req.body.newStatus || req.body.status;
        const { id } = req.params;
        const activeUser = req.user;

        if (!newStatus) {
            return res.status(400).json({
                success: false,
                message: 'Missing status field.'
            });
        }

        const project = await Project.findById(id);

        // 1. Check if Project exists
        if (!project) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }

        const userId = (activeUser._id || activeUser.id).toString();
        const isClient = project.clientId.toString() === userId;
        const isFreelancer = project.freelancerId && project.freelancerId.toString() === userId;

        // 2. Authorization Check
        if (!isClient && !isFreelancer && activeUser.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized: You do not have permission to update this project status'
            });
        }

        // 3. Status Transition Logic (Completion & Payment)
        if (newStatus === 'completed') {
            // Permission check for completion
            if (isFreelancer && !isClient && activeUser.role !== 'admin') {
                return res.status(403).json({
                    success: false,
                    message: 'Only the client can mark the project as complete and release final payment.'
                });
            }

            // Workflow check
            if (!project.finalWorkSubmitted && project.status === 'in-progress') {
                return res.status(400).json({
                    success: false,
                    message: 'Freelancer must submit final work before you can mark this as complete.'
                });
            }

            project.completedAt = new Date();

            // Handle Final Payment Release
            if (project.freelancerId && project.selectedBidId) {
                const selectedBid = project.bids.id(project.selectedBidId);
                
                if (selectedBid) {
                    // Calculate paid vs remaining
                    const totalPaidMilestones = project.milestones
                        .filter(m => m.status === 'approved')
                        .reduce((acc, m) => acc + m.amount, 0);
                    
                    const remaining = selectedBid.amount - totalPaidMilestones;

                    if (remaining > 0) {
                        const fee = Math.round(remaining * 0.1);
                        const net = remaining - fee;

                        // Create Transaction Record
                        await Transaction.create({
                            projectId: project._id,
                            projectTitle: project.title,
                            fromUserId: project.clientId,
                            fromUserName: project.clientName,
                            toUserId: project.freelancerId,
                            toUserName: project.freelancerName,
                            amount: remaining,
                            platformFee: fee,
                            netAmount: net,
                            type: 'release',
                            status: 'completed',
                            transactionRef: uuidv4(),
                            description: 'Final project completion payment'
                        });

                        // Update Freelancer Wallet & Stats
                        await User.findByIdAndUpdate(project.freelancerId, {
                            $inc: {
                                walletBalance: net,
                                totalEarnings: net,
                                completedProjects: 1
                            },
                            $push: {
                                notifications: {
                                    message: `Project completed! ₹${net.toLocaleString('en-IN')} released to your wallet.`,
                                    type: 'payment',
                                    link: `/projects/${project._id}`,
                                    createdAt: new Date()
                                }
                            }
                        });

                        // Update Client Stats
                        await User.findByIdAndUpdate(project.clientId, {
                            $inc: {
                                totalSpent: remaining,
                                completedProjects: 1
                            }
                        });
                    } else {
                        // Already fully paid via milestones, just increment counters
                        await Promise.all([
                            User.findByIdAndUpdate(project.freelancerId, { $inc: { completedProjects: 1 } }),
                            User.findByIdAndUpdate(project.clientId, { $inc: { completedProjects: 1 } })
                        ]);
                    }
                }
            }
        }

        // 4. Save the status change
        project.status = newStatus;
        await project.save();

        // 5. Return Success Response
        return res.status(200).json({
            success: true,
            message: `Project marked as ${newStatus} successfully.`,
            data: {
                status: project.status,
                completedAt: project.completedAt || null
            }
        });

    } catch (err) {
        logger.error('apiUpdateStatus Error: ' + err.message);
        return res.status(500).json({
            success: false,
            message: 'Failed to update project status',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
}

    async submitFinalWork(req, res) {
    try {
        const { id } = req.params;
        const { description } = req.body;
        const activeUser = req.user;

        // 1. Fetch Project
        const project = await Project.findById(id);
        if (!project) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }

        // 2. Authorization Check (Only the assigned freelancer can submit)
        const userId = (activeUser._id || activeUser.id).toString();
        if (!project.freelancerId || project.freelancerId.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized: Only the assigned freelancer can submit work'
            });
        }

        // 3. Validate Input
        if (!description || !description.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a description of the work you are submitting'
            });
        }

        // 4. Update Project State
        project.finalWorkSubmitted = true;
        project.finalWorkDescription = description.trim();
        project.finalWorkSubmittedAt = new Date();
        
        await project.save();

        // 5. Notify Client (Background Task)
        try {
            await User.findByIdAndUpdate(project.clientId, {
                $push: {
                    notifications: {
                        message: `${activeUser.displayName || activeUser.name} submitted the final work for "${project.title}". Please review and mark as complete.`,
                        type: 'project',
                        link: `/projects/${project._id}`,
                        createdAt: new Date()
                    }
                }
            });
        } catch (notifErr) {
            logger.error('Submit final work notification error: ' + notifErr.message);
        }

        // 6. Return Success
        return res.status(200).json({
            success: true,
            message: 'Final work submitted successfully! Waiting for client approval.',
            data: {
                submittedAt: project.finalWorkSubmittedAt,
                finalWorkSubmitted: true
            }
        });

    } catch (err) {
        logger.error('apiSubmitFinalWork Error: ' + err.message);
        return res.status(500).json({
            success: false,
            message: 'Failed to submit final work',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
}

    async getMyProjects(req, res) {
    try {
        // 1. Identify and Validate User
        const activeUser = req.user;
        if (!activeUser) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized: No user session found'
            });
        }

        const userId = new mongoose.Types.ObjectId(activeUser._id || activeUser.id);

        // 2. Fetch Projects using Aggregation
        const projects = await Project.aggregate([
            { 
                $match: { 
                    clientId: userId, 
                    isDeleted: false 
                } 
            },
            { 
                $sort: { createdAt: -1 } 
            },
            {
                // Optional: For APIs, we often want to see basic bid counts 
                // without fetching the full bid array for performance
                $addFields: {
                    bidCount: { $size: { $ifNull: ["$bids", []] } }
                }
            }
        ]);

        // 3. Return JSON Response
        return res.status(200).json({
            success: true,
            message: 'Your projects retrieved successfully',
            count: projects.length,
            data: projects
        });

    } catch (err) {
        logger.error('apiGetMyProjects Error: ' + err.message);
        
        return res.status(500).json({
            success: false,
            message: 'Failed to load your projects',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
}
   async getMyBids(req, res) {
    try {
        // 1. Identify User
        const activeUser = req.user;
        if (!activeUser) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized: User session not found'
            });
        }

        const userId = (activeUser._id || activeUser.id).toString();
        const userIdObj = new mongoose.Types.ObjectId(userId);

        // 2. Aggregate Projects where the user has placed a bid
        const projects = await Project.aggregate([
            // Find projects containing this freelancer's ID in the bids array
            { $match: { 'bids.freelancerId': userIdObj, isDeleted: false } },
            
            { $sort: { createdAt: -1 } },
            
            // Extract only the current user's bid from the bids array
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
            
            // Flatten the myBid array to a single object
            { 
                $addFields: { 
                    myBid: { $arrayElemAt: ['$myBid', 0] } 
                } 
            },

            // Optional: Remove the full bids array to reduce payload size
            {
                $project: {
                    bids: 0 
                }
            }
        ]);

        // 3. API Success Response
        return res.status(200).json({
            success: true,
            message: 'My bids retrieved successfully',
            count: projects.length,
            data: projects
        });

    } catch (err) {
        logger.error('apiGetMyBids Error: ' + err.message);
        
        return res.status(500).json({
            success: false,
            message: 'Failed to load your bids',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
}

    async withdrawBid(req, res) {
    try {
        const { id, bidId } = req.params;
        const activeUser = req.user;

        // 1. Fetch Project
        const project = await Project.findById(id);
        if (!project) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }

        // 2. Find the specific bid using Mongoose sub-document helper
        const bid = project.bids.id(bidId);
        const userId = (activeUser._id || activeUser.id).toString();

        // 3. Authorization Check
        if (!bid || bid.freelancerId.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized: You can only withdraw your own bids'
            });
        }

        // 4. Business Logic Check
        // Prevent withdrawal if the bid was already accepted, rejected, or withdrawn
        if (bid.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: `Cannot withdraw a bid that is already ${bid.status}`
            });
        }

        // 5. Update Status and Recalculate Total Bids
        bid.status = 'withdrawn';

        // Update count for active bids only
        project.totalBids = project.bids.filter(b => 
            ['pending', 'accepted'].includes(b.status)
        ).length;

        await project.save();

        // 6. API Success Response
        return res.status(200).json({
            success: true,
            message: 'Bid withdrawn successfully',
            data: {
                bidId: bid._id,
                newStatus: bid.status,
                totalActiveBids: project.totalBids
            }
        });

    } catch (err) {
        logger.error('apiWithdrawBid Error: ' + err.message);
        
        return res.status(500).json({
            success: false,
            message: 'An error occurred while withdrawing your bid',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
}

    async deleteProject(req, res) {
    try {
        const { id } = req.params;
        const activeUser = req.user;

        // 1. Fetch Project
        const project = await Project.findById(id);

        if (!project) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }

        // 2. Authorization Check
        const userId = (activeUser._id || activeUser.id).toString();
        if (project.clientId.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized: You can only delete your own projects'
            });
        }

        // 3. Business Logic Check
        // Prevent deletion if the project is 'assigned', 'in-progress', or 'completed'
        const deletableStatuses = ['open', 'cancelled'];
        if (!deletableStatuses.includes(project.status)) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete project while it is ${project.status}. It must be open or cancelled.`
            });
        }

        // 4. Perform Soft Delete
        project.isDeleted = true;
        await project.save();

        // 5. API Success Response
        return res.status(200).json({
            success: true,
            message: 'Project deleted successfully',
            data: {
                projectId: id,
                isDeleted: true
            }
        });

    } catch (err) {
        logger.error('apiDeleteProject Error: ' + err.message);
        
        return res.status(500).json({
            success: false,
            message: 'An internal error occurred while trying to delete the project',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
}

    async getEditProject(req, res) {
    try {
        const { id } = req.params;
        const activeUser = req.user;

        // 1. Fetch Project
        const project = await Project.findById(id).lean();

        // 2. Handle Not Found
        if (!project) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }

        // 3. Authorization Check
        const userId = (activeUser._id || activeUser.id).toString();
        if (project.clientId.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized: You can only edit your own projects'
            });
        }

        // 4. Business Logic Check
        // Usually, once a project has been assigned or completed, core details shouldn't change.
        if (project.status !== 'open') {
            return res.status(400).json({
                success: false,
                message: 'Only open projects can be edited'
            });
        }

        // 5. API Success Response
        // We include categories so the frontend can populate a dropdown/select list
        return res.status(200).json({
            success: true,
            message: 'Project details retrieved for editing',
            data: {
                project,
                categories: CATEGORIES // Ensure CATEGORIES is imported or accessible
            }
        });

    } catch (err) {
        logger.error('apiGetEditProject Error: ' + err.message);
        
        return res.status(500).json({
            success: false,
            message: 'Failed to load project details',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
}

    async postEditProject(req, res) {
    try {
        const { id } = req.params;
        const activeUser = req.user;

        // 1. Fetch Project
        const project = await Project.findById(id);

        // 2. Authorization Check
        if (!project) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }

        const userId = (activeUser._id || activeUser.id).toString();
        if (project.clientId.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized: You can only edit your own projects'
            });
        }

        // 3. Business Logic Check
        if (project.status !== 'open') {
            return res.status(400).json({
                success: false,
                message: 'Only open projects can be edited'
            });
        }

        // 4. Extract Data from Body
        const { 
            title, description, category, skills, budget_type, budget_min,
            budget_max, deadline, experience, milestones: milestonesInput 
        } = req.body;

        // 5. Update Basic Fields
        project.title = title || project.title;
        project.description = description || project.description;
        project.category = category || project.category;
        
        // Handle skills (Array from JSON or String from Form)
        if (skills) {
            project.skills = Array.isArray(skills) 
                ? skills 
                : skills.split(',').map(s => s.trim()).filter(Boolean);
        }

        project.budget.type = budget_type || project.budget.type;
        project.budget.min = budget_min !== undefined ? Number(budget_min) : project.budget.min;
        project.budget.max = budget_max !== undefined ? Number(budget_max) : project.budget.max;
        
        project.deadline = deadline ? new Date(deadline) : project.deadline;
        project.experience = experience || project.experience;

        // 6. Handle Milestones
        if (milestonesInput) {
            try {
                const milestonesArr = typeof milestonesInput === 'string' 
                    ? JSON.parse(milestonesInput) 
                    : milestonesInput;

                project.milestones = milestonesArr.map(m => ({
                    ...m,
                    amount: Number(m.amount),
                    dueDate: m.dueDate ? new Date(m.dueDate) : null
                }));
            } catch (e) { 
                logger.error('Milestone parse error during edit: ' + e.message);
                // We don't crash here, but we log it. In a strict API, you might return a 400 error.
            }
        }

        // 7. Save Changes
        await project.save();

        // 8. API Success Response
        return res.status(200).json({
            success: true,
            message: 'Project updated successfully!',
            data: project
        });

    } catch (err) {
        logger.error('apiPostEditProject Error: ' + err.message);
        
        return res.status(500).json({
            success: false,
            message: 'Failed to update project',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
}

    async submitMilestone(req, res) {
    try {
        const { id, msId } = req.params;
        const { submittedWork } = req.body;
        const activeUser = req.user;

        // 1. Fetch Project
        const project = await Project.findById(id);
        if (!project) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }

        // 2. Authorization Check (Freelancer validation)
        const userId = (activeUser._id || activeUser.id).toString();
        if (!project.freelancerId || project.freelancerId.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized: Only the assigned freelancer can submit work'
            });
        }

        // 3. Find specific milestone
        const ms = project.milestones.id(msId);
        if (!ms) {
            return res.status(404).json({
                success: false,
                message: 'Milestone not found'
            });
        }

        // 4. Validate Submission Content
        if (!submittedWork || !submittedWork.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Please describe the work completed for this milestone'
            });
        }

        // 5. Update Milestone Status
        ms.status = 'submitted';
        ms.submittedWork = submittedWork.trim();
        ms.submittedAt = new Date(); // Good practice to track submission time

        await project.save();

        // 6. Notify Client (Background task)
        try {
            await User.findByIdAndUpdate(project.clientId, {
                $push: {
                    notifications: {
                        message: `${activeUser.displayName || activeUser.name} submitted work for milestone "${ms.title}"`,
                        type: 'project',
                        link: `/projects/${project._id}`,
                        createdAt: new Date()
                    }
                }
            });
        } catch (notifErr) {
            logger.error('Milestone submission notification error: ' + notifErr.message);
        }

        // 7. API Success Response
        return res.status(200).json({
            success: true,
            message: 'Milestone submitted successfully!',
            data: {
                milestoneId: ms._id,
                status: ms.status,
                submittedAt: ms.submittedAt
            }
        });

    } catch (err) {
        logger.error('apiSubmitMilestone Error: ' + err.message);
        
        return res.status(500).json({
            success: false,
            message: 'Failed to submit milestone',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
}

    async approveMilestone(req, res) {
    try {
        const { id, msId } = req.params;
        const activeUser = req.user;

        // 1. Fetch Project
        const project = await Project.findById(id);
        if (!project) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }

        // 2. Authorization Check (Only the client can approve)
        const userId = (activeUser._id || activeUser.id).toString();
        if (project.clientId.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized: Only the project owner can approve milestones'
            });
        }

        // 3. Find and Validate Milestone State
        const ms = project.milestones.id(msId);
        if (!ms || ms.status !== 'submitted') {
            return res.status(400).json({
                success: false,
                message: 'Milestone not found or not in a submittable state for approval'
            });
        }

        // 4. Update Milestone Status
        ms.status = 'approved';
        await project.save();

        // 5. Financial Calculations (10% Platform Fee)
        const fee = Math.round(ms.amount * 0.1);
        const net = ms.amount - fee;

        // 6. Create Transaction Record
        const transaction = await Transaction.create({
            projectId: project._id,
            projectTitle: project.title,
            fromUserId: project.clientId,
            fromUserName: project.clientName,
            toUserId: project.freelancerId,
            toUserName: project.freelancerName,
            amount: ms.amount,
            platformFee: fee,
            netAmount: net,
            type: 'milestone',
            status: 'completed',
            transactionRef: uuidv4(),
            description: `Milestone: ${ms.title}`
        });

        // 7. Update Freelancer Wallet and Notify
        try {
            await User.findByIdAndUpdate(project.freelancerId, {
                $inc: { 
                    walletBalance: net, 
                    totalEarnings: net 
                },
                $push: {
                    notifications: {
                        message: `Milestone "${ms.title}" approved! ₹${net.toLocaleString('en-IN')} added to wallet.`,
                        type: 'payment',
                        link: `/projects/${project._id}`,
                        createdAt: new Date()
                    }
                }
            });
        } catch (notifErr) {
            logger.error('Milestone approval background task error: ' + notifErr.message);
        }

        // 8. Final API Response
        return res.status(200).json({
            success: true,
            message: `Milestone approved! ₹${net.toLocaleString('en-IN')} released to freelancer.`,
            data: {
                milestoneId: ms._id,
                status: ms.status,
                netReleased: net,
                transactionId: transaction._id
            }
        });

    } catch (err) {
        logger.error('apiApproveMilestone Error: ' + err.message);
        return res.status(500).json({
            success: false,
            message: 'Failed to approve milestone and release payment',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
}

    async rejectMilestone(req, res) {
    try {
        const { id, msId } = req.params;
        const activeUser = req.user;

        // 1. Fetch Project
        const project = await Project.findById(id);
        if (!project) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }

        // 2. Authorization Check (Only the client can reject/request revisions)
        const userId = (activeUser._id || activeUser.id).toString();
        if (project.clientId.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized: Only the project owner can request revisions'
            });
        }

        // 3. Find and Validate Milestone
        const ms = project.milestones.id(msId);
        if (!ms || ms.status !== 'submitted') {
            return res.status(400).json({
                success: false,
                message: 'Milestone not found or is not currently submitted for review'
            });
        }

        // 4. Update Milestone State
        // We revert status to 'in-progress' and clear the submission text
        ms.status = 'in-progress';
        ms.submittedWork = ''; 
        
        await project.save();

        // 5. Notify Freelancer (Background Task)
        try {
            await User.findByIdAndUpdate(project.freelancerId, {
                $push: {
                    notifications: {
                        message: `Milestone "${ms.title}" was sent back for revision. Please check the feedback.`,
                        type: 'project',
                        link: `/projects/${project._id}`,
                        createdAt: new Date()
                    }
                }
            });
        } catch (notifErr) {
            logger.error('Milestone rejection notification error: ' + notifErr.message);
        }

        // 6. API Success Response
        return res.status(200).json({
            success: true,
            message: 'Milestone sent back for revision successfully.',
            data: {
                milestoneId: ms._id,
                status: ms.status,
                submittedWork: ms.submittedWork
            }
        });

    } catch (err) {
        logger.error('apiRejectMilestone Error: ' + err.message);
        return res.status(500).json({
            success: false,
            message: 'An internal error occurred while rejecting the milestone',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
}

    async analyseBids(req, res) {
    try {
        const { id } = req.params;
        const activeUser = req.user;

        // 1. Fetch Project
        const project = await Project.findById(id).lean();

        // 2. Authorization & Existence Check
        if (!project) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }

        const userId = (activeUser._id || activeUser.id).toString();
        if (project.clientId.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized: You can only analyze bids on your own projects'
            });
        }

        // 3. Data Validation for AI Service
        if (!project.bids || project.bids.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No bids found to analyze'
            });
        }

        // 4. Call AI Service
        // Passing relevant context so the AI can compare bids against project requirements
        const analysisResult = await aiService.analyseBids(
            project.title, 
            project.description, 
            project.bids
        );

        // 5. Handle AI Service Downtime/Errors
        if (!analysisResult) {
            return res.status(503).json({
                success: false,
                message: 'AI Analysis service is temporarily unavailable. Please try again later.'
            });
        }

        // 6. Return Success Response
        return res.status(200).json({
            success: true,
            message: 'Bids analyzed successfully!',
            data: analysisResult
        });

    } catch (err) {
        logger.error('apiAnalyseBids Error: ' + err.message);
        return res.status(500).json({
            success: false,
            message: 'An internal error occurred during bid analysis',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
}

    async getContract(req, res) {
    try {
        const { id } = req.params;
        const activeUser = req.user;

        // 1. Fetch Project
        const project = await Project.findById(id).lean();

        // 2. Initial Validation (Existence & Ownership)
        if (!project) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }

        const userId = (activeUser._id || activeUser.id).toString();
        
        // Authorization: Both client and assigned freelancer should be able to see the contract
        const isClient = project.clientId.toString() === userId;
        const isFreelancer = project.freelancerId && project.freelancerId.toString() === userId;

        if (!isClient && !isFreelancer) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized: You do not have access to this contract'
            });
        }

        // 3. Status Validation
        if (!project.freelancerId || !project.selectedBidId) {
            return res.status(400).json({
                success: false,
                message: 'A contract cannot be generated until a freelancer is assigned to the project'
            });
        }

        // 4. Extract Selected Bid details
        const selectedBid = project.bids.find(b => 
            b._id.toString() === project.selectedBidId.toString()
        );

        if (!selectedBid) {
            return res.status(404).json({
                success: false,
                message: 'Associated bid details not found'
            });
        }

        // 5. Generate Contract via AI Service
        let contractText = null;
        try {
            contractText = await aiService.generateContract(project, selectedBid);
        } catch (aiErr) {
            logger.error('AI Contract Generation Error: ' + aiErr.message);
            // We don't necessarily want to fail the whole request if the AI is just slow
        }

        if (!contractText) {
            return res.status(503).json({
                success: false,
                message: 'Legal contract generation service is temporarily unavailable'
            });
        }

        // 6. Return Data for Frontend Formatting
        return res.status(200).json({
            success: true,
            message: 'Contract generated successfully',
            data: {
                projectTitle: project.title,
                contractBody: contractText,
                parties: {
                    client: project.clientName,
                    freelancer: project.freelancerName
                },
                financials: {
                    totalAmount: selectedBid.amount,
                    milestones: project.milestones
                },
                generatedAt: new Date()
            }
        });

    } catch (err) {
        logger.error('apiGetContract Error: ' + err.message);
        return res.status(500).json({
            success: false,
            message: 'An internal error occurred while retrieving the contract',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
}

}

module.exports = new ProjectController();
