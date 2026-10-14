import nodemailer from 'nodemailer';
import net from 'node:net';
import { Resend } from 'resend';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Email Service (Transactional Delivery)
 *
 * Primary Password-Reset Delivery: Resend HTTPS API (bypasses container egress firewall blocks on ports 465/587).
 * Fallback & General Email Delivery: Nodemailer SMTP (configured with IPv4 TCP sockets).
 * Testing/Dev Mode: In-memory test queue with zero unmocked network egress.
 */

// In-memory email store for testing and local verification
const sentEmailsQueue = [];

let cachedTransporter = null;
let cachedResendClient = null;

/**
 * Strips sensitive credentials (API keys, SMTP passwords) from error messages
 * before logging or propagating to callers.
 *
 * @param {string} msg - Error message to sanitize
 * @returns {string} Sanitized message with sensitive tokens redacted
 */
export const sanitizeErrorMessage = (msg) => {
  if (!msg || typeof msg !== 'string') return 'Unknown error';
  let sanitized = msg;
  if (env.RESEND_API_KEY && env.RESEND_API_KEY.length > 5) {
    sanitized = sanitized.replaceAll(env.RESEND_API_KEY, '[REDACTED_API_KEY]');
  }
  if (env.SMTP_PASS && env.SMTP_PASS.length > 3) {
    sanitized = sanitized.replaceAll(env.SMTP_PASS, '[REDACTED_SMTP_PASS]');
  }
  return sanitized;
};

/**
 * Resets cached transporter (useful for isolated testing of environment changes).
 */
export const resetTransporterCache = () => {
  cachedTransporter = null;
};

/**
 * Resets cached Resend client (useful for isolated testing of environment changes).
 */
export const resetResendClientCache = () => {
  cachedResendClient = null;
};

/**
 * Explicitly sets the cached Resend client instance (for mock injection in tests).
 *
 * @param {Object|null} client - Custom/mocked Resend client instance
 */
export const setResendClient = (client) => {
  cachedResendClient = client;
};

/**
 * Initializes or returns the cached Resend HTTPS client.
 * Returns null if RESEND_API_KEY is not configured.
 *
 * @returns {Resend|null}
 */
export const getResendClient = () => {
  if (cachedResendClient) {
    return cachedResendClient;
  }

  const rawKey = env.RESEND_API_KEY ? env.RESEND_API_KEY.trim() : '';
  if (rawKey) {
    cachedResendClient = new Resend(rawKey);
    return cachedResendClient;
  }

  return null;
};

/**
 * Creates an outbound IPv4 TCP connection socket for Nodemailer SMTP.
 *
 * Enforces `family: 4` to prevent Nodemailer from attempting unreachable
 * IPv6 addresses in container/cloud environments lacking an outbound IPv6 route (e.g. Railway).
 * Bounded by connectionTimeout with clean error and timeout propagation.
 *
 * @param {Object} options - Nodemailer connection options
 * @param {Function} callback - Node callback (err, socketOptions)
 */
export const createIpv4Socket = (options, callback) => {
  const timeoutMs = Number(options.connectionTimeout) || 10000;
  let finished = false;
  let socket = null;

  const onConnectError = (err) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    if (socket) {
      socket.destroy();
    }
    callback(err);
  };

  const timer = setTimeout(() => {
    if (finished) return;
    finished = true;
    if (socket) {
      socket.removeListener('error', onConnectError);
      socket.destroy();
    }
    const err = new Error('Connection timeout');
    err.code = 'ETIMEDOUT';
    callback(err);
  }, timeoutMs);

  try {
    socket = net.connect({
      host: options.host || env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(options.port) || Number(env.SMTP_PORT) || 587,
      family: 4
    });

    socket.once('connect', () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      socket.removeListener('error', onConnectError);
      callback(null, { connection: socket });
    });

    socket.once('error', onConnectError);
  } catch (err) {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    callback(err);
  }
};

/**
 * Initializes or returns the cached Nodemailer SMTP transporter.
 * @returns {nodemailer.Transporter|null}
 */
