const express = require('express');
const router = express.Router();

const projectApiController = require('../../webservices/projectApiController');
const disputeApiController = require('../../webservices/disputeApiController');

const { checkAuth, optionalAuth } = require('../../middleware/checkAuth');
const roleChecker = require('../../middleware/roleChecker');

const { projectActionLimiter } = require('../../middleware/rateLimiter');

router.get('/', optionalAuth, projectApiController.getProjects);
router.get('/:id', optionalAuth, projectApiController.getProject);

router.post('/:id/bid', checkAuth, roleChecker('projects:apply'), projectActionLimiter, projectApiController.postBid);
router.post('/:id/bid/:bidId/withdraw', checkAuth, roleChecker('bids:manage'), projectApiController.withdrawBid);
router.post('/:id/status', checkAuth, projectApiController.updateStatus);
router.get('/:id/dispute', checkAuth, disputeApiController.getDisputeForm);
router.post('/:id/dispute', checkAuth, disputeApiController.postDispute);

// Milestone submit (freelancer)
router.post('/:id/milestones/:msId/submit', checkAuth, roleChecker('work:submit'), projectApiController.submitMilestone);

// Final work submission (freelancer)
router.post('/:id/submit-final', checkAuth, roleChecker('work:submit'), projectApiController.submitFinalWork);

// AI bid analysis (client AJAX)
router.get('/:id/ai-analyse', checkAuth, roleChecker('projects:view-my'), projectApiController.analyseBids);

module.exports = router;
