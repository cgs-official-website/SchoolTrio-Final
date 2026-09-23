import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import * as authRepository from '../../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../../src/modules/auth/token.service.js';
import * as auditRepository from '../../../src/modules/audit/audit.repository.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';

describe('Audit Logs API Integration Tests', () => {
  const app = createApp();

  const TENANT_A_ID = '11111111-1111-4111-8111-111111111111';

  const mockAdminUser = {
    id: 'user-admin-1',
    schoolId: TENANT_A_ID,
    email: 'admin@school.edu',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_A_ID, name: 'Springfield Academy', code: 'SPRINGFIELD', status: 'approved' }
  };

  const mockSuperAdminUser = {
    id: 'user-superadmin-1',
    schoolId: null,
    email: 'superadmin@platform.com',
    systemRole: SYSTEM_ROLES.SUPER_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: null
  };

  const getAuthToken = (user) => {
    return tokenService.issueAccessToken({
      sub: user.id,
      schoolId: user.schoolId,
      systemRole: user.systemRole,
      tokenVersion: user.tokenVersion
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(authRepository, 'findUserById').mockImplementation(async (id) => {
      if (id === mockAdminUser.id) return mockAdminUser;
      if (id === mockSuperAdminUser.id) return mockSuperAdminUser;
      return null;
    });
  });

  describe('GET /api/v1/audit (Tenant Audit Logs)', () => {
    it('returns paginated audit logs for authenticated school admin', async () => {
      const token = getAuthToken(mockAdminUser);
      const mockLogs = [
        {
          id: 'log-1',
          schoolId: TENANT_A_ID,
          entityType: 'Class',
          entityId: 'class-101',
          actionPerformed: 'CREATE_CLASS',
          userName: 'Admin User',
          userRole: 'SCHOOL_ADMIN',
          modifiedFields: { name: 'Grade 10' },
          timestamp: new Date('2026-09-18T08:00:00Z')
        }
      ];

      vi.spyOn(auditRepository, 'findTenantAuditLogs').mockResolvedValue(mockLogs);
      vi.spyOn(auditRepository, 'countTenantAuditLogs').mockResolvedValue(1);

      const res = await request(app)
        .get('/api/v1/audit?page=1&limit=10')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].actionPerformed).toBe('CREATE_CLASS');
      expect(res.body.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false
      });
    });

    it('rejects unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/v1/audit');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/superadmin/audit (SuperAdmin Global Audit Logs)', () => {
    it('returns global cross-tenant audit logs for SuperAdmin', async () => {
      const token = getAuthToken(mockSuperAdminUser);
      const mockGlobalLogs = [
        {
          id: 'log-2',
          schoolId: TENANT_A_ID,
          entityType: 'User',
          entityId: 'user-1',
          actionPerformed: 'PASSWORD_RESET',
          userName: 'Super Admin',
          userRole: 'SUPER_ADMIN',
          modifiedFields: {},
          timestamp: new Date('2026-09-18T09:00:00Z'),
          school: {
            id: TENANT_A_ID,
            name: 'Springfield Academy',
            code: 'SPRINGFIELD'
          }
        }
      ];

      vi.spyOn(auditRepository, 'findGlobalAuditLogs').mockResolvedValue(mockGlobalLogs);
      vi.spyOn(auditRepository, 'countGlobalAuditLogs').mockResolvedValue(1);

      const res = await request(app)
        .get('/api/v1/superadmin/audit?page=1&limit=20')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data[0].school.code).toBe('SPRINGFIELD');
    });

    it('denies school admin from accessing global superadmin audit logs with 403', async () => {
      const token = getAuthToken(mockAdminUser);

      const res = await request(app)
        .get('/api/v1/superadmin/audit')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });
  });
});
