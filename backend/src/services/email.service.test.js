import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import nodemailer from 'nodemailer';
import net from 'node:net';
import { EventEmitter } from 'node:events';
import {
  getTransporter,
  resetTransporterCache,
  sendMail,
  getTrustedFrontendUrl,
  maskEmail,
  createIpv4Socket,
  getResendClient,
  resetResendClientCache,
  setResendClient,
  sendViaResend,
  sendPasswordResetEmail,
  sendPasswordResetEmailViaSmtp,
  sanitizeErrorMessage,
  resolveResendSender,
  getSentEmails,
  clearSentEmails
} from './email.service.js';
import { env } from '../config/env.js';

describe('FORGOT-PASSWORD-009: Resend HTTPS Password-Reset & SMTP Fallback Security Suite', () => {
  beforeEach(() => {
    resetTransporterCache();
    resetResendClientCache();
    clearSentEmails();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetTransporterCache();
    resetResendClientCache();
    clearSentEmails();
  });

  describe('1. Explicit SMTP Transport Configuration & IPv4 getSocket', () => {
    it('creates transport with explicit host, port 587, secure: false, and IPv4 getSocket', () => {
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
            },
            getSocket: createIpv4Socket
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
            },
            getSocket: createIpv4Socket
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

  describe('2. IPv4 Socket Enforcement & Error Handling (FORGOT-PASSWORD-006)', () => {
    it('creates socket strictly with family: 4 to prevent unreachable IPv6 attempts', () => {
      const mockSocket = new EventEmitter();
      mockSocket.destroy = vi.fn();
      const connectSpy = vi.spyOn(net, 'connect').mockReturnValue(mockSocket);

      let callbackResult = null;
      createIpv4Socket({ host: 'smtp.gmail.com', port: 587, connectionTimeout: 5000 }, (err, res) => {
        callbackResult = { err, res };
      });

      expect(connectSpy).toHaveBeenCalledWith({
        host: 'smtp.gmail.com',
        port: 587,
        family: 4
      });

      mockSocket.emit('connect');
      expect(callbackResult).toEqual({
        err: null,
        res: { connection: mockSocket }
      });
    });

    it('propagates socket connection errors safely without credential leaks', () => {
      const mockSocket = new EventEmitter();
      mockSocket.destroy = vi.fn();
      vi.spyOn(net, 'connect').mockReturnValue(mockSocket);

      let callbackResult = null;
      createIpv4Socket({ host: 'smtp.gmail.com', port: 587 }, (err, res) => {
        callbackResult = { err, res };
      });

      const networkError = new Error('connect ECONNREFUSED 192.178.211.109:587');
      mockSocket.emit('error', networkError);

      expect(callbackResult.err).toBe(networkError);
      expect(mockSocket.destroy).toHaveBeenCalled();
    });

    it('handles connection timeout safely by destroying socket and returning ETIMEDOUT', async () => {
      const mockSocket = new EventEmitter();
      mockSocket.destroy = vi.fn();
      vi.spyOn(net, 'connect').mockReturnValue(mockSocket);

      let callbackResult = null;
      createIpv4Socket({ host: 'smtp.gmail.com', port: 587, connectionTimeout: 20 }, (err, res) => {
        callbackResult = { err, res };
      });

      await new Promise(r => setTimeout(r, 50));

      expect(callbackResult).not.toBeNull();
      expect(callbackResult.err.code).toBe('ETIMEDOUT');
      expect(mockSocket.destroy).toHaveBeenCalled();
    });
  });

  describe('3. sendMail Behavior (SMTP Transport & Test Queue)', () => {
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

    it('does not dispatch through Resend when sendMail is invoked', async () => {
      const mockResend = { emails: { send: vi.fn() } };
      setResendClient(mockResend);

      await sendMail({
        to: 'test.user@example.com',
        subject: 'General Email',
        html: '<p>Hello</p>'
      });

      expect(mockResend.emails.send).not.toHaveBeenCalled();
    });
  });

  describe('4. Resend HTTPS Password-Reset Integration (FORGOT-PASSWORD-009)', () => {
    describe('4.1 Resend Client Lifecycle & Configuration Management', () => {
      it('returns null from getResendClient when RESEND_API_KEY is not configured', () => {
        const originalKey = env.RESEND_API_KEY;
        env.RESEND_API_KEY = '';
        try {
          resetResendClientCache();
          expect(getResendClient()).toBeNull();
        } finally {
          env.RESEND_API_KEY = originalKey;
        }
      });

      it('instantiates and caches Resend client when RESEND_API_KEY is present', () => {
        const originalKey = env.RESEND_API_KEY;
        env.RESEND_API_KEY = 're_test_key_1234567890';
        try {
          resetResendClientCache();
          const client = getResendClient();
          expect(client).not.toBeNull();
          expect(client).toHaveProperty('emails');
          expect(typeof client.emails.send).toBe('function');

          // Verifies cache memoization
          const cachedAgain = getResendClient();
          expect(cachedAgain).toBe(client);
        } finally {
          env.RESEND_API_KEY = originalKey;
        }
      });

      it('clears cache on resetResendClientCache', () => {
        const originalKey = env.RESEND_API_KEY;
        env.RESEND_API_KEY = 're_test_key_1234567890';
        try {
          resetResendClientCache();
          const client1 = getResendClient();
          resetResendClientCache();
          const client2 = getResendClient();
          expect(client1).not.toBe(client2);
        } finally {
          env.RESEND_API_KEY = originalKey;
        }
      });
    });

    describe('4.2 Missing Configuration Fail-Safe Validation', () => {
      it('throws an actionable, sanitized error when RESEND_API_KEY is missing', async () => {
        const originalKey = env.RESEND_API_KEY;
        const originalFrom = env.RESEND_FROM_EMAIL;
        env.RESEND_API_KEY = '';
        env.RESEND_FROM_EMAIL = 'SchoolTrio <noreply@schooltrio.teamzuna.in>';

        try {
          await expect(
            sendPasswordResetEmail({
              to: 'teacher@school.org',
              resetToken: 'a'.repeat(64),
              schoolName: 'Test School'
            })
          ).rejects.toThrow('Resend API key is not configured');
        } finally {
          env.RESEND_API_KEY = originalKey;
          env.RESEND_FROM_EMAIL = originalFrom;
        }
      });

      it('throws an actionable, sanitized error when RESEND_FROM_EMAIL is missing', async () => {
        const originalKey = env.RESEND_API_KEY;
        const originalFrom = env.RESEND_FROM_EMAIL;
        env.RESEND_API_KEY = 're_valid_api_key_123';
        env.RESEND_FROM_EMAIL = '';

        try {
          await expect(
            sendPasswordResetEmail({
              to: 'teacher@school.org',
              resetToken: 'a'.repeat(64),
              schoolName: 'Test School'
            })
          ).rejects.toThrow('Resend sender email is not configured');
        } finally {
          env.RESEND_API_KEY = originalKey;
          env.RESEND_FROM_EMAIL = originalFrom;
        }
      });
    });

    describe('4.3 Successful Resend API Submission', () => {
      it('submits password reset email via Resend HTTPS API with correct payload and trusted URL', async () => {
        const originalKey = env.RESEND_API_KEY;
        const originalFrom = env.RESEND_FROM_EMAIL;
        env.RESEND_API_KEY = 're_mock_test_key';
        env.RESEND_FROM_EMAIL = 'SchoolTrio <noreply@schooltrio.teamzuna.in>';

        const mockSend = vi.fn().mockResolvedValue({
          data: { id: 're_message_id_success_999' },
          error: null
        });
        setResendClient({ emails: { send: mockSend } });

        try {
          const rawToken = 'f'.repeat(64);
          const result = await sendPasswordResetEmail({
            to: 'teacher@school.org',
            resetToken: rawToken,
            schoolName: 'Springmount Public School',
            frontendUrl: 'https://schooltrio.teamzuna.in'
          });

          expect(result.success).toBe(true);
          expect(result.messageId).toBe('re_message_id_success_999');
          expect(result.provider).toBe('resend');

          expect(mockSend).toHaveBeenCalledTimes(1);
          const [payload, options] = mockSend.mock.calls[0];

          expect(payload.from).toBe('SchoolTrio <noreply@schooltrio.teamzuna.in>');
          expect(payload.to).toBe('teacher@school.org');
          expect(payload.subject).toBe('Password Reset Request - Springmount Public School');
          expect(payload.html).toContain('https://schooltrio.teamzuna.in/reset-password?token=' + rawToken);
          expect(payload.text).toContain('https://schooltrio.teamzuna.in/reset-password?token=' + rawToken);
          expect(options).toHaveProperty('signal');

          // Verify recorded in sent emails queue
          const sentQueue = getSentEmails();
          expect(sentQueue.length).toBe(1);
          expect(sentQueue[0].messageId).toBe('re_message_id_success_999');
          expect(sentQueue[0].provider).toBe('resend');
        } finally {
          env.RESEND_API_KEY = originalKey;
          env.RESEND_FROM_EMAIL = originalFrom;
        }
      });

      it('sendViaResend dispatches correctly when invoked directly', async () => {
        const originalKey = env.RESEND_API_KEY;
        const originalFrom = env.RESEND_FROM_EMAIL;
        env.RESEND_API_KEY = 're_mock_test_key';
        env.RESEND_FROM_EMAIL = 'SchoolTrio <noreply@schooltrio.teamzuna.in>';

        const mockSend = vi.fn().mockResolvedValue({
          data: { id: 're_direct_dispatch_id' },
          error: null
        });
        setResendClient({ emails: { send: mockSend } });

        try {
          const result = await sendViaResend({
            to: 'admin@school.org',
            subject: 'Direct Test',
            html: '<p>Direct test content</p>',
            text: 'Direct test content'
          });

          expect(result.success).toBe(true);
          expect(result.messageId).toBe('re_direct_dispatch_id');
          expect(result.provider).toBe('resend');
          expect(mockSend).toHaveBeenCalledTimes(1);
        } finally {
          env.RESEND_API_KEY = originalKey;
          env.RESEND_FROM_EMAIL = originalFrom;
        }
      });

      it('automatically resolves and normalizes unbracketed or public domain sender addresses', () => {
        // Missing angle brackets with gmail -> resolves to verified teamzuna.in
        expect(resolveResendSender('SchoolTrio carrezzaglobalsolutions@gmail.com')).toBe('SchoolTrio <noreply@teamzuna.in>');

        // Pure gmail email -> resolves to default verified sender
        expect(resolveResendSender('carrezzaglobalsolutions@gmail.com')).toBe('School Trio <noreply@teamzuna.in>');

        // Valid custom domain with angle brackets -> preserved
        expect(resolveResendSender('School Trio <noreply@teamzuna.in>')).toBe('School Trio <noreply@teamzuna.in>');

        // Valid custom domain without display name -> preserved
        expect(resolveResendSender('admin@unverified.org')).toBe('admin@unverified.org');

        // Empty explicit input -> returns null so missing config validation is triggered
        expect(resolveResendSender('')).toBeNull();
      });
    });

    describe('4.4 Provider Rejection, Timeout & Network Error Handling', () => {
      it('handles Resend provider rejection (e.g. unverified domain) with safe sanitized error', async () => {
        const originalKey = env.RESEND_API_KEY;
        const originalFrom = env.RESEND_FROM_EMAIL;
        env.RESEND_API_KEY = 're_mock_key';
        env.RESEND_FROM_EMAIL = 'admin@unverified.org';

        const mockSend = vi.fn().mockResolvedValue({
          data: null,
          error: {
            message: 'Domain unverified.org is not verified in Resend dashboard',
            statusCode: 422
          }
        });
        setResendClient({ emails: { send: mockSend } });

        try {
          await expect(
            sendPasswordResetEmail({
              to: 'user@school.org',
              resetToken: 'b'.repeat(64),
              schoolName: 'Test School'
            })
          ).rejects.toThrow('Domain unverified.org is not verified in Resend dashboard');
        } finally {
          env.RESEND_API_KEY = originalKey;
          env.RESEND_FROM_EMAIL = originalFrom;
        }
      });

      it('handles request timeout gracefully with explicit timeout message', async () => {
        const originalKey = env.RESEND_API_KEY;
        const originalFrom = env.RESEND_FROM_EMAIL;
        env.RESEND_API_KEY = 're_mock_key';
        env.RESEND_FROM_EMAIL = 'SchoolTrio <noreply@schooltrio.teamzuna.in>';

        const timeoutErr = new Error('The operation was aborted due to timeout');
        timeoutErr.name = 'TimeoutError';
        const mockSend = vi.fn().mockRejectedValue(timeoutErr);
        setResendClient({ emails: { send: mockSend } });

        try {
          await expect(
            sendPasswordResetEmail({
              to: 'user@school.org',
              resetToken: 'c'.repeat(64),
              schoolName: 'Test School'
            })
          ).rejects.toThrow('Resend API request timed out after 10000ms');
        } finally {
          env.RESEND_API_KEY = originalKey;
          env.RESEND_FROM_EMAIL = originalFrom;
        }
      });

      it('propagates network connection errors safely without crashing', async () => {
        const originalKey = env.RESEND_API_KEY;
        const originalFrom = env.RESEND_FROM_EMAIL;
        env.RESEND_API_KEY = 're_mock_key';
        env.RESEND_FROM_EMAIL = 'SchoolTrio <noreply@schooltrio.teamzuna.in>';

        const netErr = new Error('getaddrinfo ENOTFOUND api.resend.com');
        const mockSend = vi.fn().mockRejectedValue(netErr);
        setResendClient({ emails: { send: mockSend } });

        try {
          await expect(
            sendPasswordResetEmail({
              to: 'user@school.org',
              resetToken: 'd'.repeat(64),
              schoolName: 'Test School'
            })
          ).rejects.toThrow('getaddrinfo ENOTFOUND api.resend.com');
        } finally {
          env.RESEND_API_KEY = originalKey;
          env.RESEND_FROM_EMAIL = originalFrom;
        }
      });
    });

    describe('4.5 Credential Redaction & Sanitization', () => {
      it('redacts sensitive API key and SMTP password from error messages', () => {
        const originalKey = env.RESEND_API_KEY;
        const originalPass = env.SMTP_PASS;
        env.RESEND_API_KEY = 're_super_secret_api_key_xyz987';
        env.SMTP_PASS = 'super_secret_smtp_password_abc123';

        try {
          const rawError = 'Failed to authenticate with re_super_secret_api_key_xyz987 using pass super_secret_smtp_password_abc123';
          const sanitized = sanitizeErrorMessage(rawError);

          expect(sanitized).not.toContain('re_super_secret_api_key_xyz987');
          expect(sanitized).not.toContain('super_secret_smtp_password_abc123');
          expect(sanitized).toContain('[REDACTED_API_KEY]');
          expect(sanitized).toContain('[REDACTED_SMTP_PASS]');
        } finally {
          env.RESEND_API_KEY = originalKey;
          env.SMTP_PASS = originalPass;
        }
      });
    });

    describe('4.6 Documented Gmail SMTP Fallback', () => {
      it('provides sendPasswordResetEmailViaSmtp as a documented fallback route', async () => {
        const result = await sendPasswordResetEmailViaSmtp({
          to: 'teacher@school.org',
          resetToken: 'e'.repeat(64),
          schoolName: 'Springmount School'
        });

        expect(result.success).toBe(true);
        expect(result.provider).toBe('mock'); // Test mode SMTP capture
      });

      it('does NOT automatically fall back to SMTP when Resend fails (prevents duplicate sends)', async () => {
        const originalKey = env.RESEND_API_KEY;
        const originalFrom = env.RESEND_FROM_EMAIL;
        env.RESEND_API_KEY = 're_mock_key';
        env.RESEND_FROM_EMAIL = 'SchoolTrio <noreply@schooltrio.teamzuna.in>';

        const mockSend = vi.fn().mockRejectedValue(new Error('Resend timeout'));
        setResendClient({ emails: { send: mockSend } });

        const sendMailSpy = vi.spyOn(nodemailer, 'createTransport');

        try {
          await expect(
            sendPasswordResetEmail({
              to: 'teacher@school.org',
              resetToken: 'e'.repeat(64)
            })
          ).rejects.toThrow('Resend API request timed out after 10000ms');

          // SMTP transport must NOT be created or attempted automatically
          expect(sendMailSpy).not.toHaveBeenCalled();
        } finally {
          env.RESEND_API_KEY = originalKey;
          env.RESEND_FROM_EMAIL = originalFrom;
        }
      });
    });
  });

  describe('5. Masked Email Logging', () => {
    it('masks emails cleanly for safe operator logging without leaking full PII', () => {
      expect(maskEmail('principal@greenschool.org')).toBe('p***l@greenschool.org');
      expect(maskEmail('a@b.com')).toBe('a***@b.com');
      expect(maskEmail('ab@b.com')).toBe('a***@b.com');
      expect(maskEmail(null)).toBe('***');
      expect(maskEmail('')).toBe('***');
      expect(maskEmail('invalid-email')).toBe('***');
    });
  });

  describe('6. Strict Frontend URL Sanitization', () => {
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
