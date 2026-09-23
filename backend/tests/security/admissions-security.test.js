import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import * as authRepository from '../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../src/modules/auth/token.service.js';
import * as rbacService from '../../src/modules/rbac/rbac.service.js';
import * as admissionsRepository from '../../src/modules/admissions/admissions.repository.js';
import * as admissionsService from '../../src/modules/admissions/admissions.service.js';
import { NotFoundError } from '../../src/utils/app-error.js';
import { SYSTEM_ROLES } from '../../src/config/constants.js';

describe('Security: Admissions & Lead Management Tenant Isolation & RBAC (Phase ADMISSION.4)', () => {
  const app = createApp();

  const SCHOOL_A = '11111111-1111-4111-8111-111111111111';
  const SCHOOL_B = '22222222-2222-4222-8222-222222222222';
  const LEAD_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const FORM_B = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  const APP_B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const CLASS_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  const userSchoolA = {
    id: 'user-school-a',
    schoolId: SCHOOL_A,
    email: 'admin@school-a.edu',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_A, name: 'School A', code: 'SCH-A', status: 'approved' }
  };

  const userReadOnlyLeads = {
    id: 'user-readonly',
    schoolId: SCHOOL_A,
    email: 'viewer@school-a.edu',
    systemRole: SYSTEM_ROLES.TEACHER,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_A, name: 'School A', code: 'SCH-A', status: 'approved' }
  };

  const userNoLeadsPerm = {
    id: 'user-no-perm',
    schoolId: SCHOOL_A,
    email: 'noperm@school-a.edu',
    systemRole: SYSTEM_ROLES.TEACHER,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_A, name: 'School A', code: 'SCH-A', status: 'approved' }
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
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. AUTHENTICATION & IDENTITY ENFORCEMENT
  // =========================================================================
  describe('1. Authentication Guard', () => {
    it('rejects unauthenticated requests to /api/v1/admissions/leads with 401', async () => {
      const res = await request(app).get('/api/v1/admissions/leads');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('rejects unauthenticated requests to /api/v1/admissions/forms with 401', async () => {
      const res = await request(app).get('/api/v1/admissions/forms');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('rejects unauthenticated requests to /api/v1/admissions/applications with 401', async () => {
      const res = await request(app).get('/api/v1/admissions/applications');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('rejects unauthenticated enrollment mutation with 401', async () => {
      const res = await request(app)
        .post(`/api/v1/admissions/applications/${APP_B}/enroll`)
        .send({ admissionNumber: 'ADM-100', classId: CLASS_A });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  // =========================================================================
  // 2. GRANULAR RBAC AUTHORIZATION
  // =========================================================================
  describe('2. Granular RBAC Permissions', () => {
    it('rejects users without leads module permission with 403 Forbidden', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(userNoLeadsPerm);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        leads: { canRead: false, canCreate: false, canEdit: false, canDelete: false }
      });

      const token = getAuthToken(userNoLeadsPerm);
      const res = await request(app)
        .get('/api/v1/admissions/leads')
        .set('Authorization', `Bearer ${token}`)
        .set('x-school-id', SCHOOL_A);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('allows read operations for user with leads.read, but rejects create with 403', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(userReadOnlyLeads);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        leads: { canRead: true, canCreate: false, canEdit: false, canDelete: false }
      });
      vi.spyOn(admissionsRepository, 'findLeadForms').mockResolvedValue([]);
      vi.spyOn(admissionsRepository, 'countLeadForms').mockResolvedValue(0);

      const token = getAuthToken(userReadOnlyLeads);

      // GET should pass authorization
      const getRes = await request(app)
        .get('/api/v1/admissions/forms')
        .set('Authorization', `Bearer ${token}`)
        .set('x-school-id', SCHOOL_A);
      expect(getRes.status).toBe(200);

      // POST create form should be rejected with 403
      const postRes = await request(app)
        .post('/api/v1/admissions/forms')
        .set('Authorization', `Bearer ${token}`)
        .set('x-school-id', SCHOOL_A)
        .send({ title: 'New Form', fields: [] });
      expect(postRes.status).toBe(403);
    });

    it('rejects status update and enrollment if user lacks leads.edit permission', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(userReadOnlyLeads);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        leads: { canRead: true, canCreate: false, canEdit: false, canDelete: false }
      });

      const token = getAuthToken(userReadOnlyLeads);

      const patchRes = await request(app)
        .patch(`/api/v1/admissions/leads/${LEAD_B}/status`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-school-id', SCHOOL_A)
        .send({ status: 'Hot' });
      expect(patchRes.status).toBe(403);

      const enrollRes = await request(app)
        .post(`/api/v1/admissions/applications/${APP_B}/enroll`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-school-id', SCHOOL_A)
        .send({ admissionNumber: 'ADM-001', classId: CLASS_A });
      expect(enrollRes.status).toBe(403);
    });

    it('rejects deletion if user lacks leads.delete permission', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(userReadOnlyLeads);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        leads: { canRead: true, canCreate: false, canEdit: true, canDelete: false }
      });

      const token = getAuthToken(userReadOnlyLeads);

      const deleteRes = await request(app)
        .delete(`/api/v1/admissions/leads/${LEAD_B}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-school-id', SCHOOL_A);
      expect(deleteRes.status).toBe(403);
    });
  });

  // =========================================================================
  // 3. STRICT TENANT ISOLATION & IDOR PREVENTION
  // =========================================================================
  describe('3. Strict Tenant Isolation (School A attempting access on School B)', () => {
    beforeEach(() => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(userSchoolA);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        leads: { canRead: true, canCreate: true, canEdit: true, canDelete: true }
      });
    });

    it('returns 404 when School A user requests a lead belonging to School B', async () => {
      vi.spyOn(admissionsRepository, 'findLeadById').mockResolvedValue(null);

      const token = getAuthToken(userSchoolA);
      const res = await request(app)
        .get(`/api/v1/admissions/leads/${LEAD_B}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-school-id', SCHOOL_A);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 404 when School A user attempts to update a lead form belonging to School B', async () => {
      vi.spyOn(admissionsRepository, 'findLeadFormById').mockResolvedValue(null);

      const token = getAuthToken(userSchoolA);
      const res = await request(app)
        .patch(`/api/v1/admissions/forms/${FORM_B}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-school-id', SCHOOL_A)
        .send({ title: 'Hacked Title' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 404 when School A user attempts to delete an application belonging to School B', async () => {
      vi.spyOn(admissionsRepository, 'findApplicationById').mockResolvedValue(null);

      const token = getAuthToken(userSchoolA);
      const res = await request(app)
        .delete(`/api/v1/admissions/applications/${APP_B}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-school-id', SCHOOL_A);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 404 when School A user attempts to enroll an application belonging to School B', async () => {
      vi.spyOn(admissionsRepository, 'findApplicationById').mockResolvedValue(null);

      const token = getAuthToken(userSchoolA);
      const res = await request(app)
        .post(`/api/v1/admissions/applications/${APP_B}/enroll`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-school-id', SCHOOL_A)
        .send({ admissionNumber: 'ADM-001', classId: CLASS_A });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('prevents identity spoofing: header/body schoolId cannot bypass JWT tenant context', async () => {
      const spyFindLeads = vi.spyOn(admissionsRepository, 'findLeads').mockResolvedValue([]);
      vi.spyOn(admissionsRepository, 'countLeads').mockResolvedValue(0);

      const token = getAuthToken(userSchoolA); // Authenticated as SCHOOL_A
      await request(app)
        .get('/api/v1/admissions/leads')
        .set('Authorization', `Bearer ${token}`)
        .set('x-school-id', SCHOOL_B); // Attempting to spoof School B in header

      if (spyFindLeads.mock.calls.length > 0) {
        expect(spyFindLeads.mock.calls[0][0]).toBe(SCHOOL_A);
      }
    });
  });

  // =========================================================================
  // 4. PUBLIC ENDPOINT SECURITY & INPUT VALIDATION
  // =========================================================================
  describe('4. Public Endpoints Security & Dynamic Validation', () => {
    it('returns 404 when public form lookup does not match school UUID', async () => {
      vi.spyOn(admissionsService, 'getPublicLeadForm').mockRejectedValue(new NotFoundError('Lead form'));

      const res = await request(app)
        .get(`/api/v1/public/leads/forms/${SCHOOL_A}/${FORM_B}`);

      expect(res.status).toBe(404);
    });

    it('rejects public admission submission with invalid class UUID', async () => {
      const res = await request(app)
        .post(`/api/v1/public/admissions/${SCHOOL_A}`)
        .send({
          firstName: 'Test',
          lastName: 'Student',
          dob: '2016-04-12',
          gender: 'Male',
          parentName: 'Test Parent',
          parentPhone: '9876543210',
          parentEmail: 'parent@example.com',
          address: '123 Main St',
          classId: 'invalid-class-uuid'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('strips injected privileged fields from public admission payload', async () => {
      const spyCreateApp = vi.spyOn(admissionsService, 'submitPublicAdmission').mockResolvedValue({
        id: 'app-new',
        applicationNumber: 'ADM-2026-0001',
        status: 'Pending'
      });

      const res = await request(app)
        .post(`/api/v1/public/admissions/${SCHOOL_A}`)
        .send({
          firstName: 'Injected',
          lastName: 'Student',
          dob: '2016-04-12',
          gender: 'Male',
          parentName: 'Injected Parent',
          parentPhone: '9876543210',
          parentEmail: 'injected@example.com',
          address: '123 Main St',
          classId: CLASS_A,
          status: 'Approved', // Spoofed status
          isAdmin: true,       // Spoofed admin flag
          role: 'SUPERADMIN'  // Spoofed role
        });

      expect(res.status).toBe(201);
      expect(spyCreateApp).toHaveBeenCalled();
      const calledPayload = spyCreateApp.mock.calls[0][1];
      expect(calledPayload.status).toBeUndefined();
      expect(calledPayload.isAdmin).toBeUndefined();
      expect(calledPayload.role).toBeUndefined();
    });
  });
});
