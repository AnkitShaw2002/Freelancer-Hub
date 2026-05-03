const express = require('express');
const router = express.Router();
const messageController = require('../../controllers/messageController');
const { checkAuth } = require('../../middleware/checkAuth');
const roleChecker = require('../../middleware/roleChecker');

router.use(checkAuth);

router.get('/', roleChecker('messages:view'), messageController.getInbox);
router.get('/:userId', roleChecker('messages:view'), messageController.getConversation);
router.post('/send', roleChecker('messages:send'), messageController.sendMessage);

module.exports = router;
