import { Prisma } from '@prisma/client';

/**
 * Custom error thrown when a tenant isolation boundary is violated or missing.
 */
export class TenantAccessError extends Error {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(message);
    this.name = 'TenantAccessError';
    this.status = 403;
  }
}

/**
 * Platform global and system-level models that are not scoped to a single tenant school.
 * These models bypass automatic tenant filtering unless explicitly requested.
 */
export const GLOBAL_MODELS = new Set([
  'School',
  'SubscriptionPlan',
  'User',
  'RefreshSession',
  'PasswordResetToken',
  'MigrationIdMap',
  'AuditLog',
  'RolePermission',
  'PlatformSetting'
]);


/**
 * Enforces tenant isolation on `where` clauses for multi-record operations.
 *
 * @param {Object} safeArgs - The query arguments
 * @param {string} tenantSchoolId - Current active tenant ID
 * @param {string} model - Prisma model name
 */
export function enforceWhereSchoolId(safeArgs, tenantSchoolId, model) {
  if (!safeArgs.where) {
    safeArgs.where = { schoolId: tenantSchoolId };
    return;
  }

  // Reject explicit conflicting schoolId in criteria
  if (safeArgs.where.schoolId && safeArgs.where.schoolId !== tenantSchoolId) {
    throw new TenantAccessError(
      `Cross-tenant access rejected: criteria specifies schoolId '${safeArgs.where.schoolId}' which conflicts with active tenant '${tenantSchoolId}' on model '${model}'.`
    );
  }

  // Compound filter ensuring schoolId is strictly AND-applied
  safeArgs.where = {
    AND: [
      safeArgs.where,
      { schoolId: tenantSchoolId }
    ]
  };
}

/**
 * Enforces compound tenant-safe criteria on `where` clauses for unique-record operations
 * (findUnique, update, delete, upsert).
 *
 * @param {Object} safeArgs - The query arguments
 * @param {string} tenantSchoolId - Current active tenant ID
 * @param {string} model - Prisma model name
 */
export function enforceUniqueCriteria(safeArgs, tenantSchoolId, model) {
  if (!safeArgs.where) {
    throw new TenantAccessError(
      `Invalid query: missing where criteria for unique operation on tenant model '${model}'.`
    );
  }

  const where = safeArgs.where;

  // Case 1: Caller provided compound schoolId_id: { schoolId, id }
  if (where.schoolId_id) {
    if (where.schoolId_id.schoolId && where.schoolId_id.schoolId !== tenantSchoolId) {
      throw new TenantAccessError(
        `Cross-tenant access rejected: criteria specifies schoolId '${where.schoolId_id.schoolId}' which conflicts with active tenant '${tenantSchoolId}' on model '${model}'.`
      );
    }
    where.schoolId_id.schoolId = tenantSchoolId;
    return;
  }

  // Case 2: Caller provided compound unique key starting with schoolId_
  const compoundKey = Object.keys(where).find((k) => k.startsWith('schoolId_'));
  if (compoundKey && typeof where[compoundKey] === 'object' && where[compoundKey] !== null) {
    if (where[compoundKey].schoolId && where[compoundKey].schoolId !== tenantSchoolId) {
      throw new TenantAccessError(
        `Cross-tenant access rejected: compound key '${compoundKey}' specifies schoolId '${where[compoundKey].schoolId}' which conflicts with active tenant '${tenantSchoolId}' on model '${model}'.`
      );
    }
    where[compoundKey].schoolId = tenantSchoolId;
    return;
  }

  // Case 3: Caller provided simple id: 'uuid'
  // Rewrite to compound criteria { schoolId_id: { schoolId, id } }
  if (where.id) {
    safeArgs.where = {
      schoolId_id: {
        schoolId: tenantSchoolId,
        id: where.id
      }
    };
    return;
  }

  // Case 4: Any direct schoolId specified at root of where
  if (where.schoolId && where.schoolId !== tenantSchoolId) {
    throw new TenantAccessError(
      `Cross-tenant access rejected: criteria specifies schoolId '${where.schoolId}' which conflicts with active tenant '${tenantSchoolId}' on model '${model}'.`
    );
  }

  // If no recognized compound unique key, inject schoolId
  where.schoolId = tenantSchoolId;
}

/**
 * Core tenant operation interceptor. Evaluates tenant context, enforces isolation,
 * rewrites queries, and rejects cross-tenant violations.
 *
 * @param {Object} params
 * @param {string} params.model - Prisma model name
 * @param {string} params.operation - Prisma operation name
 * @param {Object} params.args - Query arguments
 * @param {Function} params.query - Inner query execution callback
 * @param {Function} params.getTenantContext - Context retrieval function
 */
