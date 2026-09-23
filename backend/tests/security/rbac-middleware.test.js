import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { requireRole, requirePermission } from '../../src/middleware/rbac.middleware.js';
import { tenantContext } from '../../src/middleware/tenant.middleware.js';
import { errorMiddleware } from '../../src/middleware/error.middleware.js';
import * as rbacService from '../../src/modules/rbac/rbac.service.js';
import * as authRepository from '../../src/modules/auth/auth.repository.js';

describe('Security: Authoritative RBAC Middleware Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const createTestApp = (mockUser, mockTenant = null) => {
    const app = express();
    app.use(express.json());

    app.use((req, _res, next) => {
      req.auth = mockUser ? { userId: mockUser.id, schoolId: mockUser.schoolId, systemRole: mockUser.systemRole || mockUser.role } : null;
      req.user = mockUser;
      req.tenant = mockTenant || (mockUser?.schoolId ? { schoolId: mockUser.schoolId } : null);
      next();
    });

    app.get('/admin-only', requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), (_req, res) => {
      res.json({ success: true, message: 'admin access granted' });
    });

    app.get('/read-students', requirePermission('students', 'read'), (_req, res) => {
      res.json({ success: true, message: 'read students granted', permissions: _req.permissions });
    });

    app.post('/create-students', requirePermission('students', 'create'), (_req, res) => {
      res.json({ success: true, message: 'create students granted' });
    });

    app.put('/edit-students', requirePermission('students', 'edit'), (_req, res) => {
      res.json({ success: true, message: 'edit students granted' });
    });

    app.delete('/delete-students', requirePermission('students', 'delete'), (_req, res) => {
      res.json({ success: true, message: 'delete students granted' });
    });

    app.get('/multi-permission', requirePermission('students:read', 'attendance:read'), (_req, res) => {
      res.json({ success: true, message: 'multi permission granted' });
    });

    app.use(errorMiddleware);
    return app;
  };

  const createPipelineApp = (mockUser) => {
    const app = express();
    app.use(express.json());

    app.use((req, _res, next) => {
      req.auth = mockUser ? { userId: mockUser.id, schoolId: mockUser.schoolId, systemRole: mockUser.systemRole || mockUser.role } : null;
      req.user = mockUser;
      next();
    });

    // Pipelined: tenantContext -> requirePermission
    app.get('/tenant-protected', tenantContext({ requireTenant: true }), requirePermission('students', 'read'), (_req, res) => {
      res.json({ success: true, message: 'pipeline access granted', tenant: _req.tenant });
    });

    app.use(errorMiddleware);
    return app;
  };

  describe('1. Authentication Checks', () => {
    it('1. Returns 401 when req.user is null / unauthenticated', async () => {
      const app = createTestApp(null);
      const res = await request(app).get('/read-students');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('2. Returns 401 when missing auth user id', async () => {
      const app = createTestApp({ schoolId: 'school-1' });
      const res = await request(app).get('/read-students');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('2. SUPER_ADMIN Tenant Boundary & Invariants', () => {
    it('1. SUPER_ADMIN with valid established tenant context bypasses functional check', async () => {
      const app = createTestApp(
        { id: 'super-u', systemRole: 'SUPER_ADMIN', schoolId: null },
        { schoolId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d', isSuperAdminSwitch: true }
      );

      const res = await request(app).post('/create-students');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('2. SUPER_ADMIN with no tenant context is strictly denied with 403 TenantAccessError', async () => {
      const app = createTestApp(
        { id: 'super-u', systemRole: 'SUPER_ADMIN', schoolId: null },
        { schoolId: null, bypassTenant: true }
      );

      const res = await request(app).get('/read-students');
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('TENANT_ACCESS_ERROR');
      expect(res.body.error.message).toContain('Tenant context required to evaluate permissions');
    });

    it('3. SUPER_ADMIN attempting cross-tenant parameter access is strictly rejected', async () => {
      const app = createTestApp(
        { id: 'super-u', systemRole: 'SUPER_ADMIN', schoolId: null },
        { schoolId: 'school-tenant-a', isSuperAdminSwitch: true }
      );

      // SuperAdmin switched to Tenant A, but request body contains conflicting Tenant B
      const res = await request(app)
        .post('/create-students')
        .send({ schoolId: 'school-tenant-b', name: 'New Student' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('TENANT_ACCESS_ERROR');
      expect(res.body.error.message).toContain('Cross-tenant access rejected');
    });

    it('4. SUPER_ADMIN with malformed X-Tenant-Id header is rejected by pipeline', async () => {
      const app = createPipelineApp({ id: 'super-u', systemRole: 'SUPER_ADMIN', schoolId: null });
      const res = await request(app)
        .get('/tenant-protected')
        .set('X-Tenant-Id', 'not-a-valid-uuid');

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('TENANT_ACCESS_ERROR');
      expect(res.body.error.message).toContain('Invalid tenant identifier format');
    });

    it('5. SUPER_ADMIN with nonexistent X-Tenant-Id target is rejected by pipeline', async () => {
      vi.spyOn(authRepository, 'findSchoolById').mockResolvedValue(null);

      const app = createPipelineApp({ id: 'super-u', systemRole: 'SUPER_ADMIN', schoolId: null });
      const res = await request(app)
        .get('/tenant-protected')
        .set('X-Tenant-Id', 'a0000000-0000-4000-a000-000000000001');

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('TENANT_ACCESS_ERROR');
      expect(res.body.error.message).toContain('Target school tenant not found');
    });

    it('6. SUPER_ADMIN with valid X-Tenant-Id target succeeds through pipeline', async () => {
      vi.spyOn(authRepository, 'findSchoolById').mockResolvedValue({
        id: 'a0000000-0000-4000-a000-000000000001',
        name: 'Target School',
        code: 'TARGET'
      });

      const app = createPipelineApp({ id: 'super-u', systemRole: 'SUPER_ADMIN', schoolId: null });
      const res = await request(app)
        .get('/tenant-protected')
        .set('X-Tenant-Id', 'a0000000-0000-4000-a000-000000000001');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.tenant.schoolId).toBe('a0000000-0000-4000-a000-000000000001');
    });
  });

  describe('3. SCHOOL_ADMIN Tenant Boundary & Isolation', () => {
    it('7. SCHOOL_ADMIN inside own tenant is allowed unconditionally', async () => {
      const app = createTestApp({
        id: 'admin-u',
        systemRole: 'SCHOOL_ADMIN',
        schoolId: 'school-1'
      });

      const res = await request(app).delete('/delete-students');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('8. SCHOOL_ADMIN attempting cross-tenant access via body parameter is rejected', async () => {
      const app = createTestApp({
        id: 'admin-u',
        systemRole: 'SCHOOL_ADMIN',
        schoolId: 'school-1'
      });

      const res = await request(app)
        .post('/create-students')
        .send({ schoolId: 'school-2' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('TENANT_ACCESS_ERROR');
      expect(res.body.error.message).toContain('Cross-tenant access rejected');
    });

    it('9. SCHOOL_ADMIN attempting header tenant switch is rejected by pipeline', async () => {
      const app = createPipelineApp({
        id: 'admin-u',
        systemRole: 'SCHOOL_ADMIN',
        schoolId: 'school-1'
      });

      const res = await request(app)
        .get('/tenant-protected')
        .set('X-Tenant-Id', 'school-2');

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('TENANT_ACCESS_ERROR');
      expect(res.body.error.message).toContain('Unauthorized tenant switch attempt');
    });
  });

  describe('4. Functional RBAC Evaluation (CRUD)', () => {
    it('10. canRead=true -> read allowed', async () => {
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        students: { canRead: true, canCreate: false, canEdit: false, canDelete: false }
      });

      const app = createTestApp({ id: 'u1', schoolId: 's1', systemRole: 'TEACHER' });
      const res = await request(app).get('/read-students');
      expect(res.status).toBe(200);
    });

    it('11. canRead=false -> read denied with 403', async () => {
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        students: { canRead: false, canCreate: false, canEdit: false, canDelete: false }
      });

      const app = createTestApp({ id: 'u1', schoolId: 's1', systemRole: 'TEACHER' });
      const res = await request(app).get('/read-students');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('12. canCreate=true -> create allowed', async () => {
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        students: { canRead: true, canCreate: true, canEdit: false, canDelete: false }
      });

      const app = createTestApp({ id: 'u1', schoolId: 's1', systemRole: 'TEACHER' });
      const res = await request(app).post('/create-students');
      expect(res.status).toBe(200);
    });

    it('13. canCreate=false -> create denied with 403', async () => {
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        students: { canRead: true, canCreate: false, canEdit: false, canDelete: false }
      });

      const app = createTestApp({ id: 'u1', schoolId: 's1', systemRole: 'TEACHER' });
      const res = await request(app).post('/create-students');
      expect(res.status).toBe(403);
    });

    it('14. canEdit=true -> edit allowed', async () => {
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        students: { canRead: true, canCreate: false, canEdit: true, canDelete: false }
      });

      const app = createTestApp({ id: 'u1', schoolId: 's1', systemRole: 'TEACHER' });
      const res = await request(app).put('/edit-students');
      expect(res.status).toBe(200);
    });

    it('15. canEdit=false -> edit denied with 403', async () => {
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        students: { canRead: true, canCreate: false, canEdit: false, canDelete: false }
      });

      const app = createTestApp({ id: 'u1', schoolId: 's1', systemRole: 'TEACHER' });
      const res = await request(app).put('/edit-students');
      expect(res.status).toBe(403);
    });

    it('16. canDelete=true -> delete allowed', async () => {
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        students: { canRead: true, canCreate: false, canEdit: false, canDelete: true }
      });

      const app = createTestApp({ id: 'u1', schoolId: 's1', systemRole: 'TEACHER' });
      const res = await request(app).delete('/delete-students');
      expect(res.status).toBe(200);
    });

    it('17. canDelete=false -> delete denied with 403', async () => {
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        students: { canRead: true, canCreate: false, canEdit: true, canDelete: false }
      });

      const app = createTestApp({ id: 'u1', schoolId: 's1', systemRole: 'TEACHER' });
      const res = await request(app).delete('/delete-students');
      expect(res.status).toBe(403);
    });

    it('18. User with no functional roles -> denied with 403', async () => {
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({});

      const app = createTestApp({ id: 'u1', schoolId: 's1', systemRole: 'TENANT_USER' });
      const res = await request(app).get('/read-students');
      expect(res.status).toBe(403);
    });

    it('19. PARENT systemRole without explicit role permission -> denied with 403', async () => {
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        students: { canRead: false, canCreate: false, canEdit: false, canDelete: false }
      });

      const app = createTestApp({ id: 'parent-1', schoolId: 's1', systemRole: 'PARENT' });
      const res = await request(app).get('/read-students');
      expect(res.status).toBe(403);
    });

    it('20. STUDENT systemRole without explicit role permission -> denied with 403', async () => {
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        students: { canRead: false, canCreate: false, canEdit: false, canDelete: false }
      });

      const app = createTestApp({ id: 'student-1', schoolId: 's1', systemRole: 'STUDENT' });
      const res = await request(app).get('/read-students');
      expect(res.status).toBe(403);
    });
  });

  describe('5. Multi-Permission Signature Semantics (ALL-of)', () => {
    it('21. Conjunctive AND: All required permissions present -> 200 OK', async () => {
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        students: { canRead: true, canCreate: false, canEdit: false, canDelete: false },
        attendance: { canRead: true, canCreate: true, canEdit: false, canDelete: false }
      });

      const app = createTestApp({ id: 'u1', schoolId: 's1', systemRole: 'TEACHER' });
      const res = await request(app).get('/multi-permission');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('22. Conjunctive AND: Missing second permission -> denied with 403', async () => {
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        students: { canRead: true, canCreate: false, canEdit: false, canDelete: false },
        attendance: { canRead: false, canCreate: false, canEdit: false, canDelete: false }
      });

      const app = createTestApp({ id: 'u1', schoolId: 's1', systemRole: 'TEACHER' });
      const res = await request(app).get('/multi-permission');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain("missing 'read' permission for module 'attendance'");
    });

    it('23. Conjunctive AND: Missing first permission -> denied with 403', async () => {
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        students: { canRead: false, canCreate: false, canEdit: false, canDelete: false },
        attendance: { canRead: true, canCreate: true, canEdit: false, canDelete: false }
      });

      const app = createTestApp({ id: 'u1', schoolId: 's1', systemRole: 'TEACHER' });
      const res = await request(app).get('/multi-permission');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain("missing 'read' permission for module 'students'");
    });
  });

  describe('6. Module & Operation Validation', () => {
    it('24. Rejects unknown module key with 400 validation error', () => {
      expect(() => requirePermission('unknown_mod', 'read')).toThrow('Invalid RBAC module key');
    });

    it('25. Rejects unknown operation with 400 validation error', () => {
      expect(() => requirePermission('students', 'export_all')).toThrow('Invalid RBAC operation');
    });

    it('26. Rejects empty arguments with 400 validation error', () => {
      expect(() => requirePermission()).toThrow('Permission requirement must specify at least one module and operation');
    });

    it('27. Rejects invalid token format with 400 validation error', () => {
      expect(() => requirePermission('invalidtokenwithoutcolon')).toThrow('Invalid permission requirement format');
    });
  });

  describe('7. Security Invariants & Anti-Poisoning', () => {
    it('28. Client-provided req.user.permissions is ignored in favor of PostgreSQL/Redis RBAC', async () => {
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        students: { canRead: false, canCreate: false, canEdit: false, canDelete: false }
      });

      const app = createTestApp({
        id: 'attacker-1',
        schoolId: 's1',
        systemRole: 'TEACHER',
        permissions: { students: { canRead: true } } // Forged client permission
      });

      const res = await request(app).get('/read-students');
      expect(res.status).toBe(403);
    });

    it('29. Database lookup failure propagates 500 internal error and never fails open', async () => {
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockRejectedValue(new Error('PostgreSQL database connection failure'));

      const app = createTestApp({ id: 'u1', schoolId: 's1', systemRole: 'TEACHER' });
      const res = await request(app).get('/read-students');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('8. requireRole Middleware Contract', () => {
    it('Allows user with matching systemRole', async () => {
      const app = createTestApp({ id: 'u1', role: 'PRINCIPAL' });
      const res = await request(app).get('/admin-only');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('Rejects user with non-matching systemRole with 403', async () => {
      const app = createTestApp({ id: 'u1', role: 'STUDENT' });
      const res = await request(app).get('/admin-only');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('Super Admin bypasses requireRole checks', async () => {
      const app = createTestApp({ id: 'super-1', role: 'SUPER_ADMIN' });
      const res = await request(app).get('/admin-only');
      expect(res.status).toBe(200);
    });
  });
});
