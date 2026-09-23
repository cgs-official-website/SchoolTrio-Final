import * as rbacRepository from './rbac.repository.js';
import {
  CANONICAL_MODULE_KEYS,
  slugifyRoleName,
  normalizePermissions
} from './rbac.constants.js';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
  TenantAccessError
} from '../../utils/app-error.js';
import { SYSTEM_ROLES } from '../../config/constants.js';
import { RedisCacheService } from '../../services/redis-cache.service.js';

/**
 * RBAC Business Logic Service Layer
 * 
 * Handles:
 * - Role CRUD business rules and tenant enforcement
 * - System-default role protection
 * - Deterministic slug generation & conflict detection
 * - Permission normalization
 * - Multi-role permission union calculation
 * - User-role assignment lifecycle
 * - Audit logging orchestration
 */

/**
 * Lists all functional roles for a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @returns {Promise<Array>}
 */
export async function listRoles(schoolId) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to list roles');
  }
  return rbacRepository.findRolesBySchoolId(schoolId);
}

/**
 * Retrieves a single role by ID within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} roleId - Role UUID
 * @returns {Promise<Object>}
 */
export async function getRoleById(schoolId, roleId) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to retrieve role');
  }
  const role = await rbacRepository.findRoleById(schoolId, roleId);
  if (!role) {
    throw new NotFoundError('Role');
  }
  return role;
}

/**
 * Creates a custom functional role for a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} data
 * @param {string} data.name - Role display name
 * @param {string} [data.loginPanel='admin'] - Target login panel ('admin' | 'teacher')
 * @param {string} [data.slug] - Optional explicit slug
 * @param {Object|Array} [data.permissions] - Initial permission matrix
 * @param {Object} [actor] - Context of the requesting administrator
 * @returns {Promise<Object>}
 */
export async function createRole(schoolId, data, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to create role');
  }

  const roleName = data.name.trim();
  const slug = data.slug ? data.slug.trim().toLowerCase() : slugifyRoleName(roleName);

  // Check for duplicate slug within the tenant
  const existingBySlug = await rbacRepository.findRoleBySlug(schoolId, slug);
  if (existingBySlug) {
    throw new ConflictError(`A role with slug '${slug}' already exists for this school`);
  }

  // Check for duplicate display name within the tenant
  const existingByName = await rbacRepository.findRoleByName(schoolId, roleName);
  if (existingByName) {
    throw new ConflictError(`A role with name '${roleName}' already exists for this school`);
  }

  // Normalize permissions if provided
  const normalizedPermissions = normalizePermissions(data.permissions);

  const createdRole = await rbacRepository.createRoleWithPermissions({
    schoolId,
    name: roleName,
    slug,
    loginPanel: data.loginPanel || 'admin',
    isSystemDefault: false,
    permissions: normalizedPermissions
  });

  // Invalidate tenant RBAC cache
  await RedisCacheService.delPattern(`rbac:perms:${schoolId}:*`);

  // Record audit log
  await rbacRepository.createAuditLog({
    schoolId,
    entityType: 'SchoolRole',
    entityId: createdRole.id,
    actionPerformed: `CREATE_ROLE: ${createdRole.name} (${createdRole.slug})`,
    userName: actor?.email || actor?.userId || 'Administrator',
    userRole: actor?.systemRole || null,
    modifiedFields: {
      name: createdRole.name,
      slug: createdRole.slug,
      loginPanel: createdRole.loginPanel,
      permissionsCount: normalizedPermissions.length
    }
  });

  return createdRole;
}

/**
 * Updates a functional role within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} roleId - Role UUID
 * @param {Object} data - Fields to update
 * @param {Object} [actor] - Context of the requesting administrator
 * @returns {Promise<Object>}
 */
