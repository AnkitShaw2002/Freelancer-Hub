const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

let transporter = null;
const FORCE_EMAIL_TO = process.env.FORCE_EMAIL_TO || (process.env.NODE_ENV === 'test' ? 'test@yopmail.com' : '');

function getTransporter() {
    if (process.env.NODE_ENV === 'test') {
        logger.info('Email transport disabled in test environment');
        return null;
    }
    if (transporter) return transporter;
    if (!process.env.MAIL_HOST || !process.env.MAIL_USER || !process.env.MAIL_PASS) return null;

    transporter = nodemailer.createTransport({
        host: process.env.MAIL_HOST,
        port: Number(process.env.MAIL_PORT) || 587,
        secure: false,
        auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS }
    });
    return transporter;
}

async function send(to, subject, html) {
    const recipient = FORCE_EMAIL_TO || to;
    const t = getTransporter();
    if (!t) {
        logger.info(`[EMAIL - no SMTP] TO: ${recipient} | SUBJECT: ${subject}`);
        return;
    }
    try {
        const from = process.env.MAIL_FROM || `"FreelancerHub" <${process.env.MAIL_USER}>`;
        await t.sendMail({ from, to: recipient, subject, html });
    } catch (err) {
        logger.error('Email send failed: ' + err.message);
    }
}

function baseTemplate(body) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f3f4f6;margin:0;padding:0;}
.wrapper{max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);}
.header{background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:28px 32px;color:#fff;}
.header h2{margin:0;font-size:1.3rem;font-weight:700;}
.header p{margin:4px 0 0;opacity:.85;font-size:.88rem;}
.body{padding:28px 32px;}
.body p{color:#374151;line-height:1.6;margin:0 0 14px;}
.btn{display:inline-block;background:#6366f1;color:#fff!important;text-decoration:none;padding:11px 26px;border-radius:8px;font-weight:600;font-size:.9rem;margin:8px 0;}
.footer{padding:18px 32px;background:#f9fafb;font-size:.78rem;color:#9ca3af;border-top:1px solid #e5e7eb;}
.tag{display:inline-block;background:#ede9fe;color:#6d28d9;padding:3px 10px;border-radius:99px;font-size:.78rem;font-weight:600;}
</style></head><body>
<div class="wrapper">
  <div class="header"><h2>💼 FreelancerHub</h2><p>AI-Powered Freelance Marketplace</p></div>
  <div class="body">${body}</div>
  <div class="footer">You received this email because you have an account on FreelancerHub.<br>&copy; ${new Date().getFullYear()} FreelancerHub. All rights reserved.</div>
</div></body></html>`;
}

exports.sendVerificationEmail = async (user, verifyLink) => {
    const subject = 'Verify Your Email - FreelancerHub';
    const html = baseTemplate(`
        <p>Hi <strong>${user.displayName}</strong>,</p>
        <p>Thank you for registering. Please click the button below to verify your email address:</p>
        <a href="${verifyLink}" class="btn">Verify Account →</a>
        <p>This link will expire in 24 hours.</p>
        <p>If you did not sign up, please ignore this email.</p>
    `);
    await send(user.email, subject, html);
};

exports.sendNewBidEmail = async ({ clientEmail, clientName, freelancerName, projectTitle, projectId, bidAmount }) => {
    const subject = `New bid on your project: ${projectTitle}`;
    const html = baseTemplate(`
        <p>Hi <strong>${clientName}</strong>,</p>
        <p><strong>${freelancerName}</strong> has placed a bid on your project:</p>
        <p><span class="tag">₹${bidAmount}</span></p>
        <p style="font-size:1.05rem;font-weight:600;color:#1f2937;">"${projectTitle}"</p>
        <p>Review the proposal and decide whether to accept or reject the bid.</p>
        <a href="${process.env.BASE_URL}/projects/${projectId}" class="btn">View Bids →</a>
    `);
    await send(clientEmail, subject, html);
};

exports.sendBidAwardedEmail = async ({ freelancerEmail, freelancerName, clientName, projectTitle, projectId, amount }) => {
    const subject = `🎉 You've been awarded: ${projectTitle}`;
    const html = baseTemplate(`
        <p>Hi <strong>${freelancerName}</strong>,</p>
        <p>Great news! <strong>${clientName}</strong> has awarded you the project:</p>
        <p style="font-size:1.05rem;font-weight:600;color:#1f2937;">"${projectTitle}"</p>
        <p><span class="tag">₹${amount}</span></p>
        <p>Please reach out to the client to discuss next steps.</p>
        <a href="${process.env.BASE_URL}/projects/${projectId}" class="btn">View Project →</a>
    `);
    await send(freelancerEmail, subject, html);
};

exports.sendProjectCompletedEmail = async ({ email, name, role, projectTitle, projectId, amount }) => {
    const subject = `Project completed: ${projectTitle}`;
    const isFreelancer = role === 'freelancer';
    const html = baseTemplate(`
        <p>Hi <strong>${name}</strong>,</p>
        <p>The project <strong>"${projectTitle}"</strong> has been marked as <span class="tag">completed</span>.</p>
        ${isFreelancer ? `<p>Payment of <strong>₹${amount}</strong> has been credited to your wallet.</p>` : `<p>The work has been delivered. We hope you are satisfied!</p>`}
        <a href="${process.env.BASE_URL}/projects/${projectId}" class="btn">${isFreelancer ? 'View Project' : 'Leave a Review'} →</a>
    `);
    await send(email, subject, html);
};

exports.sendGenericEmail = async ({ email, name, subject, message, link, linkText }) => {
    const html = baseTemplate(`
        <p>Hi <strong>${name}</strong>,</p>
        <p>${message}</p>
        ${link ? `<a href="${link}" class="btn">${linkText || 'View Details'} →</a>` : ''}
    `);
    await send(email, subject, html);
};
exports.sendResetPasswordEmail = async (user, resetLink) => {
    const subject = 'Reset Your Password - FreelancerHub';
    const html = baseTemplate(`
        <p>Hi <strong>${user.displayName}</strong>,</p>
        <p>You requested a password reset. Please click the button below to set a new password:</p>
        <a href="${resetLink}" class="btn">Reset Password →</a>
        <p>This link will expire in 1 hour.</p>
        <p>If you did not request this, please ignore this email and your password will remain unchanged.</p>
    `);
    await send(user.email, subject, html);
};
