import {
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
  TenantAccessError
} from '../utils/app-error.js';
import { SYSTEM_ROLES, ERROR_CODES } from '../config/constants.js';
import { CANONICAL_MODULE_KEYS } from '../modules/rbac/rbac.constants.js';
import { getUserEffectivePermissions, isModuleApprovedForSchool } from '../modules/rbac/rbac.service.js';

const VALID_OPERATIONS = new Set(['read', 'create', 'edit', 'delete']);
const OPERATION_TO_FIELD = {
  read: 'canRead',
  create: 'canCreate',
  edit: 'canEdit',
  delete: 'canDelete'
};

/**
 * Normalizes input arguments into a list of { moduleKey, operation, permField } requirements.
 *
 * Supported signatures:
 * 1. requirePermission('students', 'read')
 * 2. requirePermission('students:read')
 * 3. requirePermission('students:read', 'students:edit')
 *
 * @param {Array} args
 * @returns {Array<{ moduleKey: string, operation: string, permField: string }>}
 */
function parsePermissionRequirements(args) {
  if (!args || args.length === 0) {
    throw new ValidationError('Permission requirement must specify at least one module and operation');
  }

  // Case 1: requirePermission(moduleKey, operation) where both are separate tokens
  if (
    args.length === 2 &&
    typeof args[0] === 'string' &&
    typeof args[1] === 'string' &&
    !args[0].includes(':') &&
    !args[1].includes(':')
  ) {
    const moduleKey = args[0].trim().toLowerCase();
    const operation = args[1].trim().toLowerCase();

    if (!CANONICAL_MODULE_KEYS.includes(moduleKey)) {
      throw new ValidationError(`Invalid RBAC module key: '${moduleKey}'`);
    }
    if (!VALID_OPERATIONS.has(operation)) {
      throw new ValidationError(`Invalid RBAC operation: '${operation}'. Must be one of: read, create, edit, delete`);
    }

    return [{
      moduleKey,
      operation,
      permField: OPERATION_TO_FIELD[operation]
    }];
  }

  // Case 2: Array of colon-separated strings e.g. 'students:read', 'students:edit'
  const requirements = [];
  for (const arg of args) {
    if (typeof arg !== 'string' || !arg.trim()) {
      throw new ValidationError('Permission requirement tokens must be non-empty strings');
    }

    const trimmed = arg.trim().toLowerCase();
    if (trimmed.includes(':')) {
      const [moduleKey, operation] = trimmed.split(':');
      if (!CANONICAL_MODULE_KEYS.includes(moduleKey)) {
        throw new ValidationError(`Invalid RBAC module key: '${moduleKey}'`);
      }
      if (!VALID_OPERATIONS.has(operation)) {
        throw new ValidationError(`Invalid RBAC operation: '${operation}'. Must be one of: read, create, edit, delete`);
      }
      requirements.push({
        moduleKey,
        operation,
        permField: OPERATION_TO_FIELD[operation]
      });
    } else {
      throw new ValidationError(
        `Invalid permission requirement format: '${arg}'. Must be (moduleKey, operation) or 'module:operation'`
      );
    }
  }

  return requirements;
}

/**
 * Enforces that the authenticated user possesses at least one of the specified system roles.
 *
 * @param {...string} allowedRoles - List of authorized roles
 * @returns {import('express').RequestHandler}
 */
export const requireRole = (...allowedRoles) => {
  return (req, _res, next) => {
    const user = req.auth || req.user;

    if (!user) {
      return next(new UnauthorizedError('Authentication required to access this resource', ERROR_CODES.UNAUTHORIZED));
    }

    const systemRole = user.systemRole || user.role;

    // Super Admin has universal access
    if (systemRole === SYSTEM_ROLES.SUPER_ADMIN || user.roles?.includes(SYSTEM_ROLES.SUPER_ADMIN)) {
      return next();
    }

    const userRoles = Array.isArray(user.roles) ? user.roles : (systemRole ? [systemRole] : []);

    // Expand administrative role aliases (TENANT_ADMIN, ADMIN, SCHOOL_ADMIN)
    const ADMIN_ROLES = ['SCHOOL_ADMIN', 'TENANT_ADMIN', 'ADMIN'];
    const expandedUserRoles = new Set(userRoles);
    if (userRoles.some(r => ADMIN_ROLES.includes(r))) {
      ADMIN_ROLES.forEach(r => expandedUserRoles.add(r));
    }

    // Expand teaching/staff role aliases for users with functional role assignments or staff profile
    if (
      userRoles.some(r => ['TEACHER', 'STAFF'].includes(r)) ||
      (user.roleAssignments && user.roleAssignments.length > 0) ||
      user.staffProfile
    ) {
      expandedUserRoles.add('TEACHER');
      expandedUserRoles.add('STAFF');
    }

    const hasRole = allowedRoles.some(role => expandedUserRoles.has(role));

    if (!hasRole) {
      return next(
        new ForbiddenError(`Access denied: required role in [${allowedRoles.join(', ')}]`, ERROR_CODES.FORBIDDEN)
      );
    }

    next();
  };
};

