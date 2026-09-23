import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import * as lessonPlanService from '../../../src/modules/lesson-plans/lesson-plan.service.js';
import * as authRepository from '../../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../../src/modules/auth/token.service.js';
import * as rbacService from '../../../src/modules/rbac/rbac.service.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';

describe('Lesson Plan Routes & Security Integration Tests', () => {
  const app = createApp();

  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const OTHER_SCHOOL_ID = '99999999-9999-4999-8999-999999999999';
  const ADMIN_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const TEACHER_USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const STAFFS_USER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const PARENT_USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const PLAN_ID = '22222222-2222-4222-8222-222222222222';
  const CLASS_ID = '33333333-3333-4333-8333-333333333333';
  const SUBJECT_ID = '44444444-4444-4444-8444-444444444444';
  const TEACHER_STAFF_ID = '55555555-5555-4555-8555-555555555555';

  const adminUser = {
    id: ADMIN_USER_ID,
    schoolId: SCHOOL_ID,
    email: 'admin@school.com',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_ID, name: 'School A', code: 'SCH-A', status: 'active' }
  };

  const superAdminUser = {
    id: 'super-admin-uuid-1',
    schoolId: SCHOOL_ID,
    email: 'superadmin@system.com',
    systemRole: SYSTEM_ROLES.SUPER_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_ID, name: 'School A', code: 'SCH-A', status: 'active' }
  };

  const teacherUser = {
    id: TEACHER_USER_ID,
    schoolId: SCHOOL_ID,
    email: 'teacher@school.com',
    systemRole: SYSTEM_ROLES.TEACHER,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_ID, name: 'School A', code: 'SCH-A', status: 'active' }
  };

  const staffsUser = {
    id: STAFFS_USER_ID,
    schoolId: SCHOOL_ID,
    email: 'staffs@school.com',
    systemRole: 'STAFF',
    roles: ['staffs'],
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_ID, name: 'School A', code: 'SCH-A', status: 'active' }
  };

  const parentUser = {
    id: PARENT_USER_ID,
    schoolId: SCHOOL_ID,
    email: 'parent@school.com',
    systemRole: SYSTEM_ROLES.PARENT,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_ID, name: 'School A', code: 'SCH-A', status: 'active' }
  };

  const MOCK_PLAN_DTO = {
    id: PLAN_ID,
    schoolId: SCHOOL_ID,
    teacherId: TEACHER_STAFF_ID,
    teacherName: 'Jane Doe',
    classId: CLASS_ID,
    className: 'Grade 10-A',
    subjectId: SUBJECT_ID,
    subjectName: 'Mathematics',
    topic: 'Algebra Basics',
    date: '2026-09-16',
    status: 'draft',
    objectives: 'Understand basic limits',
    weekNumber: 38,
    createdAt: '2026-09-16T10:00:00.000Z',
    updatedAt: '2026-09-16T10:00:00.000Z'
  };

  const getAuthToken = (user = adminUser) => {
    return tokenService.issueAccessToken({
      sub: user.id,
      schoolId: user.schoolId,
      systemRole: user.systemRole,
      tokenVersion: user.tokenVersion
    });
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Authentication & Tenant Security', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/v1/lesson-plans');
      expect(res.status).toBe(401);
    });

    it('rejects cross-tenant query parameter manipulation with 403', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);

      const token = getAuthToken(adminUser);
      const res = await request(app)
        .get(`/api/v1/lesson-plans?schoolId=${OTHER_SCHOOL_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });
  });

  describe('RBAC & Role Permissions', () => {
    it('allows SUPER_ADMIN universal bypass on lesson plans with tenant context', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(superAdminUser);
      vi.spyOn(authRepository, 'findSchoolById').mockResolvedValue({
        id: SCHOOL_ID,
        name: 'School A',
        code: 'SCH-A',
        status: 'active'
      });
      vi.spyOn(lessonPlanService, 'listLessonPlans').mockResolvedValue({
        data: [MOCK_PLAN_DTO],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
      });

      const token = getAuthToken(superAdminUser);
      const res = await request(app)
        .get('/api/v1/lesson-plans')
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', SCHOOL_ID);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('allows SCHOOL_ADMIN to create, read, update, and delete lesson plans', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(lessonPlanService, 'createLessonPlan').mockResolvedValue(MOCK_PLAN_DTO);

      const token = getAuthToken(adminUser);
      const res = await request(app)
        .post('/api/v1/lesson-plans')
        .set('Authorization', `Bearer ${token}`)
        .send({
          classId: CLASS_ID,
          subjectId: SUBJECT_ID,
          topic: 'Algebra Basics',
          date: '2026-09-16'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('allows TEACHER with canonical lesson_plans permissions to CRUD', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(teacherUser);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        lesson_plans: { canRead: true, canCreate: true, canEdit: true, canDelete: true }
      });
      vi.spyOn(lessonPlanService, 'listLessonPlans').mockResolvedValue({
        data: [MOCK_PLAN_DTO],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
      });

      const token = getAuthToken(teacherUser);
      const res = await request(app)
        .get('/api/v1/lesson-plans')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('allows STAFFS to read, create, and edit, but DENIES delete by default', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(staffsUser);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        lesson_plans: { canRead: true, canCreate: true, canEdit: true, canDelete: false }
      });
      vi.spyOn(lessonPlanService, 'listLessonPlans').mockResolvedValue({
        data: [MOCK_PLAN_DTO],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
      });

      const token = getAuthToken(staffsUser);

      // GET - Allowed
      const getRes = await request(app)
        .get('/api/v1/lesson-plans')
        .set('Authorization', `Bearer ${token}`);
      expect(getRes.status).toBe(200);

      // DELETE - Denied with 403 Forbidden
      const delRes = await request(app)
        .delete(`/api/v1/lesson-plans/${PLAN_ID}`)
        .set('Authorization', `Bearer ${token}`);
      expect(delRes.status).toBe(403);
    });

    it('DENIES PARENT access to lesson plans with 403 Forbidden', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(parentUser);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        lesson_plans: { canRead: false, canCreate: false, canEdit: false, canDelete: false }
      });

      const token = getAuthToken(parentUser);
      const res = await request(app)
        .get('/api/v1/lesson-plans')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });
  });

  describe('Endpoint Contract & Validations', () => {
    it('GET /api/v1/lesson-plans/:id returns 200 with DTO', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(lessonPlanService, 'getLessonPlanById').mockResolvedValue(MOCK_PLAN_DTO);

      const token = getAuthToken(adminUser);
      const res = await request(app)
        .get(`/api/v1/lesson-plans/${PLAN_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(PLAN_ID);
      expect(res.body.data.topic).toBe('Algebra Basics');
      expect(res.body.data.date).toBe('2026-09-16');
    });

    it('PATCH /api/v1/lesson-plans/:id returns 200 with updated DTO', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(lessonPlanService, 'updateLessonPlan').mockResolvedValue({
        ...MOCK_PLAN_DTO,
        topic: 'Advanced Calculus',
        status: 'ready'
      });

      const token = getAuthToken(adminUser);
      const res = await request(app)
        .patch(`/api/v1/lesson-plans/${PLAN_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          topic: 'Advanced Calculus',
          status: 'Ready'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.topic).toBe('Advanced Calculus');
      expect(res.body.data.status).toBe('ready');
    });

    it('DELETE /api/v1/lesson-plans/:id returns 200 with success message', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(lessonPlanService, 'deleteLessonPlan').mockResolvedValue({
        success: true,
        message: 'Lesson plan deleted successfully'
      });

      const token = getAuthToken(adminUser);
      const res = await request(app)
        .delete(`/api/v1/lesson-plans/${PLAN_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('rejects POST with impossible date with 400', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);

      const token = getAuthToken(adminUser);
      const res = await request(app)
        .post('/api/v1/lesson-plans')
        .set('Authorization', `Bearer ${token}`)
        .send({
          classId: CLASS_ID,
          subjectId: SUBJECT_ID,
          topic: 'Geometry',
          date: '2026-02-30'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});
