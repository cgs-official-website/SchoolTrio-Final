import { describe, it, expect } from 'vitest';
import { listTenantAuditLogsSchema, listSuperAdminAuditLogsSchema } from '../../../src/modules/audit/audit.schemas.js';

describe('Audit Logs Schemas Unit Tests', () => {
  const validUUID = '11111111-1111-4111-8111-111111111111';

  describe('listTenantAuditLogsSchema', () => {
    it('validates empty query with defaults', async () => {
      const result = await listTenantAuditLogsSchema.query.safeParseAsync({});
      expect(result.success).toBe(true);
    });

    it('validates valid filters, pagination, and date range', async () => {
      const result = await listTenantAuditLogsSchema.query.safeParseAsync({
        entityType: 'Class',
        actionPerformed: 'CREATE_CLASS',
        userName: 'Admin User',
        startDate: '2026-09-01T00:00:00.000Z',
        endDate: '2026-09-18T23:59:59.999Z',
        page: '2',
        limit: '25'
      });
      expect(result.success).toBe(true);
      expect(result.data.page).toBe(2);
      expect(result.data.limit).toBe(25);
      expect(result.data.entityType).toBe('Class');
    });

    it('accepts date-only strings (YYYY-MM-DD)', async () => {
      const result = await listTenantAuditLogsSchema.query.safeParseAsync({
        startDate: '2026-09-01',
        endDate: '2026-09-18'
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid limit exceeding 100', async () => {
      const result = await listTenantAuditLogsSchema.query.safeParseAsync({
        limit: '101'
      });
      expect(result.success).toBe(false);
      expect(result.error.errors[0].message).toContain('Limit cannot exceed 100');
    });

    it('rejects negative or zero page/limit', async () => {
      const resPage = await listTenantAuditLogsSchema.query.safeParseAsync({ page: '0' });
      expect(resPage.success).toBe(false);

      const resLimit = await listTenantAuditLogsSchema.query.safeParseAsync({ limit: '-5' });
      expect(resLimit.success).toBe(false);
    });

    it('rejects malformed date format', async () => {
      const result = await listTenantAuditLogsSchema.query.safeParseAsync({
        startDate: 'not-a-date'
      });
      expect(result.success).toBe(false);
      expect(result.error.errors[0].message).toContain('Invalid date format');
    });

    it('rejects invalid date range where startDate is after endDate', async () => {
      const result = await listTenantAuditLogsSchema.query.safeParseAsync({
        startDate: '2026-09-20',
        endDate: '2026-09-10'
      });
      expect(result.success).toBe(false);
      expect(result.error.errors[0].message).toContain('startDate must be before or equal to endDate');
    });
  });

  describe('listSuperAdminAuditLogsSchema', () => {
    it('validates superadmin query with schoolId filter', async () => {
      const result = await listSuperAdminAuditLogsSchema.query.safeParseAsync({
        schoolId: validUUID,
        entityType: 'UserRoleAssignment',
        page: '1',
        limit: '50'
      });
      expect(result.success).toBe(true);
      expect(result.data.schoolId).toBe(validUUID);
    });

    it('rejects invalid UUID format for schoolId filter', async () => {
      const result = await listSuperAdminAuditLogsSchema.query.safeParseAsync({
        schoolId: 'not-a-valid-uuid'
      });
      expect(result.success).toBe(false);
      expect(result.error.errors[0].message).toContain('Invalid school ID format');
    });
  });
});
