import { z } from 'zod';
import { REGEX } from '../../config/constants.js';

/**
 * Zod validation schemas for Subject REST API endpoints.
 */

export const listSubjectsSchema = {
  query: z.object({
    search: z.string().trim().max(100).optional(),
    code: z.string().trim().max(50).optional(),
    page: z.coerce.number().int().min(1, 'Page must be at least 1').optional(),
    limit: z.coerce.number().int().min(1, 'Limit must be at least 1').max(100, 'Limit cannot exceed 100').optional(),
    sort: z.string().trim().max(50).optional(),
    order: z.enum(['asc', 'desc'], {
      errorMap: () => ({ message: 'Order must be either "asc" or "desc"' })
    }).optional()
  })
};

export const subjectParamsSchema = {
  params: z.object({
    id: z.string({ required_error: 'Subject ID is required' }).regex(REGEX.UUID, 'Invalid subject ID format')
  })
};

export const createSubjectSchema = {
  body: z.object({
    name: z
      .string({ required_error: 'Subject name is required' })
      .trim()
      .min(1, 'Subject name is required')
      .max(100, 'Subject name must not exceed 100 characters'),
    code: z
      .string()
      .trim()
      .max(50, 'Subject code must not exceed 50 characters')
      .nullable()
      .optional(),
    credits: z
      .number({ invalid_type_error: 'Credits must be a numeric value' })
      .min(0, 'Credits cannot be negative')
      .max(99.9, 'Credits cannot exceed 99.9')
      .nullable()
      .optional()
  })
};

export const updateSubjectSchema = {
  params: z.object({
    id: z.string({ required_error: 'Subject ID is required' }).regex(REGEX.UUID, 'Invalid subject ID format')
  }),
  body: z
    .object({
      name: z
        .string()
        .trim()
        .min(1, 'Subject name cannot be empty')
        .max(100, 'Subject name must not exceed 100 characters')
        .optional(),
      code: z
        .string()
        .trim()
        .max(50, 'Subject code must not exceed 50 characters')
        .nullable()
        .optional(),
      credits: z
        .number({ invalid_type_error: 'Credits must be a numeric value' })
        .min(0, 'Credits cannot be negative')
        .max(99.9, 'Credits cannot exceed 99.9')
        .nullable()
        .optional()
    })
    .refine(
      data => Object.keys(data).length > 0,
      'At least one field (name, code, or credits) must be provided for update'
    )
};

export const bulkImportSubjectsSchema = {
  body: z.object({
    rows: z.array(
      z.object({
        name: z.string().trim().min(1, 'Subject name is required'),
        code: z.string().trim().optional().nullable()
      })
    ).min(1, 'At least one subject row is required for import')
  })
};

