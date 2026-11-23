import { z } from 'zod';
import { REGEX } from '../../config/constants.js';
import { decimalAmountSchema } from '../fees/fee.schemas.js';

export const VALUE_TYPES = ['PERCENTAGE', 'RUPEES'];
export const FEE_CONCESSION_SORT_FIELDS = [
  'admissionNumber',
  'studentName',
  'className',
  'sectionName',
  'feeCategory',
  'amount',
  'concessionType',
  'concessionCategory',
  'createdAt'
];

const uuid = (label) => z.string({ required_error: `${label} is required` }).regex(REGEX.UUID, `Invalid ${label} format`);

export const concessionParamsSchema = {
  params: z.object({ id: uuid('concession ID') })
};

export const studentFeesSchema = {
  query: z.object({ studentId: uuid('student ID') })
};

export const createFeeConcessionSchema = {
  body: z
    .object({
      studentId: uuid('student ID'),
      invoiceIds: z.array(uuid('fee ID')).min(1, 'Select at least one fee').max(100, 'Too many fees selected'),
      valueType: z.enum(VALUE_TYPES, {
        errorMap: () => ({ message: 'Type must be Percentage or Rupees' })
      }),
      value: decimalAmountSchema,
      concessionCategoryId: uuid('concession category ID'),
      description: z.string().trim().max(500, 'Description is too long').optional()
    })
    .superRefine((data, ctx) => {
      if (data.valueType === 'PERCENTAGE' && Number(data.value) > 100) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['value'],
          message: 'Percentage cannot be more than 100'
        });
      }
    })
    .transform((data) => ({
      ...data,
      invoiceIds: [...new Set(data.invoiceIds)],
      description: data.description || null
    }))
};

export const listFeeConcessionsSchema = {
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    search: z.string().trim().max(100).optional(),
    classId: uuid('class ID').optional(),
    sectionId: uuid('section ID').optional(),
    studentId: uuid('student ID').optional(),
    feeCategoryId: uuid('fee category ID').optional(),
    concessionCategoryId: uuid('concession category ID').optional(),
    sortBy: z.enum(FEE_CONCESSION_SORT_FIELDS).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('desc')
  })
};