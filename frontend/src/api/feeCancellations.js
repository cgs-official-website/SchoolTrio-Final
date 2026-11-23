/**
 * src/api/feeCancellations.js
 *
 * Fee Transaction > Cancellation API client (/api/v1/fee-cancellations).
 */

import { apiClient } from './client.js';
import { buildQueryString } from './queryString.js';

/** @param {Object} [query] - { page, limit, search, classId, sectionId, studentId, sortBy, order } */
export async function listFeeCancellations(query = {}) {
  return apiClient(`/api/v1/fee-cancellations${buildQueryString(query)}`, { method: 'GET' });
}

/** Paid fees of one student that can be cancelled. */
export async function listStudentPayments(studentId) {
  return apiClient(`/api/v1/fee-cancellations/student-payments${buildQueryString({ studentId })}`, {
    method: 'GET'
  });
}

/** @param {Object} payload - { invoiceId, description } */
export async function createFeeCancellation(payload = {}) {
  return apiClient('/api/v1/fee-cancellations', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export const feeCancellationsApi = {
  listFeeCancellations,
  listStudentPayments,
  createFeeCancellation
};

export default feeCancellationsApi;