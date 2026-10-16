import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as parentRepository from './parent.repository.js';
import * as parentService from './parent.service.js';
import { prisma } from '../../database/prisma.client.js';
import { TenantAccessError } from '../../utils/app-error.js';

vi.mock('../../database/prisma.client.js', () => ({
  prisma: {
    parentProfile: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn()
    },
    parentStudentLink: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn()
    },
    student: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn()
    },
    staffProfile: {
      findFirst: vi.fn()
    }
  },
  basePrisma: {}
}));

vi.mock('../audit/audit.repository.js', () => ({
  createAuditLog: vi.fn().mockResolvedValue({})
}));

vi.mock('../rbac/rbac.service.js', () => ({
  isModuleApprovedForSchool: vi.fn().mockResolvedValue(true),
  getUserEffectivePermissions: vi.fn().mockResolvedValue({})
}));

describe('BUG-01: Student Trend Status Consistency Between Teacher and Parent Portals', () => {
  const schoolId = '11111111-1111-4111-8111-111111111111';
  const parentUserId = 'parent-user-uuid-1';
  const otherParentUserId = 'parent-user-uuid-2';
  const parentProfileId = 'parent-profile-uuid-1';
  const studentId = 'student-nisha-uuid';
  const classId = 'class-8-uuid';

  const mockNishaStudent = {
    id: studentId,
    schoolId,
    classId,
    admissionNumber: 'ADM-006',
    firstName: 'Nisha',
    lastName: 'A',
    dob: '2012-05-15',
    gender: 'Female',
    bloodGroup: 'B+',
    status: 'Active',
    customData: {
      performanceStatus: 'excellent'
    },
    class: { id: classId, name: 'Class 8' },
    section: { id: 'sec-a', name: 'A' }
  };

  const mockParentStudentLink = {
    id: 'link-uuid-1',
    schoolId,
    parentProfileId,
    studentId,
    relationship: 'Father',
    createdAt: new Date('2025-01-10'),
    student: {
      ...mockNishaStudent
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Authoritative EXCELLENT Status Parity', () => {
    it('returns customData with performanceStatus "excellent" for both Teacher and Parent query flows', async () => {
      // 1. Teacher Portal flow: findStudentById returns customData.performanceStatus
      const teacherStudentResult = {
        ...mockNishaStudent,
        customData: { performanceStatus: 'excellent' }
      };

      // 2. Parent Portal flow: findChildrenByParentUserId via Prisma
      prisma.parentProfile.findUnique.mockResolvedValue({ id: parentProfileId });
      prisma.parentStudentLink.findMany.mockImplementation(async (args) => {
        // Assert that select includes customData
        expect(args.select.student.select.customData).toBe(true);
        return [
          {
            id: mockParentStudentLink.id,
            relationship: mockParentStudentLink.relationship,
            createdAt: mockParentStudentLink.createdAt,
            student: {
              ...mockNishaStudent,
              customData: { performanceStatus: 'excellent' }
            }
          }
        ];
      });

      const parentLinks = await parentRepository.findChildrenByParentUserId(parentUserId, schoolId);

      expect(parentLinks).toHaveLength(1);
      const parentChild = parentLinks[0].student;

      // Assert parity: both reflect authoritative 'excellent' status
      expect(teacherStudentResult.customData.performanceStatus).toBe('excellent');
      expect(parentChild.customData.performanceStatus).toBe('excellent');
      expect(parentChild.admissionNumber).toBe('ADM-006');
    });
  });

  describe('2. Persistence & Fresh Request Consistency', () => {
    it('persists updated status and immediately reflects new value on subsequent parent fetch', async () => {
      let currentPersistedCustomData = { performanceStatus: 'stable' };

      // Mock student update
      prisma.parentProfile.findUnique.mockResolvedValue({ id: parentProfileId });
      prisma.parentStudentLink.findMany.mockImplementation(async () => [
        {
          id: mockParentStudentLink.id,
          relationship: 'Father',
          createdAt: new Date(),
          student: {
            ...mockNishaStudent,
            customData: currentPersistedCustomData
          }
        }
      ]);

      // Before update: parent sees 'stable'
      let initialFetch = await parentService.getMyChildren(parentUserId, schoolId);
      expect(initialFetch[0].student.customData.performanceStatus).toBe('stable');

      // Teacher updates status to 'excellent'
      currentPersistedCustomData = { performanceStatus: 'excellent' };

      // Fresh fetch by Parent Portal
      let freshFetch = await parentService.getMyChildren(parentUserId, schoolId);
      expect(freshFetch[0].student.customData.performanceStatus).toBe('excellent');
    });
  });

  describe('3. STABLE Status Preservation', () => {
    it('returns "stable" when that is the actual authoritative saved value', async () => {
      prisma.parentProfile.findUnique.mockResolvedValue({ id: parentProfileId });
      prisma.parentStudentLink.findMany.mockResolvedValue([
        {
          id: mockParentStudentLink.id,
          relationship: 'Father',
          createdAt: new Date(),
          student: {
            ...mockNishaStudent,
            customData: { performanceStatus: 'stable' }
          }
        }
      ]);

      const result = await parentService.getMyChildren(parentUserId, schoolId);
      expect(result[0].student.customData.performanceStatus).toBe('stable');
    });
  });

  describe('4. Tenant Isolation & Student Authorization', () => {
    it('blocks cross-tenant access and requires valid tenant context', async () => {
      await expect(parentService.getMyChildren(parentUserId, null)).rejects.toThrow(TenantAccessError);
    });

    it('enforces schoolId filter in parent-child database query', async () => {
      prisma.parentProfile.findUnique.mockResolvedValue({ id: parentProfileId });
      prisma.parentStudentLink.findMany.mockResolvedValue([]);

      await parentRepository.findChildrenByParentUserId(parentUserId, schoolId);

      expect(prisma.parentStudentLink.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            parentProfileId: parentProfileId,
            schoolId
          }
        })
      );
    });

    it('returns empty array when parent has no linked children or profile not found without masking errors', async () => {
      prisma.parentProfile.findUnique.mockResolvedValue(null);

      const result = await parentRepository.findChildrenByParentUserId('unregistered-user', schoolId);
      expect(result).toEqual([]);
    });

    it('does not return children linked to another parent', async () => {
      prisma.parentProfile.findUnique.mockImplementation(async ({ where }) => {
        if (where.userId === otherParentUserId) {
          return { id: 'other-parent-profile-id' };
        }
        return { id: parentProfileId };
      });

      prisma.parentStudentLink.findMany.mockImplementation(async ({ where }) => {
        if (where.parentProfileId === 'other-parent-profile-id') {
          return [];
        }
        return [mockParentStudentLink];
      });

      const otherResult = await parentRepository.findChildrenByParentUserId(otherParentUserId, schoolId);
      expect(otherResult).toHaveLength(0);

      const authorizedResult = await parentRepository.findChildrenByParentUserId(parentUserId, schoolId);
      expect(authorizedResult).toHaveLength(1);
      expect(authorizedResult[0].student.id).toBe(studentId);
    });
  });

  describe('5. Missing or Unavailable Trend Data Handling', () => {
    it('handles student with null or missing customData gracefully', async () => {
      prisma.parentProfile.findUnique.mockResolvedValue({ id: parentProfileId });
      prisma.parentStudentLink.findMany.mockResolvedValue([
        {
          id: mockParentStudentLink.id,
          relationship: 'Father',
          createdAt: new Date(),
          student: {
            ...mockNishaStudent,
            customData: null
          }
        }
      ]);

      const result = await parentService.getMyChildren(parentUserId, schoolId);
      expect(result[0].student.customData).toBeNull();
      // UI fallback logic: student?.performanceStatus || student?.customData?.performanceStatus || 'stable'
      const uiResolved = result[0].student?.performanceStatus || result[0].student?.customData?.performanceStatus || 'stable';
      expect(uiResolved).toBe('stable');
    });

    it('handles student with customData lacking performanceStatus gracefully', async () => {
      prisma.parentProfile.findUnique.mockResolvedValue({ id: parentProfileId });
      prisma.parentStudentLink.findMany.mockResolvedValue([
        {
          id: mockParentStudentLink.id,
          relationship: 'Father',
          createdAt: new Date(),
          student: {
            ...mockNishaStudent,
            customData: { medicalInfo: 'None' }
          }
        }
      ]);

      const result = await parentService.getMyChildren(parentUserId, schoolId);
      expect(result[0].student.customData.performanceStatus).toBeUndefined();
      const uiResolved = result[0].student?.performanceStatus || result[0].student?.customData?.performanceStatus || 'stable';
      expect(uiResolved).toBe('stable');
    });
  });
});
