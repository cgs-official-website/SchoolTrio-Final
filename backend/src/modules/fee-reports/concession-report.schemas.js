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

export const CONCESSION_REPORT_SORT_FIELDS = [
  'admissionNumber',
  'studentName',
  'className',
  'sectionName',
  'feeCategory',
  'concessionCategory',
  'concessionDate',
  'dueDate',
  'feeAmount',
  'amount'
];

// Used by both the list and the summary endpoint
export const concessionReportSchema = {
  query: z
    .object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(50),
      search: z.string().trim().max(100).optional(),
      classId: uuid('class ID').optional(),
      sectionId: uuid('section ID').optional(),
      studentId: uuid('student ID').optional(),
      feeCategoryId: uuid('fee category ID').optional(),
      concessionCategoryId: uuid('concession category ID').optional(),
      fromDate: dateField.optional(),
      toDate: dateField.optional(),
      dueFrom: dateField.optional(),
      dueTo: dateField.optional(),
      sortBy: z.enum(CONCESSION_REPORT_SORT_FIELDS).default('concessionDate'),
      order: z.enum(['asc', 'desc']).default('desc')
    })
    .refine((q) => !q.fromDate || !q.toDate || q.fromDate <= q.toDate, {
      message: 'Concession "from" date cannot be after the "to" date',
      path: ['fromDate']
    })
    .refine((q) => !q.dueFrom || !q.dueTo || q.dueFrom <= q.dueTo, {
      message: 'Due "from" date cannot be after the "to" date',
      path: ['dueFrom']
    })
};