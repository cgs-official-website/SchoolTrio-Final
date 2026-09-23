/**
 * src/api/admissions.js
 *
 * Centralized Admissions & Lead Management API client.
 * Connects React frontend components to the PostgreSQL REST backend:
 * - Lead Forms & Public Form Rendering
 * - Leads Directory & Lifecycle Management
 * - Admission Applications & Public Admission Submissions
 * - Transactional Enrollment to Student Records
 */

import { apiClient } from './client.js';

/**
 * Builds a sanitized URL search query string from allowed parameters.
 *
 * @param {Object} [params={}]
 * @param {Array<string>} [allowedKeys=[]]
 * @returns {string} Formatted query string with leading '?' or empty string
 */
function buildQueryString(params = {}, allowedKeys = []) {
  if (!params || typeof params !== 'object') return '';
  const searchParams = new URLSearchParams();
  const keysToProcess = allowedKeys.length > 0 ? allowedKeys : Object.keys(params);

  for (const key of keysToProcess) {
    const value = params[key];
    if (value !== undefined && value !== null && value !== '' && value !== 'all') {
      searchParams.append(key, String(value));
    }
  }

  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
}

// Allowed query parameter keys for various endpoints
const LEAD_QUERY_KEYS = ['status', 'formId', 'search', 'startDate', 'endDate', 'page', 'limit', 'sort', 'order'];
const FORM_QUERY_KEYS = ['isActive', 'search', 'page', 'limit', 'sort', 'order'];
const APPLICATION_QUERY_KEYS = ['status', 'classId', 'search', 'startDate', 'endDate', 'page', 'limit', 'sort', 'order'];

// =========================================================================
// 1. LEAD FORMS (Authenticated Admin)
// =========================================================================

/**
 * Lists all lead form configurations for the current tenant.
 * Calls GET /api/v1/admissions/forms.
 *
 * @param {Object} [params={}] - Query filters
 * @returns {Promise<{ success: boolean, data: Array<Object>, meta?: Object }>}
 */
export async function getLeadForms(params = {}) {
  const qs = buildQueryString(params, FORM_QUERY_KEYS);
  return apiClient(`/api/v1/admissions/forms${qs}`, {
    method: 'GET'
  });
}

/**
 * Retrieves a single lead form configuration by ID.
 * Calls GET /api/v1/admissions/forms/:id.
 *
 * @param {string} id - Form UUID
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function getLeadFormById(id) {
  return apiClient(`/api/v1/admissions/forms/${encodeURIComponent(id)}`, {
    method: 'GET'
  });
}

/**
 * Creates a new lead form configuration.
 * Calls POST /api/v1/admissions/forms.
 *
 * @param {Object} payload - { title, description?, successMessage?, fields: Array, isActive? }
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function createLeadForm(payload) {
  return apiClient('/api/v1/admissions/forms', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * Updates an existing lead form configuration.
 * Calls PATCH /api/v1/admissions/forms/:id.
 *
 * @param {string} id - Form UUID
 * @param {Object} payload - Form update fields
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function updateLeadForm(id, payload) {
  return apiClient(`/api/v1/admissions/forms/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

/**
 * Deletes a lead form configuration.
 * Calls DELETE /api/v1/admissions/forms/:id.
 *
 * @param {string} id - Form UUID
 * @returns {Promise<{ success: boolean, data: { id: string } }>}
 */
