import { ERROR_CODES } from '../../config/constants.js';
import { UnauthorizedError, ForbiddenError } from '../../utils/app-error.js';
import { runWithTenantContext } from '../../database/prisma.client.js';
import * as authRepository from './auth.repository.js';
import { verifyPassword, isLockedPassword } from './password.service.js';
import { issueAccessToken } from './token.service.js';
import * as sessionService from './session.service.js';

/**
 * Admission Number Authentication Domain Service
 *
 * Resolves parent authentication identity through relational database mapping:
 * (schoolCode + admissionNumber) -> School -> Student -> ParentStudentLink -> ParentProfile -> User.
 */

/**
 * Authenticates a parent user via student admission number and school code.
 *
 * @param {Object} params
 * @param {string} params.schoolCode - Unique school identifier code
 * @param {string} params.admissionNumber - Student admission number
 * @param {string} params.password - Plaintext password
 * @param {string|null} [params.ipAddress] - Client IP address
 * @param {string|null} [params.deviceInfo] - Client device User-Agent
 * @returns {Promise<{ accessToken: string, rawRefreshToken: string, user: Object }>}
 */
export const authenticateByAdmissionNumber = async ({
  schoolCode,
  admissionNumber,
  password,
  ipAddress = null,
  deviceInfo = null
}) => {
  if (
    !schoolCode ||
    typeof schoolCode !== 'string' ||
    !admissionNumber ||
    typeof admissionNumber !== 'string' ||
    !password ||
    typeof password !== 'string'
  ) {
    throw new UnauthorizedError(
      'Invalid admission number, school code, or password',
      ERROR_CODES.INVALID_CREDENTIALS
    );
  }

  const normalizedSchoolCode = schoolCode.trim();
  const normalizedAdmissionNumber = admissionNumber.trim();

  // 1. Resolve tenant school by code
  const school = await authRepository.findSchoolByCode(normalizedSchoolCode);
  if (!school) {
    throw new UnauthorizedError(
      'Invalid admission number, school code, or password',
      ERROR_CODES.INVALID_CREDENTIALS
    );
  }

  // 2. Validate tenant status
  if (school.status === 'suspended') {
    throw new ForbiddenError(
      'School tenant account is suspended. Please contact platform support.',
      ERROR_CODES.TENANT_ACCESS_ERROR
    );
  }
  if (school.status === 'pending') {
    throw new ForbiddenError(
      'School tenant account is pending approval. Please contact platform support.',
      ERROR_CODES.TENANT_ACCESS_ERROR
    );
  }

  // 3. Resolve student and linked parent profiles within tenant isolation context
  const student = await runWithTenantContext({ schoolId: school.id }, async () => {
    return authRepository.findStudentWithParentsByAdmissionNumber(
      school.id,
      normalizedAdmissionNumber
    );
  });

  if (!student) {
    throw new UnauthorizedError(
      'Invalid admission number, school code, or password',
      ERROR_CODES.INVALID_CREDENTIALS
    );
  }

  // 4. Verify student active state
  if (student.status && student.status.toLowerCase() !== 'active') {
    throw new UnauthorizedError(
      'Invalid admission number, school code, or password',
      ERROR_CODES.INVALID_CREDENTIALS
    );
  }

  // 5. Extract and validate candidate parent users
  const candidateUsers = (student.parents || [])
    .map((link) => link.parent?.user)
    .filter((user) => {
      return (
        Boolean(user) &&
        user.schoolId === school.id &&
        user.isActive === true &&
        user.systemRole !== 'SUPER_ADMIN'
      );
    });

  if (candidateUsers.length === 0) {
    throw new UnauthorizedError(
      'Invalid admission number, school code, or password',
      ERROR_CODES.INVALID_CREDENTIALS
    );
  }

  // 6. Partition candidates into usable vs locked accounts
  const usableCandidates = candidateUsers.filter((user) => !isLockedPassword(user.passwordHash));

  if (usableCandidates.length === 0) {
    // All linked parent accounts are locked migrated placeholders
    throw new ForbiddenError(
      'Password is not set for this account. Please use password setup or reset.',
      ERROR_CODES.PASSWORD_NOT_SET
    );
  }

  // 7. Verify credentials against usable candidate parent accounts
  let authenticatedUser = null;
  for (const candidate of usableCandidates) {
    const isMatch = await verifyPassword(candidate.passwordHash, password);
    if (isMatch) {
      authenticatedUser = candidate;
      break;
    }
  }

  if (!authenticatedUser) {
    throw new UnauthorizedError(
      'Invalid admission number, school code, or password',
      ERROR_CODES.INVALID_CREDENTIALS
    );
  }

  // 8. Establish refresh session
  const { rawToken: rawRefreshToken } = await sessionService.createSession(authenticatedUser, {
    ipAddress,
    deviceInfo
  });

  // 9. Issue minimal-claim JWT access token
  const accessToken = issueAccessToken({
    sub: authenticatedUser.id,
    schoolId: authenticatedUser.schoolId,
    systemRole: authenticatedUser.systemRole,
    tokenVersion: authenticatedUser.tokenVersion
  });

  // 10. Return internal payload (rawRefreshToken is internal to controller for cookie setup)
  return {
    accessToken,
    rawRefreshToken,
    user: {
      id: authenticatedUser.id,
      email: authenticatedUser.email,
      schoolId: authenticatedUser.schoolId,
      systemRole: authenticatedUser.systemRole
    }
  };
};
