import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import * as sessionService from '../../../src/modules/auth/session.service.js';
import * as tokenService from '../../../src/modules/auth/token.service.js';
import { UnauthorizedError } from '../../../src/utils/app-error.js';
import { ERROR_CODES } from '../../../src/config/constants.js';

describe('POST /api/v1/auth/refresh Integration', () => {
  const app = createApp();

  const mockUser = {
    id: 'e9c4e270-26e1-43ac-8279-886ec13f4776',
    schoolId: '25e9637a-7fa4-4ac2-b43d-b4c0edcf2932',
    email: 'user@school.edu',
    systemRole: 'TENANT_USER',
    tokenVersion: 1,
    isActive: true
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rotates refresh session from HttpOnly cookie and issues new access token', async () => {
    vi.spyOn(sessionService, 'rotateSession').mockResolvedValue({
      newRawToken: 'new-64-hex-refresh-token-value-1234567890abcdef1234567890abcdef',
      sessionId: 'new-session-id',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      user: mockUser
    });
    vi.spyOn(tokenService, 'issueAccessToken').mockReturnValue('new-mock-access-token');

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', ['sms_refresh_token=old-refresh-token-value']);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBe('new-mock-access-token');
    expect(res.body.data.user.id).toBe(mockUser.id);
    expect(res.body.data.rawRefreshToken).toBeUndefined();

    // Verify rotated cookie in response
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const rotatedCookie = cookies.find((c) => c.startsWith('sms_refresh_token='));
    expect(rotatedCookie).toBeDefined();
    expect(rotatedCookie).toContain('new-64-hex-refresh-token-value');
    expect(rotatedCookie).toContain('HttpOnly');
  });

  it('rejects request with missing refresh cookie with 401 INVALID_REFRESH_TOKEN', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('handles token reuse detection by returning 401 TOKEN_REUSE_DETECTED', async () => {
    vi.spyOn(sessionService, 'rotateSession').mockRejectedValue(
      new UnauthorizedError(
        'Refresh token reuse detected. All active sessions have been revoked.',
        ERROR_CODES.TOKEN_REUSE_DETECTED
      )
    );

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', ['sms_refresh_token=replayed-token']);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('TOKEN_REUSE_DETECTED');
  });

  it('handles expired refresh token with 401 REFRESH_TOKEN_EXPIRED', async () => {
    vi.spyOn(sessionService, 'rotateSession').mockRejectedValue(
      new UnauthorizedError('Refresh token has expired', ERROR_CODES.REFRESH_TOKEN_EXPIRED)
    );

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', ['sms_refresh_token=expired-token']);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('REFRESH_TOKEN_EXPIRED');
  });
});
