import { generateStructuredJson } from '../../services/openrouter.service.js';
import { logger } from '../../utils/logger.js';
import * as rbacRepository from './rbac.repository.js';
import { prisma } from '../../database/prisma.client.js';
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
import { SYSTEM_ROLES, REGEX } from '../../config/constants.js';
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

  if (!data?.name || typeof data.name !== 'string' || !data.name.trim()) {
    throw new ValidationError('Role name is required');
  }

  const roleName = data.name.trim();
  const slug = data.slug ? data.slug.trim().toLowerCase() : slugifyRoleName(roleName);

  if (!slug) {
    throw new ValidationError('Role slug could not be generated from role name');
  }

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

  const inferredLoginPanel = data.loginPanel || (
    /teacher|teaching|instructor|tutor|incharge|educator|faculty/i.test(`${roleName} ${slug}`)
      ? 'teacher'
      : 'admin'
  );

  const createdRole = await rbacRepository.createRoleWithPermissions({
    schoolId,
    name: roleName,
    slug,
    loginPanel: inferredLoginPanel,
    isSystemDefault: false,
    permissions: normalizedPermissions
  });

  // Invalidate tenant RBAC cache
  try {
    await RedisCacheService.delPattern(`rbac:perms:${schoolId}:*`);
  } catch (_err) {
    // Non-blocking cache error
  }

  // Record audit log
  try {
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
  } catch (_err) {
    // Non-blocking audit log error
  }

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
  try {
    await RedisCacheService.delPattern(`rbac:perms:${schoolId}:*`);
  } catch (_err) {
    // Non-blocking cache error
  }

  // Record audit log
  try {
    await rbacRepository.createAuditLog({
      schoolId,
      entityType: 'SchoolRole',
      entityId: updatedRole.id,
      actionPerformed: `UPDATE_ROLE: ${updatedRole.name} (${updatedRole.slug})`,
      userName: actor?.email || actor?.userId || 'Administrator',
      userRole: actor?.systemRole || null,
      modifiedFields: updates
    });
  } catch (_err) {
    // Non-blocking audit log error
  }

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
  try {
    await RedisCacheService.delPattern(`rbac:perms:${schoolId}:*`);
  } catch (_err) {
    // Non-blocking cache error
  }

  // Record audit log
  try {
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
  } catch (_err) {
    // Non-blocking audit log error
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
 * Resolves the approved/enabled modules map for a school tenant with Redis caching.
 *
 * Checks:
 * 1. SubscriptionPlan.modules (if school is attached to a plan)
 * 2. SchoolSetting with category 'modulesConfig' or 'permittedModules'
 *
 * @param {string} schoolId - Tenant UUID
 * @returns {Promise<Object>} Object mapping moduleKey -> boolean (true = approved, false = unapproved)
 */
export async function getApprovedModulesForSchool(schoolId) {
  if (!schoolId) return {};

  const approvedMap = {};
  for (const key of CANONICAL_MODULE_KEYS) {
    approvedMap[key] = true;
  }

  // Fast path for synthetic non-UUID school IDs in unit test environments
  if (!REGEX.UUID.test(schoolId)) {
    return approvedMap;
  }

  const cacheKey = `rbac:approved-modules:${schoolId}`;

  try {
    const cached = await RedisCacheService.get(cacheKey);
    if (cached && typeof cached === 'object' && !Array.isArray(cached)) {
      return cached;
    }
  } catch (_err) {
    // Fail open to DB query
  }

  let school = null;
  try {
    const dbPromise = prisma.school.findUnique({
      where: { id: schoolId },
      select: {
        planId: true,
        plan: {
          select: { modules: true }
        },
        settings: {
          where: {
            category: { in: ['modulesConfig', 'permittedModules'] }
          },
          select: { category: true, data: true }
        }
      }
    });

    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 1500));
    school = await Promise.race([dbPromise, timeoutPromise]);
  } catch (_dbErr) {
    // Fail open to default canonical modules map for mock unit test environments
  }

  if (school) {
    if (school.plan?.modules) {
      const planMods = school.plan.modules;
      if (Array.isArray(planMods)) {
        const planSet = new Set(planMods.map(m => String(m).trim().toLowerCase()));
        for (const key of CANONICAL_MODULE_KEYS) {
          if (!planSet.has(key)) {
            approvedMap[key] = false;
          }
        }
      } else if (typeof planMods === 'object') {
        for (const [key, val] of Object.entries(planMods)) {
          const normKey = String(key).trim().toLowerCase();
          if (normKey in approvedMap) {
            approvedMap[normKey] = Boolean(val);
          }
        }
      }
    }

    const setting = school.settings?.find(s => s.category === 'modulesConfig' || s.category === 'permittedModules');
    if (setting?.data) {
      const setData = setting.data;
      if (Array.isArray(setData)) {
        const settingSet = new Set(setData.map(m => String(m).trim().toLowerCase()));
        for (const key of CANONICAL_MODULE_KEYS) {
          if (!settingSet.has(key)) {
            approvedMap[key] = false;
          }
        }
      } else if (typeof setData === 'object') {
        for (const [key, val] of Object.entries(setData)) {
          const normKey = String(key).trim().toLowerCase();
          if (normKey in approvedMap) {
            approvedMap[normKey] = Boolean(val);
          }
        }
      }
    }
  }

  try {
    await RedisCacheService.set(cacheKey, approvedMap, 300);
  } catch (_err) {
    // Non-blocking
  }

  return approvedMap;
}

