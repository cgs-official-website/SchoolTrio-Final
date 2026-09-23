import { Router } from 'express';
import * as superadminController from './superadmin.controller.js';
import * as superadminSchemas from './superadmin.schemas.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { requireRole } from '../../middleware/rbac.middleware.js';
import { tenantContext } from '../../middleware/tenant.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { rateLimit } from '../../middleware/rate-limit.middleware.js';
import { SYSTEM_ROLES } from '../../config/constants.js';

export const superadminRouter = Router();

// Global SuperAdmin protection & tenant context bypass setup for platform routes
superadminRouter.use(authenticate, requireRole(SYSTEM_ROLES.SUPER_ADMIN), tenantContext({ requireTenant: false }));

// Rate limiters for sensitive mutations
const mutationRateLimiter = rateLimit({ max: 30, windowMs: 60000 });
const deletionRateLimiter = rateLimit({ max: 20, windowMs: 60000 });

/**
 * 1. Platform Statistics
 * GET /api/v1/superadmin/stats
 */
superadminRouter.get('/stats', superadminController.getStats);

/**
 * 2. Tenant Management Endpoints
 * GET    /api/v1/superadmin/tenants
 * POST   /api/v1/superadmin/tenants
 * GET    /api/v1/superadmin/tenants/:id
 * PATCH  /api/v1/superadmin/tenants/:id/status
 * PATCH  /api/v1/superadmin/tenants/:id/config
 * DELETE /api/v1/superadmin/tenants/:id
 */
superadminRouter.get(
  '/tenants',
  validate(superadminSchemas.listTenantsQuerySchema),
  superadminController.listTenants
);

superadminRouter.post(
  '/tenants',
  mutationRateLimiter,
  validate(superadminSchemas.createTenantSchema),
  superadminController.createTenant
);

superadminRouter.get(
  '/tenants/:id',
  validate(superadminSchemas.tenantParamsSchema),
  superadminController.getTenantById
);

superadminRouter.patch(
  '/tenants/:id/status',
  mutationRateLimiter,
  validate(superadminSchemas.updateTenantStatusSchema),
  superadminController.updateTenantStatus
);

superadminRouter.patch(
  '/tenants/:id/config',
  mutationRateLimiter,
  validate(superadminSchemas.updateTenantConfigSchema),
  superadminController.updateTenantConfig
);

superadminRouter.delete(
  '/tenants/:id',
  deletionRateLimiter,
  validate(superadminSchemas.tenantParamsSchema),
  superadminController.deleteTenant
);

/**
 * 3. Subscription Plans Management Endpoints
 * GET    /api/v1/superadmin/plans
 * POST   /api/v1/superadmin/plans
 * PATCH  /api/v1/superadmin/plans/:id
 * DELETE /api/v1/superadmin/plans/:id
 */
superadminRouter.get(
  '/plans',
  validate(superadminSchemas.listPlansQuerySchema),
  superadminController.listPlans
);

superadminRouter.post(
  '/plans',
  mutationRateLimiter,
  validate(superadminSchemas.createPlanSchema),
  superadminController.createPlan
);

superadminRouter.patch(
  '/plans/:id',
  mutationRateLimiter,
  validate(superadminSchemas.updatePlanSchema),
  superadminController.updatePlan
);

superadminRouter.delete(
  '/plans/:id',
  deletionRateLimiter,
  validate(superadminSchemas.planParamsSchema),
  superadminController.deletePlan
);

/**
 * 4. Subscriptions Overview
 * GET /api/v1/superadmin/subscriptions
 */
superadminRouter.get(
  '/subscriptions',
  validate(superadminSchemas.listSubscriptionsQuerySchema),
  superadminController.getSubscriptions
);

/**
 * 5. License & Quota Usage
 * GET /api/v1/superadmin/license-usage
 */
superadminRouter.get(
  '/license-usage',
  validate(superadminSchemas.licenseUsageQuerySchema),
  superadminController.getLicenseUsage
);

export default superadminRouter;
