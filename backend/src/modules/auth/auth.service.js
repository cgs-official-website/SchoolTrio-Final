import { AUTH_CONSTANTS, ERROR_CODES } from '../../config/constants.js';
import { UnauthorizedError, ForbiddenError } from '../../utils/app-error.js';
import * as authRepository from './auth.repository.js';
import { verifyPassword, isLockedPassword, hashPassword, validatePasswordPolicy } from './password.service.js';
import { issueAccessToken } from './token.service.js';
import * as sessionService from './session.service.js';
import { verifyFirebaseIdToken } from '../../services/firebase-auth.service.js';


/**
 * Authentication Domain Service
 *
 * Orchestrates login, token refresh, logout, session revocation,
 * and user identity retrieval.
 */

/**
 * Authenticates a user via email and password.
 * Issues a new JWT access token and establishes an HttpOnly refresh session.
 *
 * @param {Object} params
 * @param {string} params.identifier - User email address
 * @param {string} params.password - Plaintext password
 * @param {string|null} [params.ipAddress] - Client IP address
 * @param {string|null} [params.deviceInfo] - Client device/browser User-Agent
 * @returns {Promise<{ accessToken: string, rawRefreshToken: string, user: Object }>}
 */
export const login = async ({ identifier, password, ipAddress = null, deviceInfo = null }) => {
  if (!identifier || typeof identifier !== 'string' || !password || typeof password !== 'string') {
    throw new UnauthorizedError('Invalid email or password', ERROR_CODES.INVALID_CREDENTIALS);
  }

  const normalizedEmail = identifier.toLowerCase().trim();

  // 1. Locate user record with credentials
  const user = await authRepository.findUserByEmail(normalizedEmail, { includePassword: true });

  // 2. Generic authentication failure if user does not exist (prevents enumeration)
  if (!user) {
    throw new UnauthorizedError('Invalid email or password', ERROR_CODES.INVALID_CREDENTIALS);
  }

  // 3. Locked account guard (e.g. Migrated Firebase users)
  if (isLockedPassword(user.passwordHash)) {
    throw new ForbiddenError(
      'Password is not set for this account. Please use password setup or reset.',
      ERROR_CODES.PASSWORD_NOT_SET
    );
  }

  // 4. Account active state verification
  if (!user.isActive) {
    throw new ForbiddenError(
      'Your account has been deactivated. Please contact administrator.',
      ERROR_CODES.ACCOUNT_DISABLED
    );
  }

  // 5. Tenant eligibility check for institutional users
  if (user.schoolId && user.school) {
    if (user.school.status === 'suspended') {
      throw new ForbiddenError(
        'School tenant account is suspended. Please contact platform support.',
        ERROR_CODES.TENANT_ACCESS_ERROR
      );
    }
    if (user.school.status === 'pending') {
      throw new ForbiddenError(
        'School tenant account is pending approval. Please contact platform support.',
        ERROR_CODES.TENANT_ACCESS_ERROR
      );
    }
  }

  // 6. Cryptographic password verification (Argon2id)
  const isMatch = await verifyPassword(user.passwordHash, password);
  if (!isMatch) {
    throw new UnauthorizedError('Invalid email or password', ERROR_CODES.INVALID_CREDENTIALS);
  }

  // 7. Establish refresh session
  const { rawToken: rawRefreshToken } = await sessionService.createSession(user, {
    ipAddress,
    deviceInfo
  });

  // 8. Issue minimal-claim JWT access token
  const accessToken = issueAccessToken({
    sub: user.id,
    schoolId: user.schoolId,
    systemRole: user.systemRole,
    tokenVersion: user.tokenVersion
  });

  // 9. Return safe response payload (strictly excludes passwordHash, legacyFirestoreId)
  return {
    accessToken,
    rawRefreshToken,
    user: {
      id: user.id,
      email: user.email,
      schoolId: user.schoolId,
      systemRole: user.systemRole,
      roleAssignments: user.roleAssignments || [],
      staffProfile: user.staffProfile || null,
      parentProfile: user.parentProfile || null
    }
  };
};

