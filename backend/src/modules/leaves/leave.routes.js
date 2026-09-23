import { Router } from 'express';
import * as leaveController from './leave.controller.js';
import * as leaveSchemas from './leave.schemas.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantContext } from '../../middleware/tenant.middleware.js';
import { requirePermission, requireRole } from '../../middleware/rbac.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { SYSTEM_ROLES } from '../../config/constants.js';

/**
 * Custom Authorization Gate for Reading Leaves:
 * Allows institutional staff with 'leaves.read' OR authenticated parents (child-scoped in service).
 */
export const requireLeavesReadOrParent = (req, res, next) => {
  const user = req.auth || req.user;
  const role = user?.systemRole || user?.role;
  if (role === SYSTEM_ROLES.PARENT) {
    return next();
  }
  return requirePermission('leaves', 'read')(req, res, next);
};

/**
 * Custom Authorization Gate for Creating Leaves:
 * Allows institutional staff with 'leaves.create' OR authenticated parents (child-scoped in service).
 */
export const requireLeavesCreateOrParent = (req, res, next) => {
  const user = req.auth || req.user;
  const role = user?.systemRole || user?.role;
  if (role === SYSTEM_ROLES.PARENT) {
    return next();
  }
  return requirePermission('leaves', 'create')(req, res, next);
};

// ============================================================
// STUDENT LEAVE ROUTES (Mounted under /api/v1/students)
// ============================================================
const studentLeaveRouter = Router();

/**
 * Student Leave History List
 * GET /api/v1/students/:studentId/leaves
 */
studentLeaveRouter.get(
  '/:studentId/leaves',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireLeavesReadOrParent,
  validate(leaveSchemas.listStudentLeavesSchema),
  leaveController.listStudentLeaves
);

/**
 * Create Student Leave Application
 * POST /api/v1/students/:studentId/leaves
 */
studentLeaveRouter.post(
  '/:studentId/leaves',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireLeavesCreateOrParent,
  validate(leaveSchemas.createStudentLeaveSchema),
  leaveController.createStudentLeave
);

// ============================================================
// STAFF LEAVE ROUTES (Mounted under /api/v1/staff)
// ============================================================
const staffLeaveRouter = Router();

/**
 * Staff Self Leave History List
 * GET /api/v1/staff/me/leaves
 */
staffLeaveRouter.get(
  '/me/leaves',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireRole(
    SYSTEM_ROLES.SCHOOL_ADMIN,
    SYSTEM_ROLES.PRINCIPAL,
    SYSTEM_ROLES.TEACHER,
    SYSTEM_ROLES.STAFF
  ),
  validate(leaveSchemas.listStaffLeavesSchema),
  leaveController.listStaffLeaves
);

/**
 * Create Staff Self Leave Application
 * POST /api/v1/staff/me/leaves
 */
staffLeaveRouter.post(
  '/me/leaves',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireRole(
    SYSTEM_ROLES.SCHOOL_ADMIN,
    SYSTEM_ROLES.PRINCIPAL,
    SYSTEM_ROLES.TEACHER,
    SYSTEM_ROLES.STAFF
  ),
  validate(leaveSchemas.createStaffLeaveSchema),
  leaveController.createStaffLeave
);

// ============================================================
// INSTITUTIONAL LEAVE ROUTES (Mounted under /api/v1/leaves)
// ============================================================
const leaveRouter = Router();

/**
 * Pending Leaves Count for Administrative Backlog
 * GET /api/v1/leaves/pending-count
 */
leaveRouter.get(
  '/pending-count',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('leaves', 'read'),
  leaveController.getPendingLeavesCount
);

/**
 * Tenant-wide Leave Listing (Admin)
 * GET /api/v1/leaves
 */
leaveRouter.get(
  '/',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('leaves', 'read'),
  validate(leaveSchemas.listLeavesSchema),
  leaveController.listTenantLeaves
);

// ============================================================
// LEAVE APPROVAL RULES ROUTES (Mounted under /api/v1/leaves/rules)
// ============================================================

/**
 * List all leave approval rules for the active tenant
 * GET /api/v1/leaves/rules
 */
leaveRouter.get(
  '/rules',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('leaves', 'read'),
  leaveController.listLeaveApprovalRules
);

/**
 * Create a new leave approval rule
 * POST /api/v1/leaves/rules
 */
leaveRouter.post(
  '/rules',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('leaves', 'create'),
  validate(leaveSchemas.createLeaveApprovalRuleSchema),
  leaveController.createLeaveApprovalRule
);

/**
 * Update an existing leave approval rule
 * PATCH /api/v1/leaves/rules/:id
 */
leaveRouter.patch(
  '/rules/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('leaves', 'edit'),
  validate(leaveSchemas.updateLeaveApprovalRuleSchema),
  leaveController.updateLeaveApprovalRule
);

/**
 * Delete a leave approval rule
 * DELETE /api/v1/leaves/rules/:id
 */
leaveRouter.delete(
  '/rules/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('leaves', 'delete'),
  validate(leaveSchemas.deleteLeaveApprovalRuleSchema),
  leaveController.deleteLeaveApprovalRule
);

/**
 * Single Leave Application Details (Admin)
 * GET /api/v1/leaves/:id
 */
leaveRouter.get(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('leaves', 'read'),
  validate(leaveSchemas.getLeaveSchema),
  leaveController.getLeaveById
);

/**
 * Update Leave Application Status (Approve / Reject) (Admin)
 * PATCH /api/v1/leaves/:id/status
 */
leaveRouter.patch(
  '/:id/status',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('leaves', 'edit'),
  validate(leaveSchemas.updateLeaveStatusSchema),
  leaveController.updateLeaveStatus
);

/**
 * Delete Leave Application (Admin)
 * DELETE /api/v1/leaves/:id
 */
leaveRouter.delete(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('leaves', 'delete'),
  validate(leaveSchemas.deleteLeaveSchema),
  leaveController.deleteLeave
);

export {
  studentLeaveRouter as studentLeaveRoutes,
  staffLeaveRouter as staffLeaveRoutes,
  leaveRouter as leaveRoutes
};
export default leaveRouter;
