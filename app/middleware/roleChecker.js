const roleModel = require('../models/roleModel');
const logger = require('../utils/logger');

/**
 * Middleware to check if the authenticated user has the required permissions.
 * Supports multiple permission arguments (OR logic).
 * 
 * Usage: roleChecker('projects:manage', 'projects:view')
 */
const roleChecker = (...requiredPermissions) => {
    return async (req, res, next) => {
        try {
            const user = req.user;
            const isApiRequest = req.originalUrl.startsWith("/api");

            // 1. Check if user and role exist in the request (by CheckAuth)
            if (!user || !user.role) {
                if (isApiRequest) {
                return res.status(401).json({ 
                    status: false, 
                    message: 'Authentication required: No role found in token.' 
                });
            }
            req.flash('error', 'Please log in to access this page.');
                return res.redirect('/auth/login');
            }

            // 2. Fetch role permissions from the database
            // We use findOne because user.role is a string (e.g., 'admin', 'freelancer')
            const role = await roleModel.findOne({ name: user.role }).lean();

            if (!role) {
                logger.error(`Role definition not found for: ${user.role}`);
                if (isApiRequest) {
                return res.status(403).json({ 
                    status: false, 
                    message: 'Access Denied: Role configuration error.' 
                });}
                return res.status(403).render('errors/status', { 
                    errorCode: 403, 
                    title: 'Configuration Error', 
                    message: 'Your account role is not properly configured.' 
                });
            }

            // 3. Admin bypass
            // If the role name is 'admin', we can choose to bypass or check specific permissions.
            // Since 'admin' has its own permissions in seedRoles.js, we'll follow the permission check.
            if (role.name === 'admin' && requiredPermissions.length === 0) {
                return next();
            }

            // 4. Permission Check (OR logic)
            // If any of the required permissions are present in the role's permission list, allow access.
            const hasPermission = requiredPermissions.some(perm =>
                Array.isArray(role.permissions) && role.permissions.includes(perm)
            );

            if (hasPermission || requiredPermissions.length === 0) {
                return next();
            }


            // 4. Access Denied Logic
            const deniedMsg = `Access Denied: Required one of [${requiredPermissions.join(', ')}]`;

            if (isApiRequest) {
            return res.status(403).json({ 
                status: false, 
                message: `Access Denied: Insufficient permissions. Required one of: [${requiredPermissions.join(', ')}]` 
            });
            } else {
                // Website behavior: Flash message and Redirect back
                req.flash('error', 'Access Denied: You do not have permission to perform this action.');
                
                // If there's no referer (direct link), go to dashboard
                const backURL = req.header('Referer') || '/dashboard';
                return res.redirect(backURL);
            }

        } catch (error) {
            logger.error(`roleChecker Error: ${error.message}`);
            if (req.originalUrl.startsWith("/api")) {
                return res.status(500).json({ status: false, message: 'Internal Server Error' });
            }
            next(error); // Trigger global 500 error page
        }
    };
};

module.exports = roleChecker;
