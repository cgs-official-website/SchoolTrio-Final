import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import * as lessonPlanService from '../../src/modules/lesson-plans/lesson-plan.service.js';
import * as authRepository from '../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../src/modules/auth/token.service.js';
import * as rbacService from '../../src/modules/rbac/rbac.service.js';
import { SYSTEM_ROLES } from '../../src/config/constants.js';

describe('Security: Lesson Plans Multi-Tenant & RBAC Custody Isolation', () => {
  const app = createApp();

  const SCHOOL_A = '11111111-1111-4111-8111-111111111111';
  const SCHOOL_B = '22222222-2222-4222-8222-222222222222';
  const PLAN_A_ID = '33333333-3333-4333-8333-333333333333';

  const teacherUserB = {
    id: 'user-teacher-b',
    schoolId: SCHOOL_B,
    email: 'teacher.b@school-b.com',
    systemRole: SYSTEM_ROLES.TEACHER,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_B, name: 'School B', code: 'SCH-B', status: 'active' }
  };

  const parentUserA = {
    id: 'user-parent-a',
    schoolId: SCHOOL_A,
    email: 'parent.a@school-a.com',
    systemRole: SYSTEM_ROLES.PARENT,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_A, name: 'School A', code: 'SCH-A', status: 'active' }
  };

  const studentUserA = {
    id: 'user-student-a',
    schoolId: SCHOOL_A,
    email: 'student.a@school-a.com',
    systemRole: SYSTEM_ROLES.STUDENT,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_A, name: 'School A', code: 'SCH-A', status: 'active' }
  };

  const staffsUserA = {
    id: 'user-staffs-a',
    schoolId: SCHOOL_A,
    email: 'staffs.a@school-a.com',
    systemRole: 'STAFF',
    roles: ['staffs'],
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_A, name: 'School A', code: 'SCH-A', status: 'active' }
  };

  const adminUserA = {
    id: 'user-admin-a',
    schoolId: SCHOOL_A,
    email: 'admin.a@school-a.com',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_A, name: 'School A', code: 'SCH-A', status: 'active' }
  };

  const getAuthToken = user => {
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

  describe('A. Authentication Security', () => {
    it('blocks unauthenticated requests to all endpoints', async () => {
      const getRes = await request(app).get('/api/v1/lesson-plans');
      expect(getRes.status).toBe(401);

      const postRes = await request(app).post('/api/v1/lesson-plans').send({});
      expect(postRes.status).toBe(401);

      const patchRes = await request(app).patch(`/api/v1/lesson-plans/${PLAN_A_ID}`).send({});
      expect(patchRes.status).toBe(401);

      const deleteRes = await request(app).delete(`/api/v1/lesson-plans/${PLAN_A_ID}`);
      expect(deleteRes.status).toBe(401);
    });
  });

  describe('B. Cross-Tenant Isolation', () => {
    it('blocks School B teacher from accessing School A lesson plan endpoints via header/query poisoning', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(teacherUserB);

      const tokenB = getAuthToken(teacherUserB);
      const res = await request(app)
        .get(`/api/v1/lesson-plans?schoolId=${SCHOOL_A}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(403);
    });
  });

  describe('C. Role Access Controls', () => {
    it('blocks PARENT from any lesson plan endpoint', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(parentUserA);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        lesson_plans: { canRead: false, canCreate: false, canEdit: false, canDelete: false }
      });

      const token = getAuthToken(parentUserA);
      const res = await request(app)
        .get('/api/v1/lesson-plans')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('blocks STUDENT from any lesson plan endpoint', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(studentUserA);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        lesson_plans: { canRead: false, canCreate: false, canEdit: false, canDelete: false }
      });

      const token = getAuthToken(studentUserA);
      const res = await request(app)
        .get('/api/v1/lesson-plans')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('allows STAFFS to read, create, edit, but denies delete by default', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(staffsUserA);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        lesson_plans: { canRead: true, canCreate: true, canEdit: true, canDelete: false }
      });
      vi.spyOn(lessonPlanService, 'listLessonPlans').mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 1 }
      });

      const token = getAuthToken(staffsUserA);

      const getRes = await request(app)
        .get('/api/v1/lesson-plans')
        .set('Authorization', `Bearer ${token}`);
      expect(getRes.status).toBe(200);

      const delRes = await request(app)
        .delete(`/api/v1/lesson-plans/${PLAN_A_ID}`)
        .set('Authorization', `Bearer ${token}`);
      expect(delRes.status).toBe(403);
    });

    it('allows SCHOOL_ADMIN tenant-wide access to all operations', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUserA);
      vi.spyOn(lessonPlanService, 'listLessonPlans').mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 1 }
      });

      const token = getAuthToken(adminUserA);
      const res = await request(app)
        .get('/api/v1/lesson-plans')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });
  });
});
