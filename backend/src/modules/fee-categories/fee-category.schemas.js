import { z } from 'zod';
import { REGEX } from '../../config/constants.js';

export const FEE_CATEGORY_TYPES = ['Normal', 'Late', 'Bus'];
export const FEE_CATEGORY_SORT_FIELDS = ['name', 'categoryType', 'paymentOrder', 'shortCode', 'createdAt'];

const idParam = z
  .string({ required_error: 'Fee category ID is required' })
  .regex(REGEX.UUID, 'Invalid fee category ID format');

const nameField = z
  .string({ required_error: 'Category name is required' })
  .trim()
  .min(1, 'Category name is required')
  .max(150, 'Category name must not exceed 150 characters');

const categoryTypeField = z
  .string({ invalid_type_error: 'Category type must be text' })
  .trim()
  .min(1, 'Category type is required')
  .max(50, 'Category type must not exceed 50 characters');

const paymentOrderField = z
  .number({ invalid_type_error: 'Payment order must be an integer' })
  .int('Payment order must be an integer')
  .min(0, 'Payment order cannot be negative')
  .max(100000, 'Payment order exceeds maximum limit');

const shortCodeField = z
  .string({ invalid_type_error: 'Short code must be text' })
  .trim()
  .max(30, 'Short code must not exceed 30 characters')
  .nullable()
  .optional()
  .transform((v) => (v === undefined ? undefined : v || null));

export const feeCategoryParamsSchema = {
  params: z.object({ id: idParam })
};

export const createFeeCategorySchema = {
  body: z.object({
    name: nameField,
    categoryType: categoryTypeField.default('Normal'),
    paymentOrder: paymentOrderField.default(0),
    shortCode: shortCodeField
  })
};

export const updateFeeCategorySchema = {
  params: z.object({ id: idParam }),
  body: z
    .object({
      name: nameField.optional(),
      categoryType: categoryTypeField.optional(),
      paymentOrder: paymentOrderField.optional(),
      shortCode: shortCodeField
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field must be provided for update'
    })
};

export const listFeeCategoriesSchema = {
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    search: z.string().trim().optional(),
    categoryType: z.string().trim().max(50).optional(),
    sortBy: z.enum(FEE_CATEGORY_SORT_FIELDS).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('asc')
  })
};