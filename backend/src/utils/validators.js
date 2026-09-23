import { z } from 'zod';
import { REGEX, PAGINATION_DEFAULTS } from '../config/constants.js';

/**
 * Common Reusable Zod Schemas & Validators
 */

export const uuidSchema = z
  .string()
  .trim()
  .regex(REGEX.UUID, 'Invalid UUID format');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Invalid email address format');

export const phoneSchema = z
  .string()
  .trim()
  .regex(REGEX.PHONE, 'Invalid phone number format');

export const slugSchema = z
  .string()
  .trim()
  .regex(REGEX.SLUG, 'Invalid slug format (must be lowercase alphanumeric with hyphens)');

export const dateStringSchema = z
  .string()
  .trim()
  .regex(REGEX.DATE_ISO, 'Invalid date format (expected YYYY-MM-DD)');

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(PAGINATION_DEFAULTS.PAGE),
  limit: z.coerce.number().int().min(1).max(PAGINATION_DEFAULTS.MAX_LIMIT).default(PAGINATION_DEFAULTS.LIMIT),
  sort: z.string().trim().default(PAGINATION_DEFAULTS.SORT),
  order: z.enum(['asc', 'desc']).default(PAGINATION_DEFAULTS.ORDER)
});

export const dateRangeSchema = z.object({
  startDate: dateStringSchema,
  endDate: dateStringSchema
}).refine(data => new Date(data.startDate) <= new Date(data.endDate), {
  message: 'startDate must be less than or equal to endDate',
  path: ['endDate']
});
