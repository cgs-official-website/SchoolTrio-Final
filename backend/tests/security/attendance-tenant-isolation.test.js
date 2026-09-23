import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import * as attendanceService from '../../src/modules/attendance/attendance.service.js';
import * as authRepository from '../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../src/modules/auth/token.service.js';
import { SYSTEM_ROLES } from '../../src/config/constants.js';

describe('Security: Attendance Domain Tenant Isolation & Authorization — Phase 4C.5', () => {
  const app = createApp();
  const TENANT_A = '11111111-1111-4111-8111-111111111111';
  const TENANT_B = '22222222-2222-4222-8222-222222222222';
  const SESSION_A = '33333333-3333-4333-8333-333333333333';
  const CLASS_A = '44444444-4444-4444-8444-444444444444';
  const STUDENT_A = '55555555-5555-4555-8555-555555555555';
  const STUDENT_B = '66666666-6666-4666-8666-666666666666';

  const ADMIN_A_ID = '77777777-7777-4777-8777-777777777777';
  const ADMIN_B_ID = '88888888-8888-4888-8888-888888888888';
  const TEACHER_A_ID = '99999999-9999-4999-8999-999999999999';
  const PARENT_A_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  const adminTenantA = {
    id: ADMIN_A_ID,
    schoolId: TENANT_A,
    email: 'admin@tenanta.edu',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_A, name: 'Tenant A School', code: 'SchoolA', status: 'active' }
  };

  const adminTenantB = {
    id: ADMIN_B_ID,
    schoolId: TENANT_B,
    email: 'admin@tenantb.edu',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_B, name: 'Tenant B School', code: 'SchoolB', status: 'active' }
  };

  const teacherTenantA = {
    id: TEACHER_A_ID,
    schoolId: TENANT_A,
    email: 'teacher@tenanta.edu',
    systemRole: SYSTEM_ROLES.TEACHER,
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_A, name: 'Tenant A School', code: 'SchoolA', status: 'active' }
  };

  const parentTenantA = {
    id: PARENT_A_ID,
    schoolId: TENANT_A,
    email: 'parent@tenanta.edu',
    systemRole: SYSTEM_ROLES.PARENT,
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_A, name: 'Tenant A School', code: 'SchoolA', status: 'active' }
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const getAuthToken = (user) => {
    return tokenService.issueAccessToken({
      sub: user.id,
      schoolId: user.schoolId,
      systemRole: user.systemRole,
      tokenVersion: user.tokenVersion
    });
  };

  describe('1. Cross-Tenant Session Isolation', () => {
    it('returns 404 when Tenant B attempts to read an attendance session from Tenant A', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminTenantB);
      vi.spyOn(attendanceService, 'getSessionById').mockImplementation(async (schoolId, id) => {
        if (schoolId === TENANT_A && id === SESSION_A) {
          return { id: SESSION_A, schoolId: TENANT_A };
        }
        const err = new Error('Attendance session not found');
        err.statusCode = 404;
        throw err;
      });

      const tokenB = getAuthToken(adminTenantB);
      const res = await request(app)
        .get(`/api/v1/attendance/sessions/${SESSION_A}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 404 when Tenant B attempts to delete an attendance session from Tenant A', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminTenantB);
      vi.spyOn(attendanceService, 'deleteAttendanceSession').mockImplementation(async (schoolId) => {
        if (schoolId !== TENANT_A) {
          const err = new Error('Attendance session not found');
          err.statusCode = 404;
          throw err;
        }
        return null;
      });

      const tokenB = getAuthToken(adminTenantB);
      const res = await request(app)
        .delete(`/api/v1/attendance/sessions/${SESSION_A}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('2. Parameter & Body Poisoning Prevention', () => {
    it('rejects cross-tenant schoolId injection in POST /sessions body', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminTenantA);

      const tokenA = getAuthToken(adminTenantA);
      const res = await request(app)
        .post('/api/v1/attendance/sessions')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          schoolId: TENANT_B, // Injected foreign tenant
          classId: CLASS_A,
          date: '2026-09-05',
          records: [{ studentId: STUDENT_A, status: 'Present' }]
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('rejects cross-tenant schoolId injection in query string', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminTenantA);

      const tokenA = getAuthToken(adminTenantA);
      const res = await request(app)
        .get(`/api/v1/attendance/sessions?schoolId=${TENANT_B}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('3. Teacher Class Authorization & Privilege Separation', () => {
    it('denies teacher from submitting attendance for unassigned class with 403', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(teacherTenantA);
      vi.spyOn(attendanceService, 'submitAttendanceSession').mockImplementation(async () => {
        const err = new Error('You are not authorized to record attendance for this class');
        err.statusCode = 403;
        throw err;
      });

      const tokenTeacher = getAuthToken(teacherTenantA);
      const res = await request(app)
        .post('/api/v1/attendance/sessions')
        .set('Authorization', `Bearer ${tokenTeacher}`)
        .send({
          classId: CLASS_A,
          date: '2026-09-05',
          records: [{ studentId: STUDENT_A, status: 'Present' }]
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('denies teacher from deleting an attendance session with 403 Forbidden', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(teacherTenantA);

      const tokenTeacher = getAuthToken(teacherTenantA);
      const res = await request(app)
        .delete(`/api/v1/attendance/sessions/${SESSION_A}`)
        .set('Authorization', `Bearer ${tokenTeacher}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('4. Parent Probing & Authorization', () => {
    it('denies parent from accessing attendance of an unlinked student with 403', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(parentTenantA);
      vi.spyOn(attendanceService, 'getStudentAttendance').mockImplementation(async () => {
        const err = new Error('You are not authorized to view attendance for this student');
        err.statusCode = 403;
        throw err;
      });

      const tokenParent = getAuthToken(parentTenantA);
      const res = await request(app)
        .get(`/api/v1/attendance/students/${STUDENT_B}`)
        .set('Authorization', `Bearer ${tokenParent}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });
});
