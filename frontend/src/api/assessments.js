/**
 * src/api/assessments.js
 *
 * Assessment and Assessment Grade API client module communicating with the PostgreSQL backend.
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
 * Lists assessments with optional filtering (classId, examId, subjectId, search, date, pagination).
 *
 * @param {Object} [query={}] - Optional query filters and pagination
 * @returns {Promise<{ success: boolean, data: Array<Object>, pagination: Object, message?: string }>}
 */
export async function listAssessments(query = {}) {
  const qs = buildQueryString(query);
  return apiClient(`/api/v1/assessments${qs}`, {
    method: 'GET'
  });
}

/**
 * Retrieves a single assessment record by ID.
 *
 * @param {string} id - PostgreSQL Assessment UUID
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function getAssessment(id) {
  return apiClient(`/api/v1/assessments/${encodeURIComponent(id)}`, {
    method: 'GET'
  });
}

/**
 * Creates a new assessment record.
 *
 * @param {Object} payload - Assessment attributes ({ title, classId, totalMarks, passingMarks?, date?, examId?, subjectId? })
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function createAssessment(payload = {}) {
  return apiClient('/api/v1/assessments', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * Updates an existing assessment record.
 *
 * @param {string} id - PostgreSQL Assessment UUID
 * @param {Object} payload - Partial assessment attributes to update ({ title?, totalMarks?, passingMarks?, date?, examId?, subjectId? })
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function updateAssessment(id, payload = {}) {
  return apiClient(`/api/v1/assessments/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

/**
 * Deletes an assessment record safely.
 * Blocks if student grades are recorded.
 *
 * @param {string} id - PostgreSQL Assessment UUID
 * @returns {Promise<{ success: boolean, data: { message: string, id: string }, message?: string }>}
 */
export async function deleteAssessment(id) {
  return apiClient(`/api/v1/assessments/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}

/**
 * Retrieves student grades recorded for an assessment (Staff only).
 *
 * @param {string} assessmentId - PostgreSQL Assessment UUID
 * @param {Object} [query={}] - Optional query filters and pagination
 * @returns {Promise<{ success: boolean, data: Array<Object>, pagination: Object, message?: string }>}
 */
export async function getAssessmentGrades(assessmentId, query = {}) {
  const qs = buildQueryString(query);
  return apiClient(`/api/v1/assessments/${encodeURIComponent(assessmentId)}/grades${qs}`, {
    method: 'GET'
  });
}

/**
 * Retrieves a single student's recorded grade for an assessment.
 * Calls the student-scoped REST endpoint GET /api/v1/assessments/:assessmentId/grades/:studentId.
 *
 * @param {string} assessmentId - PostgreSQL Assessment UUID
 * @param {string} studentId - PostgreSQL Student UUID
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function getStudentAssessmentGrade(assessmentId, studentId) {
  return apiClient(`/api/v1/assessments/${encodeURIComponent(assessmentId)}/grades/${encodeURIComponent(studentId)}`, {
    method: 'GET'
  });
}

/**
 * Atomically saves/upserts multiple student grades for an assessment in bulk.
 *
 * @param {string} assessmentId - PostgreSQL Assessment UUID
 * @param {Object} payload - Bulk payload ({ grades: Array<{ studentId: string, marksObtained: number, remarks?: string }> })
 * @returns {Promise<{ success: boolean, data: { count: number, grades: Array<Object> }, message?: string }>}
 */
export async function bulkUpsertAssessmentGrades(assessmentId, payload = {}) {
  return apiClient(`/api/v1/assessments/${encodeURIComponent(assessmentId)}/grades/bulk`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * Clears/deletes a single student's recorded grade for an assessment.
 *
 * @param {string} assessmentId - PostgreSQL Assessment UUID
 * @param {string} studentId - PostgreSQL Student UUID
 * @returns {Promise<{ success: boolean, data: { message: string, assessmentId: string, studentId: string }, message?: string }>}
 */
export async function deleteAssessmentGrade(assessmentId, studentId) {
  return apiClient(`/api/v1/assessments/${encodeURIComponent(assessmentId)}/grades/${encodeURIComponent(studentId)}`, {
    method: 'DELETE'
  });
}

export const assessmentsApi = {
  listAssessments,
  getAssessment,
  createAssessment,
  updateAssessment,
  deleteAssessment,
  getAssessmentGrades,
  getStudentAssessmentGrade,
  bulkUpsertAssessmentGrades,
  deleteAssessmentGrade
};

export default assessmentsApi;
