import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as clientModule from '../client.js';
import {
  listAuditLogs,
  listSuperAdminAuditLogs,
  auditApi
} from '../audit.js';

describe('Audit Logs API Client Module', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Tenant Audit Logs', () => {
    it('calls GET /api/v1/audit with query parameters', async () => {
      const mockAuditLogs = {
        success: true,
        data: [
          { id: 'log-1', entityType: 'Student', actionPerformed: 'UPDATE_STUDENT', userName: 'admin@school.edu' }
        ],
        pagination: { total: 1, page: 1, limit: 20, totalPages: 1 }
      };
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockAuditLogs);

      const res = await listAuditLogs({
        entityType: 'Student',
        actionPerformed: 'UPDATE_STUDENT',
        userName: 'admin',
        startDate: '2026-09-01T00:00:00.000Z',
        endDate: '2026-09-18T23:59:59.000Z',
        page: 1,
        limit: 20
      });

      expect(apiSpy).toHaveBeenCalledWith(
        '/api/v1/audit?entityType=Student&actionPerformed=UPDATE_STUDENT&userName=admin&startDate=2026-09-01T00%3A00%3A00.000Z&endDate=2026-09-18T23%3A59%3A59.000Z&page=1&limit=20',
        { method: 'GET' }
      );
      expect(res.data[0].actionPerformed).toBe('UPDATE_STUDENT');
    });

    it('omits empty or undefined parameters in tenant audit query', async () => {
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({ success: true, data: [] });

      await listAuditLogs({ entityType: '', actionPerformed: undefined, page: 1 });

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/audit?page=1', { method: 'GET' });
    });
  });

  describe('2. SuperAdmin Platform Audit Logs', () => {
    it('strictly calls GET /api/v1/superadmin/audit (not /api/v1/audit/logs)', async () => {
      const mockSuperAdminLogs = {
        success: true,
        data: [
          { id: 'sa-log-1', schoolId: 'school-1', entityType: 'School', actionPerformed: 'SUSPEND_TENANT' }
        ],
        pagination: { total: 1, page: 1, limit: 50, totalPages: 1 }
      };
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockSuperAdminLogs);

      const res = await listSuperAdminAuditLogs({
        schoolId: 'school-1',
        actionPerformed: 'SUSPEND_TENANT',
        limit: 50
      });

      expect(apiSpy).toHaveBeenCalledWith(
        '/api/v1/superadmin/audit?schoolId=school-1&actionPerformed=SUSPEND_TENANT&limit=50',
        { method: 'GET' }
      );
      expect(res.data[0].actionPerformed).toBe('SUSPEND_TENANT');
    });
  });

  describe('3. Client Object Integrity', () => {
    it('exports methods on auditApi object', () => {
      expect(auditApi.listAuditLogs).toBe(listAuditLogs);
      expect(auditApi.listSuperAdminAuditLogs).toBe(listSuperAdminAuditLogs);
    });
  });
});
