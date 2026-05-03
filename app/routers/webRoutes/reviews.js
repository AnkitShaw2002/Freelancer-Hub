const express = require('express');
const router = express.Router();
const reviewController = require('../../controllers/reviewController');
const { checkAuth } = require('../../middleware/checkAuth');
const roleChecker = require('../../middleware/roleChecker');

router.post('/:projectId', checkAuth, roleChecker('reviews:give'), reviewController.postReview);

module.exports = router;
