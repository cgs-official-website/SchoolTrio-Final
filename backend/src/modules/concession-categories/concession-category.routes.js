import { Router } from 'express';
import * as controller from './concession-category.controller.js';
import * as schemas from './concession-category.schemas.js';
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
  validate(schemas.listConcessionCategoriesSchema),
  controller.listConcessionCategories
);

router.get(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('fees', 'read'),
  validate(schemas.concessionCategoryParamsSchema),
  controller.getConcessionCategory
);

router.post(
  '/',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('fees', 'create'),
  validate(schemas.createConcessionCategorySchema),
  controller.createConcessionCategory
);

router.patch(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('fees', 'edit'),
  validate(schemas.updateConcessionCategorySchema),
  controller.updateConcessionCategory
);

router.delete(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('fees', 'delete'),
  validate(schemas.concessionCategoryParamsSchema),
  controller.deleteConcessionCategory
);

export default router;