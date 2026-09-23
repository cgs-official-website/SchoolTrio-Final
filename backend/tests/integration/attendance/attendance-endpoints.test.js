import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import * as attendanceService from '../../../src/modules/attendance/attendance.service.js';
import * as authRepository from '../../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../../src/modules/auth/token.service.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';
import { NotFoundError } from '../../../src/utils/app-error.js';

describe('Integration: Attendance Endpoints — Phase 4C.5', () => {
  const app = createApp();
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const CLASS_ID = '22222222-2222-4222-8222-222222222222';
  const SESSION_ID = '44444444-4444-4444-8444-444444444444';
  const STUDENT_ID = '55555555-5555-4555-8555-555555555555';
  const FLAG_ID = '66666666-6666-4666-8666-666666666666';

  const ADMIN_USER_ID = '77777777-7777-4777-8777-777777777777';
  const TEACHER_USER_ID = '88888888-8888-4888-8888-888888888888';
  const PARENT_USER_ID = '99999999-9999-4999-8999-999999999999';

  const mockAdminUser = {
    id: ADMIN_USER_ID,
    schoolId: SCHOOL_ID,
    email: 'admin@school.edu',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_ID, name: 'Spring Mount', code: 'SchoolS024', status: 'active' }
  };

  const mockTeacherUser = {
    id: TEACHER_USER_ID,
    schoolId: SCHOOL_ID,
    email: 'teacher@school.edu',
    systemRole: SYSTEM_ROLES.TEACHER,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_ID, name: 'Spring Mount', code: 'SchoolS024', status: 'active' }
  };

  const mockParentUser = {
    id: PARENT_USER_ID,
    schoolId: SCHOOL_ID,
    email: 'parent@school.edu',
    systemRole: SYSTEM_ROLES.PARENT,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_ID, name: 'Spring Mount', code: 'SchoolS024', status: 'active' }
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const getAuthToken = (user = mockAdminUser) => {
    return tokenService.issueAccessToken({
      sub: user.id,
      schoolId: user.schoolId,
      systemRole: user.systemRole,
      tokenVersion: user.tokenVersion
    });
  };

  describe('1. GET /api/v1/attendance/dashboard-stats', () => {
    it('returns daily dashboard stats for school', async () => {
      const mockStats = {
        date: '2026-09-05',
        totalClasses: 10,
        markedClasses: 8,
        pendingClasses: 2,
        present: 180,
        absent: 15,
        late: 5,
        percentage: 92.5
      };

      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(attendanceService, 'getDashboardStats').mockResolvedValue(mockStats);

      const token = getAuthToken();
      const res = await request(app)
        .get('/api/v1/attendance/dashboard-stats?date=2026-09-05')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.markedClasses).toBe(8);
    });
  });

  describe('2. GET /api/v1/attendance/sessions', () => {
    it('returns paginated list of attendance sessions', async () => {
      const mockSessions = [
        { id: SESSION_ID, classId: CLASS_ID, date: '2026-09-05', session: 'STANDARD', _count: { records: 30 } }
      ];
      const mockPagination = { total: 1, page: 1, limit: 20, totalPages: 1 };

      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(attendanceService, 'listSessions').mockResolvedValue({ sessions: mockSessions, pagination: mockPagination });

      const token = getAuthToken();
      const res = await request(app)
        .get('/api/v1/attendance/sessions')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('3. GET /api/v1/attendance/sessions/:id', () => {
    it('returns single attendance session details with student records', async () => {
      const mockSession = {
        id: SESSION_ID,
        schoolId: SCHOOL_ID,
        classId: CLASS_ID,
        date: '2026-09-05',
        session: 'STANDARD',
        records: [{ id: 'rec-1', studentId: STUDENT_ID, status: 'Present' }]
      };

      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(attendanceService, 'getSessionById').mockResolvedValue(mockSession);

      const token = getAuthToken();
      const res = await request(app)
        .get(`/api/v1/attendance/sessions/${SESSION_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(SESSION_ID);
    });

    it('returns 404 when session not found', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(attendanceService, 'getSessionById').mockRejectedValue(new NotFoundError('Attendance session'));

      const token = getAuthToken();
      const res = await request(app)
        .get(`/api/v1/attendance/sessions/${SESSION_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('4. POST /api/v1/attendance/sessions', () => {
    it('submits attendance session successfully with 201 Created', async () => {
      const payload = {
        classId: CLASS_ID,
        date: '2026-09-05',
        session: 'STANDARD',
        records: [{ studentId: STUDENT_ID, status: 'Present' }]
      };
      const createdObj = { id: SESSION_ID, classId: CLASS_ID, date: '2026-09-05' };

      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(attendanceService, 'submitAttendanceSession').mockResolvedValue(createdObj);

      const token = getAuthToken();
      const res = await request(app)
        .post('/api/v1/attendance/sessions')
        .set('Authorization', `Bearer ${token}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(SESSION_ID);
    });

    it('returns 400 when validation fails (e.g. empty records)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);

      const token = getAuthToken();
      const res = await request(app)
        .post('/api/v1/attendance/sessions')
        .set('Authorization', `Bearer ${token}`)
        .send({ classId: CLASS_ID, date: '2026-09-05', records: [] });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('5. PATCH /api/v1/attendance/sessions/:id', () => {
    it('updates attendance records in an existing session', async () => {
      const updatedObj = { id: SESSION_ID, classId: CLASS_ID };

      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(attendanceService, 'updateAttendanceSession').mockResolvedValue(updatedObj);

      const token = getAuthToken();
      const res = await request(app)
        .patch(`/api/v1/attendance/sessions/${SESSION_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ records: [{ studentId: STUDENT_ID, status: 'Late', remark: 'Traffic' }] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(SESSION_ID);
    });
  });

  describe('6. DELETE /api/v1/attendance/sessions/:id', () => {
    it('allows Admin to delete session', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(attendanceService, 'deleteAttendanceSession').mockResolvedValue(null);

      const token = getAuthToken();
      const res = await request(app)
        .delete(`/api/v1/attendance/sessions/${SESSION_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('deleted');
    });

    it('rejects Teacher from deleting session with 403 Forbidden', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockTeacherUser);

      const token = getAuthToken(mockTeacherUser);
      const res = await request(app)
        .delete(`/api/v1/attendance/sessions/${SESSION_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('7. GET /api/v1/attendance/students/:studentId', () => {
    it('allows linked Parent to read child attendance', async () => {
      const mockResult = {
        student: { id: STUDENT_ID, firstName: 'Alice' },
        stats: { totalDays: 20, presentDays: 18, absentDays: 2, lateDays: 0, percentage: 90 },
        records: []
      };

      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockParentUser);
      vi.spyOn(attendanceService, 'getStudentAttendance').mockResolvedValue(mockResult);

      const token = getAuthToken(mockParentUser);
      const res = await request(app)
        .get(`/api/v1/attendance/students/${STUDENT_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.student.id).toBe(STUDENT_ID);
    });
  });

  describe('8. GET /api/v1/attendance/absentee-flags', () => {
    it('returns paginated absentee flags', async () => {
      const mockFlags = [{ id: FLAG_ID, studentId: STUDENT_ID, month: '2026-09', absentCount: 3, isResolved: false }];
      const mockPagination = { total: 1, page: 1, limit: 20, totalPages: 1 };

      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(attendanceService, 'listAbsenteeFlags').mockResolvedValue({ flags: mockFlags, pagination: mockPagination });

      const token = getAuthToken();
      const res = await request(app)
        .get('/api/v1/attendance/absentee-flags?month=2026-09')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('9. PATCH /api/v1/attendance/absentee-flags/:id/resolve', () => {
    it('resolves an absentee flag with resolution notes', async () => {
      const mockResolvedFlag = { id: FLAG_ID, isResolved: true, resolutionNotes: 'Medical leave approved' };

      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(attendanceService, 'resolveAbsenteeFlag').mockResolvedValue(mockResolvedFlag);

      const token = getAuthToken();
      const res = await request(app)
        .patch(`/api/v1/attendance/absentee-flags/${FLAG_ID}/resolve`)
        .set('Authorization', `Bearer ${token}`)
        .send({ isResolved: true, resolutionNotes: 'Medical leave approved' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isResolved).toBe(true);
    });
  });
});
