/**
 * src/api/parents.js
 *
 * Parent and Student Identity / Child Linking API client module communicating with the PostgreSQL backend.
 * Uses the centralized HTTP client with automatic JWT token injection and tenant context.
 */

import { apiClient } from './client.js';

/**
 * Retrieves the list of enrolled children linked to the authenticated parent.
 * Calls GET /api/v1/parents/me/children.
 *
 * @returns {Promise<{ success: boolean, data: Array<Object>, message?: string }>}
 */
export async function getMyChildren() {
  return apiClient('/api/v1/parents/me/children', {
    method: 'GET'
  });
}

/**
 * Links an enrolled child to the authenticated parent using admission number and date of birth.
 * Calls POST /api/v1/parents/me/link-child.
 *
 * @param {Object} payload
 * @param {string} payload.admissionNumber - Official student admission number
 * @param {string} payload.dob - Date of birth in YYYY-MM-DD format
 * @param {string} payload.relationship - Relationship to student (e.g. 'Mother', 'Father', 'Guardian')
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function linkChild({ admissionNumber, dob, relationship }) {
  return apiClient('/api/v1/parents/me/link-child', {
    method: 'POST',
    body: JSON.stringify({
      admissionNumber,
      dob,
      relationship
    })
  });
}

/**
 * Unlinks a child relationship from the authenticated parent.
 * Calls DELETE /api/v1/parents/me/children/:studentId.
 *
 * @param {string} studentId - PostgreSQL Student UUID
 * @returns {Promise<{ success: boolean, data: null, message?: string }>}
 */
export async function unlinkChild(studentId) {
  return apiClient(`/api/v1/parents/me/children/${encodeURIComponent(studentId)}`, {
    method: 'DELETE'
  });
}
