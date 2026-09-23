import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { canteenRoutes } from '../../../src/modules/canteen/canteen.routes.js';
import * as canteenRepository from '../../../src/modules/canteen/canteen.repository.js';
import * as auditRepository from '../../../src/modules/audit/audit.repository.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';

vi.mock('../../../src/middleware/auth.middleware.js', () => ({
  authenticate: (req, _res, next) => {
    // If mockUser is set on test, attach to req.auth & req.user
    if (req.headers['x-mock-unauthenticated'] === 'true') {
      return _res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const role = req.headers['x-mock-role'] || 'ADMIN';
    const schoolId = req.headers['x-mock-school-id'] || '11111111-1111-4111-8111-111111111111';
    const userId = req.headers['x-mock-user-id'] || 'user-123';
    req.auth = { userId, schoolId, systemRole: role, role };
    req.user = req.auth;
    next();
  }
}));

vi.mock('../../../src/middleware/tenant.middleware.js', () => ({
  tenantContext: () => (req, _res, next) => {
    if (!req.auth?.schoolId) {
      return _res.status(400).json({ success: false, error: 'Tenant required' });
    }
    req.tenant = { schoolId: req.auth.schoolId };
    next();
  }
}));

describe('Canteen Routes RBAC & Security (Phase 7)', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  let app;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(auditRepository, 'createAuditLog').mockResolvedValue({});
    vi.spyOn(canteenRepository, 'runTransaction').mockImplementation(async (cb) => cb(canteenRepository));
    app = express();
    app.use(express.json());
    app.use('/api/v1/canteen', canteenRoutes);
  });

  it('allows SCHOOL_ADMIN to access GET /api/v1/canteen/pending-count', async () => {
    vi.spyOn(canteenRepository, 'countPendingCanteenRequests').mockResolvedValue(5);

    const res = await request(app)
      .get('/api/v1/canteen/pending-count')
      .set('x-mock-role', SYSTEM_ROLES.SCHOOL_ADMIN)
      .set('x-mock-school-id', SCHOOL_ID);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.count).toBe(5);
  });

  it('allows TEACHER to access GET /api/v1/canteen/pending-count', async () => {
    vi.spyOn(canteenRepository, 'countPendingCanteenRequests').mockResolvedValue(3);

    const res = await request(app)
      .get('/api/v1/canteen/pending-count')
      .set('x-mock-role', SYSTEM_ROLES.TEACHER)
      .set('x-mock-school-id', SCHOOL_ID);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.count).toBe(3);
  });

  it('allows STAFF to access GET /api/v1/canteen/pending-count', async () => {
    vi.spyOn(canteenRepository, 'countPendingCanteenRequests').mockResolvedValue(2);

    const res = await request(app)
      .get('/api/v1/canteen/pending-count')
      .set('x-mock-role', SYSTEM_ROLES.STAFF)
      .set('x-mock-school-id', SCHOOL_ID);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.count).toBe(2);
  });

  it('allows PRINCIPAL to access GET /api/v1/canteen/pending-count', async () => {
    vi.spyOn(canteenRepository, 'countPendingCanteenRequests').mockResolvedValue(1);

    const res = await request(app)
      .get('/api/v1/canteen/pending-count')
      .set('x-mock-role', SYSTEM_ROLES.PRINCIPAL)
      .set('x-mock-school-id', SCHOOL_ID);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.count).toBe(1);
  });

  it('allows SUPER_ADMIN to access GET /api/v1/canteen/pending-count via universal platform admin bypass', async () => {
    vi.spyOn(canteenRepository, 'countPendingCanteenRequests').mockResolvedValue(0);

    const res = await request(app)
      .get('/api/v1/canteen/pending-count')
      .set('x-mock-role', SYSTEM_ROLES.SUPER_ADMIN)
      .set('x-mock-school-id', SCHOOL_ID);

    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(0);
  });

  it('rejects PARENT with 403 Forbidden', async () => {
    const res = await request(app)
      .get('/api/v1/canteen/pending-count')
      .set('x-mock-role', SYSTEM_ROLES.PARENT)
      .set('x-mock-school-id', SCHOOL_ID);

    expect(res.status).toBe(403);
  });

  it('rejects STUDENT with 403 Forbidden', async () => {
    const res = await request(app)
      .get('/api/v1/canteen/pending-count')
      .set('x-mock-role', SYSTEM_ROLES.STUDENT)
      .set('x-mock-school-id', SCHOOL_ID);

    expect(res.status).toBe(403);
  });

  it('rejects unrelated role with 403 Forbidden', async () => {
    const res = await request(app)
      .get('/api/v1/canteen/pending-count')
      .set('x-mock-role', 'ANONYMOUS_GUEST')
      .set('x-mock-school-id', SCHOOL_ID);

    expect(res.status).toBe(403);
  });

  it('strictly isolates tenant count and ignores client spoofed query parameters', async () => {
    const countSpy = vi.spyOn(canteenRepository, 'countPendingCanteenRequests').mockResolvedValue(2);
    const FOREIGN_SCHOOL_ID = '99999999-9999-4999-8999-999999999999';

    const res = await request(app)
      .get(`/api/v1/canteen/pending-count?schoolId=${FOREIGN_SCHOOL_ID}&tenantId=${FOREIGN_SCHOOL_ID}`)
      .set('x-mock-role', SYSTEM_ROLES.STAFF)
      .set('x-mock-school-id', SCHOOL_ID);

    expect(res.status).toBe(200);
    // Repository must ONLY be called with authenticated tenant SCHOOL_ID, never foreign ID
    expect(countSpy).toHaveBeenCalledWith(SCHOOL_ID);
    expect(countSpy).not.toHaveBeenCalledWith(FOREIGN_SCHOOL_ID);
  });

  it('rejects unauthenticated requests with 401 Unauthorized', async () => {
    const res = await request(app)
      .get('/api/v1/canteen/pending-count')
      .set('x-mock-unauthenticated', 'true');

    expect(res.status).toBe(401);
  });

  describe('GET /api/v1/canteen/requests', () => {
    it('allows Parent to list requests', async () => {
      vi.spyOn(canteenRepository, 'findAuthorizedStudentIdsForParent').mockResolvedValue(['22222222-2222-4222-8222-222222222222']);
      vi.spyOn(canteenRepository, 'findCanteenRequests').mockResolvedValue([]);

      const res = await request(app)
        .get('/api/v1/canteen/requests')
        .set('x-mock-role', SYSTEM_ROLES.PARENT)
        .set('x-mock-school-id', SCHOOL_ID);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
    });

    it('allows Staff with canteen.read permission', async () => {
      vi.spyOn(canteenRepository, 'findCanteenRequests').mockResolvedValue([]);

      const res = await request(app)
        .get('/api/v1/canteen/requests')
        .set('x-mock-role', SYSTEM_ROLES.STAFF)
        .set('x-mock-school-id', SCHOOL_ID);

      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/v1/canteen/requests', () => {
    it('allows Parent to create request for linked child', async () => {
      const studentId = '22222222-2222-4222-8222-222222222222';
      vi.spyOn(canteenRepository, 'findAuthorizedStudentIdsForParent').mockResolvedValue([studentId]);
      vi.spyOn(canteenRepository, 'acquireAdvisoryLock').mockResolvedValue(undefined);
      vi.spyOn(canteenRepository, 'lockStudentForUpdate').mockResolvedValue({ id: studentId });
      vi.spyOn(canteenRepository, 'findActiveCanteenRequest').mockResolvedValue(null);
      vi.spyOn(canteenRepository, 'createCanteenRequest').mockResolvedValue({
        id: '33333333-3333-4333-8333-333333333333',
        schoolId: SCHOOL_ID,
        studentId,
        itemDetails: { mealType: 'Breakfast', date: '2026-09-16' },
        status: 'Pending',
        totalAmount: 0
      });

      const res = await request(app)
        .post('/api/v1/canteen/requests')
        .set('x-mock-role', SYSTEM_ROLES.PARENT)
        .set('x-mock-school-id', SCHOOL_ID)
        .send({
          studentId,
          mealType: 'Breakfast',
          date: '2026-09-16'
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('Pending');
    });
  });

  describe('PATCH /api/v1/canteen/requests/:id/status', () => {
    it('allows Parent to cancel own pending request', async () => {
      const studentId = '22222222-2222-4222-8222-222222222222';
      const reqId = '33333333-3333-4333-8333-333333333333';
      vi.spyOn(canteenRepository, 'lockCanteenRequestForUpdate').mockResolvedValue({
        id: reqId,
        schoolId: SCHOOL_ID,
        studentId,
        status: 'Pending'
      });
      vi.spyOn(canteenRepository, 'findAuthorizedStudentIdsForParent').mockResolvedValue([studentId]);
      vi.spyOn(canteenRepository, 'updateCanteenRequestStatus').mockResolvedValue({
        id: reqId,
        schoolId: SCHOOL_ID,
        studentId,
        status: 'Cancelled',
        itemDetails: { resolvedAt: '2026-09-16T12:00:00Z' }
      });

      const res = await request(app)
        .patch(`/api/v1/canteen/requests/${reqId}/status`)
        .set('x-mock-role', SYSTEM_ROLES.PARENT)
        .set('x-mock-school-id', SCHOOL_ID)
        .send({
          status: 'Cancelled'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('Cancelled');
    });
  });
});
