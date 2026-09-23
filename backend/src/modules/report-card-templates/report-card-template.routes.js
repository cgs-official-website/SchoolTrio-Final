import { Router } from 'express';
import * as reportCardTemplateController from './report-card-template.controller.js';
import * as reportCardTemplateSchemas from './report-card-template.schemas.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantContext } from '../../middleware/tenant.middleware.js';
import { requirePermission } from '../../middleware/rbac.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';

const router = Router();

/**
 * Report Card Template REST API Endpoints
 * Mounted under /api/v1/report-card-templates
 */

// 1. Get template
// GET /api/v1/report-card-templates or GET /api/v1/report-card-templates/:templateType
router.get(
  '/:templateType?',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('exams', 'read'),
  validate(reportCardTemplateSchemas.getReportCardTemplateSchema),
  reportCardTemplateController.getTemplate
);

// 2. Save template
// PUT /api/v1/report-card-templates or PUT /api/v1/report-card-templates/:templateType
router.put(
  '/:templateType?',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('exams', 'edit'),
  validate(reportCardTemplateSchemas.saveReportCardTemplateSchema),
  reportCardTemplateController.saveTemplate
);

// 3. Reset template to default
// DELETE /api/v1/report-card-templates or DELETE /api/v1/report-card-templates/:templateType
router.delete(
  '/:templateType?',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('exams', 'edit'),
  validate(reportCardTemplateSchemas.getReportCardTemplateSchema),
  reportCardTemplateController.deleteTemplate
);

export default router;
