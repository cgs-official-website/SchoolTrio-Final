import { Router } from 'express';
import * as platformBrandingController from './platform-branding.controller.js';
import * as platformBrandingSchemas from './platform-branding.schemas.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { requireRole } from '../../middleware/rbac.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { rateLimit } from '../../middleware/rate-limit.middleware.js';
import { SYSTEM_ROLES } from '../../config/constants.js';

export const platformBrandingRouter = Router();

const updateLimiter = rateLimit({ max: 30, windowMs: 60000 });
const resetLimiter = rateLimit({ max: 15, windowMs: 60000 });

/**
 * 1. Public retrieve global platform branding
 * GET /api/v1/platform/branding
 */
platformBrandingRouter.get('/', platformBrandingController.getPlatformBranding);

/**
 * 2. SuperAdmin update global platform branding
 * PATCH /api/v1/platform/branding
 */
platformBrandingRouter.patch(
  '/',
  authenticate,
  requireRole(SYSTEM_ROLES.SUPER_ADMIN),
  updateLimiter,
  validate({ body: platformBrandingSchemas.updatePlatformBrandingSchema }),
  platformBrandingController.updatePlatformBranding
);

/**
 * 3. SuperAdmin reset global platform branding to default settings
 * POST /api/v1/platform/branding/reset
 */
platformBrandingRouter.post(
  '/reset',
  authenticate,
  requireRole(SYSTEM_ROLES.SUPER_ADMIN),
  resetLimiter,
  platformBrandingController.resetPlatformBranding
);

export default platformBrandingRouter;
