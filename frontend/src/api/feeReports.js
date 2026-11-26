/**
 * src/api/feeReports.js
 *
 * Fee Reports API client (/api/v1/fee-reports).
 */

import { apiClient } from './client.js';
import { buildQueryString } from './queryString.js';

const get = (path, query) => apiClient(`/api/v1/fee-reports${path}${buildQueryString(query)}`, { method: 'GET' });

/** @param {string} date - YYYY-MM-DD (omit for today) */
export async function getDayReport(date) {
  return get('/day', { date });
}

/** @param {string} studentId @param {string} asOn - YYYY-MM-DD (omit for today) */
export async function getStudentLedger(studentId, asOn) {
  return get(`/ledger/${encodeURIComponent(studentId)}`, { asOn });
}

export async function getDailyCollection(query = {}) {
  return get('/daily-collection', query);
}

export async function getDailyCollectionSummary(query = {}) {
  return get('/daily-collection/summary', query);
}

export async function getConcessionReport(query = {}) {
  return get('/concessions', query);
}

export async function getConcessionReportSummary(query = {}) {
  return get('/concessions/summary', query);
}

export async function getStudentConcessionReport(query = {}) {
  return get('/concessions/students', query);
}

export async function getStudentConcessionSummary(query = {}) {
  return get('/concessions/students/summary', query);
}

export async function getConsolidatedConcessionReport(query = {}) {
  return get('/concessions/consolidated', query);
}

export async function getConsolidatedConcessionSummary(query = {}) {
  return get('/concessions/consolidated/summary', query);
}

export async function getInvoiceCancellationReport(query = {}) {
  return get('/cancellations/invoices', query);
}

export async function getInvoiceCancellationSummary(query = {}) {
  return get('/cancellations/invoices/summary', query);
}

export async function getCategoryCancellationReport(query = {}) {
  return get('/cancellations/categories', query);
}

export async function getCategoryCancellationSummary(query = {}) {
  return get('/cancellations/categories/summary', query);
}

/**
 * One row per (non-cancelled) invoice with student, class, fee category, term, concession and
 * payment details. Every Fee Analysis report and the dashboard are built from these rows.
 */
export async function getFeeAnalysisRows() {
  return get('/analysis');
}

export const feeReportsApi = {
  getDayReport,
  getStudentLedger,
  getDailyCollection,
  getDailyCollectionSummary,
  getConcessionReport,
  getConcessionReportSummary,
  getStudentConcessionReport,
  getStudentConcessionSummary,
  getConsolidatedConcessionReport,
  getConsolidatedConcessionSummary,
  getInvoiceCancellationReport,
  getInvoiceCancellationSummary,
  getCategoryCancellationReport,
  getCategoryCancellationSummary,
  getFeeAnalysisRows
};

export default feeReportsApi;