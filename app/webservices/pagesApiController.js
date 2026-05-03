const User = require('../models/User');
const Project = require('../models/Project');
const logger = require('../utils/logger');

const CATEGORIES = [
    'Web Development', 'Mobile Development', 'Design & Creative', 
    'Writing & Content', 'Marketing & SEO', 'Data Science & AI', 
    'DevOps & Cloud', 'Video & Animation', 'Finance & Accounting', 
    'Legal', 'Other'
];

class PagesApiController {
    /**
     * @route GET /api/pages/landing
     * @desc Get landing page public stats and branding data
     */
    async landingPage(req, res) {
        try {
            const stats = { 
                activeUsers: "10K+", 
                projectsCompleted: "5K+", 
                successRate: "98%", 
                totalEarned: "$2M+" 
            };

            const userData = req.user ? {
                name: req.user.displayName,
                role: req.user.role,
                avatar: req.user.avatar
            } : null;

            return res.status(200).json({
                success: true,
                data: {
                    title: 'Freelancer Hub | Connect. Collaborate. Create.',
                    stats,
                    user: userData
                }
            });
        } catch (error) {
            logger.error('landingPage error: ' + error.message);
            return res.status(500).json({ success: false, message: 'Internal Server Error' });
        }
    }

    /**
     * @route GET /api/pages/config
     * @desc Get common application configurations like categories
     */
    async getAppConfig(req, res) {
        return res.status(200).json({
            success: true,
            data: {
                categories: CATEGORIES,
                projectComplexities: ['Low', 'Medium', 'High']
            }
        });
    }

    // Auth state helper for frontend routing logic
    getRegister(req, res) {
        if (req.user) {
            return res.status(200).json({ success: true, authenticated: true, redirect: '/dashboard' });
        }
        return res.status(200).json({ success: true, authenticated: false, title: 'Register' });
    }

    getLogin(req, res) {
        if (req.user) {
            return res.status(200).json({ success: true, authenticated: true, redirect: '/dashboard' });
        }
        return res.status(200).json({ success: true, authenticated: false, title: 'Login' });
    }

    /**
     * @route GET /api/pages/settings
     * @desc Get user settings data
     */
    async getSettings(req, res) {
        if (!req.user) return res.status(401).json({ success: false, message: 'Unauthorized' });
        
        try {
            const user = await User.findById(req.user._id || req.user.id).select('-password -notifications').lean();
            return res.status(200).json({
                success: true,
                data: {
                    title: 'Settings',
                    user
                }
            });
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Error loading settings' });
        }
    }

    /**
     * Note: Verification and Reset Password typically require the token 
     * and the business logic is handled by Auth controllers. 
     * These methods just return the context for the UI.
     */
    getVerify(req, res) {
        return res.status(200).json({ success: true, title: 'Verify Email', token: req.params.token });
    }

    getForgotPassword(req, res) {
        return res.status(200).json({ success: true, title: 'Forgot Password' });
    }

    getResetPassword(req, res) {
        return res.status(200).json({ 
            success: true, 
            title: 'Reset Password', 
            token: req.params.token 
        });
    }

    /**
     * @route GET /api/pages/create-project-init
     * @desc Context for the project creation form
     */
    getCreateProject(req, res) {
        return res.status(200).json({
            success: true,
            data: {
                title: 'Post a Project',
                categories: CATEGORIES
            }
        });
    }
}

module.exports = new PagesApiController();