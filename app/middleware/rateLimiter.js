const rateLimit = require('express-rate-limit');

/**
 * Custom handler to support both JSON (API) and Flash (Web) responses
 */
const rateLimitHandler = (req, res, next, options) => {
    const message = typeof options.message === 'object' ? options.message.message : options.message;
    
    // Check if it's an API request or expects JSON
    const isApi = req.originalUrl.startsWith('/api/') || 
                  req.headers.accept?.includes('application/json') || 
                  req.xhr;

    if (isApi) {
        return res.status(options.statusCode).json({
            status: false,
            message: message
        });
    }
    
    // For regular web routes, use flash and redirect back
    req.flash('error', message);
    const backURL = req.header('Referer') || '/';
    res.redirect(backURL);
};

// General API rate limiter
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: 'Too many requests from this IP, please try again after 15 minutes.',
    handler: rateLimitHandler,
    standardHeaders: true,
    legacyHeaders: false,
});

// Stricter limiter for sensitive auth routes
const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,
    message: 'Too many authentication attempts. Please try again after an hour.',
    handler: rateLimitHandler,
    standardHeaders: true,
    legacyHeaders: false,
});

// Limiter for project creation/bidding to prevent spam
const projectActionLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5,
    message: 'Slow down! You are performing actions too quickly.',
    handler: rateLimitHandler,
    standardHeaders: true,
    legacyHeaders: false,
});

module.exports = {
    apiLimiter,
    authLimiter,
    projectActionLimiter
};
