import { Router } from 'express';
import * as billingController from './billing.controller.js';
import * as billingSchemas from './billing.schemas.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantContext } from '../../middleware/tenant.middleware.js';
import { requirePermission } from '../../middleware/rbac.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { rateLimit } from '../../middleware/rate-limit.middleware.js';

/**
 * 1. Authenticated Tenant Billing Router mounted under /api/v1/billing
 */
export const billingRouter = Router();

// --- Available Subscription Plans (Authenticated) ---
billingRouter.get(
  '/plans',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('billing:read'),
  billingController.getPlans
);

// --- Current Tenant Subscription & Usage (Authenticated) ---
billingRouter.get(
  '/current',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('billing:read'),
  billingController.getCurrentBilling
);

// --- Upgrade / Change Subscription Plan (Authenticated) ---
billingRouter.patch(
  '/upgrade',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('billing:edit'),
  validate(billingSchemas.planUpgradeSchema),
  billingController.upgradePlan
);

/**
 * 2. Public Subscription Plans Router mounted under /api/v1/public/plans
 */
export const publicPlansRouter = Router();

publicPlansRouter.get(
  '/',
  rateLimit({ max: 60, windowMs: 60000 }),
  billingController.getPublicPlans
);
