import { z } from 'zod';

/**
 * Report Card Zod Validation Schemas
 * Core domain validation rules for generating, previewing, publishing, and retrieving student report cards.
 */

// UUID schema helper
const uuidSchema = z.string().trim().uuid({ message: 'Invalid UUID format' });

// Preview generation input schema
export const generateReportCardPreviewSchema = {
  body: z.object({
    classId: uuidSchema,
    examId: uuidSchema.optional().nullable()
  })
};

// Report cards publication input schema
export const publishReportCardsSchema = {
  body: z.object({
    classId: uuidSchema,
    examId: uuidSchema.optional().nullable(),
    studentIds: z.array(uuidSchema).min(1, 'studentIds array cannot be empty if provided').optional()
  })
};

// Single report card retrieval params schema
export const getReportCardParamsSchema = {
  params: z.object({
    id: uuidSchema
  })
};

// List report cards for a student schema
export const listStudentReportCardsSchema = {
  params: z.object({
    studentId: uuidSchema
  }),
  query: z.object({
    examId: uuidSchema.optional(),
    page: z.coerce.number().int().min(1).default(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
    sort: z.enum(['publishedAt', 'title', 'createdAt', 'updatedAt']).default('publishedAt').optional(),
    order: z.enum(['asc', 'desc']).default('desc').optional()
  })
};

// List report cards for a class schema
export const listClassReportCardsSchema = {
  params: z.object({
    classId: uuidSchema
  }),
  query: z.object({
    examId: uuidSchema.optional().nullable(),
    page: z.coerce.number().int().min(1).default(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
    sort: z.enum(['publishedAt', 'title', 'createdAt', 'updatedAt']).default('publishedAt').optional(),
    order: z.enum(['asc', 'desc']).default('desc').optional()
  })
};
