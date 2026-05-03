const transporter = require('../config/emailConfig');
require('dotenv').config();


// Send email verification link
const sendEmail = async (user) => {
    const verifyLink = `${process.env.BASE_URL}/verify/${user.verificationToken}`;
    console.log('Verification Link:', verifyLink);

    await transporter.sendMail({
        from: process.env.MAIL_FROM,
        to: user.email,
        subject: "Verify Your Email - Freelancer Hub",
        html: `
            <h2>Hello ${user.displayName},</h2>
            <p>Thank you for registering. Please click the link below to verify your email address:</p>
            <a href="${verifyLink}" style="background:#4F46E5;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">Verify Account</a>
            <p>This link will expire in 24 hours.</p>
            <p>If you did not sign up, please ignore this email.</p>
        `
    });
};

module.exports = sendEmail;