import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import * as authRepository from '../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../src/modules/auth/token.service.js';
import * as billingRepo from '../../src/modules/billing/billing.repository.js';
import * as rbacService from '../../src/modules/rbac/rbac.service.js';
import { SYSTEM_ROLES } from '../../src/config/constants.js';

describe('Tenant Billing & Plans Security Test Suite (Phase BILLING.2)', () => {
  const app = createApp();

  const TENANT_A_ID = '11111111-1111-4111-8111-111111111111';
  const TENANT_B_ID = '22222222-2222-4222-8222-222222222222';
  const PLAN_ID = '33333333-3333-4333-8333-333333333333';

  const mockAdminUser = {
    id: 'user-admin-1',
    schoolId: TENANT_A_ID,
    email: 'admin@tenanta.edu',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_A_ID, name: 'Tenant A Academy', code: 'TA-01', status: 'approved' }
  };

  const mockTeacherUser = {
    id: 'user-teacher-1',
    schoolId: TENANT_A_ID,
    email: 'teacher@tenanta.edu',
    systemRole: SYSTEM_ROLES.TEACHER,
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_A_ID, name: 'Tenant A Academy', code: 'TA-01', status: 'approved' }
  };

  const mockStudentUser = {
    id: 'user-student-1',
    schoolId: TENANT_A_ID,
    email: 'student@tenanta.edu',
    systemRole: SYSTEM_ROLES.STUDENT,
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_A_ID, name: 'Tenant A Academy', code: 'TA-01', status: 'approved' }
  };

  const mockSuperAdminUser = {
    id: 'user-superadmin-1',
    schoolId: null,
    email: 'superadmin@platform.com',
    systemRole: SYSTEM_ROLES.SUPER_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: null
  };

  const getAuthToken = (user) => {
    return tokenService.issueAccessToken({
      sub: user.id,
      schoolId: user.schoolId,
      systemRole: user.systemRole,
      tokenVersion: user.tokenVersion
    });
  };

  const mockPlan = {
    id: PLAN_ID,
    name: 'Enterprise Plan',
    userLimit: 5000,
    pricePerUserPerYear: '500.00',
    cloudStorageGB: 500,
    modules: { all: true },
    isActive: true
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authRepository, 'findUserById').mockImplementation(async (id) => {
      if (id === mockSuperAdminUser.id) return mockSuperAdminUser;
      if (id === mockAdminUser.id) return mockAdminUser;
      if (id === mockTeacherUser.id) return mockTeacherUser;
      if (id === mockStudentUser.id) return mockStudentUser;
      return null;
    });
    vi.spyOn(authRepository, 'findSchoolById').mockImplementation(async (id) => {
      if (id === TENANT_A_ID) return { id: TENANT_A_ID, name: 'Tenant A Academy', code: 'TA-01', status: 'approved' };
      if (id === TENANT_B_ID) return { id: TENANT_B_ID, name: 'Tenant B Academy', code: 'TB-01', status: 'approved' };
      return null;
    });
    vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
      permissions: {}
    });
    vi.spyOn(billingRepo, 'findActivePlans').mockResolvedValue([mockPlan]);
    vi.spyOn(billingRepo, 'findPlanById').mockResolvedValue(mockPlan);
    vi.spyOn(billingRepo, 'findSchoolBillingInfo').mockResolvedValue({
      id: TENANT_A_ID,
      name: 'Tenant A Academy',
      status: 'approved',
      planId: PLAN_ID,
      plan: mockPlan
    });
    vi.spyOn(billingRepo, 'findBillingSetting').mockResolvedValue({
      data: { billingCycle: 'monthly', subscriptionStatus: 'active' }
    });
    vi.spyOn(billingRepo, 'getTenantUsageCounts').mockResolvedValue({
      studentsCount: 100,
      staffCount: 10
    });
    vi.spyOn(billingRepo, 'executeTransaction').mockImplementation(async (cb) => cb({}));
    vi.spyOn(billingRepo, 'updateSchoolPlan').mockResolvedValue({});
    vi.spyOn(billingRepo, 'upsertBillingSetting').mockResolvedValue({});
  });

  describe('1. Authentication Guard Verification', () => {
    it('rejects unauthenticated requests to /api/v1/billing/plans with 401', async () => {
      const res = await request(app).get('/api/v1/billing/plans');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('rejects unauthenticated requests to /api/v1/billing/current with 401', async () => {
      const res = await request(app).get('/api/v1/billing/current');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('rejects unauthenticated requests to /api/v1/billing/upgrade with 401', async () => {
      const res = await request(app)
        .patch('/api/v1/billing/upgrade')
        .send({ planId: PLAN_ID, billingCycle: 'yearly' });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('2. RBAC Enforcement Matrix', () => {
    it('allows SuperAdmin with explicit x-school-id header', async () => {
      const token = getAuthToken(mockSuperAdminUser);

      const res = await request(app)
        .get('/api/v1/billing/current')
        .set('Authorization', `Bearer ${token}`)
        .set('x-school-id', TENANT_A_ID);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('rejects SuperAdmin without x-school-id header on tenant-scoped route with 403 / TenantAccessError', async () => {
      const token = getAuthToken(mockSuperAdminUser);

      const res = await request(app)
        .get('/api/v1/billing/current')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('allows School Admin to view current billing and change plan', async () => {
      const token = getAuthToken(mockAdminUser);

      const readRes = await request(app)
        .get('/api/v1/billing/current')
        .set('Authorization', `Bearer ${token}`);
      expect(readRes.status).toBe(200);

      const editRes = await request(app)
        .patch('/api/v1/billing/upgrade')
        .set('Authorization', `Bearer ${token}`)
        .send({ planId: PLAN_ID, billingCycle: 'yearly' });
      expect(editRes.status).toBe(200);
    });

    it('denies Teacher without billing permissions with 403 Forbidden', async () => {
      const token = getAuthToken(mockTeacherUser);

      const res = await request(app)
        .patch('/api/v1/billing/upgrade')
        .set('Authorization', `Bearer ${token}`)
        .send({ planId: PLAN_ID, billingCycle: 'yearly' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('denies Student role with 403 Forbidden', async () => {
      const token = getAuthToken(mockStudentUser);

      const res = await request(app)
        .get('/api/v1/billing/current')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('3. Strict Tenant Isolation & Anti-Spoofing', () => {
    it('rejects client attempting to inject foreign schoolId / tenantId in request body with 403 or 400', async () => {
      const token = getAuthToken(mockAdminUser);

      const res = await request(app)
        .patch('/api/v1/billing/upgrade')
        .set('Authorization', `Bearer ${token}`)
        .send({
          planId: PLAN_ID,
          billingCycle: 'yearly',
          schoolId: TENANT_B_ID,
          tenantId: TENANT_B_ID
        });

      // Tenant middleware rejects conflicting schoolId with 403 TenantAccessError or Zod rejects with 400
      expect([400, 403]).toContain(res.status);
      expect(res.body.success).toBe(false);
    });

    it('authoritatively binds execution to req.tenant.schoolId and never targets foreign tenant', async () => {
      const updateSchoolSpy = vi.spyOn(billingRepo, 'updateSchoolPlan').mockResolvedValue({});
      const token = getAuthToken(mockAdminUser);

      const res = await request(app)
        .patch('/api/v1/billing/upgrade')
        .set('Authorization', `Bearer ${token}`)
        .send({
          planId: PLAN_ID,
          billingCycle: 'yearly'
        });

      expect(res.status).toBe(200);
      expect(updateSchoolSpy).toHaveBeenCalledWith(TENANT_A_ID, PLAN_ID, expect.anything());
      expect(updateSchoolSpy).not.toHaveBeenCalledWith(TENANT_B_ID, expect.anything(), expect.anything());
    });
  });

  describe('4. Anti-Tampering & Price Hijacking Prevention', () => {
    it('rejects client attempts to override price, amount, discount, or paymentStatus with 400', async () => {
      const token = getAuthToken(mockAdminUser);

      const res = await request(app)
        .patch('/api/v1/billing/upgrade')
        .set('Authorization', `Bearer ${token}`)
        .send({
          planId: PLAN_ID,
          billingCycle: 'yearly',
          price: 0,
          amount: 0,
          finalAmount: 0,
          discount: 100,
          paymentStatus: 'PAID',
          transactionId: 'TXN-FAKE-12345'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects inactive plan selection with 400', async () => {
      vi.spyOn(billingRepo, 'findPlanById').mockResolvedValue({
        ...mockPlan,
        isActive: false
      });
      const token = getAuthToken(mockAdminUser);

      const res = await request(app)
        .patch('/api/v1/billing/upgrade')
        .set('Authorization', `Bearer ${token}`)
        .send({
          planId: PLAN_ID,
          billingCycle: 'yearly'
        });

      expect(res.status).toBe(400);
      expect(res.body.error?.message).toContain('inactive subscription plan');
    });
  });

  describe('5. Public Endpoint Security (GET /api/v1/public/plans)', () => {
    it('is accessible without authentication and returns active plans only', async () => {
      const res = await request(app).get('/api/v1/public/plans');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('never leaks internal tenant data, credentials, or audit details in public response', async () => {
      const res = await request(app).get('/api/v1/public/plans');
      expect(res.status).toBe(200);
      const plan = res.body.data[0];
      expect(plan).not.toHaveProperty('schoolId');
      expect(plan).not.toHaveProperty('tenantId');
      expect(plan).not.toHaveProperty('createdAt');
      expect(plan).not.toHaveProperty('updatedAt');
      expect(plan).not.toHaveProperty('password');
      expect(plan).not.toHaveProperty('apiKey');
    });

    it('rejects modification attempts on public plans route with 404/405', async () => {
      const postRes = await request(app).post('/api/v1/public/plans').send({});
      expect(postRes.status).toBe(404);

      const deleteRes = await request(app).delete('/api/v1/public/plans').send({});
      expect(deleteRes.status).toBe(404);
    });
  });
});
