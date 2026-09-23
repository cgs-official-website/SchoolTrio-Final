import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import * as authRepository from '../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../src/modules/auth/token.service.js';
import * as auditRepository from '../../src/modules/audit/audit.repository.js';
import { SYSTEM_ROLES } from '../../src/config/constants.js';

describe('Audit Logs Security & Tenant Isolation Test Suite', () => {
  const app = createApp();

  const TENANT_A_ID = '11111111-1111-4111-8111-111111111111';
  const TENANT_B_ID = '22222222-2222-4222-8222-222222222222';

  const mockAdminTenantA = {
    id: 'user-admin-a',
    schoolId: TENANT_A_ID,
    email: 'admin@tenanta.edu',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_A_ID, name: 'Tenant A Academy', code: 'TA-01', status: 'approved' }
  };

  const mockTeacherTenantA = {
    id: 'user-teacher-a',
    schoolId: TENANT_A_ID,
    email: 'teacher@tenanta.edu',
    systemRole: SYSTEM_ROLES.TEACHER,
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_A_ID, name: 'Tenant A Academy', code: 'TA-01', status: 'approved' }
  };

  const mockStudentTenantA = {
    id: 'user-student-a',
    schoolId: TENANT_A_ID,
    email: 'student@tenanta.edu',
    systemRole: SYSTEM_ROLES.STUDENT,
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_A_ID, name: 'Tenant A Academy', code: 'TA-01', status: 'approved' }
  };

  const mockParentTenantA = {
    id: 'user-parent-a',
    schoolId: TENANT_A_ID,
    email: 'parent@tenanta.edu',
    systemRole: SYSTEM_ROLES.PARENT,
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_A_ID, name: 'Tenant A Academy', code: 'TA-01', status: 'approved' }
  };

  const mockSuperAdmin = {
    id: 'user-superadmin',
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
      if (id === mockAdminTenantA.id) return mockAdminTenantA;
      if (id === mockTeacherTenantA.id) return mockTeacherTenantA;
      if (id === mockStudentTenantA.id) return mockStudentTenantA;
      if (id === mockParentTenantA.id) return mockParentTenantA;
      if (id === mockSuperAdmin.id) return mockSuperAdmin;
      return null;
    });
  });

  describe('1. Authentication & Integrity', () => {
    it('returns 401 when Authorization header is missing', async () => {
      const res = await request(app).get('/api/v1/audit');
      expect(res.status).toBe(401);
    });

    it('returns 401 when token is invalid or malformed', async () => {
      const res = await request(app)
        .get('/api/v1/audit')
        .set('Authorization', 'Bearer invalid-token-sig');
      expect(res.status).toBe(401);
    });
  });

  describe('2. RBAC Enforcement Matrix', () => {
    it('allows SCHOOL_ADMIN to access tenant audit logs', async () => {
      vi.spyOn(auditRepository, 'findTenantAuditLogs').mockResolvedValue([]);
      vi.spyOn(auditRepository, 'countTenantAuditLogs').mockResolvedValue(0);

      const res = await request(app)
        .get('/api/v1/audit')
        .set('Authorization', `Bearer ${getAuthToken(mockAdminTenantA)}`);

      expect(res.status).toBe(200);
    });

    it('denies TEACHER from accessing tenant audit logs with 403', async () => {
      const res = await request(app)
        .get('/api/v1/audit')
        .set('Authorization', `Bearer ${getAuthToken(mockTeacherTenantA)}`);

      expect(res.status).toBe(403);
    });

    it('denies STUDENT from accessing tenant audit logs with 403', async () => {
      const res = await request(app)
        .get('/api/v1/audit')
        .set('Authorization', `Bearer ${getAuthToken(mockStudentTenantA)}`);

      expect(res.status).toBe(403);
    });

    it('denies PARENT from accessing tenant audit logs with 403', async () => {
      const res = await request(app)
        .get('/api/v1/audit')
        .set('Authorization', `Bearer ${getAuthToken(mockParentTenantA)}`);

      expect(res.status).toBe(403);
    });

    it('denies non-SuperAdmin roles from accessing /api/v1/superadmin/audit with 403', async () => {
      const res = await request(app)
        .get('/api/v1/superadmin/audit')
        .set('Authorization', `Bearer ${getAuthToken(mockAdminTenantA)}`);

      expect(res.status).toBe(403);
    });
  });

  describe('3. Strict Tenant Isolation & Anti-Spoofing', () => {
    it('strictly rejects cross-tenant spoofing attempt with 403 when normal user supplies different schoolId', async () => {
      const res = await request(app)
        .get(`/api/v1/audit?schoolId=${TENANT_B_ID}`)
        .set('Authorization', `Bearer ${getAuthToken(mockAdminTenantA)}`);

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain('Cross-tenant access rejected');
    });

    it('authoritatively binds tenant audit queries strictly to req.tenant.schoolId', async () => {
      const findSpy = vi.spyOn(auditRepository, 'findTenantAuditLogs').mockResolvedValue([]);
      vi.spyOn(auditRepository, 'countTenantAuditLogs').mockResolvedValue(0);

      const res = await request(app)
        .get('/api/v1/audit')
        .set('Authorization', `Bearer ${getAuthToken(mockAdminTenantA)}`);

      expect(res.status).toBe(200);
      expect(findSpy).toHaveBeenCalledWith(
        TENANT_A_ID,
        expect.anything(),
        expect.anything()
      );
    });
  });

  describe('4. Input Validation & Query Hardening', () => {
    it('rejects limit exceeding 100 with 400 validation error', async () => {
      const res = await request(app)
        .get('/api/v1/audit?limit=500')
        .set('Authorization', `Bearer ${getAuthToken(mockAdminTenantA)}`);

      expect(res.status).toBe(400);
      expect(res.body.error.details[0].message).toContain('Limit cannot exceed 100');
    });

    it('rejects invalid date format with 400 validation error', async () => {
      const res = await request(app)
        .get('/api/v1/audit?startDate=invalid-date')
        .set('Authorization', `Bearer ${getAuthToken(mockAdminTenantA)}`);

      expect(res.status).toBe(400);
    });

    it('rejects date range where startDate is after endDate with 400', async () => {
      const res = await request(app)
        .get('/api/v1/audit?startDate=2026-09-25&endDate=2026-09-10')
        .set('Authorization', `Bearer ${getAuthToken(mockAdminTenantA)}`);

      expect(res.status).toBe(400);
      expect(res.body.error.details[0].message).toContain('startDate must be before or equal to endDate');
    });

    it('safely parameterizes SQL injection payloads without throwing syntax or unhandled errors', async () => {
      const findSpy = vi.spyOn(auditRepository, 'findTenantAuditLogs').mockResolvedValue([]);
      vi.spyOn(auditRepository, 'countTenantAuditLogs').mockResolvedValue(0);

      const injectionPayload = "'; DROP TABLE audit_logs; --";

      const res = await request(app)
        .get(`/api/v1/audit?actionPerformed=${encodeURIComponent(injectionPayload)}`)
        .set('Authorization', `Bearer ${getAuthToken(mockAdminTenantA)}`);

      expect(res.status).toBe(200);
      expect(findSpy).toHaveBeenCalledWith(
        TENANT_A_ID,
        expect.objectContaining({ actionPerformed: injectionPayload }),
        expect.anything()
      );
    });

    it('safely handles prototype pollution keys in query params without altering Object prototype', async () => {
      vi.spyOn(auditRepository, 'findTenantAuditLogs').mockResolvedValue([]);
      vi.spyOn(auditRepository, 'countTenantAuditLogs').mockResolvedValue(0);

      const res = await request(app)
        .get('/api/v1/audit?__proto__[polluted]=true&constructor[prototype][polluted]=true')
        .set('Authorization', `Bearer ${getAuthToken(mockAdminTenantA)}`);

      expect(res.status).toBe(200);
      expect(({})['polluted']).toBeUndefined();
    });
  });
});
