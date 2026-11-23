/**
 * src/api/feeEntries.js
 *
 * Fee Entry (Fee Transaction > Structure) API client.
 * One "fee entry" row is one student's pending fee.
 */

import { apiClient } from './client.js';

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

/** Fee Type Name options shown in the Add Fee Entry form and the table. */
export const FEE_TYPE_OPTIONS = [
  { value: 'ALL_STUDENT', label: 'All Student' },
  { value: 'CLASS', label: 'Specific Class' },
  { value: 'SECTION', label: 'Specific Class Section' },
  { value: 'STUDENT', label: 'Specific Student' }
];

export const FEE_TYPE_LABELS = Object.fromEntries(FEE_TYPE_OPTIONS.map((o) => [o.value, o.label]));

export const GENDER_OPTIONS = ['Male', 'Female'];

/**
 * GET /api/v1/fee-entries
 * @param {Object} [query] - { page, limit, search, classId, sectionId, gender, feeType, sortBy, order }
 */
export async function listFeeEntries(query = {}) {
  return apiClient(`/api/v1/fee-entries${buildQueryString(query)}`, { method: 'GET' });
}

/**
 * POST /api/v1/fee-entries
 * @param {Object} payload - { feeType, targetIds, feeCategoryId, gender?, amount, dueDate }
 * @returns {Promise<{ success: boolean, data: { feeStructureId, matched, generated, skipped } }>}
 */
export async function createFeeEntry(payload = {}) {
  return apiClient('/api/v1/fee-entries', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * PATCH /api/v1/fee-entries/:id  (amount and/or dueDate, Pending rows only)
 */
export async function updateFeeEntry(id, payload = {}) {
  return apiClient(`/api/v1/fee-entries/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export const feeEntriesApi = {
  listFeeEntries,
  createFeeEntry,
  updateFeeEntry,
};

export default feeEntriesApi;