/**
 * src/api/ptm.js
 *
 * PTM (Parent-Teacher Meeting) API client module communicating with the PostgreSQL backend.
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
 * Lists PTM appointments for the authenticated teacher's assigned class/schedule.
 * Calls GET /api/v1/ptm/teacher.
 *
 * @param {Object} [query={}] - Query options (classId, tab, date, status, page, limit, sort, order)
 * @returns {Promise<{ success: boolean, data: Array<Object>, pagination: Object }>}
 */
export async function getTeacherAppointments(query = {}) {
  const qs = buildQueryString(query);
  return apiClient(`/api/v1/ptm/teacher${qs}`, {
    method: 'GET'
  });
}

/**
 * Lists PTM appointments for a specific student (Parent custody verified).
 * Calls GET /api/v1/ptm/student/:studentId.
 *
 * @param {string} studentId - PostgreSQL Student UUID
 * @param {Object} [query={}] - Query options (tab, status, page, limit, sort, order)
 * @returns {Promise<{ success: boolean, data: Array<Object>, pagination: Object }>}
 */
export async function getStudentAppointments(studentId, query = {}) {
  const qs = buildQueryString(query);
  return apiClient(`/api/v1/ptm/student/${encodeURIComponent(studentId)}${qs}`, {
    method: 'GET'
  });
}

/**
 * Retrieves a single PTM appointment by ID.
 * Calls GET /api/v1/ptm/:id.
 *
 * @param {string} id - PostgreSQL Appointment UUID
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function getAppointment(id) {
  return apiClient(`/api/v1/ptm/${encodeURIComponent(id)}`, {
    method: 'GET'
  });
}

/**
 * Creates a new PTM appointment with transactional conflict & double-booking prevention.
 * Calls POST /api/v1/ptm.
 *
 * @param {Object} data - { studentId, teacherId?, classId?, date, timeSlot?, time?, type?, notes?, status? }
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function createAppointment(data) {
  return apiClient('/api/v1/ptm', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

/**
 * Updates status of an existing PTM appointment.
 * Calls PATCH /api/v1/ptm/:id/status.
 *
 * @param {string} id - PostgreSQL Appointment UUID
 * @param {Object} data - { status, notes? }
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function updateAppointmentStatus(id, data) {
  return apiClient(`/api/v1/ptm/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  });
}

/**
 * Soft-cancels a PTM appointment (sets status to 'Cancelled').
 * Calls DELETE /api/v1/ptm/:id.
 *
 * @param {string} id - PostgreSQL Appointment UUID
 * @returns {Promise<{ success: boolean, message: string, id: string, status: string }>}
 */
export async function cancelAppointment(id) {
  return apiClient(`/api/v1/ptm/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}

export const ptmApi = {
  getTeacherAppointments,
  getStudentAppointments,
  getAppointment,
  createAppointment,
  updateAppointmentStatus,
  cancelAppointment
};

export default ptmApi;
