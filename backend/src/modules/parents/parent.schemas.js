import { z } from 'zod';
import { REGEX } from '../../config/constants.js';

/**
 * Canonical Zod validation schemas for Parent & Parent-Student Links REST API endpoints.
 */

export const listParentsSchema = {
  query: z.object({
    search: z.string().trim().max(100).optional(),
    phone: z.string().trim().max(50).optional(),
    email: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1, 'Page must be at least 1').optional(),
    limit: z.coerce.number().int().min(1, 'Limit must be at least 1').max(100, 'Limit cannot exceed 100').optional(),
    sort: z.string().trim().max(50).optional(),
    order: z.enum(['asc', 'desc'], {
      errorMap: () => ({ message: 'Order must be either "asc" or "desc"' })
    }).optional()
  })
};

export const parentParamsSchema = {
  params: z.object({
    id: z.string({ required_error: 'Parent ID is required' }).regex(REGEX.UUID, 'Invalid parent ID format')
  })
};

export const updateParentSchema = {
  params: z.object({
    id: z.string({ required_error: 'Parent ID is required' }).regex(REGEX.UUID, 'Invalid parent ID format')
  }),
  body: z
    .object({
      name: z
        .string()
        .trim()
        .min(1, 'Parent name cannot be empty')
        .max(200, 'Parent name must not exceed 200 characters')
        .optional(),
      phone: z
        .string()
        .trim()
        .max(20, 'Phone number must not exceed 20 characters')
        .nullable()
        .optional(),
      email: z
        .string()
        .trim()
        .toLowerCase()
        .email('Invalid email address format')
        .max(255, 'Email must not exceed 255 characters')
        .nullable()
        .optional(),
      address: z
        .string()
        .trim()
        .nullable()
        .optional(),
      emergencyContact: z
        .string()
        .trim()
        .max(20, 'Emergency contact must not exceed 20 characters')
        .nullable()
        .optional(),
      isActive: z
        .boolean({ invalid_type_error: 'isActive must be a boolean' })
        .optional()
    })
    .refine(
      data => Object.keys(data).length > 0,
      'At least one field must be provided for update'
    )
};

export const studentParentParamsSchema = {
  params: z.object({
    studentId: z.string({ required_error: 'Student ID is required' }).regex(REGEX.UUID, 'Invalid student ID format')
  })
};

export const studentParentUnlinkParamsSchema = {
  params: z.object({
    studentId: z.string({ required_error: 'Student ID is required' }).regex(REGEX.UUID, 'Invalid student ID format'),
    parentId: z.string({ required_error: 'Parent ID is required' }).regex(REGEX.UUID, 'Invalid parent ID format')
  })
};

export const linkParentToStudentSchema = {
  params: z.object({
    studentId: z.string({ required_error: 'Student ID is required' }).regex(REGEX.UUID, 'Invalid student ID format')
  }),
  body: z
    .object({
      parentProfileId: z
        .string()
        .regex(REGEX.UUID, 'Invalid parent profile ID format')
        .optional(),
      relationship: z
        .string({ required_error: 'Relationship is required' })
        .trim()
        .min(1, 'Relationship cannot be empty')
        .max(50, 'Relationship must not exceed 50 characters'),
      name: z
        .string()
        .trim()
        .min(1, 'Parent name cannot be empty')
        .max(200, 'Parent name must not exceed 200 characters')
        .optional(),
      phone: z
        .string()
        .trim()
        .max(20, 'Phone number must not exceed 20 characters')
        .nullable()
        .optional(),
      email: z
        .string()
        .trim()
        .toLowerCase()
        .email('Invalid email address format')
        .max(255, 'Email must not exceed 255 characters')
        .nullable()
        .optional(),
      address: z
        .string()
        .trim()
        .nullable()
        .optional(),
      emergencyContact: z
        .string()
        .trim()
        .max(20, 'Emergency contact must not exceed 20 characters')
        .nullable()
        .optional()
    })
    .refine(
      data => Boolean(data.parentProfileId || data.name),
      'Either parentProfileId (for existing parent) or name (for new parent) must be provided'
    )
};

const todayDateString = () => new Date().toISOString().split('T')[0];

export const linkChildSelfServiceSchema = {
  body: z.object({
    admissionNumber: z
      .string({ required_error: 'Admission number is required' })
      .trim()
      .min(1, 'Admission number is required')
      .max(100, 'Admission number must not exceed 100 characters'),
    dob: z
      .string({ required_error: 'Date of birth is required' })
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be in YYYY-MM-DD format')
      .refine(val => val <= todayDateString(), {
        message: 'Date of birth cannot be in the future'
      }),
    relationship: z
      .string({ required_error: 'Relationship is required' })
      .trim()
      .min(1, 'Relationship cannot be empty')
      .max(50, 'Relationship must not exceed 50 characters')
  })
};

export const unlinkChildSelfServiceSchema = {
  params: z.object({
    studentId: z.string({ required_error: 'Student ID is required' }).regex(REGEX.UUID, 'Invalid student ID format')
  })
};
