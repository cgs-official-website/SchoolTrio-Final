/**
 * src/api/reportCards.js
 *
 * Report Cards API client module communicating with the PostgreSQL backend.
 * Uses the centralized HTTP client with automatic JWT token injection and refresh.
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
 * Generates an in-memory preview of report cards for a class without persisting records.
 *
 * @param {Object} payload
 * @param {string} payload.classId - Target class UUID
 * @param {string} [payload.examId] - Optional Examination UUID (omitted for continuous assessment)
 * @param {Array<string>} [payload.targetStudentIds] - Optional subset of student UUIDs
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function previewReportCards(payload = {}) {
  return apiClient('/api/v1/report-cards/preview', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * Publishes and persists historical snapshot report cards for students in a class.
 *
 * @param {Object} payload
 * @param {string} payload.classId - Target class UUID
 * @param {string} [payload.examId] - Optional Examination UUID (null/omitted for continuous assessment)
 * @param {Array<string>} [payload.targetStudentIds] - Optional subset of student UUIDs
 * @returns {Promise<{ success: boolean, data: { publishedCount: number, classId: string, examId: string|null }, message?: string }>}
 */
export async function publishReportCards(payload = {}) {
  return apiClient('/api/v1/report-cards/publish', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * Retrieves a single report card by UUID within tenant scope.
 *
 * @param {string} reportCardId - PostgreSQL ReportCard UUID
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function getReportCard(reportCardId) {
  return apiClient(`/api/v1/report-cards/${reportCardId}`, {
    method: 'GET'
  });
}

/**
 * Lists published report cards for a specific student with pagination and filtering.
 *
 * @param {string} studentId - PostgreSQL Student UUID
 * @param {Object} [query={}] - Query options (page, limit, sortBy, sortOrder, academicYear, term, examId)
 * @returns {Promise<{ success: boolean, data: Array<Object>, pagination: Object, message?: string }>}
 */
export async function getStudentReportCards(studentId, query = {}) {
  const qs = buildQueryString(query);
  return apiClient(`/api/v1/report-cards/student/${studentId}${qs}`, {
    method: 'GET'
  });
}

/**
 * Lists published report cards for a class with pagination and filtering.
 *
 * @param {string} classId - PostgreSQL Class UUID
 * @param {Object} [query={}] - Query options (page, limit, sortBy, sortOrder, academicYear, term, examId)
 * @returns {Promise<{ success: boolean, data: Array<Object>, pagination: Object, message?: string }>}
 */
export async function getClassReportCards(classId, query = {}) {
  const qs = buildQueryString(query);
  return apiClient(`/api/v1/report-cards/class/${classId}${qs}`, {
    method: 'GET'
  });
}

export const reportCardsApi = {
  previewReportCards,
  publishReportCards,
  getReportCard,
  getStudentReportCards,
  getClassReportCards
};

export default reportCardsApi;
