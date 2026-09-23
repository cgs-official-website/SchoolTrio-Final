import { z } from 'zod';
import { REGEX } from '../../config/constants.js';

/**
 * Canonical Zod validation schemas for Staff & Staff Profiles REST API.
 */

export const listStaffSchema = {
  query: z.object({
    search: z.string().trim().max(100).optional(),
    phone: z.string().trim().max(50).optional(),
    email: z.string().trim().max(100).optional(),
    staffType: z.enum(['teaching', 'non-teaching'], {
      errorMap: () => ({ message: 'staffType must be either "teaching" or "non-teaching"' })
    }).optional(),
    status: z.enum(['Active', 'Inactive', 'On Leave'], {
      errorMap: () => ({ message: 'status must be "Active", "Inactive", or "On Leave"' })
    }).optional(),
    roleId: z.string().regex(REGEX.UUID, 'Invalid role ID format').optional(),
    classId: z.string().regex(REGEX.UUID, 'Invalid class ID format').optional(),
    page: z.coerce.number().int().min(1, 'Page must be at least 1').optional(),
    limit: z.coerce.number().int().min(1, 'Limit must be at least 1').max(100, 'Limit cannot exceed 100').optional(),
    sort: z.string().trim().max(50).optional(),
    order: z.enum(['asc', 'desc'], {
      errorMap: () => ({ message: 'Order must be either "asc" or "desc"' })
    }).optional()
  })
};

export const staffParamsSchema = {
  params: z.object({
    id: z.string({ required_error: 'Staff ID is required' }).regex(REGEX.UUID, 'Invalid staff ID format')
  })
};

export const createStaffSchema = {
  body: z.object({
    firstName: z
      .string({ required_error: 'First name is required' })
      .trim()
      .min(1, 'First name cannot be empty')
      .max(100, 'First name must not exceed 100 characters'),
    lastName: z
      .string()
      .trim()
      .max(100, 'Last name must not exceed 100 characters')
      .nullable()
      .optional(),
    email: z
      .string({ required_error: 'Email is required' })
      .trim()
      .toLowerCase()
      .email('Invalid email address format')
      .max(255, 'Email must not exceed 255 characters'),
    phone: z
      .string()
      .trim()
      .max(20, 'Phone number must not exceed 20 characters')
      .nullable()
      .optional(),
    employeeId: z
      .string()
      .trim()
      .max(100, 'Employee ID must not exceed 100 characters')
      .nullable()
      .optional(),
    staffType: z
      .enum(['teaching', 'non-teaching'], {
        errorMap: () => ({ message: 'staffType must be either "teaching" or "non-teaching"' })
      })
      .default('teaching'),
    designation: z
      .string()
      .trim()
      .max(100, 'Designation must not exceed 100 characters')
      .nullable()
      .optional(),
    roleId: z
      .string()
      .regex(REGEX.UUID, 'Invalid role ID format')
      .nullable()
      .optional(),
    assignedClassId: z
      .string()
      .regex(REGEX.UUID, 'Invalid assigned class ID format')
      .nullable()
      .optional(),
    baseSalary: z
      .coerce
      .number()
      .min(0, 'Base salary cannot be negative')
      .nullable()
      .optional(),
    status: z
      .enum(['Active', 'Inactive', 'On Leave'], {
        errorMap: () => ({ message: 'status must be "Active", "Inactive", or "On Leave"' })
      })
      .default('Active'),
    dob: z
      .string()
      .trim()
      .max(30, 'Date of birth must not exceed 30 characters')
      .nullable()
      .optional(),
    gender: z
      .string()
      .trim()
      .max(20, 'Gender must not exceed 20 characters')
      .default('Male'),
    bloodGroup: z
      .string()
      .trim()
      .max(10, 'Blood group must not exceed 10 characters')
      .nullable()
      .optional(),
    maritalStatus: z
      .string()
      .trim()
      .max(30, 'Marital status must not exceed 30 characters')
      .nullable()
      .optional(),
    nationality: z
      .string()
      .trim()
      .max(50, 'Nationality must not exceed 50 characters')
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
    fatherGuardianName: z
      .string()
      .trim()
      .max(100, 'Father/Guardian name must not exceed 100 characters')
      .nullable()
      .optional(),
    languagesKnown: z
      .string()
      .trim()
      .max(200, 'Languages known must not exceed 200 characters')
      .nullable()
      .optional(),
    qualifications: z.record(z.unknown()).optional(),
    experience: z.record(z.unknown()).optional(),
    financial: z.record(z.unknown()).optional(),
    documents: z.record(z.unknown()).optional(),
    assignments: z
      .object({
        assignedSubjectIds: z.array(z.string().regex(REGEX.UUID, 'Invalid subject ID format')).optional(),
        subjectClassIds: z.array(z.string().regex(REGEX.UUID, 'Invalid class ID format')).optional()
      })
      .optional(),
    customData: z.record(z.unknown()).optional()
  })
};

