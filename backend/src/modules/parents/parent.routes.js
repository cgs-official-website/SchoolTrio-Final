import { Router } from 'express';
import * as parentController from './parent.controller.js';
import * as parentSchemas from './parent.schemas.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantContext } from '../../middleware/tenant.middleware.js';
import { requirePermission, requireRole } from '../../middleware/rbac.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { SYSTEM_ROLES } from '../../config/constants.js';

const router = Router();

/**
 * Parent Management Endpoints
 * Mounted under /api/v1/parents
 */

// List parents
router.get(
  '/',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('students', 'read'),
  validate(parentSchemas.listParentsSchema),
  parentController.listParents
);

// Self-service: Parent views linked children (must be declared before /:id)
router.get(
  '/me/children',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireRole(SYSTEM_ROLES.PARENT),
  parentController.getMyChildren
);

// Self-service: Parent links child via admissionNumber + DOB (must be declared before /:id)
router.post(
  '/me/link-child',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireRole(SYSTEM_ROLES.PARENT),
  validate(parentSchemas.linkChildSelfServiceSchema),
  parentController.linkChildSelfService
);

// Self-service: Parent unlinks own child relationship (must be declared before /:id)
router.delete(
  '/me/children/:studentId',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireRole(SYSTEM_ROLES.PARENT),
  validate(parentSchemas.unlinkChildSelfServiceSchema),
  parentController.unlinkChildSelfService
);

// Get single parent profile by ID
router.get(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('students', 'read'),
  validate(parentSchemas.parentParamsSchema),
  parentController.getParent
);

// Update parent profile
router.patch(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('students', 'edit'),
  validate(parentSchemas.updateParentSchema),
  parentController.updateParent
);

export default router;
