import { z } from 'zod';
import { REGEX } from '../../config/constants.js';

/**
 * Leave Request Validation Schemas using Zod
 * Formatted as { body, query, params } objects for validate middleware compatibility.
 */

export const listStudentLeavesSchema = {
  params: z.object({
    studentId: z.string({ required_error: 'Student ID is required' }).regex(REGEX.UUID, 'Invalid student ID format')
  }),
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(500).default(50),
    status: z.enum(['Pending', 'Approved', 'Rejected', 'all']).optional(),
    order: z.enum(['asc', 'desc']).default('desc')
  })
};

export const createStudentLeaveSchema = {
  params: z.object({
    studentId: z.string({ required_error: 'Student ID is required' }).regex(REGEX.UUID, 'Invalid student ID format')
  }),
  body: z.object({
    leaveType: z
      .string({ required_error: 'Leave type is required' })
      .trim()
      .min(1, 'Leave type cannot be empty')
      .max(50, 'Leave type cannot exceed 50 characters'),
    startDate: z
      .string({ required_error: 'Start date is required' })
      .regex(REGEX.DATE_ISO, 'Start date must be formatted as YYYY-MM-DD'),
    endDate: z
      .string({ required_error: 'End date is required' })
      .regex(REGEX.DATE_ISO, 'End date must be formatted as YYYY-MM-DD'),
    reason: z
      .string({ required_error: 'Reason is required' })
      .trim()
      .min(1, 'Reason cannot be empty')
      .max(2000, 'Reason cannot exceed 2000 characters'),
    supportingDoc: z
      .object({
        name: z.string().trim().max(255).optional(),
        size: z.string().trim().max(50).optional(),
        url: z.string().url('Supporting document URL must be a valid URL')
      })
      .nullable()
      .optional()
  }).refine((data) => data.startDate <= data.endDate, {
    message: 'Start date cannot be after end date',
    path: ['endDate']
  })
};

export const listLeavesSchema = {
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(500).default(50),
    status: z.enum(['Pending', 'Approved', 'Rejected', 'all']).optional(),
    applicantRole: z.enum(['student', 'teacher', 'staff', 'all']).optional(),
    search: z.string().max(100).optional(),
    order: z.enum(['asc', 'desc']).default('desc')
  })
};

export const getLeaveSchema = {
  params: z.object({
    id: z.string({ required_error: 'Leave ID is required' }).regex(REGEX.UUID, 'Invalid leave ID format')
  })
};

export const updateLeaveStatusSchema = {
  params: z.object({
    id: z.string({ required_error: 'Leave ID is required' }).regex(REGEX.UUID, 'Invalid leave ID format')
  }),
  body: z.object({
    status: z.enum(['Approved', 'Rejected'], {
      required_error: 'Status is required and must be either Approved or Rejected'
    })
  })
};

export const deleteLeaveSchema = {
  params: z.object({
    id: z.string({ required_error: 'Leave ID is required' }).regex(REGEX.UUID, 'Invalid leave ID format')
  })
};

export const listStaffLeavesSchema = {
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(500).default(50),
    status: z.enum(['Pending', 'Approved', 'Rejected', 'all']).optional(),
    order: z.enum(['asc', 'desc']).default('desc')
  })
};

export const createStaffLeaveSchema = {
  body: z.object({
    leaveType: z
      .string({ required_error: 'Leave type is required' })
      .trim()
      .min(1, 'Leave type cannot be empty')
      .max(50, 'Leave type cannot exceed 50 characters'),
    startDate: z
      .string({ required_error: 'Start date is required' })
      .regex(REGEX.DATE_ISO, 'Start date must be formatted as YYYY-MM-DD'),
    endDate: z
      .string({ required_error: 'End date is required' })
      .regex(REGEX.DATE_ISO, 'End date must be formatted as YYYY-MM-DD'),
    reason: z
      .string({ required_error: 'Reason is required' })
      .trim()
      .min(1, 'Reason cannot be empty')
      .max(2000, 'Reason cannot exceed 2000 characters'),
    supportingDoc: z
      .object({
        name: z.string().trim().max(255).optional(),
        size: z.string().trim().max(50).optional(),
        url: z.string().url('Supporting document URL must be a valid URL')
      })
      .nullable()
      .optional()
  }).refine((data) => data.startDate <= data.endDate, {
    message: 'Start date cannot be after end date',
    path: ['endDate']
  })
};

// ============================================================
// LEAVE APPROVAL RULE SCHEMAS
// ============================================================

export const createLeaveApprovalRuleSchema = {
  body: z
    .object({
      minDays: z.coerce
        .number({ required_error: 'minDays is required' })
        .int('minDays must be an integer')
        .min(1, 'minDays must be at least 1'),
      maxDays: z.coerce
        .number()
        .int('maxDays must be an integer')
        .min(1, 'maxDays must be at least 1')
        .nullable()
        .optional(),
      roleId: z
        .string({ required_error: 'roleId is required' })
        .regex(REGEX.UUID, 'roleId must be a valid UUID'),
      order: z.coerce
        .number()
        .int('order must be an integer')
        .min(1, 'order must be at least 1')
        .optional()
        .default(1)
    })
    .refine(
      (data) => data.maxDays === null || data.maxDays === undefined || data.maxDays >= data.minDays,
      {
        message: 'maxDays cannot be less than minDays',
        path: ['maxDays']
      }
    )
};

export const updateLeaveApprovalRuleSchema = {
  params: z.object({
    id: z.string({ required_error: 'Rule ID is required' }).regex(REGEX.UUID, 'Invalid rule ID format')
  }),
  body: z
    .object({
      minDays: z.coerce
        .number()
        .int('minDays must be an integer')
        .min(1, 'minDays must be at least 1')
        .optional(),
      maxDays: z.coerce
        .number()
        .int('maxDays must be an integer')
        .min(1, 'maxDays must be at least 1')
        .nullable()
        .optional(),
      roleId: z
        .string()
        .regex(REGEX.UUID, 'roleId must be a valid UUID')
        .optional(),
      order: z.coerce
        .number()
        .int('order must be an integer')
        .min(1, 'order must be at least 1')
        .optional()
    })
    .refine(
      (data) => {
        if (data.minDays !== undefined && data.maxDays !== undefined && data.maxDays !== null) {
          return data.maxDays >= data.minDays;
        }
        return true;
      },
      {
        message: 'maxDays cannot be less than minDays',
        path: ['maxDays']
      }
    )
};

export const deleteLeaveApprovalRuleSchema = {
  params: z.object({
    id: z.string({ required_error: 'Rule ID is required' }).regex(REGEX.UUID, 'Invalid rule ID format')
  })
};

