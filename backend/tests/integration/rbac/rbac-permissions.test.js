import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import * as rbacService from '../../../src/modules/rbac/rbac.service.js';
import * as authRepository from '../../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../../src/modules/auth/token.service.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';

describe('Integration: RBAC Role Permissions Endpoints (/api/v1/rbac/roles/:roleId/permissions)', () => {
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

  describe('GET /api/v1/rbac/roles/:roleId/permissions', () => {
    it('returns role permission matrix successfully', async () => {
      const mockResult = {
        role: { id: ROLE_ID, name: 'Library', slug: 'library' },
        permissions: {
          library: { canRead: true, canCreate: true, canEdit: true, canDelete: false }
        }
      };
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(rbacService, 'getRolePermissions').mockResolvedValue(mockResult);

      const token = getAuthToken(mockAdminUser);
      const res = await request(app)
        .get(`/api/v1/rbac/roles/${ROLE_ID}/permissions`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockResult);
      expect(rbacService.getRolePermissions).toHaveBeenCalledWith(TENANT_A, ROLE_ID);
    });
  });

  describe('PUT /api/v1/rbac/roles/:roleId/permissions', () => {
    it('updates role permissions successfully', async () => {
      const updatedResult = {
        role: { id: ROLE_ID, name: 'Library', slug: 'library' },
        permissions: {
          library: { canRead: true, canCreate: true, canEdit: true, canDelete: true }
        }
      };
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(rbacService, 'updateRolePermissions').mockResolvedValue(updatedResult);

      const token = getAuthToken(mockAdminUser);
      const res = await request(app)
        .put(`/api/v1/rbac/roles/${ROLE_ID}/permissions`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          permissions: {
            library: { canRead: true, canCreate: true, canEdit: true, canDelete: true }
          }
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(updatedResult);
    });
  });
});
