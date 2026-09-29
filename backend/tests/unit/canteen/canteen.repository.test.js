import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as canteenRepository from '../../../src/modules/canteen/canteen.repository.js';
import { prisma } from '../../../src/database/prisma.client.js';

describe('Canteen Repository Unit Tests', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const PARENT_USER_ID = '22222222-2222-4222-8222-222222222222';
  const PARENT_PROFILE_ID = '33333333-3333-4333-8333-333333333333';
  const STUDENT_ID = '44444444-4444-4444-8444-444444444444';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('findAuthorizedStudentIdsForParent', () => {
    it('returns student IDs linked to active parent profile', async () => {
      const mockTx = {
        parentProfile: {
          findFirst: vi.fn().mockResolvedValue({
            id: PARENT_PROFILE_ID,
            user: { isActive: true }
          })
        },
        parentStudentLink: {
          findMany: vi.fn().mockResolvedValue([
            { studentId: STUDENT_ID }
          ])
        }
      };

      const result = await canteenRepository.findAuthorizedStudentIdsForParent(SCHOOL_ID, PARENT_USER_ID, mockTx);

      expect(mockTx.parentProfile.findFirst).toHaveBeenCalledWith({
        where: {
          userId: PARENT_USER_ID,
          schoolId: SCHOOL_ID
        },
        select: {
          id: true,
          user: {
            select: {
              isActive: true
            }
          }
        }
      });
      expect(mockTx.parentStudentLink.findMany).toHaveBeenCalledWith({
        where: {
          parentProfileId: PARENT_PROFILE_ID,
          schoolId: SCHOOL_ID
        },
        select: { studentId: true }
      });
      expect(result).toEqual([STUDENT_ID]);
    });

    it('returns empty array if parent profile not found', async () => {
      const mockTx = {
        parentProfile: {
          findFirst: vi.fn().mockResolvedValue(null)
        },
        parentStudentLink: {
          findMany: vi.fn()
        }
      };

      const result = await canteenRepository.findAuthorizedStudentIdsForParent(SCHOOL_ID, PARENT_USER_ID, mockTx);

      expect(result).toEqual([]);
      expect(mockTx.parentStudentLink.findMany).not.toHaveBeenCalled();
    });

    it('returns empty array if user is deactivated', async () => {
      const mockTx = {
        parentProfile: {
          findFirst: vi.fn().mockResolvedValue({
            id: PARENT_PROFILE_ID,
            user: { isActive: false }
          })
        },
        parentStudentLink: {
          findMany: vi.fn()
        }
      };

      const result = await canteenRepository.findAuthorizedStudentIdsForParent(SCHOOL_ID, PARENT_USER_ID, mockTx);

      expect(result).toEqual([]);
      expect(mockTx.parentStudentLink.findMany).not.toHaveBeenCalled();
    });
  });
});
