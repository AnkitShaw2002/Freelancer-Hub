const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const Message = require('../models/Message');

let io;

exports.initSocket = (server) => {
    io = new Server(server, {
        cors: { origin: process.env.CLIENT_ORIGIN || '*', methods: ['GET', 'POST'] }
    });

    io.use((socket, next) => {
        const token = socket.handshake.auth.token || socket.handshake.headers.token;
        if (!token) return next(new Error('Authentication error'));
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
            socket.user = decoded;
            next();
        } catch (err) {
            next(new Error('Authentication error'));
        }
    });

    const onlineUsers = new Map();

    io.on('connection', (socket) => {
        const userId = socket.user.id || socket.user._id;
        onlineUsers.set(userId.toString(), socket.id);
        
        socket.on('join_conversation', (convId) => {
            socket.join(convId);
        });

        socket.on('send_message', async (data) => {
            try {
                const { receiverId, content } = data;
                const senderId = userId;
                const convId = Message.getConversationId(senderId, receiverId);

                // Assuming sender info is passed or looked up elsewhere, but since this is socket
                // we broadcast what was received or emit an event to refresh.
                io.to(convId).emit('receive_message', {
                    senderId,
                    content,
                    createdAt: new Date()
                });

                const receiverSocketId = onlineUsers.get(receiverId.toString());
                if (receiverSocketId) {
                    io.to(receiverSocketId).emit('new_notification', {
                        message: 'New message received',
                        type: 'message'
                    });
                }
            } catch (err) {
                console.error('Socket message error', err);
            }
        });

        socket.on('disconnect', () => {
            onlineUsers.delete(userId.toString());
        });
    });

    return io;
};

exports.getIO = () => {
    if (!io) throw new Error('Socket.io not initialized');
    return io;
};
