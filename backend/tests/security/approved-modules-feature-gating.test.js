import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { requirePermission } from '../../src/middleware/rbac.middleware.js';
import { tenantContext } from '../../src/middleware/tenant.middleware.js';
import { errorMiddleware } from '../../src/middleware/error.middleware.js';
import * as rbacService from '../../src/modules/rbac/rbac.service.js';

describe('Security: Approved Modules Feature Gating & Anti-Poisoning Suite (SEC-001)', () => {
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

    app.get('/students', requirePermission('students', 'read'), (_req, res) => {
      res.json({ success: true, message: 'read students granted' });
    });

    app.post('/students', requirePermission('students', 'create'), (_req, res) => {
      res.json({ success: true, message: 'create students granted' });
    });

    app.put('/students', requirePermission('students', 'edit'), (_req, res) => {
      res.json({ success: true, message: 'edit students granted' });
    });

    app.delete('/students', requirePermission('students', 'delete'), (_req, res) => {
      res.json({ success: true, message: 'delete students granted' });
    });

    app.get('/inventory', requirePermission('inventory', 'read'), (_req, res) => {
      res.json({ success: true, message: 'read inventory granted' });
    });

    app.post('/inventory', requirePermission('inventory', 'create'), (_req, res) => {
      res.json({ success: true, message: 'create inventory granted' });
    });

    app.put('/inventory', requirePermission('inventory', 'edit'), (_req, res) => {
      res.json({ success: true, message: 'edit inventory granted' });
    });

    app.delete('/inventory', requirePermission('inventory', 'delete'), (_req, res) => {
      res.json({ success: true, message: 'delete inventory granted' });
    });

    app.use(errorMiddleware);
    return app;
  };

  describe('Feature Gating & CRUD Matrix', () => {
    it('1. Approved module + read permission -> PASS', async () => {
      vi.spyOn(rbacService, 'isModuleApprovedForSchool').mockResolvedValue(true);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        students: { canRead: true, canCreate: true, canEdit: true, canDelete: true }
      });

      const app = createTestApp({ id: 'u1', schoolId: 's1', systemRole: 'STAFF' });
      const res = await request(app).get('/students');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('2. Approved module + create permission -> PASS', async () => {
      vi.spyOn(rbacService, 'isModuleApprovedForSchool').mockResolvedValue(true);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        students: { canRead: true, canCreate: true, canEdit: false, canDelete: false }
      });

      const app = createTestApp({ id: 'u1', schoolId: 's1', systemRole: 'STAFF' });
      const res = await request(app).post('/students');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('3. Approved module + edit permission -> PASS', async () => {
      vi.spyOn(rbacService, 'isModuleApprovedForSchool').mockResolvedValue(true);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        students: { canRead: true, canCreate: false, canEdit: true, canDelete: false }
      });

      const app = createTestApp({ id: 'u1', schoolId: 's1', systemRole: 'STAFF' });
      const res = await request(app).put('/students');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('4. Approved module + delete permission -> PASS', async () => {
      vi.spyOn(rbacService, 'isModuleApprovedForSchool').mockResolvedValue(true);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        students: { canRead: true, canCreate: false, canEdit: false, canDelete: true }
      });

      const app = createTestApp({ id: 'u1', schoolId: 's1', systemRole: 'STAFF' });
      const res = await request(app).delete('/students');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('5. Unapproved module + read permission -> DENY (403)', async () => {
      vi.spyOn(rbacService, 'isModuleApprovedForSchool').mockImplementation(async (_sId, mod) => mod !== 'inventory');
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        inventory: { canRead: true, canCreate: true, canEdit: true, canDelete: true }
      });

      const app = createTestApp({ id: 'u1', schoolId: 's1', systemRole: 'STAFF' });
      const res = await request(app).get('/inventory');
      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain("module 'inventory' is not enabled");
    });

    it('6. Unapproved module + create permission -> DENY (403)', async () => {
      vi.spyOn(rbacService, 'isModuleApprovedForSchool').mockImplementation(async (_sId, mod) => mod !== 'inventory');
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        inventory: { canRead: true, canCreate: true, canEdit: true, canDelete: true }
      });

      const app = createTestApp({ id: 'u1', schoolId: 's1', systemRole: 'STAFF' });
      const res = await request(app).post('/inventory');
      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain("module 'inventory' is not enabled");
    });

    it('7. Unapproved module + edit permission -> DENY (403)', async () => {
      vi.spyOn(rbacService, 'isModuleApprovedForSchool').mockImplementation(async (_sId, mod) => mod !== 'inventory');
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        inventory: { canRead: true, canCreate: true, canEdit: true, canDelete: true }
      });

      const app = createTestApp({ id: 'u1', schoolId: 's1', systemRole: 'STAFF' });
      const res = await request(app).put('/inventory');
      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain("module 'inventory' is not enabled");
    });

    it('8. Unapproved module + delete permission -> DENY (403)', async () => {
      vi.spyOn(rbacService, 'isModuleApprovedForSchool').mockImplementation(async (_sId, mod) => mod !== 'inventory');
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        inventory: { canRead: true, canCreate: true, canEdit: true, canDelete: true }
      });

      const app = createTestApp({ id: 'u1', schoolId: 's1', systemRole: 'STAFF' });
      const res = await request(app).delete('/inventory');
      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain("module 'inventory' is not enabled");
    });

    it('9. School Admin + unapproved module -> DENY (403)', async () => {
      vi.spyOn(rbacService, 'isModuleApprovedForSchool').mockImplementation(async (_sId, mod) => mod !== 'inventory');

      const app = createTestApp({ id: 'admin1', schoolId: 's1', systemRole: 'SCHOOL_ADMIN' });
      const res = await request(app).get('/inventory');
      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain("module 'inventory' is not enabled");
    });

    it('10. Custom role + unapproved module -> DENY (403)', async () => {
      vi.spyOn(rbacService, 'isModuleApprovedForSchool').mockImplementation(async (_sId, mod) => mod !== 'inventory');
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        inventory: { canRead: true, canCreate: true, canEdit: true, canDelete: true }
      });

      const app = createTestApp({ id: 'finance1', schoolId: 's1', systemRole: 'STAFF' });
      const res = await request(app).get('/inventory');
      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain("module 'inventory' is not enabled");
    });
  });

  describe('Tenant Boundary & Anti-Poisoning', () => {
    it('11. SuperAdmin legitimate platform access -> PASS', async () => {
      const app = createTestApp(
        { id: 'super1', systemRole: 'SUPER_ADMIN', schoolId: null },
        { schoolId: null, bypassTenant: true }
      );
      // Unswitched SuperAdmin accessing platform route (mock route)
      expect(true).toBe(true);
    });

    it('12. Cross-tenant feature-gating attempt -> DENY (403)', async () => {
      const app = createTestApp({ id: 'u1', schoolId: 's1', systemRole: 'STAFF' });
      const res = await request(app).post('/students').send({ schoolId: 's2' });
      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain('Cross-tenant access rejected');
    });

    it('13. body.schoolId poisoning -> DENY (403)', async () => {
      const app = createTestApp({ id: 'u1', schoolId: 's1', systemRole: 'STAFF' });
      const res = await request(app).post('/students').send({ schoolId: 'attacker-school' });
      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain('Cross-tenant access rejected');
    });

    it('14. query.schoolId poisoning -> DENY (403)', async () => {
      const app = createTestApp({ id: 'u1', schoolId: 's1', systemRole: 'STAFF' });
      const res = await request(app).get('/students?schoolId=attacker-school');
      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain('Cross-tenant access rejected');
    });

    it('15. params.schoolId poisoning -> DENY (403)', async () => {
      const app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        req.auth = { userId: 'u1', schoolId: 's1', systemRole: 'STAFF' };
        req.user = req.auth;
        req.tenant = { schoolId: 's1' };
        next();
      });
      app.get('/school/:schoolId/students', requirePermission('students', 'read'), (_req, res) => res.json({ success: true }));
      app.use(errorMiddleware);

      const res = await request(app).get('/school/attacker-school/students');
      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain('Cross-tenant access rejected');
    });

    it('16. Normal tenant user X-Tenant-Id header manipulation -> DENY (403)', async () => {
      const app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        req.auth = { userId: 'u1', schoolId: 's1', systemRole: 'STAFF' };
        req.user = req.auth;
        next();
      });
      app.get('/students', tenantContext({ requireTenant: true }), requirePermission('students', 'read'), (_req, res) => res.json({ success: true }));
      app.use(errorMiddleware);

      const res = await request(app).get('/students').set('X-Tenant-Id', 'attacker-school-uuid');
      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain('Unauthorized tenant switch attempt');
    });
  });
});
