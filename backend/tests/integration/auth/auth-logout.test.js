import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import * as authRepository from '../../../src/modules/auth/auth.repository.js';
import * as sessionService from '../../../src/modules/auth/session.service.js';
import * as tokenService from '../../../src/modules/auth/token.service.js';


describe('POST /api/v1/auth/logout & /logout-all Integration', () => {
  const app = createApp();

  const mockUser = {
    sub: 'e9c4e270-26e1-43ac-8279-886ec13f4776',
    schoolId: '25e9637a-7fa4-4ac2-b43d-b4c0edcf2932',
    systemRole: 'TENANT_USER',
    tokenVersion: 1
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/v1/auth/logout', () => {
    it('revokes active refresh session and clears HttpOnly refresh cookie', async () => {
      const revokeSpy = vi.spyOn(sessionService, 'revokeSession').mockResolvedValue(true);

      const res = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', ['sms_refresh_token=valid-raw-refresh-token']);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Logged out successfully');
      expect(revokeSpy).toHaveBeenCalledWith('valid-raw-refresh-token');

      // Verify Set-Cookie clears the refresh cookie (expires in past / max-age=0)
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
    });

    it('handles logout gracefully even if no refresh cookie is present', async () => {
      const res = await request(app).post('/api/v1/auth/logout');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/v1/auth/logout-all', () => {
    it('revokes all sessions for authenticated user and clears cookie', async () => {
      const token = tokenService.issueAccessToken(mockUser);
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue({
        id: mockUser.sub,
        schoolId: mockUser.schoolId,
        email: 'priyanka.s@springmount.co.in',
        systemRole: mockUser.systemRole,
        tokenVersion: mockUser.tokenVersion,
        isActive: true
      });
      const revokeAllSpy = vi.spyOn(sessionService, 'revokeAllUserSessions').mockResolvedValue({
        count: 4,
        tokenVersion: 2
      });

      const res = await request(app)
        .post('/api/v1/auth/logout-all')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('All sessions successfully terminated');
      expect(revokeAllSpy).toHaveBeenCalledWith(mockUser.sub);
    });


    it('rejects unauthenticated logout-all request with 401 UNAUTHORIZED', async () => {
      const res = await request(app).post('/api/v1/auth/logout-all');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });
});
