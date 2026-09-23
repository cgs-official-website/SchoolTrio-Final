import { z } from 'zod';
import { REGEX } from '../../config/constants.js';

/**
 * Zod validation schemas for Class & Section REST API endpoints.
 */

export const listClassesSchema = {
  query: z.object({
    search: z.string().trim().max(100).optional(),
    categoryId: z.string().regex(REGEX.UUID, 'Invalid category ID format').optional(),
    hasTeacher: z.enum(['true', 'false'], {
      errorMap: () => ({ message: 'hasTeacher must be either "true" or "false"' })
    }).optional(),
    page: z.coerce.number().int().min(1, 'Page must be at least 1').optional(),
    limit: z.coerce.number().int().min(1, 'Limit must be at least 1').max(100, 'Limit cannot exceed 100').optional(),
    sort: z.string().trim().max(50).optional(),
    order: z.enum(['asc', 'desc'], {
      errorMap: () => ({ message: 'Order must be either "asc" or "desc"' })
    }).optional()
  })
};

export const classParamsSchema = {
  params: z.object({
    id: z.string({ required_error: 'Class ID is required' }).regex(REGEX.UUID, 'Invalid class ID format')
  })
};

export const createClassSchema = {
  body: z.object({
    name: z
      .string({ required_error: 'Class name is required' })
      .trim()
      .min(1, 'Class name is required')
      .max(100, 'Class name must not exceed 100 characters'),
    categoryId: z
      .string()
      .regex(REGEX.UUID, 'Invalid category ID format')
      .nullable()
      .optional(),
    gradeLevel: z
      .number()
      .int('Grade level must be an integer')
      .min(0, 'Grade level cannot be negative')
      .max(20, 'Grade level cannot exceed 20')
      .nullable()
      .optional(),
    classTeacherId: z
      .string()
      .regex(REGEX.UUID, 'Invalid class teacher ID format')
      .nullable()
      .optional(),
    defaultSection: z
      .string()
      .trim()
      .min(1, 'Default section name cannot be empty')
      .max(50, 'Default section name must not exceed 50 characters')
      .optional()
  })
};

export const updateClassSchema = {
  params: z.object({
    id: z.string({ required_error: 'Class ID is required' }).regex(REGEX.UUID, 'Invalid class ID format')
  }),
  body: z
    .object({
      name: z
        .string()
        .trim()
        .min(1, 'Class name cannot be empty')
        .max(100, 'Class name must not exceed 100 characters')
        .optional(),
      categoryId: z
        .string()
        .regex(REGEX.UUID, 'Invalid category ID format')
        .nullable()
        .optional(),
      gradeLevel: z
        .number()
        .int('Grade level must be an integer')
        .min(0, 'Grade level cannot be negative')
        .max(20, 'Grade level cannot exceed 20')
        .nullable()
        .optional(),
      classTeacherId: z
        .string()
        .regex(REGEX.UUID, 'Invalid class teacher ID format')
        .nullable()
        .optional()
    })
    .refine(
      data => Object.keys(data).length > 0,
      'At least one field (name, categoryId, gradeLevel, or classTeacherId) must be provided for update'
    )
};

export const classSectionsParamsSchema = {
  params: z.object({
    classId: z.string({ required_error: 'Class ID is required' }).regex(REGEX.UUID, 'Invalid class ID format')
  })
};

export const createSectionSchema = {
  params: z.object({
    classId: z.string({ required_error: 'Class ID is required' }).regex(REGEX.UUID, 'Invalid class ID format')
  }),
  body: z.object({
    name: z
      .string({ required_error: 'Section name is required' })
      .trim()
      .min(1, 'Section name is required')
      .max(50, 'Section name must not exceed 50 characters')
  })
};

export const updateSectionSchema = {
  params: z.object({
    classId: z.string({ required_error: 'Class ID is required' }).regex(REGEX.UUID, 'Invalid class ID format'),
    sectionId: z.string({ required_error: 'Section ID is required' }).regex(REGEX.UUID, 'Invalid section ID format')
  }),
  body: z.object({
    name: z
      .string({ required_error: 'Section name is required' })
      .trim()
      .min(1, 'Section name cannot be empty')
      .max(50, 'Section name must not exceed 50 characters')
  })
};

export const sectionParamsSchema = {
  params: z.object({
    classId: z.string({ required_error: 'Class ID is required' }).regex(REGEX.UUID, 'Invalid class ID format'),
    sectionId: z.string({ required_error: 'Section ID is required' }).regex(REGEX.UUID, 'Invalid section ID format')
  })
};
