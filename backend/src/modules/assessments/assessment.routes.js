import { Router } from 'express';
import * as assessmentController from './assessment.controller.js';
import * as assessmentSchemas from './assessment.schemas.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantContext } from '../../middleware/tenant.middleware.js';
import { requirePermission } from '../../middleware/rbac.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';

import { SYSTEM_ROLES } from '../../config/constants.js';

const router = Router();

/**
 * Custom Authorization Gate for Assessment Reading:
 * Allows institutional staff with 'exams.read' OR authenticated Parents
 * (downstream class/child authorization verified by service).
 */
export const requireExamsReadOrParent = (req, res, next) => {
  const user = req.auth || req.user;
  const role = (user?.systemRole || user?.role || '').toUpperCase();
  if (role === SYSTEM_ROLES.PARENT || role === 'PARENT') {
    return next();
  }
  return requirePermission('exams', 'read')(req, res, next);
};

/**
 * Assessment Management Endpoints
 * All endpoints require authentication, tenant resolution, and authoritative RBAC permission.
 */

// List assessments
router.get(
  '/',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireExamsReadOrParent,
  validate(assessmentSchemas.listAssessmentsSchema),
  assessmentController.listAssessments
);

// Get single assessment by ID
router.get(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireExamsReadOrParent,
  validate(assessmentSchemas.assessmentParamsSchema),
  assessmentController.getAssessment
);

// Create assessment
router.post(
  '/',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('exams', 'create'),
  validate(assessmentSchemas.createAssessmentSchema),
  assessmentController.createAssessment
);

// Update assessment
router.patch(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('exams', 'edit'),
  validate(assessmentSchemas.updateAssessmentSchema),
  assessmentController.updateAssessment
);

// Delete assessment
router.delete(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('exams', 'delete'),
  validate(assessmentSchemas.assessmentParamsSchema),
  assessmentController.deleteAssessment
);

export default router;
