/**
 * src/api/concessionCategories.js
 *
 * Fee Master: Concession Category API client (/api/v1/concession-categories).
 */

import { apiClient } from './client.js';
import { buildQueryString } from './queryString.js';

/**
 * @param {Object} [query={}] - { page, limit, search, sortBy, order }
 * @returns {Promise<{ success: boolean, data: Array<Object>, pagination: Object }>}
 */
export async function listConcessionCategories(query = {}) {
  return apiClient(`/api/v1/concession-categories${buildQueryString(query)}`, { method: 'GET' });
}

/**
 * @param {string} id - ConcessionCategory UUID
 */
export async function getConcessionCategory(id) {
  return apiClient(`/api/v1/concession-categories/${encodeURIComponent(id)}`, { method: 'GET' });
}

/**
 * @param {Object} payload - { name }
 */
export async function createConcessionCategory(payload = {}) {
  return apiClient('/api/v1/concession-categories', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * @param {string} id - ConcessionCategory UUID
 * @param {Object} payload - Partial { name? }
 */
export async function updateConcessionCategory(id, payload = {}) {
  return apiClient(`/api/v1/concession-categories/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

/**
 * @param {string} id - ConcessionCategory UUID
 * @returns {Promise<{ success: boolean, data: { id: string, deleted: boolean } }>}
 */
export async function deleteConcessionCategory(id) {
  return apiClient(`/api/v1/concession-categories/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export const concessionCategoriesApi = {
  listConcessionCategories,
  getConcessionCategory,
  createConcessionCategory,
  updateConcessionCategory,
  deleteConcessionCategory
};

export default concessionCategoriesApi;