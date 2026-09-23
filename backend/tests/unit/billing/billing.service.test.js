import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as billingService from '../../../src/modules/billing/billing.service.js';
import * as billingRepository from '../../../src/modules/billing/billing.repository.js';
import * as auditRepository from '../../../src/modules/audit/audit.repository.js';
import { NotFoundError, ValidationError } from '../../../src/utils/app-error.js';

vi.mock('../../../src/modules/billing/billing.repository.js');
vi.mock('../../../src/modules/audit/audit.repository.js');

describe('Billing Service Unit Tests', () => {
  const schoolId = '11111111-1111-1111-1111-111111111111';
  const planId = '22222222-2222-2222-2222-222222222222';

  const mockPlan = {
    id: planId,
    name: 'Standard Plan',
    userLimit: 600,
    pricePerUserPerYear: '240.00',
    cloudStorageGB: 60,
    modules: { timetable: true },
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01')
  };

  const mockSchool = {
    id: schoolId,
    name: 'Greenwood High',
    status: 'approved',
    seatLimit: 500,
    teacherLimit: 50,
    planId: planId,
    plan: mockPlan
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getPlans', () => {
    it('returns all active plans with correctly formatted numbers', async () => {
      vi.mocked(billingRepository.findActivePlans).mockResolvedValue([mockPlan]);

      const plans = await billingService.getPlans();
      expect(plans).toHaveLength(1);
      expect(plans[0].name).toBe('Standard Plan');
      expect(plans[0].pricePerUserPerYear).toBe(240);
      expect(plans[0].isActive).toBe(true);
    });
  });

  describe('getPublicPlans', () => {
    it('returns public plan list without leaking internal timestamps', async () => {
      vi.mocked(billingRepository.findActivePlans).mockResolvedValue([mockPlan]);

      const plans = await billingService.getPublicPlans();
      expect(plans).toHaveLength(1);
      expect(plans[0].name).toBe('Standard Plan');
      expect(plans[0].pricePerUserPerYear).toBe(240);
      expect(plans[0].cloudStorageGB).toBe(60);
      expect(plans[0]).not.toHaveProperty('createdAt');
    });
  });

  describe('getCurrentBilling', () => {
    it('throws ValidationError if schoolId is missing', async () => {
      await expect(billingService.getCurrentBilling(null))
        .rejects.toThrow(ValidationError);
    });

    it('throws NotFoundError if school does not exist', async () => {
      vi.mocked(billingRepository.findSchoolBillingInfo).mockResolvedValue(null);

      await expect(billingService.getCurrentBilling(schoolId))
        .rejects.toThrow(NotFoundError);
    });

    it('returns current billing state, linked plan, usage counts, and authoritative derived cost', async () => {
      vi.mocked(billingRepository.findSchoolBillingInfo).mockResolvedValue(mockSchool);
      vi.mocked(billingRepository.findBillingSetting).mockResolvedValue({
        data: { billingCycle: 'monthly', subscriptionStatus: 'active' }
      });
      vi.mocked(billingRepository.getTenantUsageCounts).mockResolvedValue({
        studentsCount: 320,
        staffCount: 24
      });

      const result = await billingService.getCurrentBilling(schoolId);

      expect(result.schoolId).toBe(schoolId);
      expect(result.schoolName).toBe('Greenwood High');
      expect(result.plan.name).toBe('Standard Plan');
      expect(result.billingCycle).toBe('monthly');
      expect(result.subscriptionStatus).toBe('active');
      expect(result.calculatedTotalAmount).toBe(20); // 240 / 12 = 20 monthly
      expect(result.usage.students).toBe(320);
      expect(result.usage.staff).toBe(24);
    });

    it('handles school without a plan linked', async () => {
      const schoolWithoutPlan = { ...mockSchool, planId: null, plan: null };
      vi.mocked(billingRepository.findSchoolBillingInfo).mockResolvedValue(schoolWithoutPlan);
      vi.mocked(billingRepository.findBillingSetting).mockResolvedValue(null);
      vi.mocked(billingRepository.getTenantUsageCounts).mockResolvedValue({
        studentsCount: 0,
        staffCount: 0
      });

      const result = await billingService.getCurrentBilling(schoolId);

      expect(result.plan).toBeNull();
      expect(result.calculatedTotalAmount).toBe(0);
      expect(result.billingCycle).toBe('monthly');
      expect(result.subscriptionStatus).toBe('active');
    });
  });

  describe('upgradePlan', () => {
    const user = { email: 'admin@school.com', role: 'SCHOOL_ADMIN' };

    it('throws NotFoundError if target plan does not exist', async () => {
      vi.mocked(billingRepository.findPlanById).mockResolvedValue(null);

      await expect(billingService.upgradePlan(schoolId, user, { planId }))
        .rejects.toThrow(NotFoundError);
    });

    it('throws ValidationError if target plan is inactive', async () => {
      vi.mocked(billingRepository.findPlanById).mockResolvedValue({
        ...mockPlan,
        isActive: false
      });

      await expect(billingService.upgradePlan(schoolId, user, { planId }))
        .rejects.toThrow(ValidationError);
    });

    it('executes atomic plan upgrade transaction and creates audit log', async () => {
      vi.mocked(billingRepository.findPlanById).mockResolvedValue(mockPlan);
      vi.mocked(billingRepository.findSchoolBillingInfo).mockResolvedValue(mockSchool);
      vi.mocked(billingRepository.findBillingSetting).mockResolvedValue({ data: { billingCycle: 'monthly' } });
      vi.mocked(billingRepository.getTenantUsageCounts).mockResolvedValue({ studentsCount: 10, staffCount: 2 });
      vi.mocked(billingRepository.executeTransaction).mockImplementation(async (cb) => cb({}));

      const result = await billingService.upgradePlan(schoolId, user, {
        planId,
        billingCycle: 'yearly'
      });

      expect(billingRepository.executeTransaction).toHaveBeenCalled();
      expect(billingRepository.updateSchoolPlan).toHaveBeenCalledWith(schoolId, planId, expect.anything());
      expect(billingRepository.upsertBillingSetting).toHaveBeenCalledWith(
        schoolId,
        expect.objectContaining({ billingCycle: 'yearly', subscriptionStatus: 'active' }),
        expect.anything()
      );
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          schoolId,
          entityType: 'SubscriptionPlan',
          entityId: planId,
          actionPerformed: expect.stringContaining('Changed subscription plan to Standard Plan')
        }),
        expect.anything()
      );
      expect(result.schoolId).toBe(schoolId);
    });
  });
});
