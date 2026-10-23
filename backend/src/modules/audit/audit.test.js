import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as auditSchemas from './audit.schemas.js';
import * as auditService from './audit.service.js';
import * as auditRepository from './audit.repository.js';
import { prisma } from '../../database/prisma.client.js';
import { requireRole } from '../../middleware/rbac.middleware.js';
import { SYSTEM_ROLES } from '../../config/constants.js';
import { auditRouter } from './audit.routes.js';

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

describe('SCHOOLADMIN-AUDIT-001 & SUPERADMIN-AUDIT-003: Audit Logs Backend Suite', () => {
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
    it('accepts valid query parameters for Tenant audit query', () => {
      const validTenantQuery = {
        search: 'Attendance',
        entityType: 'Attendance',
        action: 'SUBMIT_ATTENDANCE_SESSION',
        actor: 'admin@school.com',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        page: '1',
        limit: '20',
        includeSummary: 'true'
      };

      const parsed = auditSchemas.listTenantAuditLogsSchema.query.safeParse(validTenantQuery);
      expect(parsed.success).toBe(true);
      expect(parsed.data.page).toBe(1);
      expect(parsed.data.limit).toBe(20);
      expect(parsed.data.includeSummary).toBe(true);
    });

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
      const parsed = auditSchemas.listTenantAuditLogsSchema.query.safeParse(invalidQuery);
      expect(parsed.success).toBe(false);
      expect(parsed.error.issues[0].message).toContain('100 characters');
    });

    it('rejects invalid date strings in startDate and endDate', () => {
      const invalidDates = { startDate: 'not-a-date', endDate: 'invalid' };
      const parsed = auditSchemas.listTenantAuditLogsSchema.query.safeParse(invalidDates);
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

    it('correctly scopes tenant audit queries to the provided schoolId', async () => {
      const tenantSchoolId = '11111111-1111-4111-8111-111111111111';
      prisma.auditLog.findMany.mockResolvedValueOnce([]);
      prisma.auditLog.count.mockResolvedValueOnce(0);

      await auditRepository.findTenantAuditLogs(
        tenantSchoolId,
        { search: 'Student', entityType: 'Student' },
        { skip: 0, take: 10 }
      );

      expect(prisma.auditLog.findMany).toHaveBeenCalled();
      const where = prisma.auditLog.findMany.mock.calls[0][0].where;
      expect(where.schoolId).toBe(tenantSchoolId);
      expect(where.entityType).toBe('Student');
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

    it('enforces tenant-scoped query for getTenantAuditLogs and prevents cross-tenant parameter poisoning', async () => {
      const authenticSchoolId = 'tenant-school-1';
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);

      // Even if attacker passes a different schoolId in query object, service strictly uses the parameter schoolId
      await auditService.getTenantAuditLogs(authenticSchoolId, {
        schoolId: 'attacker-target-school-2',
        search: 'Role'
      });

      expect(prisma.auditLog.findMany).toHaveBeenCalled();
      const where = prisma.auditLog.findMany.mock.calls[0][0].where;
      expect(where.schoolId).toBe(authenticSchoolId);
      expect(where.schoolId).not.toBe('attacker-target-school-2');
    });

    it('throws validation error if schoolId is missing in getTenantAuditLogs', async () => {
      await expect(
        auditService.getTenantAuditLogs(null, { search: 'Test' })
      ).rejects.toThrow('Tenant context (schoolId) is required');
    });
  });

  describe('4. RBAC & Security Middleware Verification', () => {
    it('allows SUPER_ADMIN, SCHOOL_ADMIN, and PRINCIPAL on Tenant audit endpoints', () => {
      const superAdminReq = {
        user: { id: 'u-1', systemRole: SYSTEM_ROLES.SUPER_ADMIN, role: SYSTEM_ROLES.SUPER_ADMIN }
      };
      const schoolAdminReq = {
        user: { id: 'u-2', systemRole: SYSTEM_ROLES.SCHOOL_ADMIN, role: SYSTEM_ROLES.SCHOOL_ADMIN }
      };
      const principalReq = {
        user: { id: 'u-3', systemRole: SYSTEM_ROLES.PRINCIPAL, role: SYSTEM_ROLES.PRINCIPAL }
      };
      const res = {};
      const next1 = vi.fn();
      const next2 = vi.fn();
      const next3 = vi.fn();

      const middleware = requireRole(
        SYSTEM_ROLES.SUPER_ADMIN,
        SYSTEM_ROLES.SCHOOL_ADMIN,
        SYSTEM_ROLES.PRINCIPAL
      );

      middleware(superAdminReq, res, next1);
      expect(next1).toHaveBeenCalledWith();

      middleware(schoolAdminReq, res, next2);
      expect(next2).toHaveBeenCalledWith();

      middleware(principalReq, res, next3);
      expect(next3).toHaveBeenCalledWith();
    });

    it('blocks unauthorized roles (TEACHER, STUDENT, PARENT) from tenant audit with 403', () => {
      const teacherReq = {
        user: { id: 'u-4', systemRole: SYSTEM_ROLES.TEACHER, role: SYSTEM_ROLES.TEACHER }
      };
      const studentReq = {
        user: { id: 'u-5', systemRole: SYSTEM_ROLES.STUDENT, role: SYSTEM_ROLES.STUDENT }
      };
      const parentReq = {
        user: { id: 'u-6', systemRole: SYSTEM_ROLES.PARENT, role: SYSTEM_ROLES.PARENT }
      };
      const res = {};

      const middleware = requireRole(
        SYSTEM_ROLES.SUPER_ADMIN,
        SYSTEM_ROLES.SCHOOL_ADMIN,
        SYSTEM_ROLES.PRINCIPAL
      );

      const nextTeacher = vi.fn();
      middleware(teacherReq, res, nextTeacher);
      expect(nextTeacher).toHaveBeenCalled();
      expect(nextTeacher.mock.calls[0][0]?.statusCode).toBe(403);

      const nextStudent = vi.fn();
      middleware(studentReq, res, nextStudent);
      expect(nextStudent).toHaveBeenCalled();
      expect(nextStudent.mock.calls[0][0]?.statusCode).toBe(403);

      const nextParent = vi.fn();
      middleware(parentReq, res, nextParent);
      expect(nextParent).toHaveBeenCalled();
      expect(nextParent.mock.calls[0][0]?.statusCode).toBe(403);
    });

    it('ensures auditRouter exposes only GET routes (append-only / read-only guarantee)', () => {
      const routes = auditRouter.stack
        .filter((layer) => layer.route)
        .map((layer) => ({
          path: layer.route.path,
          methods: Object.keys(layer.route.methods)
        }));

      for (const r of routes) {
        expect(r.methods).toEqual(['get']);
        expect(r.methods).not.toContain('post');
        expect(r.methods).not.toContain('put');
        expect(r.methods).not.toContain('patch');
        expect(r.methods).not.toContain('delete');
      }
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
