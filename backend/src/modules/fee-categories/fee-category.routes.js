import { Router } from 'express';
import * as controller from './fee-category.controller.js';
import * as schemas from './fee-category.schemas.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantContext } from '../../middleware/tenant.middleware.js';
import { requirePermission } from '../../middleware/rbac.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';

const router = Router();

router.get(
  '/',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('fees', 'read'),
  validate(schemas.listFeeCategoriesSchema),
  controller.listFeeCategories
);

router.get(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('fees', 'read'),
  validate(schemas.feeCategoryParamsSchema),
  controller.getFeeCategory
);

router.get(
  '/types',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('fees', 'read'),
  controller.listCategoryTypes
);

router.post(
  '/',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('fees', 'create'),
  validate(schemas.createFeeCategorySchema),
  controller.createFeeCategory
);

router.patch(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('fees', 'edit'),
  validate(schemas.updateFeeCategorySchema),
  controller.updateFeeCategory
);

router.delete(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('fees', 'delete'),
  validate(schemas.feeCategoryParamsSchema),
  controller.deleteFeeCategory
);

export default router;