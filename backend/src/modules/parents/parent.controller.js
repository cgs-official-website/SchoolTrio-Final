import * as parentService from './parent.service.js';
import { ApiResponse } from '../../utils/api-response.js';
import { HTTP_STATUS } from '../../config/constants.js';

/**
 * Parent & Parent-Student Link HTTP Controller Handlers
 */

/**
 * Lists all parents for a tenant with pagination, searching, and filtering.
 * GET /api/v1/parents
 */
export async function listParents(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const { parents, pagination } = await parentService.listParents(schoolId, req.query);
    return ApiResponse.paginated(res, parents, pagination, 'Parents retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Retrieves a single parent profile by ID.
 * GET /api/v1/parents/:id
 */
export async function getParent(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const parent = await parentService.getParentById(schoolId, req.params.id);
    return ApiResponse.success(res, parent, 'Parent retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Updates a parent profile.
 * PATCH /api/v1/parents/:id
 */
export async function updateParent(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const actor = req.user || req.auth;
    const updated = await parentService.updateParent(schoolId, req.params.id, req.body, actor);
    return ApiResponse.success(res, updated, 'Parent updated successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Lists all parent profiles linked to a specific student.
 * GET /api/v1/students/:studentId/parents
 */
export async function listStudentParents(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const actor = req.user || req.auth;
    const parents = await parentService.getStudentParents(schoolId, req.params.studentId, actor);
    return ApiResponse.success(res, parents, 'Student parents retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Links a parent to a student (or creates new parent and links).
 * POST /api/v1/students/:studentId/parents
 */
export async function linkParentToStudent(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const actor = req.user || req.auth;
    const link = await parentService.linkParentToStudent(schoolId, req.params.studentId, req.body, actor);
    return ApiResponse.success(res, link, 'Parent linked successfully', HTTP_STATUS.CREATED);
  } catch (error) {
    return next(error);
  }
}

/**
 * Unlinks a parent from a student.
 * DELETE /api/v1/students/:studentId/parents/:parentId
 */
export async function unlinkParentFromStudent(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const actor = req.user || req.auth;
    await parentService.unlinkParentFromStudent(schoolId, req.params.studentId, req.params.parentId, actor);
    return ApiResponse.success(res, null, 'Parent unlinked successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Self-service endpoint for logged-in parent to view their linked children.
 * GET /api/v1/parents/me/children
 */
export async function getMyChildren(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const userId = req.user?.id || req.auth?.userId || req.user?.userId;
    const children = await parentService.getMyChildren(userId, schoolId);
    return ApiResponse.success(res, children, 'Children retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Self-service endpoint for logged-in parent to link a child via admissionNumber + DOB.
 * POST /api/v1/parents/me/link-child
 */
export async function linkChildSelfService(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const userId = req.user?.id || req.auth?.userId || req.user?.userId;
    const actor = req.user || req.auth;
    const link = await parentService.linkChildSelfService(userId, schoolId, req.body, actor);
    return ApiResponse.success(res, link, 'Child linked successfully', HTTP_STATUS.CREATED);
  } catch (error) {
    return next(error);
  }
}

/**
 * Self-service endpoint for logged-in parent to unlink their own child relationship.
 * DELETE /api/v1/parents/me/children/:studentId
 */
export async function unlinkChildSelfService(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const userId = req.user?.id || req.auth?.userId || req.user?.userId;
    const actor = req.user || req.auth;
    await parentService.unlinkChildSelfService(userId, schoolId, req.params.studentId, actor);
    return ApiResponse.success(res, null, 'Child unlinked successfully');
  } catch (error) {
    return next(error);
  }
}
