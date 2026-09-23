import { prisma } from '../../database/prisma.client.js';
import { AUTH_CONSTANTS } from '../../config/constants.js';

/**
 * Authentication Repository
 *
 * Encapsulates all database persistence operations for users, credentials, and refresh sessions.
 * Enforces field selection safety (excluding password hashes from default queries).
 */

/**
 * Helper to select between transactional client and default tenant/base prisma client.
 * @param {Object} [tx] - Optional Prisma transaction client
 * @returns {Object} Active Prisma client
 */
const getClient = (tx) => tx || prisma;

/**
 * Default safe user field selection (excludes sensitive passwordHash).
 */
export const SAFE_USER_SELECT = Object.freeze({
  id: true,
  schoolId: true,
  email: true,
  systemRole: true,
  tokenVersion: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  legacyFirestoreId: true,
  school: {
    select: {
      id: true,
      name: true,
      code: true,
      status: true
    }
  },
  roleAssignments: {
    select: {
      id: true,
      schoolRoleId: true,
      schoolRole: {
        select: {
          id: true,
          name: true,
          slug: true,
          loginPanel: true
        }
      }
    }
  },
  staffProfile: {
    select: {
      id: true,
      name: true,
      staffType: true,
      designation: true
    }
  },
  parentProfile: {
    select: {
      id: true,
      name: true
    }
  }
});

/**
 * Extended user field selection for authentication verification (includes passwordHash).
 */
export const AUTH_USER_SELECT = Object.freeze({
  ...SAFE_USER_SELECT,
  passwordHash: true,
  passwordAlgorithm: true
});

/**
 * Retrieves a user by their unique UUID.
 *
 * @param {string} userId - User UUID
 * @param {Object} [options] - Query options
 * @param {boolean} [options.includePassword=false] - Whether to include passwordHash
 * @param {Object} [options.tx] - Optional Prisma transaction client
 * @returns {Promise<Object|null>} User object or null
 */
export const findUserById = async (userId, { includePassword = false, tx = null } = {}) => {
  if (!userId || typeof userId !== 'string') {
    return null;
  }

  const client = getClient(tx);
  return client.user.findUnique({
    where: { id: userId },
    select: includePassword ? AUTH_USER_SELECT : SAFE_USER_SELECT
  });
};

/**
 * Retrieves a user by their unique email address.
 * Normalizes email to lowercase and trimmed before querying.
 *
 * @param {string} email - User email address
 * @param {Object} [options] - Query options
 * @param {boolean} [options.includePassword=false] - Whether to include passwordHash
 * @param {Object} [options.tx] - Optional Prisma transaction client
 * @returns {Promise<Object|null>} User object or null
 */
export const findUserByEmail = async (email, { includePassword = false, tx = null } = {}) => {
  if (!email || typeof email !== 'string') {
    return null;
  }

  const client = getClient(tx);
  return client.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    select: includePassword ? AUTH_USER_SELECT : SAFE_USER_SELECT
  });
};

/**
 * Retrieves a user by their legacy Firestore ID or Firebase UID.
 *
 * @param {string} legacyFirestoreId - Firebase UID or Firestore document ID
 * @param {Object} [options] - Query options
 * @param {boolean} [options.includePassword=false] - Whether to include passwordHash
 * @param {Object} [options.tx] - Optional Prisma transaction client
 * @returns {Promise<Object|null>} User object or null
 */
export const findUserByLegacyFirestoreId = async (
  legacyFirestoreId,
  { includePassword = false, tx = null } = {}
) => {
  if (!legacyFirestoreId || typeof legacyFirestoreId !== 'string') {
    return null;
  }

  const client = getClient(tx);
  return client.user.findFirst({
    where: { legacyFirestoreId },
    select: includePassword ? AUTH_USER_SELECT : SAFE_USER_SELECT
  });
};

/**
 * Looks up an authoritative PostgreSQL user record for a verified Firebase identity.
 * Applies strict matching rules and conflict detection:
 * 1. Primary: legacyFirestoreId == firebaseUid
 * 2. Secondary: If no UID match AND email is present AND emailVerified is true AND not synthetic:
 *    User.email == normalizedEmail
 * 3. Identity Conflict: If UID matches User A and email matches User B (User A.id !== User B.id),
 *    detects conflict and signals rejection.
 *
 * @param {Object} params
 * @param {string} params.firebaseUid - Verified Firebase UID
 * @param {string|null} [params.email] - Verified Firebase email
 * @param {boolean} [params.emailVerified=false] - Whether Firebase email is verified
 * @param {Object} [options]
 * @param {Object} [options.tx] - Optional Prisma transaction client
 * @returns {Promise<{ user: Object|null, conflict: boolean }>}
 */
