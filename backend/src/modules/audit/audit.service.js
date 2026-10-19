import * as auditRepository from './audit.repository.js';
import { parsePagination, buildPaginationMetadata } from '../../utils/pagination.js';
import { ValidationError } from '../../utils/app-error.js';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'password_hash',
  'adminpassword',
  'adminpasswordhash',
  'token',
  'refreshtoken',
  'refresh_token',
  'accesstoken',
  'access_token',
  'tokenhash',
  'token_hash',
  'secret',
  'apikey',
  'apikeys',
  'apikeysencrypted',
  'api_keys_encrypted',
  'authorization',
  'bearer',
  'cookie',
  'creditcard',
  'credit_card'
]);

/**
 * Recursively redacts sensitive keys from audit log change metadata.
 *
 * @param {any} fields - Raw modifiedFields metadata
 * @returns {any} Sanitized modifiedFields
 */
function sanitizeModifiedFields(fields) {
  if (!fields || typeof fields !== 'object') {
    return fields;
  }

  if (Array.isArray(fields)) {
    return fields.map((item) => sanitizeModifiedFields(item));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(fields)) {
    const normalizedKey = key.toLowerCase().replace(/[-_]/g, '');
    if (
      SENSITIVE_KEYS.has(normalizedKey) || 
      /password|secret|token|hash|apikey|authorization|bearer|credential/i.test(key)
    ) {
      sanitized[key] = '[REDACTED]';
    } else if (value && typeof value === 'object') {
      sanitized[key] = sanitizeModifiedFields(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Formats a raw AuditLog database record into a secure, standardized DTO.
 *
 * @param {Object} log - Prisma audit log record
 * @returns {Object} Clean DTO
 */
function formatAuditLogDto(log) {
  return {
    id: log.id,
    schoolId: log.schoolId,
    entityType: log.entityType,
    entityId: log.entityId,
    actionPerformed: log.actionPerformed,
    userName: log.userName,
    userRole: log.userRole,
    modifiedFields: sanitizeModifiedFields(log.modifiedFields),
    timestamp: log.timestamp instanceof Date ? log.timestamp.toISOString() : log.timestamp,
    ...(log.school && {
      school: {
        id: log.school.id,
        name: log.school.name,
        code: log.school.code
      }
    })
  };
}

/**
 * Retrieve paginated, filtered audit logs for an authenticated school tenant.
 *
 * @param {string} schoolId - Tenant UUID (from req.tenant.schoolId)
 * @param {Object} query - Validated query parameters
 * @returns {Promise<{ logs: Array<Object>, pagination: Object }>}
 */
export async function getTenantAuditLogs(schoolId, query = {}) {
  if (!schoolId) {
    throw new ValidationError('Tenant context (schoolId) is required');
  }

  const { page, limit, skip, take } = parsePagination(query, {
    defaultSort: 'timestamp',
    defaultOrder: 'desc'
  });

  const filterOptions = {
    search: query.search,
    entityType: query.entityType,
    actionPerformed: query.actionPerformed || query.action,
    userName: query.userName || query.actor,
    startDate: query.startDate,
    endDate: query.endDate
  };

  const [logs, total, summary] = await Promise.all([
    auditRepository.findTenantAuditLogs(schoolId, filterOptions, { skip, take }),
    auditRepository.countTenantAuditLogs(schoolId, filterOptions),
    auditRepository.getAuditSummary(schoolId, filterOptions)
  ]);

  const pagination = buildPaginationMetadata(total, page, limit);

  return {
    logs: logs.map(formatAuditLogDto),
    pagination,
    summary
  };
}

/**
 * Retrieve paginated, filtered global audit logs across all tenants for SuperAdmin.
 *
 * @param {Object} query - Validated query parameters (including optional schoolId filter)
 * @returns {Promise<{ logs: Array<Object>, pagination: Object, summary: Object }>}
 */
export async function getGlobalAuditLogs(query = {}) {
  const { page, limit, skip, take } = parsePagination(query, {
    defaultSort: 'timestamp',
    defaultOrder: 'desc'
  });

  const filterOptions = {
    search: query.search,
    schoolId: query.schoolId,
    entityType: query.entityType,
    actionPerformed: query.actionPerformed || query.action,
    userName: query.userName || query.actor,
    startDate: query.startDate,
    endDate: query.endDate
  };

  const [logs, total, summary] = await Promise.all([
    auditRepository.findGlobalAuditLogs(filterOptions, { skip, take }),
    auditRepository.countGlobalAuditLogs(filterOptions),
    auditRepository.getAuditSummary(filterOptions.schoolId || null, filterOptions)
  ]);

  const pagination = buildPaginationMetadata(total, page, limit);

  return {
    logs: logs.map(formatAuditLogDto),
    pagination,
    summary
  };
}
