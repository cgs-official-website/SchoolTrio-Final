import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Email Service Abstraction
 *
 * Handles transactional email dispatch for authentication workflows (password reset, account setup).
 * In test/development, captures dispatched emails in-memory and logs safe metadata without leaking tokens.
 */

// In-memory email store for testing and local verification
const sentEmailsQueue = [];

/**
 * Masks an email address for safe log output.
 * Example: "priyanka.s@springmount.co.in" -> "p***s@springmount.co.in"
 *
 * @param {string} email - Email address to mask
 * @returns {string} Masked email
 */
const maskEmail = (email) => {
  if (!email || typeof email !== 'string') return '***';
  const parts = email.split('@');
  if (parts.length !== 2) return '***';
  const [local, domain] = parts;
  if (local.length <= 2) return `${local[0] || '*'}***@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
};

/**
 * Dispatches a password reset email to a user.
 *
 * @param {Object} params
 * @param {string} params.to - Recipient email address
 * @param {string} params.resetToken - Raw 64-character hex reset token (held in memory only for delivery)
 * @param {string} [params.schoolName] - Optional school tenant name
 * @returns {Promise<{ success: boolean, messageId: string }>}
 */
export const sendPasswordResetEmail = async ({ to, resetToken, schoolName = 'School Management System' }) => {
  const baseUrl = env.FRONTEND_URL || 'https://app.sms.com';
  const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;
  const messageId = `msg_reset_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  const emailPayload = {
    messageId,
    to,
    template: 'PASSWORD_RESET',
    subject: `Password Reset Request - ${schoolName}`,
    schoolName,
    resetUrl,
    sentAt: new Date()
  };

  // Capture in memory for testing/verification
  sentEmailsQueue.push(emailPayload);

  // Safe logging: log recipient domain/masked address and template without raw token or URL
  logger.info({
    msg: '[EMAIL SERVICE] Password reset email dispatched',
    messageId,
    recipient: maskEmail(to),
    template: 'PASSWORD_RESET',
    schoolName
  });

  return { success: true, messageId };
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
  const messageId = `msg_setup_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  const emailPayload = {
    messageId,
    to,
    template: 'PASSWORD_SETUP',
    subject: `Account Setup Invitation - ${schoolName}`,
    schoolName,
    setupUrl,
    sentAt: new Date()
  };

  sentEmailsQueue.push(emailPayload);

  logger.info({
    msg: '[EMAIL SERVICE] Password setup email dispatched',
    messageId,
    recipient: maskEmail(to),
    template: 'PASSWORD_SETUP',
    schoolName
  });

  return { success: true, messageId };
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
