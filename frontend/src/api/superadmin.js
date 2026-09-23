/**
 * src/api/superadmin.js
 *
 * SuperAdmin Platform API client module communicating with the PostgreSQL backend.
 * Uses the centralized HTTP client with automatic JWT token injection and SuperAdmin role context.
 */

import { apiClient } from './client.js';

/**
 * Builds a clean query string omitting null, undefined, and empty string values.
 *
 * @param {Object} [params={}] - Key-value map of query parameters
 * @returns {string} Formatted query string or empty string
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

// ===========================================================================
// 1. Platform Overview & Statistics
// ===========================================================================

/**
 * Retrieves platform-wide statistics for SuperAdmin Overview.
 * Calls GET /api/v1/superadmin/stats.
 *
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function getStats() {
  return apiClient('/api/v1/superadmin/stats', {
    method: 'GET'
  });
}

// ===========================================================================
// 2. Tenant Management
// ===========================================================================

/**
 * Lists tenants across the platform with filtering and pagination.
 * Calls GET /api/v1/superadmin/tenants.
 *
 * @param {Object} [query={}] - Query options (status, planId, search, sort, order, page, limit)
 * @returns {Promise<{ success: boolean, data: Array<Object>, pagination: Object, message?: string }>}
 */
export async function listTenants(query = {}) {
  const qs = buildQueryString(query);
  return apiClient(`/api/v1/superadmin/tenants${qs}`, {
    method: 'GET'
  });
}

/**
 * Creates a new school tenant and administrative user account atomically.
 * Calls POST /api/v1/superadmin/tenants.
 *
 * @param {Object} data - Tenant creation payload
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function createTenant(data) {
  return apiClient('/api/v1/superadmin/tenants', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

/**
 * Retrieves detailed information for a specific tenant by UUID.
 * Calls GET /api/v1/superadmin/tenants/:id.
 *
 * @param {string} id - School UUID
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function getTenantById(id) {
  return apiClient(`/api/v1/superadmin/tenants/${encodeURIComponent(id)}`, {
    method: 'GET'
  });
}

/**
 * Updates tenant lifecycle status (approved, pending, suspended, rejected).
 * Calls PATCH /api/v1/superadmin/tenants/:id/status.
 *
 * @param {string} id - School UUID
 * @param {Object} data - Status update payload ({ status, reason })
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function updateTenantStatus(id, data) {
  return apiClient(`/api/v1/superadmin/tenants/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  });
}

/**
 * Updates tenant configuration quotas, plan assignment, or feature modules.
 * Calls PATCH /api/v1/superadmin/tenants/:id/config.
 *
 * @param {string} id - School UUID
 * @param {Object} data - Config payload ({ seatLimit, teacherLimit, planId, modules })
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function updateTenantConfig(id, data) {
  return apiClient(`/api/v1/superadmin/tenants/${encodeURIComponent(id)}/config`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  });
}

/**
 * Deletes a tenant by UUID (soft deactivation or complete purge).
 * Calls DELETE /api/v1/superadmin/tenants/:id.
 *
 * @param {string} id - School UUID
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function deleteTenant(id) {
  return apiClient(`/api/v1/superadmin/tenants/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}

// ===========================================================================
// 3. Subscription Plans Management
// ===========================================================================

/**
 * Lists available subscription plans with optional filtering.
 * Calls GET /api/v1/superadmin/plans.
 *
 * @param {Object} [query={}] - Query options (isActive, page, limit)
 * @returns {Promise<{ success: boolean, data: Array<Object>, pagination: Object, message?: string }>}
 */
export async function listPlans(query = {}) {
  const qs = buildQueryString(query);
  return apiClient(`/api/v1/superadmin/plans${qs}`, {
    method: 'GET'
  });
}

/**
 * Creates a new subscription plan on the platform.
 * Calls POST /api/v1/superadmin/plans.
 *
 * @param {Object} data - Plan creation payload ({ name, userLimit, pricePerUserPerYear, cloudStorageGB, modules, isActive })
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function createPlan(data) {
  return apiClient('/api/v1/superadmin/plans', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

/**
 * Updates an existing subscription plan by UUID using PATCH.
 * Calls PATCH /api/v1/superadmin/plans/:id.
 *
 * @param {string} id - Plan UUID
 * @param {Object} data - Plan update payload
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function updatePlan(id, data) {
  return apiClient(`/api/v1/superadmin/plans/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  });
}

/**
 * Deletes a subscription plan by UUID.
 * Calls DELETE /api/v1/superadmin/plans/:id.
 *
 * @param {string} id - Plan UUID
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function deletePlan(id) {
  return apiClient(`/api/v1/superadmin/plans/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}

// ===========================================================================
// 4. Subscriptions Overview
// ===========================================================================

/**
 * Lists platform tenant subscriptions with status and billing details.
 * Calls GET /api/v1/superadmin/subscriptions.
 *
 * @param {Object} [query={}] - Query options (status, planId, search, page, limit)
 * @returns {Promise<{ success: boolean, data: Array<Object>, pagination: Object, message?: string }>}
 */
export async function getSubscriptions(query = {}) {
  const qs = buildQueryString(query);
  return apiClient(`/api/v1/superadmin/subscriptions${qs}`, {
    method: 'GET'
  });
}

// ===========================================================================
// 5. License & Quota Usage
// ===========================================================================

/**
 * Retrieves license consumption and quota health across all tenants.
 * Calls GET /api/v1/superadmin/license-usage.
 *
 * @param {Object} [query={}] - Query options (search, status, page, limit)
 * @returns {Promise<{ success: boolean, data: Array<Object>, pagination: Object, message?: string }>}
 */
export async function getLicenseUsage(query = {}) {
  const qs = buildQueryString(query);
  return apiClient(`/api/v1/superadmin/license-usage${qs}`, {
    method: 'GET'
  });
}

export const superadminApi = {
  getStats,
  listTenants,
  createTenant,
  getTenantById,
  updateTenantStatus,
  updateTenantConfig,
  deleteTenant,
  listPlans,
  createPlan,
  updatePlan,
  deletePlan,
  getSubscriptions,
  getLicenseUsage
};

export default superadminApi;