/**
 * Rotates an active refresh token session and issues a new access token.
 *
 * @param {Object} params
 * @param {string} params.rawRefreshToken - Plaintext refresh token from cookie
 * @param {string|null} [params.ipAddress] - Client IP
 * @param {string|null} [params.deviceInfo] - Client User-Agent
 * @returns {Promise<{ accessToken: string, newRawRefreshToken: string, user: Object }>}
 */
export const refresh = async ({ rawRefreshToken, ipAddress = null, deviceInfo = null }) => {
  if (!rawRefreshToken || typeof rawRefreshToken !== 'string') {
    throw new UnauthorizedError('Refresh token is required', ERROR_CODES.INVALID_REFRESH_TOKEN);
  }

  // 1. Rotate refresh session (enforces atomic reuse/expiry/revocation detection)
  const { newRawToken: newRawRefreshToken, user } = await sessionService.rotateSession(
    rawRefreshToken,
    { ipAddress, deviceInfo }
  );

  // 2. Verify user active state
  if (!user.isActive) {
    throw new ForbiddenError(
      'Your account has been deactivated. Please contact administrator.',
      ERROR_CODES.ACCOUNT_DISABLED
    );
  }

  // 3. Issue new minimal-claim access token
  const accessToken = issueAccessToken({
    sub: user.id,
    schoolId: user.schoolId,
    systemRole: user.systemRole,
    tokenVersion: user.tokenVersion
  });

  return {
    accessToken,
    newRawRefreshToken,
    user: {
      id: user.id,
      email: user.email,
      schoolId: user.schoolId,
      systemRole: user.systemRole,
      roleAssignments: user.roleAssignments || [],
      staffProfile: user.staffProfile || null,
      parentProfile: user.parentProfile || null
    }
  };
};

/**
 * Revokes the active refresh session and logs out the current device.
 *
 * @param {Object} params
 * @param {string|null} [params.rawRefreshToken] - Plaintext refresh token to revoke
 * @returns {Promise<{ success: boolean }>}
 */
export const logout = async ({ rawRefreshToken = null }) => {
  if (rawRefreshToken && typeof rawRefreshToken === 'string') {
    await sessionService.revokeSession(rawRefreshToken);
  }
  return { success: true };
};

/**
 * Revokes all active refresh sessions for a user and increments tokenVersion.
 * Terminates all logins across all devices.
 *
 * @param {Object} params
 * @param {string} params.userId - Authenticated user UUID
 * @returns {Promise<{ success: boolean }>}
 */
export const logoutAll = async ({ userId }) => {
  if (!userId || typeof userId !== 'string') {
    throw new UnauthorizedError('Authentication required: user ID missing');
  }

  await sessionService.revokeAllUserSessions(userId);
  return { success: true };
};

/**
 * Retrieves safe profile identity details for the authenticated user.
 *
 * @param {Object} params
 * @param {string} params.userId - Authenticated user UUID
 * @returns {Promise<Object>} Safe user DTO
 */
