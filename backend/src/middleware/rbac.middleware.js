import {
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
  TenantAccessError
} from '../utils/app-error.js';
import { SYSTEM_ROLES, ERROR_CODES } from '../config/constants.js';
import { CANONICAL_MODULE_KEYS } from '../modules/rbac/rbac.constants.js';
import { getUserEffectivePermissions } from '../modules/rbac/rbac.service.js';

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
 * Enforces authoritative PostgreSQL RBAC functional permissions for the requested module and operation.
 *
 * Flow:
 * 1. Checks verified authenticated user context.
 * 2. Resolves authoritative tenant context (schoolId) and rejects cross-tenant parameter conflicts.
 * 3. Checks SUPER_ADMIN bypass (scoped strictly within established tenant).
 * 4. Checks SCHOOL_ADMIN universal bypass within own tenant.
 * 5. Queries cached or PostgreSQL effective permissions via getUserEffectivePermissions(schoolId, userId).
 * 6. Evaluates requested CRUD permission(s) with conjunctive ALL-of semantics.
 * 7. Blocks unauthorized requests with standardized 403 ForbiddenError.
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
      // 1. Authoritative Tenant Context Resolution
      // Note: Never trust schoolId from body, query, or params.
      // Sourced solely from verified tenant middleware context or authenticated token.
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

      // 2. Super Admin functional bypass (universal platform access within active tenant)
      const isSuperAdmin = systemRole === SYSTEM_ROLES.SUPER_ADMIN || user.roles?.includes(SYSTEM_ROLES.SUPER_ADMIN);
      if (isSuperAdmin) {
        return next();
      }

      // 3. School Admin universal bypass within own tenant
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

      // 4. Resolve effective functional permissions (Redis cache-aside with PostgreSQL fallback)
      const userId = user.userId || user.id;
      if (!userId) {
        throw new UnauthorizedError('Invalid user context: missing user identifier', ERROR_CODES.UNAUTHORIZED);
      }

      const effectivePermissions = await getUserEffectivePermissions(schoolId, userId);

      // 5. Evaluate all required permissions
      for (const reqPerm of requirements) {
        const modulePerms = effectivePermissions?.[reqPerm.moduleKey];
        const hasPermission = Boolean(modulePerms?.[reqPerm.permField]);

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
