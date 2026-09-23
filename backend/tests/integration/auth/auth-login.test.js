import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import * as authRepository from '../../../src/modules/auth/auth.repository.js';
import * as passwordService from '../../../src/modules/auth/password.service.js';
import * as sessionService from '../../../src/modules/auth/session.service.js';
import * as tokenService from '../../../src/modules/auth/token.service.js';

describe('POST /api/v1/auth/login Integration', () => {
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

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('successfully logs in with valid credentials, sets HttpOnly cookie, and returns minimal safe user', async () => {
    vi.spyOn(authRepository, 'findUserByEmail').mockResolvedValue(mockUser);
    vi.spyOn(passwordService, 'isLockedPassword').mockReturnValue(false);
    vi.spyOn(passwordService, 'verifyPassword').mockResolvedValue(true);
    vi.spyOn(sessionService, 'createSession').mockResolvedValue({
      rawToken: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      sessionId: 'session-uuid-1',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });
    vi.spyOn(tokenService, 'issueAccessToken').mockReturnValue('mock-signed-jwt-token');

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        identifier: 'priyanka.s@springmount.co.in',
        password: 'ValidPassword123!'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBe('mock-signed-jwt-token');
    expect(res.body.data.user).toEqual({
      id: mockUser.id,
      email: mockUser.email,
      schoolId: mockUser.schoolId,
      systemRole: mockUser.systemRole
    });

    // Verify critical redactions
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(res.body.data.user.passwordAlgorithm).toBeUndefined();
    expect(res.body.data.user.legacyFirestoreId).toBeUndefined();
    expect(res.body.data.rawRefreshToken).toBeUndefined();

    // Verify Set-Cookie header contains HttpOnly refresh token
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const refreshCookie = cookies.find((c) => c.startsWith('sms_refresh_token='));
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toContain('HttpOnly');
    expect(refreshCookie).toContain('SameSite=Strict');
  });

  it('rejects unknown email with generic 401 UNAUTHORIZED (prevents enumeration)', async () => {
    vi.spyOn(authRepository, 'findUserByEmail').mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        identifier: 'nonexistent@school.edu',
        password: 'SomePassword123!'
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects incorrect password with generic 401 UNAUTHORIZED', async () => {
    vi.spyOn(authRepository, 'findUserByEmail').mockResolvedValue(mockUser);
    vi.spyOn(passwordService, 'isLockedPassword').mockReturnValue(false);
    vi.spyOn(passwordService, 'verifyPassword').mockResolvedValue(false);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        identifier: mockUser.email,
        password: 'WrongPassword123!'
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects locked migrated accounts with 403 PASSWORD_NOT_SET', async () => {
    const lockedUser = { ...mockUser, passwordHash: '!LOCKED_FIREBASE_AUTH_MANAGED' };
    vi.spyOn(authRepository, 'findUserByEmail').mockResolvedValue(lockedUser);
    vi.spyOn(passwordService, 'isLockedPassword').mockReturnValue(true);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        identifier: mockUser.email,
        password: 'AnyPassword123!'
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('PASSWORD_NOT_SET');
  });

  it('rejects deactivated accounts with 403 ACCOUNT_DISABLED', async () => {
    const inactiveUser = { ...mockUser, isActive: false };
    vi.spyOn(authRepository, 'findUserByEmail').mockResolvedValue(inactiveUser);
    vi.spyOn(passwordService, 'isLockedPassword').mockReturnValue(false);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        identifier: mockUser.email,
        password: 'Password123!'
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('ACCOUNT_DISABLED');
  });

  it('rejects missing or empty request fields with 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
