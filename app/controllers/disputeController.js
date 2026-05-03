const Project = require('../models/Project');
const Dispute = require('../models/Dispute');
const User = require('../models/User');
const logger = require('../utils/logger');

class DisputeController {
    async getDisputeForm(req, res) {
        try {
            const project = await Project.findById(req.params.id).lean();
            if (!project) {
                req.flash('error', 'Project not found');
                return res.redirect('/projects');
            }

            const userId = (req.user._id || req.user.id).toString();

            const isClient = project.clientId.toString() === userId;

            const isFreelancer = project.freelancerId && project.freelancerId.toString() === userId;

            if (!isClient && !isFreelancer) {
                req.flash('error', 'You are not a party to this project');
                return res.redirect(`/projects/${req.params.id}`);
            }

            if (!['assigned', 'in-progress'].includes(project.status)) {
                req.flash('error', 'Disputes can only be raised on active projects');
                return res.redirect(`/projects/${req.params.id}`);
            }

            const existing = await Dispute.findOne(
                {
                    projectId: project._id,
                    status: { $ne: 'resolved' }
                });
            if (existing) {
                req.flash('error', 'A dispute is already open for this project');
                return res.redirect(`/projects/${req.params.id}`);
            }
            res.render('dispute-form',
                {
                    title: 'Raise Dispute',
                    project
                });

        } catch (err) {
            logger.error('getDisputeForm: ' + err.message);
            req.flash('error', 'Failed to load dispute form');
            res.redirect('/projects');
        }
    }

    async postDispute(req, res) {
        try {
            const project = await Project.findById(req.params.id);

            if (!project) {
                req.flash('error', 'Project not found');
                return res.redirect('/projects');
            }

            const userId = (req.user._id || req.user.id).toString();

            const isClient = project.clientId.toString() === userId;

            const isFreelancer = project.freelancerId && project.freelancerId.toString() === userId;

            if (!isClient && !isFreelancer) {
                req.flash('error', 'Unauthorized');
                return res.redirect(`/projects/${req.params.id}`);
            }

            const { reason, description, evidence } = req.body;

            if (!reason || !description) {
                req.flash('error', 'Reason and description are required');
                return res.redirect(`/projects/${req.params.id}/dispute`);
            }


            const respondentId = isClient ? project.freelancerId : project.clientId;

            const respondentName = isClient ? project.freelancerName : project.clientName;

            const initiatorName = req.user.displayName || req.user.name;

            const evidenceArr = evidence ? evidence.split('\n').map(l => l.trim()).filter(Boolean) : [];

            const dispute = new Dispute({
                projectId: project._id,
                projectTitle: project.title,
                initiatorId: userId,
                initiatorName, respondentId,
                respondentName,
                reason,
                description,
                evidence: evidenceArr
            });
            await dispute.save();

            project.status = 'disputed';

            await project.save();

            if (respondentId) await User.findByIdAndUpdate(respondentId,
                {
                    $push: {
                        notifications: {
                            message: `${initiatorName} raised a dispute on "${project.title}"`,
                            type: 'dispute', link: `/projects/${project._id}`
                        }
                    }
                });

            await User.updateMany({ role: 'admin' },
                {
                    $push: {
                        notifications: {
                            message: `New dispute on "${project.title}"`,
                            type: 'dispute', link: `/admin/disputes`
                        }
                    }
                });

            req.flash('success', 'Dispute submitted. Our team will review it within 48 hours.');

            res.redirect(`/projects/${project._id}`);

        } catch (err) {
            logger.error('postDispute: ' + err.message);
            req.flash('error', 'Failed to submit dispute'); res.redirect(`/projects/${req.params.id}`);
        }
    }
}

module.exports = new DisputeController();
