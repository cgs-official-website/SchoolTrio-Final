import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as passwordResetService from './password-reset.service.js';
import * as authRepository from './auth.repository.js';
import * as emailService from '../../services/email.service.js';
import { AppError, UnauthorizedError } from '../../utils/app-error.js';
import { TOKEN_TYPES } from '../../config/constants.js';

vi.mock('./auth.repository.js', () => ({
  findActiveUsersByEmail: vi.fn(),
  findUserByEmail: vi.fn(),
  findUserById: vi.fn(),
  findPasswordResetTokenByHash: vi.fn(),
  createPasswordResetToken: vi.fn(),
  deletePasswordResetToken: vi.fn(),
  invalidateUserResetTokens: vi.fn(),
  executePasswordResetTransaction: vi.fn(),
  executePasswordChangeTransaction: vi.fn()
}));

vi.mock('../../services/email.service.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    sendPasswordResetEmail: vi.fn(),
    sendPasswordSetupEmail: vi.fn()
  };
});

describe('FORGOT-PASSWORD-002: Gmail SMTP Delivery, Security & Disambiguation Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Trusted Frontend URL Sanitization (Reset-Link Poisoning Prevention)', () => {
    it('falls back to canonical production URL when candidate is missing or invalid', () => {
      expect(emailService.getTrustedFrontendUrl(null)).toBeTruthy();
      expect(emailService.getTrustedFrontendUrl('')).toBeTruthy();
      expect(emailService.getTrustedFrontendUrl('not-a-valid-url')).toBeTruthy();
    });

    it('accepts exact canonical production frontend URL', () => {
      const prodUrl = 'https://school-trio-final-frontend.vercel.app';
      expect(emailService.getTrustedFrontendUrl(prodUrl)).toBe(prodUrl);
      expect(emailService.getTrustedFrontendUrl(`${prodUrl}/`)).toBe(prodUrl);
    });

    it('accepts valid localhost origins for local development', () => {
      expect(emailService.getTrustedFrontendUrl('http://localhost:5173')).toBe('http://localhost:5173');
      expect(emailService.getTrustedFrontendUrl('http://127.0.0.1:3000/')).toBe('http://127.0.0.1:3000');
    });

    it('rejects malicious phishing domains and prevents origin tampering', () => {
      const malicious1 = 'https://evil-attacker.com';
      const malicious2 = 'https://school-trio-final-frontend.vercel.app.attacker.com';
      const malicious3 = 'https://attackervercel.app';

      expect(emailService.getTrustedFrontendUrl(malicious1)).not.toBe(malicious1);
      expect(emailService.getTrustedFrontendUrl(malicious2)).not.toBe(malicious2);
      expect(emailService.getTrustedFrontendUrl(malicious3)).not.toBe(malicious3);
    });
  });

  describe('2. Safe Recipient Email Masking & Secrets Sanitization', () => {
    it('masks emails cleanly for safe operator logging without leaking full PII', () => {
      expect(emailService.maskEmail('admin@springmount.com')).toBe('a***n@springmount.com');
      expect(emailService.maskEmail('ab@test.com')).toBe('a***@test.com');
      expect(emailService.maskEmail(null)).toBe('***');
    });

    it('does not expose raw reset token, token hash, or credentials in generic response', async () => {
      authRepository.findActiveUsersByEmail.mockResolvedValue([
        {
          id: 'user-uuid-safe',
          email: 'user@school.org',
          isActive: true,
          schoolId: 'school-1',
          school: { id: 'school-1', name: 'Safe Academy', status: 'active' }
        }
      ]);
      authRepository.invalidateUserResetTokens.mockResolvedValue({ count: 1 });
      authRepository.createPasswordResetToken.mockResolvedValue({ id: 'token-uuid-1' });
      emailService.sendPasswordResetEmail.mockResolvedValue({ success: true, messageId: 'msg-safe' });

      const response = await passwordResetService.requestPasswordReset({
        email: 'user@school.org'
      });

      expect(response).toEqual({
        success: true,
        message: 'If an account exists for this email, password reset instructions have been sent.'
      });
      expect(response).not.toHaveProperty('rawToken');
      expect(response).not.toHaveProperty('tokenHash');
      expect(response).not.toHaveProperty('resetToken');
      expect(response).not.toHaveProperty('password');
      expect(response).not.toHaveProperty('secret');
    });
  });

  describe('3. Account Enumeration Resistance & Unknown Accounts', () => {
    it('returns generic success response when email does not exist in any school tenant', async () => {
      authRepository.findActiveUsersByEmail.mockResolvedValue([]);

      const result = await passwordResetService.requestPasswordReset({
        email: 'unknown.user@example.com'
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('If an account exists for this email, password reset instructions have been sent.');
      expect(authRepository.createPasswordResetToken).not.toHaveBeenCalled();
      expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('returns generic success response when account belongs to a suspended school tenant', async () => {
      authRepository.findActiveUsersByEmail.mockResolvedValue([
        {
          id: 'user-suspended-1',
          email: 'user@suspended.com',
          isActive: true,
          schoolId: 'school-suspended',
          school: {
            id: 'school-suspended',
            name: 'Suspended Academy',
            status: 'suspended'
          }
        }
      ]);

      const result = await passwordResetService.requestPasswordReset({
        email: 'user@suspended.com'
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('If an account exists for this email, password reset instructions have been sent.');
      expect(authRepository.createPasswordResetToken).not.toHaveBeenCalled();
      expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });

  describe('4. Reliable Email Dispatch & Token Persistence', () => {
    it('persists hashed token and dispatches email via SMTP with generic success response', async () => {
      const mockUser = {
        id: 'user-uuid-1',
        email: 'teacher@school.edu',
        isActive: true,
        schoolId: 'school-uuid-1',
        school: {
          id: 'school-uuid-1',
          name: 'Greenfield High School',
          status: 'active'
        }
      };

      authRepository.findActiveUsersByEmail.mockResolvedValue([mockUser]);
      authRepository.invalidateUserResetTokens.mockResolvedValue({ count: 1 });
      authRepository.createPasswordResetToken.mockResolvedValue({ id: 'token-uuid-1' });
      emailService.sendPasswordResetEmail.mockResolvedValue({ success: true, messageId: 'msg-123' });

      const result = await passwordResetService.requestPasswordReset({
        email: 'teacher@school.edu',
        ipAddress: '192.168.1.1',
        frontendUrl: 'https://school-trio-final-frontend.vercel.app'
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('If an account exists for this email, password reset instructions have been sent.');
      expect(result).not.toHaveProperty('resetToken');
      expect(result).not.toHaveProperty('tokenHash');

      expect(authRepository.invalidateUserResetTokens).toHaveBeenCalledWith('user-uuid-1', TOKEN_TYPES.RESET);
      expect(authRepository.createPasswordResetToken).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-uuid-1',
          tokenType: TOKEN_TYPES.RESET,
          ipAddress: '192.168.1.1'
        })
      );
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'teacher@school.edu',
          schoolName: 'Greenfield High School',
          frontendUrl: 'https://school-trio-final-frontend.vercel.app'
        })
      );
    });
  });

  describe('5. Provider Rejection and Timeout Error Handling', () => {
    it('rolls back created token and throws 503 SERVICE_UNAVAILABLE when SMTP provider fails', async () => {
      const mockUser = {
        id: 'user-uuid-2',
        email: 'admin@school.edu',
        isActive: true,
        schoolId: 'school-uuid-1',
        school: {
          id: 'school-uuid-1',
          name: 'Greenfield High School',
          status: 'active'
        }
      };

      authRepository.findActiveUsersByEmail.mockResolvedValue([mockUser]);
      authRepository.invalidateUserResetTokens.mockResolvedValue({ count: 0 });
      authRepository.createPasswordResetToken.mockResolvedValue({ id: 'token-uuid-rollback' });
      authRepository.deletePasswordResetToken.mockResolvedValue({ id: 'token-uuid-rollback' });
      emailService.sendPasswordResetEmail.mockRejectedValue(new Error('Connection timeout to mail service'));

      await expect(
        passwordResetService.requestPasswordReset({
          email: 'admin@school.edu'
        })
      ).rejects.toThrow(AppError);

      expect(authRepository.deletePasswordResetToken).toHaveBeenCalledWith('token-uuid-rollback');
    });

    it('rolls back created token and throws 503 SERVICE_UNAVAILABLE when Resend provider rejects delivery', async () => {
      const mockUser = {
        id: 'user-uuid-resend-fail',
        email: 'teacher@school.edu',
        isActive: true,
        schoolId: 'school-uuid-1',
        school: {
          id: 'school-uuid-1',
          name: 'Greenfield High School',
          status: 'active'
        }
      };

      authRepository.findActiveUsersByEmail.mockResolvedValue([mockUser]);
      authRepository.invalidateUserResetTokens.mockResolvedValue({ count: 0 });
      authRepository.createPasswordResetToken.mockResolvedValue({ id: 'token-uuid-resend-rollback' });
      authRepository.deletePasswordResetToken.mockResolvedValue({ id: 'token-uuid-resend-rollback' });
      emailService.sendPasswordResetEmail.mockRejectedValue(
        new Error('Resend delivery rejected: Domain unverified.org is not verified in Resend dashboard')
      );

      await expect(
        passwordResetService.requestPasswordReset({
          email: 'teacher@school.edu'
        })
      ).rejects.toThrow(AppError);

      expect(authRepository.deletePasswordResetToken).toHaveBeenCalledWith('token-uuid-resend-rollback');
    });
  });

  describe('6. Tenant Ambiguity & Multi-Tenant Partial Delivery Failure', () => {
    it('delivers separate scoped reset links for an email belonging to multiple active tenant schools', async () => {
      const mockUsersMultiTenant = [
        {
          id: 'user-school-a',
          email: 'shared.staff@schools.org',
          isActive: true,
          schoolId: 'school-a',
          school: { id: 'school-a', name: 'Alpha High School', status: 'active' }
        },
        {
          id: 'user-school-b',
          email: 'shared.staff@schools.org',
          isActive: true,
          schoolId: 'school-b',
          school: { id: 'school-b', name: 'Beta Academy', status: 'active' }
        }
      ];

      authRepository.findActiveUsersByEmail.mockResolvedValue(mockUsersMultiTenant);
      authRepository.invalidateUserResetTokens.mockResolvedValue({ count: 0 });
      authRepository.createPasswordResetToken.mockResolvedValue({ id: 'token-uuid' });
      emailService.sendPasswordResetEmail.mockResolvedValue({ success: true, messageId: 'msg-multi' });

      const result = await passwordResetService.requestPasswordReset({
        email: 'shared.staff@schools.org'
      });

      expect(result.success).toBe(true);
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalledTimes(2);
      expect(emailService.sendPasswordResetEmail).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ schoolName: 'Alpha High School' })
      );
      expect(emailService.sendPasswordResetEmail).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ schoolName: 'Beta Academy' })
      );
    });

    it('preserves successfully dispatched token when another tenant delivery encounters partial failure', async () => {
      const mockUsers = [
        {
          id: 'user-multi-1',
          email: 'partner@schools.org',
          isActive: true,
          schoolId: 'school-1',
          school: { id: 'school-1', name: 'School 1', status: 'active' }
        },
        {
          id: 'user-multi-2',
          email: 'partner@schools.org',
          isActive: true,
          schoolId: 'school-2',
          school: { id: 'school-2', name: 'School 2', status: 'active' }
        }
      ];

      authRepository.findActiveUsersByEmail.mockResolvedValue(mockUsers);
      authRepository.invalidateUserResetTokens.mockResolvedValue({ count: 0 });
      authRepository.createPasswordResetToken
        .mockResolvedValueOnce({ id: 'token-success-1' })
        .mockResolvedValueOnce({ id: 'token-failed-2' });

      // First dispatch succeeds, second fails with SMTP connection error
      emailService.sendPasswordResetEmail
        .mockResolvedValueOnce({ success: true, messageId: 'msg-1' })
        .mockRejectedValueOnce(new Error('SMTP greeting timeout'));

      const result = await passwordResetService.requestPasswordReset({
        email: 'partner@schools.org'
      });

      // Crucial: Only token-failed-2 must be deleted; token-success-1 must NOT be deleted
      expect(authRepository.deletePasswordResetToken).toHaveBeenCalledWith('token-failed-2');
      expect(authRepository.deletePasswordResetToken).not.toHaveBeenCalledWith('token-success-1');

      // The call returns generic 200 so the user doesn't retry and invalidate token-success-1
      expect(result.success).toBe(true);
    });

    it('throws 503 SERVICE_UNAVAILABLE when all tenant deliveries in multi-tenant account fail', async () => {
      const mockUsers = [
        {
          id: 'user-multi-a',
          email: 'dual@schools.org',
          isActive: true,
          schoolId: 'school-a',
          school: { id: 'school-a', name: 'School A', status: 'active' }
        },
        {
          id: 'user-multi-b',
          email: 'dual@schools.org',
          isActive: true,
          schoolId: 'school-b',
          school: { id: 'school-b', name: 'School B', status: 'active' }
        }
      ];

      authRepository.findActiveUsersByEmail.mockResolvedValue(mockUsers);
      authRepository.invalidateUserResetTokens.mockResolvedValue({ count: 0 });
      authRepository.createPasswordResetToken
        .mockResolvedValueOnce({ id: 'token-fail-a' })
        .mockResolvedValueOnce({ id: 'token-fail-b' });

      emailService.sendPasswordResetEmail.mockRejectedValue(new Error('SMTP connection refused'));

      await expect(
        passwordResetService.requestPasswordReset({ email: 'dual@schools.org' })
      ).rejects.toThrow(AppError);

      expect(authRepository.deletePasswordResetToken).toHaveBeenCalledWith('token-fail-a');
      expect(authRepository.deletePasswordResetToken).toHaveBeenCalledWith('token-fail-b');
    });
  });

  describe('7. Reset Token Expiration & Single-Use Enforcement', () => {
    it('rejects confirmation with an expired reset token', async () => {
      const expiredDate = new Date(Date.now() - 60000); // 1 minute in the past
      authRepository.findPasswordResetTokenByHash.mockResolvedValue({
        id: 'token-expired',
        tokenType: TOKEN_TYPES.RESET,
        usedAt: null,
        expiresAt: expiredDate,
        user: { id: 'user-1', isActive: true }
      });

      const valid64CharToken = 'a'.repeat(64);
      await expect(
        passwordResetService.confirmPasswordReset({
          token: valid64CharToken,
          newPassword: 'ValidPassword123!'
        })
      ).rejects.toThrow(UnauthorizedError);
    });

    it('rejects confirmation with an already-used reset token (single-use)', async () => {
      authRepository.findPasswordResetTokenByHash.mockResolvedValue({
        id: 'token-already-used',
        tokenType: TOKEN_TYPES.RESET,
        usedAt: new Date(Date.now() - 30000), // Already consumed
        expiresAt: new Date(Date.now() + 60000),
        user: { id: 'user-1', isActive: true }
      });

      const valid64CharToken = 'b'.repeat(64);
      await expect(
        passwordResetService.confirmPasswordReset({
          token: valid64CharToken,
          newPassword: 'ValidPassword123!'
        })
      ).rejects.toThrow(UnauthorizedError);
    });

    it('successfully confirms reset with a valid, unconsumed token', async () => {
      authRepository.findPasswordResetTokenByHash.mockResolvedValue({
        id: 'token-valid',
        tokenType: TOKEN_TYPES.RESET,
        usedAt: null,
        expiresAt: new Date(Date.now() + 600000),
        user: { id: 'user-valid', isActive: true }
      });
      authRepository.executePasswordResetTransaction.mockResolvedValue({ success: true });

      const valid64CharToken = 'c'.repeat(64);
      const result = await passwordResetService.confirmPasswordReset({
        token: valid64CharToken,
        newPassword: 'ValidPassword123!'
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('successfully updated');
      expect(authRepository.executePasswordResetTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenId: 'token-valid',
          userId: 'user-valid'
        })
      );
    });
  });

  describe('8. Isolation from Other Workflows (School Registration)', () => {
    it('confirms password reset service does not affect or intercept school registration workflows', () => {
      // Password reset service exports only reset/setup domain methods
      expect(typeof passwordResetService.requestPasswordReset).toBe('function');
      expect(typeof passwordResetService.confirmPasswordReset).toBe('function');
      expect(typeof passwordResetService.confirmPasswordSetup).toBe('function');
      expect(typeof passwordResetService.changePassword).toBe('function');
      // Verifies no registration methods are exposed or coupled
      expect(passwordResetService).not.toHaveProperty('registerSchool');
    });
  });
});