export const findUserForFirebaseIdentity = async (
  { firebaseUid, email = null, emailVerified = false },
  { includePassword = false, tx = null } = {}
) => {
  if (!firebaseUid || typeof firebaseUid !== 'string') {
    return { user: null, conflict: false };
  }

  const client = getClient(tx);
  const userSelect = includePassword ? AUTH_USER_SELECT : SAFE_USER_SELECT;

  // 1. Primary lookup by Firebase UID (legacyFirestoreId)
  const userByUid = await client.user.findFirst({
    where: { legacyFirestoreId: firebaseUid },
    select: userSelect
  });

  const normalizedEmail = email && typeof email === 'string' ? email.toLowerCase().trim() : null;

  // Synthetic email detection - prevent matching against synthetic parent emails
  const isSyntheticEmail = normalizedEmail
    ? normalizedEmail.includes('.sms.internal') ||
      normalizedEmail.includes('.parent.local') ||
      normalizedEmail.includes('@parent.')
    : false;

  let userByEmail = null;
  if (normalizedEmail && emailVerified && !isSyntheticEmail) {
    userByEmail = await client.user.findUnique({
      where: { email: normalizedEmail },
      select: userSelect
    });
  }

  // Conflict Detection: UID matches User A, but Email matches User B
  if (userByUid && userByEmail && userByUid.id !== userByEmail.id) {
    return { user: null, conflict: true };
  }

  if (userByUid) {
    return { user: userByUid, conflict: false };
  }

  if (userByEmail) {
    return { user: userByEmail, conflict: false };
  }

  return { user: null, conflict: false };
};


/**
 * Retrieves a refresh session by its SHA-256 token hash.
 * Includes associated user summary fields.
 *
 * @param {string} tokenHash - SHA-256 token hash
 * @param {Object} [options] - Query options
 * @param {Object} [options.tx] - Optional Prisma transaction client
 * @returns {Promise<Object|null>} Session record with user data or null
 */
export const findRefreshSessionByTokenHash = async (tokenHash, { tx = null } = {}) => {
  if (!tokenHash || typeof tokenHash !== 'string') {
    return null;
  }

  const client = getClient(tx);
  return client.refreshSession.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: {
          id: true,
          schoolId: true,
          email: true,
          systemRole: true,
          tokenVersion: true,
          isActive: true
        }
      }
    }
  });
};

/**
 * Persists a new refresh session record.
 *
 * @param {Object} data - Session details
 * @param {string} data.userId - User UUID
 * @param {string} data.tokenHash - SHA-256 hash of refresh token
 * @param {string|null} [data.deviceInfo] - User agent or client description
 * @param {string|null} [data.ipAddress] - Client IP address
 * @param {Date} data.expiresAt - Expiration timestamp
 * @param {Object} [options] - Query options
 * @param {Object} [options.tx] - Optional Prisma transaction client
 * @returns {Promise<Object>} Created session record
 */
export const createRefreshSession = async (
  { userId, tokenHash, deviceInfo = null, ipAddress = null, expiresAt },
  { tx = null } = {}
) => {
  const client = getClient(tx);
  return client.refreshSession.create({
    data: {
      userId,
      tokenHash,
      deviceInfo,
      ipAddress,
      expiresAt
    }
  });
};

/**
 * Marks a specific refresh session as revoked.
 *
 * @param {string} sessionId - RefreshSession UUID
 * @param {Object} [options] - Query options
 * @param {Object} [options.tx] - Optional Prisma transaction client
 * @returns {Promise<Object>} Updated session record
 */
export const revokeRefreshSession = async (sessionId, { tx = null } = {}) => {
  const client = getClient(tx);
  return client.refreshSession.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() }
  });
};

/**
 * Marks all active refresh sessions for a specific user as revoked.
 *
 * @param {string} userId - User UUID
 * @param {Object} [options] - Query options
 * @param {Object} [options.tx] - Optional Prisma transaction client
 * @returns {Promise<{ count: number }>} Number of sessions revoked
 */
export const revokeAllRefreshSessions = async (userId, { tx = null } = {}) => {
  const client = getClient(tx);
  return client.refreshSession.updateMany({
    where: {
      userId,
      revokedAt: null
    },
    data: { revokedAt: new Date() }
  });
};

/**
 * Atomically increments a user's tokenVersion.
 * Instantly invalidates all outstanding JWT access tokens.
 *
 * @param {string} userId - User UUID
 * @param {Object} [options] - Query options
 * @param {Object} [options.tx] - Optional Prisma transaction client
 * @returns {Promise<{ id: string, tokenVersion: number }>} Updated user record
 */
