import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import * as leaveService from '../../src/modules/leaves/leave.service.js';
import * as authRepository from '../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../src/modules/auth/token.service.js';
import { SYSTEM_ROLES } from '../../src/config/constants.js';
import { NotFoundError } from '../../src/utils/app-error.js';

describe('Security: Parent Leave Applications Domain (Phase 4C.7-D.2-I-L.1)', () => {
  const app = createApp();

  const TENANT_A = '11111111-1111-4111-8111-111111111111';
  const TENANT_B = '22222222-2222-4222-8222-222222222222';

  const STUDENT_A = '33333333-3333-4333-8333-333333333333';
  const STUDENT_OTHER_A = '44444444-4444-4444-8444-444444444444';
  const STUDENT_B = '55555555-5555-4555-8555-555555555555';

  const PARENT_A_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const INACTIVE_PARENT_USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  const parentUserTenantA = {
    id: PARENT_A_USER_ID,
    schoolId: TENANT_A,
    email: 'parent.a@school-a.com',
    systemRole: SYSTEM_ROLES.PARENT,
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_A, name: 'School A', code: 'SchoolA', status: 'active' }
  };

  const inactiveParentUser = {
    id: INACTIVE_PARENT_USER_ID,
    schoolId: TENANT_A,
    email: 'inactive@school-a.com',
    systemRole: SYSTEM_ROLES.PARENT,
    tokenVersion: 1,
    isActive: false,
    school: { id: TENANT_A, name: 'School A', code: 'SchoolA', status: 'active' }
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const getAuthToken = (user, overrides = {}) => {
    return tokenService.issueAccessToken({
      sub: user.id,
      schoolId: user.schoolId,
      systemRole: user.systemRole,
      tokenVersion: user.tokenVersion,
      ...overrides
    });
  };

  describe('1. Authentication & Token Verification', () => {
    it('returns 401 when no token is provided', async () => {
      const res = await request(app)
        .get(`/api/v1/students/${STUDENT_A}/leaves`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 401 when malformed token is provided', async () => {
      const res = await request(app)
        .get(`/api/v1/students/${STUDENT_A}/leaves`)
        .set('Authorization', 'Bearer invalid-token-string');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 403 when user is inactive', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(inactiveParentUser);

      const token = getAuthToken(inactiveParentUser);
      const res = await request(app)
        .get(`/api/v1/students/${STUDENT_A}/leaves`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('2. Parent Ownership & Cross-Tenant Access', () => {
    it('returns 200 when linked parent fetches student leaves', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(parentUserTenantA);
      vi.spyOn(leaveService, 'getStudentLeaves').mockResolvedValue({
        leaves: [
          {
            id: '77777777-7777-4777-8777-777777777777',
            studentId: STUDENT_A,
            leaveType: 'Sick Leave',
            startDate: '2026-09-15',
            endDate: '2026-09-16',
            reason: 'Flu',
            status: 'Pending',
            reviewedBy: null,
            supportingDoc: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ],
        pagination: { page: 1, limit: 50, total: 1, totalPages: 1, hasNextPage: false, hasPrevPage: false }
      });

      const token = getAuthToken(parentUserTenantA);
      const res = await request(app)
        .get(`/api/v1/students/${STUDENT_A}/leaves`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });

    it('returns 404 when parent attempts to read leaves of an unlinked student', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(parentUserTenantA);
      vi.spyOn(leaveService, 'getStudentLeaves').mockRejectedValue(new NotFoundError('Student'));

      const token = getAuthToken(parentUserTenantA);
      const res = await request(app)
        .get(`/api/v1/students/${STUDENT_OTHER_A}/leaves`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 404 when Parent A attempts to read leaves of Student in Tenant B', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(parentUserTenantA);
      vi.spyOn(leaveService, 'getStudentLeaves').mockRejectedValue(new NotFoundError('Student'));

      const token = getAuthToken(parentUserTenantA);
      const res = await request(app)
        .get(`/api/v1/students/${STUDENT_B}/leaves`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 404 when parent attempts to create leave for an unlinked student', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(parentUserTenantA);
      vi.spyOn(leaveService, 'createStudentLeave').mockRejectedValue(new NotFoundError('Student'));

      const token = getAuthToken(parentUserTenantA);
      const res = await request(app)
        .post(`/api/v1/students/${STUDENT_OTHER_A}/leaves`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          leaveType: 'Sick Leave',
          startDate: '2026-09-15',
          endDate: '2026-09-16',
          reason: 'Fever'
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('3. Parameter Poisoning & Status Injection Protection', () => {
    it('ignores client injected status, applicantId, and forces status Pending', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(parentUserTenantA);

      let capturedData = null;
      vi.spyOn(leaveService, 'createStudentLeave').mockImplementation(async (schoolId, studentId, data, requester) => {
        capturedData = { schoolId, studentId, data, requester };
        return {
          id: '88888888-8888-4888-8888-888888888888',
          studentId,
          leaveType: data.leaveType,
          startDate: data.startDate,
          endDate: data.endDate,
          reason: data.reason,
          status: 'Pending',
          reviewedBy: null,
          supportingDoc: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
      });

      const token = getAuthToken(parentUserTenantA);
      const res = await request(app)
        .post(`/api/v1/students/${STUDENT_A}/leaves`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          leaveType: 'Sick Leave',
          startDate: '2026-09-15',
          endDate: '2026-09-16',
          reason: 'Medical rest',
          status: 'Approved', // Injection attempt
          reviewedBy: '00000000-0000-0000-0000-000000000000', // Injection attempt
          applicantId: STUDENT_B // Injection attempt
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('Pending');

      // Verify service layer received tenant from token/middleware and URL param
      expect(capturedData.schoolId).toBe(TENANT_A);
      expect(capturedData.studentId).toBe(STUDENT_A);
      // Schema strips status, reviewedBy, applicantId from validated req.body
      expect(capturedData.data.status).toBeUndefined();
      expect(capturedData.data.reviewedBy).toBeUndefined();
      expect(capturedData.data.applicantId).toBeUndefined();
    });

    it('rejects cross-tenant schoolId injection attempt in body with 403', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(parentUserTenantA);

      const token = getAuthToken(parentUserTenantA);
      const res = await request(app)
        .post(`/api/v1/students/${STUDENT_A}/leaves`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          leaveType: 'Sick Leave',
          startDate: '2026-09-15',
          endDate: '2026-09-16',
          reason: 'Medical rest',
          schoolId: TENANT_B // Cross-tenant injection attempt
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });
});
