/**
 * src/api/subjects.js
 *
 * Subjects API client module communicating with the PostgreSQL backend.
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
 * Lists all subjects for the active tenant.
 * Calls GET /api/v1/subjects.
 *
 * @param {Object} [query={}] - Query options (search, code, page, limit, sort, order)
 * @returns {Promise<{ success: boolean, data: Array<Object>, pagination: Object, message?: string }>}
 */
export async function listSubjects(query = {}) {
  const qs = buildQueryString(query);
  return apiClient(`/api/v1/subjects${qs}`, {
    method: 'GET'
  });
}

/**
 * Retrieves a single subject by UUID within tenant scope.
 * Calls GET /api/v1/subjects/:id.
 *
 * @param {string} id - PostgreSQL Subject UUID
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function getSubject(id) {
  return apiClient(`/api/v1/subjects/${encodeURIComponent(id)}`, {
    method: 'GET'
  });
}

/**
 * Creates a new subject for the active tenant.
 * Calls POST /api/v1/subjects.
 *
 * @param {Object} data - Subject creation payload ({ name, code, credits })
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function createSubject(data) {
  return apiClient('/api/v1/subjects', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

/**
 * Updates an existing subject by UUID within tenant scope.
 * Calls PATCH /api/v1/subjects/:id.
 *
 * @param {string} id - PostgreSQL Subject UUID
 * @param {Object} data - Subject update payload ({ name, code, credits })
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function updateSubject(id, data) {
  return apiClient(`/api/v1/subjects/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  });
}

/**
 * Deletes a subject by UUID within tenant scope.
 * Calls DELETE /api/v1/subjects/:id.
 *
 * @param {string} id - PostgreSQL Subject UUID
 * @returns {Promise<{ success: boolean, message?: string }>}
 */
export async function deleteSubject(id) {
  return apiClient(`/api/v1/subjects/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}

export const subjectsApi = {
  listSubjects,
  getSubject,
  createSubject,
  updateSubject,
  deleteSubject
};

export default subjectsApi;