export const updateStaffSchema = {
  params: z.object({
    id: z.string({ required_error: 'Staff ID is required' }).regex(REGEX.UUID, 'Invalid staff ID format')
  }),
  body: z
    .object({
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
      email: z
        .string()
        .trim()
        .toLowerCase()
        .email('Invalid email address format')
        .max(255, 'Email must not exceed 255 characters')
        .optional(),
      phone: z
        .string()
        .trim()
        .max(20, 'Phone number must not exceed 20 characters')
        .nullable()
        .optional(),
      employeeId: z
        .string()
        .trim()
        .max(100, 'Employee ID must not exceed 100 characters')
        .nullable()
        .optional(),
      staffType: z
        .enum(['teaching', 'non-teaching'], {
          errorMap: () => ({ message: 'staffType must be either "teaching" or "non-teaching"' })
        })
        .optional(),
      designation: z
        .string()
        .trim()
        .max(100, 'Designation must not exceed 100 characters')
        .nullable()
        .optional(),
      roleId: z
        .string()
        .regex(REGEX.UUID, 'Invalid role ID format')
        .nullable()
        .optional(),
      assignedClassId: z
        .string()
        .regex(REGEX.UUID, 'Invalid assigned class ID format')
        .nullable()
        .optional(),
      baseSalary: z
        .coerce
        .number()
        .min(0, 'Base salary cannot be negative')
        .nullable()
        .optional(),
      status: z
        .enum(['Active', 'Inactive', 'On Leave'], {
          errorMap: () => ({ message: 'status must be "Active", "Inactive", or "On Leave"' })
        })
        .optional(),
      dob: z
        .string()
        .trim()
        .max(30, 'Date of birth must not exceed 30 characters')
        .nullable()
        .optional(),
      gender: z
        .string()
        .trim()
        .max(20, 'Gender must not exceed 20 characters')
        .optional(),
      bloodGroup: z
        .string()
        .trim()
        .max(10, 'Blood group must not exceed 10 characters')
        .nullable()
        .optional(),
      maritalStatus: z
        .string()
        .trim()
        .max(30, 'Marital status must not exceed 30 characters')
        .nullable()
        .optional(),
      nationality: z
        .string()
        .trim()
        .max(50, 'Nationality must not exceed 50 characters')
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
      fatherGuardianName: z
        .string()
        .trim()
        .max(100, 'Father/Guardian name must not exceed 100 characters')
        .nullable()
        .optional(),
      languagesKnown: z
        .string()
        .trim()
        .max(200, 'Languages known must not exceed 200 characters')
        .nullable()
        .optional(),
      qualifications: z.record(z.unknown()).optional(),
      experience: z.record(z.unknown()).optional(),
      financial: z.record(z.unknown()).optional(),
      documents: z.record(z.unknown()).optional(),
      assignments: z
        .object({
          assignedSubjectIds: z.array(z.string().regex(REGEX.UUID, 'Invalid subject ID format')).optional(),
          subjectClassIds: z.array(z.string().regex(REGEX.UUID, 'Invalid class ID format')).optional()
        })
        .optional(),
      customData: z.record(z.unknown()).optional()
    })
    .refine(
      data => Object.keys(data).length > 0,
      'At least one field must be provided for update'
    )
};

export const assignStaffSchema = {
  params: z.object({
    id: z.string({ required_error: 'Staff ID is required' }).regex(REGEX.UUID, 'Invalid staff ID format')
  }),
  body: z.object({
    assignedClassId: z
      .string()
      .regex(REGEX.UUID, 'Invalid class ID format')
      .nullable()
      .optional(),
    assignedSubjectIds: z
      .array(z.string().regex(REGEX.UUID, 'Invalid subject ID format'))
      .optional(),
    subjectClassIds: z
      .array(z.string().regex(REGEX.UUID, 'Invalid class ID format'))
      .optional()
  })
};

export const updateStaffSelfSchema = {
  body: z
    .object({
      phone: z
        .string()
        .trim()
        .max(20, 'Phone number must not exceed 20 characters')
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
      dob: z
        .string()
        .trim()
        .max(30, 'Date of birth must not exceed 30 characters')
        .nullable()
        .optional(),
      gender: z
        .string()
        .trim()
        .max(20, 'Gender must not exceed 20 characters')
        .optional(),
      bloodGroup: z
        .string()
        .trim()
        .max(10, 'Blood group must not exceed 10 characters')
        .nullable()
        .optional(),
      maritalStatus: z
        .string()
        .trim()
        .max(30, 'Marital status must not exceed 30 characters')
        .nullable()
        .optional(),
      nationality: z
        .string()
        .trim()
        .max(50, 'Nationality must not exceed 50 characters')
        .nullable()
        .optional(),
      languagesKnown: z
        .string()
        .trim()
        .max(200, 'Languages known must not exceed 200 characters')
        .nullable()
        .optional(),
      qualifications: z.record(z.unknown()).optional(),
      experience: z.record(z.unknown()).optional(),
      documents: z.record(z.unknown()).optional(),
      customData: z.record(z.unknown()).optional()
    })
    .refine(
      data => Object.keys(data).length > 0,
      'At least one field must be provided for update'
    )
};