export const getCurrentUser = async ({ userId }) => {
  if (!userId || typeof userId !== 'string') {
    throw new UnauthorizedError('Authentication required', ERROR_CODES.UNAUTHORIZED);
  }

  const user = await authRepository.findUserById(userId);

  if (!user || !user.isActive) {
    throw new UnauthorizedError('User account not found or inactive', ERROR_CODES.UNAUTHORIZED);
  }

  return {
    id: user.id,
    email: user.email,
    schoolId: user.schoolId,
    systemRole: user.systemRole,
    isActive: user.isActive,
    school: user.school || null,
    roleAssignments: user.roleAssignments || [],
    staffProfile: user.staffProfile || null,
    parentProfile: user.parentProfile || null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
};

/**
 * Exchanges a verified Firebase ID token for an authoritative PostgreSQL JWT session.
 *
 * Pipeline:
 * 1. Cryptographically verifies Firebase ID token (RS256, expiration, project boundary).
 * 2. Extracts verified Firebase UID and verified email.
 * 3. Maps Firebase identity to PostgreSQL User record (UID primary, verified email fallback).
 * 4. Checks for identity conflicts between UID and email.
 * 5. Rejects unmapped Firebase accounts (prevents auto-provisioning).
 * 6. Validates PostgreSQL user active status and school tenant active status.
 * 7. Establishes PostgreSQL RefreshSession.
 * 8. Issues standard PostgreSQL JWT access token.
 * 9. Returns { accessToken, rawRefreshToken, user }.
 *
 * @param {Object} params
 * @param {string} params.idToken - Raw Firebase ID token (JWT)
 * @param {string|null} [params.ipAddress] - Client IP address
 * @param {string|null} [params.deviceInfo] - Client device/browser User-Agent
 * @param {Function|null} [params.verifier] - Optional verifier for dependency injection in tests
 * @returns {Promise<{ accessToken: string, rawRefreshToken: string, user: Object }>}
 */
export const firebaseExchange = async ({
  idToken,
  password = null,
  ipAddress = null,
  deviceInfo = null,
  verifier = null
}) => {
  // 1. Cryptographically verify Firebase ID token
  const { uid: firebaseUid, email, emailVerified } = await verifyFirebaseIdToken(idToken, { verifier });

  // 2. Map identity to PostgreSQL User with conflict detection
  const { user, conflict } = password
    ? await authRepository.findUserForFirebaseIdentity(
        { firebaseUid, email, emailVerified },
        { includePassword: true }
      )
    : await authRepository.findUserForFirebaseIdentity({
        firebaseUid,
        email,
        emailVerified
      });

  if (conflict) {
    throw new UnauthorizedError(
      'Identity conflict detected for this account. Please contact administrator.',
      ERROR_CODES.IDENTITY_CONFLICT
    );
  }

  // 3. Reject unmapped Firebase accounts (Strict No Auto-Provisioning Invariant)
  if (!user) {
    throw new UnauthorizedError(
      'User account not found in system. Please contact administrator.',
      ERROR_CODES.USER_NOT_FOUND
    );
  }

  // 4. PostgreSQL account state validation
  if (!user.isActive) {
    throw new ForbiddenError(
      'Your account has been deactivated. Please contact administrator.',
      ERROR_CODES.ACCOUNT_DISABLED
    );
  }

  // 5. Tenant status validation
  if (user.schoolId && user.school) {
    if (user.school.status === 'suspended') {
      throw new ForbiddenError(
        'School tenant account is suspended. Please contact platform support.',
        ERROR_CODES.TENANT_SUSPENDED
      );
    }
    if (user.school.status === 'pending') {
      throw new ForbiddenError(
        'School tenant account is pending approval. Please contact platform support.',
        ERROR_CODES.TENANT_ACCESS_ERROR
      );
    }
  }

  // 6. Progressive JIT Credential Migration (FRONTEND.D5)
  // If user has a locked placeholder (!LOCKED_*) and valid password was provided,
  // atomically upgrade their passwordHash to Argon2id and increment tokenVersion.
  let effectiveUser = user;
  if (password && isLockedPassword(user.passwordHash)) {
    const policyResult = validatePasswordPolicy(password);
    if (policyResult.isValid) {
      const newPasswordHash = await hashPassword(password);
      const upgradeResult = await authRepository.upgradeLockedUserPassword({
        userId: user.id,
        newPasswordHash
      });
      if (upgradeResult.updated && upgradeResult.user) {
        effectiveUser = upgradeResult.user;
      }
    }
  }

  // 7. Establish PostgreSQL RefreshSession
  const { rawToken: rawRefreshToken } = await sessionService.createSession(effectiveUser, {
    ipAddress,
    deviceInfo
  });

  // 8. Issue minimal-claim JWT access token
  const accessToken = issueAccessToken({
    sub: effectiveUser.id,
    schoolId: effectiveUser.schoolId,
    systemRole: effectiveUser.systemRole,
    tokenVersion: effectiveUser.tokenVersion
  });

  // 9. Return safe authentication payload
  return {
    accessToken,
    rawRefreshToken,
    user: {
      id: effectiveUser.id,
      email: effectiveUser.email,
      schoolId: effectiveUser.schoolId,
      systemRole: effectiveUser.systemRole,
      roleAssignments: effectiveUser.roleAssignments || [],
      staffProfile: effectiveUser.staffProfile || null,
      parentProfile: effectiveUser.parentProfile || null
    }
  };
};

export { authenticateByAdmissionNumber } from './admission-auth.service.js';