/**
 * Enforces authoritative PostgreSQL RBAC functional permissions for the requested module and operation,
 * subject to Subscription Plan / Tenant Approved Module Feature Gating.
 *
 * Flow:
 * 1. Checks verified authenticated user context.
 * 2. Unswitched platform-global SuperAdmin bypasses tenant context requirement.
 * 3. Resolves authoritative tenant context (schoolId) and rejects cross-tenant parameter conflicts.
 * 4. ENFORCES TENANT FEATURE GATING: Verifies module is approved for the tenant (applies to ALL roles including School Admin & SuperAdmin in tenant context).
 * 5. Checks SUPER_ADMIN bypass (scoped within tenant context for approved tenant modules).
 * 6. Checks SCHOOL_ADMIN universal bypass within own tenant (for approved tenant modules).
 * 7. Queries cached or PostgreSQL effective permissions via getUserEffectivePermissions(schoolId, userId).
 * 8. Evaluates requested CRUD permission(s) with conjunctive ALL-of semantics.
 * 9. Blocks unauthorized requests with standardized 403 ForbiddenError.
 *
 * @param {...string} args - (moduleKey, operation) or ('module:operation', ...)
 * @returns {import('express').RequestHandler}
 */
export const requirePermission = (...args) => {
  const requirements = parsePermissionRequirements(args);

  return async (req, _res, next) => {
    try {
      const user = req.auth || req.user;

      if (!user) {
        throw new UnauthorizedError('Authentication required to access this resource', ERROR_CODES.UNAUTHORIZED);
      }

      const systemRole = user.systemRole || user.role;
      const isSuperAdmin = systemRole === SYSTEM_ROLES.SUPER_ADMIN || user.roles?.includes(SYSTEM_ROLES.SUPER_ADMIN);

      // 1. Authoritative Tenant Context Resolution
      const schoolId = req.tenant?.schoolId || req.auth?.schoolId || req.user?.schoolId;

      if (!schoolId) {
        throw new TenantAccessError('Tenant context required to evaluate permissions');
      }

      // Prevent cross-tenant poisoning if client passed conflicting schoolId in body, query, or params
      const candidateSchoolIds = [
        req.body?.schoolId,
        req.query?.schoolId,
        req.params?.schoolId
      ].filter(Boolean);

      for (const candidate of candidateSchoolIds) {
        if (candidate !== schoolId) {
          throw new TenantAccessError(
            `Cross-tenant access rejected: request parameter specifies schoolId '${candidate}' which conflicts with authoritative tenant '${schoolId}'`
          );
        }
      }

      // 2. TENANT FEATURE GATING: Verify module is approved for the tenant
      // Applies strictly to ALL tenant requests, including School Admin and tenant-switched SuperAdmin
      for (const reqPerm of requirements) {
        const isApproved = await isModuleApprovedForSchool(schoolId, reqPerm.moduleKey);
        if (!isApproved) {
          throw new ForbiddenError(
            `Access denied: module '${reqPerm.moduleKey}' is not enabled or approved for this school tenant`,
            ERROR_CODES.FORBIDDEN
          );
        }
      }

      // 3. Super Admin tenant-switched bypass (for approved tenant modules)
      if (isSuperAdmin) {
        return next();
      }

      // 4. School Admin universal bypass within own tenant (strictly AFTER feature gating check!)
      const isSchoolAdmin =
        systemRole === SYSTEM_ROLES.SCHOOL_ADMIN ||
        systemRole === SYSTEM_ROLES.PRINCIPAL ||
        systemRole === 'TENANT_ADMIN' ||
        systemRole === 'ADMIN' ||
        systemRole === 'PRINCIPAL' ||
        user.roles?.includes(SYSTEM_ROLES.SCHOOL_ADMIN) ||
        user.roles?.includes(SYSTEM_ROLES.PRINCIPAL) ||
        user.roles?.includes('TENANT_ADMIN') ||
        user.roles?.includes('ADMIN') ||
        user.roles?.includes('PRINCIPAL');
      if (isSchoolAdmin) {
        return next();
      }

      // 5. Resolve effective functional permissions for custom roles
      const userId = user.userId || user.id;
      if (!userId) {
        throw new UnauthorizedError('Invalid user context: missing user identifier', ERROR_CODES.UNAUTHORIZED);
      }

      const effectivePermissions = await getUserEffectivePermissions(schoolId, userId);

      // 6. Evaluate all required permissions with conjunctive ALL-of semantics
      const systemRoleUpper = String(systemRole || '').toUpperCase();
      const isTeacherRole = systemRoleUpper === 'TEACHER' || user.roles?.includes('TEACHER') || Boolean(user.staffProfile);

      for (const reqPerm of requirements) {
        const modulePerms = effectivePermissions?.[reqPerm.moduleKey];
        let hasPermission = false;

        if (modulePerms && typeof modulePerms[reqPerm.permField] === 'boolean') {
          hasPermission = modulePerms[reqPerm.permField];
        }

        // System-wide fallback for TEACHER role for read operations on core educational modules
        if (!hasPermission && isTeacherRole && reqPerm.operation === 'read') {
          const DEFAULT_TEACHER_READ_MODULES = [
            'students', 'classes', 'subjects', 'attendance', 'homework',
            'timetables', 'noticeboard', 'lesson_plans', 'resources', 'calendar', 'chats', 'exams', 'performance'
          ];
          if (DEFAULT_TEACHER_READ_MODULES.includes(reqPerm.moduleKey)) {
            hasPermission = true;
          }
        }

        if (!hasPermission) {
          throw new ForbiddenError(
            `Access denied: missing '${reqPerm.operation}' permission for module '${reqPerm.moduleKey}'`,
            ERROR_CODES.FORBIDDEN
          );
        }
      }

      // Attach authoritative permissions to request for downstream handler usage
      req.permissions = effectivePermissions;

      next();
    } catch (err) {
      next(err);
    }
  };
};

