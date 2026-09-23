/**
 * src/api/platformBranding.js
 *
 * Centralized Platform Branding REST API client module communicating with the PostgreSQL backend.
 * Uses the centralized HTTP client with automatic JWT access-token injection.
 *
 * Endpoints:
 * - GET /api/v1/platform/branding (Public)
 * - PATCH /api/v1/platform/branding (SuperAdmin only)
 * - POST /api/v1/platform/branding/reset (SuperAdmin only)
 */

import { apiClient } from './client.js';

/**
 * Audited default branding configuration matching the backend specification.
 */
export const DEFAULT_PLATFORM_BRANDING = Object.freeze({
  platformName: 'School',
  primaryColor: '#7b40a3',
  logoUrl: '/logo.png',
  faviconUrl: '/logo.png',
  loginBackgroundImage:
    'https://images.unsplash.com/photo-1577896851231-70ef18881754?q=80&w=2070'
});

/**
 * Fetches the active platform-wide branding configuration.
 * Public endpoint; does not require authentication.
 *
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function getPlatformBranding() {
  return apiClient('/api/v1/platform/branding', {
    method: 'GET'
  });
}

/**
 * Updates the platform-wide branding configuration.
 * Restricted to SuperAdmin actors.
 *
 * @param {Object} payload - Branding attributes to update
 * @param {string} [payload.platformName]
 * @param {string} [payload.primaryColor]
 * @param {string} [payload.logoUrl]
 * @param {string} [payload.faviconUrl]
 * @param {string} [payload.loginBackgroundImage]
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function updatePlatformBranding(payload) {
  return apiClient('/api/v1/platform/branding', {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

/**
 * Resets the platform-wide branding configuration back to audited platform defaults.
 * Restricted to SuperAdmin actors.
 *
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function resetPlatformBranding() {
  return apiClient('/api/v1/platform/branding/reset', {
    method: 'POST'
  });
}

export const platformBrandingApi = {
  getPlatformBranding,
  updatePlatformBranding,
  resetPlatformBranding,
  DEFAULT_PLATFORM_BRANDING
};

export default platformBrandingApi;
