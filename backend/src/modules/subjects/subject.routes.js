import { Router } from 'express';
import * as subjectController from './subject.controller.js';
import * as subjectSchemas from './subject.schemas.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantContext } from '../../middleware/tenant.middleware.js';
import { requirePermission } from '../../middleware/rbac.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';

const router = Router();

/**
 * Subject Management Endpoints
 * All endpoints require authentication, tenant resolution, and authoritative RBAC permission.
 */

// List subjects
router.get(
  '/',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('subjects', 'read'),
  validate(subjectSchemas.listSubjectsSchema),
  subjectController.listSubjects
);

// Get single subject by ID
router.get(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('subjects', 'read'),
  validate(subjectSchemas.subjectParamsSchema),
  subjectController.getSubject
);

// Create subject
router.post(
  '/',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('subjects', 'create'),
  validate(subjectSchemas.createSubjectSchema),
  subjectController.createSubject
);

// Update subject
router.patch(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('subjects', 'edit'),
  validate(subjectSchemas.updateSubjectSchema),
  subjectController.updateSubject
);

// Delete subject
router.delete(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('subjects', 'delete'),
  validate(subjectSchemas.subjectParamsSchema),
  subjectController.deleteSubject
);

export default router;
