import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as authService from '../../../src/modules/auth/auth.service.js';
import * as authRepository from '../../../src/modules/auth/auth.repository.js';
import * as passwordService from '../../../src/modules/auth/password.service.js';
import * as tokenService from '../../../src/modules/auth/token.service.js';
import * as sessionService from '../../../src/modules/auth/session.service.js';
import { UnauthorizedError, ForbiddenError } from '../../../src/utils/app-error.js';

describe('Authentication Domain Service (auth.service.js)', () => {
  const sampleUser = {
    id: 'e9c4e270-26e1-43ac-8279-886ec13f4776',
    schoolId: '25e9637a-7fa4-4ac2-b43d-b4c0edcf2932',
    email: 'user@school.edu',
    passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$someEncodedHashString',
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

  describe('login', () => {
    it('authenticates valid email and password, creates session, and issues access token', async () => {
      vi.spyOn(authRepository, 'findUserByEmail').mockResolvedValue(sampleUser);
      vi.spyOn(passwordService, 'isLockedPassword').mockReturnValue(false);
      vi.spyOn(passwordService, 'verifyPassword').mockResolvedValue(true);
      vi.spyOn(sessionService, 'createSession').mockResolvedValue({
        rawToken: 'mock-raw-refresh-token-64hex',
        sessionId: 'session-uuid-1',
        expiresAt: new Date()
      });
      vi.spyOn(tokenService, 'issueAccessToken').mockReturnValue('mock-jwt-access-token');

      const result = await authService.login({
        identifier: 'USER@SCHOOL.EDU',
        password: 'ValidPassword123!',
        ipAddress: '127.0.0.1',
        deviceInfo: 'Mozilla/5.0'
      });

      expect(authRepository.findUserByEmail).toHaveBeenCalledWith('user@school.edu', {
        includePassword: true
      });
      expect(passwordService.verifyPassword).toHaveBeenCalledWith(sampleUser.passwordHash, 'ValidPassword123!');
      expect(result.accessToken).toBe('mock-jwt-access-token');
      expect(result.rawRefreshToken).toBe('mock-raw-refresh-token-64hex');
      expect(result.user).toEqual(expect.objectContaining({
        id: sampleUser.id,
        email: sampleUser.email,
        schoolId: sampleUser.schoolId,
        systemRole: sampleUser.systemRole
      }));
      expect(result.user.passwordHash).toBeUndefined();
    });

    it('authenticates valid user via phone number', async () => {
      vi.spyOn(authRepository, 'findUserByEmail').mockResolvedValue(null);
      vi.spyOn(authRepository, 'findCandidateUsersByIdentifier').mockResolvedValue([sampleUser]);
      vi.spyOn(passwordService, 'isLockedPassword').mockReturnValue(false);
      vi.spyOn(passwordService, 'verifyPassword').mockResolvedValue(true);
      vi.spyOn(sessionService, 'createSession').mockResolvedValue({
        rawToken: 'mock-raw-refresh-token-phone',
        sessionId: 'session-uuid-phone',
        expiresAt: new Date()
      });
      vi.spyOn(tokenService, 'issueAccessToken').mockReturnValue('mock-jwt-phone');

      const result = await authService.login({
        identifier: '9876543210',
        password: 'ValidPassword123!'
      });

      expect(authRepository.findCandidateUsersByIdentifier).toHaveBeenCalledWith('9876543210', {
        includePassword: true
      });
      expect(result.accessToken).toBe('mock-jwt-phone');
      expect(result.user.id).toBe(sampleUser.id);
    });

    it('authenticates valid parent user via admission number', async () => {
      vi.spyOn(authRepository, 'findUserByEmail').mockResolvedValue(null);
      vi.spyOn(authRepository, 'findCandidateUsersByIdentifier').mockResolvedValue([sampleUser]);
      vi.spyOn(passwordService, 'isLockedPassword').mockReturnValue(false);
      vi.spyOn(passwordService, 'verifyPassword').mockResolvedValue(true);
      vi.spyOn(sessionService, 'createSession').mockResolvedValue({
        rawToken: 'mock-raw-refresh-token-adm',
        sessionId: 'session-uuid-adm',
        expiresAt: new Date()
      });
      vi.spyOn(tokenService, 'issueAccessToken').mockReturnValue('mock-jwt-adm');

      const result = await authService.login({
        identifier: 'ADM-1234',
        password: 'ValidPassword123!'
      });

      expect(authRepository.findCandidateUsersByIdentifier).toHaveBeenCalledWith('ADM-1234', {
        includePassword: true
      });
      expect(result.accessToken).toBe('mock-jwt-adm');
      expect(result.user.id).toBe(sampleUser.id);
    });

    it('returns generic INVALID_CREDENTIALS for unknown email to prevent enumeration', async () => {
      vi.spyOn(authRepository, 'findUserByEmail').mockResolvedValue(null);

      await expect(
        authService.login({ identifier: 'unknown@school.edu', password: 'Password123!' })
      ).rejects.toThrow(UnauthorizedError);

      try {
        await authService.login({ identifier: 'unknown@school.edu', password: 'Password123!' });
      } catch (err) {
        expect(err.code).toBe('INVALID_CREDENTIALS');
        expect(err.message).toBe('Invalid email or password');
      }
    });

    it('returns generic INVALID_CREDENTIALS for incorrect password', async () => {
      vi.spyOn(authRepository, 'findUserByEmail').mockResolvedValue(sampleUser);
      vi.spyOn(passwordService, 'isLockedPassword').mockReturnValue(false);
      vi.spyOn(passwordService, 'verifyPassword').mockResolvedValue(false);

      await expect(
        authService.login({ identifier: sampleUser.email, password: 'WrongPassword123!' })
      ).rejects.toThrow(UnauthorizedError);

      try {
        await authService.login({ identifier: sampleUser.email, password: 'WrongPassword123!' });
      } catch (err) {
        expect(err.code).toBe('INVALID_CREDENTIALS');
      }
    });

    it('rejects locked migrated accounts with PASSWORD_NOT_SET', async () => {
      const lockedUser = { ...sampleUser, passwordHash: '!LOCKED_FIREBASE_AUTH_MANAGED' };
      vi.spyOn(authRepository, 'findUserByEmail').mockResolvedValue(lockedUser);
      vi.spyOn(passwordService, 'isLockedPassword').mockReturnValue(true);

      await expect(
        authService.login({ identifier: sampleUser.email, password: 'AnyPassword123!' })
      ).rejects.toThrow(ForbiddenError);

      try {
        await authService.login({ identifier: sampleUser.email, password: 'AnyPassword123!' });
      } catch (err) {
        expect(err.code).toBe('PASSWORD_NOT_SET');
      }
    });

    it('rejects deactivated accounts with ACCOUNT_DISABLED', async () => {
      const inactiveUser = { ...sampleUser, isActive: false };
      vi.spyOn(authRepository, 'findUserByEmail').mockResolvedValue(inactiveUser);
      vi.spyOn(passwordService, 'isLockedPassword').mockReturnValue(false);

      await expect(
        authService.login({ identifier: sampleUser.email, password: 'Password123!' })
      ).rejects.toThrow(ForbiddenError);

      try {
        await authService.login({ identifier: sampleUser.email, password: 'Password123!' });
      } catch (err) {
        expect(err.code).toBe('ACCOUNT_DISABLED');
      }
    });

    it('rejects login when associated school tenant is suspended', async () => {
      const suspendedSchoolUser = {
        ...sampleUser,
        school: { ...sampleUser.school, status: 'suspended' }
      };
      vi.spyOn(authRepository, 'findUserByEmail').mockResolvedValue(suspendedSchoolUser);
      vi.spyOn(passwordService, 'isLockedPassword').mockReturnValue(false);

      await expect(
        authService.login({ identifier: sampleUser.email, password: 'Password123!' })
      ).rejects.toThrow(ForbiddenError);

      try {
        await authService.login({ identifier: sampleUser.email, password: 'Password123!' });
      } catch (err) {
        expect(err.code).toBe('TENANT_ACCESS_ERROR');
        expect(err.message).toContain('suspended');
      }
    });

    it('rejects login when associated school tenant is pending approval', async () => {
      const pendingSchoolUser = {
        ...sampleUser,
        school: { ...sampleUser.school, status: 'pending' }
      };
      vi.spyOn(authRepository, 'findUserByEmail').mockResolvedValue(pendingSchoolUser);
      vi.spyOn(passwordService, 'isLockedPassword').mockReturnValue(false);

      await expect(
        authService.login({ identifier: sampleUser.email, password: 'Password123!' })
      ).rejects.toThrow(ForbiddenError);

      try {
        await authService.login({ identifier: sampleUser.email, password: 'Password123!' });
      } catch (err) {
        expect(err.code).toBe('TENANT_ACCESS_ERROR');
        expect(err.message).toContain('pending');
      }
    });
  });

  describe('refresh', () => {
    it('rotates refresh session and issues new access token', async () => {
      vi.spyOn(sessionService, 'rotateSession').mockResolvedValue({
        newRawToken: 'new-raw-refresh-token',
        sessionId: 'new-session-id',
        expiresAt: new Date(),
        user: sampleUser
      });
      vi.spyOn(tokenService, 'issueAccessToken').mockReturnValue('new-jwt-access-token');

      const result = await authService.refresh({ rawRefreshToken: 'existing-refresh-token' });

      expect(sessionService.rotateSession).toHaveBeenCalledWith('existing-refresh-token', expect.any(Object));
      expect(result.accessToken).toBe('new-jwt-access-token');
      expect(result.newRawRefreshToken).toBe('new-raw-refresh-token');
      expect(result.user.id).toBe(sampleUser.id);
    });

    it('throws UnauthorizedError if rawRefreshToken is missing', async () => {
      await expect(authService.refresh({ rawRefreshToken: null })).rejects.toThrow(UnauthorizedError);
    });

    it('rejects refresh if user account became deactivated', async () => {
      vi.spyOn(sessionService, 'rotateSession').mockResolvedValue({
        newRawToken: 'token',
        sessionId: 'id',
        expiresAt: new Date(),
        user: { ...sampleUser, isActive: false }
      });

      await expect(authService.refresh({ rawRefreshToken: 'valid-token' })).rejects.toThrow(ForbiddenError);
    });
  });

  describe('logout & logoutAll', () => {
    it('revokes session on logout', async () => {
      const revokeSpy = vi.spyOn(sessionService, 'revokeSession').mockResolvedValue(true);
      const res = await authService.logout({ rawRefreshToken: 'some-token' });

      expect(revokeSpy).toHaveBeenCalledWith('some-token');
      expect(res).toEqual({ success: true });
    });

    it('revokes all sessions on logoutAll', async () => {
      const revokeAllSpy = vi.spyOn(sessionService, 'revokeAllUserSessions').mockResolvedValue({ count: 2, tokenVersion: 2 });
      const res = await authService.logoutAll({ userId: sampleUser.id });

      expect(revokeAllSpy).toHaveBeenCalledWith(sampleUser.id);
      expect(res).toEqual({ success: true });
    });
  });

  describe('getCurrentUser', () => {
    it('returns safe user DTO for active user', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(sampleUser);

      const userDto = await authService.getCurrentUser({ userId: sampleUser.id });

      expect(userDto.id).toBe(sampleUser.id);
      expect(userDto.email).toBe(sampleUser.email);
      expect(userDto.school.code).toBe('SchoolS024');
      expect(userDto.passwordHash).toBeUndefined();
    });

    it('throws UnauthorizedError if user is not found or inactive', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(null);

      await expect(authService.getCurrentUser({ userId: 'unknown' })).rejects.toThrow(UnauthorizedError);
    });
  });

  describe('firebaseExchange', () => {
    const mockVerifier = vi.fn();

    beforeEach(() => {
      mockVerifier.mockResolvedValue({
        uid: 'firebase-uid-12345',
        email: 'user@school.edu',
        email_verified: true,
        aud: 'school-management-system-6a2c4',
        iss: 'https://securetoken.google.com/school-management-system-6a2c4'
      });
    });

    it('successfully exchanges verified Firebase token for PostgreSQL JWT and refresh session', async () => {
      vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
        user: sampleUser,
        conflict: false
      });
      vi.spyOn(sessionService, 'createSession').mockResolvedValue({
        rawToken: 'mock-raw-refresh-token-64hex',
        sessionId: 'session-uuid-1',
        expiresAt: new Date()
      });
      vi.spyOn(tokenService, 'issueAccessToken').mockReturnValue('mock-jwt-access-token');

      const result = await authService.firebaseExchange({
        idToken: 'valid-firebase-jwt',
        ipAddress: '127.0.0.1',
        deviceInfo: 'Mozilla/5.0',
        verifier: mockVerifier
      });

      expect(mockVerifier).toHaveBeenCalledWith('valid-firebase-jwt');
      expect(authRepository.findUserForFirebaseIdentity).toHaveBeenCalledWith({
        firebaseUid: 'firebase-uid-12345',
        email: 'user@school.edu',
        emailVerified: true
      });
      expect(sessionService.createSession).toHaveBeenCalledWith(sampleUser, {
        ipAddress: '127.0.0.1',
        deviceInfo: 'Mozilla/5.0'
      });
      expect(tokenService.issueAccessToken).toHaveBeenCalledWith({
        sub: sampleUser.id,
        schoolId: sampleUser.schoolId,
        systemRole: sampleUser.systemRole,
        tokenVersion: sampleUser.tokenVersion
      });
      expect(result.accessToken).toBe('mock-jwt-access-token');
      expect(result.rawRefreshToken).toBe('mock-raw-refresh-token-64hex');
      expect(result.user).toEqual(expect.objectContaining({
        id: sampleUser.id,
        email: sampleUser.email,
        schoolId: sampleUser.schoolId,
        systemRole: sampleUser.systemRole
      }));
      expect(result.user.passwordHash).toBeUndefined();
    });

    it('throws UnauthorizedError with IDENTITY_CONFLICT when conflict is detected', async () => {
      vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
        user: null,
        conflict: true
      });

      await expect(
        authService.firebaseExchange({
          idToken: 'valid-jwt',
          verifier: mockVerifier
        })
      ).rejects.toThrow(UnauthorizedError);

      try {
        await authService.firebaseExchange({ idToken: 'valid-jwt', verifier: mockVerifier });
      } catch (err) {
        expect(err.code).toBe('IDENTITY_CONFLICT');
      }
    });

    it('rejects unmapped Firebase identity with USER_NOT_FOUND (zero auto-provisioning)', async () => {
      vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
        user: null,
        conflict: false
      });

      await expect(
        authService.firebaseExchange({
          idToken: 'valid-jwt',
          verifier: mockVerifier
        })
      ).rejects.toThrow(UnauthorizedError);

      try {
        await authService.firebaseExchange({ idToken: 'valid-jwt', verifier: mockVerifier });
      } catch (err) {
        expect(err.code).toBe('USER_NOT_FOUND');
      }
    });

    it('rejects deactivated PostgreSQL user with ACCOUNT_DISABLED', async () => {
      const inactiveUser = { ...sampleUser, isActive: false };
      vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
        user: inactiveUser,
        conflict: false
      });

      await expect(
        authService.firebaseExchange({
          idToken: 'valid-jwt',
          verifier: mockVerifier
        })
      ).rejects.toThrow(ForbiddenError);

      try {
        await authService.firebaseExchange({ idToken: 'valid-jwt', verifier: mockVerifier });
      } catch (err) {
        expect(err.code).toBe('ACCOUNT_DISABLED');
      }
    });

    it('rejects exchange when associated school tenant is suspended', async () => {
      const suspendedSchoolUser = {
        ...sampleUser,
        school: { ...sampleUser.school, status: 'suspended' }
      };
      vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
        user: suspendedSchoolUser,
        conflict: false
      });

      await expect(
        authService.firebaseExchange({
          idToken: 'valid-jwt',
          verifier: mockVerifier
        })
      ).rejects.toThrow(ForbiddenError);

      try {
        await authService.firebaseExchange({ idToken: 'valid-jwt', verifier: mockVerifier });
      } catch (err) {
        expect(err.code).toBe('TENANT_SUSPENDED');
      }
    });

    it('rejects exchange when associated school tenant is pending approval', async () => {
      const pendingSchoolUser = {
        ...sampleUser,
        school: { ...sampleUser.school, status: 'pending' }
      };
      vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
        user: pendingSchoolUser,
        conflict: false
      });

      await expect(
        authService.firebaseExchange({
          idToken: 'valid-jwt',
          verifier: mockVerifier
        })
      ).rejects.toThrow(ForbiddenError);

      try {
        await authService.firebaseExchange({ idToken: 'valid-jwt', verifier: mockVerifier });
      } catch (err) {
        expect(err.code).toBe('TENANT_ACCESS_ERROR');
      }
    });
  });
});

