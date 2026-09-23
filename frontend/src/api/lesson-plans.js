/**
 * src/api/lesson-plans.js
 *
 * Lesson Plans API client module communicating with the PostgreSQL REST backend.
 * Uses the centralized HTTP client with automatic JWT token injection and tenant context.
 */

import { apiClient } from './client.js';

const ALLOWED_LESSON_PLAN_QUERY_KEYS = [
  'classId',
  'subjectId',
  'teacherId',
  'status',
  'startDate',
  'endDate',
  'search',
  'page',
  'limit'
];

/**
 * Builds a clean query string from an allowlist of permitted keys.
 *
 * @param {Object} [params={}] - Key-value map of query parameters
 * @param {Array<string>} [allowedKeys=ALLOWED_LESSON_PLAN_QUERY_KEYS] - Array of allowed key names
 * @returns {string} Formatted query string with leading '?' or empty string
 */
function buildQueryString(params = {}, allowedKeys = ALLOWED_LESSON_PLAN_QUERY_KEYS) {
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
 * Lists lesson plans with optional filtering (classId, subjectId, teacherId, status, startDate, endDate, search, page, limit).
 * Calls GET /api/v1/lesson-plans.
 *
 * @param {Object} [params={}] - Query options
 * @returns {Promise<{ success: boolean, data: Array<Object>, pagination: { total: number, page: number, limit: number, totalPages: number } }>}
 */
export async function listLessonPlans(params = {}) {
  const qs = buildQueryString(params);
  return apiClient(`/api/v1/lesson-plans${qs}`, {
    method: 'GET'
  });
}

/**
 * Retrieves a single lesson plan by ID.
 * Calls GET /api/v1/lesson-plans/:id.
 *
 * @param {string} id - Lesson plan UUID
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function getLessonPlan(id) {
  return apiClient(`/api/v1/lesson-plans/${encodeURIComponent(id)}`, {
    method: 'GET'
  });
}

/**
 * Creates a new lesson plan.
 * Calls POST /api/v1/lesson-plans.
 *
 * @param {Object} payload - { classId, subjectId, topic, date, status?, objectives? }
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function createLessonPlan(payload) {
  return apiClient('/api/v1/lesson-plans', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * Updates an existing lesson plan.
 * Calls PATCH /api/v1/lesson-plans/:id.
 *
 * @param {string} id - Lesson plan UUID
 * @param {Object} payload - { classId?, subjectId?, topic?, date?, status?, objectives? }
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function updateLessonPlan(id, payload) {
  return apiClient(`/api/v1/lesson-plans/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

/**
 * Deletes a lesson plan by ID.
 * Calls DELETE /api/v1/lesson-plans/:id.
 *
 * @param {string} id - Lesson plan UUID
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function deleteLessonPlan(id) {
  return apiClient(`/api/v1/lesson-plans/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}

export const lessonPlansApi = {
  listLessonPlans,
  getLessonPlan,
  createLessonPlan,
  updateLessonPlan,
  deleteLessonPlan
};

export default lessonPlansApi;
