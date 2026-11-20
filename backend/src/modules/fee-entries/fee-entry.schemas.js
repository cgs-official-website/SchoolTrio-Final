import { z } from 'zod';
import { REGEX } from '../../config/constants.js';
import { calendarDateSchema, decimalAmountSchema } from '../fees/fee.schemas.js';

export const FEE_TYPES = ['ALL_STUDENT', 'CLASS', 'SECTION', 'STUDENT'];
export const GENDERS = ['Male', 'Female'];
export const FEE_ENTRY_SORT_FIELDS = [
  'studentName',
  'className',
  'sectionName',
  'gender',
  'amount',
  'feeCategory',
  'feeType',
  'dueDate',
  'createdAt'
];

const uuid = (label) => z.string({ required_error: `${label} is required` }).regex(REGEX.UUID, `Invalid ${label} format`);

const genderField = z
  .enum(GENDERS, { errorMap: () => ({ message: 'Gender must be Male or Female' }) })
  .nullable()
  .optional();

export const feeEntryParamsSchema = {
  params: z.object({ id: uuid('fee entry ID') })
};

export const createFeeEntrySchema = {
  body: z
    .object({
      feeType: z.enum(FEE_TYPES, {
        errorMap: () => ({ message: 'Fee type must be All Student, Class, Section or Student' })
      }),
      targetIds: z.array(uuid('target ID')).max(1000, 'Too many selections').default([]),
      feeCategoryId: uuid('fee category ID'),
      gender: genderField,
      amount: decimalAmountSchema,
      dueDate: calendarDateSchema
    })
    .superRefine((data, ctx) => {
      const count = new Set(data.targetIds).size;
      if (data.feeType !== 'ALL_STUDENT' && count === 0) {
        const what = { CLASS: 'class', SECTION: 'class section', STUDENT: 'student' }[data.feeType];
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['targetIds'],
          message: `Select at least one ${what}`
        });
      }
    })
    .transform((data) => ({
      ...data,
      // All Student has no targets; duplicates are dropped
      targetIds: data.feeType === 'ALL_STUDENT' ? [] : [...new Set(data.targetIds)],
      // A chosen student already has a gender, so the filter does not apply
      gender: data.feeType === 'STUDENT' ? null : data.gender ?? null
    }))
};

export const updateFeeEntrySchema = {
  params: z.object({ id: uuid('fee entry ID') }),
  body: z
    .object({
      amount: decimalAmountSchema.optional(),
      dueDate: calendarDateSchema.optional()
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'Provide an amount or a due date to update'
    })
};

export const listFeeEntriesSchema = {
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    search: z.string().trim().max(100).optional(),
    classId: uuid('class ID').optional(),
    sectionId: uuid('section ID').optional(),
    studentId: uuid('student ID').optional(),
    feeCategoryId: uuid('fee category ID').optional(),
    gender: z.enum(GENDERS).optional(),
    feeType: z.enum(FEE_TYPES).optional(),
    sortBy: z.enum(FEE_ENTRY_SORT_FIELDS).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('desc')
  })
};