export async function updateRole(schoolId, roleId, data, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to update role');
  }

  const existingRole = await rbacRepository.findRoleById(schoolId, roleId);
  if (!existingRole) {
    throw new NotFoundError('Role');
  }

  const updates = {};

  // Protect system-default roles
  if (existingRole.isSystemDefault) {
    if (data.slug && data.slug !== existingRole.slug) {
      throw new ValidationError('Cannot modify slug of a system default role');
    }
  }

  if (data.loginPanel) {
    updates.loginPanel = data.loginPanel;
  }

  if (data.name && data.name.trim() !== existingRole.name) {
    const newName = data.name.trim();

    // Check name collision
    const existingByName = await rbacRepository.findRoleByName(schoolId, newName);
    if (existingByName && existingByName.id !== roleId) {
      throw new ConflictError(`A role with name '${newName}' already exists for this school`);
    }

    updates.name = newName;

    // For custom roles, if slug is not explicitly provided, update slug
    if (!existingRole.isSystemDefault && !data.slug) {
      const generatedSlug = slugifyRoleName(newName);
      const existingBySlug = await rbacRepository.findRoleBySlug(schoolId, generatedSlug);
      if (existingBySlug && existingBySlug.id !== roleId) {
        throw new ConflictError(`A role with slug '${generatedSlug}' already exists for this school`);
      }
      updates.slug = generatedSlug;
    }
  }

  if (data.slug && !existingRole.isSystemDefault) {
    const newSlug = data.slug.trim().toLowerCase();
    const existingBySlug = await rbacRepository.findRoleBySlug(schoolId, newSlug);
    if (existingBySlug && existingBySlug.id !== roleId) {
      throw new ConflictError(`A role with slug '${newSlug}' already exists for this school`);
    }
    updates.slug = newSlug;
  }

  const updatedRole = await rbacRepository.updateRole(schoolId, roleId, updates);

  // Invalidate tenant RBAC cache
  await RedisCacheService.delPattern(`rbac:perms:${schoolId}:*`);

  // Record audit log
  await rbacRepository.createAuditLog({
    schoolId,
    entityType: 'SchoolRole',
    entityId: updatedRole.id,
    actionPerformed: `UPDATE_ROLE: ${updatedRole.name} (${updatedRole.slug})`,
    userName: actor?.email || actor?.userId || 'Administrator',
    userRole: actor?.systemRole || null,
    modifiedFields: updates
  });

  return updatedRole;
}

/**
 * Deletes a custom functional role within a tenant.
 * System default roles are strictly protected against deletion.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} roleId - Role UUID
 * @param {Object} [actor] - Context of the requesting administrator
 * @returns {Promise<void>}
 */
export async function deleteRole(schoolId, roleId, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to delete role');
  }

  const existingRole = await rbacRepository.findRoleById(schoolId, roleId);
  if (!existingRole) {
    throw new NotFoundError('Role');
  }

  if (existingRole.isSystemDefault) {
    throw new ValidationError('Cannot delete system default role');
  }

  await rbacRepository.deleteRole(schoolId, roleId);

  // Invalidate tenant RBAC cache
  await RedisCacheService.delPattern(`rbac:perms:${schoolId}:*`);

  // Record audit log
  await rbacRepository.createAuditLog({
    schoolId,
    entityType: 'SchoolRole',
    entityId: roleId,
    actionPerformed: `DELETE_ROLE: ${existingRole.name} (${existingRole.slug})`,
    userName: actor?.email || actor?.userId || 'Administrator',
    userRole: actor?.systemRole || null,
    modifiedFields: {
      deletedRole: {
        id: existingRole.id,
        name: existingRole.name,
        slug: existingRole.slug
      }
    }
  });
}

/**
 * Retrieves the permissions for a role within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} roleId - Role UUID
 * @returns {Promise<{ role: Object, permissions: Object, permissionsList: Array }>}
 */
export async function getRolePermissions(schoolId, roleId) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to retrieve permissions');
  }

  const role = await rbacRepository.findRoleById(schoolId, roleId);
  if (!role) {
    throw new NotFoundError('Role');
  }

  const permissionsMap = {};
  for (const perm of role.permissions) {
    permissionsMap[perm.moduleKey] = {
      canRead: perm.canRead,
      canCreate: perm.canCreate,
      canEdit: perm.canEdit,
      canDelete: perm.canDelete
    };
  }

  return {
    role: {
      id: role.id,
      name: role.name,
      slug: role.slug,
      loginPanel: role.loginPanel,
      isSystemDefault: role.isSystemDefault
    },
    permissions: permissionsMap,
    permissionsList: role.permissions
  };
}

/**
 * Replaces/updates permissions for a role within a tenant.
 * Normalizes permissions before persisting.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} roleId - Role UUID
 * @param {Object|Array} permissionsInput - Permission matrix payload
 * @param {Object} [actor] - Context of the requesting administrator
 * @returns {Promise<Object>}
 */
