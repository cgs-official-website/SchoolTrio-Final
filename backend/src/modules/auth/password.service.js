import argon2 from 'argon2';
import { AUTH_CONSTANTS } from '../../config/constants.js';
import { ValidationError } from '../../utils/app-error.js';

/**
 * Validates a plaintext password against the system password policy.
 * Policy:
 * - Must be a string
 * - Minimum 8 characters
 * - Maximum 128 characters
 * - At least one uppercase character [A-Z]
 * - At least one lowercase character [a-z]
 * - At least one number [0-9]
 *
 * NOTE: Passwords are treated as exact secrets. No trimming or case conversion is applied.
 *
 * @param {any} password - Password candidate to evaluate
 * @returns {{ isValid: boolean, errors: string[] }} Validation result
 */
export const validatePasswordPolicy = (password) => {
  const errors = [];

  if (typeof password !== 'string') {
    return {
      isValid: false,
      errors: ['Password must be a string']
    };
  }

  if (password.length < AUTH_CONSTANTS.MIN_PASSWORD_LENGTH) {
    errors.push(`Password must be at least ${AUTH_CONSTANTS.MIN_PASSWORD_LENGTH} characters long`);
  }

  if (password.length > AUTH_CONSTANTS.MAX_PASSWORD_LENGTH) {
    errors.push(`Password must not exceed ${AUTH_CONSTANTS.MAX_PASSWORD_LENGTH} characters`);
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Determines whether a password hash represents a locked placeholder account.
 * (e.g. Migrated users with '!LOCKED_FIREBASE_AUTH_MANAGED').
 *
 * @param {any} passwordHash - Stored password hash string
 * @returns {boolean} True if password represents a locked account
 */
export const isLockedPassword = (passwordHash) => {
  if (!passwordHash || typeof passwordHash !== 'string') {
    return false;
  }
  return passwordHash.startsWith(AUTH_CONSTANTS.LOCKED_PASSWORD_PREFIX);
};

/**
 * Hashes a plaintext password using Argon2id with RFC 9106 recommended parameters.
 * Validates password policy prior to hashing.
 *
 * @param {string} password - Exact plaintext password to hash
 * @param {Object} [customOptions] - Optional Argon2 override options (e.g. for fast unit tests)
 * @returns {Promise<string>} Encoded Argon2id password hash
 * @throws {ValidationError} If password does not meet policy complexity
 */
export const hashPassword = async (password, customOptions = {}) => {
  const policyResult = validatePasswordPolicy(password);
  if (!policyResult.isValid) {
    throw new ValidationError(
      'Password does not meet complexity requirements',
      policyResult.errors
    );
  }

  const options = {
    type: argon2.argon2id,
    memoryCost: AUTH_CONSTANTS.ARGON2_PARAMS.memoryCost,
    timeCost: AUTH_CONSTANTS.ARGON2_PARAMS.timeCost,
    parallelism: AUTH_CONSTANTS.ARGON2_PARAMS.parallelism,
    hashLength: AUTH_CONSTANTS.ARGON2_PARAMS.hashLength,
    ...customOptions
  };

  return argon2.hash(password, options);
};

/**
 * Verifies a candidate plaintext password against an encoded Argon2id hash.
 * Safely guards against locked placeholder accounts and invalid hash formats.
 *
 * @param {string} passwordHash - Encoded hash from database
 * @param {string} password - Candidate plaintext password
 * @returns {Promise<boolean>} True if password matches hash; false otherwise
 */
export const verifyPassword = async (passwordHash, password) => {
  if (!password || typeof password !== 'string') {
    return false;
  }

  if (!passwordHash || typeof passwordHash !== 'string') {
    return false;
  }

  // Fast-fail: Locked migrated placeholders must NEVER reach Argon2 verify computation
  if (isLockedPassword(passwordHash)) {
    return false;
  }

  try {
    return await argon2.verify(passwordHash, password);
  } catch (_error) {
    // Malformed hash or internal verification error safely yields false
    return false;
  }
};
