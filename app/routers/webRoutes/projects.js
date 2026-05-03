const express = require('express');
const router = express.Router();

const projectController = require('../../controllers/projectController');
const disputeController = require('../../controllers/disputeController');

const { checkAuth, optionalAuth } = require('../../middleware/checkAuth');
const roleChecker = require('../../middleware/roleChecker');
const { projectActionLimiter } = require('../../middleware/rateLimiter');

router.get('/', optionalAuth, projectController.getProjects);

router.get('/:id', optionalAuth, projectController.getProject);

router.post('/:id/bid', checkAuth, roleChecker('projects:apply'), projectActionLimiter, projectController.postBid);
router.post('/:id/bid/:bidId/withdraw', checkAuth, roleChecker('bids:manage'), projectController.withdrawBid);
router.post('/:id/status', checkAuth, projectController.updateStatus);

//For any dispute
router.get('/:id/dispute', checkAuth, disputeController.getDisputeForm);
router.post('/:id/dispute', checkAuth, disputeController.postDispute);

// Milestone submit (freelancer)
router.post('/:id/milestones/:msId/submit', checkAuth, roleChecker('work:submit'), projectController.submitMilestone);

// Final work submission (freelancer)
router.post('/:id/submit-final', checkAuth, roleChecker('work:submit'), projectController.submitFinalWork);

// AI bid analysis (client AJAX)
router.get('/:id/ai-analyse', checkAuth, roleChecker('projects:view-my'), projectController.analyseBids);

module.exports = router;
