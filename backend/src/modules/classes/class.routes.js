import { Router } from 'express';
import * as classController from './class.controller.js';
import * as classSchemas from './class.schemas.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantContext } from '../../middleware/tenant.middleware.js';
import { requirePermission } from '../../middleware/rbac.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';

const router = Router();

/**
 * Class Management Endpoints
 * All endpoints require authentication, tenant resolution, and authoritative RBAC permission.
 */

// List classes
router.get(
  '/',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('classes', 'read'),
  validate(classSchemas.listClassesSchema),
  classController.listClasses
);

// Get single class by ID
router.get(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('classes', 'read'),
  validate(classSchemas.classParamsSchema),
  classController.getClass
);

// Create class
router.post(
  '/',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('classes', 'create'),
  validate(classSchemas.createClassSchema),
  classController.createClass
);

// Update class
router.patch(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('classes', 'edit'),
  validate(classSchemas.updateClassSchema),
  classController.updateClass
);

// Delete class
router.delete(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('classes', 'delete'),
  validate(classSchemas.classParamsSchema),
  classController.deleteClass
);

/**
 * Section Management Endpoints
 */

// List sections for a class
router.get(
  '/:classId/sections',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('classes', 'read'),
  validate(classSchemas.classSectionsParamsSchema),
  classController.listSections
);

// Create section for a class
router.post(
  '/:classId/sections',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('classes', 'create'),
  validate(classSchemas.createSectionSchema),
  classController.createSection
);

// Update section in a class
router.patch(
  '/:classId/sections/:sectionId',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('classes', 'edit'),
  validate(classSchemas.updateSectionSchema),
  classController.updateSection
);

// Delete section in a class
router.delete(
  '/:classId/sections/:sectionId',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('classes', 'delete'),
  validate(classSchemas.sectionParamsSchema),
  classController.deleteSection
);

export default router;
