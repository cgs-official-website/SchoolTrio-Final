import { z } from 'zod';
import { REGEX } from '../../config/constants.js';

/**
 * Canonical Zod validation schemas for Student REST API endpoints.
 */

export const STUDENT_STATUSES = Object.freeze([
  'Active',
  'Inactive',
  'Transferred',
  'Graduated',
  'Alumni'
]);

export const BLOOD_GROUPS = Object.freeze([
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
  'O+',
  'O-'
]);

const todayDateString = () => new Date().toISOString().split('T')[0];

export const listStudentsSchema = {
  query: z.object({
    search: z.string().trim().max(100).optional(),
    admissionNumber: z.string().trim().max(100).optional(),
    classId: z.string().regex(REGEX.UUID, 'Invalid class ID format').optional(),
    sectionId: z.string().regex(REGEX.UUID, 'Invalid section ID format').optional(),
    status: z.enum(STUDENT_STATUSES, {
      errorMap: () => ({ message: `Status must be one of: ${STUDENT_STATUSES.join(', ')}` })
    }).optional(),
    gender: z.string().trim().max(20).optional(),
    bloodGroup: z.enum(BLOOD_GROUPS, {
      errorMap: () => ({ message: `Blood group must be one of: ${BLOOD_GROUPS.join(', ')}` })
    }).optional(),
    page: z.coerce.number().int().min(1, 'Page must be at least 1').optional(),
    limit: z.coerce.number().int().min(1, 'Limit must be at least 1').max(1000, 'Limit cannot exceed 1000').optional(),
    sort: z.string().trim().max(50).optional(),
    order: z.enum(['asc', 'desc'], {
      errorMap: () => ({ message: 'Order must be either "asc" or "desc"' })
    }).optional()
  })
};

export const studentParamsSchema = {
  params: z.object({
    id: z.string({ required_error: 'Student ID is required' }).regex(REGEX.UUID, 'Invalid student ID format')
  })
};

export const createStudentSchema = {
  body: z.object({
    admissionNumber: z
      .string({ required_error: 'Admission number is required' })
      .trim()
      .min(1, 'Admission number is required')
      .max(100, 'Admission number must not exceed 100 characters'),
    firstName: z
      .string({ required_error: 'First name is required' })
      .trim()
      .min(1, 'First name is required')
      .max(100, 'First name must not exceed 100 characters'),
    lastName: z
      .string()
      .trim()
      .max(100, 'Last name must not exceed 100 characters')
      .nullable()
      .optional(),
    dob: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be in YYYY-MM-DD format')
      .refine(val => val <= todayDateString(), {
        message: 'Date of birth cannot be in the future'
      })
      .nullable()
      .optional(),
    gender: z
      .string()
      .trim()
      .max(20, 'Gender must not exceed 20 characters')
      .nullable()
      .optional(),
    bloodGroup: z
      .enum(BLOOD_GROUPS, {
        errorMap: () => ({ message: `Blood group must be one of: ${BLOOD_GROUPS.join(', ')}` })
      })
      .nullable()
      .optional(),
    aadhaarNumber: z
      .string()
      .trim()
      .regex(/^\d{12}$/, 'Aadhaar number must be exactly 12 numeric digits')
      .nullable()
      .optional(),
    photoUrl: z
      .string()
      .trim()
      .max(2048, 'Photo URL must not exceed 2048 characters')
      .nullable()
      .optional(),
    rollNumber: z
      .string()
      .trim()
      .max(50, 'Roll number must not exceed 50 characters')
      .nullable()
      .optional(),
    classId: z
      .string()
      .regex(REGEX.UUID, 'Invalid class ID format')
      .nullable()
      .optional(),
    sectionId: z
      .string()
      .regex(REGEX.UUID, 'Invalid section ID format')
      .nullable()
      .optional(),
    transportRouteId: z
      .string()
      .regex(REGEX.UUID, 'Invalid transport route ID format')
      .nullable()
      .optional(),
    pickupStopId: z
      .string()
      .regex(REGEX.UUID, 'Invalid pickup stop ID format')
      .nullable()
      .optional(),
    status: z
      .enum(STUDENT_STATUSES, {
        errorMap: () => ({ message: `Status must be one of: ${STUDENT_STATUSES.join(', ')}` })
      })
      .optional()
      .default('Active'),
    customData: z
      .record(z.any())
      .nullable()
      .optional()
  })
};

export const updateStudentSchema = {
  params: z.object({
    id: z.string({ required_error: 'Student ID is required' }).regex(REGEX.UUID, 'Invalid student ID format')
  }),
  body: z
    .object({
      admissionNumber: z
        .string()
        .trim()
        .min(1, 'Admission number cannot be empty')
        .max(100, 'Admission number must not exceed 100 characters')
        .optional(),
      firstName: z
        .string()
        .trim()
        .min(1, 'First name cannot be empty')
        .max(100, 'First name must not exceed 100 characters')
        .optional(),
      lastName: z
        .string()
        .trim()
        .max(100, 'Last name must not exceed 100 characters')
        .nullable()
        .optional(),
      dob: z
        .string()
        .trim()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be in YYYY-MM-DD format')
        .refine(val => val <= todayDateString(), {
          message: 'Date of birth cannot be in the future'
        })
        .nullable()
        .optional(),
      gender: z
        .string()
        .trim()
        .max(20, 'Gender must not exceed 20 characters')
        .nullable()
        .optional(),
      bloodGroup: z
        .enum(BLOOD_GROUPS, {
          errorMap: () => ({ message: `Blood group must be one of: ${BLOOD_GROUPS.join(', ')}` })
        })
        .nullable()
        .optional(),
      aadhaarNumber: z
        .string()
        .trim()
        .regex(/^\d{12}$/, 'Aadhaar number must be exactly 12 numeric digits')
        .nullable()
        .optional(),
      photoUrl: z
        .string()
        .trim()
        .max(2048, 'Photo URL must not exceed 2048 characters')
        .nullable()
        .optional(),
      rollNumber: z
        .string()
        .trim()
        .max(50, 'Roll number must not exceed 50 characters')
        .nullable()
        .optional(),
      classId: z
        .string()
        .regex(REGEX.UUID, 'Invalid class ID format')
        .nullable()
        .optional(),
      sectionId: z
        .string()
        .regex(REGEX.UUID, 'Invalid section ID format')
        .nullable()
        .optional(),
      transportRouteId: z
        .string()
        .regex(REGEX.UUID, 'Invalid transport route ID format')
        .nullable()
        .optional(),
      pickupStopId: z
        .string()
        .regex(REGEX.UUID, 'Invalid pickup stop ID format')
        .nullable()
        .optional(),
      status: z
        .enum(STUDENT_STATUSES, {
          errorMap: () => ({ message: `Status must be one of: ${STUDENT_STATUSES.join(', ')}` })
        })
        .optional(),
      customData: z
        .record(z.any())
        .nullable()
        .optional()
    })
    .refine(
      data => Object.keys(data).length > 0,
      'At least one field must be provided for update'
    )
};
