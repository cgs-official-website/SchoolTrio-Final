import { z } from 'zod';
import { REGEX } from '../../config/constants.js';

/**
 * Validates ISO calendar date in YYYY-MM-DD format with real calendar validation
 */
export const calendarDateSchema = z
  .string({ required_error: 'Due date is required' })
  .trim()
  .regex(REGEX.DATE_ISO, 'Date must be in YYYY-MM-DD format')
  .refine(val => {
    const [year, month, day] = val.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  }, {
    message: 'Due date must be a valid calendar date'
  });

/**
 * Validates financial decimal amounts compatible with PostgreSQL Decimal(10,2):
 * - Finite positive number > 0
 * - Maximum value: 99,999,999.99
 * - At most 2 decimal places
 * - Rejects NaN, Infinity, -Infinity, negative numbers
 */
export const decimalAmountSchema = z
  .union([
    z.number({ invalid_type_error: 'Amount must be a numeric value' }),
    z.string({ invalid_type_error: 'Amount must be a numeric value or numeric string' })
      .trim()
      .regex(/^\d+(\.\d{1,2})?$/, 'Amount must be a valid positive number with at most 2 decimal places')
      .transform(val => {
        const num = Number(val);
        if (!Number.isFinite(num) || Number.isNaN(num)) {
          throw new Error('Amount must be a finite number');
        }
        return num;
      })
  ])
  .refine(val => typeof val === 'number' && Number.isFinite(val) && !Number.isNaN(val), {
    message: 'Amount must be a valid finite number'
  })
  .refine(val => val > 0, {
    message: 'Amount must be greater than zero'
  })
  .refine(val => val <= 99999999.99, {
    message: 'Amount exceeds maximum allowed value of 99,999,999.99'
  })
  .refine(val => {
    const str = val.toString();
    if (!str.includes('.')) return true;
    const decimals = str.split('.')[1];
    return decimals.length <= 2;
  }, {
    message: 'Amount cannot have more than 2 decimal places'
  });

// ============================================================
// FEE COLLECTION PERIOD SCHEMAS
// ============================================================

export const feePeriodParamsSchema = {
  params: z.object({
    id: z
      .string({ required_error: 'Fee collection period ID is required' })
      .regex(REGEX.UUID, 'Invalid fee collection period ID format')
  })
};

export const createFeeCollectionPeriodSchema = {
  body: z.object({
    name: z
      .string({ required_error: 'Period name is required' })
      .trim()
      .min(1, 'Period name is required')
      .max(100, 'Period name must not exceed 100 characters'),
    dueDate: calendarDateSchema,
    displayOrder: z
      .number({ invalid_type_error: 'displayOrder must be an integer' })
      .int('displayOrder must be an integer')
      .min(0, 'displayOrder cannot be negative')
      .max(100000, 'displayOrder exceeds maximum limit')
      .default(0)
  })
};

export const updateFeeCollectionPeriodSchema = {
  params: z.object({
    id: z
      .string({ required_error: 'Fee collection period ID is required' })
      .regex(REGEX.UUID, 'Invalid fee collection period ID format')
  }),
  body: z
    .object({
      name: z
        .string()
        .trim()
        .min(1, 'Period name cannot be empty')
        .max(100, 'Period name must not exceed 100 characters')
        .optional(),
      dueDate: calendarDateSchema.optional(),
      displayOrder: z
        .number({ invalid_type_error: 'displayOrder must be an integer' })
        .int('displayOrder must be an integer')
        .min(0, 'displayOrder cannot be negative')
        .max(100000, 'displayOrder exceeds maximum limit')
        .optional()
    })
    .refine(data => Object.keys(data).length > 0, {
      message: 'At least one field (name, dueDate, or displayOrder) must be provided for update'
    })
};

export const listFeeCollectionPeriodsSchema = {
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    order: z.enum(['asc', 'desc']).default('asc'),
    search: z.string().trim().optional()
  })
};

// ============================================================
// FEE STRUCTURE SCHEMAS
// ============================================================

export const feeStructureParamsSchema = {
  params: z.object({
    id: z
      .string({ required_error: 'Fee structure ID is required' })
      .regex(REGEX.UUID, 'Invalid fee structure ID format')
  })
};

export const createFeeStructureSchema = {
  body: z.object({
    name: z
      .string({ required_error: 'Fee structure name is required' })
      .trim()
      .min(1, 'Fee structure name is required')
      .max(150, 'Fee structure name must not exceed 150 characters'),
    amount: decimalAmountSchema,
    dueDate: calendarDateSchema,
    classId: z
      .string({ required_error: 'classId is required' })
      .regex(REGEX.UUID, 'Invalid class ID format'),
    collectionPeriodId: z
      .string()
      .regex(REGEX.UUID, 'Invalid collection period ID format')
      .nullable()
      .optional(),
    customData: z.record(z.any()).nullable().optional()
  })
};

export const updateFeeStructureSchema = {
  params: z.object({
    id: z
      .string({ required_error: 'Fee structure ID is required' })
      .regex(REGEX.UUID, 'Invalid fee structure ID format')
  }),
  body: z
    .object({
      name: z
        .string()
        .trim()
        .min(1, 'Fee structure name cannot be empty')
        .max(150, 'Fee structure name must not exceed 150 characters')
        .optional(),
      amount: decimalAmountSchema.optional(),
      dueDate: calendarDateSchema.optional(),
      classId: z
        .string()
        .regex(REGEX.UUID, 'Invalid class ID format')
        .optional(),
      collectionPeriodId: z
        .string()
        .regex(REGEX.UUID, 'Invalid collection period ID format')
        .nullable()
        .optional(),
      customData: z.record(z.any()).nullable().optional()
    })
    .refine(data => Object.keys(data).length > 0, {
      message: 'At least one field must be provided for update'
    })
};

export const listFeeStructuresSchema = {
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    classId: z.string().regex(REGEX.UUID, 'Invalid class ID format').optional(),
    collectionPeriodId: z.string().regex(REGEX.UUID, 'Invalid collection period ID format').optional(),
    order: z.enum(['asc', 'desc']).default('desc'),
    search: z.string().trim().optional()
  })
};
