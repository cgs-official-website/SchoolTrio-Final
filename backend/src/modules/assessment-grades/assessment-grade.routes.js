import { Router } from 'express';
import * as assessmentGradeController from './assessment-grade.controller.js';
import * as assessmentGradeSchemas from './assessment-grade.schemas.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantContext } from '../../middleware/tenant.middleware.js';
import { requirePermission } from '../../middleware/rbac.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';

import { SYSTEM_ROLES } from '../../config/constants.js';

const router = Router();

/**
 * Custom Authorization Gate for Single Student Grade Reading:
 * Allows institutional staff with 'exams.read' OR authenticated Parents
 * (downstream parent-student ownership verified by service).
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
 * Assessment Grade / Mark Entry REST API Endpoints
 * Mounted under /api/v1/assessments
 * All endpoints require authentication, tenant resolution, and authoritative RBAC permission.
 */

// 1. List grades for an assessment
// GET /api/v1/assessments/:assessmentId/grades
// CRITICAL: Staff only. Parents must never receive all class grades.
router.get(
  '/:assessmentId/grades',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('exams', 'read'),
  validate(assessmentGradeSchemas.listGradesSchema),
  assessmentGradeController.listGrades
);

// 2. Bulk create/update student grades atomically
// POST /api/v1/assessments/:assessmentId/grades/bulk
// CRITICAL ROUTE ORDERING: Must be registered BEFORE /:assessmentId/grades/:studentId
// to prevent the static string 'bulk' from being parsed as a studentId parameter.
router.post(
  '/:assessmentId/grades/bulk',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('exams', 'edit'),
  validate(assessmentGradeSchemas.bulkUpsertGradesSchema),
  assessmentGradeController.bulkUpsertGrades
);

// 3. Get single student grade
// GET /api/v1/assessments/:assessmentId/grades/:studentId
router.get(
  '/:assessmentId/grades/:studentId',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireExamsReadOrParent,
  validate(assessmentGradeSchemas.singleGradeParamsSchema),
  assessmentGradeController.getGrade
);

// 4. Create/update single student grade
// PUT /api/v1/assessments/:assessmentId/grades/:studentId
router.put(
  '/:assessmentId/grades/:studentId',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('exams', 'edit'),
  validate(assessmentGradeSchemas.upsertSingleGradeSchema),
  assessmentGradeController.upsertGrade
);

// 5. Clear/delete single student grade
// DELETE /api/v1/assessments/:assessmentId/grades/:studentId
router.delete(
  '/:assessmentId/grades/:studentId',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('exams', 'delete'),
  validate(assessmentGradeSchemas.singleGradeParamsSchema),
  assessmentGradeController.deleteGrade
);

export default router;
