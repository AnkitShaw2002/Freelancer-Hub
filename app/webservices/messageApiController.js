/**
 * MessageApiController.js
 * * This controller handles message-related operations for the API.
 * It provides endpoints for viewing the inbox, reading conversations, 
 * and sending messages with JSON responses.
 */

const Message = require('../models/Message');
const User = require('../models/User');
const logger = require('../utils/logger');

class MessageApiController {
    /**
     * GET /api/messages/inbox
     * Retrieves a list of all conversations for the authenticated user.
     */
    async getInbox(req, res) {
        try {
            const userId = req.user._id || req.user.id;

            // 1. Get unique conversation IDs where the user is either sender or receiver
            const [sentIds, receivedIds] = await Promise.all([
                Message.find({ senderId: userId }).distinct('conversationId'),
                Message.find({ receiverId: userId }).distinct('conversationId')
            ]);

            // Combine and remove duplicates
            const allConvIds = [...new Set([...sentIds, ...receivedIds])];
            const conversations = [];

            // 2. Aggregate details for each conversation
            for (const convId of allConvIds) {
                const lastMessage = await Message.findOne({ conversationId: convId })
                    .sort({ createdAt: -1 })
                    .lean();

                if (!lastMessage) continue;

                // Count unread messages for the current user in this conversation
                const unreadCount = await Message.countDocuments({
                    conversationId: convId,
                    receiverId: userId,
                    isRead: false
                });

                // Identify the other participant using denormalized names
                let otherId, otherName;
                if (lastMessage.senderId.toString() === userId.toString()) {
                    otherId = lastMessage.receiverId;
                    otherName = lastMessage.receiverName;
                } else {
                    otherId = lastMessage.senderId;
                    otherName = lastMessage.senderName;
                }

                conversations.push({
                    conversationId: convId,
                    lastMessage: {
                        content: lastMessage.content,
                        createdAt: lastMessage.createdAt
                    },
                    unreadCount,
                    participant: {
                        id: otherId,
                        name: otherName
                    }
                });
            }

            // 3. Sort conversations by most recent message
            conversations.sort((a, b) => new Date(b.lastMessage.createdAt) - new Date(a.lastMessage.createdAt));

            return res.status(200).json({
                success: true,
                data: conversations
            });

        } catch (err) {
            logger.error(`getInbox API Error: ${err.message}`);
            return res.status(500).json({
                success: false,
                message: "Failed to load inbox."
            });
        }
    }

    /**
     * GET /api/messages/conversation/:userId
     * Retrieves messages between the authenticated user and another specific user.
     */
    async getConversation(req, res) {
        try {
            const userId = req.user._id || req.user.id;
            const otherParticipantId = req.params.userId;

            // Verify the other user exists
            const otherUser = await User.findById(otherParticipantId, { 
                password: 0, 
                refreshToken: 0 
            }).lean();

            if (!otherUser) {
                return res.status(404).json({
                    success: false,
                    message: "Participant not found."
                });
            }

            const convId = Message.getConversationId(userId, otherParticipantId);

            // Mark incoming messages as read
            await Message.updateMany(
                {
                    conversationId: convId,
                    receiverId: userId,
                    isRead: false
                },
                { $set: { isRead: true } }
            );

            // Fetch all messages in the conversation
            const messages = await Message.find({ conversationId: convId })
                .sort({ createdAt: 1 })
                .lean();

            return res.status(200).json({
                success: true,
                data: {
                    participant: {
                        id: otherUser._id,
                        name: otherUser.displayName,
                        avatar: otherUser.profilePicture?.url || ''
                    },
                    conversationId: convId,
                    messages
                }
            });

        } catch (err) {
            logger.error(`getConversation API Error: ${err.message}`);
            return res.status(500).json({
                success: false,
                message: "Failed to load conversation."
            });
        }
    }

    /**
     * POST /api/messages/send
     * Sends a new message to a specific user.
     */
    async sendMessage(req, res) {
        try {
            const { receiverId, content } = req.body;
            const senderId = req.user._id || req.user.id;

            if (!content || !content.trim()) {
                return res.status(400).json({
                    success: false,
                    message: "Message content cannot be empty."
                });
            }

            // Find receiver to get denormalized name
            const receiver = await User.findById(receiverId, 'displayName').lean();
            if (!receiver) {
                return res.status(404).json({
                    success: false,
                    message: "Receiver not found."
                });
            }

            const convId = Message.getConversationId(senderId, receiverId);

            const newMessage = new Message({
                conversationId: convId,
                senderId: senderId,
                senderName: req.user.displayName || req.user.name,
                receiverId,
                receiverName: receiver.displayName,
                content: content.trim()
            });

            const savedMessage = await newMessage.save();

            return res.status(201).json({
                success: true,
                message: "Message sent successfully.",
                data: savedMessage
            });

        } catch (err) {
            logger.error(`sendMessage API Error: ${err.message}`);
            return res.status(500).json({
                success: false,
                message: "Failed to send message."
            });
        }
    }
}

module.exports = new MessageApiController();