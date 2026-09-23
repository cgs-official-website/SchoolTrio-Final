/**
 * src/api/invoices.js
 *
 * Invoice and Fee Payment API client module communicating with the PostgreSQL backend.
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

/**
 * Lists invoices across the active tenant with filters and pagination.
 * Calls GET /api/v1/invoices.
 *
 * @param {Object} [query={}] - Query options ({ classId, feeStructureId, collectionPeriodId, status, overdue, search, page, limit, order })
 * @returns {Promise<{ success: boolean, data: Array<Object>, pagination: Object, message?: string }>}
 */
export async function listInvoices(query = {}) {
  const qs = buildQueryString(query);
  return apiClient(`/api/v1/invoices${qs}`, {
    method: 'GET'
  });
}

/**
 * Retrieves institutional fee and invoice statistics for the active tenant.
 * Calls GET /api/v1/invoices/stats.
 *
 * @param {Object} [query={}] - Optional filters ({ classId, collectionPeriodId, feeStructureId })
 * @returns {Promise<{ success: boolean, data: { expected: number, collected: number, outstanding: number, overdueCount: number, overdueAmount: number, unpaidCount: number, unpaidStudentsCount: number, overdueStudentsCount: number, feeCollectedPct: number }, message?: string }>}
 */
export async function getInvoiceStats(query = {}) {
  const qs = buildQueryString(query);
  return apiClient(`/api/v1/invoices/stats${qs}`, {
    method: 'GET'
  });
}

/**
 * Retrieves class-wise fee collection reports.
 * Calls GET /api/v1/invoices/reports/class-wise.
 *
 * @param {Object} [query={}] - Optional filters ({ collectionPeriodId })
 * @returns {Promise<{ success: boolean, data: Array<Object>, message?: string }>}
 */
export async function getClassWiseReports(query = {}) {
  const qs = buildQueryString(query);
  return apiClient(`/api/v1/invoices/reports/class-wise${qs}`, {
    method: 'GET'
  });
}

/**
 * Retrieves collection-period-wise fee reports.
 * Calls GET /api/v1/invoices/reports/period-wise.
 *
 * @param {Object} [query={}] - Optional filters ({ classId })
 * @returns {Promise<{ success: boolean, data: Array<Object>, message?: string }>}
 */
export async function getPeriodWiseReports(query = {}) {
  const qs = buildQueryString(query);
  return apiClient(`/api/v1/invoices/reports/period-wise${qs}`, {
    method: 'GET'
  });
}

/**
 * Retrieves monthly revenue trend reports.
 * Calls GET /api/v1/invoices/reports/monthly-revenue.
 *
 * @param {Object} [query={}] - Query options ({ months })
 * @returns {Promise<{ success: boolean, data: Array<Object>, message?: string }>}
 */
export async function getMonthlyRevenueReports(query = {}) {
  const qs = buildQueryString(query);
  return apiClient(`/api/v1/invoices/reports/monthly-revenue${qs}`, {
    method: 'GET'
  });
}

/**
 * Lists invoices and balance summary for a specific student.
 * Calls GET /api/v1/students/:studentId/invoices.
 *
 * @param {string} studentId - PostgreSQL Student UUID
 * @param {Object} [query={}] - Optional query filters and pagination
 * @returns {Promise<{ success: boolean, data: Array<Object>, pagination: Object, summary: Object, message?: string }>}
 */
export async function getStudentInvoices(studentId, query = {}) {
  const qs = buildQueryString(query);
  return apiClient(`/api/v1/students/${encodeURIComponent(studentId)}/invoices${qs}`, {
    method: 'GET'
  });
}

/**
 * Retrieves a single invoice record by ID.
 * Calls GET /api/v1/invoices/:id.
 *
 * @param {string} id - PostgreSQL Invoice UUID
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function getInvoice(id) {
  return apiClient(`/api/v1/invoices/${encodeURIComponent(id)}`, {
    method: 'GET'
  });
}

/**
 * Cancels a pending invoice.
 * Calls PATCH /api/v1/invoices/:id/cancel.
 *
 * @param {string} id - PostgreSQL Invoice UUID
 * @param {Object} [payload={}] - Cancellation details ({ reason? })
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function cancelInvoice(id, payload = {}) {
  return apiClient(`/api/v1/invoices/${encodeURIComponent(id)}/cancel`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

/**
 * Settles payment for an invoice.
 * Calls POST /api/v1/invoices/:id/pay.
 *
 * @param {string} id - PostgreSQL Invoice UUID
 * @param {Object} [payload={}] - Payment details ({ paymentMode?, transactionReference?, remarks? })
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function payInvoice(id, payload = {}) {
  return apiClient(`/api/v1/invoices/${encodeURIComponent(id)}/pay`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export const invoicesApi = {
  listInvoices,
  getInvoiceStats,
  getClassWiseReports,
  getPeriodWiseReports,
  getMonthlyRevenueReports,
  getStudentInvoices,
  getInvoice,
  cancelInvoice,
  payInvoice
};

export default invoicesApi;
