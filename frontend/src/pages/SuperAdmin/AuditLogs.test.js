import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { listSuperAdminAuditLogs, listAuditLogs } from '../../api/audit.js';
import * as clientModule from '../../api/client.js';

vi.mock('../../api/client.js', () => ({
  apiClient: vi.fn()
}));

describe('SUPERADMIN-AUDIT-003: Super Admin Audit Logs Frontend Suite', () => {
  const filePath = path.resolve(__dirname, 'AuditLogs.jsx');
  const fileContent = fs.readFileSync(filePath, 'utf-8');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. API Client Query Parameter Construction (audit.js)', () => {
    it('constructs correct query string with unified search and individual filters', async () => {
      clientModule.apiClient.mockResolvedValueOnce({ success: true, data: [], pagination: {} });

      const queryParams = {
        page: 1,
        limit: 10,
        includeSummary: 'true',
        search: 'Lincoln School',
        schoolId: '11111111-1111-4111-8111-111111111111',
        entityType: 'School',
        action: 'UPDATE_TENANT_CONFIG',
        actor: 'superadmin@example.com',
        startDate: '2026-01-01',
        endDate: '2026-12-31'
      };

      await listSuperAdminAuditLogs(queryParams);

      expect(clientModule.apiClient).toHaveBeenCalled();
      const calledUrl = clientModule.apiClient.mock.calls[0][0];
      expect(calledUrl).toContain('/api/v1/superadmin/audit?');
      expect(calledUrl).toContain('search=Lincoln+School');
      expect(calledUrl).toContain('schoolId=11111111-1111-4111-8111-111111111111');
      expect(calledUrl).toContain('entityType=School');
      expect(calledUrl).toContain('action=UPDATE_TENANT_CONFIG');
      expect(calledUrl).toContain('actor=superadmin%40example.com');
      expect(calledUrl).toContain('startDate=2026-01-01');
      expect(calledUrl).toContain('endDate=2026-12-31');
      expect(calledUrl).toContain('includeSummary=true');
    });

    it('omits empty string, null, and undefined values from query parameters', async () => {
      clientModule.apiClient.mockResolvedValueOnce({ success: true, data: [], pagination: {} });

      await listSuperAdminAuditLogs({
        page: 1,
        limit: 10,
        search: '',
        schoolId: null,
        entityType: undefined
      });

      const calledUrl = clientModule.apiClient.mock.calls[0][0];
      expect(calledUrl).toBe('/api/v1/superadmin/audit?page=1&limit=10');
      expect(calledUrl).not.toContain('search=');
      expect(calledUrl).not.toContain('schoolId=');
    });

    it('ensures tenant-scoped listAuditLogs calls /api/v1/audit', async () => {
      clientModule.apiClient.mockResolvedValueOnce({ success: true, data: [], pagination: {} });

      await listAuditLogs({ page: 1, limit: 10 });
      const calledUrl = clientModule.apiClient.mock.calls[0][0];
      expect(calledUrl).toBe('/api/v1/audit?page=1&limit=10');
    });
  });

  describe('2. Component Filter Architecture & Parameter Alignment (AuditLogs.jsx)', () => {
    it('uses "search" query parameter for keyword search (fixes previous "action" mismatch)', () => {
      expect(fileContent).toContain('params.search = searchTerm.trim()');
      expect(fileContent).not.toMatch(/params\.action\s*=\s*searchTerm\.trim\(\)/);
    });

    it('integrates college/tenant selector using schoolId and listTenants', () => {
      expect(fileContent).toContain('import { listTenants }');
      expect(fileContent).toContain('params.schoolId = selectedSchoolId');
      expect(fileContent).toContain('All Colleges / Tenants');
    });

    it('supports module/entityType, action, actor, and date range filters', () => {
      expect(fileContent).toContain('params.entityType = selectedEntityType');
      expect(fileContent).toContain('params.action = selectedAction');
      expect(fileContent).toContain('params.actor = actorFilter.trim()');
      expect(fileContent).toContain('params.startDate = startDate');
      expect(fileContent).toContain('params.endDate = endDate');
    });

    it('implements handleClearFilters that resets all filters and page to 1', () => {
      expect(fileContent).toContain('handleClearFilters');
      expect(fileContent).toContain('setSearchTerm(\'\')');
      expect(fileContent).toContain('setSelectedSchoolId(\'\')');
      expect(fileContent).toContain('setSelectedEntityType(\'\')');
      expect(fileContent).toContain('setSelectedAction(\'\')');
      expect(fileContent).toContain('setActorFilter(\'\')');
      expect(fileContent).toContain('setStartDate(\'\')');
      expect(fileContent).toContain('setEndDate(\'\')');
      expect(fileContent).toContain('setCurrentPage(1)');
    });

    it('resets currentPage to 1 whenever any filter changes', () => {
      expect(fileContent).toContain('setCurrentPage(1);');
    });
  });

  describe('3. Summary Metrics & Server-Side Grounding', () => {
    it('requests includeSummary from backend and binds server-side metrics to cards', () => {
      expect(fileContent).toContain("includeSummary: 'true'");
      expect(fileContent).toContain('summary?.distinctActors');
      expect(fileContent).toContain('summary?.todayEvents');
      expect(fileContent).toContain('summary?.topEntityTypes');
    });

    it('distinguishes filtered totals from general total count', () => {
      expect(fileContent).toContain("{hasActiveFilters ? 'Filtered Events' : 'Total Audit Events'}");
    });
  });

  describe('4. Audit Table Columns & Missing Data Handling', () => {
    it('renders all required columns: Timestamp, College/Tenant, Module, Action, Actor, IP, Details', () => {
      expect(fileContent).toContain('Timestamp');
      expect(fileContent).toContain('College / Tenant');
      expect(fileContent).toContain('Module');
      expect(fileContent).toContain('Action Event');
      expect(fileContent).toContain('Actor');
      expect(fileContent).toContain('IP Address');
      expect(fileContent).toContain('Details');
    });

    it('displays school name and code or falls back to Platform without inventing values', () => {
      expect(fileContent).toContain('log.school?.name');
      expect(fileContent).toContain('log.school?.code');
      expect(fileContent).toContain("log.modifiedFields?.ip || log.ip || '—'");
    });
  });

  describe('5. Details Modal & Modified Fields Diff Display', () => {
    it('implements selectedLog modal state with close trigger and overlay', () => {
      expect(fileContent).toContain('selectedLog');
      expect(fileContent).toContain('setSelectedLog(null)');
      expect(fileContent).toContain('Audit Record Details');
    });

    it('renders before-and-after comparison table when modifiedFields has before/after', () => {
      expect(fileContent).toContain('hasBeforeAfter');
      expect(fileContent).toContain('Before');
      expect(fileContent).toContain('After');
      expect(fileContent).toContain('No modified field details captured for this record');
    });
  });

  describe('6. Empty, Loading, Error, and Retry States', () => {
    it('handles loading state with spinner and empty state with clear filters option', () => {
      expect(fileContent).toContain('Loading audit logs...');
      expect(fileContent).toContain('No audit logs found');
    });

    it('provides error state and interactive retry button calling fetchLogs', () => {
      expect(fileContent).toContain('{error && (');
      expect(fileContent).toContain('onClick={fetchLogs}');
      expect(fileContent).toContain('Retry');
    });
  });
});
