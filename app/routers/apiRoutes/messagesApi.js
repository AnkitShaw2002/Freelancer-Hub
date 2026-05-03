const express = require('express');
const router = express.Router();
const messageApiController = require('../../webservices/messageApiController');
const { checkAuth } = require('../../middleware/checkAuth');
const roleChecker = require('../../middleware/roleChecker');

router.use(checkAuth);

router.get('/', roleChecker('messages:view'), messageApiController.getInbox);
router.get('/:userId', roleChecker('messages:view'), messageApiController.getConversation);
router.post('/send', roleChecker('messages:send'), messageApiController.sendMessage);

module.exports = router;