export async function updateRolePermissions(schoolId, roleId, permissionsInput, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to update permissions');
  }

  const role = await rbacRepository.findRoleById(schoolId, roleId);
  if (!role) {
    throw new NotFoundError('Role');
  }

  const normalized = normalizePermissions(permissionsInput);
  const updatedPermissions = await rbacRepository.upsertRolePermissions(schoolId, roleId, normalized);

  const permissionsMap = {};
  for (const perm of updatedPermissions) {
    permissionsMap[perm.moduleKey] = {
      canRead: perm.canRead,
      canCreate: perm.canCreate,
      canEdit: perm.canEdit,
      canDelete: perm.canDelete
    };
  }

  // Invalidate tenant RBAC cache
  await RedisCacheService.delPattern(`rbac:perms:${schoolId}:*`);

  // Record audit log
  await rbacRepository.createAuditLog({
    schoolId,
    entityType: 'SchoolRole',
    entityId: roleId,
    actionPerformed: `UPDATE_PERMISSIONS: ${role.name} (${role.slug})`,
    userName: actor?.email || actor?.userId || 'Administrator',
    userRole: actor?.systemRole || null,
    modifiedFields: {
      updatedModulesCount: normalized.length
    }
  });

  return {
    role: {
      id: role.id,
      name: role.name,
      slug: role.slug,
      loginPanel: role.loginPanel,
      isSystemDefault: role.isSystemDefault
    },
    permissions: permissionsMap,
    permissionsList: updatedPermissions
  };
}

/**
 * Retrieves the assigned roles and their permissions for a user within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} userId - User UUID
 * @returns {Promise<Array>}
 */
export async function getUserRoles(schoolId, userId) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to retrieve user roles');
  }

  const user = await rbacRepository.findUserById(schoolId, userId);
  if (!user) {
    throw new NotFoundError('User');
  }

  const assignments = await rbacRepository.findUserRoleAssignments(schoolId, userId);
  return assignments.map(a => ({
    assignmentId: a.id,
    assignedAt: a.assignedAt,
    role: {
      id: a.schoolRole.id,
      name: a.schoolRole.name,
      slug: a.schoolRole.slug,
      loginPanel: a.schoolRole.loginPanel,
      isSystemDefault: a.schoolRole.isSystemDefault,
      permissions: a.schoolRole.permissions
    }
  }));
}

/**
 * Assigns a functional role to a user within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} userId - Target User UUID
 * @param {string} roleId - Target SchoolRole UUID
 * @param {Object} [actor] - Context of the requesting administrator
 * @returns {Promise<Object>}
 */
export async function assignUserRole(schoolId, userId, roleId, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to assign user role');
  }

  // Verify target user belongs to this tenant
  const user = await rbacRepository.findUserById(schoolId, userId);
  if (!user) {
    throw new NotFoundError('User');
  }

  // Verify target role belongs to this tenant
  const role = await rbacRepository.findRoleById(schoolId, roleId);
  if (!role) {
    throw new NotFoundError('Role');
  }

  // Self-escalation check: Ordinary users cannot assign roles to themselves
  if (actor && actor.userId === userId) {
    const isPlatformAdmin = actor.systemRole === SYSTEM_ROLES.SUPER_ADMIN || actor.systemRole === SYSTEM_ROLES.SCHOOL_ADMIN;
    if (!isPlatformAdmin) {
      throw new ForbiddenError('Self-assignment is restricted to school administrators');
    }
  }

  const assignment = await rbacRepository.assignRoleToUser(schoolId, userId, roleId);

  // Invalidate specific user RBAC cache
  await RedisCacheService.del(`rbac:perms:${schoolId}:${userId}`);

  // Record audit log
  await rbacRepository.createAuditLog({
    schoolId,
    entityType: 'UserRoleAssignment',
    entityId: assignment.id,
    actionPerformed: `ASSIGN_ROLE: User ${user.email} -> Role ${role.name}`,
    userName: actor?.email || actor?.userId || 'Administrator',
    userRole: actor?.systemRole || null,
    modifiedFields: {
      userId,
      userEmail: user.email,
      roleId,
      roleName: role.name
    }
  });

  return {
    assignmentId: assignment.id,
    assignedAt: assignment.assignedAt,
    userId: assignment.userId,
    role: {
      id: assignment.schoolRole.id,
      name: assignment.schoolRole.name,
      slug: assignment.schoolRole.slug,
      loginPanel: assignment.schoolRole.loginPanel,
      isSystemDefault: assignment.schoolRole.isSystemDefault
    }
  };
}

