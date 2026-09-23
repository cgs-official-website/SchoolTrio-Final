import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { tenantContext } from '../../src/middleware/tenant.middleware.js';
import { errorMiddleware } from '../../src/middleware/error.middleware.js';
import { getTenantContext } from '../../src/database/prisma.client.js';

describe('Security: Tenant Middleware Isolation & Boundaries', () => {
  const SCHOOL_A = '11111111-1111-1111-1111-111111111111';
  const SCHOOL_B = '22222222-2222-2222-2222-222222222222';

  const createTestApp = (mockUserFn) => {
    const app = express();
    app.use(express.json());

    // Inject mock authenticated user context
    app.use((req, _res, next) => {
      req.user = mockUserFn ? mockUserFn(req) : null;
      next();
    });

    app.post('/tenant-protected', tenantContext(), (_req, res) => {
      const activeContext = getTenantContext();
      res.json({
        success: true,
        activeSchoolId: activeContext?.schoolId,
        bypassTenant: activeContext?.bypassTenant || false
      });
    });

    app.use(errorMiddleware);
    return app;
  };

  it('Binds authoritative req.user.schoolId into tenant execution context', async () => {
    const app = createTestApp(() => ({
      id: 'user-1',
      schoolId: SCHOOL_A,
      role: 'TEACHER'
    }));

    const res = await request(app)
      .post('/tenant-protected')
      .send({ someField: 'data' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.activeSchoolId).toBe(SCHOOL_A);
  });

  it('Rejects cross-tenant poisoning when body specifies conflicting schoolId', async () => {
    const app = createTestApp(() => ({
      id: 'user-1',
      schoolId: SCHOOL_A,
      role: 'TEACHER'
    }));

    const res = await request(app)
      .post('/tenant-protected')
      .send({ schoolId: SCHOOL_B }); // Attacker attempts to spoof School B

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('TENANT_ACCESS_ERROR');
    expect(res.body.error.message).toContain('Cross-tenant access rejected');
  });

  it('Rejects cross-tenant poisoning when query specifies conflicting schoolId', async () => {
    const app = createTestApp(() => ({
      id: 'user-1',
      schoolId: SCHOOL_A,
      role: 'TEACHER'
    }));

    const res = await request(app)
      .post(`/tenant-protected?schoolId=${SCHOOL_B}`)
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('TENANT_ACCESS_ERROR');
  });

  it('Rejects request when authenticated user has no school association', async () => {
    const app = createTestApp(() => ({
      id: 'user-no-school',
      schoolId: null,
      role: 'TENANT_USER'
    }));

    const res = await request(app).post('/tenant-protected').send({});

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('TENANT_ACCESS_ERROR');
  });

  it('Allows Super Admin with bypassTenant context', async () => {
    const app = createTestApp(() => ({
      id: 'super-admin-1',
      schoolId: null,
      role: 'SUPER_ADMIN'
    }));

    const res = await request(app).post('/tenant-protected').send({});

    expect(res.status).toBe(200);
    expect(res.body.bypassTenant).toBe(true);
  });
});
