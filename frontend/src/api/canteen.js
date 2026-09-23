/**
 * src/api/canteen.js
 *
 * Canteen API client module communicating with the PostgreSQL backend.
 * Uses the centralized HTTP client with automatic JWT token injection and tenant context.
 */

import { apiClient } from './client.js';

const ALLOWED_CANTEEN_QUERY_KEYS = ['status', 'mealType', 'date', 'search', 'studentId', 'limit', 'page'];

/**
 * Builds a clean query string from an allowlist of permitted keys.
 *
 * @param {Object} [params={}] - Key-value map of query parameters
 * @param {Array<string>} allowedKeys - Array of allowed key names
 * @returns {string} Formatted query string with leading '?' or empty string
 */
function buildQueryString(params = {}, allowedKeys = []) {
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
 * Retrieves the count of pending canteen meal requests for workflow backlog.
 * Calls GET /api/v1/canteen/pending-count.
 *
 * @returns {Promise<{ success: boolean, data: { count: number }, message?: string }>}
 */
export async function getPendingCanteenCount() {
  return apiClient('/api/v1/canteen/pending-count', {
    method: 'GET'
  });
}

/**
 * Lists canteen meal requests for the authenticated tenant/user.
 * Calls GET /api/v1/canteen/requests.
 *
 * @param {Object} [params={}] - Query options (status, mealType, date, search, studentId, limit, page)
 * @returns {Promise<{ status: string, data: Array<Object>, message?: string }>}
 */
export async function listCanteenRequests(params = {}) {
  const qs = buildQueryString(params, ALLOWED_CANTEEN_QUERY_KEYS);
  return apiClient(`/api/v1/canteen/requests${qs}`, {
    method: 'GET'
  });
}

/**
 * Creates a new canteen meal request.
 * Calls POST /api/v1/canteen/requests.
 *
 * @param {Object} payload - Request payload ({ studentId, mealType, date? })
 * @returns {Promise<{ status: string, data: Object, message?: string }>}
 */
export async function createCanteenRequest(payload) {
  return apiClient('/api/v1/canteen/requests', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * Updates status of a canteen meal request.
 * Calls PATCH /api/v1/canteen/requests/:id/status.
 *
 * @param {string} id - CanteenRequest UUID
 * @param {Object} payload - Update payload ({ status: 'Approved' | 'Delivered' | 'Cancelled' })
 * @returns {Promise<{ status: string, data: Object, message?: string }>}
 */
export async function updateCanteenRequestStatus(id, payload) {
  return apiClient(`/api/v1/canteen/requests/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export const canteenApi = {
  getPendingCanteenCount,
  listCanteenRequests,
  createCanteenRequest,
  updateCanteenRequestStatus
};

export default canteenApi;
