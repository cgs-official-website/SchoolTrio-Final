import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as lessonPlanService from '../../../src/modules/lesson-plans/lesson-plan.service.js';
import * as lessonPlanRepository from '../../../src/modules/lesson-plans/lesson-plan.repository.js';
import * as auditRepository from '../../../src/modules/audit/audit.repository.js';
import { calculateWeekNumber } from '../../../src/modules/lesson-plans/lesson-plan.schemas.js';
import { prisma } from '../../../src/database/prisma.client.js';
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  TenantAccessError
} from '../../../src/utils/app-error.js';

describe('Lesson Plan Service Unit & Security Tests', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const PLAN_ID = '22222222-2222-4222-8222-222222222222';
  const TEACHER_STAFF_ID = '33333333-3333-4333-8333-333333333333';
  const OTHER_TEACHER_STAFF_ID = '33333333-3333-4333-8333-999999999999';
  const CLASS_ID = '44444444-4444-4444-8444-444444444444';
  const SUBJECT_ID = '55555555-5555-5555-8555-555555555555';
  const USER_ID = '66666666-6666-4666-8666-666666666666';

  const ADMIN_ACTOR = {
    id: USER_ID,
    email: 'admin@school.com',
    systemRole: 'SCHOOL_ADMIN'
  };

  const TEACHER_ACTOR = {
    id: USER_ID,
    email: 'teacher@school.com',
    systemRole: 'TEACHER'
  };

  const STAFFS_ACTOR = {
    id: USER_ID,
    email: 'staff@school.com',
    systemRole: 'STAFF',
    roles: ['staffs']
  };

  const MOCK_TEACHER_PROFILE = {
    id: TEACHER_STAFF_ID,
    schoolId: SCHOOL_ID,
    userId: USER_ID,
    name: 'Jane Doe',
    status: 'Active',
    user: { id: USER_ID, email: 'teacher@school.com', isActive: true }
  };

  const MOCK_CLASS = {
    id: CLASS_ID,
    schoolId: SCHOOL_ID,
    name: 'Grade 10-A'
  };

  const MOCK_SUBJECT = {
    id: SUBJECT_ID,
    schoolId: SCHOOL_ID,
    name: 'Mathematics',
    code: 'MATH101'
  };

  const MOCK_PLAN = {
    id: PLAN_ID,
    schoolId: SCHOOL_ID,
    teacherId: TEACHER_STAFF_ID,
    classId: CLASS_ID,
    subjectId: SUBJECT_ID,
    weekNumber: 38,
    status: 'Draft',
    topics: 'Algebra Foundations',
    objectives: 'Solve quadratic equations',
    customData: { date: '2026-09-16' },
    createdAt: new Date('2026-09-16T10:00:00Z'),
    updatedAt: new Date('2026-09-16T10:00:00Z'),
    teacher: { id: TEACHER_STAFF_ID, name: 'Jane Doe', email: 'teacher@school.com', userId: USER_ID },
    class: { id: CLASS_ID, name: 'Grade 10-A' },
    subject: { id: SUBJECT_ID, name: 'Mathematics', code: 'MATH101' }
  };

  const mockTx = {
    $queryRaw: vi.fn(),
    lessonPlan: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    },
    staffProfile: { findFirst: vi.fn() },
    class: { findFirst: vi.fn() },
    subject: { findFirst: vi.fn() }
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(auditRepository, 'createAuditLog').mockResolvedValue({ id: 'audit-1' });
    vi.spyOn(prisma, '$transaction').mockImplementation(async cb => cb(mockTx));
  });

  describe('isLessonPlanAdmin & role helpers', () => {
    it('recognizes administrative roles', () => {
      expect(lessonPlanService.isLessonPlanAdmin({ systemRole: 'SUPER_ADMIN' })).toBe(true);
      expect(lessonPlanService.isLessonPlanAdmin({ systemRole: 'SCHOOL_ADMIN' })).toBe(true);
      expect(lessonPlanService.isLessonPlanAdmin({ roles: ['principal'] })).toBe(true);
      expect(lessonPlanService.isLessonPlanAdmin({ roles: ['correspondent'] })).toBe(true);
      expect(lessonPlanService.isLessonPlanAdmin({ roles: ['administrative-officer'] })).toBe(true);
      expect(lessonPlanService.isLessonPlanAdmin({ roles: ['vice_principal'] })).toBe(true);
    });

    it('denies administrative privileges to operational roles', () => {
      expect(lessonPlanService.isLessonPlanAdmin({ systemRole: 'TEACHER' })).toBe(false);
      expect(lessonPlanService.isLessonPlanAdmin({ roles: ['subject-wise-head'] })).toBe(false);
      expect(lessonPlanService.isLessonPlanAdmin({ roles: ['class-incharge'] })).toBe(false);
      expect(lessonPlanService.isLessonPlanAdmin({ roles: ['staffs'] })).toBe(false);
    });
  });

  describe('createLessonPlan', () => {
    it('throws TenantAccessError when schoolId is missing', async () => {
      await expect(lessonPlanService.createLessonPlan(null, TEACHER_ACTOR, {}))
        .rejects.toThrow(TenantAccessError);
    });

    it('creates a lesson plan for an operational teacher binding their StaffProfile ID', async () => {
      vi.spyOn(lessonPlanRepository, 'findStaffProfileByUserId').mockResolvedValue(MOCK_TEACHER_PROFILE);
      vi.spyOn(lessonPlanRepository, 'findClassById').mockResolvedValue(MOCK_CLASS);
      vi.spyOn(lessonPlanRepository, 'findSubjectById').mockResolvedValue(MOCK_SUBJECT);
      const createSpy = vi.spyOn(lessonPlanRepository, 'createLessonPlan').mockResolvedValue(MOCK_PLAN);

      const payload = {
        classId: CLASS_ID,
        subjectId: SUBJECT_ID,
        topic: 'Algebra Foundations',
        date: '2026-09-16',
        objectives: 'Solve quadratic equations',
        status: 'draft',
        teacherId: OTHER_TEACHER_STAFF_ID // Spoofed ID should be ignored for operational teacher
      };

      const result = await lessonPlanService.createLessonPlan(SCHOOL_ID, TEACHER_ACTOR, payload);

      expect(createSpy).toHaveBeenCalledWith(SCHOOL_ID, {
        teacherId: TEACHER_STAFF_ID, // Bound to authenticated teacher profile
        classId: CLASS_ID,
        subjectId: SUBJECT_ID,
        weekNumber: 38,
        status: 'draft',
        topic: 'Algebra Foundations',
        objectives: 'Solve quadratic equations',
        customData: { date: '2026-09-16' }
      });

      expect(result.id).toBe(PLAN_ID);
      expect(result.teacherId).toBe(TEACHER_STAFF_ID);
      expect(result.teacherName).toBe('Jane Doe');
      expect(result.className).toBe('Grade 10-A');
      expect(result.subjectName).toBe('Mathematics');
      expect(result.date).toBe('2026-09-16');
      expect(result.status).toBe('draft');
    });

    it('rejects creation if operational user has no active StaffProfile', async () => {
      vi.spyOn(lessonPlanRepository, 'findStaffProfileByUserId').mockResolvedValue(null);

      await expect(
        lessonPlanService.createLessonPlan(SCHOOL_ID, TEACHER_ACTOR, {
          classId: CLASS_ID,
          subjectId: SUBJECT_ID,
          topic: 'Topic',
          date: '2026-09-16'
        })
      ).rejects.toThrow(ForbiddenError);
    });

    it('allows admin to specify target teacherId and validates it exists in tenant', async () => {
      vi.spyOn(lessonPlanRepository, 'findStaffProfileById').mockResolvedValue(MOCK_TEACHER_PROFILE);
      vi.spyOn(lessonPlanRepository, 'findClassById').mockResolvedValue(MOCK_CLASS);
      vi.spyOn(lessonPlanRepository, 'findSubjectById').mockResolvedValue(MOCK_SUBJECT);
      const createSpy = vi.spyOn(lessonPlanRepository, 'createLessonPlan').mockResolvedValue(MOCK_PLAN);

      const payload = {
        classId: CLASS_ID,
        subjectId: SUBJECT_ID,
        topic: 'Algebra Foundations',
        date: '2026-09-16',
        teacherId: TEACHER_STAFF_ID
      };

      const result = await lessonPlanService.createLessonPlan(SCHOOL_ID, ADMIN_ACTOR, payload);
      expect(createSpy).toHaveBeenCalled();
      expect(result.teacherId).toBe(TEACHER_STAFF_ID);
    });

    it('derives weekNumber exclusively from date on create, ignoring any client weekNumber override', async () => {
      vi.spyOn(lessonPlanRepository, 'findStaffProfileByUserId').mockResolvedValue(MOCK_TEACHER_PROFILE);
      vi.spyOn(lessonPlanRepository, 'findClassById').mockResolvedValue(MOCK_CLASS);
      vi.spyOn(lessonPlanRepository, 'findSubjectById').mockResolvedValue(MOCK_SUBJECT);
      const createSpy = vi.spyOn(lessonPlanRepository, 'createLessonPlan').mockResolvedValue(MOCK_PLAN);

      const payload = {
        classId: CLASS_ID,
        subjectId: SUBJECT_ID,
        topic: 'Algebra Foundations',
        date: '2026-09-16', // Week 38
        weekNumber: 99 // Malicious override attempt
      };

      await lessonPlanService.createLessonPlan(SCHOOL_ID, TEACHER_ACTOR, payload);

      expect(createSpy).toHaveBeenCalledWith(
        SCHOOL_ID,
        expect.objectContaining({
          weekNumber: 38 // Computed from 2026-09-16, malicious 99 ignored
        })
      );
    });

    it('defaults teacherId to admin StaffProfile when admin has a linked profile and omits teacherId', async () => {
      vi.spyOn(lessonPlanRepository, 'findStaffProfileByUserId').mockResolvedValue(MOCK_TEACHER_PROFILE);
      vi.spyOn(lessonPlanRepository, 'findClassById').mockResolvedValue(MOCK_CLASS);
      vi.spyOn(lessonPlanRepository, 'findSubjectById').mockResolvedValue(MOCK_SUBJECT);
      const createSpy = vi.spyOn(lessonPlanRepository, 'createLessonPlan').mockResolvedValue(MOCK_PLAN);

      const payload = {
        classId: CLASS_ID,
        subjectId: SUBJECT_ID,
        topic: 'Algebra Foundations',
        date: '2026-09-16'
      };

      const result = await lessonPlanService.createLessonPlan(SCHOOL_ID, ADMIN_ACTOR, payload);

      expect(createSpy).toHaveBeenCalledWith(
        SCHOOL_ID,
        expect.objectContaining({
          teacherId: TEACHER_STAFF_ID
        })
      );
      expect(result.teacherId).toBe(TEACHER_STAFF_ID);
    });

    it('rejects admin creation if target teacherId does not exist in tenant', async () => {
      vi.spyOn(lessonPlanRepository, 'findStaffProfileById').mockResolvedValue(null);

      await expect(
        lessonPlanService.createLessonPlan(SCHOOL_ID, ADMIN_ACTOR, {
          classId: CLASS_ID,
          subjectId: SUBJECT_ID,
          topic: 'Topic',
          date: '2026-09-16',
          teacherId: 'non-existent-profile'
        })
      ).rejects.toThrow(NotFoundError);
    });

    it('rejects admin creation if teacherId is omitted and admin has no StaffProfile', async () => {
      vi.spyOn(lessonPlanRepository, 'findStaffProfileByUserId').mockResolvedValue(null);

      await expect(
        lessonPlanService.createLessonPlan(SCHOOL_ID, ADMIN_ACTOR, {
          classId: CLASS_ID,
          subjectId: SUBJECT_ID,
          topic: 'Topic',
          date: '2026-09-16'
        })
      ).rejects.toThrow(ValidationError);
    });

    it('rejects creation if class does not belong to school', async () => {
      vi.spyOn(lessonPlanRepository, 'findStaffProfileByUserId').mockResolvedValue(MOCK_TEACHER_PROFILE);
      vi.spyOn(lessonPlanRepository, 'findClassById').mockResolvedValue(null);

      await expect(
        lessonPlanService.createLessonPlan(SCHOOL_ID, TEACHER_ACTOR, {
          classId: CLASS_ID,
          subjectId: SUBJECT_ID,
          topic: 'Topic',
          date: '2026-09-16'
        })
      ).rejects.toThrow(NotFoundError);
    });

    it('rejects creation if subject does not belong to school', async () => {
      vi.spyOn(lessonPlanRepository, 'findStaffProfileByUserId').mockResolvedValue(MOCK_TEACHER_PROFILE);
      vi.spyOn(lessonPlanRepository, 'findClassById').mockResolvedValue(MOCK_CLASS);
      vi.spyOn(lessonPlanRepository, 'findSubjectById').mockResolvedValue(null);

      await expect(
        lessonPlanService.createLessonPlan(SCHOOL_ID, TEACHER_ACTOR, {
          classId: CLASS_ID,
          subjectId: SUBJECT_ID,
          topic: 'Topic',
          date: '2026-09-16'
        })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('listLessonPlans', () => {
    it('forces teacherId to authenticated user staffProfile for operational users', async () => {
      vi.spyOn(lessonPlanRepository, 'findStaffProfileByUserId').mockResolvedValue(MOCK_TEACHER_PROFILE);
      const repoSpy = vi.spyOn(lessonPlanRepository, 'findLessonPlans').mockResolvedValue({
        data: [MOCK_PLAN],
        total: 1
      });

      const result = await lessonPlanService.listLessonPlans(SCHOOL_ID, TEACHER_ACTOR, {
        teacherId: OTHER_TEACHER_STAFF_ID // Should be overridden
      });

      expect(repoSpy).toHaveBeenCalledWith(
        SCHOOL_ID,
        expect.objectContaining({
          teacherId: TEACHER_STAFF_ID,
          page: 1,
          limit: 20
        })
      );
      expect(result.data).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
    });

    it('allows administrators to list tenant-wide plans or filter by teacherId', async () => {
      const repoSpy = vi.spyOn(lessonPlanRepository, 'findLessonPlans').mockResolvedValue({
        data: [MOCK_PLAN],
        total: 1
      });

      await lessonPlanService.listLessonPlans(SCHOOL_ID, ADMIN_ACTOR, {});
      expect(repoSpy).toHaveBeenCalledWith(
        SCHOOL_ID,
        expect.objectContaining({
          page: 1,
          limit: 20
        })
      );

      await lessonPlanService.listLessonPlans(SCHOOL_ID, ADMIN_ACTOR, { teacherId: TEACHER_STAFF_ID });
      expect(repoSpy).toHaveBeenCalledWith(
        SCHOOL_ID,
        expect.objectContaining({
          teacherId: TEACHER_STAFF_ID
        })
      );
    });
  });

  describe('getLessonPlanById', () => {
    it('allows operational teacher to view own plan', async () => {
      vi.spyOn(lessonPlanRepository, 'findLessonPlanById').mockResolvedValue(MOCK_PLAN);
      vi.spyOn(lessonPlanRepository, 'findStaffProfileByUserId').mockResolvedValue(MOCK_TEACHER_PROFILE);

      const result = await lessonPlanService.getLessonPlanById(SCHOOL_ID, TEACHER_ACTOR, PLAN_ID);
      expect(result.id).toBe(PLAN_ID);
    });

    it('blocks operational teacher from viewing another teacher plan', async () => {
      vi.spyOn(lessonPlanRepository, 'findLessonPlanById').mockResolvedValue({
        ...MOCK_PLAN,
        teacherId: OTHER_TEACHER_STAFF_ID
      });
      vi.spyOn(lessonPlanRepository, 'findStaffProfileByUserId').mockResolvedValue(MOCK_TEACHER_PROFILE);

      await expect(
        lessonPlanService.getLessonPlanById(SCHOOL_ID, TEACHER_ACTOR, PLAN_ID)
      ).rejects.toThrow(ForbiddenError);
    });

    it('allows administrator to view any plan in tenant', async () => {
      vi.spyOn(lessonPlanRepository, 'findLessonPlanById').mockResolvedValue({
        ...MOCK_PLAN,
        teacherId: OTHER_TEACHER_STAFF_ID
      });

      const result = await lessonPlanService.getLessonPlanById(SCHOOL_ID, ADMIN_ACTOR, PLAN_ID);
      expect(result.id).toBe(PLAN_ID);
    });

    it('throws NotFoundError if plan is not found in school', async () => {
      vi.spyOn(lessonPlanRepository, 'findLessonPlanById').mockResolvedValue(null);

      await expect(
        lessonPlanService.getLessonPlanById(SCHOOL_ID, ADMIN_ACTOR, PLAN_ID)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('updateLessonPlan', () => {
    it('allows teacher to update own plan and merges customData with new date and weekNumber', async () => {
      vi.spyOn(lessonPlanRepository, 'findStaffProfileByUserId').mockResolvedValue(MOCK_TEACHER_PROFILE);
      vi.spyOn(lessonPlanRepository, 'findLessonPlanByIdForUpdate').mockResolvedValue(MOCK_PLAN);
      const updateSpy = vi.spyOn(lessonPlanRepository, 'updateLessonPlan').mockResolvedValue({
        ...MOCK_PLAN,
        topics: 'Updated Topic',
        weekNumber: 39,
        customData: { date: '2026-09-23' }
      });

      const result = await lessonPlanService.updateLessonPlan(SCHOOL_ID, TEACHER_ACTOR, PLAN_ID, {
        topic: 'Updated Topic',
        date: '2026-09-23'
      });

      expect(updateSpy).toHaveBeenCalledWith(
        SCHOOL_ID,
        PLAN_ID,
        expect.objectContaining({
          topic: 'Updated Topic',
          weekNumber: 39,
          customData: { date: '2026-09-23' }
        }),
        mockTx
      );
      expect(result.topic).toBe('Updated Topic');
      expect(result.date).toBe('2026-09-23');
    });

    it('blocks teacher from updating another teacher plan', async () => {
      vi.spyOn(lessonPlanRepository, 'findStaffProfileByUserId').mockResolvedValue(MOCK_TEACHER_PROFILE);
      vi.spyOn(lessonPlanRepository, 'findLessonPlanByIdForUpdate').mockResolvedValue({
        ...MOCK_PLAN,
        teacherId: OTHER_TEACHER_STAFF_ID
      });

      await expect(
        lessonPlanService.updateLessonPlan(SCHOOL_ID, TEACHER_ACTOR, PLAN_ID, { topic: 'New Topic' })
      ).rejects.toThrow(ForbiddenError);
    });

    it('blocks operational teacher from changing teacherId', async () => {
      vi.spyOn(lessonPlanRepository, 'findStaffProfileByUserId').mockResolvedValue(MOCK_TEACHER_PROFILE);
      vi.spyOn(lessonPlanRepository, 'findLessonPlanByIdForUpdate').mockResolvedValue(MOCK_PLAN);

      await expect(
        lessonPlanService.updateLessonPlan(SCHOOL_ID, TEACHER_ACTOR, PLAN_ID, {
          teacherId: OTHER_TEACHER_STAFF_ID
        })
      ).rejects.toThrow(ForbiddenError);
    });

    it('merges customData on date update while preserving unrelated existing customData fields', async () => {
      const planWithLegacyData = {
        ...MOCK_PLAN,
        customData: {
          date: '2026-09-16',
          someLegacyField: 'preserve-me',
          nestedConfig: { active: true }
        }
      };

      vi.spyOn(lessonPlanRepository, 'findStaffProfileByUserId').mockResolvedValue(MOCK_TEACHER_PROFILE);
      vi.spyOn(lessonPlanRepository, 'findLessonPlanByIdForUpdate').mockResolvedValue(planWithLegacyData);
      const updateSpy = vi.spyOn(lessonPlanRepository, 'updateLessonPlan').mockResolvedValue({
        ...planWithLegacyData,
        customData: {
          date: '2026-10-01',
          someLegacyField: 'preserve-me',
          nestedConfig: { active: true }
        }
      });

      await lessonPlanService.updateLessonPlan(SCHOOL_ID, TEACHER_ACTOR, PLAN_ID, {
        date: '2026-10-01'
      });

      expect(updateSpy).toHaveBeenCalledWith(
        SCHOOL_ID,
        PLAN_ID,
        expect.objectContaining({
          customData: {
            date: '2026-10-01',
            someLegacyField: 'preserve-me',
            nestedConfig: { active: true }
          },
          weekNumber: calculateWeekNumber('2026-10-01')
        }),
        mockTx
      );
    });

    it('ignores client weekNumber when updating without date', async () => {
      vi.spyOn(lessonPlanRepository, 'findStaffProfileByUserId').mockResolvedValue(MOCK_TEACHER_PROFILE);
      vi.spyOn(lessonPlanRepository, 'findLessonPlanByIdForUpdate').mockResolvedValue(MOCK_PLAN);
      const updateSpy = vi.spyOn(lessonPlanRepository, 'updateLessonPlan').mockResolvedValue({
        ...MOCK_PLAN,
        topics: 'Topic Only'
      });

      await lessonPlanService.updateLessonPlan(SCHOOL_ID, TEACHER_ACTOR, PLAN_ID, {
        topic: 'Topic Only',
        weekNumber: 99 // Malicious override attempt
      });

      expect(updateSpy).toHaveBeenCalledWith(
        SCHOOL_ID,
        PLAN_ID,
        expect.not.objectContaining({
          weekNumber: 99
        }),
        mockTx
      );
    });

    it('allows transitions between draft, ready, completed and normalizes status in DTO', async () => {
      vi.spyOn(lessonPlanRepository, 'findStaffProfileByUserId').mockResolvedValue(MOCK_TEACHER_PROFILE);
      vi.spyOn(lessonPlanRepository, 'findLessonPlanByIdForUpdate').mockResolvedValue({
        ...MOCK_PLAN,
        status: 'Completed'
      });
      vi.spyOn(lessonPlanRepository, 'updateLessonPlan').mockResolvedValue({
        ...MOCK_PLAN,
        status: 'draft'
      });

      const result = await lessonPlanService.updateLessonPlan(SCHOOL_ID, TEACHER_ACTOR, PLAN_ID, {
        status: 'draft'
      });

      expect(result.status).toBe('draft');
    });

    it('allows admin to reassign teacherId when target profile exists in school', async () => {
      vi.spyOn(lessonPlanRepository, 'findLessonPlanByIdForUpdate').mockResolvedValue(MOCK_PLAN);
      vi.spyOn(lessonPlanRepository, 'findStaffProfileById').mockResolvedValue({
        id: OTHER_TEACHER_STAFF_ID,
        schoolId: SCHOOL_ID,
        name: 'John Smith'
      });
      const updateSpy = vi.spyOn(lessonPlanRepository, 'updateLessonPlan').mockResolvedValue({
        ...MOCK_PLAN,
        teacherId: OTHER_TEACHER_STAFF_ID
      });

      const result = await lessonPlanService.updateLessonPlan(SCHOOL_ID, ADMIN_ACTOR, PLAN_ID, {
        teacherId: OTHER_TEACHER_STAFF_ID
      });

      expect(updateSpy).toHaveBeenCalledWith(
        SCHOOL_ID,
        PLAN_ID,
        expect.objectContaining({
          teacherId: OTHER_TEACHER_STAFF_ID
        }),
        mockTx
      );
      expect(result.teacherId).toBe(OTHER_TEACHER_STAFF_ID);
    });
  });

  describe('deleteLessonPlan', () => {
    it('allows teacher to delete own plan', async () => {
      vi.spyOn(lessonPlanRepository, 'findStaffProfileByUserId').mockResolvedValue(MOCK_TEACHER_PROFILE);
      vi.spyOn(lessonPlanRepository, 'findLessonPlanByIdForUpdate').mockResolvedValue(MOCK_PLAN);
      const deleteSpy = vi.spyOn(lessonPlanRepository, 'deleteLessonPlan').mockResolvedValue(MOCK_PLAN);

      const result = await lessonPlanService.deleteLessonPlan(SCHOOL_ID, TEACHER_ACTOR, PLAN_ID);
      expect(deleteSpy).toHaveBeenCalledWith(SCHOOL_ID, PLAN_ID, mockTx);
      expect(result.success).toBe(true);
    });

    it('blocks teacher from deleting another teacher plan', async () => {
      vi.spyOn(lessonPlanRepository, 'findStaffProfileByUserId').mockResolvedValue(MOCK_TEACHER_PROFILE);
      vi.spyOn(lessonPlanRepository, 'findLessonPlanByIdForUpdate').mockResolvedValue({
        ...MOCK_PLAN,
        teacherId: OTHER_TEACHER_STAFF_ID
      });

      await expect(
        lessonPlanService.deleteLessonPlan(SCHOOL_ID, TEACHER_ACTOR, PLAN_ID)
      ).rejects.toThrow(ForbiddenError);
    });

    it('allows admin to delete any plan in tenant', async () => {
      vi.spyOn(lessonPlanRepository, 'findLessonPlanByIdForUpdate').mockResolvedValue({
        ...MOCK_PLAN,
        teacherId: OTHER_TEACHER_STAFF_ID
      });
      const deleteSpy = vi.spyOn(lessonPlanRepository, 'deleteLessonPlan').mockResolvedValue(MOCK_PLAN);

      const result = await lessonPlanService.deleteLessonPlan(SCHOOL_ID, ADMIN_ACTOR, PLAN_ID);
      expect(deleteSpy).toHaveBeenCalledWith(SCHOOL_ID, PLAN_ID, mockTx);
      expect(result.success).toBe(true);
    });
  });
});
