import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import * as leaveService from '../../src/modules/leaves/leave.service.js';
import * as authRepository from '../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../src/modules/auth/token.service.js';
import * as rbacService from '../../src/modules/rbac/rbac.service.js';
import { SYSTEM_ROLES } from '../../src/config/constants.js';
import { NotFoundError } from '../../src/utils/app-error.js';

describe('Security: Leave Approval Rules Domain (Phase L.2)', () => {
  const app = createApp();

  const TENANT_A = '11111111-1111-4111-8111-111111111111';
  const TENANT_B = '22222222-2222-4222-8222-222222222222';

  const ADMIN_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const TEACHER_USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const PARENT_USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const STUDENT_USER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const SUPER_ADMIN_USER_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

  const ROLE_ID = '77777777-7777-4777-8777-777777777777';
  const RULE_ID = '88888888-8888-4888-8888-888888888888';

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

  const mockRule = {
    id: RULE_ID,
    schoolId: TENANT_A,
    roleId: ROLE_ID,
    minDays: 1,
    maxDays: 3,
    order: 1,
    role: { id: ROLE_ID, name: 'Principal', slug: 'principal' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
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

  describe('1. GET /api/v1/leaves/rules — Listing Approval Rules', () => {
    it('returns 200 and rules list for SCHOOL_ADMIN', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(leaveService, 'listLeaveApprovalRules').mockResolvedValue([mockRule]);

      const token = getAuthToken(adminUser);
      const res = await request(app)
        .get('/api/v1/leaves/rules')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe(RULE_ID);
      expect(leaveService.listLeaveApprovalRules).toHaveBeenCalledWith(TENANT_A);
    });

    it('returns 200 for SUPER_ADMIN with active tenant header', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(superAdminUser);
      vi.spyOn(authRepository, 'findSchoolById').mockResolvedValue({ id: TENANT_A, name: 'School A', status: 'active' });
      vi.spyOn(leaveService, 'listLeaveApprovalRules').mockResolvedValue([mockRule]);

      const token = getAuthToken(superAdminUser, { schoolId: TENANT_A });
      const res = await request(app)
        .get('/api/v1/leaves/rules')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Tenant-Id', TENANT_A);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(leaveService.listLeaveApprovalRules).toHaveBeenCalledWith(TENANT_A);
    });

    it('rejects TEACHER with 403 if leaves.read is not granted', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(teacherUser);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        leaves: { canRead: false, canCreate: false, canEdit: false, canDelete: false }
      });

      const token = getAuthToken(teacherUser);
      const res = await request(app)
        .get('/api/v1/leaves/rules')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('rejects PARENT and STUDENT with 403', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(parentUser);
      const parentToken = getAuthToken(parentUser);
      const resParent = await request(app)
        .get('/api/v1/leaves/rules')
        .set('Authorization', `Bearer ${parentToken}`);
      expect(resParent.status).toBe(403);

      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(studentUser);
      const studentToken = getAuthToken(studentUser);
      const resStudent = await request(app)
        .get('/api/v1/leaves/rules')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(resStudent.status).toBe(403);
    });

    it('rejects unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/v1/leaves/rules');
      expect(res.status).toBe(401);
    });
  });

  describe('2. POST /api/v1/leaves/rules — Creating Approval Rules', () => {
    it('returns 201 for SCHOOL_ADMIN with valid payload', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(leaveService, 'createLeaveApprovalRule').mockResolvedValue(mockRule);

      const token = getAuthToken(adminUser);
      const res = await request(app)
        .post('/api/v1/leaves/rules')
        .set('Authorization', `Bearer ${token}`)
        .send({
          minDays: 1,
          maxDays: 3,
          roleId: ROLE_ID,
          order: 1
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(RULE_ID);
      expect(leaveService.createLeaveApprovalRule).toHaveBeenCalledWith(
        TENANT_A,
        expect.objectContaining({ minDays: 1, maxDays: 3, roleId: ROLE_ID, order: 1 }),
        expect.any(Object)
      );
    });

    it('rejects creation with 400 when maxDays < minDays', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);

      const token = getAuthToken(adminUser);
      const res = await request(app)
        .post('/api/v1/leaves/rules')
        .set('Authorization', `Bearer ${token}`)
        .send({
          minDays: 5,
          maxDays: 2,
          roleId: ROLE_ID
        });

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain('maxDays cannot be less than minDays');
    });

    it('rejects creation with 404 when role does not exist in active tenant', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(leaveService, 'createLeaveApprovalRule').mockRejectedValue(
        new NotFoundError('Role not found for active school')
      );

      const token = getAuthToken(adminUser);
      const res = await request(app)
        .post('/api/v1/leaves/rules')
        .set('Authorization', `Bearer ${token}`)
        .send({
          minDays: 1,
          roleId: ROLE_ID
        });

      expect(res.status).toBe(404);
      const errMsg = res.body.error?.message || res.body.message || JSON.stringify(res.body);
      expect(errMsg).toContain('Role not found for active school');
    });
  });

  describe('3. PATCH /api/v1/leaves/rules/:id — Updating Approval Rules', () => {
    it('returns 200 for SCHOOL_ADMIN updating a rule', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(leaveService, 'updateLeaveApprovalRule').mockResolvedValue({
        ...mockRule,
        maxDays: 5
      });

      const token = getAuthToken(adminUser);
      const res = await request(app)
        .patch(`/api/v1/leaves/rules/${RULE_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ maxDays: 5 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.maxDays).toBe(5);
    });

    it('returns 404 when rule is not found in tenant', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(leaveService, 'updateLeaveApprovalRule').mockRejectedValue(
        new NotFoundError('Leave approval rule')
      );

      const token = getAuthToken(adminUser);
      const res = await request(app)
        .patch(`/api/v1/leaves/rules/${RULE_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ maxDays: 5 });

      expect(res.status).toBe(404);
    });
  });

  describe('4. DELETE /api/v1/leaves/rules/:id — Deleting Approval Rules', () => {
    it('returns 200 for SCHOOL_ADMIN deleting a rule', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(leaveService, 'deleteLeaveApprovalRule').mockResolvedValue({
        success: true,
        message: 'Leave approval rule deleted successfully'
      });

      const token = getAuthToken(adminUser);
      const res = await request(app)
        .delete(`/api/v1/leaves/rules/${RULE_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 404 when rule is not found in tenant', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(leaveService, 'deleteLeaveApprovalRule').mockRejectedValue(
        new NotFoundError('Leave approval rule')
      );

      const token = getAuthToken(adminUser);
      const res = await request(app)
        .delete(`/api/v1/leaves/rules/${RULE_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });
});
