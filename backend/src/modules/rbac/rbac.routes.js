import { Router } from 'express';
import * as rbacController from './rbac.controller.js';
import * as rbacSchemas from './rbac.schemas.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantContext } from '../../middleware/tenant.middleware.js';
import { requireRole } from '../../middleware/rbac.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { SYSTEM_ROLES } from '../../config/constants.js';

const router = Router();

/**
 * 1. Current Authenticated User's Effective Permissions Endpoint
 * Accessible to any authenticated user within a valid tenant context.
 */
router.get(
  '/my-permissions',
  authenticate,
  tenantContext({ requireTenant: true }),
  rbacController.getMyPermissions
);

/**
 * Administrative Role Management Endpoints
 * Restricted to SCHOOL_ADMIN and SUPER_ADMIN.
 */

// List all roles for active tenant
router.get(
  '/roles',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireRole(SYSTEM_ROLES.SCHOOL_ADMIN, SYSTEM_ROLES.SUPER_ADMIN),
  rbacController.listRoles
);

// Get a single role by ID
router.get(
  '/roles/:roleId',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireRole(SYSTEM_ROLES.SCHOOL_ADMIN, SYSTEM_ROLES.SUPER_ADMIN),
  validate(rbacSchemas.roleParamsSchema),
  rbacController.getRole
);

// Create a new custom role
router.post(
  '/roles',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireRole(SYSTEM_ROLES.SCHOOL_ADMIN, SYSTEM_ROLES.SUPER_ADMIN),
  validate(rbacSchemas.createRoleSchema),
  rbacController.createRole
);

// Update a custom role
router.patch(
  '/roles/:roleId',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireRole(SYSTEM_ROLES.SCHOOL_ADMIN, SYSTEM_ROLES.SUPER_ADMIN),
  validate(rbacSchemas.updateRoleSchema),
  rbacController.updateRole
);

// Delete a custom role (rejects default roles)
router.delete(
  '/roles/:roleId',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireRole(SYSTEM_ROLES.SCHOOL_ADMIN, SYSTEM_ROLES.SUPER_ADMIN),
  validate(rbacSchemas.roleParamsSchema),
  rbacController.deleteRole
);

/**
 * Role Permission Management Endpoints
 */

// Get permissions for a role
router.get(
  '/roles/:roleId/permissions',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireRole(SYSTEM_ROLES.SCHOOL_ADMIN, SYSTEM_ROLES.SUPER_ADMIN),
  validate(rbacSchemas.roleParamsSchema),
  rbacController.getRolePermissions
);

// Update/replace permissions for a role
router.put(
  '/roles/:roleId/permissions',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireRole(SYSTEM_ROLES.SCHOOL_ADMIN, SYSTEM_ROLES.SUPER_ADMIN),
  validate(rbacSchemas.updateRolePermissionsSchema),
  rbacController.updateRolePermissions
);

/**
 * User-Role Assignment Endpoints
 */

// List roles assigned to a user
router.get(
  '/users/:userId/roles',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireRole(SYSTEM_ROLES.SCHOOL_ADMIN, SYSTEM_ROLES.SUPER_ADMIN),
  validate(rbacSchemas.userRoleParamsSchema),
  rbacController.getUserRoles
);

// Assign a role to a user
router.post(
  '/users/:userId/roles',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireRole(SYSTEM_ROLES.SCHOOL_ADMIN, SYSTEM_ROLES.SUPER_ADMIN),
  validate(rbacSchemas.assignUserRoleSchema),
  rbacController.assignUserRole
);

// Remove a role assignment from a user
router.delete(
  '/users/:userId/roles/:roleId',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireRole(SYSTEM_ROLES.SCHOOL_ADMIN, SYSTEM_ROLES.SUPER_ADMIN),
  validate(rbacSchemas.removeUserRoleParamsSchema),
  rbacController.removeUserRole
);

export default router;
