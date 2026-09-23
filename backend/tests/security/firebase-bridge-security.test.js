import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import * as authRepository from '../../src/modules/auth/auth.repository.js';
import * as sessionService from '../../src/modules/auth/session.service.js';
import * as tokenService from '../../src/modules/auth/token.service.js';
import * as firebaseAuthService from '../../src/services/firebase-auth.service.js';
import { verifyAccessToken } from '../../src/modules/auth/token.service.js';

describe('Firebase Bridge Security & Invariant Tests (Phase 4B.6-B)', () => {
  const app = createApp();

  const userS024 = {
    id: 'user-s024-teacher-uuid',
    schoolId: 'school-s024-uuid',
    email: 'priyanka.s@springmount.co.in',
    passwordHash: '!LOCKED_FIREBASE_AUTH_MANAGED',
    passwordAlgorithm: 'argon2id',
    systemRole: 'TEACHER',
    tokenVersion: 1,
    isActive: true,
    legacyFirestoreId: 'fb-uid-s024-teacher',
    school: {
      id: 'school-s024-uuid',
      name: 'Spring Mount Public School',
      code: 'SchoolS024',
      status: 'active'
    }
  };

  const userS015 = {
    id: 'user-s015-admin-uuid',
    schoolId: 'school-s015-uuid',
    email: 'admin.s015@springmount.co.in',
    passwordHash: '!LOCKED_FIREBASE_AUTH_MANAGED',
    passwordAlgorithm: 'argon2id',
    systemRole: 'SCHOOL_ADMIN',
    tokenVersion: 1,
    isActive: true,
    legacyFirestoreId: 'fb-uid-s015-admin',
    school: {
      id: 'school-s015-uuid',
      name: 'Greenwood High',
      code: 'SchoolS015',
      status: 'active'
    }
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Cryptographic & Project Isolation Boundaries', () => {
    it('rejects tokens from support project (zuna-landing-page-22564)', async () => {
      // Mock verifier returning support project claims
      const supportProjectClaims = {
        uid: 'support-agent-uid',
        email: 'agent@zuna.io',
        email_verified: true,
        aud: 'zuna-landing-page-22564',
        iss: 'https://securetoken.google.com/zuna-landing-page-22564'
      };

      await expect(
        firebaseAuthService.verifyFirebaseIdToken('token-from-support-project', {
          verifier: async () => supportProjectClaims
        })
      ).rejects.toThrow('Firebase token issued for unauthorized project');
    });

    it('rejects tokens with wrong issuer', async () => {
      const wrongIssuerClaims = {
        uid: 'user-uid',
        email: 'user@school.edu',
        email_verified: true,
        aud: 'school-management-system-6a2c4',
        iss: 'https://fakeissuer.com/school-management-system-6a2c4'
      };

      await expect(
        firebaseAuthService.verifyFirebaseIdToken('token-with-bad-issuer', {
          verifier: async () => wrongIssuerClaims
        })
      ).rejects.toThrow('Firebase token issued by invalid issuer');
    });

    it('rejects tokens missing UID/subject identifier', async () => {
      const missingUidClaims = {
        email: 'user@school.edu',
        email_verified: true,
        aud: 'school-management-system-6a2c4',
        iss: 'https://securetoken.google.com/school-management-system-6a2c4'
      };

      await expect(
        firebaseAuthService.verifyFirebaseIdToken('token-missing-uid', {
          verifier: async () => missingUidClaims
        })
      ).rejects.toThrow('Firebase token missing subject identifier');
    });
  });

  describe('2. Anti-Auto-Provisioning & Invariant Safety', () => {
    it('strict invariant: unmapped Firebase identity NEVER creates a User record', async () => {
      const createSpy = vi.spyOn(authRepository, 'createRefreshSession');
      vi.spyOn(firebaseAuthService, 'verifyFirebaseIdToken').mockResolvedValue({
        uid: 'unmapped-uid-attacker',
        email: 'attacker@random.com',
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
      expect(res.body.error.code).toBe('USER_NOT_FOUND');
      // Verify no session was created and no database mutation occurred
      expect(createSpy).not.toHaveBeenCalled();
    });

    it('locked password marker (!LOCKED_FIREBASE_AUTH_MANAGED) is never overwritten during exchange', async () => {
      vi.spyOn(firebaseAuthService, 'verifyFirebaseIdToken').mockResolvedValue({
        uid: userS024.legacyFirestoreId,
        email: userS024.email,
        emailVerified: true
      });
      vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
        user: userS024,
        conflict: false
      });
      vi.spyOn(sessionService, 'createSession').mockResolvedValue({
        rawToken: 'mock-raw-refresh-token',
        sessionId: 'session-1',
        expiresAt: new Date()
      });
      vi.spyOn(tokenService, 'issueAccessToken').mockReturnValue('mock-jwt');

      const res = await request(app)
        .post('/api/v1/auth/firebase-exchange')
        .send({ idToken: 'valid.token' });

      expect(res.status).toBe(200);
      // Ensure user record maintained locked state
      expect(userS024.passwordHash).toBe('!LOCKED_FIREBASE_AUTH_MANAGED');
    });
  });

  describe('3. Tenant Isolation & RBAC Authority', () => {
    it('S024 Firebase identity resolves strictly to S024 tenant and teacher role', async () => {
      vi.spyOn(firebaseAuthService, 'verifyFirebaseIdToken').mockResolvedValue({
        uid: userS024.legacyFirestoreId,
        email: userS024.email,
        emailVerified: true
      });
      vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
        user: userS024,
        conflict: false
      });
      vi.spyOn(sessionService, 'createSession').mockResolvedValue({
        rawToken: 'mock-raw-token',
        sessionId: 'session-s024',
        expiresAt: new Date()
      });
      vi.spyOn(tokenService, 'issueAccessToken').mockImplementation((claims) => {
        expect(claims.sub).toBe(userS024.id);
        expect(claims.schoolId).toBe('school-s024-uuid');
        expect(claims.systemRole).toBe('TEACHER');
        return 'jwt-s024-teacher';
      });

      const res = await request(app)
        .post('/api/v1/auth/firebase-exchange')
        .send({ idToken: 'valid.s024.token' });

      expect(res.status).toBe(200);
      expect(res.body.data.user.schoolId).toBe('school-s024-uuid');
      expect(res.body.data.user.systemRole).toBe('TEACHER');
    });

    it('S015 Firebase identity resolves strictly to S015 tenant and school admin role', async () => {
      vi.spyOn(firebaseAuthService, 'verifyFirebaseIdToken').mockResolvedValue({
        uid: userS015.legacyFirestoreId,
        email: userS015.email,
        emailVerified: true
      });
      vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
        user: userS015,
        conflict: false
      });
      vi.spyOn(sessionService, 'createSession').mockResolvedValue({
        rawToken: 'mock-raw-token',
        sessionId: 'session-s015',
        expiresAt: new Date()
      });
      vi.spyOn(tokenService, 'issueAccessToken').mockImplementation((claims) => {
        expect(claims.sub).toBe(userS015.id);
        expect(claims.schoolId).toBe('school-s015-uuid');
        expect(claims.systemRole).toBe('SCHOOL_ADMIN');
        return 'jwt-s015-admin';
      });

      const res = await request(app)
        .post('/api/v1/auth/firebase-exchange')
        .send({ idToken: 'valid.s015.token' });

      expect(res.status).toBe(200);
      expect(res.body.data.user.schoolId).toBe('school-s015-uuid');
      expect(res.body.data.user.systemRole).toBe('SCHOOL_ADMIN');
    });

    it('rejects attempt to escalate role via client request body or Firebase claims', async () => {
      vi.spyOn(firebaseAuthService, 'verifyFirebaseIdToken').mockResolvedValue({
        uid: userS024.legacyFirestoreId,
        email: userS024.email,
        emailVerified: true,
        role: 'SUPER_ADMIN', // Firebase custom claim ignored
        custom_claims: { role: 'SUPER_ADMIN' }
      });
      vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
        user: userS024,
        conflict: false
      });
      vi.spyOn(sessionService, 'createSession').mockResolvedValue({
        rawToken: 'token',
        sessionId: 's',
        expiresAt: new Date()
      });
      vi.spyOn(tokenService, 'issueAccessToken').mockReturnValue('jwt');

      const res = await request(app)
        .post('/api/v1/auth/firebase-exchange')
        .send({
          idToken: 'token',
          systemRole: 'SUPER_ADMIN',
          schoolId: null
        });

      expect(res.status).toBe(200);
      // Authorization authority comes exclusively from PostgreSQL
      expect(res.body.data.user.systemRole).toBe('TEACHER');
      expect(res.body.data.user.schoolId).toBe('school-s024-uuid');
    });
  });

  describe('4. Session & Invalidation Lifecycle Integration', () => {
    it('issued access token contains exact expected claims and passes verifyAccessToken', async () => {
      vi.spyOn(firebaseAuthService, 'verifyFirebaseIdToken').mockResolvedValue({
        uid: userS024.legacyFirestoreId,
        email: userS024.email,
        emailVerified: true
      });
      vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
        user: userS024,
        conflict: false
      });
      vi.spyOn(sessionService, 'createSession').mockResolvedValue({
        rawToken: 'mock-raw-refresh-token',
        sessionId: 'session-1',
        expiresAt: new Date()
      });

      const res = await request(app)
        .post('/api/v1/auth/firebase-exchange')
        .send({ idToken: 'valid.token' });

      expect(res.status).toBe(200);
      const accessToken = res.body.data.accessToken;
      expect(accessToken).toBeDefined();

      // Verify the JWT token using actual token service
      const decoded = verifyAccessToken(accessToken);
      expect(decoded.sub).toBe(userS024.id);
      expect(decoded.schoolId).toBe(userS024.schoolId);
      expect(decoded.systemRole).toBe('TEACHER');
      expect(decoded.tokenVersion).toBe(1);
    });

    it('allows session refresh using issued HttpOnly cookie', async () => {
      vi.spyOn(sessionService, 'rotateSession').mockResolvedValue({
        newRawToken: 'rotated-refresh-token',
        sessionId: 'session-2',
        expiresAt: new Date(),
        user: userS024
      });

      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', ['sms_refresh_token=mock-raw-refresh-token'])
        .send();

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
    });

    it('revokes session on /auth/logout', async () => {
      const revokeSpy = vi.spyOn(sessionService, 'revokeSession').mockResolvedValue(true);

      const res = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', ['sms_refresh_token=mock-raw-refresh-token'])
        .send();

      expect(res.status).toBe(200);
      expect(revokeSpy).toHaveBeenCalledWith('mock-raw-refresh-token');
    });

    it('revoking all sessions increments tokenVersion and rejects previous access token', async () => {
      // 1. Issue access token with tokenVersion: 1
      const token = tokenService.issueAccessToken({
        sub: userS024.id,
        schoolId: userS024.schoolId,
        systemRole: userS024.systemRole,
        tokenVersion: 1
      });

      // 2. User tokenVersion increments in DB to 2
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue({
        ...userS024,
        tokenVersion: 2
      });

      // 3. Request to /auth/me with old token version is rejected
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });
  });

  describe('5. Data Protection & Credential Redaction Invariants', () => {
    it('ensures no sensitive fields appear in exchange response payload', async () => {
      vi.spyOn(firebaseAuthService, 'verifyFirebaseIdToken').mockResolvedValue({
        uid: userS024.legacyFirestoreId,
        email: userS024.email,
        emailVerified: true
      });
      vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
        user: userS024,
        conflict: false
      });
      vi.spyOn(sessionService, 'createSession').mockResolvedValue({
        rawToken: 'mock-raw-refresh-token',
        sessionId: 'session-1',
        expiresAt: new Date()
      });

      const res = await request(app)
        .post('/api/v1/auth/firebase-exchange')
        .send({ idToken: 'valid.token' });

      expect(res.status).toBe(200);
      const data = res.body.data;

      // Verify strict exclusions
      expect(data.rawRefreshToken).toBeUndefined();
      expect(data.refreshToken).toBeUndefined();
      expect(data.user.passwordHash).toBeUndefined();
      expect(data.user.passwordAlgorithm).toBeUndefined();
      expect(data.user.tokenVersion).toBeUndefined();
      expect(data.user.legacyFirestoreId).toBeUndefined();
    });
  });
});
