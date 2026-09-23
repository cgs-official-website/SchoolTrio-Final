/**
 * src/api/customModules.js
 *
 * Centralized Custom Dynamic Modules & Form Builder REST API client.
 * Connects frontend components to the PostgreSQL REST backend:
 * - Module metadata & CRUD
 * - Dynamic form schemas (sections & fields)
 * - Module records & dynamic data CRUD
 */

import { apiClient } from './client.js';

// ===========================================================================
// Custom Modules Metadata Endpoints
// ===========================================================================

/**
 * Fetches all custom dynamic modules for the authenticated tenant.
 * Calls GET /api/v1/custom-modules.
 *
 * @returns {Promise<{ success: boolean, data: Array<Object> }>}
 */
export async function listCustomModules() {
  return apiClient('/api/v1/custom-modules', {
    method: 'GET'
  });
}

/**
 * Fetches a single custom module by ID for the authenticated tenant.
 * Calls GET /api/v1/custom-modules/:id.
 *
 * @param {string} id - Module UUID
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function getCustomModule(id) {
  return apiClient(`/api/v1/custom-modules/${id}`, {
    method: 'GET'
  });
}

/**
 * Creates a new custom module and initializes its schema and sidebar ordering.
 * Calls POST /api/v1/custom-modules.
 *
 * @param {Object} payload - { name: string, icon?: string, order?: number }
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function createCustomModule(payload = {}) {
  return apiClient('/api/v1/custom-modules', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * Updates an existing custom module's metadata.
 * Calls PATCH /api/v1/custom-modules/:id.
 *
 * @param {string} id - Module UUID
 * @param {Object} payload - { name?: string, icon?: string, order?: number, isActive?: boolean }
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function updateCustomModule(id, payload = {}) {
  return apiClient(`/api/v1/custom-modules/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

/**
 * Deletes a custom module and atomically cascades schema, records, and sidebar ordering.
 * Calls DELETE /api/v1/custom-modules/:id.
 *
 * @param {string} id - Module UUID
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function deleteCustomModule(id) {
  return apiClient(`/api/v1/custom-modules/${id}`, {
    method: 'DELETE'
  });
}

// ===========================================================================
// Form Schemas Endpoints
// ===========================================================================

/**
 * Retrieves the form schema for a module key (custom or core fallback).
 * Calls GET /api/v1/custom-modules/schemas/:moduleKey.
 *
 * @param {string} moduleKey - Custom module UUID or core module slug
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function getFormSchema(moduleKey) {
  return apiClient(`/api/v1/custom-modules/schemas/${encodeURIComponent(moduleKey)}`, {
    method: 'GET'
  });
}

/**
 * Saves or updates a form schema (sections and fields).
 * Calls PUT /api/v1/custom-modules/schemas/:moduleKey.
 *
 * @param {string} moduleKey - Custom module UUID or core module slug
 * @param {Object} payload - { sections?: Array<Object>, fields?: Array<Object> }
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function upsertFormSchema(moduleKey, payload = {}) {
  return apiClient(`/api/v1/custom-modules/schemas/${encodeURIComponent(moduleKey)}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

/**
 * Deletes a form schema for a module key.
 * Calls DELETE /api/v1/custom-modules/schemas/:moduleKey.
 *
 * @param {string} moduleKey - Custom module UUID or core module slug
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function deleteFormSchema(moduleKey) {
  return apiClient(`/api/v1/custom-modules/schemas/${encodeURIComponent(moduleKey)}`, {
    method: 'DELETE'
  });
}

// ===========================================================================
// Dynamic Module Records Endpoints
// ===========================================================================

/**
 * Lists paginated dynamic records for a custom module.
 * Calls GET /api/v1/custom-modules/:id/records.
 *
 * @param {string} moduleId - Custom module UUID
 * @param {Object} [params] - { page?: number, limit?: number, search?: string }
 * @returns {Promise<{ success: boolean, data: Array<Object>, pagination: Object }>}
 */
export async function listModuleRecords(moduleId, params = {}) {
  const query = new URLSearchParams();
  if (params.page) query.append('page', params.page);
  if (params.limit) query.append('limit', params.limit);
  if (params.search) query.append('search', params.search);

  const qs = query.toString();
  const url = `/api/v1/custom-modules/${moduleId}/records${qs ? `?${qs}` : ''}`;

  return apiClient(url, {
    method: 'GET'
  });
}

/**
 * Retrieves a single dynamic record by ID.
 * Calls GET /api/v1/custom-modules/:id/records/:recordId.
 *
 * @param {string} moduleId - Custom module UUID
 * @param {string} recordId - Record UUID
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function getModuleRecord(moduleId, recordId) {
  return apiClient(`/api/v1/custom-modules/${moduleId}/records/${recordId}`, {
    method: 'GET'
  });
}

/**
 * Creates a new dynamic record in a custom module.
 * Calls POST /api/v1/custom-modules/:id/records.
 *
 * @param {string} moduleId - Custom module UUID
 * @param {Object} data - Key-value record data { [fieldId]: value }
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function createModuleRecord(moduleId, data = {}) {
  return apiClient(`/api/v1/custom-modules/${moduleId}/records`, {
    method: 'POST',
    body: JSON.stringify({ data })
  });
}

/**
 * Updates an existing dynamic record in a custom module.
 * Calls PATCH /api/v1/custom-modules/:id/records/:recordId.
 *
 * @param {string} moduleId - Custom module UUID
 * @param {string} recordId - Record UUID
 * @param {Object} data - Key-value record data { [fieldId]: value }
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function updateModuleRecord(moduleId, recordId, data = {}) {
  return apiClient(`/api/v1/custom-modules/${moduleId}/records/${recordId}`, {
    method: 'PATCH',
    body: JSON.stringify({ data })
  });
}

/**
 * Deletes a dynamic record in a custom module.
 * Calls DELETE /api/v1/custom-modules/:id/records/:recordId.
 *
 * @param {string} moduleId - Custom module UUID
 * @param {string} recordId - Record UUID
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function deleteModuleRecord(moduleId, recordId) {
  return apiClient(`/api/v1/custom-modules/${moduleId}/records/${recordId}`, {
    method: 'DELETE'
  });
}

export default {
  listCustomModules,
  getCustomModule,
  createCustomModule,
  updateCustomModule,
  deleteCustomModule,
  getFormSchema,
  upsertFormSchema,
  deleteFormSchema,
  listModuleRecords,
  getModuleRecord,
  createModuleRecord,
  updateModuleRecord,
  deleteModuleRecord
};
