import * as settingsRepo from './settings.repository.js';
import { NotFoundError, ValidationError } from '../../utils/app-error.js';
import { createAuditLog } from '../audit/audit.repository.js';

const MASK_PLACEHOLDERS = new Set(['••••••••', '[REDACTED]', '***', '********', 'masked']);

/**
 * Helper to check if a token string represents an intentional mask rather than a new token.
 */
function isMaskedValue(val) {
  if (!val || typeof val !== 'string') return false;
  return MASK_PLACEHOLDERS.has(val.trim());
}

/**
 * Fetch composite School Settings (General, Branding, Academic, Custom Data)
 */
export async function getSchoolSettings(schoolId) {
  if (!schoolId) {
    throw new ValidationError('Tenant context required: schoolId is missing');
  }

  const school = await settingsRepo.findSchoolById(schoolId);
  if (!school) {
    throw new NotFoundError(`School not found with ID: ${schoolId}`);
  }

  const settingsList = await settingsRepo.findSettingsByCategories(schoolId, [
    'general',
    'branding',
    'academicConfig',
    'customData'
  ]);

  const settingsMap = {};
  for (const s of settingsList) {
    settingsMap[s.category] = s.data || {};
  }

  const generalData = settingsMap.general || {};
  const brandingData = settingsMap.branding || {};
  const academicData = settingsMap.academicConfig || {};
  const customData = settingsMap.customData || {};

  return {
    id: school.id,
    name: school.name,
    code: school.code,
    phone: school.phone || '',
    contactPhone: school.phone || '',
    email: school.email || '',
    address: school.address || '',
    location: school.address || '',
    website: generalData.website || '',
    timezone: school.timezone || 'Asia/Kolkata',
    branding: {
      logoUrl: school.logoUrl || brandingData.logoUrl || '',
      faviconUrl: brandingData.faviconUrl || '',
      primaryColor: brandingData.primaryColor || null,
      secondaryColor: brandingData.secondaryColor || null
    },
    academicConfig: {
      currentYear: academicData.currentYear || '2026-2027',
      termType: academicData.termType || 'Semester',
      ...academicData
    },
    customData: customData || {}
  };
}

/**
 * Update composite School Settings
 */
export async function updateSchoolSettings(schoolId, payload, actor = {}) {
  if (!schoolId) {
    throw new ValidationError('Tenant context required: schoolId is missing');
  }

  const existingSchool = await settingsRepo.findSchoolById(schoolId);
  if (!existingSchool) {
    throw new NotFoundError(`School not found with ID: ${schoolId}`);
  }

  const result = await settingsRepo.executeTransaction(async (tx) => {
    // 1. Prepare School model updates
    const schoolUpdates = {};
    if (payload.name !== undefined) schoolUpdates.name = payload.name;
    
    // Normalize phone / contactPhone
    const phoneVal = payload.phone !== undefined ? payload.phone : payload.contactPhone;
    if (phoneVal !== undefined) schoolUpdates.phone = phoneVal;

    if (payload.email !== undefined) schoolUpdates.email = payload.email;

    // Normalize address / location
    const addressVal = payload.address !== undefined ? payload.address : payload.location;
    if (addressVal !== undefined) schoolUpdates.address = addressVal;

    if (payload.timezone !== undefined) schoolUpdates.timezone = payload.timezone;

    if (payload.branding?.logoUrl !== undefined) {
      schoolUpdates.logoUrl = payload.branding.logoUrl;
    }

    let updatedSchool = existingSchool;
    if (Object.keys(schoolUpdates).length > 0) {
      updatedSchool = await settingsRepo.updateSchool(schoolId, schoolUpdates, tx);
    }

    // 2. Handle 'general' category (website)
    if (payload.website !== undefined) {
      const existingGeneral = await settingsRepo.findSetting(schoolId, 'general', tx);
      const mergedGeneral = { ...(existingGeneral?.data || {}), website: payload.website };
      await settingsRepo.upsertSetting(schoolId, 'general', mergedGeneral, tx);
    }

    // 3. Handle 'branding' category
    if (payload.branding !== undefined) {
      const existingBranding = await settingsRepo.findSetting(schoolId, 'branding', tx);
      const mergedBranding = {
        ...(existingBranding?.data || {}),
        ...payload.branding,
        logoUrl: payload.branding.logoUrl !== undefined ? payload.branding.logoUrl : (existingBranding?.data?.logoUrl || existingSchool.logoUrl || '')
      };
      await settingsRepo.upsertSetting(schoolId, 'branding', mergedBranding, tx);
    }

    // 4. Handle 'academicConfig' category
    if (payload.academicConfig !== undefined) {
      const existingAcademic = await settingsRepo.findSetting(schoolId, 'academicConfig', tx);
      const mergedAcademic = { ...(existingAcademic?.data || {}), ...payload.academicConfig };
      await settingsRepo.upsertSetting(schoolId, 'academicConfig', mergedAcademic, tx);
    }

    // 5. Handle 'customData' category
    if (payload.customData !== undefined) {
      const existingCustom = await settingsRepo.findSetting(schoolId, 'customData', tx);
      const mergedCustom = { ...(existingCustom?.data || {}), ...payload.customData };
      await settingsRepo.upsertSetting(schoolId, 'customData', mergedCustom, tx);
    }

    // 6. Audit Log
    await createAuditLog({
      schoolId,
      entityType: 'SchoolSetting',
      entityId: schoolId,
      actionPerformed: 'UPDATE_SCHOOL_SETTINGS',
      userName: actor.email || actor.name || 'Administrator',
      userRole: actor.systemRole || actor.role || 'SCHOOL_ADMIN',
      modifiedFields: {
        updatedKeys: Object.keys(payload)
      }
    }, tx);

    return updatedSchool;
  });

  return getSchoolSettings(schoolId);
}

