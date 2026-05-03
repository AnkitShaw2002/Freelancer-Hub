const express = require('express');
const router = express.Router();

const projectController = require('../../controllers/projectController');

const { checkAuth } = require('../../middleware/checkAuth');
const roleChecker = require('../../middleware/roleChecker');

router.use(checkAuth);

router.get('/bids', roleChecker('bids:view'), projectController.getMyBids);

module.exports = router;
