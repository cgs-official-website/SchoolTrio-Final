/**
 * src/api/exams.js
 *
 * Examination API client module communicating with the PostgreSQL backend.
 * Uses the centralized HTTP client with automatic JWT token injection and tenant context.
 */

import { apiClient } from './client.js';

/**
 * Builds a clean query string omitting null, undefined, and empty string values.
 *
 * @param {Object} [params={}] - Key-value map of query parameters
 * @returns {string} Formatted query string (e.g. '?page=1&limit=20') or empty string
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
 * Lists examinations for the current tenant with pagination, search, and filtering.
 *
 * @param {Object} [query={}] - Query options (search, term, academicYear, startDate, endDate, page, limit, sort, order)
 * @returns {Promise<{ success: boolean, data: Array<Object>, pagination: Object, message?: string }>}
 */
export async function listExams(query = {}) {
  const qs = buildQueryString(query);
  return apiClient(`/api/v1/exams${qs}`, {
    method: 'GET'
  });
}

/**
 * Retrieves a single examination by UUID within tenant scope.
 *
 * @param {string} id - PostgreSQL Examination UUID
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function getExam(id) {
  return apiClient(`/api/v1/exams/${encodeURIComponent(id)}`, {
    method: 'GET'
  });
}

/**
 * Creates a new examination record for the current tenant.
 *
 * @param {Object} payload - Examination data ({ name, startDate, endDate, term, academicYear })
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function createExam(payload = {}) {
  return apiClient('/api/v1/exams', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * Updates an existing examination record.
 *
 * @param {string} id - PostgreSQL Examination UUID
 * @param {Object} payload - Partial examination data to update ({ name, startDate, endDate, term, academicYear })
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function updateExam(id, payload = {}) {
  return apiClient(`/api/v1/exams/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

/**
 * Deletes an examination record safely.
 *
 * @param {string} id - PostgreSQL Examination UUID
 * @returns {Promise<{ success: boolean, data: { message: string, id: string }, message?: string }>}
 */
export async function deleteExam(id) {
  return apiClient(`/api/v1/exams/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}

export const examsApi = {
  listExams,
  getExam,
  createExam,
  updateExam,
  deleteExam
};

export default examsApi;
