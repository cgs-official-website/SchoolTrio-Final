import * as rbacService from './rbac.service.js';
import { ApiResponse } from '../../utils/api-response.js';
import { HTTP_STATUS } from '../../config/constants.js';

/**
 * RBAC HTTP Request Controller Layer
 *
 * Maps Express HTTP requests to RBAC service methods and formats responses.
 */

/**
 * GET /api/v1/rbac/roles
 * Lists all functional roles for the active tenant.
 */
export async function listRoles(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const roles = await rbacService.listRoles(schoolId);
    return ApiResponse.success(res, roles, 'Roles retrieved successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/rbac/roles/:roleId
 * Retrieves a single role by ID within the active tenant.
 */
export async function getRole(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const role = await rbacService.getRoleById(schoolId, req.params.roleId);
    return ApiResponse.success(res, role, 'Role retrieved successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/rbac/roles
 * Creates a custom functional role within the active tenant.
 */
export async function createRole(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const role = await rbacService.createRole(schoolId, req.body, req.auth);
    return ApiResponse.success(res, role, 'Role created successfully', HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/v1/rbac/roles/:roleId
 * Updates a functional role within the active tenant.
 */
export async function updateRole(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const role = await rbacService.updateRole(schoolId, req.params.roleId, req.body, req.auth);
    return ApiResponse.success(res, role, 'Role updated successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/v1/rbac/roles/:roleId
 * Deletes a custom functional role within the active tenant.
 */
export async function deleteRole(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    await rbacService.deleteRole(schoolId, req.params.roleId, req.auth);
    return ApiResponse.success(res, null, 'Role deleted successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/rbac/roles/:roleId/permissions
 * Retrieves permissions for a role within the active tenant.
 */
export async function getRolePermissions(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const permissions = await rbacService.getRolePermissions(schoolId, req.params.roleId);
    return ApiResponse.success(res, permissions, 'Role permissions retrieved successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/v1/rbac/roles/:roleId/permissions
 * Replaces/updates permissions for a role within the active tenant.
 */
export async function updateRolePermissions(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const permissions = await rbacService.updateRolePermissions(
      schoolId,
      req.params.roleId,
      req.body.permissions,
      req.auth
    );
    return ApiResponse.success(res, permissions, 'Role permissions updated successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/rbac/users/:userId/roles
 * Retrieves assigned roles for a user within the active tenant.
 */
export async function getUserRoles(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const roles = await rbacService.getUserRoles(schoolId, req.params.userId);
    return ApiResponse.success(res, roles, 'User roles retrieved successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/rbac/users/:userId/roles
 * Assigns a functional role to a user within the active tenant.
 */
export async function assignUserRole(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const assignment = await rbacService.assignUserRole(
      schoolId,
      req.params.userId,
      req.body.roleId,
      req.auth
    );
    return ApiResponse.success(res, assignment, 'Role assigned successfully', HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/v1/rbac/users/:userId/roles/:roleId
 * Removes a functional role assignment from a user within the active tenant.
 */
export async function removeUserRole(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    await rbacService.removeUserRole(
      schoolId,
      req.params.userId,
      req.params.roleId,
      req.auth
    );
    return ApiResponse.success(res, null, 'Role removed successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/rbac/my-permissions
 * Returns authoritative effective permissions for the authenticated user for the active tenant.
 */
export async function getMyPermissions(req, res, next) {
  try {
    const effective = await rbacService.getMyEffectivePermissions(req.auth, req.tenant);
    return ApiResponse.success(res, effective, 'Effective permissions retrieved successfully');
  } catch (err) {
    next(err);
  }
}
