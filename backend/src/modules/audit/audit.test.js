import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as auditSchemas from './audit.schemas.js';
import * as auditService from './audit.service.js';
import * as auditRepository from './audit.repository.js';
import { prisma } from '../../database/prisma.client.js';
import { requireRole } from '../../middleware/rbac.middleware.js';
import { SYSTEM_ROLES } from '../../config/constants.js';

vi.mock('../../database/prisma.client.js', () => ({
  prisma: {
    auditLog: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      groupBy: vi.fn()
    },
    $transaction: vi.fn(async (cb) => cb(prisma))
  }
}));

describe('SUPERADMIN-AUDIT-003: Backend Audit Logs Suite', () => {
  beforeEach(() => {
    prisma.auditLog.findMany.mockReset();
    prisma.auditLog.count.mockReset();
    prisma.auditLog.groupBy.mockReset();
    prisma.auditLog.create.mockReset();

    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.auditLog.count.mockResolvedValue(0);
    prisma.auditLog.groupBy.mockResolvedValue([]);
  });

  describe('1. Schema Validation (audit.schemas.js)', () => {
    it('accepts valid query parameters for SuperAdmin audit query', () => {
      const validQuery = {
        search: 'PROVISION',
        schoolId: '11111111-1111-4111-8111-111111111111',
        entityType: 'School',
        action: 'PROVISION_TENANT',
        actor: 'superadmin@example.com',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        page: '2',
        limit: '25',
        includeSummary: 'true'
      };

      const parsed = auditSchemas.listSuperAdminAuditLogsSchema.query.safeParse(validQuery);
      expect(parsed.success).toBe(true);
      expect(parsed.data.page).toBe(2);
      expect(parsed.data.limit).toBe(25);
      expect(parsed.data.includeSummary).toBe(true);
    });

    it('rejects search keyword exceeding 100 characters', () => {
      const longKeyword = 'a'.repeat(101);
      const invalidQuery = { search: longKeyword };
      const parsed = auditSchemas.listSuperAdminAuditLogsSchema.query.safeParse(invalidQuery);
      expect(parsed.success).toBe(false);
      expect(parsed.error.issues[0].message).toContain('100 characters');
    });

    it('rejects invalid date strings in startDate and endDate', () => {
      const invalidDates = { startDate: 'not-a-date', endDate: 'invalid' };
      const parsed = auditSchemas.listSuperAdminAuditLogsSchema.query.safeParse(invalidDates);
      expect(parsed.success).toBe(false);
    });

    it('rejects invalid UUID for schoolId in SuperAdmin schema', () => {
      const invalidSchoolId = { schoolId: 'not-a-uuid' };
      const parsed = auditSchemas.listSuperAdminAuditLogsSchema.query.safeParse(invalidSchoolId);
      expect(parsed.success).toBe(false);
    });
  });

  describe('2. Repository Where Clause & Summary Support (audit.repository.js)', () => {
    it('builds case-insensitive search across action, actor, entity, and school name/code', async () => {
      prisma.auditLog.findMany.mockResolvedValueOnce([]);
      prisma.auditLog.count.mockResolvedValueOnce(0);

      await auditRepository.findGlobalAuditLogs(
        { search: 'Lincoln' },
        { skip: 0, take: 10, sort: 'timestamp', order: 'desc' }
      );

      expect(prisma.auditLog.findMany).toHaveBeenCalled();
      const callArgs = prisma.auditLog.findMany.mock.calls[0][0];
      const where = callArgs.where;

      expect(where.OR).toBeDefined();
      expect(where.OR).toEqual(
        expect.arrayContaining([
          { actionPerformed: { contains: 'Lincoln', mode: 'insensitive' } },
          { userName: { contains: 'Lincoln', mode: 'insensitive' } },
          { entityType: { contains: 'Lincoln', mode: 'insensitive' } },
          { entityId: { contains: 'Lincoln', mode: 'insensitive' } },
          { school: { name: { contains: 'Lincoln', mode: 'insensitive' } } },
          { school: { code: { contains: 'Lincoln', mode: 'insensitive' } } }
        ])
      );
    });

    it('correctly combines search, schoolId, entityType, and date ranges', async () => {
      prisma.auditLog.findMany.mockResolvedValueOnce([]);
      prisma.auditLog.count.mockResolvedValueOnce(0);

      const schoolId = '11111111-1111-4111-8111-111111111111';
      await auditRepository.findGlobalAuditLogs(
        {
          search: 'Admin',
          schoolId,
          entityType: 'User',
          startDate: '2026-03-01',
          endDate: '2026-03-31'
        },
        { skip: 0, take: 10, sort: 'timestamp', order: 'desc' }
      );

      const callArgs = prisma.auditLog.findMany.mock.calls[0][0];
      const where = callArgs.where;

      expect(where.schoolId).toBe(schoolId);
      expect(where.entityType).toBe('User');
      expect(where.timestamp.gte).toEqual(new Date('2026-03-01T00:00:00.000Z'));
      expect(where.timestamp.lte).toEqual(new Date('2026-03-31T23:59:59.999Z'));
      expect(where.OR).toBeDefined();
    });

    it('calculates audit summary metrics server-side over the exact filter scope', async () => {
      prisma.auditLog.count.mockImplementation(async ({ where }) => {
        if (where?.timestamp?.gte) {
          return 5; // todayCount
        }
        return 42; // total
      });
      prisma.auditLog.findMany.mockResolvedValue([
        { userName: 'alice@example.com' },
        { userName: 'bob@example.com' }
      ]);
      prisma.auditLog.groupBy.mockResolvedValue([
        { entityType: 'School', _count: { id: 30 } },
        { entityType: 'User', _count: { id: 12 } }
      ]);

      const summary = await auditRepository.getAuditSummary(null, { search: 'Test' });

      expect(summary.totalEvents).toBe(42);
      expect(summary.todayEvents).toBe(5);
      expect(summary.distinctActors).toBe(2);
      expect(summary.topEntityTypes).toEqual([
        { entityType: 'School', count: 30 },
        { entityType: 'User', count: 12 }
      ]);
    });
  });

  describe('3. Sensitive-Field Redaction & Service Layer (audit.service.js)', () => {
    it('recursively redacts passwords, tokens, API keys, and authorization secrets', async () => {
      const mockRawLogs = [
        {
          id: 'log-1',
          actionPerformed: 'UPDATE_TENANT_CONFIG',
          userName: 'superadmin@example.com',
          userRole: 'SUPER_ADMIN',
          schoolId: 'school-1',
          entityType: 'School',
          entityId: 'school-1',
          timestamp: new Date(),
          modifiedFields: {
            safeField: 'active',
            password: 'SuperSecretPassword123!',
            adminPasswordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz',
            nested: {
              token: 'jwt-token-string',
              apiKey: 'sk_live_12345',
              subNested: {
                secret: 'shhh',
                authorization: 'Bearer token-value',
                normalKey: 'visible-value'
              }
            }
          }
        }
      ];

      prisma.auditLog.findMany.mockResolvedValue(mockRawLogs);
      prisma.auditLog.count.mockResolvedValue(1);

      const result = await auditService.getGlobalAuditLogs({});

      expect(result.logs.length).toBe(1);
      const sanitized = result.logs[0].modifiedFields;
      expect(sanitized.safeField).toBe('active');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.adminPasswordHash).toBe('[REDACTED]');
      expect(sanitized.nested.token).toBe('[REDACTED]');
      expect(sanitized.nested.apiKey).toBe('[REDACTED]');
      expect(sanitized.nested.subNested.secret).toBe('[REDACTED]');
      expect(sanitized.nested.subNested.authorization).toBe('[REDACTED]');
      expect(sanitized.nested.subNested.normalKey).toBe('visible-value');
    });

    it('enforces tenant-scoped query for getTenantAuditLogs', async () => {
      const schoolId = 'tenant-school-1';
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);

      await auditService.getTenantAuditLogs(schoolId, { search: 'Role' });

      expect(prisma.auditLog.findMany).toHaveBeenCalled();
      const where = prisma.auditLog.findMany.mock.calls[0][0].where;
      expect(where.schoolId).toBe(schoolId);
    });
  });

  describe('4. RBAC & Security Middleware Verification', () => {
    it('allows SUPER_ADMIN on SuperAdmin endpoints and blocks non-superadmins with 403', () => {
      const superAdminReq = {
        user: { id: 'u-1', systemRole: SYSTEM_ROLES.SUPER_ADMIN, role: SYSTEM_ROLES.SUPER_ADMIN }
      };
      const schoolAdminReq = {
        user: { id: 'u-2', systemRole: SYSTEM_ROLES.SCHOOL_ADMIN, role: SYSTEM_ROLES.SCHOOL_ADMIN }
      };
      const res = {};
      const nextSuperAdmin = vi.fn();
      const nextSchoolAdmin = vi.fn();

      const middleware = requireRole(SYSTEM_ROLES.SUPER_ADMIN);

      // SuperAdmin execution
      middleware(superAdminReq, res, nextSuperAdmin);
      expect(nextSuperAdmin).toHaveBeenCalledWith();

      // SchoolAdmin execution
      middleware(schoolAdminReq, res, nextSchoolAdmin);
      expect(nextSchoolAdmin).toHaveBeenCalled();
      const err = nextSchoolAdmin.mock.calls[0][0];
      expect(err).toBeDefined();
      expect(err.statusCode).toBe(403);
    });
  });

  describe('5. Audit Writing & Atomic Transaction Behavior', () => {
    it('handles database write failure safely without falsely returning success', async () => {
      const auditPayload = {
        schoolId: '11111111-1111-4111-8111-111111111111',
        entityType: 'School',
        entityId: '11111111-1111-4111-8111-111111111111',
        actionPerformed: 'PROVISION_TENANT',
        userName: 'superadmin@example.com',
        userRole: SYSTEM_ROLES.SUPER_ADMIN,
        modifiedFields: { code: 'SCH-01' }
      };

      prisma.auditLog.create.mockRejectedValueOnce(new Error('DB transaction constraint failure'));

      const result = await auditRepository.createAuditLog(auditPayload, prisma);
      expect(result).toBeNull();
    });

    it('rejects audit write if schoolId is missing to protect tenant isolation', async () => {
      const missingSchoolId = {
        entityType: 'School',
        actionPerformed: 'PROVISION_TENANT'
      };

      const result = await auditRepository.createAuditLog(missingSchoolId, prisma);
      expect(result).toBeNull();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });
  });
});
