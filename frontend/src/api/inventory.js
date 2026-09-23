/**
 * src/api/inventory.js
 *
 * Inventory API client module communicating with the PostgreSQL REST backend.
 * Uses the centralized HTTP client with automatic JWT token injection and tenant context.
 */

import { apiClient } from './client.js';

const ALLOWED_ITEM_QUERY_KEYS = ['search', 'category', 'status', 'page', 'limit'];
const ALLOWED_AUDIT_QUERY_KEYS = [
  'search',
  'startDate',
  'endDate',
  'productName',
  'productId',
  'category',
  'userName',
  'actionType',
  'transactionType',
  'page',
  'limit'
];

/**
 * Builds a clean query string from an allowlist of permitted keys.
 *
 * @param {Object} [params={}] - Key-value map of query parameters
 * @param {Array<string>} [allowedKeys=[]] - Array of allowed key names
 * @returns {string} Formatted query string with leading '?' or empty string
 */
function buildQueryString(params = {}, allowedKeys = []) {
  if (!params || typeof params !== 'object') return '';
  const searchParams = new URLSearchParams();
  const keys = allowedKeys.length > 0 ? allowedKeys : Object.keys(params);

  for (const key of keys) {
    const value = params[key];
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, String(value));
    }
  }
  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
}

// ==========================================
// 1. Categories
// ==========================================

/**
 * Lists all inventory categories for the active school tenant.
 * Calls GET /api/v1/inventory/categories.
 *
 * @returns {Promise<{ success: boolean, data: Array<Object>, message?: string }>}
 */
export async function listCategories() {
  return apiClient('/api/v1/inventory/categories', {
    method: 'GET'
  });
}

/**
 * Creates a new inventory category.
 * Calls POST /api/v1/inventory/categories.
 *
 * @param {Object} payload - { name: string, description?: string }
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function createCategory(payload) {
  return apiClient('/api/v1/inventory/categories', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * Updates an existing inventory category.
 * Calls PUT /api/v1/inventory/categories/:id.
 *
 * @param {string} id - Category UUID
 * @param {Object} payload - { name?: string, description?: string }
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function updateCategory(id, payload) {
  return apiClient(`/api/v1/inventory/categories/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

/**
 * Deletes an inventory category if no items reference it.
 * Calls DELETE /api/v1/inventory/categories/:id.
 *
 * @param {string} id - Category UUID
 * @returns {Promise<{ success: boolean, message?: string }>}
 */
