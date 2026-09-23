import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import * as passwordResetService from '../../../src/modules/auth/password-reset.service.js';
import * as authRepository from '../../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../../src/modules/auth/token.service.js';
import { UnauthorizedError, ForbiddenError } from '../../../src/utils/app-error.js';
import { ERROR_CODES } from '../../../src/config/constants.js';

describe('Password Lifecycle HTTP Integration Tests', () => {
  const app = createApp();
  const validHexToken = 'a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/v1/auth/password-reset/request', () => {
    it('returns 200 with generic message for valid email', async () => {
      vi.spyOn(passwordResetService, 'requestPasswordReset').mockResolvedValue({
        success: true,
        message: 'If an account exists for this email, password reset instructions have been sent.'
      });

      const res = await request(app)
        .post('/api/v1/auth/password-reset/request')
        .send({ email: 'teacher@school.edu' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('If an account exists for this email');
      expect(passwordResetService.requestPasswordReset).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'teacher@school.edu' })
      );
    });

    it('returns 200 with generic message for non-existent email (enumeration resistance)', async () => {
      vi.spyOn(passwordResetService, 'requestPasswordReset').mockResolvedValue({
        success: true,
        message: 'If an account exists for this email, password reset instructions have been sent.'
      });

      const res = await request(app)
        .post('/api/v1/auth/password-reset/request')
        .send({ email: 'nonexistent@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('If an account exists for this email');
    });

    it('returns 400 when email format is invalid', async () => {
      const res = await request(app)
        .post('/api/v1/auth/password-reset/request')
        .send({ email: 'not-an-email' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    });

    it('returns 400 when email is missing', async () => {
      const res = await request(app)
        .post('/api/v1/auth/password-reset/request')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/auth/password-reset/confirm', () => {
    it('returns 200 with success message on valid 64-hex token and compliant password', async () => {
      vi.spyOn(passwordResetService, 'confirmPasswordReset').mockResolvedValue({
        success: true,
        message: 'Password has been successfully updated. Please log in with your new credentials.'
      });

      const res = await request(app)
        .post('/api/v1/auth/password-reset/confirm')
        .send({
          token: validHexToken,
          newPassword: 'NewPassword123!'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('Password has been successfully updated');
      expect(passwordResetService.confirmPasswordReset).toHaveBeenCalledWith(
        expect.objectContaining({
          token: validHexToken,
          newPassword: 'NewPassword123!'
        })
      );
    });

    it('returns 400 when token is not a 64-character hex string', async () => {
      const res = await request(app)
        .post('/api/v1/auth/password-reset/confirm')
        .send({
          token: 'invalid-non-hex-or-short',
          newPassword: 'NewPassword123!'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    });

    it('returns 400 when new password is too short (<8 chars)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/password-reset/confirm')
        .send({
          token: validHexToken,
          newPassword: 'short'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 401 when token is invalid or expired in service layer', async () => {
      vi.spyOn(passwordResetService, 'confirmPasswordReset').mockRejectedValue(
        new UnauthorizedError('Invalid or expired password reset token', ERROR_CODES.INVALID_TOKEN)
      );

      const res = await request(app)
        .post('/api/v1/auth/password-reset/confirm')
        .send({
          token: validHexToken,
          newPassword: 'ValidPassword123!'
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ERROR_CODES.INVALID_TOKEN);
    });
  });

  describe('POST /api/v1/auth/password-setup/confirm', () => {
    it('returns 200 with success message on valid 64-hex SETUP token and compliant password', async () => {
      vi.spyOn(passwordResetService, 'confirmPasswordSetup').mockResolvedValue({
        success: true,
        message: 'Account password has been successfully configured. Please log in with your new credentials.'
      });

      const res = await request(app)
        .post('/api/v1/auth/password-setup/confirm')
        .send({
          token: validHexToken,
          newPassword: 'FirstPassword123!'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('Account password has been successfully configured');
    });

    it('returns 400 when token format is invalid', async () => {
      const res = await request(app)
        .post('/api/v1/auth/password-setup/confirm')
        .send({
          token: '12345',
          newPassword: 'FirstPassword123!'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 401 when setup token is expired or invalid', async () => {
      vi.spyOn(passwordResetService, 'confirmPasswordSetup').mockRejectedValue(
        new UnauthorizedError('Invalid or expired setup token', ERROR_CODES.INVALID_TOKEN)
      );

      const res = await request(app)
        .post('/api/v1/auth/password-setup/confirm')
        .send({
          token: validHexToken,
          newPassword: 'FirstPassword123!'
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/auth/change-password', () => {
    const mockUserId = 'e9c4e270-26e1-43ac-8279-886ec13f4776';
    const mockAuthUser = {
      id: mockUserId,
      schoolId: '25e9637a-7fa4-4ac2-b43d-b4c0edcf2932',
      email: 'teacher@school.edu',
      systemRole: 'TENANT_USER',
      tokenVersion: 1,
      isActive: true
    };

    const setupAuthMocks = () => {
      vi.spyOn(tokenService, 'verifyAccessToken').mockReturnValue({
        sub: mockUserId,
        systemRole: 'TENANT_USER',
        tokenVersion: 1
      });
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAuthUser);
    };

    it('returns 401 when request is unauthenticated', async () => {
      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .send({
          currentPassword: 'CurrentPassword123!',
          newPassword: 'NewPassword123!'
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 200 and clears cookie when authenticated user provides valid credentials', async () => {
      setupAuthMocks();
      vi.spyOn(passwordResetService, 'changePassword').mockResolvedValue({
        success: true,
        message: 'Password changed successfully. All previous sessions have been invalidated.'
      });

      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', 'Bearer valid-jwt-token')
        .send({
          currentPassword: 'CurrentPassword123!',
          newPassword: 'NewPassword123!'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('Password changed successfully');

      // Verify refresh cookie cleared
      const setCookie = res.headers['set-cookie'];
      expect(setCookie).toBeDefined();
      expect(setCookie[0]).toContain('sms_refresh_token=;');
    });

    it('returns 400 when missing newPassword', async () => {
      setupAuthMocks();

      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', 'Bearer valid-jwt-token')
        .send({
          currentPassword: 'CurrentPassword123!'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 401 when current password is wrong', async () => {
      setupAuthMocks();
      vi.spyOn(passwordResetService, 'changePassword').mockRejectedValue(
        new UnauthorizedError('Current password is incorrect', ERROR_CODES.INVALID_CREDENTIALS)
      );

      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', 'Bearer valid-jwt-token')
        .send({
          currentPassword: 'WrongPassword123!',
          newPassword: 'NewPassword123!'
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ERROR_CODES.INVALID_CREDENTIALS);
    });

    it('returns 403 when user is locked (!LOCKED_*)', async () => {
      setupAuthMocks();
      vi.spyOn(passwordResetService, 'changePassword').mockRejectedValue(
        new ForbiddenError(
          'Password cannot be changed on a locked account. Please use password setup.',
          ERROR_CODES.PASSWORD_NOT_SET
        )
      );

      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', 'Bearer valid-jwt-token')
        .send({
          currentPassword: 'SomePassword123!',
          newPassword: 'NewPassword123!'
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ERROR_CODES.PASSWORD_NOT_SET);
    });
  });

});
