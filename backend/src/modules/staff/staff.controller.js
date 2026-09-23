import * as staffService from './staff.service.js';
import { ApiResponse } from '../../utils/api-response.js';
import { HTTP_STATUS } from '../../config/constants.js';

/**
 * Staff & Staff Profiles HTTP Controller Handlers
 */

/**
 * Lists all staff members for a tenant with pagination, search, and filters.
 * GET /api/v1/staff
 */
export async function listStaff(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const requester = req.user || req.auth;
    const { staff, pagination } = await staffService.listStaff(schoolId, req.query, requester);
    return ApiResponse.paginated(res, staff, pagination, 'Staff members retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Retrieves a single staff profile by ID.
 * GET /api/v1/staff/:id
 */
export async function getStaff(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const requester = req.user || req.auth;
    const staff = await staffService.getStaffById(schoolId, req.params.id, requester);
    return ApiResponse.success(res, staff, 'Staff member retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Creates a new staff member.
 * POST /api/v1/staff
 */
export async function createStaff(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const actor = req.user || req.auth;
    const staff = await staffService.createStaff(schoolId, req.body, actor);
    return ApiResponse.success(res, staff, 'Staff member created successfully', HTTP_STATUS.CREATED);
  } catch (error) {
    return next(error);
  }
}

/**
 * Updates a staff member profile, status, or role.
 * PATCH /api/v1/staff/:id
 */
export async function updateStaff(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const actor = req.user || req.auth;
    const updated = await staffService.updateStaff(schoolId, req.params.id, req.body, actor);
    return ApiResponse.success(res, updated, 'Staff member updated successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Updates staff assignments (class teacher and subject teaching mappings).
 * PATCH /api/v1/staff/:id/assignment
 */
export async function assignStaff(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const actor = req.user || req.auth;
    const updated = await staffService.assignStaff(schoolId, req.params.id, req.body, actor);
    return ApiResponse.success(res, updated, 'Staff assignments updated successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Deletes a staff member (only if 0 historical activity dependencies exist).
 * DELETE /api/v1/staff/:id
 */
export async function deleteStaff(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const actor = req.user || req.auth;
    await staffService.deleteStaff(schoolId, req.params.id, actor);
    return ApiResponse.success(res, null, 'Staff member deleted successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Self-service endpoint for logged-in staff member to view own profile.
 * GET /api/v1/staff/me
 */
export async function getStaffMe(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const userId = req.user?.id || req.auth?.userId || req.user?.userId;
    const profile = await staffService.getStaffMe(schoolId, userId);
    return ApiResponse.success(res, profile, 'Staff profile retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Self-service endpoint for logged-in staff member to update own profile.
 * PATCH /api/v1/staff/me
 */
export async function updateStaffSelf(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const userId = req.user?.id || req.auth?.userId || req.user?.userId;
    const updated = await staffService.updateStaffSelf(schoolId, userId, req.body);
    return ApiResponse.success(res, updated, 'Staff profile updated successfully');
  } catch (error) {
    return next(error);
  }
}
