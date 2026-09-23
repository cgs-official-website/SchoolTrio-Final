/**
 * src/api/staff.js
 *
 * Staff API client module communicating with the PostgreSQL backend.
 * Uses the centralized HTTP client with automatic JWT token injection and tenant context.
 */

import { apiClient } from './client.js';

/**
 * Builds a clean query string omitting null, undefined, and empty string values.
 *
 * @param {Object} [params={}] - Key-value map of query parameters
 * @returns {string} Formatted query string or empty string
 */
function buildQueryString(params = {}) {
  if (!params || typeof params !== 'object') return '';
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, String(value));
    }
  }
  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Lists staff members for the active tenant.
 * Calls GET /api/v1/staff.
 *
 * @param {Object} [query={}] - Query options (search, phone, email, staffType, status, roleId, classId, page, limit, sort, order)
 * @returns {Promise<{ success: boolean, data: Array<Object>, pagination: Object, message?: string }>}
 */
export async function listStaff(query = {}) {
  const qs = buildQueryString(query);
  return apiClient(`/api/v1/staff${qs}`, {
    method: 'GET'
  });
}

/**
 * Retrieves a single staff profile by UUID within tenant scope.
 * Calls GET /api/v1/staff/:id.
 *
 * @param {string} id - PostgreSQL Staff UUID
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function getStaff(id) {
  return apiClient(`/api/v1/staff/${encodeURIComponent(id)}`, {
    method: 'GET'
  });
}

/**
 * Creates a new staff member and linked user account atomically.
 * Calls POST /api/v1/staff.
 *
 * @param {Object} data - Staff creation payload
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function createStaff(data) {
  return apiClient('/api/v1/staff', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

/**
 * Updates a staff member profile, role, status, or details.
 * Calls PATCH /api/v1/staff/:id.
 *
 * @param {string} id - PostgreSQL Staff UUID
 * @param {Object} data - Staff update payload
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function updateStaff(id, data) {
  return apiClient(`/api/v1/staff/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  });
}

/**
 * Updates staff assignments (class teacher, assigned subjects, subject classes).
 * Calls PATCH /api/v1/staff/:id/assignment.
 *
 * @param {string} id - PostgreSQL Staff UUID
 * @param {Object} data - Assignment payload ({ assignedClassId, assignedSubjectIds, subjectClassIds })
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function assignStaff(id, data) {
  return apiClient(`/api/v1/staff/${encodeURIComponent(id)}/assignment`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  });
}

/**
 * Deletes a staff member (only if 0 historical activity dependencies exist).
 * Calls DELETE /api/v1/staff/:id.
 *
 * @param {string} id - PostgreSQL Staff UUID
 * @returns {Promise<{ success: boolean, data: null, message?: string }>}
 */
export async function deleteStaff(id) {
  return apiClient(`/api/v1/staff/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}

/**
 * Lists all functional school roles for the active tenant.
 * Calls GET /api/v1/rbac/roles.
 *
 * @returns {Promise<{ success: boolean, data: Array<Object>, message?: string }>}
 */
export async function listRoles() {
  return apiClient('/api/v1/rbac/roles', {
    method: 'GET'
  });
}

/**
 * Self-service endpoint for logged-in staff member to view own profile.
 * Calls GET /api/v1/staff/me.
 *
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function getStaffMe() {
  return apiClient('/api/v1/staff/me', {
    method: 'GET'
  });
}

/**
 * Self-service endpoint for logged-in staff member to update own profile.
 * Calls PATCH /api/v1/staff/me.
 *
 * @param {Object} data - Self-service update payload
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function updateStaffSelf(data) {
  return apiClient('/api/v1/staff/me', {
    method: 'PATCH',
    body: JSON.stringify(data)
  });
}

export const staffApi = {
  listStaff,
  getStaff,
  createStaff,
  updateStaff,
  assignStaff,
  deleteStaff,
  listRoles,
  getStaffMe,
  updateStaffSelf
};

export default staffApi;
