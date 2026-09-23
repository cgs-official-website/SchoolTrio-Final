import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import * as parentRepository from '../../src/modules/parents/parent.repository.js';
import * as rbacService from '../../src/modules/rbac/rbac.service.js';
import * as authRepository from '../../src/modules/auth/auth.repository.js';
import * as auditRepository from '../../src/modules/audit/audit.repository.js';
import * as tokenService from '../../src/modules/auth/token.service.js';
import { SYSTEM_ROLES } from '../../src/config/constants.js';

describe('Security: Parents Multi-Tenant Isolation & RBAC Access Control Tests', () => {
  const app = createApp();
  const SCHOOL_A = '11111111-1111-4111-8111-111111111111';
  const SCHOOL_B = '22222222-2222-4222-8222-222222222222';
  const PARENT_B_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const STUDENT_B_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  const schoolAAdmin = {
    id: 'admin-a-id',
    schoolId: SCHOOL_A,
    email: 'admina@schoola.com',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_A, name: 'School A', code: 'SchoolA', status: 'active' }
  };

  const restrictedStaff = {
    id: 'staff-a-id',
    schoolId: SCHOOL_A,
    email: 'staffa@schoola.com',
    systemRole: SYSTEM_ROLES.STAFF,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_A, name: 'School A', code: 'SchoolA', status: 'active' }
  };

  const superAdmin = {
    id: 'super-admin-id',
    schoolId: null,
    email: 'superadmin@platform.com',
    systemRole: SYSTEM_ROLES.SUPER_ADMIN,
    tokenVersion: 1,
    isActive: true
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(auditRepository, 'createAuditLog').mockResolvedValue({ id: 'mock-audit-id' });
  });

  const getAuthToken = (user) => {
    return tokenService.issueAccessToken({
      sub: user.id,
      schoolId: user.schoolId,
      systemRole: user.systemRole,
      tokenVersion: user.tokenVersion
    });
  };

  describe('1. Authentication Checks', () => {
    it('unauthenticated GET /api/v1/parents returns 401', async () => {
      const res = await request(app).get('/api/v1/parents');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('unauthenticated PATCH /api/v1/parents/:id returns 401', async () => {
      const res = await request(app)
        .patch(`/api/v1/parents/${PARENT_B_ID}`)
        .send({ name: 'Hacked' });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('unauthenticated POST /api/v1/students/:id/parents returns 401', async () => {
      const res = await request(app)
        .post(`/api/v1/students/${STUDENT_B_ID}/parents`)
        .send({ parentProfileId: PARENT_B_ID, relationship: 'Father' });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('2. Cross-Tenant Parent Isolation', () => {
    it('School A cannot read School B parent (returns 404)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(parentRepository, 'findParentById').mockImplementation(async (schoolId, parentId) => {
        if (schoolId === SCHOOL_A && parentId === PARENT_B_ID) return null;
        if (schoolId === SCHOOL_B && parentId === PARENT_B_ID) {
          return { id: PARENT_B_ID, schoolId: SCHOOL_B, name: 'Parent in School B' };
        }
        return null;
      });

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .get(`/api/v1/parents/${PARENT_B_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(parentRepository.findParentById).toHaveBeenCalledWith(SCHOOL_A, PARENT_B_ID);
    });

    it('School A cannot update School B parent (returns 404)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(parentRepository, 'findParentById').mockImplementation(async (schoolId, parentId) => {
        if (schoolId === SCHOOL_A && parentId === PARENT_B_ID) return null;
        return { id: PARENT_B_ID, schoolId: SCHOOL_B, name: 'Parent in School B' };
      });

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .patch(`/api/v1/parents/${PARENT_B_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Tampered Name' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('rejects cross-tenant schoolId tampering with 403 TenantAccessError', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .patch(`/api/v1/parents/${PARENT_B_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          schoolId: SCHOOL_B, // Tampering attempt
          name: 'Tampered'
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('TENANT_ACCESS_ERROR');
    });
  });

  describe('3. PostgreSQL RBAC Permissions Enforcement', () => {
    it('denies access (403) when user lacks students.read permission for /parents', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(restrictedStaff);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        students: { canRead: false, canCreate: false, canEdit: false, canDelete: false }
      });

      const token = getAuthToken(restrictedStaff);
      const res = await request(app)
        .get('/api/v1/parents')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('denies access (403) when user lacks students.edit permission for PATCH /parents/:id', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(restrictedStaff);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        students: { canRead: true, canCreate: false, canEdit: false, canDelete: false }
      });

      const token = getAuthToken(restrictedStaff);
      const res = await request(app)
        .patch(`/api/v1/parents/${PARENT_B_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Update' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('denies access (403) when user lacks students.delete permission for DELETE link', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(restrictedStaff);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        students: { canRead: true, canCreate: false, canEdit: false, canDelete: false }
      });

      const token = getAuthToken(restrictedStaff);
      const res = await request(app)
        .delete(`/api/v1/students/${STUDENT_B_ID}/parents/${PARENT_B_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('4. Super Admin Tenant Switching', () => {
    it('SuperAdmin can view parents of School A when x-tenant-id header is provided', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(superAdmin);
      vi.spyOn(authRepository, 'findSchoolById').mockResolvedValue({
        id: SCHOOL_A,
        name: 'School A',
        code: 'SchoolA',
        status: 'active'
      });
      vi.spyOn(parentRepository, 'findParents').mockResolvedValue([]);
      vi.spyOn(parentRepository, 'countParents').mockResolvedValue(0);

      const token = getAuthToken(superAdmin);
      const res = await request(app)
        .get('/api/v1/parents')
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', SCHOOL_A);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(parentRepository.findParents).toHaveBeenCalledWith(
        SCHOOL_A,
        expect.anything()
      );
    });
  });
});
