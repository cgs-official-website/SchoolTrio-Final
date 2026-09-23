import { prisma } from '../../database/prisma.client.js';
import { AUTH_CONSTANTS, ERROR_CODES } from '../../config/constants.js';
import { UnauthorizedError } from '../../utils/app-error.js';
import { generateRefreshToken, hashRefreshToken } from './token.service.js';
import * as authRepository from './auth.repository.js';

/**
 * Refresh Session Management Service
 *
 * Manages refresh token lifecycle, atomic rotation, reuse theft detection,
 * and user-wide session invalidation.
 */

/**
 * Creates a new refresh session for an authenticated user.
 * Generates an ephemeral raw refresh token and stores its SHA-256 hash.
 *
 * @param {Object} user - User record containing at least `id`
 * @param {Object} [metadata] - Optional request metadata
 * @param {string} [metadata.deviceInfo] - Client User-Agent or device description
 * @param {string} [metadata.ipAddress] - Client IP address
 * @param {Object} [options] - Additional options
 * @param {Object} [options.tx] - Optional Prisma transaction client
 * @returns {Promise<{ rawToken: string, sessionId: string, expiresAt: Date }>} Session details
 */
export const createSession = async (user, metadata = {}, { tx = null } = {}) => {
  if (!user || !user.id) {
    throw new UnauthorizedError('User is required to establish a refresh session');
  }

  const rawToken = generateRefreshToken();
  const tokenHash = hashRefreshToken(rawToken);
  const expiresAt = new Date(
    Date.now() + AUTH_CONSTANTS.REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000
  );

  const session = await authRepository.createRefreshSession(
    {
      userId: user.id,
      tokenHash,
      deviceInfo: metadata.deviceInfo || null,
      ipAddress: metadata.ipAddress || null,
      expiresAt
    },
    { tx }
  );

  return {
    rawToken,
    sessionId: session.id,
    expiresAt: session.expiresAt
  };
};

/**
 * Rotates an active refresh token with atomic concurrency protection and reuse detection.
 *
 * Invariant: A refresh token can successfully rotate only once.
 * - Active token -> Revoked + New session created + New raw token returned.
 * - Revoked token (Theft/Replay) -> All user sessions revoked + tokenVersion bumped.
 * - Expired token -> Revoked + Error thrown.
 * - Inactive user -> Revoked + Error thrown.
 *
 * @param {string} rawToken - Plaintext refresh token presented by client
 * @param {Object} [metadata] - Optional request metadata for new session
 * @param {string} [metadata.deviceInfo] - Client device info
 * @param {string} [metadata.ipAddress] - Client IP address
 * @returns {Promise<{ newRawToken: string, sessionId: string, expiresAt: Date, user: Object }>}
 * @throws {UnauthorizedError} On invalid, expired, or reused token
 */
