const express = require('express');
const router = express.Router();

const projectApiController = require('../../webservices/projectApiController');
const paymentApiController = require('../../webservices/paymentApiController');

const { checkAuth } = require('../../middleware/checkAuth');
const roleChecker = require('../../middleware/roleChecker');
const { projectValidation, validate } = require('../../middleware/validator');

router.use(checkAuth);

router.get('/projects', roleChecker('projects:view-my'), projectApiController.getMyProjects);
router.get('/projects/create', roleChecker('projects:create'), projectApiController.getCreateProject);
router.post('/projects', roleChecker('projects:create'), projectValidation, validate, projectApiController.postCreateProject);
router.get('/projects/:id/edit', roleChecker('projects:edit'), projectApiController.getEditProject);
router.post('/projects/:id/edit', roleChecker('projects:edit'), projectValidation, validate, projectApiController.postEditProject);
router.post('/projects/:id/award/:bidId', roleChecker('projects:award'), projectApiController.awardProject);
router.delete('/projects/:id', roleChecker('projects:delete'), projectApiController.deleteProject);
router.post('/projects/:id/status', roleChecker('projects:complete'), projectApiController.updateStatus);
router.get('/projects/:id/contract', roleChecker('projects:view-my'), projectApiController.getContract);

// Payment
router.get('/projects/:id/pay', roleChecker('payments:manage'), paymentApiController.getCheckout);
router.post('/projects/:id/pay', roleChecker('payments:manage'), paymentApiController.createPaymentIntent);

// Milestone approve/reject
router.post('/projects/:id/milestones/:msId/approve', roleChecker('projects:complete'), projectApiController.approveMilestone);
router.post('/projects/:id/milestones/:msId/reject', roleChecker('projects:complete'), projectApiController.rejectMilestone);

module.exports = router;