export async function handleTenantOperation({ model, operation, args, query, getTenantContext }) {
  // If model is undefined (raw SQL) or is a global model, execute directly
  if (!model || GLOBAL_MODELS.has(model)) {
    return query(args);
  }

  const context = getTenantContext ? getTenantContext() : undefined;

  // 3. Explicit bypass for system-level access (seeds, migrations, cross-tenant maintenance)
  if (context?.bypassTenant === true) {
    return query(args);
  }

  // 2. Missing tenant context: strictly reject tenant-scoped access
  if (!context || !context.schoolId) {
    throw new TenantAccessError(
      `Tenant context missing: access to tenant-scoped model '${model}' requires an active school context or explicit bypassTenant.`
    );
  }

  const tenantSchoolId = context.schoolId;
  const safeArgs = args ? { ...args } : {};

  switch (operation) {
    // 5. create: ensure records cannot be created under another tenant
    case 'create': {
      const data = safeArgs.data ? { ...safeArgs.data } : {};
      if (data.schoolId && data.schoolId !== tenantSchoolId) {
        throw new TenantAccessError(
          `Cross-tenant mutation rejected: attempted to create '${model}' for schoolId '${data.schoolId}' while active tenant context is '${tenantSchoolId}'.`
        );
      }
      data.schoolId = tenantSchoolId;
      safeArgs.data = data;
      return query(safeArgs);
    }

    // 5. createMany: ensure all records are scoped to active tenant
    case 'createMany': {
      if (Array.isArray(safeArgs.data)) {
        safeArgs.data = safeArgs.data.map((item) => {
          if (item.schoolId && item.schoolId !== tenantSchoolId) {
            throw new TenantAccessError(
              `Cross-tenant mutation rejected: attempted to create '${model}' for schoolId '${item.schoolId}' while active tenant context is '${tenantSchoolId}'.`
            );
          }
          return { ...item, schoolId: tenantSchoolId };
        });
      } else if (safeArgs.data) {
        if (safeArgs.data.schoolId && safeArgs.data.schoolId !== tenantSchoolId) {
          throw new TenantAccessError(
            `Cross-tenant mutation rejected: attempted to create '${model}' for schoolId '${safeArgs.data.schoolId}' while active tenant context is '${tenantSchoolId}'.`
          );
        }
        safeArgs.data = { ...safeArgs.data, schoolId: tenantSchoolId };
      }
      return query(safeArgs);
    }

    // 6. findFirst, findMany, count, aggregate, groupBy: enforce schoolId
    case 'findFirst':
    case 'findMany':
    case 'count':
    case 'aggregate':
    case 'groupBy': {
      enforceWhereSchoolId(safeArgs, tenantSchoolId, model);
      return query(safeArgs);
    }

    // 7. findUnique: compound tenant-safe criteria
    case 'findUnique': {
      enforceUniqueCriteria(safeArgs, tenantSchoolId, model);
      return query(safeArgs);
    }

    // 7. update & delete: compound tenant-safe criteria + prevent altering schoolId
    case 'update':
    case 'delete': {
      enforceUniqueCriteria(safeArgs, tenantSchoolId, model);
      if (operation === 'update' && safeArgs.data) {
        const data = { ...safeArgs.data };
        if (data.schoolId && data.schoolId !== tenantSchoolId) {
          throw new TenantAccessError(
            `Cross-tenant mutation rejected: cannot alter schoolId to '${data.schoolId}' on model '${model}'.`
          );
        }
        delete data.schoolId; // Prevent changing schoolId on update
        safeArgs.data = data;
      }
      return query(safeArgs);
    }

    // updateMany & deleteMany
    case 'updateMany':
    case 'deleteMany': {
      enforceWhereSchoolId(safeArgs, tenantSchoolId, model);
      if (operation === 'updateMany' && safeArgs.data) {
        const data = { ...safeArgs.data };
        if (data.schoolId && data.schoolId !== tenantSchoolId) {
          throw new TenantAccessError(
            `Cross-tenant mutation rejected: cannot alter schoolId to '${data.schoolId}' on model '${model}'.`
          );
        }
        delete data.schoolId;
        safeArgs.data = data;
      }
      return query(safeArgs);
    }

    // 8. upsert: explicitly handle tenant-safe unique criteria
    case 'upsert': {
      enforceUniqueCriteria(safeArgs, tenantSchoolId, model);
      if (safeArgs.create) {
        const createData = { ...safeArgs.create };
        if (createData.schoolId && createData.schoolId !== tenantSchoolId) {
          throw new TenantAccessError(
            `Cross-tenant mutation rejected: attempted to upsert create '${model}' for schoolId '${createData.schoolId}' while active tenant context is '${tenantSchoolId}'.`
          );
        }
        createData.schoolId = tenantSchoolId;
        safeArgs.create = createData;
      }
      if (safeArgs.update) {
        const updateData = { ...safeArgs.update };
        if (updateData.schoolId && updateData.schoolId !== tenantSchoolId) {
          throw new TenantAccessError(
            `Cross-tenant mutation rejected: cannot alter schoolId to '${updateData.schoolId}' in upsert on model '${model}'.`
          );
        }
        delete updateData.schoolId;
        safeArgs.update = updateData;
      }
      return query(safeArgs);
    }

    default: {
      return query(safeArgs);
    }
  }
}

/**
 * Creates the Prisma Tenant Extension that enforces strict multi-tenant isolation.
 *
 * @param {Function} getTenantContext - Function returning the current tenant execution context
 * @returns {import('@prisma/client').PrismaExtension}
 */
export const createTenantExtension = (getTenantContext) => {
  return Prisma.defineExtension({
    name: 'prisma-tenant-extension',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          return handleTenantOperation({ model, operation, args, query, getTenantContext });
        }
      }
    }
  });
};
