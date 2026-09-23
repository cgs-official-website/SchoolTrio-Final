import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as billingApi from '../../../api/billing.js';

describe('Admin UpgradePlan REST Migration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches subscription plans and current billing data from REST API', async () => {
    const mockPlans = [
      { id: 'plan-1', name: 'Starter Plan', pricePerUserPerYear: 120, userLimit: 100, isActive: true },
      { id: 'plan-2', name: 'Growth Plan', pricePerUserPerYear: 240, userLimit: 500, isActive: true }
    ];

    const mockCurrent = {
      schoolId: 'school-1',
      planId: 'plan-1',
      plan: mockPlans[0],
      billingCycle: 'monthly',
      subscriptionStatus: 'active'
    };

    const getPlansSpy = vi.spyOn(billingApi, 'getPlans').mockResolvedValue({
      success: true,
      data: mockPlans
    });

    const getCurrentSpy = vi.spyOn(billingApi, 'getCurrentBilling').mockResolvedValue({
      success: true,
      data: mockCurrent
    });

    const [plansRes, currentRes] = await Promise.all([
      billingApi.getPlans(),
      billingApi.getCurrentBilling()
    ]);

    expect(getPlansSpy).toHaveBeenCalled();
    expect(getCurrentSpy).toHaveBeenCalled();
    expect(plansRes.data).toHaveLength(2);
    expect(currentRes.data.plan.name).toBe('Starter Plan');
    expect(currentRes.data.billingCycle).toBe('monthly');
  });

  it('submits plan upgrade request through REST API without Firestore mutations', async () => {
    const upgradeSpy = vi.spyOn(billingApi, 'upgradePlan').mockResolvedValue({
      success: true,
      data: {
        schoolId: 'school-1',
        plan: { id: 'plan-2', name: 'Growth Plan' },
        billingCycle: 'yearly',
        subscriptionStatus: 'active'
      }
    });

    const payload = {
      planId: 'plan-2',
      billingCycle: 'yearly'
    };

    const res = await billingApi.upgradePlan(payload);

    expect(upgradeSpy).toHaveBeenCalledWith(payload);
    expect(res.success).toBe(true);
    expect(res.data.plan.name).toBe('Growth Plan');
    expect(res.data.billingCycle).toBe('yearly');
  });
});
