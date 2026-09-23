import { describe, it, expect } from 'vitest';
import { planUpgradeBodySchema } from '../../../src/modules/billing/billing.schemas.js';

describe('Billing Schemas Unit Tests', () => {
  const validUUID = '11111111-1111-1111-1111-111111111111';

  it('validates a valid plan upgrade payload with default monthly cycle', () => {
    const parsed = planUpgradeBodySchema.parse({
      planId: validUUID
    });
    expect(parsed.planId).toBe(validUUID);
    expect(parsed.billingCycle).toBe('monthly');
  });

  it('validates a valid plan upgrade payload with explicit yearly cycle', () => {
    const parsed = planUpgradeBodySchema.parse({
      planId: validUUID,
      billingCycle: 'yearly'
    });
    expect(parsed.planId).toBe(validUUID);
    expect(parsed.billingCycle).toBe('yearly');
  });

  it('rejects missing planId', () => {
    const res = planUpgradeBodySchema.safeParse({});
    expect(res.success).toBe(false);
  });

  it('rejects invalid UUID for planId', () => {
    const res = planUpgradeBodySchema.safeParse({
      planId: 'not-a-uuid'
    });
    expect(res.success).toBe(false);
    expect(res.error.errors[0].message).toContain('valid UUID');
  });

  it('rejects invalid billingCycle value', () => {
    const res = planUpgradeBodySchema.safeParse({
      planId: validUUID,
      billingCycle: 'quarterly'
    });
    expect(res.success).toBe(false);
    expect(res.error.errors[0].message).toContain("must be either 'monthly' or 'yearly'");
  });

  it('rejects injected/tampered pricing and unauthorized fields (strict schema enforcement)', () => {
    const res = planUpgradeBodySchema.safeParse({
      planId: validUUID,
      billingCycle: 'monthly',
      price: 0,
      amount: 0,
      schoolId: '22222222-2222-2222-2222-222222222222',
      tenantId: '22222222-2222-2222-2222-222222222222',
      subscriptionStatus: 'active',
      paymentStatus: 'paid'
    });
    expect(res.success).toBe(false);
  });
});
