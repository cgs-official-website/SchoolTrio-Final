/**
 * src/api/settings.js
 *
 * Centralized School Settings & Environment Configuration API client.
 * Connects frontend components to the PostgreSQL REST backend:
 * - School Profile, General Information & Timezone
 * - Branding & Logos
 * - Academic Year & Term Configuration
 * - Dynamic Form Custom Data
 * - API Keys & Integrations (Google Maps, Cloudinary, WhatsApp)
 * - Navigation Sidebar Ordering
 * - Public School Metadata
 */

import { apiClient } from './client.js';

/**
 * Fetches the composite school settings for the authenticated tenant.
 * Calls GET /api/v1/settings/school.
 *
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function getSchoolSettings() {
  return apiClient('/api/v1/settings/school', {
    method: 'GET'
  });
}

/**
 * Updates the school settings for the authenticated tenant.
 * Calls PATCH /api/v1/settings/school.
 *
 * @param {Object} payload - Editable settings (name, phone, contactPhone, email, address, location, website, timezone, branding, academicConfig, customData)
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function updateSchoolSettings(payload = {}) {
  return apiClient('/api/v1/settings/school', {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

/**
 * Fetches the configured API integrations and keys for the authenticated tenant.
 * Calls GET /api/v1/settings/integrations.
 *
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function getIntegrations() {
  return apiClient('/api/v1/settings/integrations', {
    method: 'GET'
  });
}

/**
 * Updates the API integrations and keys for the authenticated tenant.
 * Calls PATCH /api/v1/settings/integrations.
 *
 * @param {Object} payload - { apiKeys?: { googleMaps?, cloudinary? }, whatsapp?: { ... } }
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function updateIntegrations(payload = {}) {
  return apiClient('/api/v1/settings/integrations', {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

/**
 * Fetches the navigation sidebar layout and module ordering.
 * Calls GET /api/v1/settings/sidebar.
 *
 * @returns {Promise<{ success: boolean, data: { order: Array<string> } }>}
 */
export async function getSidebarSettings() {
  return apiClient('/api/v1/settings/sidebar', {
    method: 'GET'
  });
}

/**
 * Updates the navigation sidebar layout and module ordering.
 * Calls PUT /api/v1/settings/sidebar.
 *
 * @param {Array<string>} order - Array of module keys in display order
 * @returns {Promise<{ success: boolean, data: { order: Array<string> } }>}
 */
export async function updateSidebarSettings(order = []) {
  return apiClient('/api/v1/settings/sidebar', {
    method: 'PUT',
    body: JSON.stringify({ order })
  });
}

/**
 * Fetches public school metadata (name, code, logo) without requiring authentication.
 * Calls GET /api/v1/public/schools/:schoolId/meta.
 *
 * @param {string} schoolId - School UUID
 * @returns {Promise<{ success: boolean, data: { id: string, name: string, code: string, logoUrl: string|null } }>}
 */
export async function getPublicSchoolMeta(schoolId) {
  if (!schoolId) throw new Error('schoolId is required');
  return apiClient(`/api/v1/public/schools/${schoolId}/meta`, {
    method: 'GET'
  });
}

export const settingsApi = {
  getSchoolSettings,
  updateSchoolSettings,
  getIntegrations,
  updateIntegrations,
  getSidebarSettings,
  updateSidebarSettings,
  getPublicSchoolMeta
};

export default settingsApi;
