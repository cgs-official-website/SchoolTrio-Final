/**
 * src/api/rbac.js
 *
 * RBAC API client communicating with the PostgreSQL REST backend.
 * Uses the centralized HTTP client with automatic JWT token injection and tenant context.
 */

import { apiClient } from './client.js';

/**
 * Retrieves authoritative effective permissions for the authenticated user for the active tenant.
 * Calls GET /api/v1/rbac/my-permissions.
 *
 * @returns {Promise<{
 *   success: boolean,
 *   data: {
 *     userId: string,
 *     schoolId: string,
 *     systemRole: string,
 *     isSuperAdmin: boolean,
 *     isSchoolAdmin: boolean,
 *     isUnrestricted: boolean,
 *     roles: Array<{ id: string, name: string, slug: string, loginPanel: string, isSystemDefault: boolean }>,
 *     permissions: Record<string, { canRead: boolean, canCreate: boolean, canEdit: boolean, canDelete: boolean }>
 *   }
 * }>}
 */
export async function getMyPermissions() {
  return apiClient('/api/v1/rbac/my-permissions', {
    method: 'GET'
  });
}

/**
 * Lists all functional roles for the active tenant.
 * Calls GET /api/v1/rbac/roles.
 *
 * @returns {Promise<{
 *   success: boolean,
 *   data: Array<{
 *     id: string,
 *     name: string,
 *     slug: string,
 *     description?: string,
 *     loginPanel: 'admin' | 'teacher',
 *     isSystemDefault: boolean,
 *     permissions: Array<{
 *       id: string,
 *       moduleKey: string,
 *       canRead: boolean,
 *       canCreate: boolean,
 *       canEdit: boolean,
 *       canDelete: boolean
 *     }>,
 *     _count?: { userAssignments: number }
 *   }>
 * }>}
 */
export async function getRoles() {
  return apiClient('/api/v1/rbac/roles', {
    method: 'GET'
  });
}

/**
 * Retrieves a single role by ID within the active tenant.
 * Calls GET /api/v1/rbac/roles/:roleId.
 *
 * @param {string} roleId - Role UUID
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function getRoleById(roleId) {
  return apiClient(`/api/v1/rbac/roles/${encodeURIComponent(roleId)}`, {
    method: 'GET'
  });
}

/**
 * Creates a custom functional role within the active tenant.
 * Calls POST /api/v1/rbac/roles.
 *
 * @param {Object} payload - { name: string, loginPanel?: 'admin'|'teacher', slug?: string, permissions?: Object|Array }
 * @returns {Promise<{ success: boolean, message: string, data: Object }>}
 */
export async function createRole(payload) {
  return apiClient('/api/v1/rbac/roles', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * Updates a functional role within the active tenant.
 * Calls PATCH /api/v1/rbac/roles/:roleId.
 *
 * @param {string} roleId - Role UUID
 * @param {Object} payload - { name?: string, loginPanel?: 'admin'|'teacher', slug?: string }
 * @returns {Promise<{ success: boolean, message: string, data: Object }>}
 */
export async function updateRole(roleId, payload) {
  return apiClient(`/api/v1/rbac/roles/${encodeURIComponent(roleId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

/**
 * Deletes a custom functional role within the active tenant.
 * Calls DELETE /api/v1/rbac/roles/:roleId.
 *
 * @param {string} roleId - Role UUID
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function deleteRole(roleId) {
  return apiClient(`/api/v1/rbac/roles/${encodeURIComponent(roleId)}`, {
    method: 'DELETE'
  });
}

/**
 * Retrieves permissions for a role within the active tenant.
 * Calls GET /api/v1/rbac/roles/:roleId/permissions.
 *
 * @param {string} roleId - Role UUID
 * @returns {Promise<{ success: boolean, data: Array<Object> }>}
 */
export async function getRolePermissions(roleId) {
  return apiClient(`/api/v1/rbac/roles/${encodeURIComponent(roleId)}/permissions`, {
    method: 'GET'
  });
}

/**
 * Replaces/updates permissions for a role within the active tenant.
 * Calls PUT /api/v1/rbac/roles/:roleId/permissions.
 *
 * @param {string} roleId - Role UUID
 * @param {Object} payload - { permissions: Object | Array }
 * @returns {Promise<{ success: boolean, message: string, data: Array<Object> }>}
 */
export async function updateRolePermissions(roleId, payload) {
  return apiClient(`/api/v1/rbac/roles/${encodeURIComponent(roleId)}/permissions`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

/**
 * Retrieves assigned roles for a user within the active tenant.
 * Calls GET /api/v1/rbac/users/:userId/roles.
 *
 * @param {string} userId - User UUID
 * @returns {Promise<{ success: boolean, data: Array<Object> }>}
 */
export async function getUserRoles(userId) {
  return apiClient(`/api/v1/rbac/users/${encodeURIComponent(userId)}/roles`, {
    method: 'GET'
  });
}

/**
 * Assigns a functional role to a user within the active tenant.
 * Calls POST /api/v1/rbac/users/:userId/roles.
 *
 * @param {string} userId - User UUID
 * @param {string} roleId - Role UUID
 * @returns {Promise<{ success: boolean, message: string, data: Object }>}
 */
export async function assignUserRole(userId, roleId) {
  return apiClient(`/api/v1/rbac/users/${encodeURIComponent(userId)}/roles`, {
    method: 'POST',
    body: JSON.stringify({ roleId })
  });
}

/**
 * Removes a functional role assignment from a user within the active tenant.
 * Calls DELETE /api/v1/rbac/users/:userId/roles/:roleId.
 *
 * @param {string} userId - User UUID
 * @param {string} roleId - Role UUID
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function removeUserRole(userId, roleId) {
  return apiClient(`/api/v1/rbac/users/${encodeURIComponent(userId)}/roles/${encodeURIComponent(roleId)}`, {
    method: 'DELETE'
  });
}
