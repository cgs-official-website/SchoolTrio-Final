import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateStudentPerformanceStatusSchema, PERFORMANCE_STATUSES } from './student.schemas.js';
import * as studentService from './student.service.js';
import * as studentRepository from './student.repository.js';
import { requirePermission } from '../../middleware/rbac.middleware.js';
import { prisma } from '../../database/prisma.client.js';
import { SYSTEM_ROLES, ERROR_CODES } from '../../config/constants.js';
import { ForbiddenError, NotFoundError, TenantAccessError } from '../../utils/app-error.js';

vi.mock('./student.repository.js');
vi.mock('../../database/prisma.client.js', () => ({
  prisma: {
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

describe('BUG-PERF-004: Student Performance Trend Status Update (Backend Tests)', () => {
  const schoolId = '11111111-1111-4111-8111-111111111111';
  const otherSchoolId = '99999999-9999-4999-8999-999999999999';
  const classId = '22222222-2222-4222-8222-222222222222';
  const otherClassId = '33333333-3333-4333-8333-333333333333';
  const studentId = '44444444-4444-4444-8444-444444444444';
  const teacherUserId = '55555555-5555-4555-8555-555555555555';

  const teacherActor = {
    id: teacherUserId,
    userId: teacherUserId,
    systemRole: SYSTEM_ROLES.TEACHER,
    role: 'TEACHER'
  };

  const adminActor = {
    id: 'admin-user-uuid',
    userId: 'admin-user-uuid',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    role: 'SCHOOL_ADMIN'
  };

  const mockTeacherStaffProfile = {
    id: 'staff-profile-uuid',
    userId: teacherUserId,
    schoolId,
    assignedClassId: classId,
    customData: {
      assignments: {
        assignedClassId: classId
      }
    },
    headedClasses: [{ id: classId }]
  };

  const mockStudent = {
    id: studentId,
    schoolId,
    classId,
    admissionNumber: 'STU-001',
    firstName: 'Alice',
    lastName: 'Smith',
    status: 'Active',
    customData: {
      medicalInfo: 'Peanut allergy',
      performanceStatus: 'stable'
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================
  // 1. VALIDATION SCHEMA TESTS
  // ============================================================
  describe('Schema Validation (updateStudentPerformanceStatusSchema)', () => {
    it('accepts valid params and status "improving"', () => {
      const parsed = updateStudentPerformanceStatusSchema.body.safeParse({ status: 'improving' });
      expect(parsed.success).toBe(true);
      expect(parsed.data.status).toBe('improving');
    });

    it('accepts valid params and status "excellent"', () => {
      const parsed = updateStudentPerformanceStatusSchema.body.safeParse({ status: 'excellent' });
      expect(parsed.success).toBe(true);
      expect(parsed.data.status).toBe('excellent');
    });

    it('accepts valid params and status "stable"', () => {
      const parsed = updateStudentPerformanceStatusSchema.body.safeParse({ status: 'stable' });
      expect(parsed.success).toBe(true);
      expect(parsed.data.status).toBe('stable');
    });

    it('accepts valid params and existing values "warning" and "critical"', () => {
      for (const val of ['warning', 'critical']) {
        const parsed = updateStudentPerformanceStatusSchema.body.safeParse({ status: val });
        expect(parsed.success).toBe(true);
        expect(parsed.data.status).toBe(val);
      }
    });

    it('rejects an invalid status with standard validation error', () => {
      const parsed = updateStudentPerformanceStatusSchema.body.safeParse({ status: 'superior' });
      expect(parsed.success).toBe(false);
      expect(parsed.error.issues[0].message).toContain('Status must be one of:');
    });

    it('rejects missing status payload', () => {
      const parsed = updateStudentPerformanceStatusSchema.body.safeParse({});
      expect(parsed.success).toBe(false);
    });

    it('rejects arbitrary extraneous fields due to strict schema', () => {
      const parsed = updateStudentPerformanceStatusSchema.body.safeParse({
        status: 'improving',
        firstName: 'MaliciousName',
        admissionNumber: '999'
      });
      expect(parsed.success).toBe(false);
    });

    it('validates student ID parameter format as UUID', () => {
      const validParams = updateStudentPerformanceStatusSchema.params.safeParse({ id: studentId });
      expect(validParams.success).toBe(true);

      const invalidParams = updateStudentPerformanceStatusSchema.params.safeParse({ id: 'not-a-uuid' });
      expect(invalidParams.success).toBe(false);
      expect(invalidParams.error.issues[0].message).toContain('Invalid student ID format');
    });
  });

  // ============================================================
  // 2. RBAC AUTHORIZATION TESTS
  // ============================================================
  describe('RBAC Middleware Authorization', () => {
    it('grants a teacher access to "performance: edit" via DEFAULT_TEACHER_MODULES fallback', async () => {
      const middleware = requirePermission('performance', 'edit');
      const req = {
        auth: teacherActor,
        user: teacherActor,
        tenant: { schoolId },
        body: {},
        query: {},
        params: {}
      };
      let nextCalled = false;
      let nextError = null;

      await middleware(req, {}, (err) => {
        nextCalled = true;
        nextError = err;
      });

      expect(nextCalled).toBe(true);
      expect(nextError).toBeUndefined();
    });

    it('denies a teacher access to general "students: edit" with 403 Forbidden', async () => {
      const middleware = requirePermission('students', 'edit');
      const req = {
        auth: teacherActor,
        user: teacherActor,
        tenant: { schoolId },
        body: {},
        query: {},
        params: {}
      };
      let nextError = null;

      try {
        await middleware(req, {}, (err) => {
          nextError = err;
        });
      } catch (err) {
        nextError = err;
      }

      expect(nextError).toBeInstanceOf(ForbiddenError);
      expect(nextError.message).toContain("missing 'edit' permission for module 'students'");
    });

    it('denies a user without teacher or admin role on "performance: edit" with 403', async () => {
      const parentActor = {
        id: 'parent-user-uuid',
        userId: 'parent-user-uuid',
        systemRole: SYSTEM_ROLES.PARENT,
        role: 'PARENT'
      };

      const middleware = requirePermission('performance', 'edit');
      const req = {
        auth: parentActor,
        user: parentActor,
        tenant: { schoolId },
        body: {},
        query: {},
        params: {}
      };
      let nextError = null;

      try {
        await middleware(req, {}, (err) => {
          nextError = err;
        });
      } catch (err) {
        nextError = err;
      }

      expect(nextError).toBeInstanceOf(ForbiddenError);
      expect(nextError.message).toContain("missing 'edit' permission for module 'performance'");
    });
  });

  // ============================================================
  // 3. SERVICE LOGIC & CLASS-SCOPING TESTS
  // ============================================================
  describe('Service Layer (updateStudentPerformanceStatus)', () => {
    it('1. updates status to "improving" for authorized teacher', async () => {
      studentRepository.findStudentById.mockResolvedValue({ ...mockStudent });
      prisma.staffProfile.findFirst.mockResolvedValue(mockTeacherStaffProfile);
      studentRepository.updateStudent.mockImplementation(async (sId, stId, payload) => ({
        ...mockStudent,
        customData: payload.customData
      }));

      const res = await studentService.updateStudentPerformanceStatus(
        schoolId,
        studentId,
        'improving',
        teacherActor
      );

      expect(res.customData.performanceStatus).toBe('improving');
      expect(studentRepository.updateStudent).toHaveBeenCalledWith(
        schoolId,
        studentId,
        expect.objectContaining({
          customData: expect.objectContaining({
            performanceStatus: 'improving',
            medicalInfo: 'Peanut allergy'
          })
        })
      );
    });

    it('2. updates status to "excellent" for authorized teacher', async () => {
      studentRepository.findStudentById.mockResolvedValue({ ...mockStudent });
      prisma.staffProfile.findFirst.mockResolvedValue(mockTeacherStaffProfile);
      studentRepository.updateStudent.mockImplementation(async (sId, stId, payload) => ({
        ...mockStudent,
        customData: payload.customData
      }));

      const res = await studentService.updateStudentPerformanceStatus(
        schoolId,
        studentId,
        'excellent',
        teacherActor
      );

      expect(res.customData.performanceStatus).toBe('excellent');
    });

    it('3. updates status to "stable" for authorized teacher', async () => {
      const studentWithImproving = {
        ...mockStudent,
        customData: { ...mockStudent.customData, performanceStatus: 'improving' }
      };
      studentRepository.findStudentById.mockResolvedValue(studentWithImproving);
      prisma.staffProfile.findFirst.mockResolvedValue(mockTeacherStaffProfile);
      studentRepository.updateStudent.mockImplementation(async (sId, stId, payload) => ({
        ...studentWithImproving,
        customData: payload.customData
      }));

      const res = await studentService.updateStudentPerformanceStatus(
        schoolId,
        studentId,
        'stable',
        teacherActor
      );

      expect(res.customData.performanceStatus).toBe('stable');
    });

    it('4. preserves unrelated customData fields when updating status', async () => {
      const studentWithComplexCustom = {
        ...mockStudent,
        customData: {
          medicalInfo: 'Peanut allergy',
          health: { bloodGroup: 'O+', allergies: ['peanut'] },
          transportRoute: 'Route-5',
          performanceStatus: 'stable'
        }
      };
      studentRepository.findStudentById.mockResolvedValue(studentWithComplexCustom);
      prisma.staffProfile.findFirst.mockResolvedValue(mockTeacherStaffProfile);
      studentRepository.updateStudent.mockImplementation(async (sId, stId, payload) => ({
        ...studentWithComplexCustom,
        customData: payload.customData
      }));

      const res = await studentService.updateStudentPerformanceStatus(
        schoolId,
        studentId,
        'improving',
        teacherActor
      );

      expect(res.customData.performanceStatus).toBe('improving');
      expect(res.customData.medicalInfo).toBe('Peanut allergy');
      expect(res.customData.health).toEqual({ bloodGroup: 'O+', allergies: ['peanut'] });
      expect(res.customData.transportRoute).toBe('Route-5');
    });

    it('5. prevents teacher from updating student outside their assigned class scope', async () => {
      const studentInOtherClass = {
        ...mockStudent,
        classId: otherClassId
      };
      studentRepository.findStudentById.mockResolvedValue(studentInOtherClass);
      prisma.staffProfile.findFirst.mockResolvedValue(mockTeacherStaffProfile); // assigned to classId, not otherClassId

      await expect(
        studentService.updateStudentPerformanceStatus(
          schoolId,
          studentId,
          'improving',
          teacherActor
        )
      ).rejects.toThrow(ForbiddenError);

      expect(studentRepository.updateStudent).not.toHaveBeenCalled();
    });

    it('6. returns 404 NotFoundError for missing student without disclosing tenant info', async () => {
      studentRepository.findStudentById.mockResolvedValue(null);

      await expect(
        studentService.updateStudentPerformanceStatus(
          schoolId,
          'non-existent-uuid',
          'improving',
          teacherActor
        )
      ).rejects.toThrow(NotFoundError);

      expect(studentRepository.updateStudent).not.toHaveBeenCalled();
    });

    it('7. returns 404 NotFoundError when attempting to update student in another tenant', async () => {
      // Cross-tenant: findStudentById filters by schoolId; if student is in another school, returns null
      studentRepository.findStudentById.mockResolvedValue(null);

      await expect(
        studentService.updateStudentPerformanceStatus(
          schoolId,
          'cross-tenant-student-id',
          'improving',
          teacherActor
        )
      ).rejects.toThrow(NotFoundError);

      expect(studentRepository.updateStudent).not.toHaveBeenCalled();
    });

    it('8. rejects teacher without staff profile with 403 Forbidden', async () => {
      studentRepository.findStudentById.mockResolvedValue({ ...mockStudent });
      prisma.staffProfile.findFirst.mockResolvedValue(null); // No profile found

      await expect(
        studentService.updateStudentPerformanceStatus(
          schoolId,
          studentId,
          'improving',
          teacherActor
        )
      ).rejects.toThrow(ForbiddenError);

      expect(studentRepository.updateStudent).not.toHaveBeenCalled();
    });

    it('9. allows school administrator to update student performance status across classes', async () => {
      const studentInAnyClass = {
        ...mockStudent,
        classId: otherClassId
      };
      studentRepository.findStudentById.mockResolvedValue(studentInAnyClass);
      studentRepository.updateStudent.mockImplementation(async (sId, stId, payload) => ({
        ...studentInAnyClass,
        customData: payload.customData
      }));

      const res = await studentService.updateStudentPerformanceStatus(
        schoolId,
        studentId,
        'critical',
        adminActor
      );

      expect(res.customData.performanceStatus).toBe('critical');
      expect(studentRepository.updateStudent).toHaveBeenCalled();
    });
  });
});
