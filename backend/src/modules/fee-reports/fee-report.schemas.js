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

export const DAILY_COLLECTION_SORT_FIELDS = [
  'admissionNumber',
  'studentName',
  'className',
  'sectionName',
  'feeCategory',
  'receiptNumber',
  'paymentMode',
  'feeMonth',
  'dueDate',
  'feeAmount',
  'paidAt'
];

export const dayReportSchema = {
  query: z.object({
    date: dateField.optional()
  })
};

export const ledgerSchema = {
  params: z.object({
    studentId: uuid('student ID')
  }),
  query: z.object({
    asOn: dateField.optional()
  })
};

// Used by both the list and the summary endpoint
export const dailyCollectionSchema = {
  query: z.object({
    date: dateField.optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    search: z.string().trim().max(100).optional(),
    classId: uuid('class ID').optional(),
    sectionId: uuid('section ID').optional(),
    studentId: uuid('student ID').optional(),
    feeCategoryId: uuid('fee category ID').optional(),
    paymentMode: z.string().trim().max(50).optional(),
    sortBy: z.enum(DAILY_COLLECTION_SORT_FIELDS).default('paidAt'),
    order: z.enum(['asc', 'desc']).default('desc')
  })
};