/**
 * src/api/banks.js
 *
 * Fee Master: Bank Master API client (/api/v1/banks).
 */

import { apiClient } from './client.js';
import { buildQueryString } from './queryString.js';

/**
 * @param {Object} [query={}] - { page, limit, search, sortBy, order }
 * @returns {Promise<{ success: boolean, data: Array<Object>, pagination: Object }>}
 */
export async function listBanks(query = {}) {
  return apiClient(`/api/v1/banks${buildQueryString(query)}`, { method: 'GET' });
}

/**
 * @param {string} id - Bank UUID
 */
export async function getBank(id) {
  return apiClient(`/api/v1/banks/${encodeURIComponent(id)}`, { method: 'GET' });
}

/**
 * @param {Object} payload - { name, code?, isDefault? }
 */
export async function createBank(payload = {}) {
  return apiClient('/api/v1/banks', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * @param {string} id - Bank UUID
 * @param {Object} payload - Partial { name?, code?, isDefault? }
 */
export async function updateBank(id, payload = {}) {
  return apiClient(`/api/v1/banks/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

/**
 * @param {string} id - Bank UUID
 * @returns {Promise<{ success: boolean, data: { id: string, deleted: boolean } }>}
 */
export async function deleteBank(id) {
  return apiClient(`/api/v1/banks/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export const banksApi = {
  listBanks,
  getBank,
  createBank,
  updateBank,
  deleteBank
};

export default banksApi;