export const incrementTokenVersion = async (userId, { tx = null } = {}) => {
  const client = getClient(tx);
  return client.user.update({
    where: { id: userId },
    data: {
      tokenVersion: {
        increment: 1
      }
    },
    select: {
      id: true,
      tokenVersion: true
    }
  });
};

/**
 * Retrieves a School tenant by its UUID for tenant switching validation.
 *
 * @param {string} schoolId - School UUID
 * @param {Object} [options] - Query options
 * @param {Object} [options.tx] - Optional Prisma transaction client
 * @returns {Promise<Object|null>} School object or null
 */
export const findSchoolById = async (schoolId, { tx = null } = {}) => {
  if (!schoolId || typeof schoolId !== 'string') {
    return null;
  }

  const client = getClient(tx);
  return client.school.findUnique({
    where: { id: schoolId },
    select: {
      id: true,
      name: true,
      code: true,
      status: true
    }
  });
};

/**
 * Retrieves a School tenant by its unique school code.
 *
 * @param {string} code - Unique school code (e.g. 'SchoolS024')
 * @param {Object} [options] - Query options
 * @param {Object} [options.tx] - Optional Prisma transaction client
 * @returns {Promise<Object|null>} School object or null
 */
export const findSchoolByCode = async (code, { tx = null } = {}) => {
  if (!code || typeof code !== 'string') {
    return null;
  }

  const client = getClient(tx);
  return client.school.findUnique({
    where: { code: code.trim() },
    select: {
      id: true,
      name: true,
      code: true,
      status: true
    }
  });
};

/**
 * Retrieves a Student by admission number within a tenant school, including linked parent user accounts.
 * Must be executed within a valid tenant context for the specified schoolId.
 *
 * @param {string} schoolId - School tenant UUID
 * @param {string} admissionNumber - Student admission number
 * @param {Object} [options] - Query options
 * @param {Object} [options.tx] - Optional Prisma transaction client
 * @returns {Promise<Object|null>} Student record with linked parents or null
 */
export const findStudentWithParentsByAdmissionNumber = async (
  schoolId,
  admissionNumber,
  { tx = null } = {}
) => {
  if (!schoolId || typeof schoolId !== 'string' || !admissionNumber || typeof admissionNumber !== 'string') {
    return null;
  }

  const client = getClient(tx);
  return client.student.findUnique({
    where: {
      schoolId_admissionNumber: {
        schoolId,
        admissionNumber: admissionNumber.trim()
      }
    },
    include: {
      parents: {
        include: {
          parent: {
            include: {
              user: {
                select: AUTH_USER_SELECT
              }
            }
          }
        }
      }
    }
  });
};

/**
 * Creates a new password reset or setup token record.
 *
 * @param {Object} data
 * @param {string} data.userId - User UUID
 * @param {string} data.tokenHash - SHA-256 hash of raw token
 * @param {string} [data.tokenType='RESET'] - Token type ('RESET' | 'SETUP')
 * @param {string|null} [data.ipAddress] - Requesting IP address
 * @param {Date} data.expiresAt - Expiration timestamp
 * @param {Object} [options]
 * @param {Object} [options.tx] - Optional Prisma transaction client
 * @returns {Promise<Object>} Created token record
 */
export const createPasswordResetToken = async (
  { userId, tokenHash, tokenType = 'RESET', ipAddress = null, expiresAt },
  { tx = null } = {}
) => {
  const client = getClient(tx);
  return client.passwordResetToken.create({
    data: {
      userId,
      tokenHash,
      tokenType,
      ipAddress,
      expiresAt
    }
  });
};

/**
 * Retrieves a PasswordResetToken by its unique SHA-256 token hash including associated User data.
 *
 * @param {string} tokenHash - SHA-256 hash of raw token
 * @param {Object} [options]
 * @param {Object} [options.tx] - Optional Prisma transaction client
 * @returns {Promise<Object|null>} Token record with user or null
 */
export const findPasswordResetTokenByHash = async (tokenHash, { tx = null } = {}) => {
  if (!tokenHash || typeof tokenHash !== 'string') {
    return null;
  }

  const client = getClient(tx);
  return client.passwordResetToken.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: AUTH_USER_SELECT
      }
    }
  });
};

/**
 * Marks all active unused tokens of a specific type for a user as used (invalidated).
 *
 * @param {string} userId - User UUID
 * @param {string} [tokenType='RESET'] - Token type to invalidate
 * @param {Object} [options]
 * @param {Object} [options.tx] - Optional Prisma transaction client
 * @returns {Promise<{ count: number }>}
 */
export const invalidateUserResetTokens = async (userId, tokenType = 'RESET', { tx = null } = {}) => {
  if (!userId) {
    return { count: 0 };
  }
  const client = getClient(tx);
  return client.passwordResetToken.updateMany({
    where: {
      userId,
      tokenType,
      usedAt: null
    },
    data: {
      usedAt: new Date()
    }
  });
};


