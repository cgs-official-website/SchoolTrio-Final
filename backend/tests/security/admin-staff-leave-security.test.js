import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import * as leaveService from '../../src/modules/leaves/leave.service.js';
import * as authRepository from '../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../src/modules/auth/token.service.js';
import { SYSTEM_ROLES } from '../../src/config/constants.js';
import { NotFoundError, ConflictError, ForbiddenError } from '../../src/utils/app-error.js';

describe('Security: Admin & Staff Leave Applications Domain (Phase L.1)', () => {
  const app = createApp();

  const TENANT_A = '11111111-1111-4111-8111-111111111111';
  const TENANT_B = '22222222-2222-4222-8222-222222222222';

  const ADMIN_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const TEACHER_USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const LEAVE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

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

  describe('1. Admin Tenant-Wide Leave Listing & Retrieval', () => {
    it('returns 200 and paginated leaves for School Admin', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(leaveService, 'listTenantLeaves').mockResolvedValue({
        leaves: [
          {
            id: LEAVE_ID,
            applicantName: 'Teacher Jane',
            applicantRole: 'teacher',
            leaveType: 'Annual Leave',
            status: 'Pending'
          }
        ],
        pagination: { page: 1, limit: 50, total: 1, totalPages: 1 }
      });

      const token = getAuthToken(adminUser);
      const res = await request(app)
        .get('/api/v1/leaves')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });

    it('returns 200 for single leave detail', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(leaveService, 'getLeaveById').mockResolvedValue({
        id: LEAVE_ID,
        applicantName: 'Teacher Jane',
        applicantRole: 'teacher',
        leaveType: 'Annual Leave',
        status: 'Pending'
      });

      const token = getAuthToken(adminUser);
      const res = await request(app)
        .get(`/api/v1/leaves/${LEAVE_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(LEAVE_ID);
    });

    it('returns 404 when leave not found in tenant', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(leaveService, 'getLeaveById').mockRejectedValue(new NotFoundError('LeaveApplication'));

      const token = getAuthToken(adminUser);
      const res = await request(app)
        .get(`/api/v1/leaves/${LEAVE_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('2. Admin Leave Status Transition & Concurrency', () => {
    it('returns 200 when admin approves pending leave', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(leaveService, 'updateLeaveStatus').mockResolvedValue({
        id: LEAVE_ID,
        status: 'Approved'
      });

      const token = getAuthToken(adminUser);
      const res = await request(app)
        .patch(`/api/v1/leaves/${LEAVE_ID}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'Approved' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('Approved');
    });

    it('returns 409 Conflict when leave has already been processed by another reviewer', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(leaveService, 'updateLeaveStatus').mockRejectedValue(
        new ConflictError('Leave request has already been reviewed')
      );

      const token = getAuthToken(adminUser);
      const res = await request(app)
        .patch(`/api/v1/leaves/${LEAVE_ID}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'Approved' });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('already been reviewed');
    });

    it('returns 400 when invalid status transition is requested', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);

      const token = getAuthToken(adminUser);
      const res = await request(app)
        .patch(`/api/v1/leaves/${LEAVE_ID}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'Pending' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('3. Admin Leave Deletion', () => {
    it('returns 200 when admin deletes leave', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(leaveService, 'deleteLeave').mockResolvedValue({ id: LEAVE_ID, deleted: true });

      const token = getAuthToken(adminUser);
      const res = await request(app)
        .delete(`/api/v1/leaves/${LEAVE_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.deleted).toBe(true);
    });
  });

  const PARENT_USER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const STUDENT_USER_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const TENANT_USER_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  const SUPER_ADMIN_USER_ID = '99999999-9999-4999-8999-999999999999';

  const parentUser = {
    id: PARENT_USER_ID,
    schoolId: TENANT_A,
    email: 'parent@home.com',
    systemRole: SYSTEM_ROLES.PARENT,
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_A, name: 'School A', code: 'SchoolA', status: 'active' }
  };

  const studentUser = {
    id: STUDENT_USER_ID,
    schoolId: TENANT_A,
    email: 'student@school.com',
    systemRole: SYSTEM_ROLES.STUDENT,
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_A, name: 'School A', code: 'SchoolA', status: 'active' }
  };

  const tenantUser = {
    id: TENANT_USER_ID,
    schoolId: TENANT_A,
    email: 'guest@school.com',
    systemRole: SYSTEM_ROLES.TENANT_USER,
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

  describe('4. Staff Self-Service Leave Endpoints & RBAC Gates', () => {
    it('returns 200 and staff leaves for authenticated staff member', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(teacherUser);
      vi.spyOn(leaveService, 'getStaffLeaves').mockResolvedValue({
        leaves: [
          {
            id: LEAVE_ID,
            leaveType: 'Annual Leave',
            status: 'Pending'
          }
        ],
        pagination: { page: 1, limit: 50, total: 1 }
      });

      const token = getAuthToken(teacherUser);
      const res = await request(app)
        .get('/api/v1/staff/me/leaves')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });

    it('rejects PARENT user from accessing GET /api/v1/staff/me/leaves with 403 Forbidden', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(parentUser);

      const token = getAuthToken(parentUser);
      const res = await request(app)
        .get('/api/v1/staff/me/leaves')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('rejects STUDENT user from accessing GET /api/v1/staff/me/leaves with 403 Forbidden', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(studentUser);

      const token = getAuthToken(studentUser);
      const res = await request(app)
        .get('/api/v1/staff/me/leaves')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('rejects TENANT_USER from accessing GET /api/v1/staff/me/leaves with 403 Forbidden', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(tenantUser);

      const token = getAuthToken(tenantUser);
      const res = await request(app)
        .get('/api/v1/staff/me/leaves')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('rejects PARENT user from submitting POST /api/v1/staff/me/leaves with 403 Forbidden', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(parentUser);

      const token = getAuthToken(parentUser);
      const res = await request(app)
        .post('/api/v1/staff/me/leaves')
        .set('Authorization', `Bearer ${token}`)
        .send({
          leaveType: 'Sick Leave',
          startDate: '2026-10-01',
          endDate: '2026-10-02',
          reason: 'Fever'
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('rejects STUDENT user from submitting POST /api/v1/staff/me/leaves with 403 Forbidden', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(studentUser);

      const token = getAuthToken(studentUser);
      const res = await request(app)
        .post('/api/v1/staff/me/leaves')
        .set('Authorization', `Bearer ${token}`)
        .send({
          leaveType: 'Sick Leave',
          startDate: '2026-10-01',
          endDate: '2026-10-02',
          reason: 'Fever'
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('returns 201 when staff submits leave and forces server-derived identity', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(teacherUser);
      let capturedPayload = null;
      vi.spyOn(leaveService, 'createStaffLeave').mockImplementation(async (schoolId, user, payload) => {
        capturedPayload = { schoolId, payload, user };
        return {
          id: LEAVE_ID,
          leaveType: payload.leaveType,
          status: 'Pending'
        };
      });

      const token = getAuthToken(teacherUser);
      const res = await request(app)
        .post('/api/v1/staff/me/leaves')
        .set('Authorization', `Bearer ${token}`)
        .send({
          leaveType: 'Sick Leave',
          startDate: '2026-10-01',
          endDate: '2026-10-02',
          reason: 'Fever',
          status: 'Approved', // Spoof attempt
          applicantId: '00000000-0000-0000-0000-000000000000' // Spoof attempt
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('Pending');
      expect(capturedPayload.schoolId).toBe(TENANT_A);
      expect(capturedPayload.payload.status).toBeUndefined();
      expect(capturedPayload.payload.applicantId).toBeUndefined();
    });

    it('allows SUPER_ADMIN to pass RBAC gate with target tenant header', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(superAdminUser);
      vi.spyOn(authRepository, 'findSchoolById').mockResolvedValue({ id: TENANT_A, name: 'School A', status: 'active' });
      vi.spyOn(leaveService, 'getStaffLeaves').mockResolvedValue({
        leaves: [],
        pagination: { page: 1, limit: 50, total: 0 }
      });

      const token = getAuthToken(superAdminUser, { schoolId: TENANT_A });
      const res = await request(app)
        .get('/api/v1/staff/me/leaves')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Tenant-Id', TENANT_A);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
