import { Router } from 'express';
import * as emailTemplatesController from './email-templates.controller.js';
import * as emailTemplatesSchemas from './email-templates.schemas.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantContext } from '../../middleware/tenant.middleware.js';
import { requireRole } from '../../middleware/rbac.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { rateLimit } from '../../middleware/rate-limit.middleware.js';
import { SYSTEM_ROLES } from '../../config/constants.js';

export const emailTemplateRoutes = Router();

// Strict security pipeline: Authentication, Tenant Scoping, and Administrative RBAC
emailTemplateRoutes.use(
  authenticate,
  tenantContext({ requireTenant: true }),
  requireRole(SYSTEM_ROLES.SUPER_ADMIN, SYSTEM_ROLES.SCHOOL_ADMIN, SYSTEM_ROLES.PRINCIPAL)
);

const mutationLimiter = rateLimit({ max: 30, windowMs: 60000 });
const deletionLimiter = rateLimit({ max: 15, windowMs: 60000 });

/**
 * 1. List all email templates for tenant
 * GET /api/v1/email-templates
 */
emailTemplateRoutes.get(
  '/',
  validate(emailTemplatesSchemas.listTemplatesQuerySchema),
  emailTemplatesController.listTemplates
);

/**
 * 2. Bulk update / legacy save templates
 * PUT /api/v1/email-templates
 */
emailTemplateRoutes.put(
  '/',
  mutationLimiter,
  validate(emailTemplatesSchemas.bulkUpdateTemplatesSchema),
  emailTemplatesController.bulkUpdateTemplates
);

/**
 * 3. Create a custom email template
 * POST /api/v1/email-templates
 */
emailTemplateRoutes.post(
  '/',
  mutationLimiter,
  validate(emailTemplatesSchemas.createTemplateSchema),
  emailTemplatesController.createCustomTemplate
);

/**
 * 4. Get a specific email template by ID
 * GET /api/v1/email-templates/:id
 */
emailTemplateRoutes.get(
  '/:id',
  validate(emailTemplatesSchemas.templateParamsSchema),
  emailTemplatesController.getTemplateById
);

/**
 * 5. Update an existing email template
 * PATCH /api/v1/email-templates/:id
 */
emailTemplateRoutes.patch(
  '/:id',
  mutationLimiter,
  validate(emailTemplatesSchemas.updateTemplateSchema),
  emailTemplatesController.updateTemplate
);

/**
 * 6. Reset a system email template to defaults
 * POST /api/v1/email-templates/:id/reset
 */
emailTemplateRoutes.post(
  '/:id/reset',
  mutationLimiter,
  validate(emailTemplatesSchemas.templateParamsSchema),
  emailTemplatesController.resetTemplate
);

/**
 * 7. Delete a custom email template (system templates are protected)
 * DELETE /api/v1/email-templates/:id
 */
emailTemplateRoutes.delete(
  '/:id',
  deletionLimiter,
  validate(emailTemplatesSchemas.templateParamsSchema),
  emailTemplatesController.deleteTemplate
);

export default emailTemplateRoutes;
