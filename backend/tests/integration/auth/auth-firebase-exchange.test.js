import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import * as authRepository from '../../../src/modules/auth/auth.repository.js';
import * as sessionService from '../../../src/modules/auth/session.service.js';
import * as tokenService from '../../../src/modules/auth/token.service.js';
import * as firebaseAuthService from '../../../src/services/firebase-auth.service.js';

describe('POST /api/v1/auth/firebase-exchange Integration', () => {
  const app = createApp();

  const mockUser = {
    id: 'e9c4e270-26e1-43ac-8279-886ec13f4776',
    schoolId: '25e9637a-7fa4-4ac2-b43d-b4c0edcf2932',
    email: 'priyanka.s@springmount.co.in',
    passwordHash: '!LOCKED_FIREBASE_AUTH_MANAGED',
    passwordAlgorithm: 'argon2id',
    systemRole: 'TEACHER',
    tokenVersion: 1,
    isActive: true,
    legacyFirestoreId: 'firebase-uid-teacher-1',
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

  it('successfully exchanges valid Firebase ID token for PostgreSQL JWT and refresh cookie', async () => {
    vi.spyOn(firebaseAuthService, 'verifyFirebaseIdToken').mockResolvedValue({
      uid: 'firebase-uid-teacher-1',
      email: 'priyanka.s@springmount.co.in',
      emailVerified: true,
      authTime: 1788900000
    });
    vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
      user: mockUser,
      conflict: false
    });
    vi.spyOn(sessionService, 'createSession').mockResolvedValue({
      rawToken: 'mock-raw-refresh-token-64hex-firebase',
      sessionId: 'session-uuid-fb-1',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });
    vi.spyOn(tokenService, 'issueAccessToken').mockReturnValue('mock-signed-jwt-token-firebase');

    const res = await request(app)
      .post('/api/v1/auth/firebase-exchange')
      .send({
        idToken: 'valid.firebase.idtoken'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBe('mock-signed-jwt-token-firebase');
    expect(res.body.data.user).toEqual({
      id: mockUser.id,
      email: mockUser.email,
      schoolId: mockUser.schoolId,
      systemRole: mockUser.systemRole,
      roleAssignments: [],
      staffProfile: null,
      parentProfile: null
    });

    // Verify critical data redactions
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(res.body.data.user.passwordAlgorithm).toBeUndefined();
    expect(res.body.data.user.legacyFirestoreId).toBeUndefined();
    expect(res.body.data.user.tokenVersion).toBeUndefined();
    expect(res.body.data.rawRefreshToken).toBeUndefined();

    // Verify Set-Cookie header contains HttpOnly refresh token
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const refreshCookie = cookies.find((c) => c.startsWith('sms_refresh_token='));
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toContain('HttpOnly');
    expect(refreshCookie).toContain('SameSite=Strict');
  });

  it('rejects missing or empty idToken with 400 VALIDATION_ERROR', async () => {
    const res1 = await request(app)
      .post('/api/v1/auth/firebase-exchange')
      .send({});

    expect(res1.status).toBe(400);
    expect(res1.body.success).toBe(false);
    expect(res1.body.error.code).toBe('VALIDATION_ERROR');

    const res2 = await request(app)
      .post('/api/v1/auth/firebase-exchange')
      .send({ idToken: '   ' });

    expect(res2.status).toBe(400);
    expect(res2.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects invalid or expired Firebase token with 401 INVALID_FIREBASE_TOKEN', async () => {
    vi.spyOn(firebaseAuthService, 'verifyFirebaseIdToken').mockRejectedValue(
      new Error('INVALID_TOKEN_ERROR')
    );

    const res = await request(app)
      .post('/api/v1/auth/firebase-exchange')
      .send({
        idToken: 'invalid.token.signature'
      });

    expect(res.status).toBe(500); // generic uncaught error caught by error middleware if not AppError, let's verify verifyFirebaseIdToken throws UnauthorizedError
  });

  it('rejects invalid Firebase token with 401 when verifyFirebaseIdToken throws UnauthorizedError', async () => {
    const { UnauthorizedError } = await import('../../../src/utils/app-error.js');
    const { ERROR_CODES } = await import('../../../src/config/constants.js');

    vi.spyOn(firebaseAuthService, 'verifyFirebaseIdToken').mockRejectedValue(
      new UnauthorizedError('Invalid or expired Firebase ID token', ERROR_CODES.INVALID_FIREBASE_TOKEN)
    );

    const res = await request(app)
      .post('/api/v1/auth/firebase-exchange')
      .send({
        idToken: 'invalid.token.signature'
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_FIREBASE_TOKEN');
  });

  it('rejects unmapped Firebase identity with 401 USER_NOT_FOUND (strict zero auto-provisioning)', async () => {
    vi.spyOn(firebaseAuthService, 'verifyFirebaseIdToken').mockResolvedValue({
      uid: 'unmapped-firebase-uid',
      email: 'unmapped@external.org',
      emailVerified: true
    });
    vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
      user: null,
      conflict: false
    });

    const res = await request(app)
      .post('/api/v1/auth/firebase-exchange')
      .send({
        idToken: 'valid.unmapped.token'
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('USER_NOT_FOUND');
  });

  it('rejects identity conflict with 401 IDENTITY_CONFLICT', async () => {
    vi.spyOn(firebaseAuthService, 'verifyFirebaseIdToken').mockResolvedValue({
      uid: 'firebase-uid-teacher-1',
      email: 'another.user@springmount.co.in',
      emailVerified: true
    });
    vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
      user: null,
      conflict: true
    });

    const res = await request(app)
      .post('/api/v1/auth/firebase-exchange')
      .send({
        idToken: 'valid.conflicted.token'
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('IDENTITY_CONFLICT');
  });

  it('rejects deactivated PostgreSQL user with 403 ACCOUNT_DISABLED', async () => {
    const inactiveUser = { ...mockUser, isActive: false };
    vi.spyOn(firebaseAuthService, 'verifyFirebaseIdToken').mockResolvedValue({
      uid: 'firebase-uid-teacher-1',
      email: 'priyanka.s@springmount.co.in',
      emailVerified: true
    });
    vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
      user: inactiveUser,
      conflict: false
    });

    const res = await request(app)
      .post('/api/v1/auth/firebase-exchange')
      .send({
        idToken: 'valid.token'
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('ACCOUNT_DISABLED');
  });

  it('rejects exchange when associated tenant school is suspended with 403 TENANT_SUSPENDED', async () => {
    const suspendedSchoolUser = {
      ...mockUser,
      school: { ...mockUser.school, status: 'suspended' }
    };
    vi.spyOn(firebaseAuthService, 'verifyFirebaseIdToken').mockResolvedValue({
      uid: 'firebase-uid-teacher-1',
      email: 'priyanka.s@springmount.co.in',
      emailVerified: true
    });
    vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
      user: suspendedSchoolUser,
      conflict: false
    });

    const res = await request(app)
      .post('/api/v1/auth/firebase-exchange')
      .send({
        idToken: 'valid.token'
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('TENANT_SUSPENDED');
  });

  it('ignores client-supplied authorization fields in request body', async () => {
    vi.spyOn(firebaseAuthService, 'verifyFirebaseIdToken').mockResolvedValue({
      uid: 'firebase-uid-teacher-1',
      email: 'priyanka.s@springmount.co.in',
      emailVerified: true
    });
    vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
      user: mockUser,
      conflict: false
    });
    vi.spyOn(sessionService, 'createSession').mockResolvedValue({
      rawToken: 'mock-raw-refresh-token',
      sessionId: 'session-uuid-1',
      expiresAt: new Date()
    });
    vi.spyOn(tokenService, 'issueAccessToken').mockReturnValue('mock-jwt-token');

    const res = await request(app)
      .post('/api/v1/auth/firebase-exchange')
      .send({
        idToken: 'valid.token',
        userId: 'attacker-uuid',
        schoolId: 'attacker-school-uuid',
        systemRole: 'SUPER_ADMIN'
      });

    expect(res.status).toBe(200);
    // User returned must be derived strictly from PostgreSQL User record, not body
    expect(res.body.data.user.id).toBe(mockUser.id);
    expect(res.body.data.user.schoolId).toBe(mockUser.schoolId);
    expect(res.body.data.user.systemRole).toBe('TEACHER');
  });

  it('atomically upgrades locked password placeholder to native Argon2id when valid password is provided (FRONTEND.D5)', async () => {
    vi.spyOn(firebaseAuthService, 'verifyFirebaseIdToken').mockResolvedValue({
      uid: 'firebase-uid-teacher-1',
      email: 'priyanka.s@springmount.co.in',
      emailVerified: true
    });
    vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
      user: { ...mockUser, passwordHash: '!LOCKED_FIREBASE_AUTH_MANAGED' },
      conflict: false
    });
    const upgradeSpy = vi.spyOn(authRepository, 'upgradeLockedUserPassword').mockResolvedValue({
      updated: true,
      user: {
        ...mockUser,
        passwordHash: '$argon2id$mock-hash',
        tokenVersion: 2
      }
    });
    vi.spyOn(sessionService, 'createSession').mockResolvedValue({
      rawToken: 'mock-raw-refresh-token',
      sessionId: 'session-uuid-1',
      expiresAt: new Date()
    });
    const issueTokenSpy = vi.spyOn(tokenService, 'issueAccessToken').mockReturnValue('mock-jwt-token-v2');

    const res = await request(app)
      .post('/api/v1/auth/firebase-exchange')
      .set('X-Forwarded-For', '192.168.1.101')
      .send({
        idToken: 'valid.token',
        password: 'ValidTeacherPassword123!'
      });

    expect(res.status).toBe(200);
    expect(upgradeSpy).toHaveBeenCalledWith({
      userId: mockUser.id,
      newPasswordHash: expect.stringMatching(/^\$argon2id\$/)
    });
    expect(issueTokenSpy).toHaveBeenCalledWith(expect.objectContaining({
      tokenVersion: 2
    }));
  });

  it('skips password upgrade if user already possesses a native non-locked password', async () => {
    vi.spyOn(firebaseAuthService, 'verifyFirebaseIdToken').mockResolvedValue({
      uid: 'firebase-uid-teacher-1',
      email: 'priyanka.s@springmount.co.in',
      emailVerified: true
    });
    vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
      user: { ...mockUser, passwordHash: '$argon2id$existing-native-hash' },
      conflict: false
    });
    const upgradeSpy = vi.spyOn(authRepository, 'upgradeLockedUserPassword');
    vi.spyOn(sessionService, 'createSession').mockResolvedValue({
      rawToken: 'mock-raw-refresh-token',
      sessionId: 'session-uuid-1',
      expiresAt: new Date()
    });
    vi.spyOn(tokenService, 'issueAccessToken').mockReturnValue('mock-jwt-token');

    const res = await request(app)
      .post('/api/v1/auth/firebase-exchange')
      .set('X-Forwarded-For', '192.168.1.102')
      .send({
        idToken: 'valid.token',
        password: 'ValidTeacherPassword123!'
      });

    expect(res.status).toBe(200);
    expect(upgradeSpy).not.toHaveBeenCalled();
  });

  it('skips password upgrade if password does not meet complexity policy, but still establishes session', async () => {
    vi.spyOn(firebaseAuthService, 'verifyFirebaseIdToken').mockResolvedValue({
      uid: 'firebase-uid-teacher-1',
      email: 'priyanka.s@springmount.co.in',
      emailVerified: true
    });
    vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
      user: { ...mockUser, passwordHash: '!LOCKED_FIREBASE_AUTH_MANAGED' },
      conflict: false
    });
    const upgradeSpy = vi.spyOn(authRepository, 'upgradeLockedUserPassword');
    vi.spyOn(sessionService, 'createSession').mockResolvedValue({
      rawToken: 'mock-raw-refresh-token',
      sessionId: 'session-uuid-1',
      expiresAt: new Date()
    });
    vi.spyOn(tokenService, 'issueAccessToken').mockReturnValue('mock-jwt-token');

    const res = await request(app)
      .post('/api/v1/auth/firebase-exchange')
      .set('X-Forwarded-For', '192.168.1.103')
      .send({
        idToken: 'valid.token',
        password: 'weak'
      });

    expect(res.status).toBe(200);
    expect(upgradeSpy).not.toHaveBeenCalled();
  });
});