/**
 * Atomically consumes a reset/setup token, updates user password hash, increments tokenVersion,
 * and revokes all active refresh sessions in a single PostgreSQL transaction.
 *
 * @param {Object} params
 * @param {string} params.tokenId - PasswordResetToken UUID
 * @param {string} params.userId - User UUID
 * @param {string} params.newPasswordHash - Argon2id password hash
 * @param {Object} [options]
 * @param {Object} [options.tx] - Optional outer transaction client
 * @returns {Promise<{ success: boolean, user: Object }>}
 */
export const executePasswordResetTransaction = async (
  { tokenId, userId, newPasswordHash },
  { tx = null } = {}
) => {
  const execute = async (client) => {
    // 1. Conditionally consume token (enforces single-use & expiration atomicity)
    const tokenUpdate = await client.passwordResetToken.updateMany({
      where: {
        id: tokenId,
        usedAt: null,
        expiresAt: {
          gt: new Date()
        }
      },
      data: {
        usedAt: new Date()
      }
    });

    if (tokenUpdate.count === 0) {
      throw new Error('TOKEN_CONCURRENCY_OR_EXPIRED');
    }

    // 2. Update user passwordHash, algorithm, and increment tokenVersion
    const user = await client.user.update({
      where: { id: userId },
      data: {
        passwordHash: newPasswordHash,
        passwordAlgorithm: 'argon2id',
        tokenVersion: {
          increment: 1
        }
      },
      select: SAFE_USER_SELECT
    });

    // 3. Revoke all active refresh sessions for user
    await client.refreshSession.updateMany({
      where: {
        userId,
        revokedAt: null
      },
      data: {
        revokedAt: new Date()
      }
    });

    return { success: true, user };
  };

  if (tx) {
    return execute(tx);
  }

  return prisma.$transaction(async (t) => execute(t));
};

/**
 * Atomically updates user password hash, increments tokenVersion, and revokes all refresh sessions.
 * Used for authenticated password change.
 *
 * @param {Object} params
 * @param {string} params.userId - User UUID
 * @param {string} params.newPasswordHash - Argon2id password hash
 * @param {Object} [options]
 * @param {Object} [options.tx] - Optional outer transaction client
 * @returns {Promise<{ success: boolean, user: Object }>}
 */
export const executePasswordChangeTransaction = async (
  { userId, newPasswordHash },
  { tx = null } = {}
) => {
  const execute = async (client) => {
    // 1. Update user passwordHash, algorithm, and increment tokenVersion
    const user = await client.user.update({
      where: { id: userId },
      data: {
        passwordHash: newPasswordHash,
        passwordAlgorithm: 'argon2id',
        tokenVersion: {
          increment: 1
        }
      },
      select: SAFE_USER_SELECT
    });

    // 2. Revoke all active refresh sessions for user
    await client.refreshSession.updateMany({
      where: {
        userId,
        revokedAt: null
      },
      data: {
        revokedAt: new Date()
      }
    });

    return { success: true, user };
  };

  if (tx) {
    return execute(tx);
  }

  return prisma.$transaction(async (t) => execute(t));
};

/**
 * Atomically upgrades a locked user's password placeholder to a native Argon2id hash.
 * Only executes if the user currently possesses a locked password placeholder (!LOCKED_*).
 *
 * @param {Object} params
 * @param {string} params.userId - User UUID
 * @param {string} params.newPasswordHash - Argon2id password hash
 * @param {Object} [options]
 * @param {Object} [options.tx] - Optional outer transaction client
 * @returns {Promise<{ updated: boolean, user: Object|null }>}
 */
export const upgradeLockedUserPassword = async (
  { userId, newPasswordHash },
  { tx = null } = {}
) => {
  if (!userId || !newPasswordHash) {
    return { updated: false, user: null };
  }

  const execute = async (client) => {
    const updateResult = await client.user.updateMany({
      where: {
        id: userId,
        passwordHash: {
          startsWith: AUTH_CONSTANTS.FIREBASE_LOCKED_PASSWORD_PREFIX
        }
      },
      data: {
        passwordHash: newPasswordHash,
        passwordAlgorithm: 'argon2id',
        tokenVersion: {
          increment: 1
        }
      }
    });

    if (updateResult.count === 0) {
      return { updated: false, user: null };
    }

    const user = await client.user.findUnique({
      where: { id: userId },
      select: SAFE_USER_SELECT
    });

    return { updated: true, user };
  };

  if (tx) {
    return execute(tx);
  }

  return prisma.$transaction(async (t) => execute(t));
};



