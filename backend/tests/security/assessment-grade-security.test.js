import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import * as assessmentGradeRepository from '../../src/modules/assessment-grades/assessment-grade.repository.js';
import * as rbacService from '../../src/modules/rbac/rbac.service.js';
import * as authRepository from '../../src/modules/auth/auth.repository.js';
import * as auditRepository from '../../src/modules/audit/audit.repository.js';
import * as tokenService from '../../src/modules/auth/token.service.js';
import { SYSTEM_ROLES } from '../../src/config/constants.js';

describe('Security: AssessmentGrade Multi-Tenant Isolation, RBAC & HTTP Endpoint Tests (Phase 4C.7-B Batch 3)', () => {
  const app = createApp();

  const SCHOOL_A = '11111111-1111-4111-8111-111111111111';
  const SCHOOL_B = '22222222-2222-4222-8222-222222222222';
  const ASSESSMENT_A_ID = 'aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa';
  const ASSESSMENT_B_ID = 'bbbbbbbb-2222-4bbb-8bbb-bbbbbbbbbbbb';
  const CLASS_A_ID = 'aaaaaaaa-cccc-4aaa-8aaa-aaaaaaaaaaaa';
  const CLASS_B_ID = 'bbbbbbbb-cccc-4bbb-8bbb-bbbbbbbbbbbb';
  const STUDENT_1_ID = 'aaaaaaaa-3333-4aaa-8aaa-aaaaaaaaaaaa';
  const STUDENT_2_ID = 'aaaaaaaa-4444-4aaa-8aaa-aaaaaaaaaaaa';
  const STUDENT_B_ID = 'bbbbbbbb-5555-4bbb-8bbb-bbbbbbbbbbbb';

  const schoolAAdmin = {
    id: 'admin-a-id',
    schoolId: SCHOOL_A,
    email: 'admina@schoola.com',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_A, name: 'School A', code: 'SchoolA', status: 'active' }
  };

  const schoolATeacher = {
    id: 'teacher-a-id',
    schoolId: SCHOOL_A,
    email: 'teachera@schoola.com',
    systemRole: SYSTEM_ROLES.TEACHER,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_A, name: 'School A', code: 'SchoolA', status: 'active' }
  };

  const schoolAUnauthorizedStaff = {
    id: 'staff-a-id',
    schoolId: SCHOOL_A,
    email: 'staffa@schoola.com',
    systemRole: SYSTEM_ROLES.STAFF,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_A, name: 'School A', code: 'SchoolA', status: 'active' }
  };

  const _schoolBAdmin = {
    id: 'admin-b-id',
    schoolId: SCHOOL_B,
    email: 'adminb@schoolb.com',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_B, name: 'School B', code: 'SchoolB', status: 'active' }
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(auditRepository, 'createAuditLog').mockResolvedValue({ id: 'mock-audit-id' });
  });

  const getAuthToken = (user) => {
    return tokenService.issueAccessToken({
      sub: user.id,
      schoolId: user.schoolId,
      systemRole: user.systemRole,
      tokenVersion: user.tokenVersion
    });
  };

  // =========================================================================
  // 1. AUTHENTICATION REQUIREMENT (Phase 4)
  // =========================================================================
  describe('1. Authentication Requirement', () => {
    it('1. denies unauthenticated request to list grades (401 Unauthorized)', async () => {
      const res = await request(app).get(`/api/v1/assessments/${ASSESSMENT_A_ID}/grades`);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('2. denies unauthenticated request to get single grade (401 Unauthorized)', async () => {
      const res = await request(app).get(`/api/v1/assessments/${ASSESSMENT_A_ID}/grades/${STUDENT_1_ID}`);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('3. denies unauthenticated request to PUT single grade (401 Unauthorized)', async () => {
      const res = await request(app)
        .put(`/api/v1/assessments/${ASSESSMENT_A_ID}/grades/${STUDENT_1_ID}`)
        .send({ marksObtained: 85 });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('4. denies unauthenticated request to POST bulk grades (401 Unauthorized)', async () => {
      const res = await request(app)
        .post(`/api/v1/assessments/${ASSESSMENT_A_ID}/grades/bulk`)
        .send({ grades: [{ studentId: STUDENT_1_ID, marksObtained: 85 }] });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('5. denies unauthenticated request to DELETE grade (401 Unauthorized)', async () => {
      const res = await request(app).delete(`/api/v1/assessments/${ASSESSMENT_A_ID}/grades/${STUDENT_1_ID}`);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  // =========================================================================
  // 2. TENANT ISOLATION (Phase 5)
  // =========================================================================
  describe('2. Tenant Isolation', () => {
    it('6. returns 404 when School A user attempts to list grades for School B assessment', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        exams: { canRead: true }
      });
      // Repo queries with schoolId = SCHOOL_A, so returns null
      vi.spyOn(assessmentGradeRepository, 'findAssessmentForGradeOperation').mockResolvedValue(null);

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .get(`/api/v1/assessments/${ASSESSMENT_B_ID}/grades`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('7. returns 404 when School A user attempts to get grade for School B assessment', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        exams: { canRead: true }
      });
      vi.spyOn(assessmentGradeRepository, 'findAssessmentForGradeOperation').mockResolvedValue(null);

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .get(`/api/v1/assessments/${ASSESSMENT_B_ID}/grades/${STUDENT_1_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('8. returns 404 when School A user attempts to PUT grade for School B student', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        exams: { canEdit: true }
      });
      vi.spyOn(assessmentGradeRepository, 'findAssessmentForGradeOperation').mockResolvedValue({
        id: ASSESSMENT_A_ID,
        schoolId: SCHOOL_A,
        classId: CLASS_A_ID,
        totalMarks: 100
      });
      // Student B not found in School A
      vi.spyOn(assessmentGradeRepository, 'findStudentForGradeOperation').mockResolvedValue(null);

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .put(`/api/v1/assessments/${ASSESSMENT_A_ID}/grades/${STUDENT_B_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ marksObtained: 90 });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain(`Student with ID '${STUDENT_B_ID}' not found`);
    });

    it('9. prevents Tenant A user from mutating Tenant B grades', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        exams: { canEdit: true }
      });
      vi.spyOn(assessmentGradeRepository, 'findAssessmentForGradeOperation').mockResolvedValue(null);

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .put(`/api/v1/assessments/${ASSESSMENT_B_ID}/grades/${STUDENT_1_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ marksObtained: 75 });

      expect(res.status).toBe(404);
    });

    it('10. prevents Tenant A user from deleting Tenant B grades', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        exams: { canDelete: true }
      });
      vi.spyOn(assessmentGradeRepository, 'findAssessmentForGradeOperation').mockResolvedValue(null);

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .delete(`/api/v1/assessments/${ASSESSMENT_B_ID}/grades/${STUDENT_1_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });

  // =========================================================================
  // 3. RBAC & TEACHER CLASS RESTRICTIONS (Phase 6)
  // =========================================================================
  describe('3. RBAC & Teacher Class Access Control', () => {
    it('11. denies unauthorized staff without exams:read permission (403 Forbidden)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAUnauthorizedStaff);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        exams: { canRead: false, canCreate: false, canEdit: false, canDelete: false }
      });

      const token = getAuthToken(schoolAUnauthorizedStaff);
      const res = await request(app)
        .get(`/api/v1/assessments/${ASSESSMENT_A_ID}/grades`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('12. denies unauthorized staff without exams:edit permission on PUT (403 Forbidden)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAUnauthorizedStaff);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        exams: { canRead: true, canEdit: false }
      });

      const token = getAuthToken(schoolAUnauthorizedStaff);
      const res = await request(app)
        .put(`/api/v1/assessments/${ASSESSMENT_A_ID}/grades/${STUDENT_1_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ marksObtained: 80 });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('13. allows teacher to access and record marks for assigned class', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolATeacher);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        exams: { canRead: true, canEdit: true }
      });
      vi.spyOn(assessmentGradeRepository, 'findAssessmentForGradeOperation').mockResolvedValue({
        id: ASSESSMENT_A_ID,
        schoolId: SCHOOL_A,
        classId: CLASS_A_ID,
        totalMarks: 100
      });
      vi.spyOn(assessmentGradeRepository, 'findStaffProfileByUserId').mockResolvedValue({
        id: 'staff-teacher-1',
        assignedClassId: CLASS_A_ID
      });
      vi.spyOn(assessmentGradeRepository, 'findStudentForGradeOperation').mockResolvedValue({
        id: STUDENT_1_ID,
        schoolId: SCHOOL_A,
        classId: CLASS_A_ID,
        firstName: 'Alice'
      });
      vi.spyOn(assessmentGradeRepository, 'upsertGrade').mockResolvedValue({
        id: 'grade-1',
        schoolId: SCHOOL_A,
        assessmentId: ASSESSMENT_A_ID,
        studentId: STUDENT_1_ID,
        marksObtained: 95.5,
        remarks: 'Excellent'
      });

      const token = getAuthToken(schoolATeacher);
      const res = await request(app)
        .put(`/api/v1/assessments/${ASSESSMENT_A_ID}/grades/${STUDENT_1_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ marksObtained: 95.5, remarks: 'Excellent' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.marksObtained).toBe(95.5);
    });

    it('14. denies teacher when attempting to record marks for unassigned class (403 Forbidden)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolATeacher);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        exams: { canRead: true, canEdit: true }
      });
      vi.spyOn(assessmentGradeRepository, 'findAssessmentForGradeOperation').mockResolvedValue({
        id: ASSESSMENT_A_ID,
        schoolId: SCHOOL_A,
        classId: CLASS_B_ID, // Assessment belongs to Class B
        totalMarks: 100
      });
      vi.spyOn(assessmentGradeRepository, 'findStaffProfileByUserId').mockResolvedValue({
        id: 'staff-teacher-1',
        assignedClassId: CLASS_A_ID // Teacher assigned to Class A
      });

      const token = getAuthToken(schoolATeacher);
      const res = await request(app)
        .put(`/api/v1/assessments/${ASSESSMENT_A_ID}/grades/${STUDENT_1_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ marksObtained: 85 });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain('Teachers are only authorized to manage marks for their assigned class');
    });

    it('15. allows administrator to access grades across classes (admin bypass)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        exams: { canRead: true }
      });
      vi.spyOn(assessmentGradeRepository, 'findAssessmentForGradeOperation').mockResolvedValue({
        id: ASSESSMENT_A_ID,
        schoolId: SCHOOL_A,
        classId: CLASS_A_ID,
        totalMarks: 100
      });
      vi.spyOn(assessmentGradeRepository, 'findGradesByAssessment').mockResolvedValue({
        items: [
          {
            id: 'grade-1',
            schoolId: SCHOOL_A,
            assessmentId: ASSESSMENT_A_ID,
            studentId: STUDENT_1_ID,
            marksObtained: 88,
            student: { id: STUDENT_1_ID, firstName: 'Alice', admissionNumber: 'ADM001' }
          }
        ],
        total: 1
      });

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .get(`/api/v1/assessments/${ASSESSMENT_A_ID}/grades`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });
  });

  // =========================================================================
  // 4. PARAMETER VALIDATION (Phase 7)
  // =========================================================================
  describe('4. Parameter Validation', () => {
    it('16. rejects invalid assessment UUID format (400 Bad Request)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        exams: { canRead: true }
      });

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .get('/api/v1/assessments/invalid-uuid-format/grades')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('17. rejects invalid student UUID format (400 Bad Request)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        exams: { canRead: true }
      });

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .get(`/api/v1/assessments/${ASSESSMENT_A_ID}/grades/not-a-uuid`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('18. returns 404 for valid UUID but nonexistent assessment', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        exams: { canRead: true }
      });
      vi.spyOn(assessmentGradeRepository, 'findAssessmentForGradeOperation').mockResolvedValue(null);

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .get(`/api/v1/assessments/${ASSESSMENT_A_ID}/grades`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.error.message).toContain('Assessment with ID');
    });

    it('19. returns 404 for valid UUIDs when student is nonexistent in PUT', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        exams: { canEdit: true }
      });
      vi.spyOn(assessmentGradeRepository, 'findAssessmentForGradeOperation').mockResolvedValue({
        id: ASSESSMENT_A_ID,
        schoolId: SCHOOL_A,
        classId: CLASS_A_ID,
        totalMarks: 100
      });
      vi.spyOn(assessmentGradeRepository, 'findStudentForGradeOperation').mockResolvedValue(null);

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .put(`/api/v1/assessments/${ASSESSMENT_A_ID}/grades/${STUDENT_1_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ marksObtained: 50 });

      expect(res.status).toBe(404);
      expect(res.body.error.message).toContain('Student with ID');
    });
  });

  // =========================================================================
  // 5. SINGLE GRADE REQUEST & BOUNDS (Phase 8 & Phase 16)
  // =========================================================================
  describe('5. Single Grade PUT Endpoint & Marks Validation', () => {
    it('20. successfully saves a valid single grade (200 OK)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        exams: { canEdit: true }
      });
      vi.spyOn(assessmentGradeRepository, 'findAssessmentForGradeOperation').mockResolvedValue({
        id: ASSESSMENT_A_ID,
        schoolId: SCHOOL_A,
        classId: CLASS_A_ID,
        totalMarks: 100
      });
      vi.spyOn(assessmentGradeRepository, 'findStudentForGradeOperation').mockResolvedValue({
        id: STUDENT_1_ID,
        schoolId: SCHOOL_A,
        classId: CLASS_A_ID,
        firstName: 'Alice'
      });
      vi.spyOn(assessmentGradeRepository, 'upsertGrade').mockResolvedValue({
        id: 'grade-1',
        schoolId: SCHOOL_A,
        assessmentId: ASSESSMENT_A_ID,
        studentId: STUDENT_1_ID,
        marksObtained: 85,
        remarks: 'Good progress'
      });

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .put(`/api/v1/assessments/${ASSESSMENT_A_ID}/grades/${STUDENT_1_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ marksObtained: 85, remarks: 'Good progress' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.marksObtained).toBe(85);
      expect(res.body.data.remarks).toBe('Good progress');
    });

    it('21. allows valid marks = 0 (200 OK)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        exams: { canEdit: true }
      });
      vi.spyOn(assessmentGradeRepository, 'findAssessmentForGradeOperation').mockResolvedValue({
        id: ASSESSMENT_A_ID,
        schoolId: SCHOOL_A,
        classId: CLASS_A_ID,
        totalMarks: 50
      });
      vi.spyOn(assessmentGradeRepository, 'findStudentForGradeOperation').mockResolvedValue({
        id: STUDENT_1_ID,
        schoolId: SCHOOL_A,
        classId: CLASS_A_ID,
        firstName: 'Alice'
      });
      vi.spyOn(assessmentGradeRepository, 'upsertGrade').mockResolvedValue({
        id: 'grade-1',
        schoolId: SCHOOL_A,
        assessmentId: ASSESSMENT_A_ID,
        studentId: STUDENT_1_ID,
        marksObtained: 0
      });

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .put(`/api/v1/assessments/${ASSESSMENT_A_ID}/grades/${STUDENT_1_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ marksObtained: 0 });

      expect(res.status).toBe(200);
      expect(res.body.data.marksObtained).toBe(0);
    });

    it('22. allows valid marks = totalMarks (boundary check: 200 OK)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        exams: { canEdit: true }
      });
      vi.spyOn(assessmentGradeRepository, 'findAssessmentForGradeOperation').mockResolvedValue({
        id: ASSESSMENT_A_ID,
        schoolId: SCHOOL_A,
        classId: CLASS_A_ID,
        totalMarks: 100
      });
      vi.spyOn(assessmentGradeRepository, 'findStudentForGradeOperation').mockResolvedValue({
        id: STUDENT_1_ID,
        schoolId: SCHOOL_A,
        classId: CLASS_A_ID,
        firstName: 'Alice'
      });
      vi.spyOn(assessmentGradeRepository, 'upsertGrade').mockResolvedValue({
        id: 'grade-1',
        schoolId: SCHOOL_A,
        assessmentId: ASSESSMENT_A_ID,
        studentId: STUDENT_1_ID,
        marksObtained: 100
      });

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .put(`/api/v1/assessments/${ASSESSMENT_A_ID}/grades/${STUDENT_1_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ marksObtained: 100 });

      expect(res.status).toBe(200);
      expect(res.body.data.marksObtained).toBe(100);
    });

    it('23. rejects marks > totalMarks (400 Bad Request)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        exams: { canEdit: true }
      });
      vi.spyOn(assessmentGradeRepository, 'findAssessmentForGradeOperation').mockResolvedValue({
        id: ASSESSMENT_A_ID,
        schoolId: SCHOOL_A,
        classId: CLASS_A_ID,
        totalMarks: 50
      });
      vi.spyOn(assessmentGradeRepository, 'findStudentForGradeOperation').mockResolvedValue({
        id: STUDENT_1_ID,
        schoolId: SCHOOL_A,
        classId: CLASS_A_ID,
        firstName: 'Alice'
      });

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .put(`/api/v1/assessments/${ASSESSMENT_A_ID}/grades/${STUDENT_1_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ marksObtained: 50.5 });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('exceeds assessment total marks');
    });

    it('24. rejects negative marks at validation layer (400 Bad Request)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        exams: { canEdit: true }
      });

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .put(`/api/v1/assessments/${ASSESSMENT_A_ID}/grades/${STUDENT_1_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ marksObtained: -5 });

      expect(res.status).toBe(400);
    });

    it('25. rejects excessive decimal precision e.g. 3 decimal places (400 Bad Request)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        exams: { canEdit: true }
      });

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .put(`/api/v1/assessments/${ASSESSMENT_A_ID}/grades/${STUDENT_1_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ marksObtained: 85.123 });

      expect(res.status).toBe(400);
    });

    it('26. normalizes whitespace-only remarks to null', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        exams: { canEdit: true }
      });
      vi.spyOn(assessmentGradeRepository, 'findAssessmentForGradeOperation').mockResolvedValue({
        id: ASSESSMENT_A_ID,
        schoolId: SCHOOL_A,
        classId: CLASS_A_ID,
        totalMarks: 100
      });
      vi.spyOn(assessmentGradeRepository, 'findStudentForGradeOperation').mockResolvedValue({
        id: STUDENT_1_ID,
        schoolId: SCHOOL_A,
        classId: CLASS_A_ID,
        firstName: 'Alice'
      });
      vi.spyOn(assessmentGradeRepository, 'upsertGrade').mockResolvedValue({
        id: 'grade-1',
        schoolId: SCHOOL_A,
        assessmentId: ASSESSMENT_A_ID,
        studentId: STUDENT_1_ID,
        marksObtained: 75,
        remarks: null
      });

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .put(`/api/v1/assessments/${ASSESSMENT_A_ID}/grades/${STUDENT_1_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ marksObtained: 75, remarks: '   ' });

      expect(res.status).toBe(200);
      expect(res.body.data.remarks).toBeNull();
    });
  });

  // =========================================================================
  // 6. BULK ENDPOINT & ATOMICITY (Phase 9)
  // =========================================================================
  describe('6. Bulk Grade POST Endpoint & Contract', () => {
    it('27. successfully saves a valid bulk grades request (200 OK)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        exams: { canEdit: true }
      });
      vi.spyOn(assessmentGradeRepository, 'findAssessmentForGradeOperation').mockResolvedValue({
        id: ASSESSMENT_A_ID,
        schoolId: SCHOOL_A,
        classId: CLASS_A_ID,
        totalMarks: 100
      });
      vi.spyOn(assessmentGradeRepository, 'executeInTransaction').mockImplementation(async (callback) => {
        return callback({});
      });
      vi.spyOn(assessmentGradeRepository, 'findStudentsByIdsForGradeOperation').mockResolvedValue([
        { id: STUDENT_1_ID, classId: CLASS_A_ID, firstName: 'Alice' },
        { id: STUDENT_2_ID, classId: CLASS_A_ID, firstName: 'Bob' }
      ]);
      vi.spyOn(assessmentGradeRepository, 'upsertGrade')
        .mockResolvedValueOnce({
          id: 'grade-1',
          schoolId: SCHOOL_A,
          assessmentId: ASSESSMENT_A_ID,
          studentId: STUDENT_1_ID,
          marksObtained: 90
        })
        .mockResolvedValueOnce({
          id: 'grade-2',
          schoolId: SCHOOL_A,
          assessmentId: ASSESSMENT_A_ID,
          studentId: STUDENT_2_ID,
          marksObtained: 85
        });

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .post(`/api/v1/assessments/${ASSESSMENT_A_ID}/grades/bulk`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          grades: [
            { studentId: STUDENT_1_ID, marksObtained: 90 },
            { studentId: STUDENT_2_ID, marksObtained: 85 }
          ]
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.count).toBe(2);
      expect(res.body.data.grades).toHaveLength(2);
    });

    it('28. rejects duplicate student IDs in bulk request (400 Bad Request)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        exams: { canEdit: true }
      });
      vi.spyOn(assessmentGradeRepository, 'findAssessmentForGradeOperation').mockResolvedValue({
        id: ASSESSMENT_A_ID,
        schoolId: SCHOOL_A,
        classId: CLASS_A_ID,
        totalMarks: 100
      });

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .post(`/api/v1/assessments/${ASSESSMENT_A_ID}/grades/bulk`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          grades: [
            { studentId: STUDENT_1_ID, marksObtained: 90 },
            { studentId: STUDENT_1_ID, marksObtained: 80 }
          ]
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Duplicate student ID');
    });

    it('29. rejects > 200 entries in bulk batch (400 Bad Request)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        exams: { canEdit: true }
      });

      const token = getAuthToken(schoolAAdmin);
      const oversizedGrades = Array.from({ length: 201 }, (_, i) => ({
        studentId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        marksObtained: 50
      }));

      const res = await request(app)
        .post(`/api/v1/assessments/${ASSESSMENT_A_ID}/grades/bulk`)
        .set('Authorization', `Bearer ${token}`)
        .send({ grades: oversizedGrades });

      expect(res.status).toBe(400);
    });

    it('30. rejects wrong-class student in bulk request (409 Conflict)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        exams: { canEdit: true }
      });
      vi.spyOn(assessmentGradeRepository, 'findAssessmentForGradeOperation').mockResolvedValue({
        id: ASSESSMENT_A_ID,
        schoolId: SCHOOL_A,
        classId: CLASS_A_ID,
        totalMarks: 100
      });
      vi.spyOn(assessmentGradeRepository, 'executeInTransaction').mockImplementation(async (callback) => {
        return callback({});
      });
      vi.spyOn(assessmentGradeRepository, 'findStudentsByIdsForGradeOperation').mockResolvedValue([
        { id: STUDENT_1_ID, classId: CLASS_B_ID, firstName: 'WrongClassStudent' }
      ]);

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .post(`/api/v1/assessments/${ASSESSMENT_A_ID}/grades/bulk`)
        .set('Authorization', `Bearer ${token}`)
        .send({ grades: [{ studentId: STUDENT_1_ID, marksObtained: 75 }] });

      expect(res.status).toBe(409);
      expect(res.body.error.message).toContain('does not belong to Assessment class');
    });

    it('31. rejects cross-tenant / nonexistent student in bulk request (404 Not Found)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        exams: { canEdit: true }
      });
      vi.spyOn(assessmentGradeRepository, 'findAssessmentForGradeOperation').mockResolvedValue({
        id: ASSESSMENT_A_ID,
        schoolId: SCHOOL_A,
        classId: CLASS_A_ID,
        totalMarks: 100
      });
      vi.spyOn(assessmentGradeRepository, 'executeInTransaction').mockImplementation(async (callback) => {
        return callback({});
      });
      // Student not found in School A tenant
      vi.spyOn(assessmentGradeRepository, 'findStudentsByIdsForGradeOperation').mockResolvedValue([]);

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .post(`/api/v1/assessments/${ASSESSMENT_A_ID}/grades/bulk`)
        .set('Authorization', `Bearer ${token}`)
        .send({ grades: [{ studentId: STUDENT_1_ID, marksObtained: 75 }] });

      expect(res.status).toBe(404);
      expect(res.body.error.message).toContain('Student with ID');
    });

    it('32. rejects excessive mark in bulk request (400 Bad Request)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        exams: { canEdit: true }
      });
      vi.spyOn(assessmentGradeRepository, 'findAssessmentForGradeOperation').mockResolvedValue({
        id: ASSESSMENT_A_ID,
        schoolId: SCHOOL_A,
        classId: CLASS_A_ID,
        totalMarks: 50
      });
      vi.spyOn(assessmentGradeRepository, 'executeInTransaction').mockImplementation(async (callback) => {
        return callback({});
      });
      vi.spyOn(assessmentGradeRepository, 'findStudentsByIdsForGradeOperation').mockResolvedValue([
        { id: STUDENT_1_ID, classId: CLASS_A_ID, firstName: 'Alice' }
      ]);

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .post(`/api/v1/assessments/${ASSESSMENT_A_ID}/grades/bulk`)
        .set('Authorization', `Bearer ${token}`)
        .send({ grades: [{ studentId: STUDENT_1_ID, marksObtained: 55 }] });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('exceeds assessment total marks');
    });

    it('33. verifies rollback in service transaction if any item is invalid', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        exams: { canEdit: true }
      });
      vi.spyOn(assessmentGradeRepository, 'findAssessmentForGradeOperation').mockResolvedValue({
        id: ASSESSMENT_A_ID,
        schoolId: SCHOOL_A,
        classId: CLASS_A_ID,
        totalMarks: 100
      });

      const upsertSpy = vi.spyOn(assessmentGradeRepository, 'upsertGrade');
      vi.spyOn(assessmentGradeRepository, 'executeInTransaction').mockImplementation(async (callback) => {
        return callback({});
      });
      vi.spyOn(assessmentGradeRepository, 'findStudentsByIdsForGradeOperation').mockResolvedValue([
        { id: STUDENT_1_ID, classId: CLASS_A_ID, firstName: 'Alice' },
        { id: STUDENT_2_ID, classId: CLASS_B_ID, firstName: 'Bob' } // Student 2 wrong class
      ]);

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .post(`/api/v1/assessments/${ASSESSMENT_A_ID}/grades/bulk`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          grades: [
            { studentId: STUDENT_1_ID, marksObtained: 80 },
            { studentId: STUDENT_2_ID, marksObtained: 85 }
          ]
        });

      expect(res.status).toBe(409);
      expect(upsertSpy).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 7. DELETE ENDPOINT (Phase 2 & Phase 15)
  // =========================================================================
  describe('7. Grade Deletion Endpoint', () => {
    it('34. successfully deletes a recorded student grade (200 OK)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        exams: { canDelete: true }
      });
      vi.spyOn(assessmentGradeRepository, 'findAssessmentForGradeOperation').mockResolvedValue({
        id: ASSESSMENT_A_ID,
        schoolId: SCHOOL_A,
        classId: CLASS_A_ID,
        totalMarks: 100
      });
      vi.spyOn(assessmentGradeRepository, 'findGrade').mockResolvedValue({
        id: 'grade-1',
        schoolId: SCHOOL_A,
        assessmentId: ASSESSMENT_A_ID,
        studentId: STUDENT_1_ID,
        marksObtained: 70
      });
      vi.spyOn(assessmentGradeRepository, 'deleteGrade').mockResolvedValue({ count: 1 });

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .delete(`/api/v1/assessments/${ASSESSMENT_A_ID}/grades/${STUDENT_1_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBe('Assessment grade cleared successfully');
    });

    it('35. returns 404 when deleting grade for cross-tenant assessment', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        exams: { canDelete: true }
      });
      vi.spyOn(assessmentGradeRepository, 'findAssessmentForGradeOperation').mockResolvedValue(null);

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .delete(`/api/v1/assessments/${ASSESSMENT_B_ID}/grades/${STUDENT_1_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('36. denies deletion for user lacking exams:delete permission (403 Forbidden)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolATeacher);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        exams: { canRead: true, canEdit: true, canDelete: false }
      });

      const token = getAuthToken(schoolATeacher);
      const res = await request(app)
        .delete(`/api/v1/assessments/${ASSESSMENT_A_ID}/grades/${STUDENT_1_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // 8. ROUTE ORDERING REGRESSION (Phase 3 & Phase 15)
  // =========================================================================
  describe('8. Route Ordering & Resolution', () => {
    it('37. /grades/bulk resolves to bulk endpoint rather than studentId endpoint', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        exams: { canEdit: true }
      });
      vi.spyOn(assessmentGradeRepository, 'findAssessmentForGradeOperation').mockResolvedValue({
        id: ASSESSMENT_A_ID,
        schoolId: SCHOOL_A,
        classId: CLASS_A_ID,
        totalMarks: 100
      });
      vi.spyOn(assessmentGradeRepository, 'executeInTransaction').mockImplementation(async (callback) => {
        return callback({});
      });
      vi.spyOn(assessmentGradeRepository, 'findStudentsByIdsForGradeOperation').mockResolvedValue([
        { id: STUDENT_1_ID, classId: CLASS_A_ID, firstName: 'Alice' }
      ]);
      vi.spyOn(assessmentGradeRepository, 'upsertGrade').mockResolvedValue({
        id: 'grade-1',
        schoolId: SCHOOL_A,
        assessmentId: ASSESSMENT_A_ID,
        studentId: STUDENT_1_ID,
        marksObtained: 92
      });

      const token = getAuthToken(schoolAAdmin);
      // POST to /bulk with body: { grades: [...] }
      const res = await request(app)
        .post(`/api/v1/assessments/${ASSESSMENT_A_ID}/grades/bulk`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          grades: [{ studentId: STUDENT_1_ID, marksObtained: 92 }]
        });

      // Must succeed as bulk endpoint (200), not fail with "Invalid student ID format (bulk is not UUID)"
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.count).toBe(1);
    });
  });

  // =========================================================================
  // 9. RESPONSE SERIALIZATION & DECIMAL FORMATTING (Phase 16)
  // =========================================================================
  describe('9. Response Serialization & Decimal Formatting', () => {
    it('38. correctly serializes Decimal marksObtained in single GET and list responses', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        exams: { canRead: true }
      });
      vi.spyOn(assessmentGradeRepository, 'findAssessmentForGradeOperation').mockResolvedValue({
        id: ASSESSMENT_A_ID,
        schoolId: SCHOOL_A,
        classId: CLASS_A_ID,
        totalMarks: 100
      });
      vi.spyOn(assessmentGradeRepository, 'findGrade').mockResolvedValue({
        id: 'grade-1',
        schoolId: SCHOOL_A,
        assessmentId: ASSESSMENT_A_ID,
        studentId: STUDENT_1_ID,
        marksObtained: '87.50',
        grade: 'A',
        remarks: 'Great work',
        createdAt: new Date('2026-09-10T10:00:00Z'),
        updatedAt: new Date('2026-09-10T10:00:00Z'),
        student: {
          id: STUDENT_1_ID,
          firstName: 'Alice',
          lastName: 'Smith',
          admissionNumber: 'ADM-001',
          rollNumber: '101'
        }
      });

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .get(`/api/v1/assessments/${ASSESSMENT_A_ID}/grades/${STUDENT_1_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.data.marksObtained).toBe('number');
      expect(res.body.data.marksObtained).toBe(87.5);
      expect(res.body.data.grade).toBe('A');
      expect(res.body.data.student.admissionNumber).toBe('ADM-001');
    });
  });
});

