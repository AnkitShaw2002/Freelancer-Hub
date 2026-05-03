const mongoose = require('mongoose');
const messageSchema = new mongoose.Schema({
    conversationId: { type: String, required: true, index: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, required: true },
    senderName: { type: String, required: true },
    receiverId: { type: mongoose.Schema.Types.ObjectId, required: true },
    receiverName: { type: String, required: true },
    
    content: { type: String, required: true, maxlength: 2000 },
    type: { type: String, enum: ['text', 'file', 'system'], default: 'text' },
    fileUrl: { type: String, default: '' },
    isRead: { type: Boolean, default: false }
}, { timestamps: true });

messageSchema.statics.getConversationId = (id1, id2) => {
    return [id1.toString(), id2.toString()].sort().join('_');
};

module.exports = mongoose.model('Message', messageSchema);