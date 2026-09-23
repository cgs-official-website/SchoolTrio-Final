import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import * as examRepository from '../../src/modules/exams/exam.repository.js';
import * as assessmentRepository from '../../src/modules/assessments/assessment.repository.js';
import * as rbacService from '../../src/modules/rbac/rbac.service.js';
import * as authRepository from '../../src/modules/auth/auth.repository.js';
import * as auditRepository from '../../src/modules/audit/audit.repository.js';
import * as tokenService from '../../src/modules/auth/token.service.js';
import { SYSTEM_ROLES } from '../../src/config/constants.js';

describe('Security: Exams & Assessments Multi-Tenant Isolation & RBAC Access Control Tests (Phase 4C.7-A)', () => {
  const app = createApp();
  const SCHOOL_A = '11111111-1111-4111-8111-111111111111';
  const _SCHOOL_B = '22222222-2222-4222-8222-222222222222';
  const EXAM_B_ID = 'bbbbbbbb-1111-4bbb-8bbb-bbbbbbbbbbbb';
  const ASSESSMENT_B_ID = 'bbbbbbbb-2222-4bbb-8bbb-bbbbbbbbbbbb';
  const CLASS_A_ID = 'aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa';
  const CLASS_B_ID = 'bbbbbbbb-3333-4bbb-8bbb-bbbbbbbbbbbb';

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

  describe('1. Authentication Requirement', () => {
    it('denies unauthenticated request to /api/v1/exams with 401 Unauthorized', async () => {
      const res = await request(app).get('/api/v1/exams');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('denies unauthenticated request to /api/v1/assessments with 401 Unauthorized', async () => {
      const res = await request(app).get('/api/v1/assessments');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('2. RBAC Permission Checks', () => {
    it('denies user lacking exams:read permission with 403 Forbidden', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAUnauthorizedStaff);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        exams: { canRead: false, canCreate: false, canEdit: false, canDelete: false }
      });

      const token = getAuthToken(schoolAUnauthorizedStaff);
      const res = await request(app)
        .get('/api/v1/exams')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('allows user with exams:read permission to list examinations', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        exams: { canRead: true, canCreate: true, canEdit: true, canDelete: true }
      });
      vi.spyOn(examRepository, 'findExams').mockResolvedValue({
        items: [{ id: 'exam-1', name: 'Annual Exam' }],
        total: 1
      });

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .get('/api/v1/exams')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('3. Cross-Tenant Isolation', () => {
    it('returns 404 when School A admin attempts to get School B exam', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        exams: { canRead: true }
      });
      // Repo queries with schoolId = SCHOOL_A, so returns null for School B's exam
      vi.spyOn(examRepository, 'findExamById').mockResolvedValue(null);

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .get(`/api/v1/exams/${EXAM_B_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 404 when School A admin attempts to get School B assessment', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        exams: { canRead: true }
      });
      vi.spyOn(assessmentRepository, 'findAssessmentById').mockResolvedValue(null);

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .get(`/api/v1/assessments/${ASSESSMENT_B_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('rejects assessment creation when referencing a class belonging to School B', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        exams: { canCreate: true }
      });
      // verifyClassExists returns null because class belongs to School B
      vi.spyOn(assessmentRepository, 'verifyClassExists').mockResolvedValue(null);

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .post('/api/v1/assessments')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Poisoned Class Quiz',
          classId: CLASS_B_ID,
          totalMarks: 50
        });

      expect(res.status).toBe(404);
      const errMsg = res.body.message || res.body.error?.message;
      expect(errMsg).toContain('Class with ID');
    });
  });

  describe('4. Teacher Class-Based Authorization', () => {
    it('denies teacher when creating assessment for an unassigned class (403 Forbidden)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolATeacher);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        exams: { canCreate: true }
      });
      // Teacher is assigned to CLASS_A_ID
      vi.spyOn(assessmentRepository, 'findStaffProfileByUserId').mockResolvedValue({
        id: 'staff-teacher-1',
        assignedClassId: CLASS_A_ID
      });

      const token = getAuthToken(schoolATeacher);
      // Teacher attempts to create assessment for CLASS_B_ID
      const res = await request(app)
        .post('/api/v1/assessments')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Intruder Quiz',
          classId: CLASS_B_ID,
          totalMarks: 50
        });

      expect(res.status).toBe(403);
      const errMsg = res.body.message || res.body.error?.message;
      expect(errMsg).toContain('Teachers are only authorized to manage assessments for their assigned class');
    });

    it('allows teacher to create assessment for their assigned class', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolATeacher);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        exams: { canCreate: true }
      });
      vi.spyOn(assessmentRepository, 'findStaffProfileByUserId').mockResolvedValue({
        id: 'staff-teacher-1',
        assignedClassId: CLASS_A_ID
      });
      vi.spyOn(assessmentRepository, 'verifyClassExists').mockResolvedValue({ id: CLASS_A_ID, name: 'Grade 10-A' });
      vi.spyOn(assessmentRepository, 'createAssessment').mockResolvedValue({
        id: '11111111-2222-4333-8444-555555555555',
        schoolId: SCHOOL_A,
        title: 'Weekly Quiz',
        classId: CLASS_A_ID,
        totalMarks: 50
      });

      const token = getAuthToken(schoolATeacher);
      const res = await request(app)
        .post('/api/v1/assessments')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Weekly Quiz',
          classId: CLASS_A_ID,
          totalMarks: 50
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Weekly Quiz');
    });
  });

  describe('5. Safe Deletion & Dependency Protection', () => {
    const EXAM_WITH_DEPS_ID = 'aaaaaaaa-eeee-4aaa-8eee-aaaaaaaaaaaa';
    const ASSESS_WITH_GRADES_ID = 'bbbbbbbb-eeee-4bbb-8eee-bbbbbbbbbbbb';

    it('returns 409 Conflict when deleting examination with dependent assessments', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        exams: { canDelete: true }
      });
      vi.spyOn(examRepository, 'findExamById').mockResolvedValue({
        id: EXAM_WITH_DEPS_ID,
        schoolId: SCHOOL_A,
        name: 'Finals'
      });
      vi.spyOn(examRepository, 'countDependentAssessments').mockResolvedValue(5);

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .delete(`/api/v1/exams/${EXAM_WITH_DEPS_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(409);
      const errMsg = res.body.message || res.body.error?.message;
      expect(errMsg).toContain('assessment(s) are linked to it');
    });

    it('returns 409 Conflict when deleting assessment with recorded student grades', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        exams: { canDelete: true }
      });
      vi.spyOn(assessmentRepository, 'findAssessmentById').mockResolvedValue({
        id: ASSESS_WITH_GRADES_ID,
        schoolId: SCHOOL_A,
        classId: CLASS_A_ID,
        title: 'Graded Midterm'
      });
      vi.spyOn(assessmentRepository, 'countAssessmentGrades').mockResolvedValue(30);

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .delete(`/api/v1/assessments/${ASSESS_WITH_GRADES_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(409);
      const errMsg = res.body.message || res.body.error?.message;
      expect(errMsg).toContain('student mark(s) are recorded for this assessment');
    });
  });
});
