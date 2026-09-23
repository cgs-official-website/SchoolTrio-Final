import { Router } from 'express';
import * as categoryController from './category.controller.js';
import * as categorySchemas from './category.schemas.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantContext } from '../../middleware/tenant.middleware.js';
import { requirePermission } from '../../middleware/rbac.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';

const router = Router();

/**
 * Class Category Management Endpoints
 */

// List categories
router.get(
  '/',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('classes', 'read'),
  categoryController.listCategories
);

// Create category
router.post(
  '/',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('classes', 'create'),
  validate(categorySchemas.createCategorySchema),
  categoryController.createCategory
);

// Delete category
router.delete(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('classes', 'delete'),
  validate(categorySchemas.categoryParamsSchema),
  categoryController.deleteCategory
);

export default router;
