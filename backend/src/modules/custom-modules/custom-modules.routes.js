import { Router } from 'express';
import * as customModulesController from './custom-modules.controller.js';
import * as customModulesSchemas from './custom-modules.schemas.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantContext } from '../../middleware/tenant.middleware.js';
import { requirePermission } from '../../middleware/rbac.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';

export const customModulesRouter = Router();

// ===========================================================================
// Form Schemas Endpoints (mounted before /:id parameter routes to avoid collisions)
// ===========================================================================

customModulesRouter.get(
  '/schemas/:moduleKey',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('form-builder', 'read'),
  customModulesController.getFormSchema
);

customModulesRouter.put(
  '/schemas/:moduleKey',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('form-builder', 'edit'),
  validate(customModulesSchemas.upsertFormSchemaSchema),
  customModulesController.upsertFormSchema
);

customModulesRouter.delete(
  '/schemas/:moduleKey',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('form-builder', 'delete'),
  customModulesController.deleteFormSchema
);

// ===========================================================================
// Dynamic Module Records Endpoints (mounted under /:id/records)
// ===========================================================================

customModulesRouter.get(
  '/:id/records',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('form-builder', 'read'),
  validate(customModulesSchemas.listRecordsQuerySchema),
  customModulesController.listModuleRecords
);

customModulesRouter.post(
  '/:id/records',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('form-builder', 'create'),
  validate(customModulesSchemas.createRecordSchema),
  customModulesController.createModuleRecord
);

customModulesRouter.get(
  '/:id/records/:recordId',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('form-builder', 'read'),
  customModulesController.getModuleRecordById
);

customModulesRouter.patch(
  '/:id/records/:recordId',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('form-builder', 'edit'),
  validate(customModulesSchemas.updateRecordSchema),
  customModulesController.updateModuleRecord
);

customModulesRouter.delete(
  '/:id/records/:recordId',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('form-builder', 'delete'),
  customModulesController.deleteModuleRecord
);

// ===========================================================================
// Custom Modules Metadata & Management Endpoints
// ===========================================================================

customModulesRouter.get(
  '/',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('form-builder', 'read'),
  customModulesController.listCustomModules
);

customModulesRouter.post(
  '/',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('form-builder', 'create'),
  validate(customModulesSchemas.createCustomModuleSchema),
  customModulesController.createCustomModule
);

customModulesRouter.get(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('form-builder', 'read'),
  customModulesController.getCustomModuleById
);

customModulesRouter.patch(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('form-builder', 'edit'),
  validate(customModulesSchemas.updateCustomModuleSchema),
  customModulesController.updateCustomModule
);

customModulesRouter.delete(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('form-builder', 'delete'),
  customModulesController.deleteCustomModule
);
