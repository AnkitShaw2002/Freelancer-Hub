const mongoose = require('mongoose');
const User = require('../models/User');
const Review = require('../models/Review');
const Project = require('../models/Project');
const { uploadToCloudinary } = require('../middleware/Uploadchecker');
const logger = require('../utils/logger');
const { getCache, setCache, delCache } = require('../utils/redisCache');

class ProfileApiController {
    /**
     * @route GET /api/profile/:id?
     * @desc Get a user profile (own or public) with reviews and active projects
     */
    async getProfile(req, res) {
        try {
            const id = req.params.id || (req.user && (req.user._id || req.user.id));
            if (!id) {
                return res.status(401).json({ success: false, message: 'Authentication required' });
            }

            if (!mongoose.Types.ObjectId.isValid(id)) {
                return res.status(400).json({ success: false, message: 'Invalid User ID' });
            }

            const userId = new mongoose.Types.ObjectId(id);
            const cacheKey = `user_profile:${id}`;
            const cachedProfile = await getCache(cacheKey);
            if (cachedProfile) {
                const isOwn = req.user && (req.user._id || req.user.id).toString() === id.toString();
                return res.status(200).json({
                    success: true,
                    data: {
                        ...cachedProfile,
                        isOwn
                    }
                });
            }

            const profiles = await User.aggregate([
                { $match: { _id: userId, isDeleted: false } },
                { $project: { password: 0, refreshToken: 0, verificationToken: 0, notifications: 0 } }
            ]);

            const profileUser = profiles[0];

            if (!profileUser) {
                return res.status(404).json({ success: false, message: 'User not found' });
            }

            // Data normalization for API response
            profileUser.name = profileUser.displayName;
            profileUser.avatar = profileUser.profilePicture ? profileUser.profilePicture.url : '';

            const [reviews, activeProjects] = await Promise.all([
                Review.aggregate([
                    { $match: { revieweeId: userId } },
                    { $sort: { createdAt: -1 } },
                    { $limit: 10 }
                ]),
                profileUser.role === 'freelancer' ? Project.aggregate([
                    { $match: { freelancerId: userId, status: { $in: ['assigned', 'in-progress'] }, isDeleted: false } },
                    { $project: { title: 1, status: 1, budget: 1, category: 1 } }
                ]) : Promise.resolve([])
            ]);

            const isOwn = req.user && (req.user._id || req.user.id).toString() === id.toString();
            const responseData = {
                profile: profileUser,
                reviews,
                activeProjects
            };

            await setCache(cacheKey, responseData, 120);

            return res.status(200).json({
                success: true,
                data: {
                    ...responseData,
                    isOwn
                }
            });
        } catch (err) {
            logger.error('API getProfile error: ' + err.message);
            return res.status(500).json({ success: false, message: 'Failed to load profile' });
        }
    }

    /**
     * @route GET /api/profile/edit-context
     * @desc Get current user data to populate the edit form
     */
    async getEditProfile(req, res) {
        try {
            const user = await User.findById(req.user._id || req.user.id)
                .select('-password -refreshToken -verificationToken -notifications')
                .lean();
            
            return res.status(200).json({
                success: true,
                data: user
            });
        } catch (err) {
            return res.status(500).json({ success: false, message: 'Failed to load edit context' });
        }
    }

    /**
     * @route POST /api/profile/edit
     * @desc Update user profile data and avatar
     */
    async postEditProfile(req, res) {
        try {
            const { bio, location, phone, skills, hourlyRate, category, experience, availability, displayName } = req.body;
            
            // Handle skills if sent as string (comma separated) or array
            let skillsArr = [];
            if (Array.isArray(skills)) {
                skillsArr = skills;
            } else if (skills) {
                skillsArr = skills.split(',').map(s => s.trim()).filter(Boolean);
            }

            const updates = {
                bio: bio || '',
                location: location || '',
                phone: phone || '',
                skills: skillsArr,
                hourlyRate: hourlyRate ? Number(hourlyRate) : 0,
                category: category || '',
                experience: experience || 'intermediate',
                availability: availability === 'on' || availability === 'true' || availability === true
            };

            if (displayName) updates.displayName = displayName;

            // Handle Cloudinary upload if file is present
            if (req.file && req.file.buffer) {
                try {
                    const result = await uploadToCloudinary(req.file.buffer, 'freelancer_hub/avatars');
                    updates['profilePicture.url'] = result.secure_url;
                    updates['profilePicture.public_id'] = result.public_id;
                } catch (cloudErr) {
                    logger.error('Cloudinary upload error: ' + cloudErr.message);
                    // We continue even if image fails, but return a partial success warning
                    return res.status(207).json({ 
                        success: true, 
                        message: 'Profile updated, but image upload failed.',
                        error: cloudErr.message 
                    });
                }
            }

            const userId = req.user._id || req.user.id;
            const updatedUser = await User.findByIdAndUpdate(
                userId,
                { $set: updates },
                { new: true }
            ).select('-password').lean();

            await delCache(`user_profile:${userId}`);

            return res.status(200).json({
                success: true,
                message: 'Profile updated successfully!',
                data: updatedUser
            });

        } catch (err) {
            logger.error('API postEditProfile error: ' + err.message);
            return res.status(500).json({ success: false, message: 'Failed to update profile' });
        }
    }

    /**
     * @route GET /api/freelancers
     * @desc Search and filter freelancers
     */
    async getFreelancers(req, res) {
        try {
            const { search, skills, experience, min_rate, max_rate, category, page = 1 } = req.query;

            const filter = { role: 'freelancer', isDeleted: false, isBanned: false };

            if (search) {
                filter.$or = [
                    { displayName: { $regex: search, $options: 'i' } },
                    { bio: { $regex: search, $options: 'i' } },
                    { skills: { $in: [new RegExp(search, 'i')] } }
                ];
            }

            if (skills) filter.skills = { $in: [new RegExp(skills, 'i')] };
            if (experience) filter.experience = experience;
            if (category) filter.category = category;
            
            if (min_rate || max_rate) {
                filter.hourlyRate = {};
                if (min_rate) filter.hourlyRate.$gte = Number(min_rate);
                if (max_rate) filter.hourlyRate.$lte = Number(max_rate);
            }

            const limit = 12;
            const skip = (Number(page) - 1) * limit;

            const [freelancers, totalRes] = await Promise.all([
                User.aggregate([
                    { $match: filter },
                    { $sort: { avgRating: -1, createdAt: -1 } },
                    { $skip: skip },
                    { $limit: limit },
                    { $project: { password: 0, refreshToken: 0, verificationToken: 0, notifications: 0 } }
                ]),
                User.aggregate([
                    { $match: filter },
                    { $count: "count" }
                ])
            ]);

            const total = totalRes[0]?.count || 0;
            const normalized = freelancers.map(f => ({
                ...f,
                name: f.displayName,
                avatar: f.profilePicture ? f.profilePicture.url : ''
            }));

            return res.status(200).json({
                success: true,
                data: {
                    freelancers: normalized,
                    pagination: {
                        total,
                        totalPages: Math.ceil(total / limit),
                        currentPage: Number(page),
                        limit
                    }
                }
            });
        } catch (err) {
            logger.error('API getFreelancers error: ' + err.message);
            return res.status(500).json({ success: false, message: 'Failed to load freelancers' });
        }
    }
}

module.exports = new ProfileApiController();