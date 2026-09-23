import { describe, it, expect, beforeEach } from 'vitest';
import {
  sendPasswordResetEmail,
  sendPasswordSetupEmail,
  getSentEmails,
  clearSentEmails
} from '../../../src/services/email.service.js';

describe('Email Delivery Service Abstraction (email.service.js)', () => {
  beforeEach(() => {
    clearSentEmails();
  });

  describe('sendPasswordResetEmail', () => {
    it('captures outgoing password reset email in test queue', async () => {
      const result = await sendPasswordResetEmail({
        to: 'teacher@school.edu',
        resetToken: 'a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890',
        schoolName: 'Greenwood High'
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();

      const emails = getSentEmails();
      expect(emails).toHaveLength(1);
      expect(emails[0].to).toBe('teacher@school.edu');
      expect(emails[0].subject).toContain('Password Reset Request');
      expect(emails[0].schoolName).toBe('Greenwood High');
      expect(emails[0].resetUrl).toContain('a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890');
    });

    it('handles default school name if omitted', async () => {
      await sendPasswordResetEmail({
        to: 'user@test.org',
        resetToken: 'mocktoken123'
      });

      const emails = getSentEmails();
      expect(emails[0].schoolName).toBe('School Management System');
    });
  });

  describe('sendPasswordSetupEmail', () => {
    it('captures outgoing password setup email in test queue', async () => {
      const result = await sendPasswordSetupEmail({
        to: 'newparent@school.edu',
        setupToken: 'e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4',
        schoolName: 'Spring Mount Public School'
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();

      const emails = getSentEmails();
      expect(emails).toHaveLength(1);
      expect(emails[0].to).toBe('newparent@school.edu');
      expect(emails[0].subject).toContain('Account Setup Invitation');
      expect(emails[0].schoolName).toBe('Spring Mount Public School');
      expect(emails[0].setupUrl).toContain('e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4');
    });

  });

  describe('queue management', () => {
    it('clears sent emails queue when requested', async () => {
      await sendPasswordResetEmail({ to: 'u1@t.com', resetToken: 'tok1' });
      await sendPasswordSetupEmail({ to: 'u2@t.com', setupToken: 'tok2' });
      expect(getSentEmails()).toHaveLength(2);

      clearSentEmails();
      expect(getSentEmails()).toHaveLength(0);
    });
  });
});
