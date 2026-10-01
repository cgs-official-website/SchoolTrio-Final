/**
 * src/api/reportCardTemplates.js
 *
 * Report Card Templates API client module communicating with the PostgreSQL backend.
 * Handles fetching, updating, and resetting school-wide report card template configurations.
 */

import { apiClient } from './client.js';

/**
 * Retrieves the active report card template for the current tenant.
 *
 * @param {string} [templateType='report_card'] - Template type identifier
 * @returns {Promise<{ success: boolean, data: { id: string|null, schoolId: string, templateType: string, config: Object, isDefault: boolean }, message?: string }>}
 */
export async function getReportCardTemplate(templateType = 'report_card') {
  return apiClient(`/api/v1/report-card-templates/${encodeURIComponent(templateType)}`, {
    method: 'GET'
  });
}

/**
 * Creates or updates the report card template for the current tenant.
 *
 * @param {string} [templateType='report_card'] - Template type identifier
 * @param {Object} config - Complete template configuration object
 * @returns {Promise<{ success: boolean, data: { id: string, schoolId: string, templateType: string, config: Object, isDefault: boolean }, message?: string }>}
 */
export async function saveReportCardTemplate(templateType = 'report_card', config = {}) {
  return apiClient(`/api/v1/report-card-templates/${encodeURIComponent(templateType)}`, {
    method: 'PUT',
    body: JSON.stringify({ config })
  });
}

/**
 * Resets a custom report card template back to system default configuration.
 *
 * @param {string} [templateType='report_card'] - Template type identifier
 * @returns {Promise<{ success: boolean, data: { message: string, templateType: string, isDefault: boolean, config: Object }, message?: string }>}
 */
export async function deleteReportCardTemplate(templateType = 'report_card') {
  return apiClient(`/api/v1/report-card-templates/${encodeURIComponent(templateType)}`, {
    method: 'DELETE'
  });
}

/**
 * Uploads a Word (.docx) document to extract report card layout and configuration using AI.
 *
 * @param {File} file - .docx file
 * @returns {Promise<{ success: boolean, data: { config: Object, fileName: string }, message?: string }>}
 */
export async function uploadWordTemplate(file) {
  const formData = new FormData();
  formData.append('file', file);

  return apiClient('/api/v1/report-card-templates/upload-docx', {
    method: 'POST',
    body: formData
  });
}

export const reportCardTemplatesApi = {
  getReportCardTemplate,
  saveReportCardTemplate,
  deleteReportCardTemplate,
  uploadWordTemplate
};

export default reportCardTemplatesApi;