/**
 * Removes a functional role assignment from a user within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} userId - User UUID
 * @param {string} roleId - SchoolRole UUID
 * @param {Object} [actor] - Context of the requesting administrator
 * @returns {Promise<void>}
 */
export async function removeUserRole(schoolId, userId, roleId, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to remove user role');
  }

  const user = await rbacRepository.findUserById(schoolId, userId);
  if (!user) {
    throw new NotFoundError('User');
  }

  const role = await rbacRepository.findRoleById(schoolId, roleId);
  if (!role) {
    throw new NotFoundError('Role');
  }

  const existingAssignment = await rbacRepository.findUserRoleAssignment(schoolId, userId, roleId);
  if (!existingAssignment) {
    throw new NotFoundError('UserRoleAssignment');
  }

  await rbacRepository.removeRoleFromUser(schoolId, userId, roleId);

  // Invalidate specific user RBAC cache
  await RedisCacheService.del(`rbac:perms:${schoolId}:${userId}`);

  // Record audit log
  await rbacRepository.createAuditLog({
    schoolId,
    entityType: 'UserRoleAssignment',
    entityId: existingAssignment.id,
    actionPerformed: `REMOVE_ROLE: User ${user.email} -> Role ${role.name}`,
    userName: actor?.email || actor?.userId || 'Administrator',
    userRole: actor?.systemRole || null,
    modifiedFields: {
      userId,
      userEmail: user.email,
      roleId,
      roleName: role.name
    }
  });
}

/**
 * Computes the authoritative effective permissions for the authenticated user in the active tenant.
 *
 * Logic:
 * 1. SUPER_ADMIN / SCHOOL_ADMIN -> Universal full access across all 32 canonical modules.
 * 2. Ordinary Staff/Teacher -> Multi-role logical OR union across all assigned SchoolRole permissions.
 *
 * @param {Object} auth - Authenticated token context { userId, schoolId, systemRole }
 * @param {Object} [tenant] - Active tenant context { schoolId, isSuperAdminSwitch }
 * @returns {Promise<Object>}
 */
export async function getMyEffectivePermissions(auth, tenant = null) {
  const activeSchoolId = tenant?.schoolId || auth?.schoolId;

  // 1. SuperAdmin without tenant context: global platform authority
  if (auth.systemRole === SYSTEM_ROLES.SUPER_ADMIN && !activeSchoolId) {
    const allModulePermissions = {};
    for (const key of CANONICAL_MODULE_KEYS) {
      allModulePermissions[key] = {
        canRead: true,
        canCreate: true,
        canEdit: true,
        canDelete: true
      };
    }
    return {
      userId: auth.userId,
      schoolId: null,
      systemRole: SYSTEM_ROLES.SUPER_ADMIN,
      isSuperAdmin: true,
      roles: [{ name: 'Super Admin', slug: 'superadmin', isSystemDefault: true }],
      permissions: allModulePermissions,
      isUnrestricted: true
    };
  }

  if (!activeSchoolId) {
    throw new TenantAccessError('Tenant context is required to determine effective permissions');
  }

  // 2. SuperAdmin or SchoolAdmin in tenant context: Unrestricted tenant administrator access
  const isSchoolAdmin =
    auth.systemRole === SYSTEM_ROLES.SCHOOL_ADMIN ||
    auth.systemRole === 'TENANT_ADMIN' ||
    auth.systemRole === 'ADMIN';
  const isSuperAdmin = auth.systemRole === SYSTEM_ROLES.SUPER_ADMIN;

  if (isSchoolAdmin || isSuperAdmin) {
    const allModulePermissions = {};
    for (const key of CANONICAL_MODULE_KEYS) {
      allModulePermissions[key] = {
        canRead: true,
        canCreate: true,
        canEdit: true,
        canDelete: true
      };
    }

    return {
      userId: auth.userId,
      schoolId: activeSchoolId,
      systemRole: auth.systemRole,
      isSuperAdmin,
      isSchoolAdmin,
      roles: isSuperAdmin
        ? [{ name: 'Super Admin', slug: 'superadmin', isSystemDefault: true }]
        : [{ name: 'School Admin', slug: 'school-admin', isSystemDefault: true }],
      permissions: allModulePermissions,
      isUnrestricted: true
    };
  }

  // 3. Normal Tenant Users (TEACHER, STAFF, PRINCIPAL, TENANT_USER, etc.)
  const assignments = await rbacRepository.findUserRoleAssignments(activeSchoolId, auth.userId);
  if (assignments.length === 0) {
    return {
      userId: auth.userId,
      schoolId: activeSchoolId,
      systemRole: auth.systemRole,
      isSuperAdmin: false,
      isSchoolAdmin: false,
      roles: [],
      permissions: {},
      isUnrestricted: false
    };
  }

  const assignedRoles = assignments.map(a => ({
    id: a.schoolRole.id,
    name: a.schoolRole.name,
    slug: a.schoolRole.slug,
    loginPanel: a.schoolRole.loginPanel,
    isSystemDefault: a.schoolRole.isSystemDefault
  }));

  const effectivePermissions = await getUserEffectivePermissions(activeSchoolId, auth.userId);

  return {
    userId: auth.userId,
    schoolId: activeSchoolId,
    systemRole: auth.systemRole,
    isSuperAdmin: false,
    isSchoolAdmin: false,
    roles: assignedRoles,
    permissions: effectivePermissions,
    isUnrestricted: false
  };
}

