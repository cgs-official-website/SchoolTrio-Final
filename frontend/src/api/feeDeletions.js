/**
 * src/api/feeDeletions.js
 *
 * Fee Transaction > Delete Student Fee API client (/api/v1/fee-deletions).
 */

import { apiClient } from './client.js';
import { buildQueryString } from './queryString.js';

/** @param {Object} [query] - { page, limit, search, classId, sectionId, studentId, sortBy, order } */
export async function listFeeDeletions(query = {}) {
  return apiClient(`/api/v1/fee-deletions${buildQueryString(query)}`, { method: 'GET' });
}

/** All fees of one student, each with paid, concession and balance. */
export async function listStudentFees(studentId) {
  return apiClient(`/api/v1/fee-deletions/student-fees${buildQueryString({ studentId })}`, { method: 'GET' });
}

/** @param {Object} payload - { studentId, invoiceIds, reason } */
export async function createFeeDeletion(payload = {}) {
  return apiClient('/api/v1/fee-deletions', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export const feeDeletionsApi = {
  listFeeDeletions,
  listStudentFees,
  createFeeDeletion
};

export default feeDeletionsApi;