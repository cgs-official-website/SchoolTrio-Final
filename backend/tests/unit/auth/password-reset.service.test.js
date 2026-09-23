import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import * as passwordResetService from '../../../src/modules/auth/password-reset.service.js';
import * as authRepository from '../../../src/modules/auth/auth.repository.js';
import * as passwordService from '../../../src/modules/auth/password.service.js';
import * as emailService from '../../../src/services/email.service.js';
import { TOKEN_TYPES } from '../../../src/config/constants.js';

import { UnauthorizedError, ForbiddenError, ValidationError } from '../../../src/utils/app-error.js';

describe('Password Lifecycle Domain Service (password-reset.service.js)', () => {
  const mockUser = {
    id: 'e9c4e270-26e1-43ac-8279-886ec13f4776',
    schoolId: '25e9637a-7fa4-4ac2-b43d-b4c0edcf2932',
    email: 'teacher@school.edu',
    passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$someArgonHash',
    passwordAlgorithm: 'argon2id',
    systemRole: 'TENANT_USER',
    tokenVersion: 1,
    isActive: true,
    school: {
      id: '25e9637a-7fa4-4ac2-b43d-b4c0edcf2932',
      name: 'Spring Mount Public School',
      code: 'SchoolS024',
      status: 'active'
    }
  };

  const validHexToken = 'a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890';
  const validTokenHash = crypto.createHash('sha256').update(validHexToken).digest('hex');

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('generateSecureToken & hashToken', () => {
    it('generates 32 random bytes as a 64-character hex string with matching SHA-256 hash', () => {
      const { rawToken, tokenHash } = passwordResetService.generateSecureToken();

      expect(rawToken).toMatch(/^[0-9a-f]{64}$/);
      expect(rawToken.length).toBe(64);

      const expectedHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      expect(tokenHash).toBe(expectedHash);
      expect(tokenHash.length).toBe(64);
    });

    it('computes correct SHA-256 hash for given raw token', () => {
      const hash = passwordResetService.hashToken('test-raw-token-value');
      const expected = crypto.createHash('sha256').update('test-raw-token-value').digest('hex');
      expect(hash).toBe(expected);
    });
  });

  describe('requestPasswordReset', () => {
    it('successfully initiates reset, invalidates prior active tokens, stores hashed token, and sends email', async () => {
      vi.spyOn(authRepository, 'findUserByEmail').mockResolvedValue(mockUser);
      vi.spyOn(authRepository, 'invalidateUserResetTokens').mockResolvedValue(1);
      vi.spyOn(authRepository, 'createPasswordResetToken').mockResolvedValue({ id: 'token-uuid-1' });
      vi.spyOn(emailService, 'sendPasswordResetEmail').mockResolvedValue({ success: true, messageId: 'msg-1' });

      const result = await passwordResetService.requestPasswordReset({
        email: 'TEACHER@SCHOOL.EDU',
        ipAddress: '127.0.0.1'
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('If an account exists for this email');

      expect(authRepository.findUserByEmail).toHaveBeenCalledWith('teacher@school.edu');
      expect(authRepository.invalidateUserResetTokens).toHaveBeenCalledWith(mockUser.id, TOKEN_TYPES.RESET);
      expect(authRepository.createPasswordResetToken).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUser.id,
          tokenType: TOKEN_TYPES.RESET,
          ipAddress: '127.0.0.1',
          tokenHash: expect.any(String),
          expiresAt: expect.any(Date)
        })
      );
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: mockUser.email,
          resetToken: expect.stringMatching(/^[0-9a-f]{64}$/),
          schoolName: mockUser.school.name
        })
      );
    });

    it('returns generic success without sending email if user email is not found (enumeration resistance)', async () => {
      vi.spyOn(authRepository, 'findUserByEmail').mockResolvedValue(null);
      const emailSpy = vi.spyOn(emailService, 'sendPasswordResetEmail');

      const result = await passwordResetService.requestPasswordReset({
        email: 'unknown@example.com'
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('If an account exists for this email');
      expect(emailSpy).not.toHaveBeenCalled();
    });

    it('returns generic success without sending email if user is inactive', async () => {
      vi.spyOn(authRepository, 'findUserByEmail').mockResolvedValue({ ...mockUser, isActive: false });
      const emailSpy = vi.spyOn(emailService, 'sendPasswordResetEmail');

      const result = await passwordResetService.requestPasswordReset({
        email: 'teacher@school.edu'
      });

      expect(result.success).toBe(true);
      expect(emailSpy).not.toHaveBeenCalled();
    });

    it('returns generic success without sending email if user school is suspended', async () => {
      vi.spyOn(authRepository, 'findUserByEmail').mockResolvedValue({
        ...mockUser,
        school: { ...mockUser.school, status: 'suspended' }
      });
      const emailSpy = vi.spyOn(emailService, 'sendPasswordResetEmail');

      const result = await passwordResetService.requestPasswordReset({
        email: 'teacher@school.edu'
      });

      expect(result.success).toBe(true);
      expect(emailSpy).not.toHaveBeenCalled();
    });

    it('handles empty or non-string email gracefully with generic response', async () => {
      const result = await passwordResetService.requestPasswordReset({ email: '' });
      expect(result.success).toBe(true);
    });
  });

  describe('confirmPasswordReset', () => {
    const mockResetRecord = {
      id: 'token-uuid-1',
      userId: mockUser.id,
      tokenHash: validTokenHash,
      tokenType: TOKEN_TYPES.RESET,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 mins in future
      usedAt: null,
      user: mockUser
    };

    it('successfully confirms reset, hashes password with Argon2id, and executes atomic transaction', async () => {
      vi.spyOn(authRepository, 'findPasswordResetTokenByHash').mockResolvedValue(mockResetRecord);
      vi.spyOn(passwordService, 'hashPassword').mockResolvedValue('$argon2id$v=19$m=65536,t=3,p=4$newArgonHash');
      vi.spyOn(authRepository, 'executePasswordResetTransaction').mockResolvedValue({
        user: { ...mockUser, tokenVersion: 2 },
        token: { ...mockResetRecord, usedAt: new Date() },
        revokedSessions: { count: 3 }
      });

      const result = await passwordResetService.confirmPasswordReset({
        token: validHexToken,
        newPassword: 'NewSecurePassword123!'
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Password has been successfully updated');

      expect(authRepository.findPasswordResetTokenByHash).toHaveBeenCalledWith(validTokenHash);
      expect(passwordService.hashPassword).toHaveBeenCalledWith('NewSecurePassword123!');
      expect(authRepository.executePasswordResetTransaction).toHaveBeenCalledWith({
        tokenId: mockResetRecord.id,
        userId: mockUser.id,
        newPasswordHash: '$argon2id$v=19$m=65536,t=3,p=4$newArgonHash'
      });
    });

    it('rejects invalid token length or format', async () => {
      await expect(
        passwordResetService.confirmPasswordReset({
          token: 'too-short',
          newPassword: 'NewSecurePassword123!'
        })
      ).rejects.toThrow(UnauthorizedError);
    });

    it('rejects weak password failing complexity requirements', async () => {
      await expect(
        passwordResetService.confirmPasswordReset({
          token: validHexToken,
          newPassword: 'weak'
        })
      ).rejects.toThrow(ValidationError);
    });

    it('rejects nonexistent token hash with generic UnauthorizedError', async () => {
      vi.spyOn(authRepository, 'findPasswordResetTokenByHash').mockResolvedValue(null);

      await expect(
        passwordResetService.confirmPasswordReset({
          token: validHexToken,
          newPassword: 'NewSecurePassword123!'
        })
      ).rejects.toThrow(UnauthorizedError);
    });

    it('rejects already used token with UnauthorizedError', async () => {
      vi.spyOn(authRepository, 'findPasswordResetTokenByHash').mockResolvedValue({
        ...mockResetRecord,
        usedAt: new Date(Date.now() - 60000)
      });

      await expect(
        passwordResetService.confirmPasswordReset({
          token: validHexToken,
          newPassword: 'NewSecurePassword123!'
        })
      ).rejects.toThrow(UnauthorizedError);
    });

    it('rejects expired token with UnauthorizedError', async () => {
      vi.spyOn(authRepository, 'findPasswordResetTokenByHash').mockResolvedValue({
        ...mockResetRecord,
        expiresAt: new Date(Date.now() - 1000) // 1 second ago
      });

      await expect(
        passwordResetService.confirmPasswordReset({
          token: validHexToken,
          newPassword: 'NewSecurePassword123!'
        })
      ).rejects.toThrow(UnauthorizedError);
    });

    it('rejects SETUP token used in reset endpoint with UnauthorizedError', async () => {
      vi.spyOn(authRepository, 'findPasswordResetTokenByHash').mockResolvedValue({
        ...mockResetRecord,
        tokenType: TOKEN_TYPES.SETUP
      });

      await expect(
        passwordResetService.confirmPasswordReset({
          token: validHexToken,
          newPassword: 'NewSecurePassword123!'
        })
      ).rejects.toThrow(UnauthorizedError);
    });

    it('rejects inactive user with UnauthorizedError', async () => {
      vi.spyOn(authRepository, 'findPasswordResetTokenByHash').mockResolvedValue({
        ...mockResetRecord,
        user: { ...mockUser, isActive: false }
      });

      await expect(
        passwordResetService.confirmPasswordReset({
          token: validHexToken,
          newPassword: 'NewSecurePassword123!'
        })
      ).rejects.toThrow(UnauthorizedError);
    });

    it('throws UnauthorizedError if atomic transaction fails (e.g. concurrent consumption)', async () => {
      vi.spyOn(authRepository, 'findPasswordResetTokenByHash').mockResolvedValue(mockResetRecord);
      vi.spyOn(passwordService, 'hashPassword').mockResolvedValue('hash');
      vi.spyOn(authRepository, 'executePasswordResetTransaction').mockRejectedValue(new Error('Concurrency conflict'));

      await expect(
        passwordResetService.confirmPasswordReset({
          token: validHexToken,
          newPassword: 'NewSecurePassword123!'
        })
      ).rejects.toThrow(UnauthorizedError);
    });
  });

  describe('confirmPasswordSetup', () => {
    const mockSetupRecord = {
      id: 'setup-uuid-1',
      userId: mockUser.id,
      tokenHash: validTokenHash,
      tokenType: TOKEN_TYPES.SETUP,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours in future
      usedAt: null,
      user: {
        ...mockUser,
        passwordHash: '!LOCKED_PARENT_NO_DIRECT_AUTH'
      }
    };

    it('successfully confirms password setup for locked account using valid SETUP token', async () => {
      vi.spyOn(authRepository, 'findPasswordResetTokenByHash').mockResolvedValue(mockSetupRecord);
      vi.spyOn(passwordService, 'hashPassword').mockResolvedValue('$argon2id$v=19$m=65536,t=3,p=4$newArgonHash');
      vi.spyOn(authRepository, 'executePasswordResetTransaction').mockResolvedValue({
        user: { ...mockUser, passwordHash: '$argon2id$newArgonHash', tokenVersion: 2 },
        token: { ...mockSetupRecord, usedAt: new Date() },
        revokedSessions: { count: 0 }
      });

      const result = await passwordResetService.confirmPasswordSetup({
        token: validHexToken,
        newPassword: 'FirstTimePassword123!'
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Account password has been successfully configured');

      expect(authRepository.findPasswordResetTokenByHash).toHaveBeenCalledWith(validTokenHash);
      expect(passwordService.hashPassword).toHaveBeenCalledWith('FirstTimePassword123!');
      expect(authRepository.executePasswordResetTransaction).toHaveBeenCalledWith({
        tokenId: mockSetupRecord.id,
        userId: mockUser.id,
        newPasswordHash: '$argon2id$v=19$m=65536,t=3,p=4$newArgonHash'
      });
    });

    it('rejects RESET token supplied to SETUP endpoint', async () => {
      vi.spyOn(authRepository, 'findPasswordResetTokenByHash').mockResolvedValue({
        ...mockSetupRecord,
        tokenType: TOKEN_TYPES.RESET
      });

      await expect(
        passwordResetService.confirmPasswordSetup({
          token: validHexToken,
          newPassword: 'FirstTimePassword123!'
        })
      ).rejects.toThrow(UnauthorizedError);
    });

    it('rejects expired or used setup token', async () => {
      vi.spyOn(authRepository, 'findPasswordResetTokenByHash').mockResolvedValue({
        ...mockSetupRecord,
        usedAt: new Date()
      });

      await expect(
        passwordResetService.confirmPasswordSetup({
          token: validHexToken,
          newPassword: 'FirstTimePassword123!'
        })
      ).rejects.toThrow(UnauthorizedError);
    });
  });

  describe('changePassword', () => {
    it('successfully changes password, verifies current password, hashes new password, and revokes sessions', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockUser);
      vi.spyOn(passwordService, 'verifyPassword').mockResolvedValue(true);
      vi.spyOn(passwordService, 'hashPassword').mockResolvedValue('$argon2id$v=19$m=65536,t=3,p=4$changedArgonHash');
      vi.spyOn(authRepository, 'executePasswordChangeTransaction').mockResolvedValue({
        user: { ...mockUser, tokenVersion: 2 },
        revokedSessions: { count: 2 }
      });

      const result = await passwordResetService.changePassword({
        userId: mockUser.id,
        currentPassword: 'CurrentPassword123!',
        newPassword: 'NewBrandPassword123!'
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Password changed successfully');

      expect(authRepository.findUserById).toHaveBeenCalledWith(mockUser.id, { includePassword: true });
      expect(passwordService.verifyPassword).toHaveBeenCalledWith(mockUser.passwordHash, 'CurrentPassword123!');
      expect(passwordService.hashPassword).toHaveBeenCalledWith('NewBrandPassword123!');
      expect(authRepository.executePasswordChangeTransaction).toHaveBeenCalledWith({
        userId: mockUser.id,
        newPasswordHash: '$argon2id$v=19$m=65536,t=3,p=4$changedArgonHash'
      });
    });

    it('rejects if userId is missing', async () => {
      await expect(
        passwordResetService.changePassword({
          userId: null,
          currentPassword: 'CurrentPassword123!',
          newPassword: 'NewBrandPassword123!'
        })
      ).rejects.toThrow(UnauthorizedError);
    });

    it('rejects if newPassword is identical to currentPassword', async () => {
      await expect(
        passwordResetService.changePassword({
          userId: mockUser.id,
          currentPassword: 'SamePassword123!',
          newPassword: 'SamePassword123!'
        })
      ).rejects.toThrow(ValidationError);
    });

    it('rejects if target account has locked password marker (!LOCKED_*)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue({
        ...mockUser,
        passwordHash: '!LOCKED_FIREBASE_AUTH_MANAGED'
      });

      await expect(
        passwordResetService.changePassword({
          userId: mockUser.id,
          currentPassword: 'SomePassword123!',
          newPassword: 'NewBrandPassword123!'
        })
      ).rejects.toThrow(ForbiddenError);
    });

    it('rejects if current password verification fails', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockUser);
      vi.spyOn(passwordService, 'verifyPassword').mockResolvedValue(false);

      await expect(
        passwordResetService.changePassword({
          userId: mockUser.id,
          currentPassword: 'WrongPassword123!',
          newPassword: 'NewBrandPassword123!'
        })
      ).rejects.toThrow(UnauthorizedError);
    });

    it('rejects if new password fails password policy', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockUser);
      vi.spyOn(passwordService, 'verifyPassword').mockResolvedValue(true);

      await expect(
        passwordResetService.changePassword({
          userId: mockUser.id,
          currentPassword: 'CurrentPassword123!',
          newPassword: 'weak'
        })
      ).rejects.toThrow(ValidationError);
    });

    it('rejects if user is inactive', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue({
        ...mockUser,
        isActive: false
      });

      await expect(
        passwordResetService.changePassword({
          userId: mockUser.id,
          currentPassword: 'CurrentPassword123!',
          newPassword: 'NewBrandPassword123!'
        })
      ).rejects.toThrow(UnauthorizedError);
    });
  });
});
