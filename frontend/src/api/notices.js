/**
 * src/api/notices.js
 *
 * Noticeboard & Announcements API client module communicating with the PostgreSQL REST backend.
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
 * Lists notices with optional filtering (type, audience, classId, priority, search, page, limit, sort, order).
 * Calls GET /api/v1/notices.
 *
 * @param {Object} [query={}] - Optional query filters and pagination
 * @returns {Promise<{ success: boolean, data: Array<Object>, pagination: Object, message?: string }>}
 */
export async function listNotices(query = {}) {
  const qs = buildQueryString(query);
  return apiClient(`/api/v1/notices${qs}`, {
    method: 'GET'
  });
}

/**
 * Retrieves a single notice record by ID.
 * Calls GET /api/v1/notices/:id.
 *
 * @param {string} id - PostgreSQL Notice UUID
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function getNotice(id) {
  return apiClient(`/api/v1/notices/${encodeURIComponent(id)}`, {
    method: 'GET'
  });
}

/**
 * Creates a new notice record.
 * Calls POST /api/v1/notices.
 *
 * @param {Object} payload - Notice payload ({ title, content/message, type, classId, audience, priority, targetStudentIds?, attachments? })
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function createNotice(payload) {
  return apiClient('/api/v1/notices', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * Updates an existing notice record.
 * Calls PATCH /api/v1/notices/:id.
 *
 * @param {string} id - PostgreSQL Notice UUID
 * @param {Object} payload - Notice update payload ({ title?, content/message?, type?, classId?, audience?, priority?, targetStudentIds?, attachments? })
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function updateNotice(id, payload) {
  return apiClient(`/api/v1/notices/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

/**
 * Deletes a notice record.
 * Calls DELETE /api/v1/notices/:id.
 *
 * @param {string} id - PostgreSQL Notice UUID
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function deleteNotice(id) {
  return apiClient(`/api/v1/notices/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}

/**
 * Records a viewer read receipt for a notice.
 * Calls POST /api/v1/notices/:id/view.
 *
 * @param {string} id - PostgreSQL Notice UUID
 * @returns {Promise<{ success: boolean, data: { notice: Object, alreadyViewed: boolean }, message?: string }>}
 */
export async function markNoticeViewed(id) {
  return apiClient(`/api/v1/notices/${encodeURIComponent(id)}/view`, {
    method: 'POST'
  });
}

export const getNoticeById = getNotice;

export const noticesApi = {
  listNotices,
  getNotice,
  getNoticeById,
  createNotice,
  updateNotice,
  deleteNotice,
  markNoticeViewed
};

export default noticesApi;
