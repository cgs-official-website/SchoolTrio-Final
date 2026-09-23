/**
 * src/api/fees.js
 *
 * Fee Collection Periods & Fee Structures API client module communicating with the PostgreSQL backend.
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

// ============================================================
// 1. Fee Collection Periods API (/api/v1/fee-collection-periods)
// ============================================================

/**
 * Lists fee collection periods for the active tenant.
 * Calls GET /api/v1/fee-collection-periods.
 *
 * @param {Object} [query={}] - Optional filters and pagination ({ search, page, limit, order })
 * @returns {Promise<{ success: boolean, data: Array<Object>, pagination: Object, message?: string }>}
 */
export async function listCollectionPeriods(query = {}) {
  const qs = buildQueryString(query);
  return apiClient(`/api/v1/fee-collection-periods${qs}`, {
    method: 'GET'
  });
}

/**
 * Retrieves a single fee collection period by ID.
 * Calls GET /api/v1/fee-collection-periods/:id.
 *
 * @param {string} id - PostgreSQL FeeCollectionPeriod UUID
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function getCollectionPeriod(id) {
  return apiClient(`/api/v1/fee-collection-periods/${encodeURIComponent(id)}`, {
    method: 'GET'
  });
}

/**
 * Creates a new fee collection period.
 * Calls POST /api/v1/fee-collection-periods.
 *
 * @param {Object} payload - Period attributes ({ name, dueDate, displayOrder? })
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function createCollectionPeriod(payload = {}) {
  return apiClient('/api/v1/fee-collection-periods', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * Updates an existing fee collection period.
 * Calls PATCH /api/v1/fee-collection-periods/:id.
 *
 * @param {string} id - PostgreSQL FeeCollectionPeriod UUID
 * @param {Object} payload - Partial attributes to update ({ name?, dueDate?, displayOrder? })
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function updateCollectionPeriod(id, payload = {}) {
  return apiClient(`/api/v1/fee-collection-periods/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

/**
 * Deletes a fee collection period safely.
 * Calls DELETE /api/v1/fee-collection-periods/:id.
 *
 * @param {string} id - PostgreSQL FeeCollectionPeriod UUID
 * @returns {Promise<{ success: boolean, data: { id: string, deleted: boolean }, message?: string }>}
 */
export async function deleteCollectionPeriod(id) {
  return apiClient(`/api/v1/fee-collection-periods/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}

// ============================================================
// 2. Fee Structures API (/api/v1/fee-structures)
// ============================================================

/**
 * Lists fee structures with pagination and filters.
 * Calls GET /api/v1/fee-structures.
 *
 * @param {Object} [query={}] - Query filters ({ classId, collectionPeriodId, search, page, limit, order })
 * @returns {Promise<{ success: boolean, data: Array<Object>, pagination: Object, message?: string }>}
 */
export async function listFeeStructures(query = {}) {
  const qs = buildQueryString(query);
  return apiClient(`/api/v1/fee-structures${qs}`, {
    method: 'GET'
  });
}

/**
 * Retrieves a single fee structure by ID.
 * Calls GET /api/v1/fee-structures/:id.
 *
 * @param {string} id - PostgreSQL FeeStructure UUID
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function getFeeStructure(id) {
  return apiClient(`/api/v1/fee-structures/${encodeURIComponent(id)}`, {
    method: 'GET'
  });
}

/**
 * Creates a new fee structure and automatically generates student invoices for the class.
 * Calls POST /api/v1/fee-structures.
 *
 * @param {Object} payload - FeeStructure payload ({ name, amount, dueDate, classId, collectionPeriodId?, customData? })
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function createFeeStructure(payload = {}) {
  return apiClient('/api/v1/fee-structures', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * Updates an existing fee structure.
 * Calls PATCH /api/v1/fee-structures/:id.
 *
 * @param {string} id - PostgreSQL FeeStructure UUID
 * @param {Object} payload - Partial attributes to update ({ name?, amount?, dueDate?, classId?, collectionPeriodId?, customData? })
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function updateFeeStructure(id, payload = {}) {
  return apiClient(`/api/v1/fee-structures/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

/**
 * Deletes a fee structure safely.
 * Calls DELETE /api/v1/fee-structures/:id.
 *
 * @param {string} id - PostgreSQL FeeStructure UUID
 * @returns {Promise<{ success: boolean, data: { id: string, deleted: boolean }, message?: string }>}
 */
export async function deleteFeeStructure(id) {
  return apiClient(`/api/v1/fee-structures/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}

export const feesApi = {
  listCollectionPeriods,
  getCollectionPeriod,
  createCollectionPeriod,
  updateCollectionPeriod,
  deleteCollectionPeriod,
  listFeeStructures,
  getFeeStructure,
  createFeeStructure,
  updateFeeStructure,
  deleteFeeStructure
};

export default feesApi;
