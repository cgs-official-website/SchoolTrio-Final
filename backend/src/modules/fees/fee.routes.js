import { Router } from 'express';
import * as feeController from './fee.controller.js';
import * as feeSchemas from './fee.schemas.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantContext } from '../../middleware/tenant.middleware.js';
import { requirePermission } from '../../middleware/rbac.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';

// ============================================================
// 1. Fee Collection Period Routes (/api/v1/fee-collection-periods)
// ============================================================
export const feeCollectionPeriodRoutes = Router();

feeCollectionPeriodRoutes.get(
  '/',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('fees', 'read'),
  validate(feeSchemas.listFeeCollectionPeriodsSchema),
  feeController.listCollectionPeriods
);

feeCollectionPeriodRoutes.get(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('fees', 'read'),
  validate(feeSchemas.feePeriodParamsSchema),
  feeController.getCollectionPeriod
);

feeCollectionPeriodRoutes.post(
  '/',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('fees', 'create'),
  validate(feeSchemas.createFeeCollectionPeriodSchema),
  feeController.createCollectionPeriod
);

feeCollectionPeriodRoutes.patch(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('fees', 'edit'),
  validate(feeSchemas.updateFeeCollectionPeriodSchema),
  feeController.updateCollectionPeriod
);

feeCollectionPeriodRoutes.delete(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('fees', 'delete'),
  validate(feeSchemas.feePeriodParamsSchema),
  feeController.deleteCollectionPeriod
);

// ============================================================
// 2. Fee Structure Routes (/api/v1/fee-structures)
// ============================================================
export const feeStructureRoutes = Router();

feeStructureRoutes.get(
  '/',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('fees', 'read'),
  validate(feeSchemas.listFeeStructuresSchema),
  feeController.listFeeStructures
);

feeStructureRoutes.get(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('fees', 'read'),
  validate(feeSchemas.feeStructureParamsSchema),
  feeController.getFeeStructure
);

feeStructureRoutes.post(
  '/',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('fees', 'create'),
  validate(feeSchemas.createFeeStructureSchema),
  feeController.createFeeStructure
);

feeStructureRoutes.patch(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('fees', 'edit'),
  validate(feeSchemas.updateFeeStructureSchema),
  feeController.updateFeeStructure
);

feeStructureRoutes.delete(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('fees', 'delete'),
  validate(feeSchemas.feeStructureParamsSchema),
  feeController.deleteFeeStructure
);

export default {
  feeCollectionPeriodRoutes,
  feeStructureRoutes
};
