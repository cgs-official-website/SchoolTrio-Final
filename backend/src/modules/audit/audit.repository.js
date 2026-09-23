import { prisma } from '../../database/prisma.client.js';

/**
 * Canonical AuditLog Data Access Repository Layer
 *
 * Strict Architectural Invariants:
 * 1. schoolId is mandatory for tenant isolation.
 * 2. Non-blocking error handling in createAuditLog: catches failures and logs warnings so
 *    audit logging never aborts or rolls back primary business transactions.
 * 3. Supports optional `tx` client when executing within a transaction context.
 * 4. Read operations perform bounded parameterized ORM queries with deterministic ordering.
 *
 * @param {Object} auditData
 * @param {string} auditData.schoolId - Tenant UUID (required)
 * @param {string} auditData.entityType - 'Class' | 'Section' | 'ClassCategory' | 'SchoolRole' | 'UserRoleAssignment'
 * @param {string|null} [auditData.entityId] - Entity UUID or identifier
 * @param {string} auditData.actionPerformed - Action description
 * @param {string} [auditData.userName] - Actor name or email
 * @param {string|null} [auditData.userRole] - Actor system role
 * @param {Object|null} [auditData.modifiedFields] - Change metadata
 * @param {Object} [tx] - Optional transaction client (default: prisma)
 * @returns {Promise<Object|null>}
 */
export async function createAuditLog(auditData, tx = prisma) {
  if (!auditData?.schoolId) {
    console.error('[AUDIT LOG WARNING] Failed to record audit log: schoolId is required for tenant isolation');
    return null;
  }

  try {
    return await tx.auditLog.create({
      data: {
        schoolId: auditData.schoolId,
        entityType: auditData.entityType,
        entityId: auditData.entityId ? String(auditData.entityId) : null,
        actionPerformed: auditData.actionPerformed,
        userName: auditData.userName || 'Administrator',
        userRole: auditData.userRole || null,
        modifiedFields: auditData.modifiedFields || null
      }
    });
  } catch (err) {
    // Non-blocking: audit logging failure should not abort primary business operations
    console.error('[AUDIT LOG WARNING] Failed to record audit log:', err.message);
    return null;
  }
}

/**
 * Helper to construct parameterized Prisma WHERE clause for audit queries.
 *
 * @param {string|null} schoolId - Tenant UUID or null for global SuperAdmin query
 * @param {Object} filters - Query filters
 * @returns {Object} Prisma where input object
 */
function buildAuditWhereClause(schoolId, filters = {}) {
  const where = {};

  if (schoolId) {
    where.schoolId = schoolId;
  }

  if (filters.entityType) {
    where.entityType = filters.entityType;
  }

  if (filters.actionPerformed) {
    where.actionPerformed = {
      contains: filters.actionPerformed,
      mode: 'insensitive'
    };
  }

  if (filters.userName) {
    where.userName = {
      contains: filters.userName,
      mode: 'insensitive'
    };
  }

  if (filters.startDate || filters.endDate) {
    where.timestamp = {};

    if (filters.startDate) {
      where.timestamp.gte = new Date(filters.startDate);
    }

    if (filters.endDate) {
      const end = new Date(filters.endDate);
      if (typeof filters.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(filters.endDate)) {
        end.setUTCHours(23, 59, 59, 999);
      }
      where.timestamp.lte = end;
    }
  }

  return where;
}

/**
 * Retrieve paginated audit logs scoped strictly to a specific tenant school.
 *
 * @param {string} schoolId - Tenant UUID (required)
 * @param {Object} filters - Filter criteria
 * @param {Object} pagination - Pagination options ({ skip, take })
 * @returns {Promise<Array<Object>>}
 */
export async function findTenantAuditLogs(schoolId, filters = {}, pagination = {}) {
  const where = buildAuditWhereClause(schoolId, filters);
  const skip = pagination.skip || 0;
  const take = pagination.take || 20;

  return prisma.auditLog.findMany({
    where,
    orderBy: { timestamp: 'desc' },
    skip,
    take
  });
}

/**
 * Count total audit logs matching tenant-scoped query filters.
 *
 * @param {string} schoolId - Tenant UUID (required)
 * @param {Object} filters - Filter criteria
 * @returns {Promise<number>}
 */
export async function countTenantAuditLogs(schoolId, filters = {}) {
  const where = buildAuditWhereClause(schoolId, filters);
  return prisma.auditLog.count({ where });
}

/**
 * Retrieve paginated global audit logs across all tenants for SuperAdmin inspection.
 *
 * @param {Object} filters - Filter criteria (including optional schoolId filter)
 * @param {Object} pagination - Pagination options ({ skip, take })
 * @returns {Promise<Array<Object>>}
 */
export async function findGlobalAuditLogs(filters = {}, pagination = {}) {
  const where = buildAuditWhereClause(filters.schoolId || null, filters);
  const skip = pagination.skip || 0;
  const take = pagination.take || 20;

  return prisma.auditLog.findMany({
    where,
    include: {
      school: {
        select: {
          id: true,
          name: true,
          code: true
        }
      }
    },
    orderBy: { timestamp: 'desc' },
    skip,
    take
  });
}

/**
 * Count total audit logs matching global SuperAdmin query filters.
 *
 * @param {Object} filters - Filter criteria
 * @returns {Promise<number>}
 */
export async function countGlobalAuditLogs(filters = {}) {
  const where = buildAuditWhereClause(filters.schoolId || null, filters);
  return prisma.auditLog.count({ where });
}
