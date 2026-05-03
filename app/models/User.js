const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const notificationSchema = new mongoose.Schema({
    message: { 
        type: String, 
        required: true },
    type: { 
        type: String,
        enum: ['bid', 'project', 'payment', 'dispute', 'system'], 
        default: 'system' },
    link: { 
        type: String,
        default: '' },
    isRead: { 
        type: Boolean, 
        default: false },
    createdAt: { 
        type: Date, 
        default: Date.now }
}, 
{ 
    _id: true 
});

const userSchema = new mongoose.Schema({
    googleId: { type: String, default: null },
    displayName: { type: String, required: true },
    firstName: { type: String, default: '' },
    lastName: { type: String, default: '' },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String },

    profilePicture: {
        url: { type: String, default: 'https://static.vecteezy.com/system/resources/thumbnails/029/271/062/small/avatar-profile-icon-in-flat-style-male-user-profile-illustration-on-isolated-background-man-profile-sign-business-concept-vector.jpg' },
        public_id: { type: String, default: null }
    },

    role: { type: String, enum: ['freelancer', 'client', 'admin'], default: 'freelancer' },
    category: { type: String, default: '' },

    bio: { type: String, default: '', maxlength: 1000 },
    location: { type: String, default: '' },
    phone: { type: String, default: '' },
    skills: [{ type: String }],
    hourlyRate: { type: Number, default: 0 },
    experience: { type: String, enum: ['beginner', 'intermediate', 'expert'], default: 'intermediate' },
    availability: { type: Boolean, default: true },

    avgRating: { type: Number, default: 0 },
    totalReviews: { type: Number, default: 0 },
    walletBalance: { type: Number, default: 0 },
    totalEarnings: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    completedProjects: { type: Number, default: 0 },

    notifications: [notificationSchema],

    isVerified: { type: Boolean, default: false },
    verificationToken: { type: String, default: null },
    resetPasswordToken: { type: String, default: null },
    resetPasswordExpires: { type: Date, default: null },
    isBanned: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    refreshToken: { type: String, default: null },
    secretKey: { type: String, default: null },

    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null }
}, { timestamps: true, versionKey: false });

userSchema.index({ role: 1 });

const User = mongoose.model('User', userSchema);
module.exports = User;