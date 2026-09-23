/**
 * src/api/hr-payroll.js
 *
 * HR & Payroll API client communicating with the PostgreSQL REST backend.
 * Uses the centralized HTTP client with automatic JWT token injection and tenant context.
 */

import { apiClient } from './client.js';

const ALLOWED_PAYROLL_QUERY_KEYS = ['page', 'limit', 'month', 'status', 'staffId', 'search'];
const ALLOWED_MY_SALARY_QUERY_KEYS = ['month'];

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

/**
 * Lists paginated payroll records for the active tenant.
 * Calls GET /api/v1/hr-payroll.
 *
 * @param {Object} [params={}] - Query options (page, limit, month, status, staffId, search)
 * @returns {Promise<{ success: boolean, data: Array<Object>, pagination: { total: number, page: number, limit: number, totalPages: number } }>}
 */
export async function listPayroll(params = {}) {
  const qs = buildQueryString(params, ALLOWED_PAYROLL_QUERY_KEYS);
  return apiClient(`/api/v1/hr-payroll${qs}`, {
    method: 'GET'
  });
}

/**
 * Retrieves salary history for the authenticated staff/teacher (self-service).
 * Calls GET /api/v1/hr-payroll/my-salary.
 *
 * @param {Object} [params={}] - Query options (month)
 * @returns {Promise<{ success: boolean, data: Array<Object> }>}
 */
export async function getMySalary(params = {}) {
  const qs = buildQueryString(params, ALLOWED_MY_SALARY_QUERY_KEYS);
  return apiClient(`/api/v1/hr-payroll/my-salary${qs}`, {
    method: 'GET'
  });
}

/**
 * Generates payroll records for one or more staff members in the tenant.
 * Calls POST /api/v1/hr-payroll/generate.
 *
 * @param {Object} payload - { month: string, staffIds?: Array<string>, records?: Array<Object> }
 * @returns {Promise<{ success: boolean, message: string, data: Array<Object>, count: number }>}
 */
export async function generatePayroll(payload) {
  return apiClient('/api/v1/hr-payroll/generate', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * Updates status of a payroll record (Pending -> Paid -> Payslip Released).
 * Calls PATCH /api/v1/hr-payroll/:id/status.
 *
 * @param {string} id - Payroll record UUID
 * @param {Object} payload - { status: 'Pending' | 'Paid' | 'Payslip Released', paidAt?: string }
 * @returns {Promise<{ success: boolean, message: string, data: Object }>}
 */
export async function updatePayrollStatus(id, payload) {
  return apiClient(`/api/v1/hr-payroll/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

/**
 * Deletes a draft payroll record in 'Pending' status.
 * Calls DELETE /api/v1/hr-payroll/:id.
 *
 * @param {string} id - Payroll record UUID
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function deletePayroll(id) {
  return apiClient(`/api/v1/hr-payroll/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}

/**
 * Retrieves HR configuration settings (e.g. authorized signature).
 * Calls GET /api/v1/hr-payroll/config.
 *
 * @returns {Promise<{ success: boolean, data: { authorizedSignature: string|null } }>}
 */
export async function getConfig() {
  return apiClient('/api/v1/hr-payroll/config', {
    method: 'GET'
  });
}

/**
 * Updates HR configuration settings (e.g. authorized signature).
 * Calls PATCH /api/v1/hr-payroll/config.
 *
 * @param {Object} payload - { authorizedSignature: string|null }
 * @returns {Promise<{ success: boolean, message: string, data: { authorizedSignature: string|null } }>}
 */
export async function updateConfig(payload) {
  return apiClient('/api/v1/hr-payroll/config', {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

/**
 * Fetches all payroll pages sequentially for complete dataset operations (e.g. Excel export).
 *
 * @param {Object} [params={}] - Base query parameters
 * @param {number} [maxPages=20] - Maximum safety limit of pages to fetch
 * @returns {Promise<Array<Object>>} Combined records from all pages
 */
export async function fetchAllPayroll(params = {}, maxPages = 20) {
  const limit = params.limit || 50;
  let currentPage = 1;
  let allRecords = [];
  let totalPages = 1;

  while (currentPage <= totalPages && currentPage <= maxPages) {
    const res = await listPayroll({ ...params, page: currentPage, limit });
    const records = res?.data || [];
    allRecords = allRecords.concat(records);

    totalPages = res?.pagination?.totalPages || 1;
    currentPage += 1;
  }

  return allRecords;
}
