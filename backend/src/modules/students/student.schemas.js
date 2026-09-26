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

const emptyToNull = (val) => (typeof val === 'string' && val.trim() === '' ? null : val);

export const normalizeDobInput = (val) => {
  if (val === undefined || val === null) return null;
  const str = String(val).trim();
  if (!str) return null;

  const ymdMatch = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (ymdMatch) {
    const [, year, month, day] = ymdMatch;
    const pad = (n) => String(n).padStart(2, '0');
    return `${year}-${pad(month)}-${pad(day)}`;
  }

  const dmyMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch;
    const pad = (n) => String(n).padStart(2, '0');
    return `${year}-${pad(month)}-${pad(day)}`;
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    if (year > 1900 && year <= new Date().getFullYear()) {
      return `${year}-${month}-${day}`;
    }
  }

  return str;
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
    lastName: z.preprocess(
      emptyToNull,
      z
        .string()
        .trim()
        .max(100, 'Last name must not exceed 100 characters')
        .nullable()
        .optional()
    ),
    dob: z.preprocess(
      normalizeDobInput,
      z
        .string()
        .trim()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be in YYYY-MM-DD, DD-MM-YYYY, DD.MM.YYYY, or YYYY.MM.DD format')
        .refine(val => !val || val <= todayDateString(), {
          message: 'Date of birth cannot be in the future'
        })
        .nullable()
        .optional()
    ),
    gender: z.preprocess(
      emptyToNull,
      z
        .string()
        .trim()
        .max(20, 'Gender must not exceed 20 characters')
        .nullable()
        .optional()
    ),
    bloodGroup: z.preprocess(
      emptyToNull,
      z
        .enum(BLOOD_GROUPS, {
          errorMap: () => ({ message: `Blood group must be one of: ${BLOOD_GROUPS.join(', ')}` })
        })
        .nullable()
        .optional()
    ),
    aadhaarNumber: z.preprocess(
      emptyToNull,
      z
        .string()
        .trim()
        .regex(/^\d{12}$/, 'Aadhaar number must be exactly 12 numeric digits')
        .nullable()
        .optional()
    ),
    photoUrl: z.preprocess(
      emptyToNull,
      z
        .string()
        .trim()
        .max(2048, 'Photo URL must not exceed 2048 characters')
        .nullable()
        .optional()
    ),
    rollNumber: z.preprocess(
      emptyToNull,
      z
        .string()
        .trim()
        .max(50, 'Roll number must not exceed 50 characters')
        .nullable()
        .optional()
    ),
    classId: z.preprocess(
      emptyToNull,
      z
        .string()
        .regex(REGEX.UUID, 'Invalid class ID format')
        .nullable()
        .optional()
    ),
    sectionId: z.preprocess(
      emptyToNull,
      z
        .string()
        .regex(REGEX.UUID, 'Invalid section ID format')
        .nullable()
        .optional()
    ),
    transportRouteId: z.preprocess(
      emptyToNull,
      z
        .string()
        .regex(REGEX.UUID, 'Invalid transport route ID format')
        .nullable()
        .optional()
    ),
    pickupStopId: z.preprocess(
      emptyToNull,
      z
        .string()
        .regex(REGEX.UUID, 'Invalid pickup stop ID format')
        .nullable()
        .optional()
    ),
    status: z.preprocess(
      emptyToNull,
      z
        .enum(STUDENT_STATUSES, {
          errorMap: () => ({ message: `Status must be one of: ${STUDENT_STATUSES.join(', ')}` })
        })
        .optional()
        .default('Active')
    ),
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
      lastName: z.preprocess(
        emptyToNull,
        z
          .string()
          .trim()
          .max(100, 'Last name must not exceed 100 characters')
          .nullable()
          .optional()
      ),
      dob: z.preprocess(
        normalizeDobInput,
        z
          .string()
          .trim()
          .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be in YYYY-MM-DD, DD-MM-YYYY, DD.MM.YYYY, or YYYY.MM.DD format')
          .refine(val => !val || val <= todayDateString(), {
            message: 'Date of birth cannot be in the future'
          })
          .nullable()
          .optional()
      ),
      gender: z.preprocess(
        emptyToNull,
        z
          .string()
          .trim()
          .max(20, 'Gender must not exceed 20 characters')
          .nullable()
          .optional()
      ),
      bloodGroup: z.preprocess(
        emptyToNull,
        z
          .enum(BLOOD_GROUPS, {
            errorMap: () => ({ message: `Blood group must be one of: ${BLOOD_GROUPS.join(', ')}` })
          })
          .nullable()
          .optional()
      ),
      aadhaarNumber: z.preprocess(
        emptyToNull,
        z
          .string()
          .trim()
          .regex(/^\d{12}$/, 'Aadhaar number must be exactly 12 numeric digits')
          .nullable()
          .optional()
      ),
      photoUrl: z.preprocess(
        emptyToNull,
        z
          .string()
          .trim()
          .max(2048, 'Photo URL must not exceed 2048 characters')
          .nullable()
          .optional()
      ),
      rollNumber: z.preprocess(
        emptyToNull,
        z
          .string()
          .trim()
          .max(50, 'Roll number must not exceed 50 characters')
          .nullable()
          .optional()
      ),
      classId: z.preprocess(
        emptyToNull,
        z
          .string()
          .regex(REGEX.UUID, 'Invalid class ID format')
          .nullable()
          .optional()
      ),
      sectionId: z.preprocess(
        emptyToNull,
        z
          .string()
          .regex(REGEX.UUID, 'Invalid section ID format')
          .nullable()
          .optional()
      ),
      transportRouteId: z.preprocess(
        emptyToNull,
        z
          .string()
          .regex(REGEX.UUID, 'Invalid transport route ID format')
          .nullable()
          .optional()
      ),
      pickupStopId: z.preprocess(
        emptyToNull,
        z
          .string()
          .regex(REGEX.UUID, 'Invalid pickup stop ID format')
          .nullable()
          .optional()
      ),
      status: z.preprocess(
        emptyToNull,
        z
          .enum(STUDENT_STATUSES, {
            errorMap: () => ({ message: `Status must be one of: ${STUDENT_STATUSES.join(', ')}` })
          })
          .optional()
      ),
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

export const bulkImportStudentsSchema = {
  body: z.object({
    students: z
      .array(createStudentSchema.body)
      .min(1, 'Bulk import payload must contain at least 1 student object')
      .max(100, 'Bulk import batch size cannot exceed 100 students per request')
  })
};

