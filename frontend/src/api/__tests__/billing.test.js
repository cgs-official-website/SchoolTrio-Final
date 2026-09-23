import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as clientModule from '../client.js';
import {
  getPlans,
  getPublicPlans,
  getCurrentBilling,
  upgradePlan
} from '../billing.js';

describe('Billing API Client Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches subscription plans (GET /api/v1/billing/plans)', async () => {
    const mockPlans = [
      { id: 'plan-1', name: 'Starter', pricePerUserPerYear: 120 },
      { id: 'plan-2', name: 'Premium', pricePerUserPerYear: 300 }
    ];
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: mockPlans
    });

    const res = await getPlans();
    expect(spy).toHaveBeenCalledWith('/api/v1/billing/plans', { method: 'GET' });
    expect(res.data).toEqual(mockPlans);
  });

  it('fetches public subscription plans (GET /api/v1/public/plans)', async () => {
    const mockPlans = [
      { id: 'plan-1', name: 'Public Starter', pricePerUserPerYear: 120 }
    ];
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: mockPlans
    });

    const res = await getPublicPlans();
    expect(spy).toHaveBeenCalledWith('/api/v1/public/plans', { method: 'GET' });
    expect(res.data).toEqual(mockPlans);
  });

  it('fetches current billing details (GET /api/v1/billing/current)', async () => {
    const mockCurrent = {
      schoolId: 'school-1',
      plan: { id: 'plan-1', name: 'Starter' },
      billingCycle: 'monthly',
      usage: { students: 150, staff: 20 }
    };
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: mockCurrent
    });

    const res = await getCurrentBilling();
    expect(spy).toHaveBeenCalledWith('/api/v1/billing/current', { method: 'GET' });
    expect(res.data).toEqual(mockCurrent);
  });

  it('upgrades subscription plan (PATCH /api/v1/billing/upgrade)', async () => {
    const payload = { planId: 'plan-2', billingCycle: 'yearly' };
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: { plan: { id: 'plan-2' }, billingCycle: 'yearly' }
    });

    const res = await upgradePlan(payload);
    expect(spy).toHaveBeenCalledWith('/api/v1/billing/upgrade', {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    expect(res.data.billingCycle).toBe('yearly');
  });
});
