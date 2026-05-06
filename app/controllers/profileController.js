const mongoose = require('mongoose');
const User = require('../models/User');
const Review = require('../models/Review');
const Project = require('../models/Project');
const { uploadToCloudinary } = require('../middleware/Uploadchecker');
const logger = require('../utils/logger');

class ProfileController {

    async getProfile(req, res) {
        try {
            const id = req.params.id || (req.user && (req.user._id || req.user.id));
            if (!id) return res.redirect('/login');
            const userId = new mongoose.Types.ObjectId(id);

            const profiles = await User.aggregate([
                { $match: { _id: userId, isDeleted: false } },
                { $project: { password: 0, refreshToken: 0, verificationToken: 0 } }
            ]);

            const profileUser = profiles[0];

            if (!profileUser) {
                req.flash('error', 'User not found');
                return res.redirect('/');
            }

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

            res.render('profile', {
                title: profileUser.displayName + ' — Profile',
                profileUser,
                reviews,
                activeProjects,
                isOwn
            });
        } catch (err) {
            logger.error('getProfile error: ' + err.message);
            req.flash('error', 'Failed to load profile');
            return res.redirect('/');
        }
    }

    getEditProfile(req, res) {
        res.render('edit-profile', { title: 'Edit Profile' });
    }

    async postEditProfile(req, res) {
        try {
            const { bio, location, phone, skills, hourlyRate, category, experience, availability } = req.body;
            const skillsArr = skills ? skills.split(',').map(s => s.trim()).filter(Boolean) : [];

            const updates = {
                bio: bio || '',
                location: location || '',
                phone: phone || '',
                skills: skillsArr,
                hourlyRate: hourlyRate ? Number(hourlyRate) : 0,
                category: category || '',
                experience: experience || 'intermediate',
                availability: availability === 'on' || availability === 'true'
            };

            if (req.file && req.file.buffer) {
                try {
                    const result = await uploadToCloudinary(req.file.buffer, 'freelancer_hub/avatars');

                    updates['profilePicture.url'] = result.secure_url;

                    updates['profilePicture.public_id'] = result.public_id;

                } catch (cloudErr) {
                    logger.error('Cloudinary upload error: ' + cloudErr.message);
                    req.flash('error', 'Profile picture upload failed. Other changes were saved.');
                    return res.redirect('/profile/edit');
                }
            }

            await User.findByIdAndUpdate(req.user._id || req.user.id, { $set: updates });

            req.flash('success', 'Profile updated successfully!');

            return res.redirect('/profile');

        } catch (err) {
            logger.error('postEditProfile error: ' + err.message);

            req.flash('error', 'Failed to update profile');

            return res.redirect('/profile/edit');
        }
    }

    async getFreelancers(req, res) {
        try {
            const { search, skills, experience, min_rate, max_rate, page = 1 } = req.query;

            const filter = { role: 'freelancer',isVerified:true, isDeleted: false, isBanned: false };

            if (search) {
                filter.$or = [
                    { displayName: { $regex: search, $options: 'i' } },
                    { bio: { $regex: search, $options: 'i' } },
                    { skills: { $in: [new RegExp(search, 'i')] } }
                ];
            }

            if (skills) filter.skills = { $in: [new RegExp(skills, 'i')] };

            if (experience) filter.experience = experience;

            if (min_rate) filter.hourlyRate = { $gte: Number(min_rate) };

            if (max_rate) filter.hourlyRate = { ...(filter.hourlyRate || {}), $lte: Number(max_rate) };

            const limit = 8;
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

            res.render('freelancers', {
                title: 'Find Freelancers',
                freelancers: normalized,
                total,
                totalPages: Math.ceil(total / limit),
                currentPage: Number(page),
                query: req.query
            });
        } catch (err) {
            logger.error('getFreelancers error: ' + err.message);
            req.flash('error', 'Failed to load freelancers');
            return res.redirect('/');
        }
    }
}

module.exports = new ProfileController();
