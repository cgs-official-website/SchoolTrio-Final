import { z } from 'zod';
import { REGEX } from '../../config/constants.js';

export const FEE_CANCELLATION_SORT_FIELDS = [
  'admissionNumber',
  'studentName',
  'className',
  'sectionName',
  'feeCategory',
  'receiptNumber',
  'paymentMode',
  'amount',
  'createdAt'
];

const uuid = (label) => z.string({ required_error: `${label} is required` }).regex(REGEX.UUID, `Invalid ${label} format`);

export const studentPaymentsSchema = {
  query: z.object({ studentId: uuid('student ID') })
};

export const createFeeCancellationSchema = {
  body: z.object({
    invoiceId: uuid('fee ID'),
    description: z
      .string({ required_error: 'Reason is required' })
      .trim()
      .min(3, 'Enter the reason for cancelling')
      .max(500, 'Reason is too long')
  })
};

export const listFeeCancellationsSchema = {
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    search: z.string().trim().max(100).optional(),
    classId: uuid('class ID').optional(),
    sectionId: uuid('section ID').optional(),
    studentId: uuid('student ID').optional(),
    sortBy: z.enum(FEE_CANCELLATION_SORT_FIELDS).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('desc')
  })
};