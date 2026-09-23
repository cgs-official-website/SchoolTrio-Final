import crypto from 'node:crypto';
import { cloudinaryConfig } from '../config/cloudinary.js';
import { logger } from '../utils/logger.js';

/**
 * Cloudinary Service Abstraction (Phase 4A Boundary)
 *
 * NOTE: Phase 4A establishes the centralized configuration and signing interface.
 * Upload endpoints and asset storage will be integrated in subsequent phases.
 */
export class CloudinaryService {
  /**
   * Returns whether Cloudinary is fully configured with environment credentials.
   * @returns {boolean}
   */
  static isConfigured() {
    return cloudinaryConfig.isConfigured;
  }

  /**
   * Generates an SHA-1 signature for authenticated Cloudinary upload requests.
   *
   * @param {Object} params - Parameters to sign
   * @returns {string|null} Hex signature or null if not configured
   */
  static generateSignature(params = {}) {
    if (!this.isConfigured()) {
      logger.warn('[CLOUDINARY] Cannot generate signature: Cloudinary is not configured');
      return null;
    }

    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');

    const toSign = `${sortedParams}${cloudinaryConfig.apiSecret}`;
    return crypto.createHash('sha1').update(toSign).digest('hex');
  }

  /**
   * Constructs a secure Cloudinary delivery URL.
   *
   * @param {string} publicId - Cloudinary asset public ID
   * @param {Object} [options] - Transformation options
   * @param {string} [options.resourceType='image'] - 'image' | 'raw' | 'video'
   * @returns {string} Fully qualified secure URL
   */
  static getSecureUrl(publicId, options = {}) {
    if (!publicId) return '';
    const cloudName = cloudinaryConfig.cloudName || 'sms-saas';
    const resourceType = options.resourceType || 'image';
    return `https://res.cloudinary.com/${cloudName}/${resourceType}/upload/${publicId}`;
  }
}
