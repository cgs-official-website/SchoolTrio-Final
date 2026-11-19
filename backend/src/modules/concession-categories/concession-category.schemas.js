import { z } from 'zod';
import { REGEX } from '../../config/constants.js';

export const CONCESSION_SORT_FIELDS = ['name', 'createdAt'];

const idParam = z
  .string({ required_error: 'Concession category ID is required' })
  .regex(REGEX.UUID, 'Invalid concession category ID format');

const nameField = z
  .string({ required_error: 'Concession name is required' })
  .trim()
  .min(1, 'Concession name is required')
  .max(150, 'Concession name must not exceed 150 characters');

export const concessionCategoryParamsSchema = {
  params: z.object({ id: idParam })
};

export const createConcessionCategorySchema = {
  body: z.object({
    name: nameField
  })
};

export const updateConcessionCategorySchema = {
  params: z.object({ id: idParam }),
  body: z
    .object({
      name: nameField.optional()
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field must be provided for update'
    })
};

export const listConcessionCategoriesSchema = {
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    search: z.string().trim().optional(),
    sortBy: z.enum(CONCESSION_SORT_FIELDS).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('asc')
  })
};