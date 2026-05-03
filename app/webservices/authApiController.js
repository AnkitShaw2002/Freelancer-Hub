const User = require('../models/User');
const roleModel = require('../models/roleModel');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const emailService = require('../services/emailService');
const logger = require('../utils/logger');

class AuthApiController {
    /**
     * @route POST /api/auth/register-create
     */
    async postRegister(req, res) {
        try {
            const { firstName, lastName, email, password, role, category } = req.body;

            const existingUser = await User.findOne({ email: email.toLowerCase().trim(), isDeleted: false }).lean();
            if (existingUser) {
                return res.status(400).json({ success: false, message: 'Email already registered. Please login.' });
            }

            const roleData = await roleModel.findOne({ name: role });
            if (!roleData) {
                return res.status(400).json({ success: false, message: 'Invalid role selected.' });
            }

            const displayName = `${firstName.trim()} ${lastName.trim()}`;
            const hashedPassword = await bcrypt.hash(password, 12);
            const verificationToken = crypto.randomBytes(32).toString('hex');

            const user = new User({
                displayName,
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                email: email.toLowerCase().trim(),
                password: hashedPassword,
                role: roleData.name,
                category: category || '',
                verificationToken
            });

            await user.save();

            const verifyLink = `${process.env.BASE_URL}/verify/${verificationToken}`;
            try {
                await emailService.sendVerificationEmail(user, verifyLink);
            } catch (emailErr) {
                logger.error('Verification email failed: ' + emailErr.message);
                // We don't fail the whole registration if email fails, but we should inform the log
            }

            logger.info(`New user registered via API: ${email}`);
            return res.status(201).json({
                success: true,
                message: 'Registration successful! Please check your email to verify your account.'
            });

        } catch (error) {
            logger.error('API Registration Error: ' + error.message);
            return res.status(500).json({ success: false, message: 'Registration failed.', error: error.message });
        }
    }

    /**
     * @route POST /api/auth/verify-account/:token
     */
    async verifyAccount(req, res) {
        try {
            const { token } = req.params;
            const user = await User.findOne({ verificationToken: token });

            if (!user) {
                return res.status(400).json({ success: false, message: 'Invalid or expired verification token.' });
            }

            user.isVerified = true;
            user.verificationToken = null;
            await user.save();

            logger.info(`Email verified via API: ${user.email}`);
            return res.status(200).json({
                success: true,
                message: 'Your email is verified. You can now login.'
            });

        } catch (error) {
            logger.error('API Verify Error: ' + error.message);
            return res.status(500).json({ success: false, message: 'An error occurred during verification.' });
        }
    }

    /**
     * @route POST /api/auth/login-create
     */
    async postLogin(req, res) {
        try {
            const { email, password } = req.body;

            const user = await User.findOne({ email: email.toLowerCase().trim(), isDeleted: false });
            if (!user) {
                return res.status(401).json({ success: false, message: 'No account found with this email address.' });
            }

            if (!user.isVerified) {
                return res.status(403).json({ success: false, message: 'Please verify your email before logging in.' });
            }

            if (user.isBanned) {
                return res.status(403).json({ success: false, message: 'Your account has been suspended.' });
            }

            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(401).json({ success: false, message: 'Invalid email or password.' });
            }

            // Generate Tokens
            const token = jwt.sign(
                { id: user._id, _id: user._id, name: user.displayName, email: user.email, role: user.role },
                process.env.JWT_SECRET_KEY,
                { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
            );

            const refreshToken = jwt.sign(
                { id: user._id },
                process.env.SESSION_SECRET,
                { expiresIn: '7d' }
            );

            user.refreshToken = refreshToken;
            await user.save();

            // Set Cookies (for browser-based API consumers)
            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'Lax',
                maxAge: 7 * 24 * 60 * 60 * 1000
            });

            res.cookie('refreshToken', refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'Strict',
                maxAge: 7 * 24 * 60 * 60 * 1000
            });

            logger.info(`User logged in via API: ${email}`);

            return res.status(200).json({
                success: true,
                message: `Welcome back, ${user.displayName}!`,
                token,
                refreshToken,
                user: {
                    id: user._id,
                    displayName: user.displayName,
                    email: user.email,
                    role: user.role,
                    category: user.category
                }
            });

        } catch (error) {
            logger.error('API Login Error: ' + error.message);
            return res.status(500).json({ success: false, message: 'Login failed.' });
        }
    }

    /**
     * @route GET /api/auth/logout
     */
    async logout(req, res) {
        try {
            const userId = req.user ? (req.user._id || req.user.id) : null;
            
            if (userId) {
                await User.findByIdAndUpdate(userId, { refreshToken: null });
            }

            res.clearCookie('token');
            res.clearCookie('refreshToken');
            res.clearCookie('connect.sid');

            return res.status(200).json({ success: true, message: 'Logged out successfully' });
        } catch (error) {
            logger.error('API Logout Error: ' + error.message);
            return res.status(500).json({ success: false, message: 'Logout failed' });
        }
    }

    /**
     * @route POST /api/auth/forgot-password
     */
    async forgotPassword(req, res) {
        try {
            const { email } = req.body;
            const user = await User.findOne({ email: email.toLowerCase().trim(), isDeleted: false });

            if (!user) {
                return res.status(404).json({ success: false, message: 'No account found with that email address.' });
            }

            const resetToken = crypto.randomBytes(32).toString('hex');
            user.resetPasswordToken = resetToken;
            user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
            await user.save();

            const resetLink = `${process.env.BASE_URL}/reset-password/${resetToken}`;
            await emailService.sendResetPasswordEmail(user, resetLink);

            logger.info(`Password reset requested via API: ${email}`);
            return res.status(200).json({ success: true, message: 'An email has been sent with further instructions.' });

        } catch (error) {
            logger.error('API Forgot Password Error: ' + error.message);
            return res.status(500).json({ success: false, message: 'An error occurred.' });
        }
    }

    /**
     * @route POST /api/auth/reset-password/:token
     */
    async resetPassword(req, res) {
        try {
            const { token } = req.params;
            const { password } = req.body;

            const user = await User.findOne({
                resetPasswordToken: token,
                resetPasswordExpires: { $gt: Date.now() }
            });

            if (!user) {
                return res.status(400).json({ success: false, message: 'Password reset token is invalid or has expired.' });
            }

            const hashedPassword = await bcrypt.hash(password, 12);
            user.password = hashedPassword;
            user.resetPasswordToken = null;
            user.resetPasswordExpires = null;
            await user.save();

            logger.info(`Password reset success via API: ${user.email}`);
            return res.status(200).json({ success: true, message: 'Your password has been changed successfully.' });

        } catch (error) {
            logger.error('API Reset Password Error: ' + error.message);
            return res.status(500).json({ success: false, message: 'An error occurred.' });
        }
    }
}

module.exports = new AuthApiController();