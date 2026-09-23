import { Router } from 'express';
import * as studentController from './student.controller.js';
import * as studentSchemas from './student.schemas.js';
import * as parentController from '../parents/parent.controller.js';
import * as parentSchemas from '../parents/parent.schemas.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantContext } from '../../middleware/tenant.middleware.js';
import { requirePermission } from '../../middleware/rbac.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { SYSTEM_ROLES } from '../../config/constants.js';

const router = Router();

const requireStudentsReadOrParent = (req, res, next) => {
  const user = req.auth || req.user;
  const role = user?.systemRole || user?.role;
  if (role === SYSTEM_ROLES.PARENT) {
    return next();
  }
  return requirePermission('students', 'read')(req, res, next);
};

/**
 * Student Core Management Endpoints
 * All endpoints require authentication, tenant resolution, and authoritative RBAC permission.
 */

// List students
router.get(
  '/',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('students', 'read'),
  validate(studentSchemas.listStudentsSchema),
  studentController.listStudents
);

// Get single student by ID
router.get(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('students', 'read'),
  validate(studentSchemas.studentParamsSchema),
  studentController.getStudent
);

// Create student
router.post(
  '/',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('students', 'create'),
  validate(studentSchemas.createStudentSchema),
  studentController.createStudent
);

// Update student
router.patch(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('students', 'edit'),
  validate(studentSchemas.updateStudentSchema),
  studentController.updateStudent
);

// Delete student
router.delete(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('students', 'delete'),
  validate(studentSchemas.studentParamsSchema),
  studentController.deleteStudent
);

// ============================================================
// Student-Parent Link Endpoints (Phase 4C.3-B)
// ============================================================

// List parents linked to a student
router.get(
  '/:studentId/parents',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireStudentsReadOrParent,
  validate(parentSchemas.studentParentParamsSchema),
  parentController.listStudentParents
);

// Link a parent to a student (existing or new)
router.post(
  '/:studentId/parents',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('students', 'create'),
  validate(parentSchemas.linkParentToStudentSchema),
  parentController.linkParentToStudent
);

// Unlink a parent from a student
router.delete(
  '/:studentId/parents/:parentId',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('students', 'delete'),
  validate(parentSchemas.studentParentUnlinkParamsSchema),
  parentController.unlinkParentFromStudent
);

export default router;
