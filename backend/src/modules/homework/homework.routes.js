import { Router } from 'express';
import * as homeworkController from './homework.controller.js';
import * as homeworkSchemas from './homework.schemas.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantContext } from '../../middleware/tenant.middleware.js';
import { requirePermission } from '../../middleware/rbac.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { SYSTEM_ROLES } from '../../config/constants.js';

/**
 * Custom Authorization Gate for Reading Homework:
 * Allows institutional staff with 'homework.read' OR authenticated parents (child-scoped in service).
 */
export const requireHomeworkReadOrParent = (req, res, next) => {
  const user = req.auth || req.user;
  const role = (user?.systemRole || user?.role || '').toUpperCase();
  if (role === SYSTEM_ROLES.PARENT || role === 'PARENT') {
    return next();
  }
  return requirePermission('homework', 'read')(req, res, next);
};

/**
 * Custom Authorization Gate for Updating Homework Status:
 * Allows institutional staff with 'homework.edit' OR authenticated parents (child-scoped in service).
 */
export const requireHomeworkStatusOrParent = (req, res, next) => {
  const user = req.auth || req.user;
  const role = (user?.systemRole || user?.role || '').toUpperCase();
  if (role === SYSTEM_ROLES.PARENT || role === 'PARENT') {
    return next();
  }
  return requirePermission('homework', 'edit')(req, res, next);
};

// ============================================================
// 1. STAFF / ADMIN HOMEWORK ROUTES (Mounted under /api/v1/homework)
// ============================================================
const homeworkRouter = Router();

/**
 * List / Query Homework Assignments
 * GET /api/v1/homework
 */
homeworkRouter.get(
  '/',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('homework', 'read'),
  validate(homeworkSchemas.listHomeworkSchema),
  homeworkController.listHomework
);

/**
 * Get Unread Homework Count
 * GET /api/v1/homework/unread-count
 */
homeworkRouter.get(
  '/unread-count',
  authenticate,
  tenantContext({ requireTenant: true }),
  validate(homeworkSchemas.getUnreadHomeworkCountSchema),
  homeworkController.getUnreadHomeworkCount
);

/**
 * Create Homework Assignment
 * POST /api/v1/homework
 */
homeworkRouter.post(
  '/',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('homework', 'create'),
  validate(homeworkSchemas.createHomeworkSchema),
  homeworkController.createHomework
);

/**
 * Get Homework Assignment with Roster & Submissions
 * GET /api/v1/homework/:id
 */
homeworkRouter.get(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('homework', 'read'),
  validate(homeworkSchemas.getHomeworkByIdSchema),
  homeworkController.getHomeworkById
);

/**
 * Update Homework Assignment
 * PUT /api/v1/homework/:id
 */
homeworkRouter.put(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('homework', 'edit'),
  validate(homeworkSchemas.updateHomeworkSchema),
  homeworkController.updateHomework
);

/**
 * Delete Homework Assignment
 * DELETE /api/v1/homework/:id
 */
homeworkRouter.delete(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('homework', 'delete'),
  validate(homeworkSchemas.deleteHomeworkSchema),
  homeworkController.deleteHomework
);

/**
 * Evaluate / Grade Student Submission
 * PATCH /api/v1/homework/:id/submissions/:studentId
 */
homeworkRouter.patch(
  '/:id/submissions/:studentId',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('homework', 'edit'),
  validate(homeworkSchemas.updateSubmissionSchema),
  homeworkController.updateStaffSubmission
);

// ============================================================
// 2. PARENT / STUDENT HOMEWORK ROUTES (Mounted under /api/v1/students)
// ============================================================
const studentHomeworkRouter = Router();

/**
 * Student Homework List (Class-scoped with merged student submissions)
 * GET /api/v1/students/:studentId/homework
 */
studentHomeworkRouter.get(
  '/:studentId/homework',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireHomeworkReadOrParent,
  validate(homeworkSchemas.listStudentHomeworkSchema),
  homeworkController.getStudentHomework
);

/**
 * Student Homework Status Update (Self-service toggle by parent)
 * PATCH /api/v1/students/:studentId/homework/:homeworkId/status
 */
studentHomeworkRouter.patch(
  '/:studentId/homework/:homeworkId/status',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireHomeworkStatusOrParent,
  validate(homeworkSchemas.updateStudentHomeworkStatusSchema),
  homeworkController.updateStudentHomeworkStatus
);

export { homeworkRouter as homeworkRoutes, studentHomeworkRouter as studentHomeworkRoutes };
export default homeworkRouter;
