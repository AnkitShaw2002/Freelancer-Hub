const Message = require('../models/Message');
const User = require('../models/User');
const logger = require('../utils/logger');

class MessageController {
    async getInbox(req, res) {
        try {
            // const userId = req.user._id || req.user.id;

            // const [sent, received] = await Promise.all([
            //     Message.find({ senderId: userId }).distinct('conversationId'),

            //     Message.find({ receiverId: userId }).distinct('conversationId')
            // ]);
            // const allConvIds = [...new Set([...sent, ...received])];

            // const conversations = await Promise.all(allConvIds.map(async convId => {
            //     const last = await Message.findOne({ conversationId: convId }).sort({ createdAt: -1 }).lean();
            //     const unread = await Message.countDocuments({ conversationId: convId, receiverId: userId, isRead: false });
            //     const otherId = last.senderId.toString() === userId.toString() ? last.receiverId : last.senderId;
            //     const otherName = last.senderId.toString() === userId.toString() ? last.receiverName : last.senderName;
            //     return { convId, last, unread, otherId, otherName };
            // }));

            // conversations.sort((a, b) => new Date(b.last.createdAt) - new Date(a.last.createdAt));



            const userId = req.user._id || req.user.id;

        // 1. Get unique conversation IDs (Sequential Style)
        const sentIds = await Message.find({ senderId: userId }).distinct('conversationId');
        const receivedIds = await Message.find({ receiverId: userId }).distinct('conversationId');

        // Combine and remove duplicates
        const allConvIds = [...new Set([...sentIds, ...receivedIds])];

        const conversations = [];

        // 2. Loop through each conversation ID to get details
        // Your style uses clear, step-by-step logic inside the loop
        for (const convId of allConvIds) {
            // Get the very last message in this conversation
            const lastMessage = await Message.findOne({ conversationId: convId })
                .sort({ createdAt: -1 })
                .lean();

            if (!lastMessage) continue;

            // Get unread count for the current user
            const unreadCount = await Message.countDocuments({ 
                conversationId: convId, 
                receiverId: userId, 
                isRead: false 
            });

            // Identify the "Other Person"
            // We use the denormalized names directly from our "No-Populate" model
            let otherId, otherName;

            if (lastMessage.senderId.toString() === userId.toString()) {
                otherId = lastMessage.receiverId;
                otherName = lastMessage.receiverName;
            } else {
                otherId = lastMessage.senderId;
                otherName = lastMessage.senderName;
            }

            conversations.push({
                convId,
                last: lastMessage,
                unread: unreadCount,
                otherId,
                otherName
            });
        }

        // 3. Sort conversations so the newest message is at the top
        conversations.sort((a, b) => b.last.createdAt - a.last.createdAt);

            res.render('inbox', {
                title: 'Messages',
                conversations
            });

        } catch (err) {
            logger.error('getInbox: ' + err.message);
            req.flash('error', 'Failed to load messages');
            res.redirect('/dashboard');
        }
    }

    async getConversation(req, res) {
        try {
            const userId = req.user._id || req.user.id;

            const otherId = req.params.userId;

            const otherUser = await User.findById(otherId, { password: 0, refreshToken: 0 }).lean();

            if (!otherUser) {
                req.flash('error', 'User not found');
                return res.redirect('/messages');

            }
            otherUser.name = otherUser.displayName;

            otherUser.avatar = otherUser.profilePicture ? otherUser.profilePicture.url : '';

            const convId = Message.getConversationId(userId, otherId);

            await Message.updateMany({
                conversationId: convId,
                receiverId: userId,
                isRead: false
            },
                { isRead: true });

            const messages = await Message.find({ conversationId: convId }).sort({ createdAt: 1 }).lean();

            res.render('conversation',
                {
                    title: `Chat with ${otherUser.displayName}`,
                    messages, otherUser, convId
                });

        } catch (err) {
            req.flash('error', 'Failed to load conversation');
            res.redirect('/messages');
        }
    }

    async sendMessage(req, res) {
        try {
            const { receiverId, content } = req.body;

            const userId = req.user._id || req.user.id;

            if (!content || !content.trim())
                return res.redirect(`/messages/${receiverId}`);

            const receiver = await User.findById(receiverId, 'displayName').lean();

            if (!receiver) {
                req.flash('error', 'User not found');
                return res.redirect('/messages');
            }

            const convId = Message.getConversationId(userId, receiverId);

            await new Message({
                conversationId: convId,
                senderId: userId,
                senderName: req.user.displayName || req.user.name,
                receiverId,
                receiverName: receiver.displayName,
                content: content.trim()
            }).save();

            res.redirect(`/messages/${receiverId}`);

        } catch (err) {
            logger.error('sendMessage: ' + err.message);

            req.flash('error', 'Failed to send message');

            res.redirect('/messages');
        }
    }
}

module.exports = new MessageController();