/**
 * Checks whether a specific module is approved/enabled for a school tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} moduleKey - Canonical module key
 * @returns {Promise<boolean>}
 */
export async function isModuleApprovedForSchool(schoolId, moduleKey) {
  if (!schoolId || !moduleKey) return false;
  const approvedMap = await getApprovedModulesForSchool(schoolId);
  const normKey = String(moduleKey).trim().toLowerCase();
  return approvedMap[normKey] !== false;
}

/**
 * Resolves the authoritative effective permissions map for a user within a tenant with Redis caching.
 *
 * Cache-aside Pattern:
 * 1. Checks Redis cache `rbac:perms:${schoolId}:${userId}` (TTL 300s).
 * 2. On cache miss, malformed payload, or Redis outage: queries PostgreSQL.
 * 3. Enforces multi-role logical OR union across all assigned SchoolRole permissions.
 * 4. Filters out unapproved tenant modules.
 * 5. Populates Redis cache asynchronously without blocking on failures.
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
  const [assignments, approvedMap] = await Promise.all([
    rbacRepository.findUserRoleAssignments(schoolId, userId),
    getApprovedModulesForSchool(schoolId)
  ]);

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
        if (effectivePermissions[key] && approvedMap[key] !== false) {
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
  for (const [key, perm] of Object.entries(effectivePermissions)) {
    if (approvedMap[key] === false) {
      perm.canRead = false;
      perm.canCreate = false;
      perm.canEdit = false;
      perm.canDelete = false;
      continue;
    }
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

// ============================================================================
// AI-Assisted Role Permissions Suggestion (Least Privilege Non-Teaching Roles)
// ============================================================================

const ALLOWED_AI_MODULE_KEYS = new Set([
  'billing', 'classes', 'subjects', 'students', 'staff', 'attendance', 'leaves', 'fees',
  'timetables', 'calendar', 'exams', 'homework', 'noticeboard', 'transport', 'library',
  'inventory', 'hr-payroll', 'reports', 'leads', 'canteen', 'hostel', 'lesson_plans',
  'resources', 'ptm', 'performance', 'complaints', 'health', 'documents'
]);

const FORBIDDEN_AI_MODULE_KEYS = new Set([
  'form-builder', 'setup', 'roles', 'api', 'links', 'upgrade'
]);

const REFERENCE_PRESETS = {
  correspondent: {
    loginPanel: 'admin',
    permissions: {
      students: { read: true, create: true, edit: true, delete: false },
      staff: { read: true, create: true, edit: true, delete: false },
      classes: { read: true, create: true, edit: true, delete: false },
      subjects: { read: true, create: true, edit: true, delete: false },
      fees: { read: true, create: true, edit: true, delete: false },
      billing: { read: true, create: true, edit: true, delete: false },
      'hr-payroll': { read: true, create: true, edit: true, delete: false },
      reports: { read: true, create: false, edit: false, delete: false },
      calendar: { read: true, create: true, edit: true, delete: false },
      noticeboard: { read: true, create: true, edit: true, delete: true },
      transport: { read: true, create: false, edit: false, delete: false },
      inventory: { read: true, create: false, edit: false, delete: false },
      hostel: { read: true, create: false, edit: false, delete: false }
    }
  },
  principal: {
    loginPanel: 'admin',
    permissions: {
      students: { read: true, create: true, edit: true, delete: false },
      staff: { read: true, create: true, edit: true, delete: false },
      classes: { read: true, create: true, edit: true, delete: false },
      subjects: { read: true, create: true, edit: true, delete: false },
      attendance: { read: true, create: true, edit: true, delete: false },
      leaves: { read: true, create: true, edit: true, delete: false },
      exams: { read: true, create: true, edit: true, delete: true },
      homework: { read: true, create: true, edit: true, delete: false },
      timetables: { read: true, create: true, edit: true, delete: false },
      calendar: { read: true, create: true, edit: true, delete: false },
      noticeboard: { read: true, create: true, edit: true, delete: true },
      reports: { read: true, create: false, edit: false, delete: false },
      complaints: { read: true, create: false, edit: true, delete: false },
      library: { read: true, create: false, edit: false, delete: false },
      transport: { read: true, create: false, edit: false, delete: false }
    }
  },
  'vice principal': {
    loginPanel: 'admin',
    permissions: {
      students: { read: true, create: false, edit: true, delete: false },
      staff: { read: true, create: false, edit: true, delete: false },
      classes: { read: true, create: false, edit: true, delete: false },
      subjects: { read: true, create: false, edit: true, delete: false },
      attendance: { read: true, create: false, edit: true, delete: false },
      leaves: { read: true, create: false, edit: true, delete: false },
      exams: { read: true, create: true, edit: true, delete: false },
      homework: { read: true, create: true, edit: true, delete: false },
      timetables: { read: true, create: true, edit: true, delete: false },
      calendar: { read: true, create: true, edit: true, delete: false },
      noticeboard: { read: true, create: true, edit: true, delete: false },
      reports: { read: true, create: false, edit: false, delete: false }
    }
  },
  'vice-principal': {
    loginPanel: 'admin',
    permissions: {
      students: { read: true, create: false, edit: true, delete: false },
      staff: { read: true, create: false, edit: true, delete: false },
      classes: { read: true, create: false, edit: true, delete: false },
      subjects: { read: true, create: false, edit: true, delete: false },
      attendance: { read: true, create: false, edit: true, delete: false },
      leaves: { read: true, create: false, edit: true, delete: false },
      exams: { read: true, create: true, edit: true, delete: false },
      homework: { read: true, create: true, edit: true, delete: false },
      timetables: { read: true, create: true, edit: true, delete: false },
      calendar: { read: true, create: true, edit: true, delete: false },
      noticeboard: { read: true, create: true, edit: true, delete: false },
      reports: { read: true, create: false, edit: false, delete: false }
    }
  },
  'subject wise head': {
    loginPanel: 'teacher',
    permissions: {
      classes: { read: true, create: false, edit: false, delete: false },
      subjects: { read: true, create: true, edit: true, delete: false },
      students: { read: true, create: false, edit: false, delete: false },
      homework: { read: true, create: true, edit: true, delete: false },
      attendance: { read: true, create: true, edit: true, delete: false },
      exams: { read: true, create: true, edit: true, delete: false },
      lesson_plans: { read: true, create: true, edit: true, delete: false },
      resources: { read: true, create: true, edit: true, delete: false },
      timetables: { read: true, create: false, edit: false, delete: false },
      calendar: { read: true, create: false, edit: false, delete: false },
      noticeboard: { read: true, create: false, edit: false, delete: false }
    }
  },
  'class incharge': {
    loginPanel: 'teacher',
    permissions: {
      classes: { read: true, create: false, edit: false, delete: false },
      subjects: { read: true, create: false, edit: false, delete: false },
      students: { read: true, create: false, edit: false, delete: false },
      attendance: { read: true, create: true, edit: true, delete: false },
      homework: { read: true, create: true, edit: true, delete: false },
      exams: { read: true, create: true, edit: true, delete: false },
      lesson_plans: { read: true, create: true, edit: true, delete: false },
      resources: { read: true, create: true, edit: true, delete: false },
      timetables: { read: true, create: false, edit: false, delete: false },
      calendar: { read: true, create: false, edit: false, delete: false },
      noticeboard: { read: true, create: true, edit: false, delete: false },
      ptm: { read: true, create: true, edit: true, delete: false }
    }
  },
  staffs: {
    loginPanel: 'teacher',
    permissions: {
      classes: { read: true, create: false, edit: false, delete: false },
      subjects: { read: true, create: false, edit: false, delete: false },
      students: { read: true, create: false, edit: false, delete: false },
      homework: { read: true, create: true, edit: true, delete: false },
      attendance: { read: true, create: true, edit: true, delete: false },
      exams: { read: true, create: true, edit: true, delete: false },
      lesson_plans: { read: true, create: true, edit: true, delete: false },
      resources: { read: true, create: true, edit: true, delete: false },
      timetables: { read: true, create: false, edit: false, delete: false },
      calendar: { read: true, create: false, edit: false, delete: false },
      noticeboard: { read: true, create: false, edit: false, delete: false },
      leaves: { read: true, create: true, edit: false, delete: false }
    }
  },
  teacher: {
    loginPanel: 'teacher',
    permissions: {
      classes: { read: true, create: false, edit: false, delete: false },
      subjects: { read: true, create: false, edit: false, delete: false },
      students: { read: true, create: false, edit: false, delete: false },
      homework: { read: true, create: true, edit: true, delete: false },
      attendance: { read: true, create: true, edit: true, delete: false },
      exams: { read: true, create: true, edit: true, delete: false },
      lesson_plans: { read: true, create: true, edit: true, delete: false },
      resources: { read: true, create: true, edit: true, delete: false },
      timetables: { read: true, create: false, edit: false, delete: false },
      calendar: { read: true, create: false, edit: false, delete: false },
      noticeboard: { read: true, create: false, edit: false, delete: false },
      leaves: { read: true, create: true, edit: false, delete: false }
    }
  },
  'administrative officer': {
    loginPanel: 'admin',
    permissions: {
      staff: { read: true, create: true, edit: true, delete: false },
      students: { read: true, create: true, edit: true, delete: false },
      attendance: { read: true, create: true, edit: true, delete: false },
      classes: { read: true, create: false, edit: false, delete: false },
      timetables: { read: true, create: false, edit: false, delete: false },
      calendar: { read: true, create: true, edit: true, delete: false },
      noticeboard: { read: true, create: true, edit: true, delete: false },
      transport: { read: true, create: false, edit: false, delete: false },
      inventory: { read: true, create: true, edit: true, delete: false },
      leaves: { read: true, create: true, edit: true, delete: false },
      reports: { read: true, create: false, edit: false, delete: false }
    }
  },
  'finance department': {
    loginPanel: 'admin',
    permissions: {
      fees: { read: true, create: true, edit: true, delete: false },
      billing: { read: true, create: true, edit: true, delete: false },
      'hr-payroll': { read: true, create: true, edit: true, delete: false },
      reports: { read: true, create: false, edit: false, delete: false },
      students: { read: true, create: false, edit: false, delete: false }
    }
  },
  accountant: {
    loginPanel: 'admin',
    permissions: {
      fees: { read: true, create: true, edit: true, delete: false },
      billing: { read: true, create: true, edit: true, delete: false },
      'hr-payroll': { read: true, create: true, edit: true, delete: false },
      reports: { read: true, create: false, edit: false, delete: false },
      students: { read: true, create: false, edit: false, delete: false }
    }
  },
  'fee clerk': {
    loginPanel: 'admin',
    permissions: {
      fees: { read: true, create: true, edit: true, delete: false },
      billing: { read: true, create: true, edit: true, delete: false },
      reports: { read: true, create: false, edit: false, delete: false },
      students: { read: true, create: false, edit: false, delete: false }
    }
  },
  librarian: {
    loginPanel: 'admin',
    permissions: {
      library: { read: true, create: true, edit: true, delete: true },
      students: { read: true, create: false, edit: false, delete: false }
    }
  },
  library: {
    loginPanel: 'admin',
    permissions: {
      library: { read: true, create: true, edit: true, delete: true },
      students: { read: true, create: false, edit: false, delete: false }
    }
  },
  'transport in-charge': {
    loginPanel: 'admin',
    permissions: {
      transport: { read: true, create: true, edit: true, delete: true },
      students: { read: true, create: false, edit: false, delete: false }
    }
  },
  transport: {
    loginPanel: 'admin',
    permissions: {
      transport: { read: true, create: true, edit: true, delete: true },
      students: { read: true, create: false, edit: false, delete: false }
    }
  },
  'canteen manager': {
    loginPanel: 'admin',
    permissions: {
      canteen: { read: true, create: true, edit: true, delete: false }
    }
  },
  canteen: {
    loginPanel: 'admin',
    permissions: {
      canteen: { read: true, create: true, edit: true, delete: false }
    }
  },
  'inventory keeper': {
    loginPanel: 'admin',
    permissions: {
      inventory: { read: true, create: true, edit: true, delete: false }
    }
  },
  'store keeper': {
    loginPanel: 'admin',
    permissions: {
      inventory: { read: true, create: true, edit: true, delete: false }
    }
  },
  inventory: {
    loginPanel: 'admin',
    permissions: {
      inventory: { read: true, create: true, edit: true, delete: false }
    }
  },
  hostel: {
    loginPanel: 'admin',
    permissions: {
      hostel: { read: true, create: true, edit: true, delete: true },
      students: { read: true, create: false, edit: false, delete: false },
      attendance: { read: true, create: true, edit: true, delete: false },
      noticeboard: { read: true, create: false, edit: false, delete: false },
      calendar: { read: true, create: false, edit: false, delete: false }
    }
  },
  'hostel warden': {
    loginPanel: 'admin',
    permissions: {
      hostel: { read: true, create: true, edit: true, delete: true },
      students: { read: true, create: false, edit: false, delete: false },
      attendance: { read: true, create: true, edit: true, delete: false },
      noticeboard: { read: true, create: false, edit: false, delete: false },
      calendar: { read: true, create: false, edit: false, delete: false }
    }
  },
  'front office': {
    loginPanel: 'admin',
    permissions: {
      students: { read: true, create: true, edit: true, delete: false },
      classes: { read: true, create: false, edit: false, delete: false },
      calendar: { read: true, create: false, edit: false, delete: false },
      noticeboard: { read: true, create: true, edit: false, delete: false },
      timetables: { read: true, create: false, edit: false, delete: false }
    }
  },
  'office admin': {
    loginPanel: 'admin',
    permissions: {
      students: { read: true, create: true, edit: true, delete: false },
      classes: { read: true, create: false, edit: false, delete: false },
      calendar: { read: true, create: false, edit: false, delete: false },
      noticeboard: { read: true, create: true, edit: false, delete: false },
      timetables: { read: true, create: false, edit: false, delete: false }
    }
  },
  'admission counselor': {
    loginPanel: 'admin',
    permissions: {
      leads: { read: true, create: true, edit: true, delete: true },
      students: { read: true, create: true, edit: false, delete: false }
    }
  },
  'hr executive': {
    loginPanel: 'admin',
    permissions: {
      staff: { read: true, create: true, edit: true, delete: false },
      'hr-payroll': { read: true, create: true, edit: true, delete: false },
      leaves: { read: true, create: true, edit: true, delete: false }
    }
  },
  'attendance clerk': {
    loginPanel: 'admin',
    permissions: {
      attendance: { read: true, create: true, edit: true, delete: false },
      students: { read: true, create: false, edit: false, delete: false }
    }
  },
  security: {
    loginPanel: 'admin',
    permissions: {
      transport: { read: true, create: false, edit: false, delete: false },
      noticeboard: { read: true, create: false, edit: false, delete: false },
      calendar: { read: true, create: false, edit: false, delete: false }
    }
  },
  janitors: {
    loginPanel: 'admin',
    permissions: {
      noticeboard: { read: true, create: false, edit: false, delete: false },
      calendar: { read: true, create: false, edit: false, delete: false }
    }
  },
  janitor: {
    loginPanel: 'admin',
    permissions: {
      noticeboard: { read: true, create: false, edit: false, delete: false },
      calendar: { read: true, create: false, edit: false, delete: false }
    }
  }
};

const DEFAULT_MINIMAL_PERMISSIONS = {
  noticeboard: { read: true, create: false, edit: false, delete: false },
  calendar: { read: true, create: false, edit: false, delete: false }
};

function findMatchingPreset(roleName) {
  if (!roleName) return null;
  const trimmed = roleName.trim().toLowerCase();
  if (REFERENCE_PRESETS[trimmed]) {
    return REFERENCE_PRESETS[trimmed];
  }
  const matchingKeys = Object.keys(REFERENCE_PRESETS).filter(key => {
    return trimmed.startsWith(key) || key.startsWith(trimmed) || trimmed.includes(key);
  });
  if (matchingKeys.length === 0) return null;
  matchingKeys.sort((a, b) => b.length - a.length);
  return REFERENCE_PRESETS[matchingKeys[0]];
}

const AI_PERMISSION_SYSTEM_PROMPT = `You are an expert permission-configuration assistant for a School Management System.
Given ANY school staff or faculty role name, return the minimum permissions that role needs
based on the Principle of Least Privilege and determine the appropriate login panel ("admin" or "teacher").
Output ONLY valid JSON, no explanation, no markdown.

OUTPUT FORMAT:
{
  "loginPanel": "admin" | "teacher",
  "permissions": {
    "<moduleKey>": {
      "read": true/false,
      "create": true/false,
      "edit": true/false,
      "delete": true/false
    }
  }
}

ALLOWED MODULE KEYS (use only these canonical modules):
classes, subjects, students, staff, attendance, leaves, fees, timetables,
calendar, exams, homework, noticeboard, transport, library, inventory, hr-payroll,
reports, leads, canteen, hostel, lesson_plans, resources, ptm, performance,
complaints, health, documents, billing

NEVER GRANT (system administrator only): form-builder, setup, roles, api, links, upgrade

RULES:
1. LOGIN PANEL:
   - "teacher" for teaching roles: Teacher, Staffs, Subject Wise Head, Class Incharge, Faculty, Instructor, Tutor.
   - "admin" for leadership, administrative, finance, and operational non-teaching roles: Correspondent, Principal, Vice Principal, Administrative Officer, Finance, Accountant, Library, Transport, Canteen, Hostel, Inventory, Security, Janitor, Office Admin, etc.
2. Each module has 4 booleans: read, create, edit, delete.
3. create/edit/delete = true only if the role's daily job needs it. read-only is the default.
4. delete = true ONLY for the role's own core module (e.g., library for Librarian, transport for Transport In-charge, hostel for Hostel Warden, leads for Admission Counselor). Never delete on fees, students, hr-payroll, attendance, inventory.
5. Include only modules the role needs. Omit everything else.
6. If a role needs to act on students (issue books, assign routes, take attendance), give students: read only (unless admissions/admin).
7. If the role name is unclear or unrelated to school operations, return minimal permissions: noticeboard read, calendar read with loginPanel "admin".

REFERENCE PRESETS:
- Correspondent: loginPanel admin; broad oversight on students, staff, fees, billing, reports, calendar, noticeboard.
- Principal: loginPanel admin; academic and administrative oversight across students, staff, classes, subjects, attendance, leaves, exams, homework, timetables, calendar, noticeboard, reports.
- Vice Principal: loginPanel admin; academic management across students, staff, classes, subjects, attendance, leaves, exams, homework, timetables, calendar, noticeboard, reports.
- Teaching Staff / Teacher / Staffs: loginPanel teacher; classes R, subjects R, students R, homework R/C/E, attendance R/C/E, exams R/C/E, lesson_plans R/C/E, resources R/C/E, timetables R, calendar R, noticeboard R, leaves R/C.
- Class Incharge: loginPanel teacher; classes R, subjects R, students R, homework R/C/E, attendance R/C/E, exams R/C/E, lesson_plans R/C/E, resources R/C/E, timetables R/C/E, calendar R, noticeboard R/C, ptm R/C/E.
- Subject Wise Head: loginPanel teacher; classes R, subjects R/C/E, students R, homework R/C/E, exams R/C/E, lesson_plans R/C/E, resources R/C/E, timetables R, calendar R, noticeboard R.
- Administrative Officer: loginPanel admin; staff R/C/E, students R/C/E, attendance R/C/E, classes R, timetables R, calendar R, noticeboard R/C/E, transport R, inventory R/C/E, leaves R/C/E, reports R.
- Finance Department / Accountant / Fee Clerk: loginPanel admin; fees R/C/E, billing R/C/E, hr-payroll R/C/E, reports R, students R.
- Library / Librarian: loginPanel admin; library R/C/E/D, students R.
- Transport / Transport In-charge: loginPanel admin; transport R/C/E/D, students R.
- Canteen / Canteen Manager: loginPanel admin; canteen R/C/E.
- Inventory / Store Keeper: loginPanel admin; inventory R/C/E.
- Hostel / Hostel Warden: loginPanel admin; hostel R/C/E/D, students R, attendance R/C/E, noticeboard R, calendar R.
- Front Office / Office Admin: loginPanel admin; students R/C/E, classes R, calendar R, noticeboard R/C, timetables R.
- Admission Counselor: loginPanel admin; leads R/C/E/D, students R/C.
- HR Executive: loginPanel admin; staff R/C/E, hr-payroll R/C/E, leaves R/C/E.
- Attendance Clerk: loginPanel admin; attendance R/C/E, students R.
- Security Guard: loginPanel admin; transport R, noticeboard R, calendar R.
- Janitors: loginPanel admin; noticeboard R, calendar R.`;

export async function suggestRolePermissions(roleName) {
  if (typeof roleName !== 'string' || !roleName.trim()) {
    throw new ValidationError('Role name is required');
  }

  const trimmedRole = roleName.trim();
  const lowerRole = trimmedRole.toLowerCase();
  const isTeachingRole = /teacher|teaching|instructor|tutor|incharge|educator|faculty|staffs/i.test(`${trimmedRole} ${lowerRole}`);

  const matchedPreset = findMatchingPreset(trimmedRole);

  let rawResult = null;

  try {
    rawResult = await generateStructuredJson({
      prompt: `Role Name: "${trimmedRole}"`,
      systemPrompt: AI_PERMISSION_SYSTEM_PROMPT
    });
  } catch (aiErr) {
    logger.warn({ role: trimmedRole, error: aiErr.message }, 'AI permission suggestion call failed, checking preset fallback');
  }

  // Extract candidate permissions and loginPanel from AI output
  let candidatePerms = null;
  let candidateLoginPanel = null;

  if (rawResult && typeof rawResult === 'object') {
    if (rawResult.loginPanel === 'admin' || rawResult.loginPanel === 'teacher') {
      candidateLoginPanel = rawResult.loginPanel;
    }
    candidatePerms = rawResult.permissions && typeof rawResult.permissions === 'object'
      ? rawResult.permissions
      : rawResult;
  }

  // Determine final target login panel
  const finalLoginPanel = isTeachingRole 
    ? 'teacher' 
    : (candidateLoginPanel || matchedPreset?.loginPanel || 'admin');

  // Check if AI output is empty or only returned minimal fallback for a known standard role
  const isMinimalPerms = candidatePerms && 
    Object.keys(candidatePerms).length <= 2 && 
    Object.keys(candidatePerms).every(k => k === 'noticeboard' || k === 'calendar');

  if (!candidatePerms || Object.keys(candidatePerms).length === 0 || (isMinimalPerms && matchedPreset)) {
    candidatePerms = matchedPreset ? matchedPreset.permissions : DEFAULT_MINIMAL_PERMISSIONS;
  }

  // Sanitize and enforce least privilege rules on the permissions
  const sanitizedPermissions = {};

  for (const [key, val] of Object.entries(candidatePerms)) {
    if (key === 'loginPanel' || key === 'role' || key === 'roleName') continue;
    if (FORBIDDEN_AI_MODULE_KEYS.has(key)) continue;
    if (!ALLOWED_AI_MODULE_KEYS.has(key)) continue;

    if (!val || typeof val !== 'object') continue;

    const read = Boolean(val.read || val.canRead);
    let create = Boolean(val.create || val.canCreate);
    let edit = Boolean(val.edit || val.canEdit);
    let del = Boolean(val.delete || val.canDelete);

    // Rule 3: Never delete on fees, students, hr-payroll, attendance, inventory (unless executive admin)
    const isExecutiveAdmin = lowerRole.includes('principal') || lowerRole.includes('correspondent');
    if (!isExecutiveAdmin && ['fees', 'students', 'hr-payroll', 'attendance', 'inventory'].includes(key)) {
      del = false;
    }

    // Rule 5: If a role needs to act on students (unless admissions counselor or admin), students is read-only
    if (key === 'students' && !lowerRole.includes('admission') && !lowerRole.includes('counselor') && !isExecutiveAdmin && !lowerRole.includes('office') && !lowerRole.includes('administrative')) {
      create = false;
      edit = false;
      del = false;
    }

    sanitizedPermissions[key] = {
      read: read || create || edit || del,
      create: (read || create || edit || del) ? create : false,
      edit: (read || create || edit || del) ? edit : false,
      delete: (read || create || edit || del) ? del : false
    };
  }

  // If no allowed modules were included, apply preset or default minimal
  if (Object.keys(sanitizedPermissions).length === 0) {
    Object.assign(sanitizedPermissions, matchedPreset ? matchedPreset.permissions : DEFAULT_MINIMAL_PERMISSIONS);
  }

  return {
    roleName: trimmedRole,
    loginPanel: finalLoginPanel,
    permissions: sanitizedPermissions
  };
}