export async function deleteCategory(id) {
  return apiClient(`/api/v1/inventory/categories/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}

// ==========================================
// 2. Inventory Items
// ==========================================

/**
 * Lists inventory items with optional search, category, status, and pagination filters.
 * Calls GET /api/v1/inventory/items.
 *
 * @param {Object} [params={}] - Query options (search, category, status, page, limit)
 * @returns {Promise<{ success: boolean, data: Array<Object>, meta: { total: number, page: number, limit: number, totalPages: number } }>}
 */
export async function listItems(params = {}) {
  const qs = buildQueryString(params, ALLOWED_ITEM_QUERY_KEYS);
  return apiClient(`/api/v1/inventory/items${qs}`, {
    method: 'GET'
  });
}

/**
 * Retrieves a single inventory item by UUID.
 * Calls GET /api/v1/inventory/items/:id.
 *
 * @param {string} id - Inventory Item UUID
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function getItem(id) {
  return apiClient(`/api/v1/inventory/items/${encodeURIComponent(id)}`, {
    method: 'GET'
  });
}

/**
 * Creates a new inventory item.
 * Calls POST /api/v1/inventory/items.
 *
 * @param {Object} payload - { name, productId?, category?, categoryId?, quantity?, unit?, minimumStock?, unitPrice?, customData? }
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function createItem(payload) {
  return apiClient('/api/v1/inventory/items', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * Updates an inventory item's metadata (does not directly modify stock quantity).
 * Calls PUT /api/v1/inventory/items/:id.
 *
 * @param {string} id - Inventory Item UUID
 * @param {Object} payload - { name?, productId?, category?, categoryId?, unit?, minimumStock?, unitPrice?, customData? }
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function updateItem(id, payload) {
  return apiClient(`/api/v1/inventory/items/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

/**
 * Deletes an inventory item if no audit history exists.
 * Calls DELETE /api/v1/inventory/items/:id.
 *
 * @param {string} id - Inventory Item UUID
 * @returns {Promise<{ success: boolean, message?: string }>}
 */
export async function deleteItem(id) {
  return apiClient(`/api/v1/inventory/items/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}

/**
 * Bulk deletes multiple inventory items by ID array.
 * Calls POST /api/v1/inventory/items/bulk-delete.
 *
 * @param {Array<string>} itemIds - Array of Inventory Item UUIDs
 * @returns {Promise<{ success: boolean, data: { requestedCount: number, deletedCount: number, blockedCount: number, blockedItems: Array }, message?: string }>}
 */
export async function bulkDeleteItems(itemIds) {
  return apiClient('/api/v1/inventory/items/bulk-delete', {
    method: 'POST',
    body: JSON.stringify({ itemIds })
  });
}

/**
 * Adjusts inventory item stock atomically (inbound or outbound).
 * Calls POST /api/v1/inventory/items/:id/adjust.
 *
 * @param {string} id - Inventory Item UUID
 * @param {Object} payload - { type: 'inbound' | 'outbound', quantity: number, remarks?: string }
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function adjustStock(id, payload) {
  return apiClient(`/api/v1/inventory/items/${encodeURIComponent(id)}/adjust`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * Bulk imports inventory items transactionally with duplicate conflict handling.
 * Calls POST /api/v1/inventory/items/bulk-import.
 *
 * @param {Object} payload - { items: Array<{ productId?, name, category, quantity? }>, autoCreateCategories?: boolean, duplicateAction?: 'skip' | 'update' | 'create-new' }
 * @returns {Promise<{ success: boolean, data: { totalRows: number, successCount: number, skippedCount: number, failedCount: number, errors: Array }, message?: string }>}
 */
export async function bulkImportItems(payload) {
  return apiClient('/api/v1/inventory/items/bulk-import', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

// ==========================================
// 3. Audit Logs
// ==========================================

/**
 * Lists inventory audit logs with optional filtering.
 * Calls GET /api/v1/inventory/audit-logs.
 *
 * @param {Object} [params={}] - Query options (search, startDate, endDate, productName, productId, category, userName, actionType, transactionType, page, limit)
 * @returns {Promise<{ success: boolean, data: Array<Object>, meta: { total: number, page: number, limit: number, totalPages: number } }>}
 */
export async function listAuditLogs(params = {}) {
  const qs = buildQueryString(params, ALLOWED_AUDIT_QUERY_KEYS);
  return apiClient(`/api/v1/inventory/audit-logs${qs}`, {
    method: 'GET'
  });
}

/**
 * Helper to fetch all pages of a paginated inventory resource safely.
 *
 * @param {Function} fetchFn - API function accepting params (e.g. listItems, listAuditLogs)
 * @param {Object} [query={}] - Initial query filters
 * @param {number} [limit=100] - Page size per fetch batch
 * @param {number} [maxPages=200] - Safety ceiling to prevent infinite loops
 * @returns {Promise<Array<Object>>} Combined array of all records across all pages
 */
export async function fetchAllPages(fetchFn, query = {}, limit = 100, maxPages = 200) {
  let allRecords = [];
  let currentPage = 1;
  let totalPages = 1;

  do {
    const res = await fetchFn({ ...query, page: currentPage, limit });
    const pageData = Array.isArray(res?.data) ? res.data : [];
    allRecords = allRecords.concat(pageData);

    const meta = res?.meta || res?.pagination;
    totalPages = typeof meta?.totalPages === 'number' ? meta.totalPages : 1;
    currentPage += 1;

    if (currentPage > maxPages) break;
  } while (currentPage <= totalPages);

  return allRecords;
}

export const inventoryApi = {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listItems,
  getItem,
  createItem,
  updateItem,
  deleteItem,
  bulkDeleteItems,
  adjustStock,
  bulkImportItems,
  listAuditLogs,
  fetchAllPages
};

export default inventoryApi;
