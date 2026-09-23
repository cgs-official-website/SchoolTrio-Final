/**
 * src/api/audit.js
 *
 * Audit Logs API client module communicating with the PostgreSQL backend.
 * Uses the centralized HTTP client with automatic JWT token injection and tenant context.
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

/**
 * Lists tenant-scoped audit logs with filtering and pagination.
 * Calls GET /api/v1/audit.
 *
 * @param {Object} [query={}] - Query options (entityType, actionPerformed, userName, startDate, endDate, page, limit)
 * @returns {Promise<{ success: boolean, data: Array<Object>, pagination: Object, message?: string }>}
 */
export async function listAuditLogs(query = {}) {
  const qs = buildQueryString(query);
  return apiClient(`/api/v1/audit${qs}`, {
    method: 'GET'
  });
}

/**
 * Lists global platform audit logs across all tenants (SuperAdmin only).
 * Calls GET /api/v1/superadmin/audit.
 *
 * @param {Object} [query={}] - Query options (schoolId, entityType, actionPerformed, userName, startDate, endDate, page, limit)
 * @returns {Promise<{ success: boolean, data: Array<Object>, pagination: Object, message?: string }>}
 */
export async function listSuperAdminAuditLogs(query = {}) {
  const qs = buildQueryString(query);
  return apiClient(`/api/v1/superadmin/audit${qs}`, {
    method: 'GET'
  });
}

export const auditApi = {
  listAuditLogs,
  listSuperAdminAuditLogs
};

export default auditApi;
