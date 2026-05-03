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

            // 1. Check if user and role exist in the request (populated by CheckAuth)
            if (!user || !user.role) {
                return res.status(401).json({ 
                    status: false, 
                    message: 'Authentication required: No role found in token.' 
                });
            }

            // 2. Fetch role permissions from the database
            // We use findOne because user.role is a string (e.g., 'admin', 'freelancer')
            const role = await roleModel.findOne({ name: user.role }).lean();

            if (!role) {
                logger.error(`Role definition not found for: ${user.role}`);
                return res.status(403).json({ 
                    status: false, 
                    message: 'Access Denied: Role configuration error.' 
                });
            }

            // 3. Admin bypass (optional, depends on project requirements)
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

            return res.status(403).json({ 
                status: false, 
                message: `Access Denied: Insufficient permissions. Required one of: [${requiredPermissions.join(', ')}]` 
            });

        } catch (error) {
            logger.error(`roleChecker Error: ${error.message}`);
            return res.status(500).json({ 
                status: false, 
                message: 'Internal Server Error during permission check.' 
            });
        }
    };
};

module.exports = roleChecker;
