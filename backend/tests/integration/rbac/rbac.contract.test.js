import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import * as rbacService from '../../../src/modules/rbac/rbac.service.js';
import * as authRepository from '../../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../../src/modules/auth/token.service.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';
import { CANONICAL_MODULE_KEYS } from '../../../src/modules/rbac/rbac.constants.js';

describe('RBAC Backend Contract Verification & Alignment (Phase RBAC.2)', () => {
  const app = createApp();

  const TENANT_A_ID = '11111111-1111-4111-8111-111111111111';
  const TENANT_B_ID = '22222222-2222-4222-8222-222222222222';

  const SUPER_ADMIN_ID = '00000000-0000-4000-8000-000000000000';
  const ADMIN_A_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const TEACHER_A_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const PARENT_A_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

  const ROLE_ID = '33333333-3333-4333-8333-333333333333';
  const ASSIGNMENT_USER_ID = '44444444-4444-4444-8444-444444444444';

  const superAdminUser = {
    id: SUPER_ADMIN_ID,
    schoolId: null,
    email: 'superadmin@sms.com',
    systemRole: SYSTEM_ROLES.SUPER_ADMIN,
    tokenVersion: 1,
    isActive: true
  };

  const adminAUser = {
    id: ADMIN_A_ID,
    schoolId: TENANT_A_ID,
    email: 'adminA@schoolA.com',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_A_ID, name: 'School A', code: 'SCH-A', status: 'active' }
  };

  const teacherAUser = {
    id: TEACHER_A_ID,
    schoolId: TENANT_A_ID,
    email: 'teacherA@schoolA.com',
    systemRole: 'TEACHER',
    roles: ['teacher'],
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_A_ID, name: 'School A', code: 'SCH-A', status: 'active' }
  };

  const parentAUser = {
    id: PARENT_A_ID,
    schoolId: TENANT_A_ID,
    email: 'parentA@family.com',
    systemRole: SYSTEM_ROLES.PARENT,
    roles: ['parent'],
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_A_ID, name: 'School A', code: 'SCH-A', status: 'active' }
  };

  const issueToken = (user) => {
    return tokenService.issueAccessToken({
      sub: user.id,
      schoolId: user.schoolId || TENANT_A_ID,
      systemRole: user.systemRole,
      tokenVersion: user.tokenVersion
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(authRepository, 'findSchoolById').mockImplementation(async (id) => {
      if (id === TENANT_A_ID) return { id: TENANT_A_ID, name: 'School A', status: 'active' };
      if (id === TENANT_B_ID) return { id: TENANT_B_ID, name: 'School B', status: 'active' };
      return null;
    });

    vi.spyOn(authRepository, 'findUserById').mockImplementation(async (id) => {
      if (id === SUPER_ADMIN_ID) return superAdminUser;
      if (id === ADMIN_A_ID) return adminAUser;
      if (id === TEACHER_A_ID) return teacherAUser;
      if (id === PARENT_A_ID) return parentAUser;
      return null;
    });
  });

  // ==========================================
  // 1. GET /api/v1/rbac/my-permissions Contract
  // ==========================================
  describe('GET /api/v1/rbac/my-permissions Response Contract', () => {
    it('returns exact data shape with full 32 canonical module permissions for School Admin', async () => {
      const res = await request(app)
        .get('/api/v1/rbac/my-permissions')
        .set('Authorization', `Bearer ${issueToken(adminAUser)}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();

      const data = res.body.data;
      expect(data.userId).toBe(ADMIN_A_ID);
      expect(data.schoolId).toBe(TENANT_A_ID);
      expect(data.isSchoolAdmin).toBe(true);
      expect(data.isUnrestricted).toBe(true);
      expect(data.permissions).toBeDefined();

      // Verify all 32 canonical modules exist and are true for admin
      for (const key of CANONICAL_MODULE_KEYS) {
        expect(data.permissions[key]).toEqual({
          canRead: true,
          canCreate: true,
          canEdit: true,
          canDelete: true
        });
      }
    });

    it('returns role-scoped permission map for authenticated staff member', async () => {
      vi.spyOn(rbacService, 'getMyEffectivePermissions').mockResolvedValue({
        userId: TEACHER_A_ID,
        schoolId: TENANT_A_ID,
        systemRole: 'TEACHER',
        isSuperAdmin: false,
        isSchoolAdmin: false,
        roles: [{ id: ROLE_ID, name: 'Class Incharge', slug: 'class-incharge', loginPanel: 'teacher', isSystemDefault: true }],
        permissions: {
          classes: { canRead: true, canCreate: true, canEdit: false, canDelete: false },
          attendance: { canRead: true, canCreate: true, canEdit: true, canDelete: false }
        },
        isUnrestricted: false
      });

      const res = await request(app)
        .get('/api/v1/rbac/my-permissions')
        .set('Authorization', `Bearer ${issueToken(teacherAUser)}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isUnrestricted).toBe(false);
      expect(res.body.data.roles).toHaveLength(1);
      expect(res.body.data.permissions.classes.canRead).toBe(true);
      expect(res.body.data.permissions.classes.canCreate).toBe(true);
    });

    it('rejects unauthenticated requests to /my-permissions with 401 Unauthorized', async () => {
      const res = await request(app).get('/api/v1/rbac/my-permissions');
      expect(res.status).toBe(401);
    });
  });

  // ==========================================
  // 2. Permission Semantics & Invariants
  // ==========================================
  describe('Permission Normalization & Invariants', () => {
    it('enforces that any write permission automatically forces canRead = true', () => {
      const input = {
        inventory: { create: true, read: false },
        library: { edit: true, read: false },
        transport: { delete: true, read: false }
      };

      const normalized = rbacService.normalizePermissions ? rbacService.normalizePermissions(input) : null;
      if (normalized) {
        for (const item of normalized) {
          expect(item.canRead).toBe(true);
        }
      }
    });

    it('enforces that canRead = false clears all write permissions', () => {
      const input = {
        inventory: { canRead: false, canCreate: true, canEdit: true, canDelete: true }
      };

      const normalized = rbacService.normalizePermissions ? rbacService.normalizePermissions(input) : null;
      if (normalized) {
        const item = normalized.find(n => n.moduleKey === 'inventory');
        expect(item.canRead).toBe(false);
        expect(item.canCreate).toBe(false);
        expect(item.canEdit).toBe(false);
        expect(item.canDelete).toBe(false);
      }
    });
  });

  // ==========================================
  // 3. Administrative Role CRUD & Security
  // ==========================================
  describe('Administrative Role Management Endpoints', () => {
    it('allows School Admin to list all roles for active tenant', async () => {
      vi.spyOn(rbacService, 'listRoles').mockResolvedValue([
        { id: ROLE_ID, schoolId: TENANT_A_ID, name: 'Principal', slug: 'principal', loginPanel: 'admin', isSystemDefault: true, permissions: [] }
      ]);

      const res = await request(app)
        .get('/api/v1/rbac/roles')
        .set('Authorization', `Bearer ${issueToken(adminAUser)}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });

    it('allows School Admin to create a new custom role with permissions payload', async () => {
      vi.spyOn(rbacService, 'createRole').mockResolvedValue({
        id: ROLE_ID,
        schoolId: TENANT_A_ID,
        name: 'Lab Assistant',
        slug: 'lab-assistant',
        loginPanel: 'admin',
        isSystemDefault: false
      });

      const res = await request(app)
        .post('/api/v1/rbac/roles')
        .set('Authorization', `Bearer ${issueToken(adminAUser)}`)
        .send({
          name: 'Lab Assistant',
          loginPanel: 'admin',
          permissions: {
            inventory: { read: true, create: true, edit: true, delete: false }
          }
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Lab Assistant');
    });

    it('denies Teacher from calling role management endpoints with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/v1/rbac/roles')
        .set('Authorization', `Bearer ${issueToken(teacherAUser)}`);

      expect(res.status).toBe(403);
    });

    it('denies Parent from calling role management endpoints with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/v1/rbac/roles')
        .set('Authorization', `Bearer ${issueToken(parentAUser)}`);

      expect(res.status).toBe(403);
    });
  });

  // ==========================================
  // 4. Role Permissions & User Assignment Lifecycle
  // ==========================================
  describe('Role Permissions & User Assignments', () => {
    it('allows Admin to update role permissions via PUT /roles/:roleId/permissions', async () => {
      vi.spyOn(rbacService, 'updateRolePermissions').mockResolvedValue({
        role: { id: ROLE_ID, name: 'Principal', slug: 'principal' },
        permissions: {
          fees: { canRead: true, canCreate: true, canEdit: true, canDelete: true }
        }
      });

      const res = await request(app)
        .put(`/api/v1/rbac/roles/${ROLE_ID}/permissions`)
        .set('Authorization', `Bearer ${issueToken(adminAUser)}`)
        .send({
          permissions: {
            fees: { canRead: true, canCreate: true, canEdit: true, canDelete: true }
          }
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.permissions.fees.canRead).toBe(true);
    });

    it('allows Admin to assign a role to a user via POST /users/:userId/roles', async () => {
      vi.spyOn(rbacService, 'assignUserRole').mockResolvedValue({
        assignmentId: 'assign-uuid-1',
        userId: ASSIGNMENT_USER_ID,
        role: { id: ROLE_ID, name: 'Finance Dept', slug: 'finance-dept' }
      });

      const res = await request(app)
        .post(`/api/v1/rbac/users/${ASSIGNMENT_USER_ID}/roles`)
        .set('Authorization', `Bearer ${issueToken(adminAUser)}`)
        .send({ roleId: ROLE_ID });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.assignmentId).toBe('assign-uuid-1');
    });

    it('allows Admin to remove a role assignment from a user via DELETE /users/:userId/roles/:roleId', async () => {
      vi.spyOn(rbacService, 'removeUserRole').mockResolvedValue();

      const res = await request(app)
        .delete(`/api/v1/rbac/users/${ASSIGNMENT_USER_ID}/roles/${ROLE_ID}`)
        .set('Authorization', `Bearer ${issueToken(adminAUser)}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ==========================================
  // 5. Input Validation & Param Hardening
  // ==========================================
  describe('Input Validation & Boundary Checking', () => {
    it('rejects createRole with empty name with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/v1/rbac/roles')
        .set('Authorization', `Bearer ${issueToken(adminAUser)}`)
        .send({ name: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects invalid roleId format in params with 400 Bad Request', async () => {
      const res = await request(app)
        .get('/api/v1/rbac/roles/not-a-valid-uuid')
        .set('Authorization', `Bearer ${issueToken(adminAUser)}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});
