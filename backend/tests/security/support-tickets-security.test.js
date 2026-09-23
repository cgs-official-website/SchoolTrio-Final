import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import * as authRepository from '../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../src/modules/auth/token.service.js';
import * as supportTicketsRepository from '../../src/modules/support-tickets/support-tickets.repository.js';
import { prisma } from '../../src/database/prisma.client.js';
import { SYSTEM_ROLES } from '../../src/config/constants.js';

describe('Support Tickets Security & Tenant Isolation Test Suite', () => {
  const app = createApp();

  const TENANT_A_ID = '11111111-1111-4111-8111-111111111111';
  const TENANT_B_ID = '22222222-2222-4222-8222-222222222222';
  const TICKET_TENANT_A = '33333333-3333-4333-8333-333333333333';
  const TICKET_TENANT_B = '44444444-4444-4444-8444-444444444444';

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
    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb) => cb(prisma));

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
      const res = await request(app).get('/api/v1/support-tickets');
      expect(res.status).toBe(401);
    });

    it('returns 401 when token is invalid or malformed', async () => {
      const res = await request(app)
        .get('/api/v1/support-tickets')
        .set('Authorization', 'Bearer invalid-token');
      expect(res.status).toBe(401);
    });
  });

  describe('2. RBAC Enforcement Matrix', () => {
    it('allows SCHOOL_ADMIN to access support tickets', async () => {
      vi.spyOn(supportTicketsRepository, 'findTenantTickets').mockResolvedValue([]);
      vi.spyOn(supportTicketsRepository, 'countTenantTickets').mockResolvedValue(0);

      const res = await request(app)
        .get('/api/v1/support-tickets')
        .set('Authorization', `Bearer ${getAuthToken(mockAdminTenantA)}`);

      expect(res.status).toBe(200);
    });

    it('allows TEACHER to access support tickets', async () => {
      vi.spyOn(supportTicketsRepository, 'findTenantTickets').mockResolvedValue([]);
      vi.spyOn(supportTicketsRepository, 'countTenantTickets').mockResolvedValue(0);

      const res = await request(app)
        .get('/api/v1/support-tickets')
        .set('Authorization', `Bearer ${getAuthToken(mockTeacherTenantA)}`);

      expect(res.status).toBe(200);
    });

    it('denies STUDENT from accessing support tickets with 403', async () => {
      const res = await request(app)
        .get('/api/v1/support-tickets')
        .set('Authorization', `Bearer ${getAuthToken(mockStudentTenantA)}`);

      expect(res.status).toBe(403);
    });

    it('denies PARENT from accessing support tickets with 403', async () => {
      const res = await request(app)
        .get('/api/v1/support-tickets')
        .set('Authorization', `Bearer ${getAuthToken(mockParentTenantA)}`);

      expect(res.status).toBe(403);
    });

    it('denies non-SuperAdmin roles from accessing /api/v1/superadmin/support-tickets with 403', async () => {
      const res = await request(app)
        .get('/api/v1/superadmin/support-tickets')
        .set('Authorization', `Bearer ${getAuthToken(mockAdminTenantA)}`);

      expect(res.status).toBe(403);
    });
  });

  describe('3. Strict Tenant Isolation & Anti-Spoofing', () => {
    it('strictly rejects cross-tenant spoofing attempt with 403 when user supplies foreign schoolId', async () => {
      const res = await request(app)
        .get(`/api/v1/support-tickets?schoolId=${TENANT_B_ID}`)
        .set('Authorization', `Bearer ${getAuthToken(mockAdminTenantA)}`);

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain('Cross-tenant access rejected');
    });

    it('returns 404 when Tenant A attempts to access Tenant B ticket', async () => {
      // Return null because ticket does not belong to Tenant A
      vi.spyOn(supportTicketsRepository, 'findTicketById').mockResolvedValue(null);

      const res = await request(app)
        .get(`/api/v1/support-tickets/${TICKET_TENANT_B}`)
        .set('Authorization', `Bearer ${getAuthToken(mockAdminTenantA)}`);

      expect(res.status).toBe(404);
      expect(res.body.error.message).toContain('Support ticket not found');
    });

    it('returns 404 when Tenant A attempts to post reply to Tenant B ticket', async () => {
      vi.spyOn(supportTicketsRepository, 'findTicketById').mockResolvedValue(null);

      const res = await request(app)
        .post(`/api/v1/support-tickets/${TICKET_TENANT_B}/messages`)
        .set('Authorization', `Bearer ${getAuthToken(mockAdminTenantA)}`)
        .send({ message: 'Unauthorized reply' });

      expect(res.status).toBe(404);
    });
  });

  describe('4. Input Validation & Query Hardening', () => {
    it('rejects limit exceeding 100 with 400 validation error', async () => {
      const res = await request(app)
        .get('/api/v1/support-tickets?limit=500')
        .set('Authorization', `Bearer ${getAuthToken(mockAdminTenantA)}`);

      expect(res.status).toBe(400);
      expect(res.body.error.details[0].message).toContain('Limit cannot exceed 100');
    });

    it('rejects invalid priority string on ticket creation with 400', async () => {
      const res = await request(app)
        .post('/api/v1/support-tickets')
        .set('Authorization', `Bearer ${getAuthToken(mockAdminTenantA)}`)
        .send({
          subject: 'Valid Subject',
          description: 'Valid Description',
          priority: 'extreme'
        });

      expect(res.status).toBe(400);
      expect(res.body.error.details[0].message).toContain('Priority must be one of');
    });

    it('safely handles prototype pollution and search parameterization', async () => {
      vi.spyOn(supportTicketsRepository, 'findTenantTickets').mockResolvedValue([]);
      vi.spyOn(supportTicketsRepository, 'countTenantTickets').mockResolvedValue(0);

      const res = await request(app)
        .get('/api/v1/support-tickets?search=test&__proto__[polluted]=true')
        .set('Authorization', `Bearer ${getAuthToken(mockAdminTenantA)}`);

      expect(res.status).toBe(200);
      expect(({})['polluted']).toBeUndefined();
    });
  });
});
