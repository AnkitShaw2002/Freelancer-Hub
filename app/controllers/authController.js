const User = require('../models/User');
const roleModel = require('../models/roleModel');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const emailService = require('../services/emailService');
const { validationResult } = require('express-validator');
const logger = require('../utils/logger');

class AuthController {

    async postRegister(req, res) {
        try {
            logger.info(`Registration attempt for email: ${req.body.email}`);
            const { firstName, lastName, email, password, role, category } = req.body;

            const existingUser = await User.findOne({ email, isDeleted: false }).lean();
            if (existingUser) {
                req.flash('error', 'Email already registered. Please login.');
                return res.redirect('/register');
            }

            const roleData = await roleModel.findOne({ name: role });
            if (!roleData) {
                req.flash('error', 'Invalid role selected.');
                return res.redirect('/register');
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
                req.flash('error', 'Account created, but verification email failed to send. Please contact support.');
                return res.redirect('/login');
            }

            logger.info(`New user registered: ${email}`);
            req.flash('success', `Registration successful! Please check your email to verify your account, ${displayName}!`);
            return res.redirect('/login');

        } catch (error) {
            logger.error('Registration Error: ' + error.message);

            req.flash('error', 'Registration failed. Please try again.');
            return res.redirect('/register');
        }
    }

    async verifyAccount(req, res) {
        try {
            const { token } = req.params;
            const user = await User.findOne({ verificationToken: token });

            if (!user) {
                req.flash('error', 'Invalid or expired verification token.');
                return res.redirect('/login');
            }

            user.isVerified = true;
            user.verificationToken = null;
            await user.save();

            logger.info(`Email verified: ${user.email}`);
            req.flash('success', `Welcome aboard, ${user.displayName}! Your email is verified. You can now login.`);
            return res.redirect('/login');

        } catch (error) {
            logger.error('Verify Error: ' + error.message);
            req.flash('error', 'An error occurred during verification.');
            return res.redirect('/login');
        }
    }

    async postLogin(req, res) {
        try {
            const { email, password } = req.body;

            const user = await User.findOne({ email: email.toLowerCase().trim(), isDeleted: false });

            if (!user) {
                req.flash('error', 'No account found with this email address.');
                return res.redirect('/login');
            }

            if (!user.isVerified) {
                req.flash('error', 'Please verify your email before logging in.');
                return res.redirect('/login');
            }

            if (user.isBanned) {
                req.flash('error', 'Your account has been suspended. Please contact support.');
                return res.redirect('/login');
            }

            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                req.flash('error', 'Invalid email or password.');
                return res.redirect('/login');
            }

            // 1. Regenerate session to prevent fixation
            req.session.regenerate(async (err) => {
                if (err) {
                    logger.error('Session regeneration error: ' + err.message);
                    req.flash('error', 'An error occurred during login.');
                    return res.redirect('/login');
                }

                // 2. Generate Tokens
                const token = jwt.sign(
                    {
                        id: user._id,
                        _id: user._id,
                        name: user.displayName,
                        email: user.email,
                        role: user.role
                    },
                    process.env.JWT_SECRET_KEY,
                    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
                );

                const refreshToken = jwt.sign(
                    { id: user._id },
                    process.env.SESSION_SECRET,
                    { expiresIn: '7d' });

                // 3. Save Refresh Token
                user.refreshToken = refreshToken;

                await user.save();

                // 4. Set Cookies
                res.cookie('token', token, {
                    httpOnly: true, // Increased security
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

                // 5. Bind Session to User
                req.session.userId = user._id.toString();
                req.session.token = token; // Store token in session for verification

                logger.info(`User logged in: ${email}`);

                req.flash('success', `Welcome back, ${user.displayName}!`);

                return res.redirect('/dashboard');
            });

        } catch (error) {
            logger.error('Login Error: ' + error.message);
            req.flash('error', 'Login failed. Please try again.');
            return res.redirect('/login');
        }
    }

    async logout(req, res) {
        try {

            if (req.user && req.user._id) {
                await User.findByIdAndUpdate(req.user._id, { refreshToken: null });
            }

            req.session.destroy((err) => {
                if (err) logger.error('Session destroy error: ' + err.message);
                res.clearCookie('connect.sid');

                res.clearCookie('token');

                res.clearCookie('refreshToken');

                return res.redirect('/login');
            });
        } catch (error) {
            logger.error('Logout Error: ' + error.message);
            req.flash('error', 'Logout failed. Please try again.');
            return res.redirect('/');
        }
    }

    async forgotPassword(req, res) {
        try {

            const { email } = req.body;

            const user = await User.findOne({ email: email.toLowerCase().trim(), isDeleted: false });


            if (!user) {
                req.flash('error', 'No account found with that email address.');

                return res.redirect('/forgot-password');
            }

            const resetToken = crypto.randomBytes(32).toString('hex');

            user.resetPasswordToken = resetToken;

            user.resetPasswordExpires = Date.now() + 3600000; // 1 hour

            await user.save();

            const resetLink = `${process.env.BASE_URL}/reset-password/${resetToken}`;

            await emailService.sendResetPasswordEmail(user, resetLink);

            logger.info(`Password reset requested: ${email}`);

            req.flash('success', 'An email has been sent with further instructions.');

            return res.redirect('/login');

        } catch (error) {
            logger.error('Forgot Password Error: ' + error.message);

            req.flash('error', 'An error occurred. Please try again.');

            return res.redirect('/forgot-password');
        }
    }

    async resetPassword(req, res) {
        try {
            const { token } = req.params;
            const { password } = req.body;

            const user = await User.findOne({
                resetPasswordToken: token,
                resetPasswordExpires: { $gt: Date.now() }
            });

            if (!user) {
                req.flash('error', 'Password reset token is invalid or has expired.');
                return res.redirect('/forgot-password');
            }

            const hashedPassword = await bcrypt.hash(password, 12);
            user.password = hashedPassword;
            user.resetPasswordToken = null;
            user.resetPasswordExpires = null;
            await user.save();

            logger.info(`Password reset successful: ${user.email}`);
            req.flash('success', 'Success! Your password has been changed. You can now login.');
            return res.redirect('/login');

        } catch (error) {
            logger.error('Reset Password Error: ' + error.message);

            req.flash('error', 'An error occurred. Please try again.');

            return res.redirect('/forgot-password');
        }
    }
}

module.exports = new AuthController();