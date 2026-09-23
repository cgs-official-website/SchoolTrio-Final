import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import * as authRepository from '../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../src/modules/auth/token.service.js';
import * as superAdminRepository from '../../src/modules/superadmin/superadmin.repository.js';
import { SYSTEM_ROLES } from '../../src/config/constants.js';

vi.mock('../../src/modules/auth/password.service.js', () => ({
  hashPassword: vi.fn().mockResolvedValue('argon2id$hashed_pass')
}));

describe('SuperAdmin Security & Access Control Tests', () => {
  const app = createApp();

  const TENANT_ID = '11111111-1111-4111-8111-111111111111';

  const mockUsers = {
    [SYSTEM_ROLES.SUPER_ADMIN]: {
      id: 'usr-superadmin',
      schoolId: null,
      email: 'superadmin@system.local',
      systemRole: SYSTEM_ROLES.SUPER_ADMIN,
      tokenVersion: 1,
      isActive: true
    },
    [SYSTEM_ROLES.SCHOOL_ADMIN]: {
      id: 'usr-schooladmin',
      schoolId: TENANT_ID,
      email: 'admin@tenant.local',
      systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
      tokenVersion: 1,
      isActive: true,
      school: { id: TENANT_ID, status: 'approved' }
    },
    [SYSTEM_ROLES.PRINCIPAL]: {
      id: 'usr-principal',
      schoolId: TENANT_ID,
      email: 'principal@tenant.local',
      systemRole: SYSTEM_ROLES.PRINCIPAL,
      tokenVersion: 1,
      isActive: true,
      school: { id: TENANT_ID, status: 'approved' }
    },
    [SYSTEM_ROLES.TEACHER]: {
      id: 'usr-teacher',
      schoolId: TENANT_ID,
      email: 'teacher@tenant.local',
      systemRole: SYSTEM_ROLES.TEACHER,
      tokenVersion: 1,
      isActive: true,
      school: { id: TENANT_ID, status: 'approved' }
    },
    [SYSTEM_ROLES.STAFF]: {
      id: 'usr-staff',
      schoolId: TENANT_ID,
      email: 'staff@tenant.local',
      systemRole: SYSTEM_ROLES.STAFF,
      tokenVersion: 1,
      isActive: true,
      school: { id: TENANT_ID, status: 'approved' }
    },
    [SYSTEM_ROLES.STUDENT]: {
      id: 'usr-student',
      schoolId: TENANT_ID,
      email: 'student@tenant.local',
      systemRole: SYSTEM_ROLES.STUDENT,
      tokenVersion: 1,
      isActive: true,
      school: { id: TENANT_ID, status: 'approved' }
    },
    [SYSTEM_ROLES.PARENT]: {
      id: 'usr-parent',
      schoolId: TENANT_ID,
      email: 'parent@tenant.local',
      systemRole: SYSTEM_ROLES.PARENT,
      tokenVersion: 1,
      isActive: true,
      school: { id: TENANT_ID, status: 'approved' }
    }
  };

  const getTokenForRole = (role) => {
    const user = mockUsers[role];
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
      return Object.values(mockUsers).find((u) => u.id === id) || null;
    });
  });

  describe('1. Authentication Verification', () => {
    it('returns 401 when Authorization header is missing', async () => {
      const res = await request(app).get('/api/v1/superadmin/stats');
      expect(res.status).toBe(401);
    });

    it('returns 401 when Authorization token is invalid or malformed', async () => {
      const res = await request(app)
        .get('/api/v1/superadmin/stats')
        .set('Authorization', 'Bearer invalid-token-string');
      expect(res.status).toBe(401);
    });
  });

  describe('2. Role-Based Access Control (RBAC) Matrix', () => {
    const testEndpoints = [
      { method: 'get', path: '/api/v1/superadmin/stats' },
      { method: 'get', path: '/api/v1/superadmin/tenants' },
      { method: 'get', path: `/api/v1/superadmin/tenants/${TENANT_ID}` },
      { method: 'get', path: '/api/v1/superadmin/plans' },
      { method: 'get', path: '/api/v1/superadmin/subscriptions' },
      { method: 'get', path: '/api/v1/superadmin/license-usage' }
    ];

    const unauthorizedRoles = [
      SYSTEM_ROLES.SCHOOL_ADMIN,
      SYSTEM_ROLES.PRINCIPAL,
      SYSTEM_ROLES.TEACHER,
      SYSTEM_ROLES.STAFF,
      SYSTEM_ROLES.STUDENT,
      SYSTEM_ROLES.PARENT
    ];

    unauthorizedRoles.forEach((role) => {
      it(`blocks ${role} from all platform endpoints with 403 Forbidden`, async () => {
        const token = getTokenForRole(role);

        for (const ep of testEndpoints) {
          const res = await request(app)
            [ep.method](ep.path)
            .set('Authorization', `Bearer ${token}`);

          expect(res.status).toBe(403);
          expect(res.body.success).toBe(false);
        }
      });
    });

    it('permits SUPER_ADMIN to access platform endpoints', async () => {
      const token = getTokenForRole(SYSTEM_ROLES.SUPER_ADMIN);
      vi.spyOn(superAdminRepository, 'getPlatformStats').mockResolvedValue({
        totalSchools: 1,
        activeSchools: 1,
        pendingSchools: 0,
        suspendedSchools: 0,
        rejectedSchools: 0,
        totalUsers: 10,
        totalStudents: 5,
        totalStaff: 2,
        estimatedMRR: 1000
      });

      const res = await request(app)
        .get('/api/v1/superadmin/stats')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('3. Anti-Tampering & Spoofing Defense', () => {
    it('ignores client-supplied isSuperAdmin or userRole spoofing in body or headers', async () => {
      const tenantToken = getTokenForRole(SYSTEM_ROLES.SCHOOL_ADMIN);

      const res = await request(app)
        .get('/api/v1/superadmin/stats')
        .set('Authorization', `Bearer ${tenantToken}`)
        .set('X-User-Role', 'SUPER_ADMIN')
        .set('X-Is-SuperAdmin', 'true')
        .send({ isSuperAdmin: true, systemRole: 'SUPER_ADMIN' });

      expect(res.status).toBe(403);
    });
  });

  describe('4. Input Validation & Defense in Depth', () => {
    it('rejects SQL injection payloads in tenant ID param', async () => {
      const token = getTokenForRole(SYSTEM_ROLES.SUPER_ADMIN);

      const res = await request(app)
        .get("/api/v1/superadmin/tenants/' OR '1'='1")
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body.error)).toContain('Invalid tenant ID format');
    });

    it('rejects limit exceeding 100 on pagination queries', async () => {
      const token = getTokenForRole(SYSTEM_ROLES.SUPER_ADMIN);

      const res = await request(app)
        .get('/api/v1/superadmin/tenants?limit=500')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.error)).toContain('Limit cannot exceed 100');
    });

    it('rejects negative quota limits during tenant config updates', async () => {
      const token = getTokenForRole(SYSTEM_ROLES.SUPER_ADMIN);

      const res = await request(app)
        .patch(`/api/v1/superadmin/tenants/${TENANT_ID}/config`)
        .set('Authorization', `Bearer ${token}`)
        .send({ seatLimit: -50 });

      expect(res.status).toBe(400);
    });
  });
});
