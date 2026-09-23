import { z } from 'zod';
import { REGEX } from '../../config/constants.js';

/**
 * Zod validation schemas for RBAC REST API endpoints.
 */

/**
 * Schema for POST /api/v1/rbac/roles
 */
export const createRoleSchema = {
  body: z.object({
    name: z
      .string({ required_error: 'Role name is required' })
      .trim()
      .min(1, 'Role name is required')
      .max(100, 'Role name must not exceed 100 characters'),
    loginPanel: z
      .enum(['admin', 'teacher'], {
        errorMap: () => ({ message: 'loginPanel must be either admin or teacher' })
      })
      .optional()
      .default('admin'),
    slug: z
      .string()
      .trim()
      .min(1, 'Slug must not be empty')
      .max(100, 'Slug must not exceed 100 characters')
      .regex(REGEX.SLUG, 'Slug must contain only lowercase letters, numbers, and hyphens')
      .optional(),
    permissions: z
      .union([
        z.record(
          z.string(),
          z.object({
            canRead: z.boolean().optional(),
            canCreate: z.boolean().optional(),
            canEdit: z.boolean().optional(),
            canDelete: z.boolean().optional(),
            read: z.boolean().optional(),
            create: z.boolean().optional(),
            edit: z.boolean().optional(),
            delete: z.boolean().optional()
          })
        ),
        z.array(
          z.object({
            moduleKey: z.string().min(1, 'Module key is required').max(100),
            canRead: z.boolean().optional(),
            canCreate: z.boolean().optional(),
            canEdit: z.boolean().optional(),
            canDelete: z.boolean().optional(),
            read: z.boolean().optional(),
            create: z.boolean().optional(),
            edit: z.boolean().optional(),
            delete: z.boolean().optional()
          })
        )
      ])
      .optional()
  })
};

/**
 * Schema for PATCH /api/v1/rbac/roles/:roleId
 */
export const updateRoleSchema = {
  params: z.object({
    roleId: z
      .string({ required_error: 'Role ID is required' })
      .regex(REGEX.UUID, 'Invalid role ID format')
  }),
  body: z
    .object({
      name: z
        .string()
        .trim()
        .min(1, 'Role name cannot be empty')
        .max(100, 'Role name must not exceed 100 characters')
        .optional(),
      loginPanel: z
        .enum(['admin', 'teacher'], {
          errorMap: () => ({ message: 'loginPanel must be either admin or teacher' })
        })
        .optional(),
      slug: z
        .string()
        .trim()
        .min(1, 'Slug cannot be empty')
        .max(100, 'Slug must not exceed 100 characters')
        .regex(REGEX.SLUG, 'Slug must contain only lowercase letters, numbers, and hyphens')
        .optional()
    })
    .refine(
      data => Object.keys(data).length > 0,
      'At least one field (name, loginPanel, or slug) must be provided for update'
    )
};

/**
 * Schema for GET /api/v1/rbac/roles/:roleId and DELETE /api/v1/rbac/roles/:roleId
 */
export const roleParamsSchema = {
  params: z.object({
    roleId: z
      .string({ required_error: 'Role ID is required' })
      .regex(REGEX.UUID, 'Invalid role ID format')
  })
};

/**
 * Schema for PUT /api/v1/rbac/roles/:roleId/permissions
 */
export const updateRolePermissionsSchema = {
  params: z.object({
    roleId: z
      .string({ required_error: 'Role ID is required' })
      .regex(REGEX.UUID, 'Invalid role ID format')
  }),
  body: z.object({
    permissions: z.union([
      z.record(
        z.string(),
        z.object({
          canRead: z.boolean().optional(),
          canCreate: z.boolean().optional(),
          canEdit: z.boolean().optional(),
          canDelete: z.boolean().optional(),
          read: z.boolean().optional(),
          create: z.boolean().optional(),
          edit: z.boolean().optional(),
          delete: z.boolean().optional()
        })
      ),
      z.array(
        z.object({
          moduleKey: z.string().min(1, 'Module key is required').max(100),
          canRead: z.boolean().optional(),
          canCreate: z.boolean().optional(),
          canEdit: z.boolean().optional(),
          canDelete: z.boolean().optional(),
          read: z.boolean().optional(),
          create: z.boolean().optional(),
          edit: z.boolean().optional(),
          delete: z.boolean().optional()
        })
      )
    ], {
      required_error: 'Permissions payload is required'
    })
  })
};

/**
 * Schema for GET /api/v1/rbac/users/:userId/roles
 */
export const userRoleParamsSchema = {
  params: z.object({
    userId: z
      .string({ required_error: 'User ID is required' })
      .regex(REGEX.UUID, 'Invalid user ID format')
  })
};

/**
 * Schema for POST /api/v1/rbac/users/:userId/roles
 */
export const assignUserRoleSchema = {
  params: z.object({
    userId: z
      .string({ required_error: 'User ID is required' })
      .regex(REGEX.UUID, 'Invalid user ID format')
  }),
  body: z.object({
    roleId: z
      .string({ required_error: 'Role ID is required' })
      .regex(REGEX.UUID, 'Invalid role ID format')
  })
};

/**
 * Schema for DELETE /api/v1/rbac/users/:userId/roles/:roleId
 */
export const removeUserRoleParamsSchema = {
  params: z.object({
    userId: z
      .string({ required_error: 'User ID is required' })
      .regex(REGEX.UUID, 'Invalid user ID format')
    ,
    roleId: z
      .string({ required_error: 'Role ID is required' })
      .regex(REGEX.UUID, 'Invalid role ID format')
  })
};
