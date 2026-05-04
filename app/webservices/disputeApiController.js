const Project = require('../models/Project');
const Dispute = require('../models/Dispute');
const User = require('../models/User');
const logger = require('../utils/logger');

class DisputeApiController {
    /**
     * @route GET /api/disputes/check/:projectId
     * @desc Check if a user is eligible to raise a dispute and if one already exists
     */
    async checkEligibility(req, res) {
        try {
            const { projectId } = req.params;
            const project = await Project.findById(projectId).lean();

            if (!project) {
                return res.status(404).json({ success: false, message: 'Project not found' });
            }

            const userId = (req.user._id || req.user.id).toString();
            const isClient = project.clientId.toString() === userId;
            const isFreelancer = project.freelancerId && project.freelancerId.toString() === userId;

            if (!isClient && !isFreelancer) {
                return res.status(403).json({ success: false, message: 'You are not a party to this project' });
            }

            if (!['assigned', 'in-progress'].includes(project.status)) {
                return res.status(400).json({ success: false, message: 'Disputes can only be raised on active projects' });
            }

            const existing = await Dispute.findOne({
                projectId: project._id,
                status: { $ne: 'resolved' }
            });

            if (existing) {
                return res.status(409).json({ 
                    success: false, 
                    message: 'A dispute is already open for this project',
                    disputeId: existing._id 
                });
            }

            return res.status(200).json({ 
                success: true, 
                message: 'Eligible to raise dispute',
                data: {
                    projectTitle: project.title,
                    role: isClient ? 'client' : 'freelancer'
                }
            });

        } catch (err) {
            logger.error('API checkEligibility Error: ' + err.message);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    }

    /**
     * @route POST /api/disputes/:projectId
     * @desc Raise a new dispute
     */
    async postDispute(req, res) {
        try {
            const projectId = req.params.projectId || req.params.id;
            const project = await Project.findById(projectId);

            if (!project) {
                return res.status(404).json({ success: false, message: 'Project not found' });
            }

            const userId = (req.user._id || req.user.id).toString();
            const isClient = project.clientId.toString() === userId;
            const isFreelancer = project.freelancerId && project.freelancerId.toString() === userId;

            if (!isClient && !isFreelancer) {
                return res.status(403).json({ success: false, message: 'Unauthorized action' });
            }

            const { reason, description, evidence } = req.body;

            if (!reason || !description) {
                return res.status(400).json({ success: false, message: 'Reason and description are required' });
            }

            // Check if one is already open
            const existing = await Dispute.findOne({ projectId: project._id, status: { $ne: 'resolved' } });
            if (existing) {
                return res.status(409).json({ success: false, message: 'A dispute is already active for this project' });
            }

            const respondentId = isClient ? project.freelancerId : project.clientId;
            const respondentName = isClient ? project.freelancerName : project.clientName;
            const initiatorName = req.user.displayName || req.user.name || 'User';

            // Support both array and newline-separated string for evidence
            let evidenceArr = [];
            if (Array.isArray(evidence)) {
                evidenceArr = evidence;
            } else if (evidence) {
                evidenceArr = evidence.split('\n').map(l => l.trim()).filter(Boolean);
            }

            const dispute = new Dispute({
                projectId: project._id,
                projectTitle: project.title,
                initiatorId: userId,
                initiatorName,
                respondentId,
                respondentName,
                reason,
                description,
                evidence: evidenceArr,
                status: 'open'
            });

            await dispute.save();

            // Update project status to disputed
            project.status = 'disputed';
            await project.save();

            // Notify Respondent
            if (respondentId) {
                await User.findByIdAndUpdate(respondentId, {
                    $push: {
                        notifications: {
                            message: `${initiatorName} raised a dispute on "${project.title}"`,
                            type: 'dispute',
                            link: `/projects/${project._id}`,
                            createdAt: new Date()
                        }
                    }
                });
            }

            // Notify Admins
            await User.updateMany({ role: 'admin' }, {
                $push: {
                    notifications: {
                        message: `New dispute raised on "${project.title}"`,
                        type: 'dispute',
                        link: `/admin/disputes`,
                        createdAt: new Date()
                    }
                }
            });

            return res.status(201).json({
                success: true,
                message: 'Dispute submitted. Our team will review it within 48 hours.',
                disputeId: dispute._id
            });

        } catch (err) {
            logger.error('API postDispute Error: ' + err.message);
            return res.status(500).json({ 
                success: false, 
                message: 'Failed to submit dispute', 
                error: err.message 
            });
        }
    }

    /**
     * @route GET /api/disputes/my-disputes
     * @desc Fetch disputes involving the current user
     */
    async getMyDisputes(req, res) {
        try {
            const userId = (req.user._id || req.user.id).toString();
            const disputes = await Dispute.find({
                $or: [{ initiatorId: userId }, { respondentId: userId }]
            }).sort({ createdAt: -1 }).lean();

            return res.status(200).json({ success: true, data: disputes });
        } catch (err) {
            return res.status(500).json({ success: false, message: 'Failed to fetch disputes' });
        }
    }

    async getDisputeForm(req, res) {
    try {
        const { id } = req.params;
        const activeUser = req.user;

        // 1. Fetch Project
        const project = await Project.findById(id).lean();
        if (!project) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }

        // 2. Authorization Check
        const userId = (activeUser._id || activeUser.id).toString();
        const isClient = project.clientId.toString() === userId;
        const isFreelancer = project.freelancerId && project.freelancerId.toString() === userId;

        if (!isClient && !isFreelancer) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized: You are not a party to this project'
            });
        }

        // 3. Status Validation
        if (!['assigned', 'in-progress'].includes(project.status)) {
            return res.status(400).json({
                success: false,
                message: 'Disputes can only be raised on active projects (assigned or in-progress)'
            });
        }

        // 4. Check for Existing Dispute
        const existingDispute = await Dispute.findOne({
            projectId: project._id,
            status: { $ne: 'resolved' }
        });

        if (existingDispute) {
            return res.status(409).json({
                success: false,
                message: 'A dispute is already open for this project',
                data: { disputeId: existingDispute._id }
            });
        }

        // 5. Success Response
        // Return only the data needed to build the dispute form
        return res.status(200).json({
            success: true,
            message: 'Project is eligible for dispute',
            data: {
                project: {
                    id: project._id,
                    title: project.title,
                    freelancerName: project.freelancerName,
                    clientName: project.clientName
                },
                reasons: [
                    'Quality of work',
                    'Missed deadline',
                    'Communication issues',
                    'Unresponsiveness',
                    'Other'
                ]
            }
        });

    } catch (err) {
        logger.error('apiGetDisputeForm Error: ' + err.message);
        return res.status(500).json({
            success: false,
            message: 'Failed to load dispute verification details',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
}
}

module.exports = new DisputeApiController();