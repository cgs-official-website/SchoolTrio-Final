import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  findUserById,
  findUserByEmail,
  findUserByLegacyFirestoreId,
  findRefreshSessionByTokenHash,
  createRefreshSession,
  revokeRefreshSession,
  revokeAllRefreshSessions,
  incrementTokenVersion,
  findSchoolById,
  findSchoolByCode,
  findStudentWithParentsByAdmissionNumber,
  createPasswordResetToken,
  findPasswordResetTokenByHash,
  invalidateUserResetTokens,
  executePasswordResetTransaction,
  executePasswordChangeTransaction,
  findUserForFirebaseIdentity,
  findCandidateUsersByIdentifier,
  SAFE_USER_SELECT,
  AUTH_USER_SELECT
} from '../../../src/modules/auth/auth.repository.js';
import { prisma, basePrisma } from '../../../src/database/prisma.client.js';



describe('Authentication Repository', () => {
  const sampleUserId = 'e9c4e270-26e1-43ac-8279-886ec13f4776';
  const sampleEmail = 'test@school.edu';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('SAFE_USER_SELECT and AUTH_USER_SELECT', () => {
    it('SAFE_USER_SELECT does not include passwordHash', () => {
      expect(SAFE_USER_SELECT.passwordHash).toBeUndefined();
      expect(SAFE_USER_SELECT.passwordAlgorithm).toBeUndefined();
      expect(SAFE_USER_SELECT.id).toBe(true);
      expect(SAFE_USER_SELECT.email).toBe(true);
      expect(SAFE_USER_SELECT.schoolId).toBe(true);
      expect(SAFE_USER_SELECT.tokenVersion).toBe(true);
    });

    it('AUTH_USER_SELECT includes passwordHash and passwordAlgorithm', () => {
      expect(AUTH_USER_SELECT.passwordHash).toBe(true);
      expect(AUTH_USER_SELECT.passwordAlgorithm).toBe(true);
      expect(AUTH_USER_SELECT.id).toBe(true);
    });
  });

  describe('findUserById', () => {
    it('queries user by ID with safe field selection by default', async () => {
      const mockFindUnique = vi.fn().mockResolvedValue({ id: sampleUserId, email: sampleEmail });
      vi.spyOn(prisma.user, 'findUnique').mockImplementation(mockFindUnique);

      const user = await findUserById(sampleUserId);

      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { id: sampleUserId },
        select: SAFE_USER_SELECT
      });
      expect(user.id).toBe(sampleUserId);
    });

    it('includes password fields when includePassword is true', async () => {
      const mockFindUnique = vi.fn().mockResolvedValue({
        id: sampleUserId,
        email: sampleEmail,
        passwordHash: '$argon2id$...',
        passwordAlgorithm: 'argon2id'
      });
      vi.spyOn(prisma.user, 'findUnique').mockImplementation(mockFindUnique);

      await findUserById(sampleUserId, { includePassword: true });

      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { id: sampleUserId },
        select: AUTH_USER_SELECT
      });
    });

    it('returns null for empty or invalid ID', async () => {
      expect(await findUserById(null)).toBeNull();
      expect(await findUserById('')).toBeNull();
    });
  });

  describe('findUserByEmail', () => {
    it('normalizes email to lowercase and trimmed before querying', async () => {
      const mockFindFirst = vi.fn().mockResolvedValue({ id: sampleUserId, email: sampleEmail });
      vi.spyOn(prisma.user, 'findFirst').mockImplementation(mockFindFirst);

      await findUserByEmail('  Test@School.EDU  ');

      expect(mockFindFirst).toHaveBeenCalledWith({
        where: { email: 'test@school.edu' },
        select: SAFE_USER_SELECT
      });
    });


    it('returns null for invalid email input', async () => {
      expect(await findUserByEmail(null)).toBeNull();
      expect(await findUserByEmail('')).toBeNull();
    });
  });

  describe('findUserByLegacyFirestoreId', () => {
    it('queries user by legacyFirestoreId', async () => {
      const mockFindFirst = vi.fn().mockResolvedValue({ id: sampleUserId });
      vi.spyOn(prisma.user, 'findFirst').mockImplementation(mockFindFirst);

      await findUserByLegacyFirestoreId('firebase-uid-12345');

      expect(mockFindFirst).toHaveBeenCalledWith({
        where: { legacyFirestoreId: 'firebase-uid-12345' },
        select: SAFE_USER_SELECT
      });
    });

    it('returns null for empty legacyFirestoreId', async () => {
      expect(await findUserByLegacyFirestoreId(null)).toBeNull();
    });
  });

  describe('findRefreshSessionByTokenHash', () => {
    it('queries refresh session with associated user metadata', async () => {
      const mockFindUnique = vi.fn().mockResolvedValue({ id: 'session-1', tokenHash: 'hash-1' });
      vi.spyOn(prisma.refreshSession, 'findUnique').mockImplementation(mockFindUnique);

      await findRefreshSessionByTokenHash('hash-1');

      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { tokenHash: 'hash-1' },
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
    });

    it('returns null for invalid tokenHash', async () => {
      expect(await findRefreshSessionByTokenHash(null)).toBeNull();
    });
  });

  describe('createRefreshSession, revokeRefreshSession, revokeAllRefreshSessions, incrementTokenVersion', () => {
    it('creates a refresh session record', async () => {
      const mockCreate = vi.fn().mockResolvedValue({ id: 'session-123' });
      vi.spyOn(prisma.refreshSession, 'create').mockImplementation(mockCreate);

      const expiresAt = new Date();
      await createRefreshSession({
        userId: sampleUserId,
        tokenHash: 'hash-xyz',
        deviceInfo: 'Agent',
        ipAddress: '1.2.3.4',
        expiresAt
      });

      expect(mockCreate).toHaveBeenCalledWith({
        data: {
          userId: sampleUserId,
          tokenHash: 'hash-xyz',
          deviceInfo: 'Agent',
          ipAddress: '1.2.3.4',
          expiresAt
        }
      });
    });

    it('revokes a single refresh session', async () => {
      const mockUpdate = vi.fn().mockResolvedValue({ id: 'session-123' });
      vi.spyOn(prisma.refreshSession, 'update').mockImplementation(mockUpdate);

      await revokeRefreshSession('session-123');

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'session-123' },
        data: { revokedAt: expect.any(Date) }
      });
    });

    it('revokes all active refresh sessions for a user', async () => {
      const mockUpdateMany = vi.fn().mockResolvedValue({ count: 3 });
      vi.spyOn(prisma.refreshSession, 'updateMany').mockImplementation(mockUpdateMany);

      const res = await revokeAllRefreshSessions(sampleUserId);

      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: {
          userId: sampleUserId,
          revokedAt: null
        },
        data: { revokedAt: expect.any(Date) }
      });
      expect(res.count).toBe(3);
    });

    it('atomically increments user tokenVersion', async () => {
      const mockUpdate = vi.fn().mockResolvedValue({ id: sampleUserId, tokenVersion: 2 });
      vi.spyOn(prisma.user, 'update').mockImplementation(mockUpdate);

      const res = await incrementTokenVersion(sampleUserId);

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: sampleUserId },
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
      expect(res.tokenVersion).toBe(2);
    });
  });

  describe('findSchoolById & findSchoolByCode', () => {
    it('queries school by id', async () => {
      const mockFindUnique = vi.fn().mockResolvedValue({ id: 'school-uuid' });
      vi.spyOn(prisma.school, 'findUnique').mockImplementation(mockFindUnique);

      await findSchoolById('school-uuid');

      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { id: 'school-uuid' },
        select: {
          id: true,
          name: true,
          code: true,
          status: true
        }
      });
    });

    it('queries school by trimmed code', async () => {
      const mockFindUnique = vi.fn().mockResolvedValue({ id: 'school-uuid', code: 'SchoolS024' });
      vi.spyOn(prisma.school, 'findUnique').mockImplementation(mockFindUnique);

      await findSchoolByCode('  SchoolS024  ');

      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { code: 'SchoolS024' },
        select: {
          id: true,
          name: true,
          code: true,
          status: true
        }
      });
    });

    it('returns null for invalid school code or id', async () => {
      expect(await findSchoolById(null)).toBeNull();
      expect(await findSchoolByCode(null)).toBeNull();
    });
  });

  describe('findStudentWithParentsByAdmissionNumber', () => {
    it('queries student by compound schoolId and admissionNumber with parent relations', async () => {
      const mockFindUnique = vi.fn().mockResolvedValue({ id: 'student-uuid' });
      vi.spyOn(prisma.student, 'findUnique').mockImplementation(mockFindUnique);

      await findStudentWithParentsByAdmissionNumber('school-uuid', '  ADM-100  ');

      expect(mockFindUnique).toHaveBeenCalledWith({
        where: {
          schoolId_admissionNumber: {
            schoolId: 'school-uuid',
            admissionNumber: 'ADM-100'
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
    });

    it('returns null for empty parameters', async () => {
      expect(await findStudentWithParentsByAdmissionNumber(null, 'ADM-100')).toBeNull();
      expect(await findStudentWithParentsByAdmissionNumber('school-uuid', null)).toBeNull();
    });
  });

  describe('PasswordResetToken operations', () => {
    const mockTokenRecord = {
      id: 'token-uuid-1',
      userId: sampleUserId,
      tokenHash: 'sha256-hashed-token-string',
      tokenType: 'RESET',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      usedAt: null,
      ipAddress: '127.0.0.1'
    };

    describe('createPasswordResetToken', () => {
      it('creates password reset token record with proper parameters', async () => {
        const mockCreate = vi.fn().mockResolvedValue(mockTokenRecord);
        vi.spyOn(prisma.passwordResetToken, 'create').mockImplementation(mockCreate);

        const result = await createPasswordResetToken({
          userId: sampleUserId,
          tokenHash: 'sha256-hashed-token-string',
          tokenType: 'RESET',
          expiresAt: mockTokenRecord.expiresAt,
          ipAddress: '127.0.0.1'
        });

        expect(mockCreate).toHaveBeenCalledWith({
          data: {
            userId: sampleUserId,
            tokenHash: 'sha256-hashed-token-string',
            tokenType: 'RESET',
            expiresAt: mockTokenRecord.expiresAt,
            ipAddress: '127.0.0.1'
          }
        });
        expect(result.id).toBe('token-uuid-1');
      });
    });

    describe('findPasswordResetTokenByHash', () => {
      it('finds token by tokenHash and includes user details', async () => {
        const mockFindUnique = vi.fn().mockResolvedValue({
          ...mockTokenRecord,
          user: { id: sampleUserId, email: sampleEmail }
        });
        vi.spyOn(prisma.passwordResetToken, 'findUnique').mockImplementation(mockFindUnique);

        const result = await findPasswordResetTokenByHash('sha256-hashed-token-string');

        expect(mockFindUnique).toHaveBeenCalledWith({
          where: { tokenHash: 'sha256-hashed-token-string' },
          include: {
            user: {
              select: expect.objectContaining({
                id: true,
                email: true,
                schoolId: true,
                tokenVersion: true
              })
            }
          }
        });
        expect(result.tokenHash).toBe('sha256-hashed-token-string');
      });

      it('returns null if tokenHash is empty', async () => {
        expect(await findPasswordResetTokenByHash(null)).toBeNull();
      });
    });

    describe('invalidateUserResetTokens', () => {
      it('updates active unused tokens to usedAt now', async () => {
        const mockUpdateMany = vi.fn().mockResolvedValue({ count: 2 });
        vi.spyOn(prisma.passwordResetToken, 'updateMany').mockImplementation(mockUpdateMany);

        const result = await invalidateUserResetTokens(sampleUserId, 'RESET');

        expect(mockUpdateMany).toHaveBeenCalledWith({
          where: {
            userId: sampleUserId,
            tokenType: 'RESET',
            usedAt: null
          },
          data: {
            usedAt: expect.any(Date)
          }
        });
        expect(result.count).toBe(2);
      });

      it('returns { count: 0 } if userId is missing', async () => {
        const result = await invalidateUserResetTokens(null);
        expect(result).toEqual({ count: 0 });
      });
    });

    describe('executePasswordResetTransaction', () => {
      it('executes atomic update of token, user password/tokenVersion, and session revocation', async () => {
        const mockTx = {
          passwordResetToken: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 })
          },
          user: {
            update: vi.fn().mockResolvedValue({ id: sampleUserId, tokenVersion: 2 })
          },
          refreshSession: {
            updateMany: vi.fn().mockResolvedValue({ count: 3 })
          }
        };

        vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => callback(mockTx));

        const result = await executePasswordResetTransaction({
          tokenId: 'token-uuid-1',
          userId: sampleUserId,
          newPasswordHash: '$argon2id$v=19$newHash'
        });

        expect(mockTx.passwordResetToken.updateMany).toHaveBeenCalledWith({
          where: {
            id: 'token-uuid-1',
            usedAt: null,
            expiresAt: { gt: expect.any(Date) }
          },
          data: {
            usedAt: expect.any(Date)
          }
        });
        expect(mockTx.user.update).toHaveBeenCalledWith({
          where: { id: sampleUserId },
          data: {
            passwordHash: '$argon2id$v=19$newHash',
            passwordAlgorithm: 'argon2id',
            tokenVersion: { increment: 1 }
          },
          select: SAFE_USER_SELECT
        });
        expect(mockTx.refreshSession.updateMany).toHaveBeenCalledWith({
          where: { userId: sampleUserId, revokedAt: null },
          data: { revokedAt: expect.any(Date) }
        });
        expect(result.user.id).toBe(sampleUserId);
      });

      it('throws error if token consumption update returns count 0 (already consumed or expired)', async () => {
        const mockTx = {
          passwordResetToken: {
            updateMany: vi.fn().mockResolvedValue({ count: 0 })
          },
          user: { update: vi.fn() },
          refreshSession: { updateMany: vi.fn() }
        };

        vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => callback(mockTx));

        await expect(
          executePasswordResetTransaction({
            tokenId: 'token-uuid-1',
            userId: sampleUserId,
            newPasswordHash: '$argon2id$newHash'
          })
        ).rejects.toThrow('TOKEN_CONCURRENCY_OR_EXPIRED');
      });
    });

    describe('executePasswordChangeTransaction', () => {
      it('executes atomic update of user password/tokenVersion and revokes all refresh sessions', async () => {
        const mockTx = {
          user: {
            update: vi.fn().mockResolvedValue({ id: sampleUserId, tokenVersion: 3 })
          },
          refreshSession: {
            updateMany: vi.fn().mockResolvedValue({ count: 2 })
          }
        };

        vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => callback(mockTx));

        const result = await executePasswordChangeTransaction({
          userId: sampleUserId,
          newPasswordHash: '$argon2id$v=19$newHash'
        });

        expect(mockTx.user.update).toHaveBeenCalledWith({
          where: { id: sampleUserId },
          data: {
            passwordHash: '$argon2id$v=19$newHash',
            passwordAlgorithm: 'argon2id',
            tokenVersion: { increment: 1 }
          },
          select: SAFE_USER_SELECT
        });
        expect(mockTx.refreshSession.updateMany).toHaveBeenCalledWith({
          where: { userId: sampleUserId, revokedAt: null },
          data: { revokedAt: expect.any(Date) }
        });
        expect(result.user.id).toBe(sampleUserId);
      });
    });

    describe('findUserForFirebaseIdentity', () => {
      it('returns user by legacyFirestoreId when UID matches', async () => {
        const mockUser = { id: sampleUserId, email: sampleEmail, legacyFirestoreId: 'fb-uid-123' };
        vi.spyOn(prisma.user, 'findFirst').mockResolvedValue(mockUser);
        vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);

        const result = await findUserForFirebaseIdentity({
          firebaseUid: 'fb-uid-123',
          email: 'other@school.edu',
          emailVerified: true
        });

        expect(prisma.user.findFirst).toHaveBeenCalledWith({
          where: { legacyFirestoreId: 'fb-uid-123' },
          select: SAFE_USER_SELECT
        });
        expect(result).toEqual({ user: mockUser, conflict: false });
      });

      it('falls back to verified email when UID does not match', async () => {
        const mockUser = { id: sampleUserId, email: sampleEmail, legacyFirestoreId: null };
        vi.spyOn(prisma.user, 'findFirst').mockResolvedValue(mockUser);

        const result = await findUserForFirebaseIdentity({
          firebaseUid: 'unmapped-uid',
          email: 'Test@School.edu',
          emailVerified: true
        });

        expect(prisma.user.findFirst).toHaveBeenCalledWith({
          where: { email: 'test@school.edu' },
          select: SAFE_USER_SELECT
        });
        expect(result).toEqual({ user: mockUser, conflict: false });
      });

      it('does not fallback to email if emailVerified is false', async () => {
        const mockFindFirst = vi.spyOn(prisma.user, 'findFirst').mockResolvedValue(null);

        const result = await findUserForFirebaseIdentity({
          firebaseUid: 'unmapped-uid',
          email: 'test@school.edu',
          emailVerified: false
        });

        expect(mockFindFirst).toHaveBeenCalledTimes(1);
        expect(result).toEqual({ user: null, conflict: false });
      });

      it('ignores synthetic parent emails in fallback matching', async () => {
        const mockFindFirst = vi.spyOn(prisma.user, 'findFirst').mockResolvedValue(null);

        const result1 = await findUserForFirebaseIdentity({
          firebaseUid: 'unmapped-uid',
          email: 'parent.123@school.sms.internal',
          emailVerified: true
        });
        expect(result1).toEqual({ user: null, conflict: false });

        const result2 = await findUserForFirebaseIdentity({
          firebaseUid: 'unmapped-uid',
          email: 'parent.456@parent.local',
          emailVerified: true
        });
        expect(result2).toEqual({ user: null, conflict: false });

        const result3 = await findUserForFirebaseIdentity({
          firebaseUid: 'unmapped-uid',
          email: 'user@parent.domain.com',
          emailVerified: true
        });
        expect(result3).toEqual({ user: null, conflict: false });

        expect(mockFindFirst).toHaveBeenCalledTimes(3);
      });


      it('detects identity conflict when UID matches User A and email matches User B', async () => {
        const userA = { id: 'user-a-uuid', email: 'userA@school.edu', legacyFirestoreId: 'fb-uid-123' };
        const userB = { id: 'user-b-uuid', email: 'userB@school.edu', legacyFirestoreId: 'fb-uid-other' };

        vi.spyOn(prisma.user, 'findFirst')
          .mockResolvedValueOnce(userA)
          .mockResolvedValueOnce(userB);

        const result = await findUserForFirebaseIdentity({
          firebaseUid: 'fb-uid-123',
          email: 'userB@school.edu',
          emailVerified: true
        });

        expect(result).toEqual({ user: null, conflict: true });
      });

      it('returns null and conflict false when no user is found and no conflict exists', async () => {
        vi.spyOn(prisma.user, 'findFirst').mockResolvedValue(null);

        const result = await findUserForFirebaseIdentity({
          firebaseUid: 'nonexistent-uid',
          email: 'unknown@school.edu',
          emailVerified: true
        });

        expect(result).toEqual({ user: null, conflict: false });
      });

      it('returns null for empty firebaseUid', async () => {
        const result = await findUserForFirebaseIdentity({ firebaseUid: null });
        expect(result).toEqual({ user: null, conflict: false });
      });
    });

    describe('findCandidateUsersByIdentifier', () => {
      it('returns empty array if identifier is empty or invalid', async () => {
        expect(await findCandidateUsersByIdentifier('')).toEqual([]);
        expect(await findCandidateUsersByIdentifier(null)).toEqual([]);
        expect(await findCandidateUsersByIdentifier(undefined)).toEqual([]);
      });

      it('finds candidate user by direct email', async () => {
        const mockUser = { id: 'user-1', email: 'teacher@school.edu' };
        vi.spyOn(prisma.user, 'findMany').mockResolvedValue([mockUser]);

        const candidates = await findCandidateUsersByIdentifier('teacher@school.edu');
        expect(prisma.user.findMany).toHaveBeenCalledWith({
          where: { email: 'teacher@school.edu' },
          select: SAFE_USER_SELECT
        });
        expect(candidates).toEqual([mockUser]);
      });

      it('finds candidate user by phone number', async () => {
        const mockUser = { id: 'user-2', email: 'parent@school.edu' };
        vi.spyOn(prisma.user, 'findMany').mockResolvedValue([mockUser]);
        vi.spyOn(basePrisma.student, 'findMany').mockResolvedValue([]);

        const candidates = await findCandidateUsersByIdentifier('9876543210');
        expect(prisma.user.findMany).toHaveBeenCalled();
        expect(candidates).toEqual([mockUser]);
      });

      it('finds candidate user by admission number via student parents link', async () => {
        const mockParentUser = { id: 'user-parent-1', email: 'parent1@school.edu' };
        vi.spyOn(prisma.user, 'findMany').mockResolvedValue([]);
        vi.spyOn(basePrisma.student, 'findMany').mockResolvedValue([
          {
            id: 'student-1',
            admissionNumber: 'ADM-1234',
            parents: [
              {
                parent: {
                  user: mockParentUser
                }
              }
            ]
          }
        ]);

        const candidates = await findCandidateUsersByIdentifier('ADM-1234');
        expect(basePrisma.student.findMany).toHaveBeenCalled();
        expect(candidates).toEqual([mockParentUser]);
      });

    });

  });
});


