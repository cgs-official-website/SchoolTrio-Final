import { z } from 'zod';
import { REGEX } from '../../config/constants.js';

/**
 * Invoice Validation Schemas (Phase 4C.6-B1)
 */

export const invoiceParamsSchema = {
  params: z.object({
    id: z
      .string({ required_error: 'Invoice ID is required' })
      .regex(REGEX.UUID, 'Invalid invoice ID format')
  })
};

export const listInvoicesSchema = {
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    classId: z.string().regex(REGEX.UUID, 'Invalid class ID format').optional(),
    studentId: z.string().regex(REGEX.UUID, 'Invalid student ID format').optional(),
    feeStructureId: z.string().regex(REGEX.UUID, 'Invalid fee structure ID format').optional(),
    collectionPeriodId: z.string().regex(REGEX.UUID, 'Invalid collection period ID format').optional(),
    status: z.enum(['Pending', 'Paid', 'Cancelled'], {
      errorMap: () => ({ message: "Status must be one of: 'Pending', 'Paid', 'Cancelled'" })
    }).optional(),
    overdue: z.preprocess((val) => {
      if (typeof val === 'string') {
        const lower = val.toLowerCase().trim();
        if (lower === 'true' || lower === '1') return true;
        if (lower === 'false' || lower === '0') return false;
      }
      return val;
    }, z.boolean({ invalid_type_error: 'Overdue filter must be a boolean value' }).optional()),
    search: z.string().trim().max(100, 'Search query exceeds 100 characters').optional(),
    order: z.enum(['asc', 'desc']).default('desc')
  })
};

export const invoiceStatsSchema = {
  query: z.object({
    classId: z.string().regex(REGEX.UUID, 'Invalid class ID format').optional(),
    studentId: z.string().regex(REGEX.UUID, 'Invalid student ID format').optional(),
    feeStructureId: z.string().regex(REGEX.UUID, 'Invalid fee structure ID format').optional(),
    collectionPeriodId: z.string().regex(REGEX.UUID, 'Invalid collection period ID format').optional()
  })
};

export const classWiseReportSchema = {
  query: z.object({
    collectionPeriodId: z.string().regex(REGEX.UUID, 'Invalid collection period ID format').optional()
  })
};

export const periodWiseReportSchema = {
  query: z.object({}).optional()
};

export const monthlyRevenueReportSchema = {
  query: z.object({
    months: z.coerce
      .number({ invalid_type_error: 'Months parameter must be an integer' })
      .int('Months parameter must be an integer')
      .min(1, 'Months must be at least 1')
      .max(24, 'Months cannot exceed 24')
      .default(7)
  })
};

export const studentInvoiceParamsSchema = {
  params: z.object({
    studentId: z
      .string({ required_error: 'Student ID is required' })
      .regex(REGEX.UUID, 'Invalid student ID format')
  }),
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    status: z.enum(['Pending', 'Paid', 'Cancelled'], {
      errorMap: () => ({ message: "Status must be one of: 'Pending', 'Paid', 'Cancelled'" })
    }).optional(),
    order: z.enum(['asc', 'desc']).default('desc')
  })
};

export const cancelInvoiceSchema = {
  params: z.object({
    id: z
      .string({ required_error: 'Invoice ID is required' })
      .regex(REGEX.UUID, 'Invalid invoice ID format')
  }),
  body: z.object({
    reason: z
      .string({ invalid_type_error: 'Reason must be a string' })
      .trim()
      .max(255, 'Cancellation reason exceeds 255 characters')
      .optional()
  }).optional().default({})
};

export const payInvoiceSchema = {
  params: z.object({
    id: z
      .string({ required_error: 'Invoice ID is required' })
      .regex(REGEX.UUID, 'Invalid invoice ID format')
  }),
  body: z.object({
    paymentMode: z
      .enum(['Cash', 'Online', 'Cheque', 'Bank Transfer', 'UPI', 'Card'], {
        errorMap: () => ({
          message: "Payment mode must be one of: 'Cash', 'Online', 'Cheque', 'Bank Transfer', 'UPI', 'Card'"
        })
      })
      .optional(),
    transactionReference: z
      .string({ invalid_type_error: 'Transaction reference must be a string' })
      .trim()
      .max(100, 'Transaction reference exceeds 100 characters')
      .optional(),
    receiptNumber: z
      .string({ invalid_type_error: 'Receipt number must be a string' })
      .trim()
      .max(100, 'Receipt number exceeds 100 characters')
      .optional(),
    paidAt: z
      .string({ invalid_type_error: 'Paid at must be a valid ISO datetime string' })
      .datetime({ message: 'Paid at must be a valid ISO datetime string' })
      .optional(),
    amount: z
      .coerce.number({ invalid_type_error: 'Amount must be a numeric value' })
      .positive('Amount must be greater than zero')
      .optional()
  }).optional().default({})
};


