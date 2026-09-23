import { z } from 'zod';
import { REGEX, AUTH_CONSTANTS } from '../../config/constants.js';

/**
 * Validates password complexity: min 8, max 128, at least 1 uppercase, 1 lowercase, 1 number.
 */
const passwordSchema = z
  .string({ required_error: 'Password is required' })
  .min(AUTH_CONSTANTS.MIN_PASSWORD_LENGTH, `Password must be at least ${AUTH_CONSTANTS.MIN_PASSWORD_LENGTH} characters`)
  .max(AUTH_CONSTANTS.MAX_PASSWORD_LENGTH, `Password must not exceed ${AUTH_CONSTANTS.MAX_PASSWORD_LENGTH} characters`)
  .refine(val => /[A-Z]/.test(val), { message: 'Password must contain at least one uppercase letter' })
  .refine(val => /[a-z]/.test(val), { message: 'Password must contain at least one lowercase letter' })
  .refine(val => /[0-9]/.test(val), { message: 'Password must contain at least one number' });

const todayDateString = () => new Date().toISOString().split('T')[0];

/**
 * 1. Schema for POST /api/v1/public/schools/register
 */
export const registerSchoolSchema = {
  body: z.object({
    name: z
      .string({ required_error: 'School name is required' })
      .trim()
      .min(2, 'School name must be at least 2 characters')
      .max(255, 'School name must not exceed 255 characters'),
    code: z
      .string({ required_error: 'School code is required' })
      .trim()
      .min(2, 'School code must be at least 2 characters')
      .max(50, 'School code must not exceed 50 characters')
      .regex(/^[A-Za-z0-9_-]+$/, 'School code can only contain alphanumeric characters, underscores, and hyphens')
      .transform(val => val.toUpperCase()),
    type: z
      .string()
      .trim()
      .max(50, 'School type must not exceed 50 characters')
      .optional(),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('Invalid school email address')
      .max(255, 'School email must not exceed 255 characters')
      .optional(),
    phone: z
      .string()
      .trim()
      .max(20, 'Phone number must not exceed 20 characters')
      .optional(),
    address: z
      .string()
      .trim()
      .optional(),
    planId: z
      .string()
      .regex(REGEX.UUID, 'Invalid subscription plan ID format')
      .optional(),
    seatLimit: z
      .number()
      .int()
      .min(1, 'Seat limit must be at least 1')
      .max(100000, 'Seat limit cannot exceed 100,000')
      .optional(),
    teacherLimit: z
      .number()
      .int()
      .min(1, 'Teacher limit must be at least 1')
      .max(10000, 'Teacher limit cannot exceed 10,000')
      .optional(),
    admin: z.object({
      name: z
        .string({ required_error: 'Administrator name is required' })
        .trim()
        .min(2, 'Administrator name must be at least 2 characters')
        .max(200, 'Administrator name must not exceed 200 characters'),
      email: z
        .string({ required_error: 'Administrator email is required' })
        .trim()
        .toLowerCase()
        .email('Invalid administrator email address')
        .max(255, 'Administrator email must not exceed 255 characters'),
      password: passwordSchema,
      phone: z
        .string()
        .trim()
        .max(20, 'Administrator phone number must not exceed 20 characters')
        .optional()
    })
  })
};

/**
 * 2. Schema for POST /api/v1/public/teachers/register (or /api/v1/public/teacher-registration)
 */
export const registerTeacherSchema = {
  body: z.object({
    schoolId: z
      .string({ required_error: 'School ID is required' })
      .regex(REGEX.UUID, 'Invalid school ID format'),
    email: z
      .string({ required_error: 'Email is required' })
      .trim()
      .toLowerCase()
      .email('Invalid email address')
      .max(255, 'Email must not exceed 255 characters'),
    password: passwordSchema,
    employeeId: z
      .string()
      .trim()
      .max(100, 'Employee ID must not exceed 100 characters')
      .optional(),
    name: z
      .string()
      .trim()
      .min(2, 'Name must be at least 2 characters')
      .max(200, 'Name must not exceed 200 characters')
      .optional(),
    phone: z
      .string()
      .trim()
      .max(20, 'Phone must not exceed 20 characters')
      .optional(),
    customData: z
      .record(z.unknown())
      .optional()
  })
};

/**
 * 3. Schema for POST /api/v1/public/parents/register (or /api/v1/public/parent-registration)
 */
export const registerParentSchema = {
  body: z.object({
    schoolId: z
      .string({ required_error: 'School ID is required' })
      .regex(REGEX.UUID, 'Invalid school ID format'),
    name: z
      .string({ required_error: 'Parent name is required' })
      .trim()
      .min(2, 'Parent name must be at least 2 characters')
      .max(200, 'Parent name must not exceed 200 characters'),
    email: z
      .string({ required_error: 'Parent email is required' })
      .trim()
      .toLowerCase()
      .email('Invalid parent email address')
      .max(255, 'Parent email must not exceed 255 characters'),
    password: passwordSchema,
    phone: z
      .string()
      .trim()
      .max(20, 'Phone number must not exceed 20 characters')
      .optional(),
    admissionNumber: z
      .string({ required_error: 'Student admission number is required' })
      .trim()
      .min(1, 'Admission number is required')
      .max(100, 'Admission number must not exceed 100 characters'),
    dob: z
      .string({ required_error: 'Student date of birth is required' })
      .trim()
      .regex(REGEX.DATE_ISO, 'Date of birth must be in YYYY-MM-DD format')
      .refine(val => val <= todayDateString(), {
        message: 'Date of birth cannot be in the future'
      }),
    relationship: z
      .string({ required_error: 'Relationship to student is required' })
      .trim()
      .min(1, 'Relationship cannot be empty')
      .max(50, 'Relationship must not exceed 50 characters')
  })
};
