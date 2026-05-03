const express = require('express');
const router = express.Router();

const pagesController = require('../../controllers/pagesController');
const adminController = require('../../controllers/adminController'); 

const { checkAuth, optionalAuth } = require('../../middleware/checkAuth');
const roleChecker = require('../../middleware/roleChecker');

const projectController = require('../../controllers/projectController');
const dashboardController = require('../../controllers/dashboardController');
const profileController = require('../../controllers/profileController');

router.get('/', optionalAuth, pagesController.landingPage);
router.get('/register', pagesController.getRegister);
router.get('/verify/:token', pagesController.getVerify);
router.get('/login', pagesController.getLogin);
router.get('/forgot-password', pagesController.getForgotPassword);
router.get('/reset-password/:token', pagesController.getResetPassword);

router.get('/dashboard', checkAuth, dashboardController.getDashboard);
router.get('/projects', optionalAuth, projectController.getProjects);
router.get('/projects/create', checkAuth, roleChecker('projects:create'), pagesController.getCreateProject);
router.get('/projects/:id', optionalAuth, projectController.getProject);
router.get('/settings', checkAuth, pagesController.getSettings);
router.get('/freelancers', optionalAuth, profileController.getFreelancers);

// Generic user notifications
router.get('/notifications', checkAuth, adminController.getNotifications);

module.exports = router;
