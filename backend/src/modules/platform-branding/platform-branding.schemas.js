import { z } from 'zod';

/**
 * Validation schema for updating platform-wide branding configuration.
 * Enforces strict key isolation so arbitrary or speculative fields are rejected.
 */
export const updatePlatformBrandingSchema = z
  .object({
    platformName: z
      .string({ invalid_type_error: 'platformName must be a string' })
      .trim()
      .min(1, 'platformName cannot be empty')
      .max(100, 'platformName cannot exceed 100 characters')
      .optional(),
    primaryColor: z
      .string({ invalid_type_error: 'primaryColor must be a string' })
      .trim()
      .regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'primaryColor must be a valid hex color code (e.g. #7b40a3)')
      .optional(),
    logoUrl: z
      .string({ invalid_type_error: 'logoUrl must be a string' })
      .trim()
      .min(1, 'logoUrl cannot be empty')
      .max(2000, 'logoUrl cannot exceed 2000 characters')
      .optional(),
    faviconUrl: z
      .string({ invalid_type_error: 'faviconUrl must be a string' })
      .trim()
      .min(1, 'faviconUrl cannot be empty')
      .max(2000, 'faviconUrl cannot exceed 2000 characters')
      .optional(),
    loginBackgroundImage: z
      .string({ invalid_type_error: 'loginBackgroundImage must be a string' })
      .trim()
      .min(1, 'loginBackgroundImage cannot be empty')
      .max(2000, 'loginBackgroundImage cannot exceed 2000 characters')
      .optional()
  })
  .strict('Unexpected fields are not allowed in platform branding configuration')
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one branding field must be provided for update'
  });
