const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Middleware to authenticate the user using JWT from cookies.
 * Verifies the token and ensures the user exists and is active.
 */
const checkAuth = async (req, res, next) => {
    try {
        const token = req.cookies.token;

        if (!token) {
            // Check if it's an API request or a page request
            if (req.originalUrl.startsWith('/api/')) {
                return res.status(401).json({ status: false, message: 'Authentication required' });
            }
            return res.redirect('/login');
        }

        // Verify Token
        const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);

        // Cross-check with Session to ensure this token belongs to the CURRENT active session
        if (req.session && req.session.token && req.session.token !== token) {
            logger.warn(`Session Token Mismatch: Possible identity hijack attempt for user ${decoded.email}`);
            res.clearCookie('token');
            res.clearCookie('refreshToken');
            return res.redirect('/login');
        }

        // Fetch user from DB to ensure they still exist and are active
        const user = await User.findById(decoded.id || decoded._id, { password: 0, refreshToken: 0 }).lean();

        if (!user || user.isDeleted) {
            res.clearCookie('token');
            if (req.originalUrl.startsWith('/api/')) {
                return res.status(401).json({ status: false, message: 'User no longer exists' });
            }
            return res.redirect('/login');
        }

        if (user.isBanned) {
            if (req.originalUrl.startsWith('/api/')) {
                return res.status(403).json({ status: false, message: 'Your account is banned' });
            }
            req.flash('error', 'Your account has been suspended.');
            return res.redirect('/login');
        }

        // Attach user to request
        req.user = {
            ...user,
            id: user._id,
            name: user.displayName || `${user.firstName} ${user.lastName}`
        };

        // Populate res.locals for EJS templates
        res.locals.currentUser = req.user;
        res.locals.unreadCount = (user.notifications || []).filter(n => !n.isRead).length;

        next();
    } catch (error) {
        logger.error(`checkAuth Error: ${error.message}`);
        res.clearCookie('token');
        
        if (req.originalUrl.startsWith('/api/')) {
            return res.status(401).json({ status: false, message: 'Invalid or expired token' });
        }
        return res.redirect('/login');
    }
};

/**
 * Optional authentication middleware.
 * Populates req.user if a token exists, but does not block access if it doesn't.
 * Useful for public pages (like landing page) that show different headers for logged-in users.
 */
const optionalAuth = async (req, res, next) => {
    try {
        const token = req.cookies.token;
        if (token) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
            const user = await User.findById(decoded.id || decoded._id, { password: 0, refreshToken: 0 }).lean();
            
            if (user && !user.isDeleted && !user.isBanned) {
                req.user = {
                    ...user,
                    id: user._id,
                    name: user.displayName || `${user.firstName} ${user.lastName}`
                };
                res.locals.currentUser = req.user;
                res.locals.unreadCount = (user.notifications || []).filter(n => !n.isRead).length;
            }
        }
        next();
    } catch (error) {
        // Silently fail for optional auth
        next();
    }
};

module.exports = { checkAuth, optionalAuth };