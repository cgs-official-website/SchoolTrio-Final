import { ApiResponse } from '../../utils/api-response.js';
import { HTTP_STATUS } from '../../config/constants.js';
import * as leaveService from './leave.service.js';

/**
 * Lists leave applications for a specific student.
 * GET /api/v1/students/:studentId/leaves
 */
export async function listStudentLeaves(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId || req.auth?.schoolId || req.schoolId;
    const studentId = req.params.studentId;
    const requester = req.auth || req.user;

    const result = await leaveService.getStudentLeaves(schoolId, studentId, req.query, requester);

    return ApiResponse.paginated(
      res,
      result.leaves,
      result.pagination,
      'Student leave applications retrieved successfully'
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Creates a leave application for a specific student.
 * POST /api/v1/students/:studentId/leaves
 */
export async function createStudentLeave(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId || req.auth?.schoolId || req.schoolId;
    const studentId = req.params.studentId;
    const requester = req.auth || req.user;

    const result = await leaveService.createStudentLeave(schoolId, studentId, req.body, requester);

    return ApiResponse.success(
      res,
      result,
      'Leave application submitted successfully',
      HTTP_STATUS.CREATED
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves the count of pending leave applications for administrative backlog.
 * GET /api/v1/leaves/pending-count
 */
export async function getPendingLeavesCount(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId || req.auth?.schoolId || req.schoolId;
    const actor = req.auth || req.user;

    const result = await leaveService.getPendingLeavesCount(schoolId, actor);

    return ApiResponse.success(
      res,
      result,
      'Pending leave count retrieved successfully'
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Lists all leave applications across a tenant for administrative review.
 * GET /api/v1/leaves
 */
export async function listTenantLeaves(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId || req.auth?.schoolId || req.schoolId;
    const actor = req.auth || req.user;

    const result = await leaveService.listTenantLeaves(schoolId, req.query, actor);

    return ApiResponse.paginated(
      res,
      result.leaves,
      result.pagination,
      'Tenant leave applications retrieved successfully'
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves a single leave application by ID.
 * GET /api/v1/leaves/:id
 */
export async function getLeaveById(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId || req.auth?.schoolId || req.schoolId;
    const leaveId = req.params.id;
    const actor = req.auth || req.user;

    const result = await leaveService.getLeaveById(schoolId, leaveId, actor);

    return ApiResponse.success(
      res,
      result,
      'Leave application details retrieved successfully'
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Updates status of a leave application ('Approved' | 'Rejected').
 * PATCH /api/v1/leaves/:id/status
 */
export async function updateLeaveStatus(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId || req.auth?.schoolId || req.schoolId;
    const leaveId = req.params.id;
    const { status } = req.body;
    const actor = req.auth || req.user;

    const result = await leaveService.updateLeaveStatus(schoolId, leaveId, status, actor);

    return ApiResponse.success(
      res,
      result,
      `Leave application ${status.toLowerCase()} successfully`
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Deletes a leave application.
 * DELETE /api/v1/leaves/:id
 */
export async function deleteLeave(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId || req.auth?.schoolId || req.schoolId;
    const leaveId = req.params.id;
    const actor = req.auth || req.user;

    const result = await leaveService.deleteLeave(schoolId, leaveId, actor);

    return ApiResponse.success(
      res,
      result,
      result.message || 'Leave application deleted successfully'
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Lists leave applications for the authenticated staff member.
 * GET /api/v1/staff/me/leaves
 */
export async function listStaffLeaves(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId || req.auth?.schoolId || req.schoolId;
    const actor = req.auth || req.user;

    const result = await leaveService.getStaffLeaves(schoolId, actor, req.query);

    return ApiResponse.paginated(
      res,
      result.leaves,
      result.pagination,
      'Staff leave history retrieved successfully'
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Submits a new leave application for the authenticated staff member.
 * POST /api/v1/staff/me/leaves
 */
export async function createStaffLeave(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId || req.auth?.schoolId || req.schoolId;
    const actor = req.auth || req.user;

    const result = await leaveService.createStaffLeave(schoolId, actor, req.body);

    return ApiResponse.success(
      res,
      result,
      'Staff leave request submitted successfully',
      HTTP_STATUS.CREATED
    );
  } catch (err) {
    next(err);
  }
}

// ============================================================
// LEAVE APPROVAL RULES CONTROLLER HANDLERS
// ============================================================

/**
 * Lists all leave approval rules for the active tenant.
 * GET /api/v1/leaves/rules
 */
export async function listLeaveApprovalRules(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId || req.auth?.schoolId || req.schoolId;

    const result = await leaveService.listLeaveApprovalRules(schoolId);

    return ApiResponse.success(
      res,
      result,
      'Leave approval rules retrieved successfully'
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Creates a new leave approval rule.
 * POST /api/v1/leaves/rules
 */
export async function createLeaveApprovalRule(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId || req.auth?.schoolId || req.schoolId;
    const actor = req.auth || req.user;

    const result = await leaveService.createLeaveApprovalRule(schoolId, req.body, actor);

    return ApiResponse.success(
      res,
      result,
      'Leave approval rule created successfully',
      HTTP_STATUS.CREATED
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Updates an existing leave approval rule.
 * PATCH /api/v1/leaves/rules/:id
 */
export async function updateLeaveApprovalRule(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId || req.auth?.schoolId || req.schoolId;
    const ruleId = req.params.id;
    const actor = req.auth || req.user;

    const result = await leaveService.updateLeaveApprovalRule(schoolId, ruleId, req.body, actor);

    return ApiResponse.success(
      res,
      result,
      'Leave approval rule updated successfully'
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Deletes an existing leave approval rule.
 * DELETE /api/v1/leaves/rules/:id
 */
export async function deleteLeaveApprovalRule(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId || req.auth?.schoolId || req.schoolId;
    const ruleId = req.params.id;
    const actor = req.auth || req.user;

    const result = await leaveService.deleteLeaveApprovalRule(schoolId, ruleId, actor);

    return ApiResponse.success(
      res,
      result,
      'Leave approval rule deleted successfully'
    );
  } catch (err) {
    next(err);
  }
}

