import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { tenantContext } from '../../src/middleware/tenant.middleware.js';
import { errorMiddleware } from '../../src/middleware/error.middleware.js';
import * as authRepository from '../../src/modules/auth/auth.repository.js';
import { getTenantContext } from '../../src/database/prisma.client.js';

describe('Security: SuperAdmin Tenant Switching & Strict Isolation (tenant.middleware.js)', () => {
  const SCHOOL_A = '11111111-1111-4111-8111-111111111111';
  const SCHOOL_B = '22222222-2222-4222-8222-222222222222';
  const NONEXISTENT_SCHOOL = '99999999-9999-4999-8999-999999999999';

  const mockTargetSchool = {
    id: SCHOOL_B,
    name: 'Target International Academy',
    code: 'SchoolS015',
    status: 'active'
  };

  const createTestApp = (mockUser) => {
    const app = express();
    app.use(express.json());

    // Inject mock authenticated context
    app.use((req, _res, next) => {
      req.auth = mockUser;
      req.user = mockUser;
      next();
    });

    app.post('/tenant-endpoint', tenantContext(), (req, res) => {
      const activePrismaContext = getTenantContext();
      res.json({
        success: true,
        tenant: req.tenant,
        activePrismaSchoolId: activePrismaContext?.schoolId || null,
        bypassTenant: activePrismaContext?.bypassTenant || false
      });
    });

    app.use(errorMiddleware);
    return app;
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Normal Institutional User Isolation', () => {
    const normalUser = {
      userId: 'user-normal-1',
      id: 'user-normal-1',
      schoolId: SCHOOL_A,
      systemRole: 'TENANT_USER',
      role: 'TENANT_USER'
    };

    it('resolves tenant context strictly from authenticated user.schoolId', async () => {
      const app = createTestApp(normalUser);
      const res = await request(app).post('/tenant-endpoint').send({});

      expect(res.status).toBe(200);
      expect(res.body.tenant.schoolId).toBe(SCHOOL_A);
      expect(res.body.tenant.isSuperAdminSwitch).toBe(false);
      expect(res.body.activePrismaSchoolId).toBe(SCHOOL_A);
    });

    it('strictly REJECTS normal user attempting to switch tenant via X-Tenant-Id header', async () => {
      const app = createTestApp(normalUser);
      const res = await request(app)
        .post('/tenant-endpoint')
        .set('X-Tenant-Id', SCHOOL_B)
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('TENANT_ACCESS_ERROR');
      expect(res.body.error.message).toContain('Unauthorized tenant switch attempt');
    });

    it('strictly REJECTS normal user attempting to switch tenant via X-School-Id header', async () => {
      const app = createTestApp(normalUser);
      const res = await request(app)
        .post('/tenant-endpoint')
        .set('X-School-Id', SCHOOL_B)
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('TENANT_ACCESS_ERROR');
      expect(res.body.error.message).toContain('Unauthorized tenant switch attempt');
    });

    it('strictly REJECTS normal user attempting to override tenant via request body schoolId', async () => {
      const app = createTestApp(normalUser);
      const res = await request(app)
        .post('/tenant-endpoint')
        .send({ schoolId: SCHOOL_B });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('TENANT_ACCESS_ERROR');
      expect(res.body.error.message).toContain('Cross-tenant access rejected');
    });

    it('strictly REJECTS normal user attempting to override tenant via query parameter schoolId', async () => {
      const app = createTestApp(normalUser);
      const res = await request(app)
        .post(`/tenant-endpoint?schoolId=${SCHOOL_B}`)
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('TENANT_ACCESS_ERROR');
    });
  });

  describe('SuperAdmin Secure Tenant Switching', () => {
    const superAdminUser = {
      userId: 'super-admin-root',
      id: 'super-admin-root',
      schoolId: null,
      systemRole: 'SUPER_ADMIN',
      role: 'SUPER_ADMIN'
    };

    it('operates in global platform context (bypassTenant: true) when no X-Tenant-Id is sent', async () => {
      const app = createTestApp(superAdminUser);
      const res = await request(app).post('/tenant-endpoint').send({});

      expect(res.status).toBe(200);
      expect(res.body.tenant.schoolId).toBeNull();
      expect(res.body.tenant.bypassTenant).toBe(true);
      expect(res.body.activePrismaSchoolId).toBeNull();
      expect(res.body.bypassTenant).toBe(true);
    });

    it('switches tenant context when SuperAdmin supplies valid X-Tenant-Id for an existing school', async () => {
      const app = createTestApp(superAdminUser);
      vi.spyOn(authRepository, 'findSchoolById').mockResolvedValue(mockTargetSchool);

      const res = await request(app)
        .post('/tenant-endpoint')
        .set('X-Tenant-Id', SCHOOL_B)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.tenant.schoolId).toBe(SCHOOL_B);
      expect(res.body.tenant.switchedBy).toBe(superAdminUser.id);
      expect(res.body.tenant.isSuperAdminSwitch).toBe(true);
      expect(res.body.activePrismaSchoolId).toBe(SCHOOL_B);
      expect(authRepository.findSchoolById).toHaveBeenCalledWith(SCHOOL_B);
    });

    it('rejects SuperAdmin tenant switch when X-Tenant-Id is a malformed UUID', async () => {
      const app = createTestApp(superAdminUser);

      const res = await request(app)
        .post('/tenant-endpoint')
        .set('X-Tenant-Id', 'not-a-valid-uuid')
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('TENANT_ACCESS_ERROR');
      expect(res.body.error.message).toContain('must be a valid UUID');
    });

    it('rejects SuperAdmin tenant switch when target school does not exist in PostgreSQL', async () => {
      const app = createTestApp(superAdminUser);
      vi.spyOn(authRepository, 'findSchoolById').mockResolvedValue(null);

      const res = await request(app)
        .post('/tenant-endpoint')
        .set('X-Tenant-Id', NONEXISTENT_SCHOOL)
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('TENANT_ACCESS_ERROR');
      expect(res.body.error.message).toContain('Target school tenant not found');
    });
  });

  describe('Unauthenticated Tenant Rejection', () => {
    it('rejects unauthenticated request when tenant context is required', async () => {
      const app = createTestApp(null);
      const res = await request(app).post('/tenant-endpoint').send({});

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('TENANT_ACCESS_ERROR');
    });
  });
});
