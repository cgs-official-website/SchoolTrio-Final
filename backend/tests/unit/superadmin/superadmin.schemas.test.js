import { describe, it, expect } from 'vitest';
import {
  listTenantsQuerySchema,
  tenantParamsSchema,
  createTenantSchema,
  updateTenantStatusSchema,
  updateTenantConfigSchema,
  listPlansQuerySchema,
  planParamsSchema,
  createPlanSchema,
  updatePlanSchema,
  listSubscriptionsQuerySchema,
  licenseUsageQuerySchema
} from '../../../src/modules/superadmin/superadmin.schemas.js';

describe('SuperAdmin Schemas Unit Tests', () => {
  const validUUID = '11111111-1111-4111-8111-111111111111';

  describe('listTenantsQuerySchema', () => {
    it('validates empty query with defaults', async () => {
      const result = await listTenantsQuerySchema.query.safeParseAsync({});
      expect(result.success).toBe(true);
      expect(result.data.sort).toBe('createdAt');
      expect(result.data.order).toBe('desc');
    });

    it('validates valid search, status, and pagination', async () => {
      const result = await listTenantsQuerySchema.query.safeParseAsync({
        status: 'approved',
        planId: validUUID,
        search: 'Springfield',
        sort: 'name',
        order: 'asc',
        page: '1',
        limit: '25'
      });
      expect(result.success).toBe(true);
      expect(result.data.status).toBe('approved');
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(25);
    });

    it('rejects limit exceeding 100', async () => {
      const result = await listTenantsQuerySchema.query.safeParseAsync({
        limit: '101'
      });
      expect(result.success).toBe(false);
      expect(result.error.errors[0].message).toContain('Limit cannot exceed 100');
    });

    it('rejects invalid status', async () => {
      const result = await listTenantsQuerySchema.query.safeParseAsync({
        status: 'inactive'
      });
      expect(result.success).toBe(false);
    });
  });

  describe('tenantParamsSchema', () => {
    it('validates valid UUID', async () => {
      const result = await tenantParamsSchema.params.safeParseAsync({ id: validUUID });
      expect(result.success).toBe(true);
      expect(result.data.id).toBe(validUUID);
    });

    it('rejects malformed UUID', async () => {
      const result = await tenantParamsSchema.params.safeParseAsync({ id: 'not-a-uuid' });
      expect(result.success).toBe(false);
      expect(result.error.errors[0].message).toContain('Invalid tenant ID format');
    });
  });

  describe('createTenantSchema', () => {
    const validTenantPayload = {
      name: 'Springfield Academy',
      code: 'sch-001',
      email: 'contact@springfield.edu',
      adminEmail: 'admin@springfield.edu',
      adminPassword: 'Password123!',
      seatLimit: 600,
      teacherLimit: 60
    };

    it('validates and transforms school code to uppercase', async () => {
      const result = await createTenantSchema.body.safeParseAsync(validTenantPayload);
      expect(result.success).toBe(true);
      expect(result.data.code).toBe('SCH-001');
      expect(result.data.seatLimit).toBe(600);
    });

    it('rejects short password (< 8 chars)', async () => {
      const result = await createTenantSchema.body.safeParseAsync({
        ...validTenantPayload,
        adminPassword: 'pass'
      });
      expect(result.success).toBe(false);
      expect(result.error.errors[0].message).toContain('Admin password must be at least 8 characters');
    });

    it('rejects invalid email addresses', async () => {
      const result = await createTenantSchema.body.safeParseAsync({
        ...validTenantPayload,
        adminEmail: 'not-an-email'
      });
      expect(result.success).toBe(false);
      expect(result.error.errors[0].message).toContain('Invalid admin email address');
    });
  });

  describe('updateTenantStatusSchema', () => {
    it('accepts valid status transitions', async () => {
      const result = await updateTenantStatusSchema.body.safeParseAsync({
        status: 'suspended',
        reason: 'Payment overdue'
      });
      expect(result.success).toBe(true);
      expect(result.data.status).toBe('suspended');
    });

    it('rejects arbitrary status strings', async () => {
      const result = await updateTenantStatusSchema.body.safeParseAsync({
        status: 'archived_pending_review'
      });
      expect(result.success).toBe(false);
      expect(result.error.errors[0].message).toContain('Status must be one of');
    });
  });

  describe('updateTenantConfigSchema', () => {
    it('accepts valid quota and module updates', async () => {
      const result = await updateTenantConfigSchema.body.safeParseAsync({
        seatLimit: 1200,
        teacherLimit: 120,
        planId: validUUID,
        modules: {
          library: true,
          inventory: false
        }
      });
      expect(result.success).toBe(true);
      expect(result.data.seatLimit).toBe(1200);
    });

    it('rejects negative quota limits', async () => {
      const result = await updateTenantConfigSchema.body.safeParseAsync({
        seatLimit: -10
      });
      expect(result.success).toBe(false);
      expect(result.error.errors[0].message).toContain('Seat limit must be at least 1');
    });
  });

  describe('createPlanSchema & updatePlanSchema', () => {
    it('validates complete plan payload', async () => {
      const result = await createPlanSchema.body.safeParseAsync({
        name: 'Enterprise Tier',
        userLimit: 2000,
        pricePerUserPerYear: 1800,
        cloudStorageGB: 50,
        modules: { advancedAnalytics: true }
      });
      expect(result.success).toBe(true);
      expect(result.data.pricePerUserPerYear).toBe(1800);
      expect(result.data.isActive).toBe(true);
    });

    it('rejects negative pricing', async () => {
      const result = await createPlanSchema.body.safeParseAsync({
        name: 'Enterprise Tier',
        userLimit: 2000,
        pricePerUserPerYear: -500
      });
      expect(result.success).toBe(false);
      expect(result.error.errors[0].message).toContain('Price cannot be negative');
    });
  });

  describe('listSubscriptionsQuerySchema & licenseUsageQuerySchema', () => {
    it('validates subscription query with filters', async () => {
      const result = await listSubscriptionsQuerySchema.query.safeParseAsync({
        status: 'approved',
        page: '1',
        limit: '50'
      });
      expect(result.success).toBe(true);
    });

    it('validates license usage query', async () => {
      const result = await licenseUsageQuerySchema.query.safeParseAsync({
        status: 'warning',
        search: 'Demo',
        page: '1',
        limit: '20'
      });
      expect(result.success).toBe(true);
      expect(result.data.status).toBe('warning');
    });
  });
});
