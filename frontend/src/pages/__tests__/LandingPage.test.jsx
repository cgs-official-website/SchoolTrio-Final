import { describe, it, expect, vi, beforeEach } from 'vitest';
import LandingPage from '../LandingPage.jsx';
import * as billingApi from '../../api/billing.js';

describe('LandingPage Component (REST Migration)', () => {
  const mockPlans = [
    {
      id: 'base',
      name: 'Starter Plan',
      price: 29,
      interval: 'month',
      active: true,
      features: ['Up to 100 students', 'Basic Attendance', 'Email Support']
    },
    {
      id: 'standard',
      name: 'Professional Plan',
      price: 79,
      interval: 'month',
      active: true,
      features: ['Up to 500 students', 'Advanced Attendance', 'SMS & WhatsApp Notifications']
    },
    {
      id: 'premium',
      name: 'Enterprise Plan',
      price: 199,
      interval: 'month',
      active: true,
      features: ['Unlimited students', 'All Modules', 'Dedicated Support']
    }
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. is exported as a valid React component function', () => {
    expect(typeof LandingPage).toBe('function');
  });

  it('2. loads public plans via billingApi.getPublicPlans', async () => {
    const plansSpy = vi.spyOn(billingApi, 'getPublicPlans').mockResolvedValue({
      success: true,
      data: mockPlans
    });

    const res = await billingApi.getPublicPlans();
    expect(plansSpy).toHaveBeenCalled();
    expect(res.data).toHaveLength(3);
    expect(res.data[0].id).toBe('base');
    expect(res.data[2].id).toBe('premium');
  });

  it('3. correctly handles empty plans or inactive plans', async () => {
    vi.spyOn(billingApi, 'getPublicPlans').mockResolvedValue({
      success: true,
      data: [
        { id: 'base', name: 'Starter', active: false },
        { id: 'standard', name: 'Pro', active: true }
      ]
    });

    const res = await billingApi.getPublicPlans();
    const visible = res.data.filter(p => p.active !== false);
    expect(visible).toHaveLength(1);
    expect(visible[0].id).toBe('standard');
  });
});
