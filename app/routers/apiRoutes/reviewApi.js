const express = require('express');
const router = express.Router();

const reviewApiController = require('../../webservices/reviewApiController');

const { checkAuth } = require('../../middleware/checkAuth');
const roleChecker = require('../../middleware/roleChecker');

router.post('/:projectId', checkAuth, roleChecker('reviews:give'), reviewApiController.postReview);

module.exports = router;