/**
 * Fetch API / Integrations Settings with masked secrets
 */
export async function getIntegrationsSettings(schoolId) {
  if (!schoolId) {
    throw new ValidationError('Tenant context required: schoolId is missing');
  }

  const school = await settingsRepo.findSchoolById(schoolId);
  if (!school) {
    throw new NotFoundError(`School not found with ID: ${schoolId}`);
  }

  const settingsList = await settingsRepo.findSettingsByCategories(schoolId, [
    'integrations',
    'apiKeys'
  ]);

  const settingsMap = {};
  for (const s of settingsList) {
    settingsMap[s.category] = s.data || {};
  }

  const integrationsData = settingsMap.integrations || {};
  const apiKeysData = settingsMap.apiKeys || {};
  const schoolApiKeys = (school.apiKeysEncrypted && typeof school.apiKeysEncrypted === 'object') ? school.apiKeysEncrypted : {};

  // Resolve Cloudinary settings
  const cloudinaryConfig = apiKeysData.cloudinary || schoolApiKeys.cloudinary || integrationsData.cloudinary || {
    cloudName: '',
    apiKey: '',
    uploadPreset: ''
  };

  // Resolve Google Maps key
  const googleMapsKey = apiKeysData.googleMaps || schoolApiKeys.googleMaps || integrationsData.googleMaps || '';

  // Resolve WhatsApp configuration
  const wa = integrationsData.whatsapp || {};
  const hasAccessToken = Boolean(wa.accessToken || integrationsData.accessToken);

  return {
    apiKeys: {
      googleMaps: googleMapsKey,
      cloudinary: {
        cloudName: cloudinaryConfig.cloudName || '',
        apiKey: cloudinaryConfig.apiKey || '',
        uploadPreset: cloudinaryConfig.uploadPreset || ''
      }
    },
    whatsapp: {
      provider: wa.provider || 'meta_whatsapp_cloud_api',
      phoneNumberId: wa.phoneNumberId || '',
      businessAccountId: wa.businessAccountId || '',
      senderNumber: wa.senderNumber || '',
      ptmTemplateName: wa.ptmTemplateName || 'school_ptm_scheduled',
      noticeTemplateName: wa.noticeTemplateName || 'school_notice_notification',
      enabled: Boolean(wa.enabled),
      isConnected: Boolean(wa.isConnected),
      isMasked: hasAccessToken,
      updatedAt: wa.updatedAt || null
    }
  };
}

/**
 * Update API / Integrations Settings with secret preservation
 */
