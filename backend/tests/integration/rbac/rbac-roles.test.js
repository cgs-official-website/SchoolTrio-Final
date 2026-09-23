import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import * as rbacService from '../../../src/modules/rbac/rbac.service.js';
import * as authRepository from '../../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../../src/modules/auth/token.service.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';

describe('Integration: RBAC Role CRUD Endpoints (/api/v1/rbac/roles)', () => {
  const app = createApp();
  const TENANT_A = '11111111-1111-4111-8111-111111111111';
  const ROLE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  const mockAdminUser = {
    id: 'admin-1',
    schoolId: TENANT_A,
    email: 'admin@school.edu',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_A, name: 'Spring Mount', code: 'SchoolS024', status: 'active' }
  };

  const mockTeacherUser = {
    id: 'teacher-1',
    schoolId: TENANT_A,
    email: 'teacher@school.edu',
    systemRole: SYSTEM_ROLES.TEACHER,
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_A, name: 'Spring Mount', code: 'SchoolS024', status: 'active' }
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

  describe('GET /api/v1/rbac/roles', () => {
    it('returns all roles for the authenticated tenant', async () => {
      const mockRoles = [
        { id: ROLE_ID, name: 'Principal', slug: 'principal', isSystemDefault: true }
      ];
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(rbacService, 'listRoles').mockResolvedValue(mockRoles);

      const token = getAuthToken(mockAdminUser);
      const res = await request(app)
        .get('/api/v1/rbac/roles')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockRoles);
      expect(rbacService.listRoles).toHaveBeenCalledWith(TENANT_A);
    });

    it('rejects unauthorized access for non-admin user with 403', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockTeacherUser);

      const token = getAuthToken(mockTeacherUser);
      const res = await request(app)
        .get('/api/v1/rbac/roles')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('POST /api/v1/rbac/roles', () => {
    it('creates a custom role successfully with HTTP 201', async () => {
      const createdRole = {
        id: ROLE_ID,
        schoolId: TENANT_A,
        name: 'Exam Coordinator',
        slug: 'exam-coordinator',
        loginPanel: 'admin',
        isSystemDefault: false
      };
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(rbacService, 'createRole').mockResolvedValue(createdRole);

      const token = getAuthToken(mockAdminUser);
      const res = await request(app)
        .post('/api/v1/rbac/roles')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Exam Coordinator',
          loginPanel: 'admin'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(createdRole);
    });

    it('rejects invalid role creation payload with 400 validation error', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);

      const token = getAuthToken(mockAdminUser);
      const res = await request(app)
        .post('/api/v1/rbac/roles')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: '' // invalid empty name
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PATCH /api/v1/rbac/roles/:roleId', () => {
    it('updates role successfully with HTTP 200', async () => {
      const updatedRole = {
        id: ROLE_ID,
        name: 'Senior Exam Coordinator',
        slug: 'senior-exam-coordinator'
      };
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(rbacService, 'updateRole').mockResolvedValue(updatedRole);

      const token = getAuthToken(mockAdminUser);
      const res = await request(app)
        .patch(`/api/v1/rbac/roles/${ROLE_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Senior Exam Coordinator'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(updatedRole);
    });

    it('rejects invalid roleId format with 400 validation error', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);

      const token = getAuthToken(mockAdminUser);
      const res = await request(app)
        .patch('/api/v1/rbac/roles/invalid-uuid-format')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'New Name'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('DELETE /api/v1/rbac/roles/:roleId', () => {
    it('deletes custom role successfully with HTTP 200', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(rbacService, 'deleteRole').mockResolvedValue();

      const token = getAuthToken(mockAdminUser);
      const res = await request(app)
        .delete(`/api/v1/rbac/roles/${ROLE_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(rbacService.deleteRole).toHaveBeenCalledWith(TENANT_A, ROLE_ID, expect.anything());
    });
  });
});
