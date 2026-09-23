/**
 * src/api/emailTemplates.js
 *
 * Centralized Email Templates REST API client module communicating with the PostgreSQL backend.
 * Uses the centralized HTTP client with automatic JWT access-token injection and tenant scoping.
 *
 * Endpoints:
 * - GET /api/v1/email-templates (list all templates + compatibility raw object)
 * - GET /api/v1/email-templates/:id (get individual template by ID)
 * - PUT /api/v1/email-templates (bulk update templates via flat raw object or array)
 * - POST /api/v1/email-templates/:id/reset (reset system template back to platform defaults)
 */

import { apiClient } from './client.js';

/**
 * Fetches all email templates for the current tenant.
 * Calls GET /api/v1/email-templates.
 *
 * @param {Object} [query={}]
 * @param {boolean|string} [query.isActive] - Filter by active status
 * @param {boolean|string} [query.isSystem] - Filter by system status
 * @param {string} [query.search] - Search term across name, subject, description
 * @returns {Promise<{ success: boolean, data: { templates: Array<Object>, raw: Object }, message?: string }>}
 */
export async function listEmailTemplates(query = {}) {
  const queryParams = new URLSearchParams();
  if (query.isActive !== undefined) queryParams.append('isActive', query.isActive);
  if (query.isSystem !== undefined) queryParams.append('isSystem', query.isSystem);
  if (query.search) queryParams.append('search', query.search);

  const queryString = queryParams.toString();
  const endpoint = `/api/v1/email-templates${queryString ? `?${queryString}` : ''}`;

  return apiClient(endpoint, {
    method: 'GET'
  });
}

/**
 * Retrieves a specific email template by its unique identifier.
 * Calls GET /api/v1/email-templates/:id.
 *
 * @param {string} id - Template ID (e.g. 'welcome', 'forgotPassword', 'approval', or custom UUID)
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function getEmailTemplate(id) {
  if (!id) throw new Error('Template ID is required');
  return apiClient(`/api/v1/email-templates/${encodeURIComponent(id)}`, {
    method: 'GET'
  });
}

/**
 * Updates email templates configuration using either the flat legacy raw format
 * or structured template array.
 * Calls PUT /api/v1/email-templates.
 *
 * @param {Object} payload - Flat raw object or { templates: Array<Object> }
 * @returns {Promise<{ success: boolean, data: { templates: Array<Object>, raw: Object }, message?: string }>}
 */
export async function updateEmailTemplates(payload) {
  return apiClient('/api/v1/email-templates', {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

/**
 * Resets a system email template back to default content.
 * Calls POST /api/v1/email-templates/:id/reset.
 *
 * @param {string} id - System template ID ('welcome' | 'forgotPassword' | 'approval')
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function resetEmailTemplate(id) {
  if (!id) throw new Error('Template ID is required');
  return apiClient(`/api/v1/email-templates/${encodeURIComponent(id)}/reset`, {
    method: 'POST'
  });
}

export const emailTemplatesApi = {
  listEmailTemplates,
  getEmailTemplate,
  updateEmailTemplates,
  resetEmailTemplate
};

export default emailTemplatesApi;
