const Project = require('../models/Project');
const aiService = require('../services/aiService'); // Assuming your service is here

// Constants for categories (keep this consistent with your app)
const CATEGORIES = ['Web Development', 'Mobile Apps', 'Design', 'Writing', 'Data Science', 'Other'];


class clientController{
    // GET /client/projects/create


// POST /client/projects — with AI summarization & skill extraction
 // Handle the form submission
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
                complexity // Changed from 'experience' to match complexity concept
            } = req.body;

            // 1. Validation
            if (!title || !description || !category || !budget_min || !budget_max) {
                req.flash('error', 'Please fill all required fields');
                return res.redirect('get-create-project');
            }

            // 2. Skill Parsing (User provided)
            let skillsArr = skills ? skills.split(',').map(s => s.trim()).filter(Boolean) : [];

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
                                status: 'pending', // Default status for new milestones
                                dueDate: m.dueDate ? new Date(m.dueDate) : null
                            }));
                    }
                } catch (e) {
                    console.error('Milestone parsing error:', e.message);
                }
            }

            // 4. AI Insights (Summarization, Matching, and Complexity)
            let aiSummary = '';
            let aiSkillsMatched = [];
            let aiComplexity = complexity || 'medium'; // Fallback to user choice or default

            try {
                // We use a timeout to ensure the AI doesn't hang the request
                const aiResult = await Promise.race([
                    aiService.summarizeProject(title, description),
                    new Promise(r => setTimeout(() => r(null), 7000)) // 7s timeout
                ]);

                if (aiResult) {
                    aiSummary = aiResult.summary || '';
                    aiSkillsMatched = aiResult.recommendedSkills || aiResult.bullets || [];
                    // Update complexity based on AI if user didn't specify or if AI is more precise
                    if (aiResult.difficulty) aiComplexity = aiResult.difficulty;
                }

                // If user didn't provide any skills, fill them with AI suggestions
                if (skillsArr.length === 0 && aiSkillsMatched.length > 0) {
                    skillsArr = aiSkillsMatched;
                }
            } catch (aiErr) {
                console.error('AI Service Error:', aiErr.message);
                // Fail silently for AI - the project creation is more important
            }

            const activeUser = req.user || res.locals.currentUser;
            const clientId = activeUser ? (activeUser._id || activeUser.id) : null;
            const clientName = activeUser ? (activeUser.name || activeUser.displayName || activeUser.email || '') : '';

            if (!clientId) {
                req.flash('error', 'Unable to determine current user. Please login again and try again.');
                return res.redirect('/get-create-project');
            }

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
                aiComplexity: aiComplexity, // Matches your schema
                milestones: milestonesArr,
                aiSummary: aiSummary, // Matches your schema
                aiSkillsMatched: aiSkillsMatched, // Matches your schema
                status: 'open',
                views: 0
            });

            await project.save();

            req.flash('success', `Project "${title}" posted successfully!`);
            res.redirect(`/projects/${project._id}`);

        } catch (e) {
            console.error('Project Creation Error:', e);
            req.flash('error', 'Failed to create project. Please check your inputs.');
            res.redirect('/get-create-project');
        }
    }

}

module.exports=new clientController();