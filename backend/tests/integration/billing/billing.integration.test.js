import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import * as authRepository from '../../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../../src/modules/auth/token.service.js';
import * as billingRepo from '../../../src/modules/billing/billing.repository.js';
import * as auditRepo from '../../../src/modules/audit/audit.repository.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';

describe('Tenant Billing & Plans Integration Tests (Phase BILLING.2)', () => {
  const app = createApp();

  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const PLAN_ID = '22222222-2222-4222-8222-222222222222';
  const TARGET_PLAN_ID = '33333333-3333-4333-8333-333333333333';

  const mockAdminUser = {
    id: 'user-admin-1',
    schoolId: SCHOOL_ID,
    email: 'admin@greenwood.edu',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_ID, name: 'Greenwood High', code: 'GW-01', status: 'approved' }
  };

  const getAuthToken = (user = mockAdminUser) => {
    return tokenService.issueAccessToken({
      sub: user.id,
      schoolId: user.schoolId,
      systemRole: user.systemRole,
      tokenVersion: user.tokenVersion
    });
  };

  const mockPlan = {
    id: PLAN_ID,
    name: 'Standard Plan',
    userLimit: 600,
    pricePerUserPerYear: '240.00',
    cloudStorageGB: 60,
    modules: { timetable: true, library: true },
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockTargetPlan = {
    id: TARGET_PLAN_ID,
    name: 'Premium Plan',
    userLimit: 1200,
    pricePerUserPerYear: '320.00',
    cloudStorageGB: 120,
    modules: { timetable: true, library: true, lms: true },
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockSchool = {
    id: SCHOOL_ID,
    name: 'Greenwood High',
    code: 'GW-01',
    status: 'approved',
    seatLimit: 600,
    teacherLimit: 60,
    planId: PLAN_ID,
    plan: mockPlan
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
  });

  describe('1. GET /api/v1/billing/plans', () => {
    it('returns all active subscription plans for authenticated tenant user', async () => {
      vi.spyOn(billingRepo, 'findActivePlans').mockResolvedValue([mockPlan, mockTargetPlan]);

      const token = getAuthToken();
      const res = await request(app)
        .get('/api/v1/billing/plans')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].name).toBe('Standard Plan');
      expect(res.body.data[0].pricePerUserPerYear).toBe(240);
      expect(res.body.data[1].name).toBe('Premium Plan');
      expect(res.body.data[1].pricePerUserPerYear).toBe(320);
    });

    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/v1/billing/plans');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('2. GET /api/v1/public/plans', () => {
    it('returns active plans without authentication or tenant context', async () => {
      vi.spyOn(billingRepo, 'findActivePlans').mockResolvedValue([mockPlan, mockTargetPlan]);

      const res = await request(app).get('/api/v1/public/plans');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].name).toBe('Standard Plan');
      expect(res.body.data[0]).not.toHaveProperty('createdAt');
      expect(res.body.data[0]).not.toHaveProperty('schoolId');
    });
  });

  describe('3. GET /api/v1/billing/current', () => {
    it('returns the current tenant plan, billing cycle, server-calculated total, and usage', async () => {
      vi.spyOn(billingRepo, 'findSchoolBillingInfo').mockResolvedValue(mockSchool);
      vi.spyOn(billingRepo, 'findBillingSetting').mockResolvedValue({
        data: { billingCycle: 'yearly', subscriptionStatus: 'active' }
      });
      vi.spyOn(billingRepo, 'getTenantUsageCounts').mockResolvedValue({
        studentsCount: 350,
        staffCount: 30
      });

      const token = getAuthToken();
      const res = await request(app)
        .get('/api/v1/billing/current')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.schoolId).toBe(SCHOOL_ID);
      expect(res.body.data.plan.name).toBe('Standard Plan');
      expect(res.body.data.billingCycle).toBe('yearly');
      expect(res.body.data.subscriptionStatus).toBe('active');
      expect(res.body.data.calculatedTotalAmount).toBe(240); // yearly price
      expect(res.body.data.usage.students).toBe(350);
      expect(res.body.data.usage.staff).toBe(30);
    });
  });

  describe('4. PATCH /api/v1/billing/upgrade', () => {
    it('upgrades the subscription plan, updates SchoolSetting, and records audit log', async () => {
      vi.spyOn(billingRepo, 'findPlanById').mockResolvedValue(mockTargetPlan);
      vi.spyOn(billingRepo, 'findSchoolBillingInfo')
        .mockResolvedValueOnce(mockSchool)
        .mockResolvedValue({ ...mockSchool, planId: TARGET_PLAN_ID, plan: mockTargetPlan });
      vi.spyOn(billingRepo, 'findBillingSetting').mockResolvedValue({
        data: { billingCycle: 'monthly', subscriptionStatus: 'active' }
      });
      vi.spyOn(billingRepo, 'getTenantUsageCounts').mockResolvedValue({
        studentsCount: 350,
        staffCount: 30
      });
      vi.spyOn(billingRepo, 'executeTransaction').mockImplementation(async (cb) => cb({}));
      const updateSchoolSpy = vi.spyOn(billingRepo, 'updateSchoolPlan').mockResolvedValue({});
      const upsertSettingSpy = vi.spyOn(billingRepo, 'upsertBillingSetting').mockResolvedValue({});
      const auditSpy = vi.spyOn(auditRepo, 'createAuditLog').mockResolvedValue({});

      const token = getAuthToken();
      const res = await request(app)
        .patch('/api/v1/billing/upgrade')
        .set('Authorization', `Bearer ${token}`)
        .send({
          planId: TARGET_PLAN_ID,
          billingCycle: 'yearly'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(updateSchoolSpy).toHaveBeenCalledWith(SCHOOL_ID, TARGET_PLAN_ID, expect.anything());
      expect(upsertSettingSpy).toHaveBeenCalledWith(
        SCHOOL_ID,
        expect.objectContaining({ billingCycle: 'yearly', subscriptionStatus: 'active' }),
        expect.anything()
      );
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          schoolId: SCHOOL_ID,
          entityType: 'SubscriptionPlan',
          entityId: TARGET_PLAN_ID,
          actionPerformed: expect.stringContaining('Changed subscription plan to Premium Plan (yearly)')
        }),
        expect.anything()
      );
    });

    it('rejects upgrade to non-existent plan with 404', async () => {
      vi.spyOn(billingRepo, 'findPlanById').mockResolvedValue(null);

      const token = getAuthToken();
      const res = await request(app)
        .patch('/api/v1/billing/upgrade')
        .set('Authorization', `Bearer ${token}`)
        .send({
          planId: '99999999-9999-4999-8999-999999999999',
          billingCycle: 'monthly'
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error?.message).toContain('not found');
    });

    it('rejects upgrade to inactive plan with 400', async () => {
      vi.spyOn(billingRepo, 'findPlanById').mockResolvedValue({
        ...mockTargetPlan,
        isActive: false
      });

      const token = getAuthToken();
      const res = await request(app)
        .patch('/api/v1/billing/upgrade')
        .set('Authorization', `Bearer ${token}`)
        .send({
          planId: TARGET_PLAN_ID,
          billingCycle: 'monthly'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error?.message).toContain('inactive subscription plan');
    });
  });
});
