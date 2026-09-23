import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import * as rbacService from '../../../src/modules/rbac/rbac.service.js';
import * as authRepository from '../../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../../src/modules/auth/token.service.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';

describe('Integration: RBAC User Role Assignment Endpoints (/api/v1/rbac/users/:userId/roles)', () => {
  const app = createApp();
  const TENANT_A = '11111111-1111-4111-8111-111111111111';
  const USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
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

  describe('GET /api/v1/rbac/users/:userId/roles', () => {
    it('returns assigned roles for the specified user', async () => {
      const mockRoles = [
        {
          assignmentId: 'assign-1',
          role: { id: ROLE_ID, name: 'Library', slug: 'library' }
        }
      ];
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(rbacService, 'getUserRoles').mockResolvedValue(mockRoles);

      const token = getAuthToken(mockAdminUser);
      const res = await request(app)
        .get(`/api/v1/rbac/users/${USER_ID}/roles`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockRoles);
      expect(rbacService.getUserRoles).toHaveBeenCalledWith(TENANT_A, USER_ID);
    });
  });

  describe('POST /api/v1/rbac/users/:userId/roles', () => {
    it('assigns role to user with HTTP 201', async () => {
      const mockAssignment = {
        assignmentId: 'assign-1',
        userId: USER_ID,
        role: { id: ROLE_ID, name: 'Transport', slug: 'transport' }
      };
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(rbacService, 'assignUserRole').mockResolvedValue(mockAssignment);

      const token = getAuthToken(mockAdminUser);
      const res = await request(app)
        .post(`/api/v1/rbac/users/${USER_ID}/roles`)
        .set('Authorization', `Bearer ${token}`)
        .send({ roleId: ROLE_ID });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockAssignment);
    });
  });

  describe('DELETE /api/v1/rbac/users/:userId/roles/:roleId', () => {
    it('removes role from user with HTTP 200', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(rbacService, 'removeUserRole').mockResolvedValue();

      const token = getAuthToken(mockAdminUser);
      const res = await request(app)
        .delete(`/api/v1/rbac/users/${USER_ID}/roles/${ROLE_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(rbacService.removeUserRole).toHaveBeenCalledWith(TENANT_A, USER_ID, ROLE_ID, expect.anything());
    });
  });
});
