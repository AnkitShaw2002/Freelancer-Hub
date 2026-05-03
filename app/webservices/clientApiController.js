const Project = require('../models/Project');
const aiService = require('../services/aiService');
const logger = require('../utils/logger');

class ProjectApiController {
    /**
     * @route GET /api/client/projects
     */
    async getMyProjects(req, res) {
        try {
            const userId = req.user._id || req.user.id;
            const projects = await Project.find({ clientId: userId, isDeleted: { $ne: true } }).sort({ createdAt: -1 });
            
            return res.status(200).json({
                success: true,
                count: projects.length,
                data: projects
            });
        } catch (error) {
            logger.error('API Get Projects Error: ' + error.message);
            return res.status(500).json({ success: false, message: 'Failed to fetch projects.' });
        }
    }

    /**
     * @route POST /api/client/projects
     */
    async postCreateProject(req, res) {
        try {
            const { 
                title, 
                description, 
                category, 
                skills, 
                budget_type, 
                budget_min, 
                budget_max, 
                deadline, 
                complexity 
            } = req.body;

            // 1. Validation (Manual check in addition to middleware)
            if (!title || !description || !category || !budget_min || !budget_max) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Please fill all required fields: title, description, category, budget_min, and budget_max.' 
                });
            }

            // 2. Skill Parsing
            let skillsArr = Array.isArray(skills) 
                ? skills 
                : (skills ? skills.split(',').map(s => s.trim()).filter(Boolean) : []);

            // 3. Milestone Parsing
            let milestonesArr = [];
            if (req.body.milestones) {
                try {
                    const raw = typeof req.body.milestones === 'string' 
                        ? JSON.parse(req.body.milestones) 
                        : req.body.milestones;
                        
                    if (Array.isArray(raw)) {
                        milestonesArr = raw
                            .filter(m => m.title && m.title.trim() && m.amount)
                            .map(m => ({
                                title: m.title.trim(),
                                amount: Number(m.amount),
                                status: 'pending',
                                dueDate: m.dueDate ? new Date(m.dueDate) : null
                            }));
                    }
                } catch (e) {
                    logger.error('API Milestone parsing error: ' + e.message);
                }
            }

            // 4. AI Insights
            let aiSummary = '';
            let aiSkillsMatched = [];
            let aiComplexity = complexity || 'medium';

            try {
                const aiResult = await Promise.race([
                    aiService.summarizeProject(title, description),
                    new Promise(r => setTimeout(() => r(null), 7000))
                ]);

                if (aiResult) {
                    aiSummary = aiResult.summary || '';
                    aiSkillsMatched = aiResult.recommendedSkills || aiResult.bullets || [];
                    if (aiResult.difficulty) aiComplexity = aiResult.difficulty;
                }

                if (skillsArr.length === 0 && aiSkillsMatched.length > 0) {
                    skillsArr = aiSkillsMatched;
                }
            } catch (aiErr) {
                logger.error('API AI Service Error: ' + aiErr.message);
            }

            const activeUser = req.user;
            const clientId = activeUser._id || activeUser.id;
            const clientName = activeUser.name || activeUser.displayName || activeUser.email || 'Client';

            // 5. Create and Save Project
            const project = new Project({
                clientId,
                clientName,
                title,
                description,
                category,
                skills: skillsArr,
                budget: {
                    type: budget_type || 'fixed',
                    min: Number(budget_min),
                    max: Number(budget_max)
                },
                deadline: deadline ? new Date(deadline) : null,
                aiComplexity: aiComplexity,
                milestones: milestonesArr,
                aiSummary: aiSummary,
                aiSkillsMatched: aiSkillsMatched,
                status: 'open',
                views: 0
            });

            await project.save();

            return res.status(201).json({
                success: true,
                message: `Project "${title}" posted successfully!`,
                projectId: project._id,
                data: project
            });

        } catch (error) {
            logger.error('API Project Creation Error: ' + error.message);
            return res.status(500).json({ 
                success: false, 
                message: 'Failed to create project.', 
                error: error.message 
            });
        }
    }

    /**
     * @route DELETE /api/client/projects/:id
     */
    async deleteProject(req, res) {
        try {
            const { id } = req.params;
            const userId = req.user._id || req.user.id;

            const project = await Project.findOne({ _id: id, clientId: userId });
            if (!project) {
                return res.status(404).json({ success: false, message: 'Project not found or unauthorized.' });
            }

            project.isDeleted = true;
            await project.save();

            return res.status(200).json({ success: true, message: 'Project deleted successfully.' });
        } catch (error) {
            logger.error('API Project Delete Error: ' + error.message);
            return res.status(500).json({ success: false, message: 'Failed to delete project.' });
        }
    }

    /**
     * @route POST /api/client/projects/:id/status
     */
    async updateStatus(req, res) {
        try {
            const { id } = req.params;
            const { status } = req.body;
            const userId = req.user._id || req.user.id;

            const project = await Project.findOneAndUpdate(
                { _id: id, clientId: userId },
                { status },
                { new: true }
            );

            if (!project) {
                return res.status(404).json({ success: false, message: 'Project not found or unauthorized.' });
            }

            return res.status(200).json({ success: true, message: `Project status updated to ${status}`, data: project });
        } catch (error) {
            logger.error('API Status Update Error: ' + error.message);
            return res.status(500).json({ success: false, message: 'Failed to update status.' });
        }
    }

    // Placeholders for remaining routes in your clientApiRoute
    async getCreateProject(req, res) {
        // Typically for APIs, this might return configuration like categories or metadata
        return res.status(200).json({ success: true, categories: ['Web Development', 'Mobile Apps', 'Design', 'Writing', 'Data Science', 'Other'] });
    }

    async getEditProject(req, res) {
        try {
            const project = await Project.findById(req.params.id);
            if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });
            return res.status(200).json({ success: true, data: project });
        } catch (e) {
            return res.status(500).json({ success: false, message: e.message });
        }
    }

    async postEditProject(req, res) {
        // Implementation similar to postCreateProject but using findOneAndUpdate
        return res.status(501).json({ success: false, message: 'Not implemented yet.' });
    }

    async awardProject(req, res) {
        return res.status(501).json({ success: false, message: 'Award logic not implemented yet.' });
    }

    async getContract(req, res) {
        return res.status(501).json({ success: false, message: 'Contract view not implemented yet.' });
    }

    async approveMilestone(req, res) {
        return res.status(501).json({ success: false, message: 'Milestone approval not implemented yet.' });
    }

    async rejectMilestone(req, res) {
        return res.status(501).json({ success: false, message: 'Milestone rejection not implemented yet.' });
    }
}

module.exports = new ProjectApiController();