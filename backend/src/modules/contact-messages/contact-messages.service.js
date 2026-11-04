import * as repository from './contact-messages.repository.js';
import { sendMail, sendViaResend, sanitizeErrorMessage } from '../../services/email.service.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

export class NotFoundError extends Error {
  constructor(message = 'Contact message not found') {
    super(message);
    this.name = 'NotFoundError';
    this.status = 404;
  }
}

/**
 * Submits and persists a new contact message inquiry from the public website.
 */
export const submitMessage = async ({ name, email, subject, message }, { ipAddress, userAgent } = {}) => {
  const sanitizedName = name.trim();
  const sanitizedEmail = email.trim().toLowerCase();
  const sanitizedMessage = message.trim();
  const sanitizedSubject = subject ? subject.trim() : null;

  const created = await repository.createMessage({
    name: sanitizedName,
    email: sanitizedEmail,
    subject: sanitizedSubject,
    message: sanitizedMessage,
    ipAddress,
    userAgent
  });

  logger.info({
    msg: '[CONTACT MESSAGE] New public inquiry received',
    id: created.id,
    email: sanitizedEmail,
    name: sanitizedName
  });

  return created;
};

/**
 * Retrieves paginated contact messages and summary stats for SuperAdmin.
 */
export const listMessages = async (query = {}) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
  const skip = (page - 1) * limit;

  const { search, status, sortBy = 'createdAt', sortOrder = 'desc' } = query;

  const [{ messages, total }, stats] = await Promise.all([
    repository.getMessages({
      search,
      status,
      sortBy,
      sortOrder,
      skip,
      take: limit
    }),
    repository.getMessageStats()
  ]);

  const totalPages = Math.ceil(total / limit) || 1;

  return {
    messages,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    },
    stats
  };
};

/**
 * Retrieves a single contact message with its full reply history.
 */
export const getMessageById = async (id) => {
  const message = await repository.getMessageById(id);
  if (!message) {
    throw new NotFoundError(`Contact message with ID '${id}' not found.`);
  }
  return message;
};

/**
 * Updates status of a contact message.
 */
export const updateMessageStatus = async (id, status) => {
  const existing = await repository.getMessageById(id);
  if (!existing) {
    throw new NotFoundError(`Contact message with ID '${id}' not found.`);
  }

  const updated = await repository.updateStatus(id, status);

  logger.info({
    msg: '[CONTACT MESSAGE] Status updated',
    id,
    previousStatus: existing.status,
    newStatus: status
  });

  return updated;
};

/**
 * Handles Super Admin replying to a contact message and dispatching email.
 */
export const replyToMessage = async (id, replyText, user = {}) => {
  const message = await repository.getMessageById(id);
  if (!message) {
    throw new NotFoundError(`Contact message with ID '${id}' not found.`);
  }

  const adminName = user.name || user.email?.split('@')[0] || 'SuperAdmin';
  const adminId = user.id || null;

  let emailDeliveryStatus = 'pending';
  let emailDeliveryError = null;

  const subject = `Re: ${message.subject || 'Your inquiry to School Management'}`;
  const htmlBody = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; color: #1e293b;">
      <h2 style="color: #6366f1; margin-top: 0;">School Management Support</h2>
      <p>Dear <strong>${escapeHtml(message.name)}</strong>,</p>
      <p>Thank you for reaching out to us. In response to your inquiry:</p>
      
      <blockquote style="margin: 16px 0; padding: 12px 16px; background: #f8fafc; border-left: 4px solid #cbd5e1; color: #475569; font-style: italic; border-radius: 4px;">
        "${escapeHtml(message.message)}"
      </blockquote>

      <div style="margin: 20px 0; padding: 16px; background: #f1f5f9; border-radius: 8px;">
        <p style="margin: 0; font-weight: 600; color: #0f172a; margin-bottom: 8px;">Response from our team:</p>
        <p style="margin: 0; white-space: pre-wrap; color: #334155; line-height: 1.6;">${escapeHtml(replyText)}</p>
      </div>

      <p style="font-size: 14px; color: #64748b; margin-top: 24px;">
        Best regards,<br />
        <strong>${escapeHtml(adminName)}</strong><br />
        School Management Team
      </p>
    </div>
  `;

  const textBody = `Dear ${message.name},\n\n` +
    `Thank you for contacting us regarding your inquiry:\n` +
    `"${message.message}"\n\n` +
    `Response from ${adminName}:\n` +
    `${replyText}\n\n` +
    `Best regards,\nSchool Management Team`;

  // Dispatch email using Resend or SMTP if configured
  const hasResend = Boolean(env.RESEND_API_KEY && env.RESEND_API_KEY.trim());
  const hasSmtp = Boolean(env.SMTP_USER && env.SMTP_PASS);

  if (hasResend) {
    try {
      await sendViaResend({
        to: message.email,
        subject,
        html: htmlBody,
        text: textBody
      });
      emailDeliveryStatus = 'sent';
    } catch (err) {
      logger.warn({
        msg: '[CONTACT MESSAGE] Resend delivery failed, attempting SMTP fallback',
        error: sanitizeErrorMessage(err.message)
      });

      if (hasSmtp) {
        try {
          await sendMail({
            to: message.email,
            subject,
            html: htmlBody,
            text: textBody
          });
          emailDeliveryStatus = 'sent';
        } catch (smtpErr) {
          emailDeliveryStatus = 'failed';
          emailDeliveryError = sanitizeErrorMessage(smtpErr.message || 'SMTP fallback delivery failed');
          logger.error({
            msg: '[CONTACT MESSAGE] Both Resend and SMTP failed',
            error: emailDeliveryError
          });
        }
      } else {
        emailDeliveryStatus = 'failed';
        emailDeliveryError = sanitizeErrorMessage(err.message || 'Resend email delivery failed');
      }
    }
  } else if (hasSmtp) {
    try {
      await sendMail({
        to: message.email,
        subject,
        html: htmlBody,
        text: textBody
      });
      emailDeliveryStatus = 'sent';
    } catch (err) {
      emailDeliveryStatus = 'failed';
      emailDeliveryError = sanitizeErrorMessage(err.message || 'SMTP email delivery failed');
      logger.error({
        msg: '[CONTACT MESSAGE] SMTP delivery failed',
        error: emailDeliveryError
      });
    }
  } else {
    // Email service is not configured
    emailDeliveryStatus = 'not_configured';
    emailDeliveryError = 'Email delivery skipped: No email provider (Resend or SMTP) is configured on the server.';
    logger.warn({
      msg: '[CONTACT MESSAGE] Email not configured; reply saved to database only',
      recipient: message.email
    });
  }

  // Persist reply and updated message state to database
  const result = await repository.saveReply(id, {
    adminId,
    adminName,
    replyText,
    emailDeliveryStatus,
    emailDeliveryError
  });

  return {
    message: result.message,
    reply: result.reply,
    emailDeliveryStatus,
    emailDeliveryError
  };
};

function escapeHtml(string) {
  if (!string) return '';
  return String(string)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