export async function updateIntegrationsSettings(schoolId, payload, actor = {}) {
  if (!schoolId) {
    throw new ValidationError('Tenant context required: schoolId is missing');
  }

  const existingSchool = await settingsRepo.findSchoolById(schoolId);
  if (!existingSchool) {
    throw new NotFoundError(`School not found with ID: ${schoolId}`);
  }

  await settingsRepo.executeTransaction(async (tx) => {
    // 1. Fetch current settings to preserve existing secrets if masked
    const existingIntegrations = await settingsRepo.findSetting(schoolId, 'integrations', tx);
    const existingApiKeys = await settingsRepo.findSetting(schoolId, 'apiKeys', tx);

    const currentIntegrationsData = existingIntegrations?.data || {};
    const currentWa = currentIntegrationsData.whatsapp || {};

    let updatedWa = { ...currentWa };

    if (payload.whatsapp) {
      const { accessToken, ...otherWaFields } = payload.whatsapp;
      updatedWa = {
        ...updatedWa,
        ...otherWaFields,
        updatedAt: new Date().toISOString()
      };

      // Preserve existing token if token is omitted, null, empty string, or mask placeholder
      if (accessToken !== undefined && accessToken !== null && accessToken !== '' && !isMaskedValue(accessToken)) {
        updatedWa.accessToken = accessToken;
      }
    }

    const mergedIntegrationsData = {
      ...currentIntegrationsData,
      ...(payload.apiKeys ? { apiKeys: payload.apiKeys } : {}),
      whatsapp: updatedWa
    };

    await settingsRepo.upsertSetting(schoolId, 'integrations', mergedIntegrationsData, tx);

    // 2. Also keep apiKeys category updated for direct client convenience
    if (payload.apiKeys) {
      const mergedApiKeys = {
        ...(existingApiKeys?.data || {}),
        ...payload.apiKeys
      };
      await settingsRepo.upsertSetting(schoolId, 'apiKeys', mergedApiKeys, tx);
    }

    // 3. Audit Log (Never log raw accessToken)
    await createAuditLog({
      schoolId,
      entityType: 'SchoolSetting',
      entityId: schoolId,
      actionPerformed: 'UPDATE_INTEGRATIONS_SETTINGS',
      userName: actor.email || actor.name || 'Administrator',
      userRole: actor.systemRole || actor.role || 'SCHOOL_ADMIN',
      modifiedFields: {
        hasApiKeysUpdate: Boolean(payload.apiKeys),
        hasWhatsappUpdate: Boolean(payload.whatsapp),
        whatsappTokenUpdated: Boolean(payload.whatsapp?.accessToken && !isMaskedValue(payload.whatsapp.accessToken))
      }
    }, tx);
  });

  return getIntegrationsSettings(schoolId);
}

/**
 * Fetch Navigation Sidebar Ordering Setting
 */
export async function getSidebarSettings(schoolId) {
  if (!schoolId) {
    throw new ValidationError('Tenant context required: schoolId is missing');
  }

  const setting = await settingsRepo.findSetting(schoolId, 'sidebar');
  return {
    order: Array.isArray(setting?.data?.order) ? setting.data.order : []
  };
}

/**
 * Update Navigation Sidebar Ordering Setting
 */
export async function updateSidebarSettings(schoolId, order, actor = {}) {
  if (!schoolId) {
    throw new ValidationError('Tenant context required: schoolId is missing');
  }

  if (!Array.isArray(order)) {
    throw new ValidationError('Sidebar order must be an array of module strings');
  }

  await settingsRepo.executeTransaction(async (tx) => {
    await settingsRepo.upsertSetting(schoolId, 'sidebar', { order }, tx);

    await createAuditLog({
      schoolId,
      entityType: 'SchoolSetting',
      entityId: schoolId,
      actionPerformed: 'UPDATE_SIDEBAR_ORDER',
      userName: actor.email || actor.name || 'Administrator',
      userRole: actor.systemRole || actor.role || 'SCHOOL_ADMIN',
      modifiedFields: {
        itemCount: order.length
      }
    }, tx);
  });

  return { order };
}

/**
 * Fetch Public School Metadata (Safe fields only)
 */
export async function getPublicSchoolMeta(schoolId) {
  if (!schoolId) {
    throw new ValidationError('School ID is required');
  }

  const school = await settingsRepo.findSchoolById(schoolId);
  if (!school || school.status !== 'approved') {
    throw new NotFoundError(`School not found or not active: ${schoolId}`);
  }

  return {
    id: school.id,
    name: school.name,
    code: school.code,
    logoUrl: school.logoUrl || null
  };
}