export const rotateSession = async (rawToken, metadata = {}) => {
  if (!rawToken || typeof rawToken !== 'string') {
    throw new UnauthorizedError('Refresh token is required', ERROR_CODES.INVALID_REFRESH_TOKEN);
  }

  const tokenHash = hashRefreshToken(rawToken);

  return prisma.$transaction(async (tx) => {
    // 1. Locate session by token hash with associated user data
    const session = await authRepository.findRefreshSessionByTokenHash(tokenHash, { tx });

    if (!session) {
      throw new UnauthorizedError('Invalid refresh token', ERROR_CODES.INVALID_REFRESH_TOKEN);
    }

    // 2. Immediate Reuse / Token Theft Detection: Token is already marked revoked
    if (session.revokedAt !== null) {
      const msSinceRevocation = Date.now() - new Date(session.revokedAt).getTime();
      // 15-second grace window for concurrent HMR / React StrictMode requests
      if (msSinceRevocation < 15000) {
        const latestSession = await tx.refreshSession.findFirst({
          where: { userId: session.userId, revokedAt: null },
          orderBy: { createdAt: 'desc' },
          include: { user: { include: { staffProfile: true, parentProfile: true, school: true } } }
        });
        if (latestSession && latestSession.expiresAt.getTime() > Date.now()) {
          return {
            newRawToken: null,
            sessionId: latestSession.id,
            expiresAt: latestSession.expiresAt,
            user: latestSession.user
          };
        }
      }

      // Invalidate all active sessions for this compromised user
      await authRepository.revokeAllRefreshSessions(session.userId, { tx });
      await authRepository.incrementTokenVersion(session.userId, { tx });

      throw new UnauthorizedError(
        'Refresh token reuse detected. All active sessions have been revoked.',
        ERROR_CODES.TOKEN_REUSE_DETECTED
      );
    }

    // 3. Expiration Check
    if (session.expiresAt.getTime() < Date.now()) {
      await authRepository.revokeRefreshSession(session.id, { tx });
      throw new UnauthorizedError('Refresh token has expired', ERROR_CODES.REFRESH_TOKEN_EXPIRED);
    }

    // 4. Account Active Check
    if (!session.user || !session.user.isActive) {
      await authRepository.revokeRefreshSession(session.id, { tx });
      throw new UnauthorizedError('User account is inactive', ERROR_CODES.ACCOUNT_DISABLED);
    }

    // 5. Atomic Conditional Revoke (Protects against concurrent race conditions)
    const updateResult = await tx.refreshSession.updateMany({
      where: {
        id: session.id,
        revokedAt: null
      },
      data: {
        revokedAt: new Date()
      }
    });

    // If count is 0, a concurrent request completed the rotation milliseconds ago
    if (updateResult.count === 0) {
      const freshSession = await authRepository.findRefreshSessionByTokenHash(tokenHash, { tx });
      if (freshSession && freshSession.revokedAt !== null) {
        const msSinceRevocation = Date.now() - new Date(freshSession.revokedAt).getTime();
        if (msSinceRevocation < 15000) {
          const latestSession = await tx.refreshSession.findFirst({
            where: { userId: session.userId, revokedAt: null },
            orderBy: { createdAt: 'desc' },
            include: { user: { include: { staffProfile: true, parentProfile: true, school: true } } }
          });
          if (latestSession && latestSession.expiresAt.getTime() > Date.now()) {
            return {
              newRawToken: null,
              sessionId: latestSession.id,
              expiresAt: latestSession.expiresAt,
              user: latestSession.user
            };
          }
        }
      }

      await authRepository.revokeAllRefreshSessions(session.userId, { tx });
      await authRepository.incrementTokenVersion(session.userId, { tx });

      throw new UnauthorizedError(
        'Refresh token reuse detected. All active sessions have been revoked.',
        ERROR_CODES.TOKEN_REUSE_DETECTED
      );
    }

    // 6. Generate new refresh token and persist new session
    const newRawToken = generateRefreshToken();
    const newTokenHash = hashRefreshToken(newRawToken);
    const expiresAt = new Date(
      Date.now() + AUTH_CONSTANTS.REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    );

    const newSession = await authRepository.createRefreshSession(
      {
        userId: session.userId,
        tokenHash: newTokenHash,
        deviceInfo: metadata.deviceInfo || session.deviceInfo,
        ipAddress: metadata.ipAddress || session.ipAddress,
        expiresAt
      },
      { tx }
    );

    return {
      newRawToken,
      sessionId: newSession.id,
      expiresAt: newSession.expiresAt,
      user: session.user
    };
  });
};

/**
 * Revokes a specific refresh session using its raw token.
 *
 * @param {string} rawToken - Plaintext refresh token to revoke
 * @returns {Promise<boolean>} True if revocation completed
 */
export const revokeSession = async (rawToken) => {
  if (!rawToken || typeof rawToken !== 'string') {
    return false;
  }

  const tokenHash = hashRefreshToken(rawToken);
  const session = await authRepository.findRefreshSessionByTokenHash(tokenHash);

  if (session && session.revokedAt === null) {
    await authRepository.revokeRefreshSession(session.id);
  }

  return true;
};

/**
 * Revokes all active refresh sessions for a specific user and increments tokenVersion.
 * Completely terminates all active logins across all devices.
 *
 * @param {string} userId - User UUID
 * @returns {Promise<{ count: number, tokenVersion: number }>} Revocation summary
 */
export const revokeAllUserSessions = async (userId) => {
  if (!userId || typeof userId !== 'string') {
    throw new UnauthorizedError('User ID is required for session revocation');
  }

  return prisma.$transaction(async (tx) => {
    const { count } = await authRepository.revokeAllRefreshSessions(userId, { tx });
    const { tokenVersion } = await authRepository.incrementTokenVersion(userId, { tx });

    return { count, tokenVersion };
  });
};
