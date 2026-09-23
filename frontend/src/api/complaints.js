/**
 * src/api/complaints.js
 *
 * Complaints API client module communicating with the PostgreSQL backend.
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
 * Retrieves the count of pending complaints for administrative workflow backlog.
 * Calls GET /api/v1/complaints/pending-count.
 *
 * @returns {Promise<{ success: boolean, data: { count: number }, message?: string }>}
 */
export async function getPendingComplaintsCount() {
  return apiClient('/api/v1/complaints/pending-count', {
    method: 'GET'
  });
}

/**
 * Lists complaints for the active tenant with status filtering and pagination.
 * Calls GET /api/v1/complaints.
 *
 * @param {Object} [query={}] - Query options (status: 'pending' | 'resolved' | 'rejected', page, limit)
 * @returns {Promise<{ success: boolean, data: Array<Object>, pagination: Object, message?: string }>}
 */
export async function listComplaints(query = {}) {
  const qs = buildQueryString(query);
  return apiClient(`/api/v1/complaints${qs}`, {
    method: 'GET'
  });
}

/**
 * Retrieves a single complaint by UUID.
 * Calls GET /api/v1/complaints/:id.
 *
 * @param {string} id - PostgreSQL Complaint UUID
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function getComplaintById(id) {
  return apiClient(`/api/v1/complaints/${encodeURIComponent(id)}`, {
    method: 'GET'
  });
}

/**
 * Creates a new complaint for the active tenant.
 * Calls POST /api/v1/complaints.
 *
 * @param {Object} data - Complaint payload ({ title, description })
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function createComplaint(data) {
  return apiClient('/api/v1/complaints', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

/**
 * Updates a complaint's status (resolved or rejected) with optional resolution notes.
 * Calls PATCH /api/v1/complaints/:id/status.
 *
 * @param {string} id - PostgreSQL Complaint UUID
 * @param {Object} data - Status payload ({ status: 'resolved' | 'rejected', resolutionNotes?: string })
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function updateComplaintStatus(id, data) {
  return apiClient(`/api/v1/complaints/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  });
}

export const complaintsApi = {
  getPendingComplaintsCount,
  listComplaints,
  getComplaintById,
  createComplaint,
  updateComplaintStatus
};

export default complaintsApi;
