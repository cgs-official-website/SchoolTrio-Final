import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createSession,
  rotateSession,
  revokeSession,
  revokeAllUserSessions
} from '../../../src/modules/auth/session.service.js';
import * as authRepository from '../../../src/modules/auth/auth.repository.js';
import { prisma } from '../../../src/database/prisma.client.js';
import { UnauthorizedError } from '../../../src/utils/app-error.js';
import { hashRefreshToken } from '../../../src/modules/auth/token.service.js';

describe('Refresh Session Service & Reuse Detection', () => {
  const mockUser = {
    id: 'e9c4e270-26e1-43ac-8279-886ec13f4776',
    schoolId: '25e9637a-7fa4-4ac2-b43d-b4c0edcf2932',
    email: 'test@school.edu',
    systemRole: 'TENANT_USER',
    tokenVersion: 1,
    isActive: true
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('createSession', () => {
    it('creates a refresh session with SHA-256 hash and 7-day TTL', async () => {
      const mockCreatedSession = {
        id: 'session-uuid-1234',
        userId: mockUser.id,
        tokenHash: 'some-hash',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      };

      vi.spyOn(authRepository, 'createRefreshSession').mockResolvedValue(mockCreatedSession);

      const result = await createSession(mockUser, {
        deviceInfo: 'Mozilla/5.0 (Windows NT 10.0)',
        ipAddress: '127.0.0.1'
      });

      expect(typeof result.rawToken).toBe('string');
      expect(result.rawToken).toMatch(/^[0-9a-f]{64}$/);
      expect(result.sessionId).toBe(mockCreatedSession.id);
      expect(result.expiresAt).toEqual(mockCreatedSession.expiresAt);

      expect(authRepository.createRefreshSession).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUser.id,
          tokenHash: hashRefreshToken(result.rawToken),
          deviceInfo: 'Mozilla/5.0 (Windows NT 10.0)',
          ipAddress: '127.0.0.1'
        }),
        expect.any(Object)
      );
    });

    it('throws UnauthorizedError if user is missing or invalid', async () => {
      await expect(createSession(null)).rejects.toThrow(UnauthorizedError);
      await expect(createSession({})).rejects.toThrow('User is required');
    });
  });

  describe('rotateSession', () => {
    it('successfully rotates an active, valid refresh token', async () => {
      const rawToken = 'a'.repeat(64);
      const tokenHash = hashRefreshToken(rawToken);

      const existingSession = {
        id: 'session-old-111',
        userId: mockUser.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 3600 * 1000), // 1 hour in future
        revokedAt: null,
        deviceInfo: 'Chrome',
        ipAddress: '192.168.1.1',
        user: mockUser
      };

      const newSessionRecord = {
        id: 'session-new-222',
        userId: mockUser.id,
        tokenHash: 'new-hash',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      };

      // Mock transaction execution
      const mockTx = {
        refreshSession: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 })
        }
      };

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
        return callback(mockTx);
      });

      vi.spyOn(authRepository, 'findRefreshSessionByTokenHash').mockResolvedValue(existingSession);
      vi.spyOn(authRepository, 'createRefreshSession').mockResolvedValue(newSessionRecord);

      const result = await rotateSession(rawToken, { ipAddress: '192.168.1.2' });

      expect(typeof result.newRawToken).toBe('string');
      expect(result.newRawToken).toMatch(/^[0-9a-f]{64}$/);
      expect(result.newRawToken).not.toBe(rawToken);
      expect(result.sessionId).toBe(newSessionRecord.id);
      expect(result.user).toEqual(mockUser);

      // Verify old session was marked revoked
      expect(mockTx.refreshSession.updateMany).toHaveBeenCalledWith({
        where: {
          id: existingSession.id,
          revokedAt: null
        },
        data: expect.objectContaining({
          revokedAt: expect.any(Date)
        })
      });
    });

    it('detects token reuse and immediately revokes all user sessions and bumps tokenVersion', async () => {
      const rawToken = 'b'.repeat(64);
      const tokenHash = hashRefreshToken(rawToken);

      const alreadyRevokedSession = {
        id: 'session-compromised-333',
        userId: mockUser.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 3600 * 1000),
        revokedAt: new Date(Date.now() - 60000), // Revoked 1 minute ago!
        user: mockUser
      };

      const mockTx = {};
      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => callback(mockTx));
      vi.spyOn(authRepository, 'findRefreshSessionByTokenHash').mockResolvedValue(alreadyRevokedSession);
      const revokeAllSpy = vi.spyOn(authRepository, 'revokeAllRefreshSessions').mockResolvedValue({ count: 3 });
      const incrementVersionSpy = vi.spyOn(authRepository, 'incrementTokenVersion').mockResolvedValue({ id: mockUser.id, tokenVersion: 2 });

      await expect(rotateSession(rawToken)).rejects.toThrow(UnauthorizedError);

      try {
        await rotateSession(rawToken);
      } catch (err) {
        expect(err.code).toBe('TOKEN_REUSE_DETECTED');
        expect(err.message).toContain('Refresh token reuse detected');
      }

      expect(revokeAllSpy).toHaveBeenCalledWith(mockUser.id, { tx: mockTx });
      expect(incrementVersionSpy).toHaveBeenCalledWith(mockUser.id, { tx: mockTx });
    });

    it('handles concurrent race condition where updateMany returns count: 0 as reuse detection', async () => {
      const rawToken = 'c'.repeat(64);
      const tokenHash = hashRefreshToken(rawToken);

      const existingSession = {
        id: 'session-racing-444',
        userId: mockUser.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 3600 * 1000),
        revokedAt: null, // Appeared unrevoked during find
        user: mockUser
      };

      const mockTx = {
        refreshSession: {
          // Another request revoked it concurrently right before our updateMany executed
          updateMany: vi.fn().mockResolvedValue({ count: 0 })
        }
      };

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => callback(mockTx));
      vi.spyOn(authRepository, 'findRefreshSessionByTokenHash').mockResolvedValue(existingSession);
      const revokeAllSpy = vi.spyOn(authRepository, 'revokeAllRefreshSessions').mockResolvedValue({ count: 2 });
      const incrementVersionSpy = vi.spyOn(authRepository, 'incrementTokenVersion').mockResolvedValue({ id: mockUser.id, tokenVersion: 2 });

      await expect(rotateSession(rawToken)).rejects.toThrow(UnauthorizedError);

      try {
        await rotateSession(rawToken);
      } catch (err) {
        expect(err.code).toBe('TOKEN_REUSE_DETECTED');
      }

      expect(revokeAllSpy).toHaveBeenCalledWith(mockUser.id, { tx: mockTx });
      expect(incrementVersionSpy).toHaveBeenCalledWith(mockUser.id, { tx: mockTx });
    });

    it('rejects an expired refresh token with REFRESH_TOKEN_EXPIRED', async () => {
      const rawToken = 'd'.repeat(64);
      const expiredSession = {
        id: 'session-expired-555',
        userId: mockUser.id,
        tokenHash: hashRefreshToken(rawToken),
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
        revokedAt: null,
        user: mockUser
      };

      const mockTx = {};
      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => callback(mockTx));
      vi.spyOn(authRepository, 'findRefreshSessionByTokenHash').mockResolvedValue(expiredSession);
      const revokeSpy = vi.spyOn(authRepository, 'revokeRefreshSession').mockResolvedValue({});

      await expect(rotateSession(rawToken)).rejects.toThrow(UnauthorizedError);

      try {
        await rotateSession(rawToken);
      } catch (err) {
        expect(err.code).toBe('REFRESH_TOKEN_EXPIRED');
      }

      expect(revokeSpy).toHaveBeenCalledWith(expiredSession.id, { tx: mockTx });
    });

    it('rejects inactive user with ACCOUNT_DISABLED', async () => {
      const rawToken = 'e'.repeat(64);
      const inactiveUserSession = {
        id: 'session-inactive-666',
        userId: mockUser.id,
        tokenHash: hashRefreshToken(rawToken),
        expiresAt: new Date(Date.now() + 3600 * 1000),
        revokedAt: null,
        user: { ...mockUser, isActive: false }
      };

      const mockTx = {};
      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => callback(mockTx));
      vi.spyOn(authRepository, 'findRefreshSessionByTokenHash').mockResolvedValue(inactiveUserSession);
      const revokeSpy = vi.spyOn(authRepository, 'revokeRefreshSession').mockResolvedValue({});

      await expect(rotateSession(rawToken)).rejects.toThrow(UnauthorizedError);

      try {
        await rotateSession(rawToken);
      } catch (err) {
        expect(err.code).toBe('ACCOUNT_DISABLED');
      }

      expect(revokeSpy).toHaveBeenCalledWith(inactiveUserSession.id, { tx: mockTx });
    });

    it('rejects unknown refresh token with INVALID_REFRESH_TOKEN', async () => {
      const rawToken = 'f'.repeat(64);
      const mockTx = {};
      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => callback(mockTx));
      vi.spyOn(authRepository, 'findRefreshSessionByTokenHash').mockResolvedValue(null);

      await expect(rotateSession(rawToken)).rejects.toThrow(UnauthorizedError);

      try {
        await rotateSession(rawToken);
      } catch (err) {
        expect(err.code).toBe('INVALID_REFRESH_TOKEN');
      }
    });
  });

  describe('revokeSession', () => {
    it('revokes an active session by raw token', async () => {
      const rawToken = '1'.repeat(64);
      const activeSession = {
        id: 'session-to-revoke',
        revokedAt: null
      };

      vi.spyOn(authRepository, 'findRefreshSessionByTokenHash').mockResolvedValue(activeSession);
      const revokeSpy = vi.spyOn(authRepository, 'revokeRefreshSession').mockResolvedValue({});

      const result = await revokeSession(rawToken);
      expect(result).toBe(true);
      expect(revokeSpy).toHaveBeenCalledWith('session-to-revoke');
    });

    it('returns false safely for invalid token input', async () => {
      expect(await revokeSession(null)).toBe(false);
      expect(await revokeSession('')).toBe(false);
    });
  });

  describe('revokeAllUserSessions', () => {
    it('atomically revokes all active sessions for a user and increments tokenVersion', async () => {
      const mockTx = {};
      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => callback(mockTx));
      vi.spyOn(authRepository, 'revokeAllRefreshSessions').mockResolvedValue({ count: 5 });
      vi.spyOn(authRepository, 'incrementTokenVersion').mockResolvedValue({ id: mockUser.id, tokenVersion: 3 });

      const result = await revokeAllUserSessions(mockUser.id);
      expect(result).toEqual({ count: 5, tokenVersion: 3 });

      expect(authRepository.revokeAllRefreshSessions).toHaveBeenCalledWith(mockUser.id, { tx: mockTx });
      expect(authRepository.incrementTokenVersion).toHaveBeenCalledWith(mockUser.id, { tx: mockTx });
    });

    it('throws UnauthorizedError if userId is missing', async () => {
      await expect(revokeAllUserSessions(null)).rejects.toThrow(UnauthorizedError);
      await expect(revokeAllUserSessions('')).rejects.toThrow('User ID is required');
    });
  });
});
