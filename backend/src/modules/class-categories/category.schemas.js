import { z } from 'zod';
import { REGEX } from '../../config/constants.js';

/**
 * Zod validation schemas for Class Categories REST API endpoints.
 */

export const createCategorySchema = {
  body: z.object({
    name: z
      .string({ required_error: 'Category name is required' })
      .trim()
      .min(1, 'Category name is required')
      .max(100, 'Category name must not exceed 100 characters'),
    displayOrder: z
      .number()
      .int('Display order must be an integer')
      .min(0, 'Display order cannot be negative')
      .optional()
      .default(0)
  })
};

export const categoryParamsSchema = {
  params: z.object({
    id: z.string({ required_error: 'Category ID is required' }).regex(REGEX.UUID, 'Invalid category ID format')
  })
};
