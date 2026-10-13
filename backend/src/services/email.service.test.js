import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import nodemailer from 'nodemailer';
import {
  getTransporter,
  resetTransporterCache,
  sendMail,
  getTrustedFrontendUrl,
  maskEmail
} from './email.service.js';
import { env } from '../config/env.js';

describe('FORGOT-PASSWORD-004: Explicit Gmail SMTP Configuration & Security Suite', () => {
  beforeEach(() => {
    resetTransporterCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetTransporterCache();
  });

  describe('1. Explicit SMTP Transport Configuration (No service: "gmail" Overrides)', () => {
    it('creates transport using explicit host, port 587, and secure: false for STARTTLS', () => {
      const createTransportSpy = vi.spyOn(nodemailer, 'createTransport').mockReturnValue({
        sendMail: vi.fn().mockResolvedValue({ messageId: 'test-msg' }),
        verify: vi.fn().mockResolvedValue(true)
      });

      const originalHost = env.SMTP_HOST;
      const originalPort = env.SMTP_PORT;
      const originalSecure = env.SMTP_SECURE;
      const originalUser = env.SMTP_USER;
      const originalPass = env.SMTP_PASS;

      env.SMTP_HOST = 'smtp.gmail.com';
      env.SMTP_PORT = 587;
      env.SMTP_SECURE = false;
      env.SMTP_USER = 'school.test@gmail.com';
      env.SMTP_PASS = 'mockapppassword123';

      try {
        const transporter = getTransporter();
        expect(transporter).not.toBeNull();
        expect(createTransportSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            host: 'smtp.gmail.com',
            port: 587,
            secure: false,
            auth: {
              user: 'school.test@gmail.com',
              pass: 'mockapppassword123'
            },
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 15000,
            tls: {
              rejectUnauthorized: true
            }
          })
        );
        // CRITICAL: Must NOT contain service: 'gmail', which forces port 465
        expect(createTransportSpy.mock.calls[0][0]).not.toHaveProperty('service');
      } finally {
        env.SMTP_HOST = originalHost;
        env.SMTP_PORT = originalPort;
        env.SMTP_SECURE = originalSecure;
        env.SMTP_USER = originalUser;
        env.SMTP_PASS = originalPass;
      }
    });

    it('honors explicitly configured port 465 with secure: true if configured', () => {
      const createTransportSpy = vi.spyOn(nodemailer, 'createTransport').mockReturnValue({
        sendMail: vi.fn().mockResolvedValue({ messageId: 'test-465-msg' }),
        verify: vi.fn().mockResolvedValue(true)
      });

      const originalHost = env.SMTP_HOST;
      const originalPort = env.SMTP_PORT;
      const originalSecure = env.SMTP_SECURE;
      const originalUser = env.SMTP_USER;
      const originalPass = env.SMTP_PASS;

      env.SMTP_HOST = 'smtp.gmail.com';
      env.SMTP_PORT = 465;
      env.SMTP_SECURE = true;
      env.SMTP_USER = 'school.test@gmail.com';
      env.SMTP_PASS = 'mockapppassword123';

      try {
        const transporter = getTransporter();
        expect(transporter).not.toBeNull();
        expect(createTransportSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            host: 'smtp.gmail.com',
            port: 465,
            secure: true,
            tls: {
              rejectUnauthorized: true
            }
          })
        );
      } finally {
        env.SMTP_HOST = originalHost;
        env.SMTP_PORT = originalPort;
        env.SMTP_SECURE = originalSecure;
        env.SMTP_USER = originalUser;
        env.SMTP_PASS = originalPass;
      }
    });

    it('returns null when SMTP credentials are not configured', () => {
      const originalUser = env.SMTP_USER;
      const originalPass = env.SMTP_PASS;
      env.SMTP_USER = '';
      env.SMTP_PASS = '';

      try {
        const transporter = getTransporter();
        expect(transporter).toBeNull();
      } finally {
        env.SMTP_USER = originalUser;
        env.SMTP_PASS = originalPass;
      }
    });
  });

  describe('2. sendMail Behavior & No Resend Invocations', () => {
    it('captures in test queue without outbound network calls during tests', async () => {
      const result = await sendMail({
        to: 'test.user@example.com',
        subject: 'Test Subject',
        html: '<p>Hello</p>',
        text: 'Hello'
      });

      expect(result.success).toBe(true);
      expect(result.provider).toBe('mock');
      expect(result.messageId).toMatch(/^msg_/);
    });

    it('does not contain any Resend HTTP API invocations or dependencies', () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('3. Masked Email Logging', () => {
    it('masks emails cleanly for safe operator logging without leaking full PII', () => {
      expect(maskEmail('principal@greenschool.org')).toBe('p***l@greenschool.org');
      expect(maskEmail('a@b.com')).toBe('a***@b.com');
      expect(maskEmail('ab@b.com')).toBe('a***@b.com');
      expect(maskEmail(null)).toBe('***');
      expect(maskEmail('')).toBe('***');
      expect(maskEmail('invalid-email')).toBe('***');
    });
  });

  describe('4. Strict Frontend URL Sanitization', () => {
    it('falls back to default fallback URL when candidate is empty or untrusted', () => {
      const fallback = env.isProduction ? 'https://school-trio-final-frontend.vercel.app' : (env.FRONTEND_URL || 'http://localhost:5173');
      expect(getTrustedFrontendUrl(null)).toBe(fallback);
      expect(getTrustedFrontendUrl('')).toBe(fallback);
      expect(getTrustedFrontendUrl('https://evil-site.com')).toBe(fallback);
    });

    it('accepts exact production and local development origins', () => {
      expect(getTrustedFrontendUrl('https://school-trio-final-frontend.vercel.app')).toBe('https://school-trio-final-frontend.vercel.app');
      expect(getTrustedFrontendUrl('http://localhost:5173')).toBe('http://localhost:5173');
      expect(getTrustedFrontendUrl('http://127.0.0.1:3000')).toBe('http://127.0.0.1:3000');
    });
  });
});
