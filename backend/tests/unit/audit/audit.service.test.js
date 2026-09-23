import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as auditService from '../../../src/modules/audit/audit.service.js';
import * as auditRepository from '../../../src/modules/audit/audit.repository.js';
import { ValidationError } from '../../../src/utils/app-error.js';

vi.mock('../../../src/modules/audit/audit.repository.js');

describe('Audit Logs Service Unit Tests', () => {
  const schoolId = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getTenantAuditLogs', () => {
    it('throws ValidationError if schoolId is missing', async () => {
      await expect(auditService.getTenantAuditLogs(null)).rejects.toThrow(ValidationError);
    });

    it('fetches and returns tenant audit logs with formatted DTOs and pagination', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          schoolId,
          entityType: 'Class',
          entityId: 'class-1',
          actionPerformed: 'CREATE_CLASS',
          userName: 'Admin User',
          userRole: 'SCHOOL_ADMIN',
          modifiedFields: {
            className: 'Grade 10A',
            passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$secret'
          },
          timestamp: new Date('2026-09-18T10:00:00Z')
        }
      ];

      vi.spyOn(auditRepository, 'findTenantAuditLogs').mockResolvedValue(mockLogs);
      vi.spyOn(auditRepository, 'countTenantAuditLogs').mockResolvedValue(1);

      const result = await auditService.getTenantAuditLogs(schoolId, { page: 1, limit: 10 });

      expect(result.logs).toHaveLength(1);
      expect(result.logs[0].entityType).toBe('Class');
      expect(result.logs[0].modifiedFields.className).toBe('Grade 10A');
      // Verify sensitive field was redacted
      expect(result.logs[0].modifiedFields.passwordHash).toBe('[REDACTED]');
      expect(result.pagination.total).toBe(1);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(10);
    });
  });

  describe('getGlobalAuditLogs', () => {
    it('fetches global audit logs across tenants for SuperAdmin', async () => {
      const mockGlobalLogs = [
        {
          id: 'log-2',
          schoolId: '22222222-2222-2222-2222-222222222222',
          entityType: 'SchoolRole',
          entityId: 'role-1',
          actionPerformed: 'CREATE_ROLE',
          userName: 'Super Admin',
          userRole: 'SUPER_ADMIN',
          modifiedFields: { role: 'Auditor' },
          timestamp: new Date('2026-09-18T11:00:00Z'),
          school: {
            id: '22222222-2222-2222-2222-222222222222',
            name: 'Oakridge International',
            code: 'OAKRIDGE'
          }
        }
      ];

      vi.spyOn(auditRepository, 'findGlobalAuditLogs').mockResolvedValue(mockGlobalLogs);
      vi.spyOn(auditRepository, 'countGlobalAuditLogs').mockResolvedValue(1);

      const result = await auditService.getGlobalAuditLogs({ page: 1, limit: 20 });

      expect(result.logs).toHaveLength(1);
      expect(result.logs[0].school.name).toBe('Oakridge International');
      expect(result.pagination.total).toBe(1);
    });
  });
});
