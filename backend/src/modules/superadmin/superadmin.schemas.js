import { z } from 'zod';
import { REGEX } from '../../config/constants.js';

/**
 * Zod validation schemas for SuperAdmin Platform REST API endpoints.
 */

const TENANT_STATUSES = ['approved', 'pending', 'suspended', 'rejected'];

export const listTenantsQuerySchema = {
  query: z.object({
    status: z.enum([...TENANT_STATUSES, 'all']).optional(),
    planId: z.string().regex(REGEX.UUID, 'Invalid plan ID format').optional(),
    search: z.string().trim().max(100).optional(),
    sort: z.enum(['name', 'createdAt', 'updatedAt', 'status', 'code']).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
    page: z.coerce.number().int().min(1, 'Page must be at least 1').optional(),
    limit: z.coerce.number().int().min(1, 'Limit must be at least 1').max(100, 'Limit cannot exceed 100').optional()
  })
};

export const tenantParamsSchema = {
  params: z.object({
    id: z.string({ required_error: 'Tenant ID is required' }).regex(REGEX.UUID, 'Invalid tenant ID format')
  })
};

export const createTenantSchema = {
  body: z.object({
    name: z
      .string({ required_error: 'School name is required' })
      .trim()
      .min(1, 'School name cannot be empty')
      .max(255, 'School name cannot exceed 255 characters'),
    code: z
      .string({ required_error: 'School code is required' })
      .trim()
      .min(2, 'School code must be at least 2 characters')
      .max(50, 'School code cannot exceed 50 characters')
      .transform(val => val.toUpperCase()),
    email: z
      .string({ required_error: 'School email is required' })
      .trim()
      .email('Invalid school email address'),
    phone: z.string().trim().max(20, 'Phone number cannot exceed 20 characters').optional().default(''),
    address: z.string().trim().max(1000, 'Address cannot exceed 1000 characters').optional().default(''),
    type: z.string().trim().max(50).optional().default('K12'),
    planId: z.string().regex(REGEX.UUID, 'Invalid plan ID format').optional(),
    seatLimit: z.number().int().min(1, 'Seat limit must be at least 1').max(100000).optional().default(500),
    teacherLimit: z.number().int().min(1, 'Teacher limit must be at least 1').max(10000).optional().default(50),
    adminEmail: z
      .string({ required_error: 'Admin email is required' })
      .trim()
      .email('Invalid admin email address'),
    adminPassword: z
      .string({ required_error: 'Admin password is required' })
      .min(8, 'Admin password must be at least 8 characters')
      .max(128, 'Admin password cannot exceed 128 characters'),
    adminName: z.string().trim().max(100).optional().default('School Administrator')
  })
};

export const updateTenantStatusSchema = {
  params: z.object({
    id: z.string({ required_error: 'Tenant ID is required' }).regex(REGEX.UUID, 'Invalid tenant ID format')
  }),
  body: z.object({
    status: z.enum(TENANT_STATUSES, {
      errorMap: () => ({ message: `Status must be one of: ${TENANT_STATUSES.join(', ')}` })
    }),
    reason: z.string().trim().max(500, 'Reason cannot exceed 500 characters').optional()
  })
};

export const updateTenantConfigSchema = {
  params: z.object({
    id: z.string({ required_error: 'Tenant ID is required' }).regex(REGEX.UUID, 'Invalid tenant ID format')
  }),
  body: z.object({
    seatLimit: z.number().int().min(1, 'Seat limit must be at least 1').max(100000).optional(),
    teacherLimit: z.number().int().min(1, 'Teacher limit must be at least 1').max(10000).optional(),
    planId: z.string().regex(REGEX.UUID, 'Invalid plan ID format').optional(),
    modules: z.record(z.boolean()).optional()
  })
};

export const listPlansQuerySchema = {
  query: z.object({
    isActive: z.enum(['true', 'false', 'all']).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional()
  })
};

export const planParamsSchema = {
  params: z.object({
    id: z.string({ required_error: 'Plan ID is required' }).regex(REGEX.UUID, 'Invalid plan ID format')
  })
};

export const createPlanSchema = {
  body: z.object({
    name: z
      .string({ required_error: 'Plan name is required' })
      .trim()
      .min(1, 'Plan name cannot be empty')
      .max(100, 'Plan name cannot exceed 100 characters'),
    userLimit: z
      .number({ required_error: 'User limit is required' })
      .int('User limit must be an integer')
      .min(1, 'User limit must be at least 1')
      .max(100000, 'User limit cannot exceed 100000'),
    pricePerUserPerYear: z
      .number({ required_error: 'Price per user per year is required' })
      .min(0, 'Price cannot be negative')
      .max(1000000, 'Price cannot exceed 1000000'),
    cloudStorageGB: z
      .number()
      .int('Storage must be an integer')
      .min(0, 'Storage cannot be negative')
      .max(10000, 'Storage cannot exceed 10000 GB')
      .optional()
      .default(5),
    modules: z.any().optional(),
    isActive: z.boolean().optional().default(true)
  })
};

export const updatePlanSchema = {
  params: z.object({
    id: z.string({ required_error: 'Plan ID is required' }).regex(REGEX.UUID, 'Invalid plan ID format')
  }),
  body: z.object({
    name: z.string().trim().min(1).max(100).optional(),
    userLimit: z.number().int().min(1).max(100000).optional(),
    pricePerUserPerYear: z.number().min(0).max(1000000).optional(),
    cloudStorageGB: z.number().int().min(0).max(10000).optional(),
    modules: z.any().optional(),
    isActive: z.boolean().optional()
  })
};

export const listSubscriptionsQuerySchema = {
  query: z.object({
    status: z.enum([...TENANT_STATUSES, 'all']).optional(),
    planId: z.string().regex(REGEX.UUID, 'Invalid plan ID format').optional(),
    search: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional()
  })
};

export const licenseUsageQuerySchema = {
  query: z.object({
    search: z.string().trim().max(100).optional(),
    status: z.enum(['healthy', 'warning', 'exceeded', 'all']).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional()
  })
};
