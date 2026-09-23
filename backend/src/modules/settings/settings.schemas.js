import { z } from 'zod';

/**
 * Zod Schemas for School Settings and Environment Configuration Module
 */

export const updateSchoolSettingsSchema = {
  body: z.object({
    name: z.string().trim().min(1, 'School name cannot be empty').max(255).optional(),
    contactPhone: z.string().trim().max(30).optional().nullable(),
    phone: z.string().trim().max(30).optional().nullable(),
    email: z.string().trim().email('Invalid email address').max(255).optional().nullable(),
    location: z.string().trim().max(1000).optional().nullable(),
    address: z.string().trim().max(1000).optional().nullable(),
    website: z.string().trim().url('Invalid website URL').max(255).or(z.literal('')).optional().nullable(),
    timezone: z.string().trim().max(50).optional(),
    branding: z.object({
      logoUrl: z.string().trim().max(2000).or(z.literal('')).optional().nullable(),
      faviconUrl: z.string().trim().max(2000).or(z.literal('')).optional().nullable(),
      primaryColor: z.string().trim().max(50).optional().nullable(),
      secondaryColor: z.string().trim().max(50).optional().nullable()
    }).optional(),
    academicConfig: z.object({
      currentYear: z.string().trim().max(50).optional(),
      termType: z.string().trim().max(100).optional()
    }).passthrough().optional(),
    customData: z.record(z.any()).optional()
  }).strict()
};

export const updateIntegrationsSchema = {
  body: z.object({
    apiKeys: z.object({
      googleMaps: z.string().trim().max(255).or(z.literal('')).optional().nullable(),
      cloudinary: z.object({
        cloudName: z.string().trim().max(100).or(z.literal('')).optional().nullable(),
        apiKey: z.string().trim().max(100).or(z.literal('')).optional().nullable(),
        uploadPreset: z.string().trim().max(100).or(z.literal('')).optional().nullable(),
        apiSecret: z.string().trim().max(200).or(z.literal('')).optional().nullable()
      }).optional().nullable()
    }).optional(),
    whatsapp: z.object({
      provider: z.string().trim().max(100).default('meta_whatsapp_cloud_api').optional(),
      accessToken: z.string().trim().max(2000).or(z.literal('')).optional().nullable(),
      phoneNumberId: z.string().trim().max(100).or(z.literal('')).optional().nullable(),
      businessAccountId: z.string().trim().max(100).or(z.literal('')).optional().nullable(),
      senderNumber: z.string().trim().max(50).or(z.literal('')).optional().nullable(),
      ptmTemplateName: z.string().trim().max(100).or(z.literal('')).optional().nullable(),
      noticeTemplateName: z.string().trim().max(100).or(z.literal('')).optional().nullable(),
      enabled: z.boolean().optional(),
      isConnected: z.boolean().optional()
    }).optional()
  }).strict()
};

export const updateSidebarSchema = {
  body: z.object({
    order: z.array(z.string().trim().min(1).max(100)).max(100, 'Sidebar ordering cannot exceed 100 items')
  }).strict()
};

export const publicSchoolMetaParamsSchema = {
  params: z.object({
    schoolId: z.string().trim().uuid('Invalid school ID format')
  })
};
