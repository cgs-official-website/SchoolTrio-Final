import { z } from 'zod';
import { REGEX } from '../../config/constants.js';

/**
 * Zod validation schemas for Examination REST API endpoints.
 */

export const listExamsSchema = {
  query: z.object({
    search: z.string().trim().max(100).optional(),
    term: z.string().trim().max(50).optional(),
    academicYear: z.string().trim().max(20).optional(),
    startDate: z.string().regex(REGEX.DATE_ISO, 'Invalid start date format (YYYY-MM-DD)').optional(),
    endDate: z.string().regex(REGEX.DATE_ISO, 'Invalid end date format (YYYY-MM-DD)').optional(),
    page: z.coerce.number().int().min(1, 'Page must be at least 1').optional(),
    limit: z.coerce.number().int().min(1, 'Limit must be at least 1').max(100, 'Limit cannot exceed 100').optional(),
    sort: z.string().trim().max(50).optional(),
    order: z.enum(['asc', 'desc'], {
      errorMap: () => ({ message: 'Order must be either "asc" or "desc"' })
    }).optional()
  })
};

export const examParamsSchema = {
  params: z.object({
    id: z.string({ required_error: 'Examination ID is required' }).regex(REGEX.UUID, 'Invalid examination ID format')
  })
};

export const createExamSchema = {
  body: z
    .object({
      name: z
        .string({ required_error: 'Exam name is required' })
        .trim()
        .min(1, 'Exam name is required')
        .max(150, 'Exam name must not exceed 150 characters'),
      term: z
        .string()
        .trim()
        .max(50, 'Term must not exceed 50 characters')
        .optional(),
      academicYear: z
        .string()
        .trim()
        .max(20, 'Academic year must not exceed 20 characters')
        .optional(),
      startDate: z
        .string()
        .regex(REGEX.DATE_ISO, 'Start date must be in YYYY-MM-DD format')
        .optional()
        .nullable(),
      endDate: z
        .string()
        .regex(REGEX.DATE_ISO, 'End date must be in YYYY-MM-DD format')
        .optional()
        .nullable()
    })
    .refine(
      (data) => {
        if (data.startDate && data.endDate) {
          return data.startDate <= data.endDate;
        }
        return true;
      },
      {
        message: 'Start date cannot be after end date',
        path: ['startDate']
      }
    )
};

export const updateExamSchema = {
  params: z.object({
    id: z.string({ required_error: 'Examination ID is required' }).regex(REGEX.UUID, 'Invalid examination ID format')
  }),
  body: z
    .object({
      name: z
        .string()
        .trim()
        .min(1, 'Exam name cannot be empty')
        .max(150, 'Exam name must not exceed 150 characters')
        .optional(),
      term: z
        .string()
        .trim()
        .min(1, 'Term cannot be empty')
        .max(50, 'Term must not exceed 50 characters')
        .optional(),
      academicYear: z
        .string()
        .trim()
        .min(1, 'Academic year cannot be empty')
        .max(20, 'Academic year must not exceed 20 characters')
        .optional(),
      startDate: z
        .string()
        .regex(REGEX.DATE_ISO, 'Start date must be in YYYY-MM-DD format')
        .optional()
        .nullable(),
      endDate: z
        .string()
        .regex(REGEX.DATE_ISO, 'End date must be in YYYY-MM-DD format')
        .optional()
        .nullable()
    })
    .refine(
      (data) => {
        if (data.startDate && data.endDate) {
          return data.startDate <= data.endDate;
        }
        return true;
      },
      {
        message: 'Start date cannot be after end date',
        path: ['startDate']
      }
    )
};
