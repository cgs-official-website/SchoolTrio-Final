import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Email Service (Nodemailer SMTP Delivery)
 *
 * Handles transactional email dispatch for authentication workflows (password reset, account setup, alerts).
 * Configures an SMTP transport when SMTP_HOST is present; falls back to an in-memory test queue in test/dev.
 */

// In-memory email store for testing and local verification
const sentEmailsQueue = [];

let cachedTransporter = null;

/**
 * Initializes or returns the cached Nodemailer SMTP transporter.
 * @returns {nodemailer.Transporter|null}
 */
export const getTransporter = () => {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  if (env.SMTP_HOST) {
    const transportConfig = {
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT) || 587,
      secure: Boolean(env.SMTP_SECURE),
      auth: (env.SMTP_USER && env.SMTP_PASS)
        ? {
            user: env.SMTP_USER,
            pass: env.SMTP_PASS
          }
        : undefined,
      tls: {
        rejectUnauthorized: env.isProduction
      }
    };

    cachedTransporter = nodemailer.createTransport(transportConfig);
    return cachedTransporter;
  }

  return null;
};

/**
 * Verifies the SMTP connection if credentials are configured.
 * @returns {Promise<boolean>}
 */
export const verifySmtpConnection = async () => {
  const transporter = getTransporter();
  if (!transporter) {
    return false;
  }
  try {
    await transporter.verify();
    return true;
  } catch (err) {
    logger.error({ msg: '[EMAIL SERVICE] SMTP connection verification failed', error: err.message });
    return false;
  }
};

/**
 * Masks an email address for safe log output.
 * Example: "priyanka.s@springmount.co.in" -> "p***s@springmount.co.in"
 *
 * @param {string} email - Email address to mask
 * @returns {string} Masked email
 */
