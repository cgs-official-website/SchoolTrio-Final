import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { authenticate, optionalAuth } from '../../src/middleware/auth.middleware.js';
import { errorMiddleware } from '../../src/middleware/error.middleware.js';
import * as authRepository from '../../src/modules/auth/auth.repository.js';
import { issueAccessToken } from '../../src/modules/auth/token.service.js';

describe('Security: Authoritative JWT Authentication Middleware (auth.middleware.js)', () => {
  const sampleUser = {
    id: 'e9c4e270-26e1-43ac-8279-886ec13f4776',
    schoolId: '25e9637a-7fa4-4ac2-b43d-b4c0edcf2932',
    email: 'user@school.edu',
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

  const createTestApp = () => {
    const app = express();
    app.use(express.json());

    app.get('/protected', authenticate, (req, res) => {
      res.json({
        success: true,
        auth: req.auth,
        user: {
          id: req.user.id,
          schoolId: req.user.schoolId,
          systemRole: req.user.systemRole
        }
      });
    });

    app.get('/optional', optionalAuth, (req, res) => {
      res.json({
        success: true,
        authenticated: req.auth !== null,
        userId: req.auth?.userId || null
      });
    });

    app.use(errorMiddleware);
    return app;
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Header Extraction & Format Validation', () => {
    it('rejects missing Authorization header with 401 UNAUTHORIZED', async () => {
      const app = createTestApp();
      const res = await request(app).get('/protected');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
      expect(res.body.error.message).toContain('missing or invalid authorization header');
    });

    it('rejects non-Bearer scheme (e.g. Basic) with 401 UNAUTHORIZED', async () => {
      const app = createTestApp();
      const res = await request(app)
        .get('/protected')
        .set('Authorization', 'Basic dXNlcjpwYXNz');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('rejects empty Bearer token with 401 UNAUTHORIZED', async () => {
      const app = createTestApp();
      const res = await request(app)
        .get('/protected')
        .set('Authorization', 'Bearer ');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Cryptographic Token Verification', () => {
    it('rejects expired access token with 401 TOKEN_EXPIRED', async () => {
      const app = createTestApp();
      const expiredToken = issueAccessToken(
        {
          sub: sampleUser.id,
          schoolId: sampleUser.schoolId,
          systemRole: sampleUser.systemRole,
          tokenVersion: sampleUser.tokenVersion
        },
        { expiresIn: '-1s' }
      );

      const res = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('TOKEN_EXPIRED');
    });

    it('rejects token with forged/tampered signature with 401 INVALID_TOKEN', async () => {
      const app = createTestApp();
      const validToken = issueAccessToken({
        sub: sampleUser.id,
        schoolId: sampleUser.schoolId,
        systemRole: sampleUser.systemRole,
        tokenVersion: sampleUser.tokenVersion
      });

      const parts = validToken.split('.');
      const tamperedPayload = Buffer.from(JSON.stringify({ sub: 'forged-uuid' })).toString('base64url');
      const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

      const res = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${tamperedToken}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });

    it('rejects token signed with an unauthorized algorithm (none)', async () => {
      const app = createTestApp();
      const noneToken = jwt.sign(
        { sub: sampleUser.id, tokenVersion: 1 },
        '',
        { algorithm: 'none' }
      );

      const res = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${noneToken}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('rejects token signed with a different secret key', async () => {
      const app = createTestApp();
      const foreignToken = jwt.sign(
        { sub: sampleUser.id, tokenVersion: 1 },
        'different-secret-key-32-chars-long-012345',
        { algorithm: 'HS256', expiresIn: '15m' }
      );

      const res = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${foreignToken}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Authoritative PostgreSQL User State & TokenVersion Enforcement', () => {
    it('authenticates valid token and attaches authoritative PostgreSQL identity', async () => {
      const app = createTestApp();
      const token = issueAccessToken({
        sub: sampleUser.id,
        schoolId: sampleUser.schoolId,
        systemRole: sampleUser.systemRole,
        tokenVersion: sampleUser.tokenVersion
      });

      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(sampleUser);

      const res = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.auth).toEqual({
        userId: sampleUser.id,
        schoolId: sampleUser.schoolId,
        systemRole: sampleUser.systemRole,
        tokenVersion: sampleUser.tokenVersion,
        jti: expect.any(String)
      });
      expect(res.body.user.id).toBe(sampleUser.id);
    });

    it('rejects token if user is deleted from PostgreSQL (User not found)', async () => {
      const app = createTestApp();
      const token = issueAccessToken({
        sub: sampleUser.id,
        schoolId: sampleUser.schoolId,
        systemRole: sampleUser.systemRole,
        tokenVersion: sampleUser.tokenVersion
      });

      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(null);

      const res = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
      expect(res.body.error.message).toBe('User account not found');
    });

    it('rejects token if user is deactivated in PostgreSQL (403 ACCOUNT_DISABLED)', async () => {
      const app = createTestApp();
      const token = issueAccessToken({
        sub: sampleUser.id,
        schoolId: sampleUser.schoolId,
        systemRole: sampleUser.systemRole,
        tokenVersion: sampleUser.tokenVersion
      });

      vi.spyOn(authRepository, 'findUserById').mockResolvedValue({
        ...sampleUser,
        isActive: false
      });

      const res = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('ACCOUNT_DISABLED');
    });

    it('enforces tokenVersion: rejects stale token when User.tokenVersion was incremented (401 INVALID_TOKEN)', async () => {
      const app = createTestApp();
      // Token was issued at tokenVersion: 1
      const staleToken = issueAccessToken({
        sub: sampleUser.id,
        schoolId: sampleUser.schoolId,
        systemRole: sampleUser.systemRole,
        tokenVersion: 1
      });

      // User logged out-all or reset password; DB tokenVersion is now 2
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue({
        ...sampleUser,
        tokenVersion: 2
      });

      const res = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${staleToken}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
      expect(res.body.error.message).toContain('invalidated');
    });
  });

  describe('optionalAuth Middleware', () => {
    it('allows unauthenticated guest requests with null auth context', async () => {
      const app = createTestApp();
      const res = await request(app).get('/optional');

      expect(res.status).toBe(200);
      expect(res.body.authenticated).toBe(false);
      expect(res.body.userId).toBeNull();
    });

    it('populates auth context when valid token is provided', async () => {
      const app = createTestApp();
      const token = issueAccessToken({
        sub: sampleUser.id,
        schoolId: sampleUser.schoolId,
        systemRole: sampleUser.systemRole,
        tokenVersion: sampleUser.tokenVersion
      });

      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(sampleUser);

      const res = await request(app)
        .get('/optional')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.authenticated).toBe(true);
      expect(res.body.userId).toBe(sampleUser.id);
    });

    it('fails open to guest context if token is invalid or expired without crashing', async () => {
      const app = createTestApp();
      const res = await request(app)
        .get('/optional')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(200);
      expect(res.body.authenticated).toBe(false);
      expect(res.body.userId).toBeNull();
    });
  });
});
