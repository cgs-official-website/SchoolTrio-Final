/**
 * src/api/students.js
 *
 * Students API client module communicating with the PostgreSQL backend.
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
 * Lists students for the active tenant with optional filtering.
 * Calls GET /api/v1/students.
 *
 * @param {Object} [query={}] - Query options (classId, sectionId, status, search, admissionNumber, page, limit, sort, order)
 * @returns {Promise<{ success: boolean, data: Array<Object>, pagination: Object, message?: string }>}
 */
export async function listStudents(query = {}) {
  const qs = buildQueryString(query);
  return apiClient(`/api/v1/students${qs}`, {
    method: 'GET'
  });
}

/**
 * Retrieves a single student record by UUID.
 * Calls GET /api/v1/students/:id.
 *
 * @param {string} id - PostgreSQL Student UUID
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function getStudent(id) {
  return apiClient(`/api/v1/students/${encodeURIComponent(id)}`, {
    method: 'GET'
  });
}

/**
 * Creates a new student record for the active tenant.
 * Calls POST /api/v1/students.
 *
 * @param {Object} data - Student creation payload
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function createStudent(data) {
  return apiClient('/api/v1/students', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

/**
 * Updates an existing student record by UUID.
 * Calls PATCH /api/v1/students/:id.
 *
 * @param {string} id - PostgreSQL Student UUID
 * @param {Object} data - Student update payload
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function updateStudent(id, data) {
  return apiClient(`/api/v1/students/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  });
}

/**
 * Deletes a student record by UUID within tenant scope.
 * Calls DELETE /api/v1/students/:id.
 *
 * @param {string} id - PostgreSQL Student UUID
 * @returns {Promise<{ success: boolean, data: null, message?: string }>}
 */
export async function deleteStudent(id) {
  return apiClient(`/api/v1/students/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}

/**
 * Lists parent profiles linked to a specific student.
 * Calls GET /api/v1/students/:studentId/parents.
 *
 * @param {string} studentId - PostgreSQL Student UUID
 * @returns {Promise<{ success: boolean, data: Array<Object>, message?: string }>}
 */
export async function listStudentParents(studentId) {
  return apiClient(`/api/v1/students/${encodeURIComponent(studentId)}/parents`, {
    method: 'GET'
  });
}

/**
 * Links a parent to a student (existing or new parent).
 * Calls POST /api/v1/students/:studentId/parents.
 *
 * @param {string} studentId - PostgreSQL Student UUID
 * @param {Object} data - Link payload ({ parentProfileId?, relationship?, name?, email?, phone? })
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function linkParentToStudent(studentId, data) {
  return apiClient(`/api/v1/students/${encodeURIComponent(studentId)}/parents`, {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

/**
 * Unlinks a parent profile from a student.
 * Calls DELETE /api/v1/students/:studentId/parents/:parentId.
 *
 * @param {string} studentId - PostgreSQL Student UUID
 * @param {string} parentId - PostgreSQL ParentProfile UUID
 * @returns {Promise<{ success: boolean, data: null, message?: string }>}
 */
export async function unlinkParentFromStudent(studentId, parentId) {
  return apiClient(`/api/v1/students/${encodeURIComponent(studentId)}/parents/${encodeURIComponent(parentId)}`, {
    method: 'DELETE'
  });
}

/**
 * Retrieves the health profile and medical records for a specific student.
 * Calls GET /api/v1/students/:id/health.
 *
 * @param {string} studentId - PostgreSQL Student UUID
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function getStudentHealth(studentId) {
  return apiClient(`/api/v1/students/${encodeURIComponent(studentId)}/health`, {
    method: 'GET'
  });
}

/**
 * Updates the health profile and medical records for a specific student.
 * Calls PATCH /api/v1/students/:id/health.
 *
 * @param {string} studentId - PostgreSQL Student UUID
 * @param {Object} data - Health update payload ({ bloodGroup, allergies, medicalConditions, medications, emergencyContactName, emergencyContactPhone, doctorName, doctorPhone, notes })
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function updateStudentHealth(studentId, data) {
  return apiClient(`/api/v1/students/${encodeURIComponent(studentId)}/health`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  });
}

/**
 * Updates a student's performance status within customData via the verified REST Student API.
 * Calls PATCH /api/v1/students/:id.
 *
 * @param {string} studentId - PostgreSQL Student UUID
 * @param {string} status - Performance status ('excellent' | 'improving' | 'stable' | 'warning' | 'critical')
 * @param {Object} [currentCustomData={}] - Existing customData to preserve other custom fields
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function updateStudentPerformanceStatus(studentId, status, currentCustomData = {}) {
  return updateStudent(studentId, {
    customData: {
      ...currentCustomData,
      performanceStatus: status
    }
  });
}

export async function bulkImportStudents(studentsArray) {
  return apiClient('/api/v1/students/bulk-import', {
    method: 'POST',
    body: JSON.stringify({ students: studentsArray })
  });
}

export const studentsApi = {
  listStudents,
  getStudent,
  createStudent,
  updateStudent,
  deleteStudent,
  bulkImportStudents,
  listStudentParents,
  linkParentToStudent,
  unlinkParentFromStudent,
  getStudentHealth,
  updateStudentHealth,
  updateStudentPerformanceStatus
};

export default studentsApi;

