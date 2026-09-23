import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import * as timetableService from '../../src/modules/timetables/timetable.service.js';
import * as authRepository from '../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../src/modules/auth/token.service.js';
import * as rbacService from '../../src/modules/rbac/rbac.service.js';
import { SYSTEM_ROLES } from '../../src/config/constants.js';
import { NotFoundError, ForbiddenError } from '../../src/utils/app-error.js';

describe('Security & RBAC: Timetable & Scheduling Domain (Phase T.2)', () => {
  const app = createApp();

  const TENANT_A = '11111111-1111-4111-8111-111111111111';
  const TENANT_B = '22222222-2222-4222-8222-222222222222';

  const ADMIN_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const TEACHER_USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const PARENT_USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const STUDENT_USER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const SUPER_ADMIN_USER_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

  const CLASS_ID = '33333333-3333-4333-8333-333333333333';
  const PERIOD_ID = '44444444-4444-4444-8444-444444444444';
  const SUBJECT_ID = '55555555-5555-4555-8555-555555555555';
  const TEACHER_PROFILE_ID = '66666666-6666-4666-8666-666666666666';

  const adminUser = {
    id: ADMIN_USER_ID,
    schoolId: TENANT_A,
    email: 'admin@school-a.com',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_A, name: 'School A', code: 'SchoolA', status: 'active' }
  };

  const teacherUser = {
    id: TEACHER_USER_ID,
    schoolId: TENANT_A,
    email: 'teacher@school-a.com',
    systemRole: SYSTEM_ROLES.TEACHER,
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_A, name: 'School A', code: 'SchoolA', status: 'active' }
  };

  const parentUser = {
    id: PARENT_USER_ID,
    schoolId: TENANT_A,
    email: 'parent@school-a.com',
    systemRole: SYSTEM_ROLES.PARENT,
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_A, name: 'School A', code: 'SchoolA', status: 'active' }
  };

  const studentUser = {
    id: STUDENT_USER_ID,
    schoolId: TENANT_A,
    email: 'student@school-a.com',
    systemRole: SYSTEM_ROLES.STUDENT,
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_A, name: 'School A', code: 'SchoolA', status: 'active' }
  };

  const superAdminUser = {
    id: SUPER_ADMIN_USER_ID,
    schoolId: null,
    email: 'superadmin@platform.com',
    systemRole: SYSTEM_ROLES.SUPER_ADMIN,
    tokenVersion: 1,
    isActive: true
  };

  const mockPeriod = {
    id: PERIOD_ID,
    schoolId: TENANT_A,
    classId: CLASS_ID,
    dayOfWeek: 1,
    periodNumber: 1,
    startTime: '09:00',
    endTime: '10:00',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const mockWeeklySchedule = {
    classId: CLASS_ID,
    className: 'Grade 10 - A',
    schedule: {
      Monday: [mockPeriod],
      Tuesday: [],
      Wednesday: [],
      Thursday: [],
      Friday: [],
      Saturday: []
    },
    periods: [mockPeriod]
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const getAuthToken = (user, overrides = {}) => {
    return tokenService.issueAccessToken({
      sub: user.id,
      schoolId: user.schoolId,
      systemRole: user.systemRole,
      tokenVersion: user.tokenVersion,
      ...overrides
    });
  };

  describe('1. GET /api/v1/timetables — Listing Timetable Periods', () => {
    it('returns 200 for SCHOOL_ADMIN', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(timetableService, 'listTimetables').mockResolvedValue([mockPeriod]);

      const token = getAuthToken(adminUser);
      const res = await request(app)
        .get('/api/v1/timetables')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(timetableService.listTimetables).toHaveBeenCalledWith(
        TENANT_A,
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('returns 200 for TEACHER scoped by service', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(teacherUser);
      vi.spyOn(timetableService, 'listTimetables').mockResolvedValue([mockPeriod]);

      const token = getAuthToken(teacherUser);
      const res = await request(app)
        .get('/api/v1/timetables')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('returns 200 for PARENT scoped by service', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(parentUser);
      vi.spyOn(timetableService, 'listTimetables').mockResolvedValue([mockPeriod]);

      const token = getAuthToken(parentUser);
      const res = await request(app)
        .get('/api/v1/timetables')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });

    it('returns 200 for STUDENT scoped by service', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(studentUser);
      vi.spyOn(timetableService, 'listTimetables').mockResolvedValue([mockPeriod]);

      const token = getAuthToken(studentUser);
      const res = await request(app)
        .get('/api/v1/timetables')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });

    it('rejects unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/v1/timetables');
      expect(res.status).toBe(401);
    });
  });

  describe('2. GET /api/v1/timetables/classes/:classId — Class Timetable', () => {
    it('returns 200 and weekly schedule for SCHOOL_ADMIN', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(timetableService, 'getClassTimetable').mockResolvedValue(mockWeeklySchedule);

      const token = getAuthToken(adminUser);
      const res = await request(app)
        .get(`/api/v1/timetables/classes/${CLASS_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.classId).toBe(CLASS_ID);
      expect(timetableService.getClassTimetable).toHaveBeenCalledWith(
        TENANT_A,
        CLASS_ID,
        expect.any(Object)
      );
    });

    it('returns 404 when Parent tries to access class of unlinked student', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(parentUser);
      vi.spyOn(timetableService, 'getClassTimetable').mockRejectedValue(
        new NotFoundError('Class not found for active school')
      );

      const token = getAuthToken(parentUser);
      const res = await request(app)
        .get(`/api/v1/timetables/classes/${CLASS_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });

  describe('3. PUT /api/v1/timetables/classes/:classId — Batch Replace Class Timetable', () => {
    it('returns 200 for SCHOOL_ADMIN with valid weekly payload', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(timetableService, 'replaceClassTimetable').mockResolvedValue(mockWeeklySchedule);

      const token = getAuthToken(adminUser);
      const res = await request(app)
        .put(`/api/v1/timetables/classes/${CLASS_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          schedule: {
            Monday: [
              {
                startTime: '09:00',
                endTime: '10:00',
                subjectId: SUBJECT_ID
              }
            ]
          }
        });

      expect(res.status).toBe(200);
      expect(res.body.data.classId).toBe(CLASS_ID);
      expect(timetableService.replaceClassTimetable).toHaveBeenCalledWith(
        TENANT_A,
        CLASS_ID,
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('rejects TEACHER with 403', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(teacherUser);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        timetables: { canRead: true, canCreate: false, canEdit: false, canDelete: false }
      });

      const token = getAuthToken(teacherUser);
      const res = await request(app)
        .put(`/api/v1/timetables/classes/${CLASS_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ schedule: { Monday: [] } });

      expect(res.status).toBe(403);
    });

    it('rejects PARENT and STUDENT with 403', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(parentUser);
      const pToken = getAuthToken(parentUser);
      const resP = await request(app)
        .put(`/api/v1/timetables/classes/${CLASS_ID}`)
        .set('Authorization', `Bearer ${pToken}`)
        .send({ schedule: { Monday: [] } });
      expect(resP.status).toBe(403);

      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(studentUser);
      const sToken = getAuthToken(studentUser);
      const resS = await request(app)
        .put(`/api/v1/timetables/classes/${CLASS_ID}`)
        .set('Authorization', `Bearer ${sToken}`)
        .send({ schedule: { Monday: [] } });
      expect(resS.status).toBe(403);
    });
  });

  describe('4. POST / PATCH / DELETE /api/v1/timetables — Single Period CRUD', () => {
    it('creates period (POST 201) for SCHOOL_ADMIN', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(timetableService, 'createTimetablePeriod').mockResolvedValue(mockPeriod);

      const token = getAuthToken(adminUser);
      const res = await request(app)
        .post('/api/v1/timetables')
        .set('Authorization', `Bearer ${token}`)
        .send({
          classId: CLASS_ID,
          dayOfWeek: 1,
          startTime: '09:00',
          endTime: '10:00'
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBe(PERIOD_ID);
    });

    it('updates period (PATCH 200) for SCHOOL_ADMIN', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(timetableService, 'updateTimetablePeriod').mockResolvedValue({
        ...mockPeriod,
        startTime: '09:30'
      });

      const token = getAuthToken(adminUser);
      const res = await request(app)
        .patch(`/api/v1/timetables/${PERIOD_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ startTime: '09:30' });

      expect(res.status).toBe(200);
      expect(res.body.data.startTime).toBe('09:30');
    });

    it('deletes period (DELETE 200) for SCHOOL_ADMIN', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(timetableService, 'deleteTimetablePeriod').mockResolvedValue({
        message: 'Timetable period deleted successfully',
        id: PERIOD_ID
      });

      const token = getAuthToken(adminUser);
      const res = await request(app)
        .delete(`/api/v1/timetables/${PERIOD_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(PERIOD_ID);
    });

    it('rejects TEACHER writes with 403', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(teacherUser);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        timetables: { canRead: true, canCreate: false, canEdit: false, canDelete: false }
      });

      const token = getAuthToken(teacherUser);

      const resPost = await request(app)
        .post('/api/v1/timetables')
        .set('Authorization', `Bearer ${token}`)
        .send({ classId: CLASS_ID, dayOfWeek: 1, startTime: '09:00', endTime: '10:00' });
      expect(resPost.status).toBe(403);

      const resPatch = await request(app)
        .patch(`/api/v1/timetables/${PERIOD_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ startTime: '09:30' });
      expect(resPatch.status).toBe(403);

      const resDelete = await request(app)
        .delete(`/api/v1/timetables/${PERIOD_ID}`)
        .set('Authorization', `Bearer ${token}`);
      expect(resDelete.status).toBe(403);
    });
  });

  describe('5. GET /api/v1/timetables/my-schedule — Teacher Self-Schedule', () => {
    it('returns 200 for authenticated teacher with subject and class schedules', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(teacherUser);
      vi.spyOn(timetableService, 'getMySchedule').mockResolvedValue({
        teacherId: TEACHER_PROFILE_ID,
        teacherName: 'Jane Doe',
        isClassTeacher: true,
        assignedClassId: CLASS_ID,
        assignedClassName: 'Grade 10 - A',
        subjectSchedule: { Monday: [mockPeriod] },
        classSchedule: { Monday: [mockPeriod] },
        subjectPeriods: [mockPeriod],
        classPeriods: [mockPeriod]
      });

      const token = getAuthToken(teacherUser);
      const res = await request(app)
        .get('/api/v1/timetables/my-schedule')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.teacherId).toBe(TEACHER_PROFILE_ID);
      expect(res.body.data.isClassTeacher).toBe(true);
      expect(timetableService.getMySchedule).toHaveBeenCalledWith(TENANT_A, expect.any(Object));
    });

    it('returns 403 if teacher staff profile is inactive or not found', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(teacherUser);
      vi.spyOn(timetableService, 'getMySchedule').mockRejectedValue(
        new ForbiddenError('Staff profile not found for authenticated teacher')
      );

      const token = getAuthToken(teacherUser);
      const res = await request(app)
        .get('/api/v1/timetables/my-schedule')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });
  });

  describe('6. Tenant Isolation & Cross-Tenant Attack Surface', () => {
    it('rejects cross-tenant period update with 404 (does not leak period in Tenant B)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(timetableService, 'updateTimetablePeriod').mockRejectedValue(
        new NotFoundError('Timetable period not found for active school')
      );

      const token = getAuthToken(adminUser);
      const res = await request(app)
        .patch(`/api/v1/timetables/${PERIOD_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ startTime: '09:30' });

      expect(res.status).toBe(404);
    });

    it('rejects cross-tenant period delete with 404', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(timetableService, 'deleteTimetablePeriod').mockRejectedValue(
        new NotFoundError('Timetable period not found for active school')
      );

      const token = getAuthToken(adminUser);
      const res = await request(app)
        .delete(`/api/v1/timetables/${PERIOD_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });
});
