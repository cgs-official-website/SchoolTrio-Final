import { env } from './env.js';

/**
 * Centralized Cloudinary Configuration
 * Reads credentials from validated environment variables.
 */
export const cloudinaryConfig = Object.freeze({
  cloudName: env.CLOUDINARY_CLOUD_NAME || null,
  apiKey: env.CLOUDINARY_API_KEY || null,
  apiSecret: env.CLOUDINARY_API_SECRET || null,
  isConfigured: Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET)
});
