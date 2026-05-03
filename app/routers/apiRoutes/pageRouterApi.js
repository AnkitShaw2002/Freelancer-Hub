const express = require('express');
const router = express.Router();

const pagesApiController = require('../../webservices/pagesApiController');
const adminApiControlller = require('../../webservices/adminApiControlller'); 

const { checkAuth, optionalAuth } = require('../../middleware/checkAuth');
const roleChecker = require('../../middleware/roleChecker');

const projectApiController = require('../../webservices/projectApiController');
const dashboardApiController = require('../../webservices/dashboardApiController');
const profileApiController = require('../../webservices/profileApiController');

router.get('/', optionalAuth, pagesApiController.landingPage);
router.get('/register', pagesApiController.getRegister);
router.get('/verify/:token', pagesApiController.getVerify);
router.get('/login', pagesApiController.getLogin);
router.get('/forgot-password', pagesApiController.getForgotPassword);
router.get('/reset-password/:token', pagesApiController.getResetPassword);

router.get('/dashboard', checkAuth, dashboardApiController.getDashboard);
router.get('/projects', optionalAuth, projectApiController.getProjects);
router.get('/projects/create', checkAuth, roleChecker('projects:create'), pagesApiController.getCreateProject);
router.get('/projects/:id', optionalAuth, projectApiController.getProject);
router.get('/settings', checkAuth, pagesApiController.getSettings);
router.get('/freelancers', optionalAuth, profileApiController.getFreelancers);

// Generic user notifications
router.get('/notifications', checkAuth, adminApiControlller.getNotifications);

module.exports = router;
