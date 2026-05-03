const express = require('express');
const router = express.Router();
const adminApiController = require('../../webservices/adminApiControlller');
const { checkAuth } = require('../../middleware/checkAuth');
const roleChecker = require('../../middleware/roleChecker');

// Protect all admin routes
router.use(checkAuth);

router.get('/', roleChecker('admin:dashboard'), adminApiController.getDashboard);
router.get('/users', roleChecker('users:view'), adminApiController.getUsers);
router.post('/users/:id/ban', roleChecker('users:manage'), adminApiController.toggleBan);
router.get('/projects', roleChecker('projects:view'), adminApiController.getProjects);
router.post('/projects/:id/delete', roleChecker('projects:manage'), adminApiController.deleteProject);
router.get('/notifications', roleChecker('notifications:manage'), adminApiController.getNotifications);
router.get('/stats', roleChecker('admin:dashboard'), adminApiController.getStats);
router.get('/disputes', roleChecker('disputes:view'), adminApiController.getDisputes);
router.post('/disputes/:id/resolve', roleChecker('disputes:resolve'), adminApiController.resolveDispute);
// router.get('/analytics', roleChecker('analytics:view'), adminApiController.getAnalytics);

module.exports = router;
