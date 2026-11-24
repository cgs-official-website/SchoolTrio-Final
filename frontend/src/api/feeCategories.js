/**
 * src/api/feeCategories.js
 *
 * Fee Master: Fee Category API client (/api/v1/fee-categories).
 */

import { apiClient } from './client.js';
import { buildQueryString } from './queryString.js';

/**
 * Lists fee categories with pagination, search and sorting.
 *
 * @param {Object} [query={}] - { page, limit, search, categoryType, sortBy, order }
 * @returns {Promise<{ success: boolean, data: Array<Object>, pagination: Object }>}
 */
export async function listFeeCategories(query = {}) {
  return apiClient(`/api/v1/fee-categories${buildQueryString(query)}`, { method: 'GET' });
}

/**
 * @param {string} id - FeeCategory UUID
 */
export async function getFeeCategory(id) {
  return apiClient(`/api/v1/fee-categories/${encodeURIComponent(id)}`, { method: 'GET' });
}

/**
 * @param {Object} payload - { name, categoryType?, paymentOrder?, shortCode? }
 */
export async function createFeeCategory(payload = {}) {
  return apiClient('/api/v1/fee-categories', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * @param {string} id - FeeCategory UUID
 * @param {Object} payload - Partial { name?, categoryType?, paymentOrder?, shortCode? }
 */
export async function updateFeeCategory(id, payload = {}) {
  return apiClient(`/api/v1/fee-categories/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

/**
 * @param {string} id - FeeCategory UUID
 * @returns {Promise<{ success: boolean, data: { id: string, deleted: boolean } }>}
 */
export async function deleteFeeCategory(id) {
  return apiClient(`/api/v1/fee-categories/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/**
 * Lists Normal / Late / Bus plus any custom types already in use.
 * @returns {Promise<{ success: boolean, data: string[] }>}
 */
export async function listFeeCategoryTypes() {
  return apiClient('/api/v1/fee-categories/types', { method: 'GET' });
}

export const feeCategoriesApi = {
  listFeeCategories,
  getFeeCategory,
  createFeeCategory,
  updateFeeCategory,
  deleteFeeCategory,
  listFeeCategoryTypes
};

export default feeCategoriesApi;