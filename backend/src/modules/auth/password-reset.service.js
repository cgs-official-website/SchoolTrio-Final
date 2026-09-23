import crypto from 'node:crypto';
import { AUTH_CONSTANTS, TOKEN_TYPES, ERROR_CODES } from '../../config/constants.js';
import { UnauthorizedError, ForbiddenError, ValidationError } from '../../utils/app-error.js';
import * as authRepository from './auth.repository.js';
import { validatePasswordPolicy, hashPassword, verifyPassword, isLockedPassword } from './password.service.js';
import * as emailService from '../../services/email.service.js';

/**
 * Password Reset, First-Time Setup & Password Change Domain Service
 *
 * Orchestrates secure token generation, single-use SHA-256 token verification,
 * atomic PostgreSQL password mutations, and global session invalidations.
 */

/**
 * Generates a cryptographically secure 256-bit random token and its SHA-256 hash.
 *
 * @returns {{ rawToken: string, tokenHash: string }}
 */
export const generateSecureToken = () => {
  const rawToken = crypto.randomBytes(AUTH_CONSTANTS.RESET_TOKEN_BYTES || 32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  return { rawToken, tokenHash };
};

/**
 * Computes the SHA-256 hash of a raw token string for database lookup.
 *
 * @param {string} rawToken - 64-character hex token string
 * @returns {string} Hex-encoded SHA-256 hash
 */
export const hashToken = (rawToken) => {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
};

/**
 * Initiates a password reset request.
 * Dispatches an email with a 15-minute single-use reset token if the account is eligible.
 * Returns a standardized generic response to prevent account enumeration.
 *
 * @param {Object} params
 * @param {string} params.email - User email address
 * @param {string|null} [params.ipAddress] - Requesting client IP
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export const requestPasswordReset = async ({ email, ipAddress = null }) => {
  const genericResponse = {
    success: true,
    message: 'If an account exists for this email, password reset instructions have been sent.'
  };

  if (!email || typeof email !== 'string') {
    return genericResponse;
  }

  const normalizedEmail = email.toLowerCase().trim();

  // 1. Locate user record
  const user = await authRepository.findUserByEmail(normalizedEmail);

  // 2. Return generic success if account does not exist or is inactive (enumeration resistance)
  if (!user || !user.isActive) {
    return genericResponse;
  }

  // 3. Reject reset for suspended school tenants silently
  if (user.schoolId && user.school && user.school.status === 'suspended') {
    return genericResponse;
  }

  // 4. Invalidate any previously issued active RESET tokens for this user
  await authRepository.invalidateUserResetTokens(user.id, TOKEN_TYPES.RESET);

  // 5. Generate secure 256-bit token
  const { rawToken, tokenHash } = generateSecureToken();
  const expiresAt = new Date(
    Date.now() + (AUTH_CONSTANTS.PASSWORD_RESET_TOKEN_EXPIRY_MINUTES || 15) * 60 * 1000
  );

  // 6. Persist hashed token
  await authRepository.createPasswordResetToken({
    userId: user.id,
    tokenHash,
    tokenType: TOKEN_TYPES.RESET,
    ipAddress,
    expiresAt
  });

  // 7. Dispatch transactional email (raw token exists only in memory for delivery)
  await emailService.sendPasswordResetEmail({
    to: user.email,
    resetToken: rawToken,
    schoolName: user.school?.name || 'School Management System'
  });

  return genericResponse;
};

/**
 * Confirms password reset using a valid single-use reset token.
 * Atomically updates password, increments tokenVersion, and revokes all refresh sessions.
 *
 * @param {Object} params
 * @param {string} params.token - Raw 64-character hex reset token
 * @param {string} params.newPassword - Plaintext new password
 * @param {string|null} [params.ipAddress] - Requesting client IP
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export const confirmPasswordReset = async ({ token, newPassword, ipAddress: _ipAddress = null }) => {
  if (!token || typeof token !== 'string' || token.length !== (AUTH_CONSTANTS.RESET_TOKEN_BYTES * 2 || 64)) {
    throw new UnauthorizedError('Invalid or expired password reset token', ERROR_CODES.INVALID_TOKEN);
  }

  // 1. Validate new password against system complexity policy
  const policyResult = validatePasswordPolicy(newPassword);
  if (!policyResult.isValid) {
    throw new ValidationError('Password does not meet complexity requirements', policyResult.errors);
  }

  // 2. Locate token record by SHA-256 hash
  const tokenHash = hashToken(token);
  const resetRecord = await authRepository.findPasswordResetTokenByHash(tokenHash);

  if (
    !resetRecord ||
    resetRecord.tokenType !== TOKEN_TYPES.RESET ||
    resetRecord.usedAt !== null ||
    resetRecord.expiresAt <= new Date()
  ) {
    throw new UnauthorizedError('Invalid or expired password reset token', ERROR_CODES.INVALID_TOKEN);
  }

  const user = resetRecord.user;
  if (!user || !user.isActive) {
    throw new UnauthorizedError('Invalid or expired password reset token', ERROR_CODES.INVALID_TOKEN);
  }

  // 3. Hash new password with Argon2id
  const newPasswordHash = await hashPassword(newPassword);

  // 4. Atomically consume token, update user password, increment tokenVersion, and revoke sessions
  try {
    await authRepository.executePasswordResetTransaction({
      tokenId: resetRecord.id,
      userId: user.id,
      newPasswordHash
    });
  } catch (_err) {
    throw new UnauthorizedError('Invalid or expired password reset token', ERROR_CODES.INVALID_TOKEN);
  }

  return {
    success: true,
    message: 'Password has been successfully updated. Please log in with your new credentials.'
  };
};

/**
 * Confirms first-time password setup for a locked account using a valid invitation setup token.
 *
 * @param {Object} params
 * @param {string} params.token - Raw 64-character hex setup token
 * @param {string} params.newPassword - Plaintext new password
 * @param {string|null} [params.ipAddress] - Requesting client IP
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export const confirmPasswordSetup = async ({ token, newPassword, ipAddress: _ipAddress = null }) => {
  if (!token || typeof token !== 'string' || token.length !== (AUTH_CONSTANTS.RESET_TOKEN_BYTES * 2 || 64)) {
    throw new UnauthorizedError('Invalid or expired setup token', ERROR_CODES.INVALID_TOKEN);
  }

  // 1. Validate new password policy
  const policyResult = validatePasswordPolicy(newPassword);
  if (!policyResult.isValid) {
    throw new ValidationError('Password does not meet complexity requirements', policyResult.errors);
  }

  // 2. Locate token record by SHA-256 hash
  const tokenHash = hashToken(token);
  const setupRecord = await authRepository.findPasswordResetTokenByHash(tokenHash);

  if (
    !setupRecord ||
    setupRecord.tokenType !== TOKEN_TYPES.SETUP ||
    setupRecord.usedAt !== null ||
    setupRecord.expiresAt <= new Date()
  ) {
    throw new UnauthorizedError('Invalid or expired setup token', ERROR_CODES.INVALID_TOKEN);
  }

  const user = setupRecord.user;
  if (!user || !user.isActive) {
    throw new UnauthorizedError('Invalid or expired setup token', ERROR_CODES.INVALID_TOKEN);
  }

  // 3. Hash new password with Argon2id
  const newPasswordHash = await hashPassword(newPassword);

  // 4. Atomically consume setup token, set real Argon2id hash, increment tokenVersion, and revoke sessions
  try {
    await authRepository.executePasswordResetTransaction({
      tokenId: setupRecord.id,
      userId: user.id,
      newPasswordHash
    });
  } catch (_err) {
    throw new UnauthorizedError('Invalid or expired setup token', ERROR_CODES.INVALID_TOKEN);
  }

  return {
    success: true,
    message: 'Account password has been successfully configured. Please log in with your new credentials.'
  };
};

/**
 * Authenticated Password Change
 * Verifies current password, checks against reuse, updates passwordHash,
 * increments tokenVersion, and revokes all active sessions.
 *
 * @param {Object} params
 * @param {string} params.userId - Authenticated user UUID from req.auth.userId
 * @param {string} params.currentPassword - Plaintext current password
 * @param {string} params.newPassword - Plaintext new password
 * @param {string|null} [params.ipAddress] - Requesting client IP
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export const changePassword = async ({ userId, currentPassword, newPassword, ipAddress: _ipAddress = null }) => {

  if (!userId || typeof userId !== 'string') {
    throw new UnauthorizedError('Authentication required', ERROR_CODES.UNAUTHORIZED);
  }

  if (!currentPassword || typeof currentPassword !== 'string' || !newPassword || typeof newPassword !== 'string') {
    throw new ValidationError('Current password and new password are required');
  }

  if (currentPassword === newPassword) {
    throw new ValidationError('New password cannot be identical to your current password', [
      'New password must be different from current password'
    ]);
  }

  // 1. Retrieve user with credentials
  const user = await authRepository.findUserById(userId, { includePassword: true });
  if (!user || !user.isActive) {
    throw new UnauthorizedError('User account not found or inactive', ERROR_CODES.UNAUTHORIZED);
  }

  // 2. Reject locked placeholder accounts from changing password directly
  if (isLockedPassword(user.passwordHash)) {
    throw new ForbiddenError(
      'Password cannot be changed on a locked account. Please use password setup.',
      ERROR_CODES.PASSWORD_NOT_SET
    );
  }

  // 3. Verify current password
  const isMatch = await verifyPassword(user.passwordHash, currentPassword);
  if (!isMatch) {
    throw new UnauthorizedError('Current password is incorrect', ERROR_CODES.INVALID_CREDENTIALS);
  }

  // 4. Validate new password complexity
  const policyResult = validatePasswordPolicy(newPassword);
  if (!policyResult.isValid) {
    throw new ValidationError('Password does not meet complexity requirements', policyResult.errors);
  }

  // 5. Hash new password with Argon2id
  const newPasswordHash = await hashPassword(newPassword);

  // 6. Atomically update password, increment tokenVersion, and revoke all active refresh sessions
  await authRepository.executePasswordChangeTransaction({
    userId: user.id,
    newPasswordHash
  });

  return {
    success: true,
    message: 'Password changed successfully. All previous sessions have been invalidated.'
  };
};
