import { z } from 'zod';
import { REGEX } from '../../config/constants.js';

export const FEE_DELETION_SORT_FIELDS = [
  'admissionNumber',
  'studentName',
  'className',
  'sectionName',
  'feeCategory',
  'dueDate',
  'amount',
  'createdAt'
];

const uuid = (label) => z.string({ required_error: `${label} is required` }).regex(REGEX.UUID, `Invalid ${label} format`);

export const studentFeesSchema = {
  query: z.object({ studentId: uuid('student ID') })
};

export const createFeeDeletionSchema = {
  body: z
    .object({
      studentId: uuid('student ID'),
      invoiceIds: z.array(uuid('fee ID')).min(1, 'Select at least one fee').max(100, 'Too many fees selected'),
      reason: z
        .string({ required_error: 'Reason is required' })
        .trim()
        .min(3, 'Enter the reason for deleting')
        .max(500, 'Reason is too long')
    })
    .transform((data) => ({ ...data, invoiceIds: [...new Set(data.invoiceIds)] }))
};

export const listFeeDeletionsSchema = {
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    search: z.string().trim().max(100).optional(),
    classId: uuid('class ID').optional(),
    sectionId: uuid('section ID').optional(),
    studentId: uuid('student ID').optional(),
    sortBy: z.enum(FEE_DELETION_SORT_FIELDS).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('desc')
  })
};