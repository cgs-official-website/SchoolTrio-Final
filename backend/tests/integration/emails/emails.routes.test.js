import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import * as emailService from '../../../src/services/email.service.js';

describe('Transactional Emails API Integration Tests (Nodemailer)', () => {
  const app = createApp();

  beforeEach(() => {
    vi.restoreAllMocks();
    emailService.clearSentEmails();
  });

  describe('POST /api/v1/emails/send', () => {
    it('dispatches email successfully and returns 200 with messageId', async () => {
      const sendMailSpy = vi.spyOn(emailService, 'sendMail').mockResolvedValue({
        success: true,
        messageId: 'msg_test_123456'
      });

      const res = await request(app)
        .post('/api/v1/emails/send')
        .send({
          to: 'parent@example.com',
          subject: 'Fee Reminder Notice',
          html: '<p>Please review your fee statement.</p>'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.messageId).toBe('msg_test_123456');
      expect(sendMailSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'parent@example.com',
          subject: 'Fee Reminder Notice',
          html: '<p>Please review your fee statement.</p>'
        })
      );
    });

    it('supports array of recipient email addresses', async () => {
      vi.spyOn(emailService, 'sendMail').mockResolvedValue({
        success: true,
        messageId: 'msg_bulk_123'
      });

      const res = await request(app)
        .post('/api/v1/emails/send')
        .send({
          to: ['parent1@example.com', 'parent2@example.com'],
          subject: 'School Reopening Announcement',
          text: 'School reopens on Monday.'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('rejects invalid request with missing to / subject (400 ValidationError)', async () => {
      const res = await request(app)
        .post('/api/v1/emails/send')
        .send({
          html: '<p>No recipient specified.</p>'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('rejects request with invalid email format (400)', async () => {
      const res = await request(app)
        .post('/api/v1/emails/send')
        .send({
          to: 'not-an-email',
          subject: 'Test',
          text: 'Hello'
        });

      expect(res.status).toBe(400);
    });
  });
});