/**
 * Resolves the authoritative effective permissions map for a user within a tenant with Redis caching.
 *
 * Cache-aside Pattern:
 * 1. Checks Redis cache `rbac:perms:${schoolId}:${userId}` (TTL 300s).
 * 2. On cache miss, malformed payload, or Redis outage: queries PostgreSQL.
 * 3. Enforces multi-role logical OR union across all assigned SchoolRole permissions.
 * 4. Populates Redis cache asynchronously without blocking on failures.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} userId - User UUID
 * @returns {Promise<Object>} Map of module keys to CRUD boolean permissions
 */
export async function getUserEffectivePermissions(schoolId, userId) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context is required to determine user permissions');
  }
  if (!userId) {
    throw new ValidationError('User ID is required to determine user permissions');
  }

  const cacheKey = `rbac:perms:${schoolId}:${userId}`;

  // 1. Try Cache
  try {
    const cached = await RedisCacheService.get(cacheKey);
    if (cached && typeof cached === 'object' && !Array.isArray(cached)) {
      return cached;
    }
  } catch (_err) {
    // Fail open to DB query
  }

  // 2. Query PostgreSQL
  const assignments = await rbacRepository.findUserRoleAssignments(schoolId, userId);

  const effectivePermissions = {};
  for (const key of CANONICAL_MODULE_KEYS) {
    effectivePermissions[key] = {
      canRead: false,
      canCreate: false,
      canEdit: false,
      canDelete: false
    };
  }

  for (const assignment of assignments) {
    const role = assignment.schoolRole;
    if (Array.isArray(role?.permissions)) {
      for (const perm of role.permissions) {
        const key = perm.moduleKey;
        if (effectivePermissions[key]) {
          if (perm.canRead) effectivePermissions[key].canRead = true;
          if (perm.canCreate) effectivePermissions[key].canCreate = true;
          if (perm.canEdit) effectivePermissions[key].canEdit = true;
          if (perm.canDelete) effectivePermissions[key].canDelete = true;
        }
      }
    }
  }

  // Ensure permission dependency invariant on the union result:
  // Any write action implies read; read = false clears write actions
  for (const perm of Object.values(effectivePermissions)) {
    if (perm.canCreate || perm.canEdit || perm.canDelete) {
      perm.canRead = true;
    }
    if (!perm.canRead) {
      perm.canCreate = false;
      perm.canEdit = false;
      perm.canDelete = false;
    }
  }

  // 3. Populate Cache with 300s TTL (fail-safe)
  try {
    await RedisCacheService.set(cacheKey, effectivePermissions, 300);
  } catch (_err) {
    // Non-blocking on cache write failure
  }

  return effectivePermissions;
}
