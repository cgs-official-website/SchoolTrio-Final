import { UnauthorizedError, ForbiddenError } from '../utils/app-error.js';
import { ERROR_CODES } from '../config/constants.js';
import { verifyAccessToken } from '../modules/auth/token.service.js';
import * as authRepository from '../modules/auth/auth.repository.js';

/**
 * Authentication Middleware (Phase 4B.3 Authoritative Implementation)
 *
 * Enforces cryptographic JWT verification and authoritative PostgreSQL user state.
 *
 * Pipeline:
 * 1. Extracts Authorization: Bearer <access-token> header.
 * 2. Cryptographically verifies JWT signature (HS256) and expiration.
 * 3. Validates required claims (sub, tokenVersion).
 * 4. Queries authoritative User record from PostgreSQL.
 * 5. Enforces user existence and isActive status.
 * 6. Enforces tokenVersion against database (invalidates stale access tokens).
 * 7. Attaches authenticated identity to req.auth and req.user.
 */

/**
 * Authoritative middleware requiring a valid authenticated JWT session.
 * Rejects missing, malformed, expired, tampered, or stale tokens.
 */
export const authenticate = async (req, _res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Authentication required: missing or invalid authorization header', ERROR_CODES.UNAUTHORIZED);
    }

    const token = authHeader.split(' ')[1];
    if (!token || token.trim() === '') {
      throw new UnauthorizedError('Authentication required: empty bearer token', ERROR_CODES.UNAUTHORIZED);
    }

    // 1. Cryptographic JWT Verification (HS256, expiration, claim validation)
    const decoded = verifyAccessToken(token);

    if (!decoded || !decoded.sub) {
      throw new UnauthorizedError('Invalid access token: missing subject claim', ERROR_CODES.INVALID_TOKEN);
    }

    if (typeof decoded.tokenVersion !== 'number') {
      throw new UnauthorizedError('Invalid access token: missing tokenVersion claim', ERROR_CODES.INVALID_TOKEN);
    }

    // 2. Authoritative PostgreSQL User lookup
    const user = await authRepository.findUserById(decoded.sub);

    if (!user) {
      throw new UnauthorizedError('User account not found', ERROR_CODES.UNAUTHORIZED);
    }

    // 3. Account active state enforcement
    if (!user.isActive) {
      throw new ForbiddenError('Your account has been deactivated. Please contact administrator.', ERROR_CODES.ACCOUNT_DISABLED);
    }

    // 4. TokenVersion enforcement (Stale token invalidation)
    if (decoded.tokenVersion !== user.tokenVersion) {
      throw new UnauthorizedError('Access token has been invalidated. Please log in again.', ERROR_CODES.INVALID_TOKEN);
    }

    // 5. Attach authenticated identity
    req.auth = {
      userId: user.id,
      schoolId: user.schoolId,
      systemRole: user.systemRole,
      tokenVersion: user.tokenVersion,
      jti: decoded.jti || null
    };

    req.user = {
      id: user.id,
      schoolId: user.schoolId,
      systemRole: user.systemRole,
      role: user.systemRole,
      tokenVersion: user.tokenVersion,
      jti: decoded.jti || null,
      email: user.email,
      school: user.school || null
    };

    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Middleware allowing optional authentication.
 * Populates req.auth and req.user if a valid token is presented; otherwise allows guest execution.
 */
export const optionalAuth = async (req, _res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    req.auth = null;
    req.user = null;
    return next();
  }

  const token = authHeader.split(' ')[1];
  if (!token || token.trim() === '') {
    req.auth = null;
    req.user = null;
    return next();
  }

  try {
    const decoded = verifyAccessToken(token);
    if (decoded && decoded.sub && typeof decoded.tokenVersion === 'number') {
      const user = await authRepository.findUserById(decoded.sub);
      if (user && user.isActive && decoded.tokenVersion === user.tokenVersion) {
        req.auth = {
          userId: user.id,
          schoolId: user.schoolId,
          systemRole: user.systemRole,
          tokenVersion: user.tokenVersion,
          jti: decoded.jti || null
        };
        req.user = {
          id: user.id,
          schoolId: user.schoolId,
          systemRole: user.systemRole,
          role: user.systemRole,
          tokenVersion: user.tokenVersion,
          jti: decoded.jti || null,
          email: user.email,
          school: user.school || null
        };
        return next();
      }
    }
  } catch (_err) {
    // Optional auth fails open to guest context
  }

  req.auth = null;
  req.user = null;
  next();
};
