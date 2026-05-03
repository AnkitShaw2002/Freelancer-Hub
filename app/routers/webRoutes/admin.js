const express = require('express');
const router = express.Router();
const adminController = require('../../controllers/adminController');
const { checkAuth } = require('../../middleware/checkAuth');
const roleChecker = require('../../middleware/roleChecker');

// Protect all admin routes
router.use(checkAuth);

router.get('/', roleChecker('admin:dashboard'), adminController.getDashboard);

router.get('/users', roleChecker('users:view'), adminController.getUsers);

router.post('/users/:id/ban', roleChecker('users:manage'), adminController.toggleBan);

router.get('/projects', roleChecker('projects:view'), adminController.getProjects);

router.post('/projects/:id/delete', roleChecker('projects:manage'), adminController.deleteProject);

router.get('/notifications', roleChecker('notifications:manage'), adminController.getNotifications);

router.get('/stats', roleChecker('admin:dashboard'), adminController.getStats);

router.get('/disputes', roleChecker('disputes:view'), adminController.getDisputes);

router.post('/disputes/:id/resolve', roleChecker('disputes:resolve'), adminController.resolveDispute);

router.get('/analytics', roleChecker('analytics:view'), adminController.getAnalytics);

module.exports = router;
