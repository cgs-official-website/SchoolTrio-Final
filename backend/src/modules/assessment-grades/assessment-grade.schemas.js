import { z } from 'zod';
import { REGEX } from '../../config/constants.js';

/**
 * Zod validation schemas for Assessment Grade / Mark Entry REST API endpoints.
 */

// Regex for Decimal(5, 2): non-negative number up to 999.99 with at most 2 decimal places
const DECIMAL_MARKS_REGEX = /^\d{1,3}(\.\d{1,2})?$/;

const marksObtainedSchema = z.union([z.number(), z.string()])
  .transform((val) => String(val).trim())
  .refine((val) => DECIMAL_MARKS_REGEX.test(val), {
    message: 'Marks obtained must be a valid positive number between 0 and 999.99 with at most 2 decimal places'
  })
  .transform((val) => parseFloat(val))
  .refine((val) => val >= 0 && val <= 999.99, {
    message: 'Marks obtained must be between 0 and 999.99'
  });

export const gradeParamsSchema = {
  params: z.object({
    assessmentId: z.string({ required_error: 'Assessment ID is required' }).regex(REGEX.UUID, 'Invalid assessment ID format'),
    studentId: z.string({ required_error: 'Student ID is required' }).regex(REGEX.UUID, 'Invalid student ID format').optional()
  })
};

export const singleGradeParamsSchema = {
  params: z.object({
    assessmentId: z.string({ required_error: 'Assessment ID is required' }).regex(REGEX.UUID, 'Invalid assessment ID format'),
    studentId: z.string({ required_error: 'Student ID is required' }).regex(REGEX.UUID, 'Invalid student ID format')
  })
};

export const listGradesSchema = {
  params: z.object({
    assessmentId: z.string({ required_error: 'Assessment ID is required' }).regex(REGEX.UUID, 'Invalid assessment ID format')
  }),
  query: z.object({
    search: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1, 'Page must be at least 1').optional(),
    limit: z.coerce.number().int().min(1, 'Limit must be at least 1').max(100, 'Limit cannot exceed 100').optional(),
    sort: z.string().trim().max(50).optional(),
    order: z.enum(['asc', 'desc'], {
      errorMap: () => ({ message: 'Order must be either "asc" or "desc"' })
    }).optional()
  })
};

export const singleGradeItemSchema = z.object({
  studentId: z.string({ required_error: 'Student ID is required' }).regex(REGEX.UUID, 'Invalid student ID format'),
  marksObtained: marksObtainedSchema,
  remarks: z.string().trim().max(1000, 'Remarks cannot exceed 1000 characters').optional().nullable()
});

export const upsertSingleGradeSchema = {
  params: z.object({
    assessmentId: z.string({ required_error: 'Assessment ID is required' }).regex(REGEX.UUID, 'Invalid assessment ID format'),
    studentId: z.string({ required_error: 'Student ID is required' }).regex(REGEX.UUID, 'Invalid student ID format')
  }),
  body: z.object({
    marksObtained: marksObtainedSchema,
    remarks: z.string().trim().max(1000, 'Remarks cannot exceed 1000 characters').optional().nullable()
  })
};

export const bulkUpsertGradesSchema = {
  params: z.object({
    assessmentId: z.string({ required_error: 'Assessment ID is required' }).regex(REGEX.UUID, 'Invalid assessment ID format')
  }),
  body: z.object({
    grades: z
      .array(singleGradeItemSchema, { required_error: 'Grades array is required' })
      .min(1, 'Grades array must contain at least one item')
      .max(200, 'Cannot submit more than 200 grades in a single batch')
  })
};
