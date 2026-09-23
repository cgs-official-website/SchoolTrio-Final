import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { AUTH_CONSTANTS, ERROR_CODES } from '../../config/constants.js';
import { UnauthorizedError, ValidationError } from '../../utils/app-error.js';

/**
 * Resolves the JWT secret key.
 * Enforces presence and minimum length in non-test environments.
 *
 * @returns {string} JWT signing and verification secret
 */
export const getJwtSecret = () => {
  if (env.JWT_SECRET && env.JWT_SECRET.length >= 32) {
    return env.JWT_SECRET;
  }

  if (env.isTest || env.isDevelopment) {
    return env.JWT_SECRET || 'dev-test-fallback-jwt-secret-minimum-32-chars-012345';
  }

  throw new Error('JWT_SECRET must be configured with at least 32 characters in production');
};

/**
 * Issues a cryptographically signed minimal-claim JWT access token.
 *
 * Claims strictly include:
 * - sub: Subject user UUID
 * - schoolId: Authoritative tenant school UUID (or null for SuperAdmin)
 * - systemRole: Platform system role
 * - tokenVersion: User session generation counter
 * - jti: Unique token identifier UUID
 *
 * @param {Object} params - User identity payload
 * @param {string} params.sub - Subject user UUID
 * @param {string|null} [params.schoolId] - School UUID or null
 * @param {string} [params.systemRole] - User system role
 * @param {number} [params.tokenVersion] - User token version
 * @param {string} [params.jti] - Optional token UUID (auto-generated if omitted)
 * @param {Object} [options] - Optional JWT sign options
 * @returns {string} Signed JWT access token string
 * @throws {ValidationError} If required subject claim is missing
 */
export const issueAccessToken = (
  { sub, schoolId = null, systemRole = 'TENANT_USER', tokenVersion = 1, jti = crypto.randomUUID() },
  options = {}
) => {
  if (!sub || typeof sub !== 'string') {
    throw new ValidationError('Subject (sub) is required to issue an access token');
  }

  const payload = {
    sub,
    schoolId: schoolId || null,
    systemRole,
    tokenVersion: typeof tokenVersion === 'number' ? tokenVersion : 1,
    jti: jti || crypto.randomUUID()
  };

  const secret = getJwtSecret();
  const expiresIn = options.expiresIn || AUTH_CONSTANTS.ACCESS_TOKEN_EXPIRY;

  return jwt.sign(payload, secret, {
    algorithm: AUTH_CONSTANTS.ACCESS_TOKEN_ALGORITHM,
    expiresIn
  });
};

/**
 * Verifies and decodes an access token.
 * Restricts accepted algorithms strictly to HS256.
 *
 * @param {string} token - Raw JWT token string
 * @param {Object} [options] - Additional jsonwebtoken verify options
 * @returns {Object} Decoded token payload
 * @throws {UnauthorizedError} If token is missing, expired, tampered, or malformed
 */
export const verifyAccessToken = (token, options = {}) => {
  if (!token || typeof token !== 'string') {
    throw new UnauthorizedError('Access token is required', ERROR_CODES.INVALID_TOKEN);
  }

  const secret = getJwtSecret();

  try {
    const decoded = jwt.verify(token, secret, {
      algorithms: [AUTH_CONSTANTS.ACCESS_TOKEN_ALGORITHM],
      ...options
    });

    return decoded;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Access token has expired', ERROR_CODES.TOKEN_EXPIRED, {
        expiredAt: err.expiredAt
      });
    }

    if (err instanceof jwt.JsonWebTokenError) {
      throw new UnauthorizedError('Invalid or malformed access token', ERROR_CODES.INVALID_TOKEN);
    }

    throw new UnauthorizedError('Token verification failed', ERROR_CODES.INVALID_TOKEN);
  }
};

/**
 * Generates a cryptographically random refresh token.
 * Produces 32 bytes of secure entropy encoded as a 64-character hexadecimal string.
 *
 * @returns {string} Raw refresh token
 */
export const generateRefreshToken = () => {
  return crypto.randomBytes(AUTH_CONSTANTS.REFRESH_TOKEN_BYTES).toString('hex');
};

/**
 * Computes the SHA-256 hash of a raw refresh token.
 * Only this hash is persisted to the database.
 *
 * @param {string} rawToken - Plaintext refresh token string
 * @returns {string} Hex-encoded SHA-256 hash
 * @throws {ValidationError} If rawToken is missing or invalid
 */
export const hashRefreshToken = (rawToken) => {
  if (!rawToken || typeof rawToken !== 'string') {
    throw new ValidationError('Raw refresh token string is required for hashing');
  }

  return crypto.createHash('sha256').update(rawToken).digest('hex');
};
