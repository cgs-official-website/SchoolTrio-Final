import * as platformBrandingRepository from './platform-branding.repository.js';
import { logger } from '../../utils/logger.js';

export const PLATFORM_BRANDING_KEY = 'global_branding';

/**
 * Audited default branding values established by frontend BrandingSettings.jsx
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
 * Standardize branding response payload.
 *
 * @param {Object} data - Stored or default branding properties
 * @param {Date|string|null} [updatedAt] - Timestamp of last update
 * @returns {Object} Clean branding DTO
 */
function formatPlatformBrandingDto(data, updatedAt = null) {
  return {
    platformName: data.platformName || DEFAULT_PLATFORM_BRANDING.platformName,
    primaryColor: data.primaryColor || DEFAULT_PLATFORM_BRANDING.primaryColor,
    logoUrl: data.logoUrl || DEFAULT_PLATFORM_BRANDING.logoUrl,
    faviconUrl: data.faviconUrl || DEFAULT_PLATFORM_BRANDING.faviconUrl,
    loginBackgroundImage:
      data.loginBackgroundImage || DEFAULT_PLATFORM_BRANDING.loginBackgroundImage,
    updatedAt: updatedAt instanceof Date ? updatedAt.toISOString() : updatedAt
  };
}

/**
 * Retrieve current platform-wide branding configuration.
 * Returns default audited configuration if no custom settings have been saved.
 *
 * @returns {Promise<Object>} Formatted branding DTO
 */
export async function getPlatformBranding() {
  const setting = await platformBrandingRepository.getPlatformSettingByKey(PLATFORM_BRANDING_KEY);

  if (!setting || !setting.data || typeof setting.data !== 'object') {
    return formatPlatformBrandingDto(DEFAULT_PLATFORM_BRANDING, null);
  }

  return formatPlatformBrandingDto(setting.data, setting.updatedAt);
}

/**
 * Update platform-wide branding configuration.
 * Restricted to SuperAdmin actors. Emits a structured audit log.
 *
 * @param {Object} payload - Validated branding partial/full payload
 * @param {Object} actor - Authenticated SuperAdmin user context
 * @returns {Promise<Object>} Updated branding DTO
 */
export async function updatePlatformBranding(payload, actor = {}) {
  const current = await getPlatformBranding();

  const mergedData = {
    platformName: payload.platformName !== undefined ? payload.platformName : current.platformName,
    primaryColor: payload.primaryColor !== undefined ? payload.primaryColor : current.primaryColor,
    logoUrl: payload.logoUrl !== undefined ? payload.logoUrl : current.logoUrl,
    faviconUrl: payload.faviconUrl !== undefined ? payload.faviconUrl : current.faviconUrl,
    loginBackgroundImage:
      payload.loginBackgroundImage !== undefined
        ? payload.loginBackgroundImage
        : current.loginBackgroundImage
  };

  const saved = await platformBrandingRepository.upsertPlatformSetting(
    PLATFORM_BRANDING_KEY,
    mergedData
  );

  logger.info(
    {
      event: 'UPDATE_PLATFORM_BRANDING',
      actorId: actor.id || actor.userId || null,
      actorEmail: actor.email || null,
      actorRole: actor.role || null,
      modifiedFields: payload
    },
    'Global platform branding updated by SuperAdmin'
  );

  return formatPlatformBrandingDto(saved.data, saved.updatedAt);
}

/**
 * Reset platform-wide branding configuration to audited platform defaults.
 * Restricted to SuperAdmin actors. Emits a structured audit log.
 *
 * @param {Object} actor - Authenticated SuperAdmin user context
 * @returns {Promise<Object>} Reset branding DTO with defaults
 */
export async function resetPlatformBranding(actor = {}) {
  await platformBrandingRepository.deletePlatformSettingByKey(PLATFORM_BRANDING_KEY);

  logger.info(
    {
      event: 'RESET_PLATFORM_BRANDING',
      actorId: actor.id || actor.userId || null,
      actorEmail: actor.email || null,
      actorRole: actor.role || null
    },
    'Global platform branding reset to defaults by SuperAdmin'
  );

  return formatPlatformBrandingDto(DEFAULT_PLATFORM_BRANDING, null);
}
