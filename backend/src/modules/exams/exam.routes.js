import { Router } from 'express';
import * as examController from './exam.controller.js';
import * as examSchemas from './exam.schemas.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantContext } from '../../middleware/tenant.middleware.js';
import { requirePermission } from '../../middleware/rbac.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';

const router = Router();

/**
 * Examination Management Endpoints
 * All endpoints require authentication, tenant resolution, and authoritative RBAC permission.
 */

// List examinations
router.get(
  '/',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('exams', 'read'),
  validate(examSchemas.listExamsSchema),
  examController.listExams
);

// Get single examination by ID
router.get(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('exams', 'read'),
  validate(examSchemas.examParamsSchema),
  examController.getExam
);

// Create examination
router.post(
  '/',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('exams', 'create'),
  validate(examSchemas.createExamSchema),
  examController.createExam
);

// Update examination
router.patch(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('exams', 'edit'),
  validate(examSchemas.updateExamSchema),
  examController.updateExam
);

// Delete examination
router.delete(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('exams', 'delete'),
  validate(examSchemas.examParamsSchema),
  examController.deleteExam
);

export default router;
