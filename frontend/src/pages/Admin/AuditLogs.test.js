import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { listAuditLogs } from '../../api/audit.js';
import * as clientModule from '../../api/client.js';

vi.mock('../../api/client.js', () => ({
  apiClient: vi.fn()
}));

describe('SCHOOLADMIN-AUDIT-001: School Admin Audit Logs Frontend Suite', () => {
  const filePath = path.resolve(__dirname, 'AuditLogs.jsx');
  const fileContent = fs.readFileSync(filePath, 'utf-8');

  const appPath = path.resolve(__dirname, '../../App.jsx');
  const appContent = fs.readFileSync(appPath, 'utf-8');

  const dashboardPath = path.resolve(__dirname, '../AdminDashboard.jsx');
  const dashboardContent = fs.readFileSync(dashboardPath, 'utf-8');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. API Client Query Parameter Construction (audit.js)', () => {
    it('constructs tenant-scoped query string to /api/v1/audit with search and individual filters', async () => {
      clientModule.apiClient.mockResolvedValueOnce({ success: true, data: [], pagination: {} });

      const queryParams = {
        page: 1,
        limit: 10,
        includeSummary: 'true',
        search: 'Attendance',
        entityType: 'Attendance',
        action: 'SUBMIT',
        actor: 'teacher@school.com',
        startDate: '2026-02-01',
        endDate: '2026-02-28'
      };

      await listAuditLogs(queryParams);

      expect(clientModule.apiClient).toHaveBeenCalled();
      const calledUrl = clientModule.apiClient.mock.calls[0][0];
      expect(calledUrl).toContain('/api/v1/audit?');
      expect(calledUrl).not.toContain('/api/v1/superadmin/audit');
      expect(calledUrl).toContain('search=Attendance');
      expect(calledUrl).toContain('entityType=Attendance');
      expect(calledUrl).toContain('action=SUBMIT');
      expect(calledUrl).toContain('actor=teacher%40school.com');
      expect(calledUrl).toContain('startDate=2026-02-01');
      expect(calledUrl).toContain('endDate=2026-02-28');
      expect(calledUrl).toContain('includeSummary=true');
    });

    it('strictly isolates tenant queries and never appends schoolId in tenant listAuditLogs', async () => {
      clientModule.apiClient.mockResolvedValueOnce({ success: true, data: [], pagination: {} });

      await listAuditLogs({
        page: 1,
        limit: 10,
        search: 'Fees'
      });

      const calledUrl = clientModule.apiClient.mock.calls[0][0];
      expect(calledUrl).toContain('/api/v1/audit?');
      expect(calledUrl).not.toContain('schoolId=');
    });
  });

  describe('2. School Admin Component Architecture & Parameter Mapping (AuditLogs.jsx)', () => {
    it('uses listAuditLogs (tenant-scoped) and never imports listSuperAdminAuditLogs', () => {
      expect(fileContent).toContain('import { listAuditLogs }');
      expect(fileContent).not.toContain('listSuperAdminAuditLogs');
    });

    it('maps search, module, action, actor, and date ranges to API parameters', () => {
      expect(fileContent).toContain('params.search = searchTerm.trim()');
      expect(fileContent).toContain('params.entityType = selectedEntityType');
      expect(fileContent).toContain('params.action = selectedAction');
      expect(fileContent).toContain('params.actor = actorFilter.trim()');
      expect(fileContent).toContain('params.startDate = startDate');
      expect(fileContent).toContain('params.endDate = endDate');
    });

    it('resets page to 1 when any filter changes', () => {
      expect(fileContent).toContain('setCurrentPage(1);');
    });

    it('implements handleClearFilters resetting all filters and page to 1', () => {
      expect(fileContent).toContain('handleClearFilters');
      expect(fileContent).toContain('setSearchTerm(\'\')');
      expect(fileContent).toContain('setSelectedEntityType(\'\')');
      expect(fileContent).toContain('setSelectedAction(\'\')');
      expect(fileContent).toContain('setActorFilter(\'\')');
      expect(fileContent).toContain('setStartDate(\'\')');
      expect(fileContent).toContain('setEndDate(\'\')');
      expect(fileContent).toContain('setCurrentPage(1)');
    });
  });

  describe('3. Table Display & Available Fields', () => {
    it('displays required table headers: Timestamp, Actor, Module, Action Performed, Entity ID, Details', () => {
      expect(fileContent).toContain('Timestamp');
      expect(fileContent).toContain('Actor');
      expect(fileContent).toContain('Module');
      expect(fileContent).toContain('Action Performed');
      expect(fileContent).toContain('Entity ID');
      expect(fileContent).toContain('Details');
    });

    it('renders entity identifier and user role without inventing missing fields', () => {
      expect(fileContent).toContain("log.entityId || '—'");
      expect(fileContent).toContain("log.userRole || 'SYSTEM'");
      expect(fileContent).toContain("log.userName || log.user || 'System'");
    });
  });

  describe('4. Details View & Modified Fields Diff Display', () => {
    it('implements selectedLog modal state with close trigger and overlay', () => {
      expect(fileContent).toContain('selectedLog');
      expect(fileContent).toContain('setSelectedLog(null)');
      expect(fileContent).toContain('Audit Event Details');
    });

    it('renders before-and-after comparison table when modifiedFields has before/after', () => {
      expect(fileContent).toContain('hasBeforeAfter');
      expect(fileContent).toContain('Before');
      expect(fileContent).toContain('After');
      expect(fileContent).toContain('No modified field details captured for this record');
    });
  });

  describe('5. UI States & Server-Side Summary Metrics', () => {
    it('renders loading, empty, and error states with interactive retry button', () => {
      expect(fileContent).toContain('Loading school audit logs...');
      expect(fileContent).toContain('No audit logs found');
      expect(fileContent).toContain('{error && (');
      expect(fileContent).toContain('onClick={fetchLogs}');
      expect(fileContent).toContain('Retry');
    });

    it('displays server-side summary cards for filtered events, distinct actors, and today events', () => {
      expect(fileContent).toContain("{hasActiveFilters ? 'Filtered Events' : 'Total School Events'}");
      expect(fileContent).toContain('summary?.distinctActors');
      expect(fileContent).toContain('summary?.todayEvents');
      expect(fileContent).toContain('summary?.topEntityTypes');
    });
  });

  describe('6. Navigation & Routing Integration', () => {
    it('registers audit-logs route under /admin in App.jsx restricted to admin role', () => {
      expect(appContent).toContain("import('./pages/Admin/AuditLogs')");
      expect(appContent).toContain('path="audit-logs"');
      expect(appContent).toMatch(/<Route\s+path="audit-logs"\s+element={<ProtectedRoute\s+allowedRoles={\['admin'\]}><SchoolAdminAuditLogs\s*\/>/);
    });

    it('adds Audit Logs navigation item to allNavItems in AdminDashboard.jsx', () => {
      expect(dashboardContent).toContain("name: 'Audit Logs'");
      expect(dashboardContent).toContain("path: '/admin/audit-logs'");
      expect(dashboardContent).toContain("moduleKey: 'audit'");
      expect(dashboardContent).toContain("'audit'");
    });
  });
});
