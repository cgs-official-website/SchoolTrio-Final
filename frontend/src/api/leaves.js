/**
 * src/api/leaves.js
 *
 * Leave Application API client module communicating with the PostgreSQL backend.
 * Uses the centralized HTTP client with automatic JWT token injection and tenant context.
 */

import { apiClient } from './client.js';

/**
 * Builds a clean query string omitting null, undefined, and empty string values.
 *
 * @param {Object} [params={}] - Key-value map of query parameters
 * @returns {string} Formatted query string (e.g. '?page=1&limit=50') or empty string
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
 * Lists leave applications across the tenant (Admin).
 * Calls GET /api/v1/leaves.
 *
 * @param {Object} [query={}] - Optional query filters ({ page, limit, status, leaveType, search, applicantRole, order })
 * @returns {Promise<{ success: boolean, data: Array<Object>, pagination: Object, message?: string }>}
 */
export async function listLeaves(query = {}) {
  const qs = buildQueryString(query);
  return apiClient(`/api/v1/leaves${qs}`, {
    method: 'GET'
  });
}

/**
 * Retrieves a single leave application by ID (Admin).
 * Calls GET /api/v1/leaves/:id.
 *
 * @param {string} id - Leave application UUID
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function getLeave(id) {
  return apiClient(`/api/v1/leaves/${encodeURIComponent(id)}`, {
    method: 'GET'
  });
}

/**
 * Updates a leave application status (Approve / Reject) (Admin).
 * Calls PATCH /api/v1/leaves/:id/status.
 *
 * @param {string} id - Leave application UUID
 * @param {Object} payload - { status: 'Approved' | 'Rejected' }
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function updateLeaveStatus(id, payload = {}) {
  return apiClient(`/api/v1/leaves/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

/**
 * Deletes a leave application (Admin).
 * Calls DELETE /api/v1/leaves/:id.
 *
 * @param {string} id - Leave application UUID
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function deleteLeave(id) {
  return apiClient(`/api/v1/leaves/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}

/**
 * Lists authenticated staff member's own leave applications.
 * Calls GET /api/v1/staff/me/leaves.
 *
 * @param {Object} [query={}] - Optional query filters ({ page, limit, status, order })
 * @returns {Promise<{ success: boolean, data: Array<Object>, pagination: Object, message?: string }>}
 */
export async function getMyLeaves(query = {}) {
  const qs = buildQueryString(query);
  return apiClient(`/api/v1/staff/me/leaves${qs}`, {
    method: 'GET'
  });
}

/**
 * Submits a new leave application for the authenticated staff member.
 * Calls POST /api/v1/staff/me/leaves.
 *
 * @param {Object} payload - Leave payload ({ leaveType, customLeaveType?, startDate, endDate, reason, supportingDoc? })
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function createMyLeave(payload = {}) {
  return apiClient('/api/v1/staff/me/leaves', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * Lists leave applications for a specific student.
 * Calls GET /api/v1/students/:studentId/leaves.
 *
 * @param {string} studentId - PostgreSQL Student UUID
 * @param {Object} [query={}] - Optional query filters and pagination ({ page, limit, status, order })
 * @returns {Promise<{ success: boolean, data: Array<Object>, pagination: Object, message?: string }>}
 */
export async function getStudentLeaves(studentId, query = {}) {
  const qs = buildQueryString(query);
  return apiClient(`/api/v1/students/${encodeURIComponent(studentId)}/leaves${qs}`, {
    method: 'GET'
  });
}

/**
 * Submits a new leave application for a specific student.
 * Calls POST /api/v1/students/:studentId/leaves.
 *
 * @param {string} studentId - PostgreSQL Student UUID
 * @param {Object} payload - Leave application payload ({ leaveType, startDate, endDate, reason, supportingDoc? })
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function createStudentLeave(studentId, payload = {}) {
  return apiClient(`/api/v1/students/${encodeURIComponent(studentId)}/leaves`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * Retrieves the count of pending leave applications for administrative backlog.
 * Calls GET /api/v1/leaves/pending-count.
 *
 * @returns {Promise<{ success: boolean, data: { count: number }, message?: string }>}
 */
export async function getPendingLeavesCount() {
  return apiClient('/api/v1/leaves/pending-count', {
    method: 'GET'
  });
}

// ============================================================
// LEAVE APPROVAL RULES API (/api/v1/leaves/rules)
// ============================================================

/**
 * Lists all leave approval rules for the active tenant.
 * Calls GET /api/v1/leaves/rules.
 *
 * @returns {Promise<{ success: boolean, data: Array<Object>, message?: string }>}
 */
export async function listLeaveApprovalRules() {
  return apiClient('/api/v1/leaves/rules', {
    method: 'GET'
  });
}

/**
 * Creates a new leave approval rule band.
 * Calls POST /api/v1/leaves/rules.
 *
 * @param {Object} payload - { minDays: number, maxDays?: number | null, roleId: string, order?: number }
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function createLeaveApprovalRule(payload = {}) {
  return apiClient('/api/v1/leaves/rules', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * Updates an existing leave approval rule band.
 * Calls PATCH /api/v1/leaves/rules/:id.
 *
 * @param {string} id - Rule UUID
 * @param {Object} payload - { minDays?: number, maxDays?: number | null, roleId?: string, order?: number }
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function updateLeaveApprovalRule(id, payload = {}) {
  return apiClient(`/api/v1/leaves/rules/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

/**
 * Deletes a leave approval rule band.
 * Calls DELETE /api/v1/leaves/rules/:id.
 *
 * @param {string} id - Rule UUID
 * @returns {Promise<{ success: boolean, message?: string }>}
 */
export async function deleteLeaveApprovalRule(id) {
  return apiClient(`/api/v1/leaves/rules/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}

export const leavesApi = {
  listLeaves,
  getLeave,
  updateLeaveStatus,
  deleteLeave,
  getMyLeaves,
  createMyLeave,
  getStudentLeaves,
  createStudentLeave,
  getPendingLeavesCount,
  listLeaveApprovalRules,
  createLeaveApprovalRule,
  updateLeaveApprovalRule,
  deleteLeaveApprovalRule
};

export default leavesApi;