export const getTransporter = () => {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  const rawHost = env.SMTP_HOST || 'smtp.gmail.com';
  const rawUser = env.SMTP_USER || '';
  const rawPass = env.SMTP_PASS || '';

  const cleanUser = rawUser ? rawUser.trim() : '';
  const cleanPass = rawPass ? rawPass.replace(/["']/g, '').replace(/\s+/g, '') : '';

  if (rawHost && cleanUser && cleanPass) {
    const transportConfig = {
      host: rawHost,
      port: Number(env.SMTP_PORT) || 587,
      secure: Boolean(env.SMTP_SECURE),
      auth: {
        user: cleanUser,
        pass: cleanPass
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      tls: {
        rejectUnauthorized: true
      },
      getSocket: createIpv4Socket
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
/**
 * Validates and sanitizes requesting frontend URL against trusted domains to prevent reset-link poisoning.
 * Canonical fallback: https://school-trio-final-frontend.vercel.app (or local dev URL in non-production).
 *
 * @param {string|null} candidateUrl
 * @returns {string} Sanitized trusted frontend base URL (no trailing slash)
 */
export const getTrustedFrontendUrl = (candidateUrl = null) => {
  const canonicalProduction = 'https://school-trio-final-frontend.vercel.app';
  const canonicalLocal = env.FRONTEND_URL || 'http://localhost:5173';
  const defaultFallback = env.isProduction ? canonicalProduction : canonicalLocal;

  if (!candidateUrl || typeof candidateUrl !== 'string' || !candidateUrl.trim()) {
    return defaultFallback;
  }

  const clean = candidateUrl.trim().replace(/\/+$/, '');
  let parsed;
  try {
    parsed = new globalThis.URL(clean);
  } catch {
    return defaultFallback;
  }

  const origin = parsed.origin;
  const hostname = parsed.hostname.toLowerCase();

  // 1. Local development origins: never allow localhost in production; prefer configured live FRONTEND_URL
  const isLocalOrigin = (
    origin === 'http://localhost:5173' ||
    origin === 'http://localhost:3000' ||
    origin === 'http://127.0.0.1:5173' ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1'
  );

  if (isLocalOrigin) {
    if (env.isProduction || (env.FRONTEND_URL && !env.FRONTEND_URL.includes('localhost') && !env.isTest)) {
      return defaultFallback;
    }
    return origin;
  }

  // 2. Allow verified production deployment domain
  if (
    origin === canonicalProduction ||
    hostname === 'school-trio-final-frontend.vercel.app'
  ) {
    return canonicalProduction;
  }

  // 3. Allow verified custom domain (.teamzuna.in)
  if (
    hostname === 'schooltrio.teamzuna.in' ||
    hostname === 'teamzuna.in' ||
    hostname.endsWith('.teamzuna.in')
  ) {
    return origin;
  }

  // 4. Strict check against explicit CORS origins
  if (Array.isArray(env.parsedCorsOrigins) && env.parsedCorsOrigins.length > 0) {
    const isAllowed = env.parsedCorsOrigins.some(allowed => {
      const cleanAllowed = allowed.toLowerCase().trim().replace(/\/+$/, '');
      if (cleanAllowed === '*') return false; // wildcard cannot be an email reset domain
      if (cleanAllowed.startsWith('*.')) {
        return hostname.endsWith(cleanAllowed.slice(1));
      }
      return cleanAllowed === origin.toLowerCase();
    });
    if (isAllowed) {
      return origin;
    }
  }

  // Reject untrusted origins (e.g. arbitrary phishing domains) and use default
  logger.warn({
    msg: '[EMAIL SERVICE] Untrusted candidate frontendUrl rejected; using default fallback',
    candidateUrl: clean,
    fallbackUrl: defaultFallback
  });

  return defaultFallback;
};

/**
 * Generic mail dispatcher via Nodemailer Gmail/SMTP transport.
 *
 * @param {Object} options
 * @param {string|string[]} options.to - Recipient email(s)
 * @param {string} options.subject - Subject line
 * @param {string} [options.html] - HTML body
 * @param {string} [options.text] - Plaintext body
 * @param {string} [options.from] - Sender address
 * @returns {Promise<{ success: boolean, messageId: string, provider: string }>}
 */
export const sendMail = async ({ to, subject, html, text, from = env.SMTP_FROM }) => {
  const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const recipientStr = Array.isArray(to) ? to.join(', ') : to;

  let resolvedFrom = from || env.SMTP_FROM || 'School Management System';
  if (env.SMTP_USER && !resolvedFrom.includes('@')) {
    resolvedFrom = `"${resolvedFrom.replace(/"/g, '')}" <${env.SMTP_USER}>`;
  }

  const emailRecord = {
    messageId,
    from: resolvedFrom,
    to: recipientStr,
    subject,
    html,
    text,
    sentAt: new Date()
  };

  sentEmailsQueue.push(emailRecord);

  // In test mode, capture in memory queue and return immediately without network egress
  if (env.isTest) {
    logger.info({
      msg: '[EMAIL SERVICE] Email captured in queue (test mode)',
      messageId,
      recipient: maskEmail(recipientStr),
      subject
    });
    return { success: true, messageId, provider: 'mock' };
  }

  // Pure Nodemailer SMTP dispatch
  const transporter = getTransporter();
  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from: resolvedFrom,
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

      return { success: true, messageId: info.messageId || messageId, provider: 'smtp' };
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

  // Fallback dev mode without configured credentials
  if (!env.isProduction) {
    logger.info({
      msg: '[EMAIL SERVICE] Email captured in queue (mock/dev mode - SMTP unconfigured)',
      messageId,
      recipient: maskEmail(recipientStr),
      subject
    });
    return { success: true, messageId, provider: 'mock' };
  }

  throw new Error('SMTP credentials are not configured on production server');
};

/**
 * Resolves, normalizes, and validates the sender address for Resend delivery.
 *
 * Requirements & Fallback rules:
 * 1. Resend requires the format `email@domain.com` or `Display Name <email@domain.com>`.
 * 2. Unverified public free-mail domains (@gmail.com, @yahoo.com, etc.) cannot be verified
 *    in Resend and are permanently rejected by Resend API.
 * 3. In such cases or when unconfigured, automatically resolves to the verified custom domain
 *    `School Trio <noreply@teamzuna.in>`.
 *
 * @param {string|null} fromInput - Candidate sender address
 * @returns {string} Fully normalized sender address valid for Resend delivery
 */
export const resolveResendSender = (fromInput = null) => {
  const candidate = fromInput !== undefined && fromInput !== null
    ? String(fromInput).trim()
    : (env.RESEND_FROM_EMAIL || '').trim();

  if (!candidate) {
    return null;
  }

  // Extract display name and email address if separated without angle brackets
  // e.g. "SchholTrio carrezzaglobalsolutions@gmail.com"
  let displayName = '';
  let emailAddress = '';

  const angleMatch = candidate.match(/^(.*?)\s*<([^>]+)>$/);
  if (angleMatch) {
    displayName = angleMatch[1].trim();
    emailAddress = angleMatch[2].trim();
  } else {
    const spaceMatch = candidate.match(/^(.+?)\s+([^\s@]+@[^\s@]+)$/);
    if (spaceMatch) {
      displayName = spaceMatch[1].trim();
      emailAddress = spaceMatch[2].trim();
    } else {
      emailAddress = candidate;
    }
  }

  const atIndex = emailAddress.indexOf('@');
  if (atIndex === -1) {
    return candidate;
  }

  const domain = emailAddress.slice(atIndex + 1).toLowerCase();
  const unverifiedPublicDomains = ['gmail.com', 'googlemail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com'];

  if (unverifiedPublicDomains.includes(domain)) {
    logger.warn({
      msg: `[EMAIL SERVICE] Configured sender email uses public domain '${domain}' which cannot be verified on Resend; resolving to verified domain 'teamzuna.in'`,
      candidate
    });
    return displayName ? `${displayName.replace(/["']/g, '')} <noreply@teamzuna.in>` : 'School Trio <noreply@teamzuna.in>';
  }

  if (displayName) {
    return `${displayName.replace(/["']/g, '')} <${emailAddress}>`;
  }
  return emailAddress;
};

/**
 * Dispatches an email via Resend HTTPS REST API.
 * Used exclusively for password reset delivery to bypass container egress firewall blocks on ports 465/587.
 *
 * Enforces an explicit 10-second request timeout via AbortSignal.timeout(10000).
 * Sanitizes provider errors and logs to prevent credential leakage.
 *
 * @param {Object} options
 * @param {string|string[]} options.to - Recipient email(s)
 * @param {string} options.subject - Subject line
 * @param {string} [options.html] - HTML body
 * @param {string} [options.text] - Plaintext body
 * @param {string} [options.from] - Sender address (defaults to env.RESEND_FROM_EMAIL)
 * @returns {Promise<{ success: boolean, messageId: string, provider: string }>}
 */
export const sendViaResend = async ({ to, subject, html, text, from = env.RESEND_FROM_EMAIL }) => {
  const apiKey = env.RESEND_API_KEY ? env.RESEND_API_KEY.trim() : '';
  const fromEmail = resolveResendSender(from);

  if (!apiKey) {
    const err = new Error('Resend API key is not configured (RESEND_API_KEY is missing)');
    logger.error({
      msg: '[EMAIL SERVICE] Resend delivery rejected: missing RESEND_API_KEY',
      provider: 'resend'
    });
    throw err;
  }

  if (!fromEmail) {
    const err = new Error('Resend sender email is not configured (RESEND_FROM_EMAIL is missing)');
    logger.error({
      msg: '[EMAIL SERVICE] Resend delivery rejected: missing RESEND_FROM_EMAIL',
      provider: 'resend'
    });
    throw err;
  }

  const resend = getResendClient();
  if (!resend) {
    const err = new Error('Failed to initialize Resend client');
    logger.error({
      msg: '[EMAIL SERVICE] Resend client initialization failed',
      provider: 'resend'
    });
    throw err;
  }

  const recipientStr = Array.isArray(to) ? to.join(', ') : to;

  // Record payload in sentEmailsQueue for testing & verification
  const emailRecord = {
    messageId: '',
    from: fromEmail,
    to: recipientStr,
    subject,
    html,
    text,
    sentAt: new Date(),
    provider: 'resend'
  };

  try {
    const payload = {
      from: fromEmail,
      to: recipientStr,
      subject,
      html,
      text
    };

    const response = await resend.emails.send(payload, {
      signal: globalThis.AbortSignal?.timeout ? globalThis.AbortSignal.timeout(10000) : undefined
    });

    if (response?.error) {
      const rawErrorMsg = response.error.message || 'Resend provider rejected email delivery';
      const sanitizedErrorMsg = sanitizeErrorMessage(rawErrorMsg);

      logger.error({
        msg: '[EMAIL SERVICE] Resend provider rejected email delivery',
        recipient: maskEmail(recipientStr),
        error: sanitizedErrorMsg,
        statusCode: response.error.statusCode || null,
        provider: 'resend'
      });

      const err = new Error(`Resend delivery rejected: ${sanitizedErrorMsg}`);
      if (response.error.statusCode) {
        err.statusCode = response.error.statusCode;
      }
      throw err;
    }

    const messageId = response?.data?.id || `resend_${Date.now()}`;
    emailRecord.messageId = messageId;
    sentEmailsQueue.push(emailRecord);

    logger.info({
      msg: '[EMAIL SERVICE] Email dispatched successfully via Resend HTTPS API',
      messageId,
      recipient: maskEmail(recipientStr),
      subject,
      provider: 'resend'
    });

    return {
      success: true,
      messageId,
      provider: 'resend'
    };
  } catch (err) {
    const rawMsg = err.name === 'TimeoutError' || err.message?.includes('timeout')
      ? 'Resend API request timed out after 10000ms'
      : err.message || 'Unknown Resend delivery error';

    const sanitizedMsg = sanitizeErrorMessage(rawMsg);

    logger.error({
      msg: '[EMAIL SERVICE] Failed to deliver email via Resend HTTPS API',
      recipient: maskEmail(recipientStr),
      error: sanitizedMsg,
      provider: 'resend'
    });

    const safeError = new Error(sanitizedMsg);
    if (err.statusCode) {
      safeError.statusCode = err.statusCode;
    }
    throw safeError;
  }
};

/**
 * Dispatches a password reset email to a user via Resend HTTPS API.
 * Active delivery path for password reset workflows.
 *
 * @param {Object} params
 * @param {string} params.to - Recipient email address
 * @param {string} params.resetToken - Raw 64-character hex reset token
 * @param {string} [params.schoolName] - Optional school tenant name
 * @param {string|null} [params.frontendUrl] - Requesting frontend URL
 * @returns {Promise<{ success: boolean, messageId: string, provider: string }>}
 */
export const sendPasswordResetEmail = async ({ to, resetToken, schoolName = 'School Management System', frontendUrl = null }) => {
  const baseUrl = getTrustedFrontendUrl(frontendUrl);
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

  // Active path: Dispatches via Resend HTTPS API (bypassing blocked SMTP egress ports 465/587)
  return sendViaResend({
    to,
    subject,
    html,
    text
  });
};

/**
 * Fallback password reset email dispatcher via Gmail SMTP.
 * Kept intact as a documented, manually switchable fallback option.
 *
 * CRITICAL: Automatic fallback from Resend to SMTP is intentionally NOT performed
 * upon Resend error to prevent duplicate email dispatches (e.g. if Resend accepted the request
 * before a client-side timeout occurred).
 */
export const sendPasswordResetEmailViaSmtp = async ({ to, resetToken, schoolName = 'School Management System', frontendUrl = null }) => {
  const baseUrl = getTrustedFrontendUrl(frontendUrl);
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
 * @param {string|null} [params.frontendUrl] - Requesting frontend URL
 * @returns {Promise<{ success: boolean, messageId: string }>}
 */
export const sendPasswordSetupEmail = async ({ to, setupToken, schoolName = 'School Management System', frontendUrl = null }) => {
  const baseUrl = getTrustedFrontendUrl(frontendUrl);
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

