/**
 * src/api/academic-resources.js
 *
 * Academic Resources API client module communicating with the PostgreSQL REST backend.
 * Uses the centralized HTTP client with automatic JWT token injection and tenant context.
 */

import { apiClient } from './client.js';

const ALLOWED_ACADEMIC_RESOURCE_QUERY_KEYS = [
  'classId',
  'subjectId',
  'type',
  'uploaderId',
  'search',
  'page',
  'limit'
];

/**
 * Builds a clean query string from an allowlist of permitted keys.
 *
 * @param {Object} [params={}] - Key-value map of query parameters
 * @param {Array<string>} [allowedKeys=ALLOWED_ACADEMIC_RESOURCE_QUERY_KEYS] - Array of allowed key names
 * @returns {string} Formatted query string with leading '?' or empty string
 */
function buildQueryString(params = {}, allowedKeys = ALLOWED_ACADEMIC_RESOURCE_QUERY_KEYS) {
  if (!params || typeof params !== 'object') return '';
  const searchParams = new URLSearchParams();
  for (const key of allowedKeys) {
    const value = params[key];
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, String(value));
    }
  }
  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Lists academic resources with optional filtering (classId, subjectId, type, uploaderId, search, page, limit).
 * Calls GET /api/v1/academic-resources.
 *
 * @param {Object} [params={}] - Query options
 * @returns {Promise<{ success: boolean, data: Array<Object>, pagination: { total: number, page: number, limit: number, totalPages: number } }>}
 */
export async function listAcademicResources(params = {}) {
  const qs = buildQueryString(params);
  return apiClient(`/api/v1/academic-resources${qs}`, {
    method: 'GET'
  });
}

/**
 * Retrieves a single academic resource by ID.
 * Calls GET /api/v1/academic-resources/:id.
 *
 * @param {string} id - Academic resource UUID
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function getAcademicResource(id) {
  return apiClient(`/api/v1/academic-resources/${encodeURIComponent(id)}`, {
    method: 'GET'
  });
}

/**
 * Creates a new academic resource.
 * Calls POST /api/v1/academic-resources.
 *
 * @param {Object} payload - { title, classId, subjectId?, fileUrl?, type?, description? }
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function createAcademicResource(payload) {
  return apiClient('/api/v1/academic-resources', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * Updates an existing academic resource.
 * Calls PATCH /api/v1/academic-resources/:id.
 *
 * @param {string} id - Academic resource UUID
 * @param {Object} payload - { title?, classId?, subjectId?, fileUrl?, type?, description? }
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function updateAcademicResource(id, payload) {
  return apiClient(`/api/v1/academic-resources/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

/**
 * Deletes an academic resource by ID.
 * Calls DELETE /api/v1/academic-resources/:id.
 *
 * @param {string} id - Academic resource UUID
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function deleteAcademicResource(id) {
  return apiClient(`/api/v1/academic-resources/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}

export const academicResourcesApi = {
  listAcademicResources,
  getAcademicResource,
  createAcademicResource,
  updateAcademicResource,
  deleteAcademicResource
};

export default academicResourcesApi;
