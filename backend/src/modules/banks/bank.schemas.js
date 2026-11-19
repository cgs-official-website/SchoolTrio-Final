import { z } from 'zod';
import { REGEX } from '../../config/constants.js';

export const BANK_SORT_FIELDS = ['name', 'code', 'isDefault', 'createdAt'];

const idParam = z
  .string({ required_error: 'Bank ID is required' })
  .regex(REGEX.UUID, 'Invalid bank ID format');

const nameField = z
  .string({ required_error: 'Bank name is required' })
  .trim()
  .min(1, 'Bank name is required')
  .max(150, 'Bank name must not exceed 150 characters');

const codeField = z
  .string({ invalid_type_error: 'Bank code must be text' })
  .trim()
  .max(50, 'Bank code must not exceed 50 characters')
  .nullable()
  .optional()
  .transform((v) => (v === undefined ? undefined : v || null));

const isDefaultField = z.boolean({ invalid_type_error: 'isDefault must be true or false' });

export const bankParamsSchema = {
  params: z.object({ id: idParam })
};

export const createBankSchema = {
  body: z.object({
    name: nameField,
    code: codeField,
    isDefault: isDefaultField.default(false)
  })
};

export const updateBankSchema = {
  params: z.object({ id: idParam }),
  body: z
    .object({
      name: nameField.optional(),
      code: codeField,
      isDefault: isDefaultField.optional()
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field must be provided for update'
    })
};

export const listBanksSchema = {
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    search: z.string().trim().optional(),
    sortBy: z.enum(BANK_SORT_FIELDS).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('asc')
  })
};