export const maskEmail = (email) => {
  if (!email || typeof email !== 'string') return '***';
  const parts = email.split('@');
  if (parts.length !== 2) return '***';
  const [local, domain] = parts;
  if (local.length <= 2) return `${local[0] || '*'}***@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
};

/**
 * Standard responsive HTML email layout wrapper.
 */
const wrapEmailHtml = (title, content, schoolName = 'School Management System') => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; padding: 20px; margin: 0; }
    .container { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .header { background-color: #4f46e5; padding: 24px; text-align: center; color: #ffffff; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; }
    .content { padding: 32px 24px; color: #334155; line-height: 1.6; font-size: 15px; }
    .btn { display: inline-block; background-color: #4f46e5; color: #ffffff !important; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; margin: 20px 0; text-align: center; }
    .footer { padding: 20px; text-align: center; font-size: 13px; color: #94a3b8; border-top: 1px solid #f1f5f9; background: #f8fafc; }
    .muted { font-size: 13px; color: #64748b; word-break: break-all; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${schoolName}</h1>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} ${schoolName}. All rights reserved.
    </div>
  </div>
</body>
</html>`;

/**
 * Generic mail dispatcher via Nodemailer.
 *
 * @param {Object} options
 * @param {string|string[]} options.to - Recipient email(s)
 * @param {string} options.subject - Subject line
 * @param {string} [options.html] - HTML body
 * @param {string} [options.text] - Plaintext body
 * @param {string} [options.from] - Sender address
 * @returns {Promise<{ success: boolean, messageId: string }>}
 */
export const sendMail = async ({ to, subject, html, text, from = env.SMTP_FROM }) => {
  const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const recipientStr = Array.isArray(to) ? to.join(', ') : to;

  const emailRecord = {
    messageId,
    from,
    to: recipientStr,
    subject,
    html,
    text,
    sentAt: new Date()
  };

  sentEmailsQueue.push(emailRecord);

  const transporter = getTransporter();

  if (transporter && !env.isTest) {
    try {
      const info = await transporter.sendMail({
        from,
        to: recipientStr,
        subject,
        html,
        text
      });

      logger.info({
        msg: '[EMAIL SERVICE] Email dispatched via SMTP',
        messageId: info.messageId || messageId,
        recipient: maskEmail(recipientStr),
        subject
      });

      return { success: true, messageId: info.messageId || messageId };
    } catch (err) {
      logger.error({
        msg: '[EMAIL SERVICE] Failed to send email via SMTP',
        recipient: maskEmail(recipientStr),
        subject,
        error: err.message
      });
      throw err;
    }
  }

  // Safe logging in dev / test mode without active SMTP
  logger.info({
    msg: '[EMAIL SERVICE] Email captured in queue (mock/dev mode)',
    messageId,
    recipient: maskEmail(recipientStr),
    subject
  });

  return { success: true, messageId };
};

/**
 * Dispatches a password reset email to a user.
 *
 * @param {Object} params
 * @param {string} params.to - Recipient email address
 * @param {string} params.resetToken - Raw 64-character hex reset token
 * @param {string} [params.schoolName] - Optional school tenant name
 * @returns {Promise<{ success: boolean, messageId: string }>}
 */
export const sendPasswordResetEmail = async ({ to, resetToken, schoolName = 'School Management System' }) => {
  const baseUrl = env.FRONTEND_URL || 'https://app.sms.com';
  const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;
  const subject = `Password Reset Request - ${schoolName}`;

  const htmlContent = `
    <h2 style="margin-top:0; color:#1e293b;">Password Reset Request</h2>
    <p>We received a request to reset the password for your account at <strong>${schoolName}</strong>.</p>
    <p>Click the button below to choose a new password:</p>
    <p style="text-align: center;">
      <a href="${resetUrl}" class="btn">Reset Password</a>
    </p>
    <p class="muted">If the button doesn't work, copy and paste this link into your browser:<br><a href="${resetUrl}" style="color:#4f46e5;">${resetUrl}</a></p>
    <p class="muted">This link is valid for 1 hour. If you did not request this, you can safely ignore this email.</p>
  `;

  const html = wrapEmailHtml('Password Reset Request', htmlContent, schoolName);
  const text = `Password Reset Request - ${schoolName}\n\nWe received a request to reset your password. Use the following link to reset your password:\n${resetUrl}\n\nThis link expires in 1 hour.`;

  return sendMail({
    to,
    subject,
    html,
    text
  });
};

/**
 * Dispatches a first-time password setup invitation email.
 *
 * @param {Object} params
 * @param {string} params.to - Recipient email address
 * @param {string} params.setupToken - Raw 64-character hex setup token
 * @param {string} [params.schoolName] - Optional school tenant name
 * @returns {Promise<{ success: boolean, messageId: string }>}
 */
export const sendPasswordSetupEmail = async ({ to, setupToken, schoolName = 'School Management System' }) => {
  const baseUrl = env.FRONTEND_URL || 'https://app.sms.com';
  const setupUrl = `${baseUrl}/setup-password?token=${setupToken}`;
  const subject = `Account Setup Invitation - ${schoolName}`;

  const htmlContent = `
    <h2 style="margin-top:0; color:#1e293b;">Welcome to ${schoolName}</h2>
    <p>An account has been created for you on the school portal. To activate your account and create a password, please click the button below:</p>
    <p style="text-align: center;">
      <a href="${setupUrl}" class="btn">Set Up Password</a>
    </p>
    <p class="muted">If the button doesn't work, copy and paste this link into your browser:<br><a href="${setupUrl}" style="color:#4f46e5;">${setupUrl}</a></p>
    <p class="muted">This invitation is secure and will expire in 7 days.</p>
  `;

  const html = wrapEmailHtml('Account Setup Invitation', htmlContent, schoolName);
  const text = `Account Setup Invitation - ${schoolName}\n\nWelcome to ${schoolName}. Please set up your password using the following link:\n${setupUrl}\n\nThis link is valid for 7 days.`;

  return sendMail({
    to,
    subject,
    html,
    text
  });
};

/**
 * Retrieves in-memory sent emails for test verification.
 * @returns {Array<Object>} Copy of dispatched emails array
 */
export const getSentEmails = () => [...sentEmailsQueue];

/**
 * Clears in-memory sent emails queue (useful between test runs).
 */
export const clearSentEmails = () => {
  sentEmailsQueue.length = 0;
};