export async function deleteLeadForm(id) {
  return apiClient(`/api/v1/admissions/forms/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}

// =========================================================================
// 2. LEADS MANAGEMENT (Authenticated Admin)
// =========================================================================

/**
 * Lists leads with filtering, search, and pagination.
 * Calls GET /api/v1/admissions/leads.
 *
 * @param {Object} [params={}] - { status, formId, search, startDate, endDate, page, limit }
 * @returns {Promise<{ success: boolean, data: Array<Object>, meta?: Object }>}
 */
export async function getLeads(params = {}) {
  const qs = buildQueryString(params, LEAD_QUERY_KEYS);
  return apiClient(`/api/v1/admissions/leads${qs}`, {
    method: 'GET'
  });
}

/**
 * Retrieves a single lead by ID.
 * Calls GET /api/v1/admissions/leads/:id.
 *
 * @param {string} id - Lead UUID
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function getLeadById(id) {
  return apiClient(`/api/v1/admissions/leads/${encodeURIComponent(id)}`, {
    method: 'GET'
  });
}

/**
 * Updates lead lifecycle status.
 * Calls PATCH /api/v1/admissions/leads/:id/status.
 *
 * @param {string} id - Lead UUID
 * @param {Object} payload - { status: 'Cold'|'Warm'|'Hot'|'New'|'Contacted'|'Enrolled'|'Closed' }
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function updateLeadStatus(id, payload) {
  return apiClient(`/api/v1/admissions/leads/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

/**
 * Deletes a lead record.
 * Calls DELETE /api/v1/admissions/leads/:id.
 *
 * @param {string} id - Lead UUID
 * @returns {Promise<{ success: boolean, data: { id: string } }>}
 */
export async function deleteLead(id) {
  return apiClient(`/api/v1/admissions/leads/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}

// =========================================================================
// 3. ADMISSION APPLICATIONS (Authenticated Admin)
// =========================================================================

/**
 * Lists admission applications for review.
 * Calls GET /api/v1/admissions/applications.
 *
 * @param {Object} [params={}] - { status, classId, search, startDate, endDate, page, limit }
 * @returns {Promise<{ success: boolean, data: Array<Object>, meta?: Object }>}
 */
export async function getApplications(params = {}) {
  const qs = buildQueryString(params, APPLICATION_QUERY_KEYS);
  return apiClient(`/api/v1/admissions/applications${qs}`, {
    method: 'GET'
  });
}

/**
 * Retrieves a single admission application by ID.
 * Calls GET /api/v1/admissions/applications/:id.
 *
 * @param {string} id - Application UUID
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function getApplicationById(id) {
  return apiClient(`/api/v1/admissions/applications/${encodeURIComponent(id)}`, {
    method: 'GET'
  });
}

/**
 * Updates application status (e.g. 'Approved', 'Rejected').
 * Calls PATCH /api/v1/admissions/applications/:id/status.
 *
 * @param {string} id - Application UUID
 * @param {Object} payload - { status: 'Approved'|'Rejected', remarks?: string }
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function updateApplicationStatus(id, payload) {
  return apiClient(`/api/v1/admissions/applications/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

/**
 * Atomically enrolls an application into the Student directory.
 * Calls POST /api/v1/admissions/applications/:id/enroll.
 *
 * @param {string} id - Application UUID
 * @param {Object} payload - { admissionNumber: string, classId: string, sectionId?: string, rollNumber?: string }
 * @returns {Promise<{ success: boolean, data: { application: Object, student: Object } }>}
 */
export async function enrollApplication(id, payload) {
  return apiClient(`/api/v1/admissions/applications/${encodeURIComponent(id)}/enroll`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * Deletes an admission application record.
 * Calls DELETE /api/v1/admissions/applications/:id.
 *
 * @param {string} id - Application UUID
 * @returns {Promise<{ success: boolean, data: { id: string } }>}
 */
export async function deleteApplication(id) {
  return apiClient(`/api/v1/admissions/applications/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}

// =========================================================================
// 4. PUBLIC ADMISSIONS & PUBLIC LEADS (Unauthenticated Endpoints)
// =========================================================================

/**
 * Retrieves public lead form metadata and dynamic field schemas.
 * Calls GET /api/v1/public/leads/forms/:schoolId/:formId.
 *
 * @param {string} schoolId - School UUID
 * @param {string} formId - Form UUID
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function getPublicLeadForm(schoolId, formId) {
  return apiClient(`/api/v1/public/leads/forms/${encodeURIComponent(schoolId)}/${encodeURIComponent(formId)}`, {
    method: 'GET'
  });
}

/**
 * Submits a public lead enquiry with dynamic field answers.
 * Calls POST /api/v1/public/leads/:schoolId/:formId.
 *
 * @param {string} schoolId - School UUID
 * @param {string} formId - Form UUID
 * @param {Object} payload - { data: Object, parentName?: string, parentPhone?: string, parentEmail?: string }
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function submitPublicLead(schoolId, formId, payload) {
  return apiClient(`/api/v1/public/leads/${encodeURIComponent(schoolId)}/${encodeURIComponent(formId)}`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * Retrieves public school metadata and active classes for the admission form.
 * Calls GET /api/v1/public/admissions/schools/:schoolId/meta.
 *
 * @param {string} schoolId - School UUID
 * @returns {Promise<{ success: boolean, data: { school: Object, classes: Array<Object> } }>}
 */
export async function getPublicSchoolMeta(schoolId) {
  return apiClient(`/api/v1/public/admissions/schools/${encodeURIComponent(schoolId)}/meta`, {
    method: 'GET'
  });
}

/**
 * Submits a public student admission application.
 * Calls POST /api/v1/public/admissions/:schoolId.
 *
 * @param {string} schoolId - School UUID
 * @param {Object} payload - Admission form fields
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function submitPublicAdmission(schoolId, payload) {
  return apiClient(`/api/v1/public/admissions/${encodeURIComponent(schoolId)}`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

// Default export container for convenience
export const admissionsApi = {
  getLeadForms,
  getLeadFormById,
  createLeadForm,
  updateLeadForm,
  deleteLeadForm,
  getLeads,
  getLeadById,
  updateLeadStatus,
  deleteLead,
  getApplications,
  getApplicationById,
  updateApplicationStatus,
  enrollApplication,
  deleteApplication,
  getPublicLeadForm,
  submitPublicLead,
  getPublicSchoolMeta,
  submitPublicAdmission
};

export default admissionsApi;
