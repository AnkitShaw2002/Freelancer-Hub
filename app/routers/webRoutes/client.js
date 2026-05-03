const express = require('express');
const router = express.Router();
const projectController = require('../../controllers/projectController');

const paymentController = require('../../controllers/paymentController');

const { checkAuth } = require('../../middleware/checkAuth');
const roleChecker = require('../../middleware/roleChecker');
const { projectValidation, validate } = require('../../middleware/validator');

router.use(checkAuth);

router.get('/projects', roleChecker('projects:view-my'), projectController.getMyProjects);
router.get('/projects/create', roleChecker('projects:create'), projectController.getCreateProject);
router.post('/projects', roleChecker('projects:create'), projectValidation, validate, projectController.postCreateProject);
router.get('/projects/:id/edit', roleChecker('projects:edit'), projectController.getEditProject);
router.post('/projects/:id/edit', roleChecker('projects:edit'), projectValidation, validate, projectController.postEditProject);
router.post('/projects/:id/award/:bidId', roleChecker('projects:award'), projectController.awardProject);
router.delete('/projects/:id', roleChecker('projects:delete'), projectController.deleteProject);
router.post('/projects/:id/status', roleChecker('projects:complete'), projectController.updateStatus);
router.get('/projects/:id/contract', roleChecker('projects:view-my'), projectController.getContract);

// Payment
router.get('/projects/:id/pay', roleChecker('payments:manage'), paymentController.getCheckout);
router.post('/projects/:id/pay', roleChecker('payments:manage'), paymentController.createPaymentIntent);

// Milestone approve/reject
router.post('/projects/:id/milestones/:msId/approve', roleChecker('projects:complete'), projectController.approveMilestone);
router.post('/projects/:id/milestones/:msId/reject', roleChecker('projects:complete'), projectController.rejectMilestone);

module.exports = router;
