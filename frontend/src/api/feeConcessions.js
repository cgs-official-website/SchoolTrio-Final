/**
 * src/api/feeConcessions.js
 *
 * Fee Transaction > Concession API client (/api/v1/fee-concessions).
 */

import { apiClient } from './client.js';
import { buildQueryString } from './queryString.js';

export const VALUE_TYPE_OPTIONS = [
  { value: 'PERCENTAGE', label: 'Percentage ( % )' },
  { value: 'RUPEES', label: 'Rupees' }
];

/** @param {Object} [query] - { page, limit, search, classId, sectionId, studentId, feeCategoryId, concessionCategoryId, sortBy, order } */
export async function listFeeConcessions(query = {}) {
  return apiClient(`/api/v1/fee-concessions${buildQueryString(query)}`, { method: 'GET' });
}

/** Pending fees of one student, each with amount, concession given and balance. */
export async function listStudentFees(studentId) {
  return apiClient(`/api/v1/fee-concessions/student-fees${buildQueryString({ studentId })}`, { method: 'GET' });
}

/** @param {Object} payload - { studentId, invoiceIds, valueType, value, concessionCategoryId, description? } */
export async function createFeeConcession(payload = {}) {
  return apiClient('/api/v1/fee-concessions', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function deleteFeeConcession(id) {
  return apiClient(`/api/v1/fee-concessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export const feeConcessionsApi = {
  listFeeConcessions,
  listStudentFees,
  createFeeConcession,
  deleteFeeConcession
};

export default feeConcessionsApi;