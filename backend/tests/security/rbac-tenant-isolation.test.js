import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import * as rbacRepository from '../../src/modules/rbac/rbac.repository.js';
import * as authRepository from '../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../src/modules/auth/token.service.js';
import { SYSTEM_ROLES } from '../../src/config/constants.js';

describe('Security: RBAC Multi-Tenant Isolation & Access Control Tests', () => {
  const app = createApp();
  const SCHOOL_A = '11111111-1111-4111-8111-111111111111';
  const SCHOOL_B = '22222222-2222-4222-8222-222222222222';
  const ROLE_A_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const ROLE_B_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const USER_A_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const USER_B_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

  const schoolAAdmin = {
    id: 'admin-a-id',
    schoolId: SCHOOL_A,
    email: 'admina@schoola.com',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_A, name: 'School A', code: 'SchoolA', status: 'active' }
  };

  const superAdmin = {
    id: 'superadmin-id',
    schoolId: null,
    email: 'superadmin@platform.com',
    systemRole: SYSTEM_ROLES.SUPER_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: null
  };

  const ordinaryTeacher = {
    id: USER_A_ID,
    schoolId: SCHOOL_A,
    email: 'teachera@schoola.com',
    systemRole: SYSTEM_ROLES.TEACHER,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_A, name: 'School A', code: 'SchoolA', status: 'active' }
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

  describe('1. Cross-Tenant Role Isolation', () => {
    it('School A cannot read School B roles (returns 404 when querying School B roleId)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(rbacRepository, 'findRoleById').mockImplementation(async (schoolId, roleId) => {
        if (schoolId === SCHOOL_A && roleId === ROLE_B_ID) {
          return null; // Tenant isolation: not found in School A
        }
        if (schoolId === SCHOOL_B && roleId === ROLE_B_ID) {
          return { id: ROLE_B_ID, schoolId: SCHOOL_B, name: 'School B Custom Role' };
        }
        return null;
      });

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .get(`/api/v1/rbac/roles/${ROLE_B_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(rbacRepository.findRoleById).toHaveBeenCalledWith(SCHOOL_A, ROLE_B_ID);
    });

    it('School A cannot modify School B roles', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(rbacRepository, 'findRoleById').mockImplementation(async (schoolId, roleId) => {
        if (schoolId === SCHOOL_A && roleId === ROLE_B_ID) return null;
        return { id: ROLE_B_ID, schoolId: SCHOOL_B, name: 'School B Custom Role' };
      });

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .patch(`/api/v1/rbac/roles/${ROLE_B_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Tampered Name' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('School A cannot delete School B roles', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(rbacRepository, 'findRoleById').mockImplementation(async (schoolId, roleId) => {
        if (schoolId === SCHOOL_A && roleId === ROLE_B_ID) return null;
        return { id: ROLE_B_ID, schoolId: SCHOOL_B, name: 'School B Custom Role' };
      });

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .delete(`/api/v1/rbac/roles/${ROLE_B_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('2. Cross-Tenant User Role Assignment Protection', () => {
    it('School A admin cannot assign roles to a user belonging to School B', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(rbacRepository, 'findUserById').mockImplementation(async (schoolId, userId) => {
        if (schoolId === SCHOOL_A && userId === USER_B_ID) return null; // Not found in School A
        return { id: USER_B_ID, schoolId: SCHOOL_B, email: 'userb@schoolb.com' };
      });

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .post(`/api/v1/rbac/users/${USER_B_ID}/roles`)
        .set('Authorization', `Bearer ${token}`)
        .send({ roleId: ROLE_A_ID });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('School A admin cannot assign a role belonging to School B to their own user', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(rbacRepository, 'findUserById').mockResolvedValue({ id: USER_A_ID, schoolId: SCHOOL_A, email: 'usera@schoola.com' });
      vi.spyOn(rbacRepository, 'findRoleById').mockImplementation(async (schoolId, roleId) => {
        if (schoolId === SCHOOL_A && roleId === ROLE_B_ID) return null; // Role B does not belong to School A
        return { id: ROLE_B_ID, schoolId: SCHOOL_B, name: 'School B Role' };
      });

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .post(`/api/v1/rbac/users/${USER_A_ID}/roles`)
        .set('Authorization', `Bearer ${token}`)
        .send({ roleId: ROLE_B_ID });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('3. Tenant Spoofing & Header Tampering', () => {
    it('rejects ordinary user attempting to switch tenants via X-Tenant-Id header with 403', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .get('/api/v1/rbac/roles')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Tenant-Id', SCHOOL_B);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('TENANT_ACCESS_ERROR');
    });

    it('rejects client request specifying conflicting schoolId in body', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .post('/api/v1/rbac/roles')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Hacked Role',
          schoolId: SCHOOL_B // Conflicting schoolId in body
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('TENANT_ACCESS_ERROR');
    });
  });

  describe('4. Self-Escalation & Role Privilege Protection', () => {
    it('rejects ordinary staff attempting to access role management endpoints with 403', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(ordinaryTeacher);

      const token = getAuthToken(ordinaryTeacher);
      const res = await request(app)
        .post('/api/v1/rbac/roles')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Elevated Admin Role' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('5. System Default Role Protection', () => {
    it('strictly prevents deletion of system default roles with 400 Bad Request', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(rbacRepository, 'findRoleById').mockResolvedValue({
        id: ROLE_A_ID,
        schoolId: SCHOOL_A,
        name: 'Finance Department',
        slug: 'finance-department',
        isSystemDefault: true
      });

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .delete(`/api/v1/rbac/roles/${ROLE_A_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/cannot delete system default role/i);
    });
  });

  describe('6. SuperAdmin Tenant Switching', () => {
    it('allows SUPER_ADMIN to target School A with X-Tenant-Id header', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(superAdmin);
      vi.spyOn(authRepository, 'findSchoolById').mockResolvedValue({
        id: SCHOOL_A,
        name: 'Spring Mount Public School',
        status: 'active'
      });
      vi.spyOn(rbacRepository, 'findRolesBySchoolId').mockResolvedValue([
        { id: ROLE_A_ID, name: 'Principal', schoolId: SCHOOL_A }
      ]);

      const token = getAuthToken(superAdmin);
      const res = await request(app)
        .get('/api/v1/rbac/roles')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Tenant-Id', SCHOOL_A);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(rbacRepository.findRolesBySchoolId).toHaveBeenCalledWith(SCHOOL_A);
    });

    it('rejects SUPER_ADMIN targeting non-existent school with 403', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(superAdmin);
      vi.spyOn(authRepository, 'findSchoolById').mockResolvedValue(null);

      const token = getAuthToken(superAdmin);
      const res = await request(app)
        .get('/api/v1/rbac/roles')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Tenant-Id', '99999999-9999-4999-8999-999999999999');

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('TENANT_ACCESS_ERROR');
    });
  });
});
