import { z } from 'zod';
import { REGEX } from '../../config/constants.js';

/**
 * Zod validation schemas for Assessment REST API endpoints.
 */

export const listAssessmentsSchema = {
  query: z.object({
    classId: z.string().regex(REGEX.UUID, 'Invalid class ID format').optional(),
    examId: z.string().regex(REGEX.UUID, 'Invalid exam ID format').optional(),
    subjectId: z.string().regex(REGEX.UUID, 'Invalid subject ID format').optional(),
    search: z.string().trim().max(100).optional(),
    date: z.string().regex(REGEX.DATE_ISO, 'Invalid date format (YYYY-MM-DD)').optional(),
    page: z.coerce.number().int().min(1, 'Page must be at least 1').optional(),
    limit: z.coerce.number().int().min(1, 'Limit must be at least 1').max(100, 'Limit cannot exceed 100').optional(),
    sort: z.string().trim().max(50).optional(),
    order: z.enum(['asc', 'desc'], {
      errorMap: () => ({ message: 'Order must be either "asc" or "desc"' })
    }).optional()
  })
};

export const assessmentParamsSchema = {
  params: z.object({
    id: z.string({ required_error: 'Assessment ID is required' }).regex(REGEX.UUID, 'Invalid assessment ID format')
  })
};

export const createAssessmentSchema = {
  body: z
    .object({
      title: z
        .string({ required_error: 'Assessment title is required' })
        .trim()
        .min(1, 'Assessment title is required')
        .max(150, 'Assessment title must not exceed 150 characters'),
      classId: z
        .string({ required_error: 'Class ID is required' })
        .regex(REGEX.UUID, 'Invalid class ID format'),
      totalMarks: z.coerce
        .number({ required_error: 'Total marks is required', invalid_type_error: 'Total marks must be a numeric value' })
        .positive('Total marks must be greater than 0')
        .max(999.99, 'Total marks cannot exceed 999.99'),
      passingMarks: z.coerce
        .number({ invalid_type_error: 'Passing marks must be a numeric value' })
        .min(0, 'Passing marks cannot be negative')
        .max(999.99, 'Passing marks cannot exceed 999.99')
        .optional()
        .nullable(),
      date: z
        .string()
        .regex(REGEX.DATE_ISO, 'Date must be in YYYY-MM-DD format')
        .optional()
        .nullable(),
      examId: z
        .string()
        .regex(REGEX.UUID, 'Invalid exam ID format')
        .optional()
        .nullable(),
      subjectId: z
        .string()
        .regex(REGEX.UUID, 'Invalid subject ID format')
        .optional()
        .nullable()
    })
};

export const updateAssessmentSchema = {
  params: z.object({
    id: z.string({ required_error: 'Assessment ID is required' }).regex(REGEX.UUID, 'Invalid assessment ID format')
  }),
  body: z
    .object({
      title: z
        .string()
        .trim()
        .min(1, 'Assessment title cannot be empty')
        .max(150, 'Assessment title must not exceed 150 characters')
        .optional(),
      totalMarks: z.coerce
        .number({ invalid_type_error: 'Total marks must be a numeric value' })
        .positive('Total marks must be greater than 0')
        .max(999.99, 'Total marks cannot exceed 999.99')
        .optional(),
      passingMarks: z.coerce
        .number({ invalid_type_error: 'Passing marks must be a numeric value' })
        .min(0, 'Passing marks cannot be negative')
        .max(999.99, 'Passing marks cannot exceed 999.99')
        .optional()
        .nullable(),
      date: z
        .string()
        .regex(REGEX.DATE_ISO, 'Date must be in YYYY-MM-DD format')
        .optional()
        .nullable(),
      examId: z
        .string()
        .regex(REGEX.UUID, 'Invalid exam ID format')
        .optional()
        .nullable(),
      subjectId: z
        .string()
        .regex(REGEX.UUID, 'Invalid subject ID format')
        .optional()
        .nullable()
    })
};
