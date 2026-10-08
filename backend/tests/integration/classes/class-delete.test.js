import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import * as authRepository from '../../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../../src/modules/auth/token.service.js';
import { prisma } from '../../../src/database/prisma.client.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';

describe('Integration & Security: Class & Section Deletion Operations', { timeout: 30000 }, () => {
  const app = createApp();
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';

  const CLASS_EMPTY_ID = 'aaaaaaaa-0000-4aaa-8aaa-aaaaaaaaaaaa';
  const CLASS_WITH_DEPS_ID = 'aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa';
  const CLASS_MULTI_SEC_ID = 'aaaaaaaa-2222-4aaa-8aaa-aaaaaaaaaaaa';

  const SEC_A_ID = '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const SEC_B_ID = '22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  const ADMIN_USER = {
    id: 'eeeeeeee-5555-4555-8555-eeeeeeeeeeee',
    schoolId: SCHOOL_ID,
    email: 'admin@school.edu',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_ID, name: 'Spring Mount', code: 'SchoolS024', status: 'active' }
  };

  const TEACHER_USER = {
    id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
    schoolId: SCHOOL_ID,
    email: 'teacher@school.edu',
    systemRole: SYSTEM_ROLES.TEACHER,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_ID, name: 'Spring Mount', code: 'SchoolS024', status: 'active' }
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => callback(prisma));
  });

  const getAuthToken = (user) => {
    return tokenService.issueAccessToken({
      sub: user.id,
      schoolId: user.schoolId,
      systemRole: user.systemRole,
      tokenVersion: user.tokenVersion
    });
  };

  describe('1. Class Deletion Semantics (DELETE /api/v1/classes/:id)', () => {
    it('1. Admin deletes an empty class with no dependencies successfully', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(ADMIN_USER);

      vi.spyOn(prisma.class, 'findFirst').mockResolvedValue({
        id: CLASS_EMPTY_ID,
        schoolId: SCHOOL_ID,
        name: 'Empty Class',
        classTeacherId: null,
        sections: []
      });

      // All dependency counts return 0
      vi.spyOn(prisma.student, 'count').mockResolvedValue(0);
      vi.spyOn(prisma.attendanceSession, 'count').mockResolvedValue(0);
      vi.spyOn(prisma.timetablePeriod, 'count').mockResolvedValue(0);
      vi.spyOn(prisma.feeStructure, 'count').mockResolvedValue(0);
      vi.spyOn(prisma.assessment, 'count').mockResolvedValue(0);
      vi.spyOn(prisma.homeworkAssignment, 'count').mockResolvedValue(0);

      vi.spyOn(prisma.section, 'deleteMany').mockResolvedValue({ count: 0 });
      vi.spyOn(prisma.class, 'delete').mockResolvedValue({ id: CLASS_EMPTY_ID });
      vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({ id: 'audit-1' });

      const token = getAuthToken(ADMIN_USER);
      const res = await request(app)
        .delete(`/api/v1/classes/${CLASS_EMPTY_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toMatch(/deleted successfully/i);
    });

    it('2. Admin deletes class with sections atomically', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(ADMIN_USER);

      vi.spyOn(prisma.class, 'findFirst').mockResolvedValue({
        id: CLASS_MULTI_SEC_ID,
        schoolId: SCHOOL_ID,
        name: 'Grade 10',
        classTeacherId: null,
        sections: [{ id: SEC_A_ID, name: 'A' }, { id: SEC_B_ID, name: 'B' }]
      });

      vi.spyOn(prisma.student, 'count').mockResolvedValue(0);
      vi.spyOn(prisma.attendanceSession, 'count').mockResolvedValue(0);
      vi.spyOn(prisma.timetablePeriod, 'count').mockResolvedValue(0);
      vi.spyOn(prisma.feeStructure, 'count').mockResolvedValue(0);
      vi.spyOn(prisma.assessment, 'count').mockResolvedValue(0);
      vi.spyOn(prisma.homeworkAssignment, 'count').mockResolvedValue(0);

      const deleteSecSpy = vi.spyOn(prisma.section, 'deleteMany').mockResolvedValue({ count: 2 });
      const deleteClassSpy = vi.spyOn(prisma.class, 'delete').mockResolvedValue({ id: CLASS_MULTI_SEC_ID });
      vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({ id: 'audit-2' });

      const token = getAuthToken(ADMIN_USER);
      const res = await request(app)
        .delete(`/api/v1/classes/${CLASS_MULTI_SEC_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(deleteSecSpy).toHaveBeenCalled();
      expect(deleteClassSpy).toHaveBeenCalled();
    });

    it('3. Admin deletes class with assigned students and assessments, unassigning students and cascading deletion', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(ADMIN_USER);

      vi.spyOn(prisma.class, 'findFirst').mockResolvedValue({
        id: CLASS_WITH_DEPS_ID,
        schoolId: SCHOOL_ID,
        name: 'Grade 10 With Students',
        classTeacherId: null,
        sections: [{ id: SEC_A_ID, name: 'A' }]
      });

      const unassignStudentsSpy = vi.spyOn(prisma.student, 'updateMany').mockResolvedValue({ count: 15 });
      const deleteAssessmentsSpy = vi.spyOn(prisma.assessment, 'deleteMany').mockResolvedValue({ count: 2 });
      const deleteAssessmentGradesSpy = vi.spyOn(prisma.assessmentGrade, 'deleteMany').mockResolvedValue({ count: 30 });
      const deleteAttendanceSpy = vi.spyOn(prisma.attendanceSession, 'deleteMany').mockResolvedValue({ count: 5 });
      const deleteAttendanceRecordsSpy = vi.spyOn(prisma.attendanceRecord, 'deleteMany').mockResolvedValue({ count: 75 });
      const deleteTimetableSpy = vi.spyOn(prisma.timetablePeriod, 'deleteMany').mockResolvedValue({ count: 10 });
      const deleteFeesSpy = vi.spyOn(prisma.feeStructure, 'deleteMany').mockResolvedValue({ count: 1 });
      const deleteInvoicesSpy = vi.spyOn(prisma.invoice, 'deleteMany').mockResolvedValue({ count: 15 });
      const deleteSecSpy = vi.spyOn(prisma.section, 'deleteMany').mockResolvedValue({ count: 1 });
      const deleteClassSpy = vi.spyOn(prisma.class, 'delete').mockResolvedValue({ id: CLASS_WITH_DEPS_ID });
      vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({ id: 'audit-3' });

      const token = getAuthToken(ADMIN_USER);
      const res = await request(app)
        .delete(`/api/v1/classes/${CLASS_WITH_DEPS_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(unassignStudentsSpy).toHaveBeenCalledWith({
        where: { schoolId: SCHOOL_ID, classId: CLASS_WITH_DEPS_ID },
        data: { classId: null, sectionId: null }
      });
      expect(deleteAssessmentsSpy).toHaveBeenCalled();
      expect(deleteClassSpy).toHaveBeenCalled();
    });

    it('4. Teacher without class:delete permission is rejected with 403 Forbidden', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(TEACHER_USER);

      const token = getAuthToken(TEACHER_USER);
      const res = await request(app)
        .delete(`/api/v1/classes/${CLASS_EMPTY_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('5. Cross-tenant class deletion is rejected with 404 Not Found', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(ADMIN_USER);
      vi.spyOn(prisma.class, 'findFirst').mockResolvedValue(null);

      const token = getAuthToken(ADMIN_USER);
      const res = await request(app)
        .delete(`/api/v1/classes/88888888-8888-4888-8888-888888888888`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('2. Section Deletion Semantics (DELETE /api/v1/classes/:classId/sections/:sectionId)', () => {
    it('6. Deleting Section A unassigns students from Section A and preserves class and Section B', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(ADMIN_USER);

      vi.spyOn(prisma.class, 'findFirst').mockResolvedValue({
        id: CLASS_MULTI_SEC_ID,
        schoolId: SCHOOL_ID,
        name: 'Grade 10'
      });

      vi.spyOn(prisma.section, 'findFirst').mockResolvedValue({
        id: SEC_A_ID,
        classId: CLASS_MULTI_SEC_ID,
        schoolId: SCHOOL_ID,
        name: 'A'
      });

      const unassignSecStudentsSpy = vi.spyOn(prisma.student, 'updateMany').mockResolvedValue({ count: 10 });
      const deleteSecSpy = vi.spyOn(prisma.section, 'delete').mockResolvedValue({ id: SEC_A_ID });
      const deleteClassSpy = vi.spyOn(prisma.class, 'delete');
      vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({ id: 'audit-4' });

      const token = getAuthToken(ADMIN_USER);
      const res = await request(app)
        .delete(`/api/v1/classes/${CLASS_MULTI_SEC_ID}/sections/${SEC_A_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(unassignSecStudentsSpy).toHaveBeenCalledWith({
        where: { schoolId: SCHOOL_ID, sectionId: SEC_A_ID },
        data: { sectionId: null }
      });
      expect(deleteSecSpy).toHaveBeenCalled();
      expect(deleteClassSpy).not.toHaveBeenCalled();
    });
  });
});
