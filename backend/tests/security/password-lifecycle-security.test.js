import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'node:crypto';
import { createApp } from '../../src/app.js';
import * as authRepository from '../../src/modules/auth/auth.repository.js';
import * as passwordResetService from '../../src/modules/auth/password-reset.service.js';
import * as tokenService from '../../src/modules/auth/token.service.js';
import * as emailService from '../../src/services/email.service.js';

import { TOKEN_TYPES, ERROR_CODES } from '../../src/config/constants.js';

describe('Password Lifecycle Security & Transaction Tests', () => {
  const app = createApp();

  const mockUser = {
    id: 'e9c4e270-26e1-43ac-8279-886ec13f4776',
    schoolId: '25e9637a-7fa4-4ac2-b43d-b4c0edcf2932',
    email: 'priyanka.s@springmount.co.in',
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
    emailService.clearSentEmails();
  });

  describe('1. Account Enumeration Resistance', () => {
    it('returns exact identical response status, headers, and body structure for existing vs non-existing emails', async () => {
      // Case A: Existing user
      vi.spyOn(authRepository, 'findUserByEmail').mockResolvedValue(mockUser);
      vi.spyOn(authRepository, 'invalidateUserResetTokens').mockResolvedValue({ count: 1 });
      vi.spyOn(authRepository, 'createPasswordResetToken').mockResolvedValue({ id: 'tok-1' });

      const resExisting = await request(app)
        .post('/api/v1/auth/password-reset/request')
        .send({ email: 'priyanka.s@springmount.co.in' });

      // Case B: Non-existing user
      vi.spyOn(authRepository, 'findUserByEmail').mockResolvedValue(null);

      const resNonExisting = await request(app)
        .post('/api/v1/auth/password-reset/request')
        .send({ email: 'ghost.user@springmount.co.in' });

      expect(resExisting.status).toBe(200);
      expect(resNonExisting.status).toBe(200);

      expect(resExisting.body).toEqual(resNonExisting.body);
      expect(resExisting.body).toEqual({
        success: true,
        data: null,
        message: 'If an account exists for this email, password reset instructions have been sent.'
      });
    });

    it('does not leak account existence or send email for deactivated accounts', async () => {
      vi.spyOn(authRepository, 'findUserByEmail').mockResolvedValue({ ...mockUser, isActive: false });

      const res = await request(app)
        .post('/api/v1/auth/password-reset/request')
        .send({ email: 'priyanka.s@springmount.co.in' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(emailService.getSentEmails()).toHaveLength(0);
    });

    it('does not leak account existence or send email for suspended school tenants', async () => {
      vi.spyOn(authRepository, 'findUserByEmail').mockResolvedValue({
        ...mockUser,
        school: { ...mockUser.school, status: 'suspended' }
      });

      const res = await request(app)
        .post('/api/v1/auth/password-reset/request')
        .send({ email: 'priyanka.s@springmount.co.in' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(emailService.getSentEmails()).toHaveLength(0);
    });
  });

  describe('2. Cross-User & Cross-Tenant Spoofing Prevention', () => {
    it('ignores client-supplied userId and schoolId in body on change-password and derives identity strictly from verified JWT', async () => {
      const attackerJwtUser = {
        id: 'attacker-uuid-1',
        schoolId: 'school-a',
        email: 'attacker@school-a.edu',
        systemRole: 'TENANT_USER',
        tokenVersion: 1,
        isActive: true
      };

      vi.spyOn(tokenService, 'verifyAccessToken').mockReturnValue({
        sub: attackerJwtUser.id,
        tokenVersion: 1
      });
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(attackerJwtUser);
      const changePasswordSpy = vi.spyOn(passwordResetService, 'changePassword').mockResolvedValue({
        success: true,
        message: 'Password changed successfully. All previous sessions have been invalidated.'
      });

      const victimUserId = 'victim-uuid-999';
      const victimSchoolId = 'school-b';

      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', 'Bearer attacker-valid-jwt')
        .send({
          userId: victimUserId,
          schoolId: victimSchoolId,
          currentPassword: 'AttackerPassword123!',
          newPassword: 'NewAttackerPassword123!'
        });

      expect(res.status).toBe(200);
      expect(changePasswordSpy).toHaveBeenCalledWith({
        userId: attackerJwtUser.id,
        currentPassword: 'AttackerPassword123!',
        newPassword: 'NewAttackerPassword123!',
        ipAddress: expect.any(String)
      });
      expect(changePasswordSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({ userId: victimUserId })
      );
    });
  });

  describe('3. Single-Use Token & Concurrent Reuse Prevention', () => {
    it('prevents concurrent double-spend race condition on reset token', async () => {
      const mockResetRecord = {
        id: 'token-uuid-1',
        userId: mockUser.id,
        tokenHash: validTokenHash,
        tokenType: TOKEN_TYPES.RESET,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        usedAt: null,
        user: mockUser
      };

      let executionCount = 0;
      vi.spyOn(authRepository, 'findPasswordResetTokenByHash').mockResolvedValue(mockResetRecord);
      vi.spyOn(authRepository, 'executePasswordResetTransaction').mockImplementation(async () => {
        executionCount += 1;
        if (executionCount > 1) {
          throw new Error('TOKEN_CONCURRENCY_OR_EXPIRED');
        }
        return { success: true, user: mockUser };
      });

      // Simulate 2 parallel confirmation requests
      const [reqA, reqB] = await Promise.all([
        request(app).post('/api/v1/auth/password-reset/confirm').send({
          token: validHexToken,
          newPassword: 'NewSecurePassword123!'
        }),
        request(app).post('/api/v1/auth/password-reset/confirm').send({
          token: validHexToken,
          newPassword: 'NewSecurePassword123!'
        })
      ]);

      const statuses = [reqA.status, reqB.status].sort();
      expect(statuses).toEqual([200, 401]);

      const successfulRes = reqA.status === 200 ? reqA : reqB;
      const failedRes = reqA.status === 401 ? reqA : reqB;

      expect(successfulRes.body.success).toBe(true);
      expect(failedRes.body.success).toBe(false);
      expect(failedRes.body.error.code).toBe(ERROR_CODES.INVALID_TOKEN);
    });

    it('rejects token replay after it has already been marked usedAt', async () => {
      vi.spyOn(authRepository, 'findPasswordResetTokenByHash').mockResolvedValue({
        id: 'token-uuid-1',
        userId: mockUser.id,
        tokenHash: validTokenHash,
        tokenType: TOKEN_TYPES.RESET,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        usedAt: new Date(Date.now() - 5000),
        user: mockUser
      });

      const res = await request(app)
        .post('/api/v1/auth/password-reset/confirm')
        .send({
          token: validHexToken,
          newPassword: 'NewSecurePassword123!'
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ERROR_CODES.INVALID_TOKEN);
    });
  });

  describe('4. Token Type Boundary Enforcement', () => {
    it('rejects SETUP token presented to password-reset/confirm', async () => {
      vi.spyOn(authRepository, 'findPasswordResetTokenByHash').mockResolvedValue({
        id: 'token-uuid-1',
        userId: mockUser.id,
        tokenHash: validTokenHash,
        tokenType: TOKEN_TYPES.SETUP,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        usedAt: null,
        user: mockUser
      });

      const res = await request(app)
        .post('/api/v1/auth/password-reset/confirm')
        .send({
          token: validHexToken,
          newPassword: 'NewSecurePassword123!'
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ERROR_CODES.INVALID_TOKEN);
    });

    it('rejects RESET token presented to password-setup/confirm', async () => {
      vi.spyOn(authRepository, 'findPasswordResetTokenByHash').mockResolvedValue({
        id: 'token-uuid-1',
        userId: mockUser.id,
        tokenHash: validTokenHash,
        tokenType: TOKEN_TYPES.RESET,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        usedAt: null,
        user: mockUser
      });

      const res = await request(app)
        .post('/api/v1/auth/password-setup/confirm')
        .send({
          token: validHexToken,
          newPassword: 'NewSecurePassword123!'
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ERROR_CODES.INVALID_TOKEN);
    });
  });

  describe('5. Session Invalidation & Stale JWT Rejection', () => {
    it('rejects prior JWT access token after tokenVersion increment from password change', async () => {
      // Scenario: User had tokenVersion 1 when JWT was issued
      const oldJwtPayload = {
        sub: mockUser.id,
        systemRole: 'TENANT_USER',
        tokenVersion: 1
      };

      vi.spyOn(tokenService, 'verifyAccessToken').mockReturnValue(oldJwtPayload);

      // In database, tokenVersion was incremented to 2 after password change
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue({
        ...mockUser,
        tokenVersion: 2
      });

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer old-version-1-jwt');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Access token has been invalidated');
    });
  });

  describe('6. Redaction & Credential Leakage Prevention', () => {
    it('never exposes passwordHash, passwordAlgorithm, or raw reset tokens in API responses', async () => {
      vi.spyOn(passwordResetService, 'requestPasswordReset').mockResolvedValue({
        success: true,
        message: 'If an account exists for this email, password reset instructions have been sent.'
      });

      const res = await request(app)
        .post('/api/v1/auth/password-reset/request')
        .send({ email: 'priyanka.s@springmount.co.in' });

      const stringifiedBody = JSON.stringify(res.body);
      expect(stringifiedBody).not.toContain('passwordHash');
      expect(stringifiedBody).not.toContain('argon2id');
      expect(stringifiedBody).not.toContain('tokenHash');
      expect(stringifiedBody).not.toContain(validHexToken);
    });
  });
});
