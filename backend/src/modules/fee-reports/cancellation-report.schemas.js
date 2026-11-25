import { z } from 'zod';
import { REGEX } from '../../config/constants.js';

const isRealDate = (value) => {
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
};

const dateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
  .refine(isRealDate, 'Enter a valid date');

const uuid = (label) => z.string({ required_error: `${label} is required` }).regex(REGEX.UUID, `Invalid ${label} format`);

export const CATEGORY_CANCELLATION_SORT_FIELDS = [
  'admissionNumber',
  'studentName',
  'className',
  'receiptNumber',
  'paidAt',
  'cancelDate',
  'feeCategory',
  'amount'
];

export const INVOICE_CANCELLATION_SORT_FIELDS = [
  'admissionNumber',
  'studentName',
  'className',
  'receiptNumber',
  'paymentMode',
  'cancelDate',
  'paidAt',
  'amount'
];

const build = (sortFields) => ({
  query: z
    .object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(50),
      search: z.string().trim().max(100).optional(),
      classId: uuid('class ID').optional(),
      sectionId: uuid('section ID').optional(),
      studentId: uuid('student ID').optional(),
      feeCategoryId: uuid('fee category ID').optional(),
      paymentMode: z.string().trim().max(50).optional(),
      fromDate: dateField.optional(),
      toDate: dateField.optional(),
      sortBy: z.enum(sortFields).default('cancelDate'),
      order: z.enum(['asc', 'desc']).default('desc')
    })
    .refine((q) => !q.fromDate || !q.toDate || q.fromDate <= q.toDate, {
      message: 'The "from" date cannot be after the "to" date',
      path: ['fromDate']
    })
});

export const categoryCancellationSchema = build(CATEGORY_CANCELLATION_SORT_FIELDS);
export const invoiceCancellationSchema = build(INVOICE_CANCELLATION_SORT_FIELDS);