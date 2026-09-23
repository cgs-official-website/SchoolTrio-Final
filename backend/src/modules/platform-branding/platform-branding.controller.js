import * as platformBrandingService from './platform-branding.service.js';
import { ApiResponse } from '../../utils/api-response.js';

/**
 * Controller Layer for Global Platform Branding
 */

export async function getPlatformBranding(_req, res, next) {
  try {
    const branding = await platformBrandingService.getPlatformBranding();
    return ApiResponse.success(res, branding, 'Platform branding retrieved successfully');
  } catch (err) {
    next(err);
  }
}

export async function updatePlatformBranding(req, res, next) {
  try {
    const actor = req.user || req.auth || {};
    const updated = await platformBrandingService.updatePlatformBranding(req.body, actor);
    return ApiResponse.success(res, updated, 'Platform branding updated successfully');
  } catch (err) {
    next(err);
  }
}

export async function resetPlatformBranding(req, res, next) {
  try {
    const actor = req.user || req.auth || {};
    const reset = await platformBrandingService.resetPlatformBranding(actor);
    return ApiResponse.success(res, reset, 'Platform branding reset to defaults successfully');
  } catch (err) {
    next(err);
  }
}
