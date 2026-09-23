import { Router } from 'express';
import * as settingsController from './settings.controller.js';
import * as settingsSchemas from './settings.schemas.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantContext } from '../../middleware/tenant.middleware.js';
import { requireRole } from '../../middleware/rbac.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { rateLimit } from '../../middleware/rate-limit.middleware.js';
import { SYSTEM_ROLES } from '../../config/constants.js';

/**
 * 1. Authenticated Settings Router mounted under /api/v1/settings
 */
export const settingsRouter = Router();

// --- School Configuration & Branding ---
settingsRouter.get(
  '/school',
  authenticate,
  tenantContext({ requireTenant: true }),
  settingsController.getSchoolSettings
);

settingsRouter.patch(
  '/school',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireRole(SYSTEM_ROLES.SUPER_ADMIN, SYSTEM_ROLES.SCHOOL_ADMIN, SYSTEM_ROLES.PRINCIPAL),
  validate(settingsSchemas.updateSchoolSettingsSchema),
  settingsController.updateSchoolSettings
);

// --- API Integrations & Credentials ---
settingsRouter.get(
  '/integrations',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireRole(SYSTEM_ROLES.SUPER_ADMIN, SYSTEM_ROLES.SCHOOL_ADMIN, SYSTEM_ROLES.PRINCIPAL),
  settingsController.getIntegrationsSettings
);

settingsRouter.patch(
  '/integrations',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireRole(SYSTEM_ROLES.SUPER_ADMIN, SYSTEM_ROLES.SCHOOL_ADMIN, SYSTEM_ROLES.PRINCIPAL),
  validate(settingsSchemas.updateIntegrationsSchema),
  settingsController.updateIntegrationsSettings
);

// --- Navigation Sidebar Layout ---
settingsRouter.get(
  '/sidebar',
  authenticate,
  tenantContext({ requireTenant: true }),
  settingsController.getSidebarSettings
);

settingsRouter.put(
  '/sidebar',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireRole(SYSTEM_ROLES.SUPER_ADMIN, SYSTEM_ROLES.SCHOOL_ADMIN, SYSTEM_ROLES.PRINCIPAL),
  validate(settingsSchemas.updateSidebarSchema),
  settingsController.updateSidebarSettings
);

/**
 * 2. Public School Metadata Router mounted under /api/v1/public/schools
 */
export const publicSchoolsRouter = Router();

publicSchoolsRouter.get(
  '/:schoolId/meta',
  rateLimit({ max: 60, windowMs: 60000 }),
  validate(settingsSchemas.publicSchoolMetaParamsSchema),
  settingsController.getPublicSchoolMeta
);
