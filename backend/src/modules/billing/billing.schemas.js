import { z } from 'zod';

/**
 * Zod validation schemas for Tenant Billing & Plans REST endpoints.
 */

export const planUpgradeBodySchema = z.object({
  planId: z.string({ required_error: 'planId is required' }).uuid('planId must be a valid UUID'),
  billingCycle: z.enum(['monthly', 'yearly'], {
    errorMap: () => ({ message: "billingCycle must be either 'monthly' or 'yearly'" })
  }).default('monthly')
}).strict();

export const planUpgradeSchema = {
  body: planUpgradeBodySchema
};
