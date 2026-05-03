const express = require('express');
const router = express.Router();
const projectApiController = require('../../webservices/projectApiController');

const { checkAuth } = require('../../middleware/checkAuth');
const roleChecker = require('../../middleware/roleChecker');

router.use(checkAuth);

router.get('/bids', roleChecker('bids:view'), projectApiController.getMyBids);

module.exports = router;
