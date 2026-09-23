/**
 * src/api/attendance.js
 *
 * Attendance API client module communicating with the PostgreSQL backend.
 * Uses the centralized HTTP client with automatic JWT token injection and tenant context.
 */

import { apiClient } from './client.js';

/**
 * Builds a clean query string omitting null, undefined, and empty string values.
 *
 * @param {Object} [params={}] - Key-value map of query parameters
 * @returns {string} Formatted query string (e.g. '?filter=monthly&limit=100') or empty string
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
 * Retrieves attendance records and cumulative statistics for a specific student.
 * Calls GET /api/v1/attendance/students/:studentId.
 *
 * @param {string} studentId - PostgreSQL Student UUID
 * @param {Object} [query={}] - Optional filters ({ filter?: 'all'|'weekly'|'monthly'|'term', academicYear?: string, page?: number, limit?: number })
 * @returns {Promise<{ student: Object, cumulativeStat: Object, timeline: Array<Object>, pagination: Object }>}
 */
export async function getStudentAttendance(studentId, query = {}) {
  const qs = buildQueryString(query);
  return apiClient(`/api/v1/attendance/students/${encodeURIComponent(studentId)}${qs}`, {
    method: 'GET'
  });
}

/**
 * Lists attendance sessions with filtering by classId, sectionId, date, startDate, endDate, session, pagination.
 * Calls GET /api/v1/attendance/sessions.
 *
 * @param {Object} [query={}] - Optional query parameters ({ classId?, sectionId?, date?, startDate?, endDate?, session?, page?, limit?, sort?, order? })
 * @returns {Promise<{ success: boolean, data: Array<Object>, pagination: Object, message?: string }>}
 */
export async function listAttendanceSessions(query = {}) {
  const qs = buildQueryString(query);
  return apiClient(`/api/v1/attendance/sessions${qs}`, {
    method: 'GET'
  });
}

/**
 * Retrieves a single attendance session with full student records.
 * Calls GET /api/v1/attendance/sessions/:sessionId.
 *
 * @param {string} sessionId - PostgreSQL AttendanceSession UUID
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function getAttendanceSession(sessionId) {
  return apiClient(`/api/v1/attendance/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'GET'
  });
}

/**
 * Creates or upserts an attendance session with student records in bulk.
 * Calls POST /api/v1/attendance/sessions.
 *
 * @param {Object} payload - Session payload ({ classId, sectionId?, date, session?, academicYear?, records: [{ studentId, status, remark? }] })
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function createAttendanceSession(payload = {}) {
  return apiClient('/api/v1/attendance/sessions', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * Updates student records within an existing attendance session.
 * Calls PATCH /api/v1/attendance/sessions/:sessionId.
 *
 * @param {string} sessionId - PostgreSQL AttendanceSession UUID
 * @param {Object} payload - Update payload ({ records: [{ studentId, status, remark? }] })
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function updateAttendanceSession(sessionId, payload = {}) {
  return apiClient(`/api/v1/attendance/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

/**
 * Retrieves daily institutional attendance metrics.
 * Calls GET /api/v1/attendance/dashboard-stats.
 *
 * @param {Object} [query={}] - Optional query ({ date? })
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function getAttendanceDashboardStats(query = {}) {
  const qs = buildQueryString(query);
  return apiClient(`/api/v1/attendance/dashboard-stats${qs}`, {
    method: 'GET'
  });
}

/**
 * Lists paginated repeated absentee flags.
 * Calls GET /api/v1/attendance/absentee-flags.
 *
 * @param {Object} [query={}] - Optional query ({ classId?, month?, isResolved?, page?, limit? })
 * @returns {Promise<{ success: boolean, data: Array<Object>, pagination: Object, message?: string }>}
 */
export async function listAbsenteeFlags(query = {}) {
  const qs = buildQueryString(query);
  return apiClient(`/api/v1/attendance/absentee-flags${qs}`, {
    method: 'GET'
  });
}

/**
 * Resolves an absentee flag with optional resolution notes.
 * Calls PATCH /api/v1/attendance/absentee-flags/:flagId/resolve.
 *
 * @param {string} flagId - PostgreSQL AbsenteeFlag UUID
 * @param {Object} [payload={}] - Resolution payload ({ isResolved?: boolean, resolutionNotes?: string })
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function resolveAbsenteeFlag(flagId, payload = {}) {
  return apiClient(`/api/v1/attendance/absentee-flags/${encodeURIComponent(flagId)}/resolve`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

/**
 * Retrieves attendance configuration settings for tenant.
 * Calls GET /api/v1/attendance/settings.
 *
 * @returns {Promise<{ success: boolean, data: { cutoffTime: string, lateThreshold: string, absenteeThreshold: number, workingHoursStart: string, workingHoursEnd: string, timezone: string, lastCutoffCheckDate: string|null }, message?: string }>}
 */
export async function getAttendanceSettings() {
  return apiClient('/api/v1/attendance/settings', {
    method: 'GET'
  });
}

/**
 * Updates attendance configuration settings for tenant.
 * Calls PATCH /api/v1/attendance/settings.
 *
 * @param {Object} payload - Settings payload ({ cutoffTime?: string, lateThreshold?: string, absenteeThreshold?: number, workingHoursStart?: string, workingHoursEnd?: string, timezone?: string })
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function updateAttendanceSettings(payload = {}) {
  return apiClient('/api/v1/attendance/settings', {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

/**
 * Legacy wrapper: marks or creates attendance.
 *
 * @param {Object} payload - Session attendance payload
 * @returns {Promise<Object>}
 */
export async function markAttendance(payload) {
  return createAttendanceSession(payload);
}

export const attendanceApi = {
  getStudentAttendance,
  listAttendanceSessions,
  getAttendanceSession,
  createAttendanceSession,
  updateAttendanceSession,
  getAttendanceDashboardStats,
  listAbsenteeFlags,
  resolveAbsenteeFlag,
  getAttendanceSettings,
  updateAttendanceSettings,
  markAttendance
};

export default attendanceApi;

