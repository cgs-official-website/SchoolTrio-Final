/**
 * src/api/homework.js
 *
 * Homework API client module communicating with the PostgreSQL backend.
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
 * Lists homework assignments with optional filtering (classId, subjectId, startDate, endDate, search, page, limit, sort, order).
 * Calls GET /api/v1/homework.
 *
 * @param {Object} [query={}] - Optional query filters and pagination
 * @returns {Promise<{ success: boolean, data: Array<Object>, pagination: Object, message?: string }>}
 */
export async function listHomework(query = {}) {
  const qs = buildQueryString(query);
  return apiClient(`/api/v1/homework${qs}`, {
    method: 'GET'
  });
}

/**
 * Retrieves a single homework assignment record with student submission roster.
 * Calls GET /api/v1/homework/:id.
 *
 * @param {string} id - PostgreSQL Homework UUID
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function getHomework(id) {
  return apiClient(`/api/v1/homework/${encodeURIComponent(id)}`, {
    method: 'GET'
  });
}

/**
 * Creates a new homework assignment record.
 * Calls POST /api/v1/homework.
 *
 * @param {Object} payload - Homework payload ({ title, description, classId, subjectId, dueDate, remarks?, maxMarks?, attachments? })
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function createHomework(payload = {}) {
  return apiClient('/api/v1/homework', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * Updates an existing homework assignment record.
 * Calls PUT /api/v1/homework/:id.
 *
 * @param {string} id - PostgreSQL Homework UUID
 * @param {Object} payload - Update payload ({ title?, description?, classId?, subjectId?, dueDate?, remarks?, maxMarks?, attachments? })
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function updateHomework(id, payload = {}) {
  return apiClient(`/api/v1/homework/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

/**
 * Deletes a homework assignment record.
 * Calls DELETE /api/v1/homework/:id.
 *
 * @param {string} id - PostgreSQL Homework UUID
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function deleteHomework(id) {
  return apiClient(`/api/v1/homework/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}

/**
 * Staff evaluates or updates a student submission.
 * Calls PATCH /api/v1/homework/:id/submissions/:studentId.
 *
 * @param {string} homeworkId - PostgreSQL Homework UUID
 * @param {string} studentId - PostgreSQL Student UUID
 * @param {Object} payload - Submission update ({ status?, grade?, feedback? })
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function updateSubmission(homeworkId, studentId, payload = {}) {
  return apiClient(
    `/api/v1/homework/${encodeURIComponent(homeworkId)}/submissions/${encodeURIComponent(studentId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }
  );
}

/**
 * Lists student-scoped homework assignments for parent/student view.
 * Calls GET /api/v1/students/:studentId/homework.
 *
 * @param {string} studentId - PostgreSQL Student UUID
 * @param {Object} [query={}] - Optional query filters ({ status, subjectId, search, page, limit, sort, order })
 * @returns {Promise<{ success: boolean, data: Array<Object>, pagination: Object, message?: string }>}
 */
export async function getStudentHomework(studentId, query = {}) {
  const qs = buildQueryString(query);
  return apiClient(`/api/v1/students/${encodeURIComponent(studentId)}/homework${qs}`, {
    method: 'GET'
  });
}

/**
 * Parent updates student homework status.
 * Calls PATCH /api/v1/students/:studentId/homework/:homeworkId/status.
 *
 * @param {string} studentId - PostgreSQL Student UUID
 * @param {string} homeworkId - PostgreSQL Homework UUID
 * @param {Object} payload - Status payload ({ status })
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function updateStudentHomeworkStatus(studentId, homeworkId, payload = {}) {
  return apiClient(
    `/api/v1/students/${encodeURIComponent(studentId)}/homework/${encodeURIComponent(homeworkId)}/status`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }
  );
}

/**
 * Retrieves unread/new homework count for authenticated user.
 * Calls GET /api/v1/homework/unread-count.
 *
 * @param {Object} [query={}] - Optional query filters ({ since })
 * @returns {Promise<{ success: boolean, data: { count: number }, message?: string }>}
 */
export async function getUnreadHomeworkCount(query = {}) {
  const qs = buildQueryString(query);
  return apiClient(`/api/v1/homework/unread-count${qs}`, {
    method: 'GET'
  });
}

export const homeworkApi = {
  listHomework,
  getHomework,
  createHomework,
  updateHomework,
  deleteHomework,
  updateSubmission,
  getStudentHomework,
  updateStudentHomeworkStatus,
  getUnreadHomeworkCount
};

export default homeworkApi;

