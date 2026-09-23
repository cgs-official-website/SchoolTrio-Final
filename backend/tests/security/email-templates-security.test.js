import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import * as authRepository from '../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../src/modules/auth/token.service.js';
import * as emailTemplatesRepo from '../../src/modules/email-templates/email-templates.repository.js';
import * as auditRepo from '../../src/modules/audit/audit.repository.js';
import { SYSTEM_ROLES } from '../../src/config/constants.js';

describe('Security: Email Templates Tenant Isolation, RBAC & Protection', () => {
  const app = createApp();

  const SCHOOL_A = '11111111-1111-4111-8111-111111111111';
  const SCHOOL_B = '22222222-2222-4222-8222-222222222222';

  const userSuperAdmin = {
    id: 'user-super-admin',
    schoolId: null,
    email: 'superadmin@platform.edu',
    systemRole: SYSTEM_ROLES.SUPER_ADMIN,
    tokenVersion: 1,
    isActive: true
  };

  const userSchoolAAdmin = {
    id: 'user-a-admin',
    schoolId: SCHOOL_A,
    email: 'admin@school-a.edu',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_A, name: 'School A', code: 'SCH-A', status: 'approved' }
  };

  const userSchoolAPrincipal = {
    id: 'user-a-principal',
    schoolId: SCHOOL_A,
    email: 'principal@school-a.edu',
    systemRole: SYSTEM_ROLES.PRINCIPAL,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_A, name: 'School A', code: 'SCH-A', status: 'approved' }
  };

  const userSchoolATeacher = {
    id: 'user-a-teacher',
    schoolId: SCHOOL_A,
    email: 'teacher@school-a.edu',
    systemRole: SYSTEM_ROLES.TEACHER,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_A, name: 'School A', code: 'SCH-A', status: 'approved' }
  };

  const userSchoolAParent = {
    id: 'user-a-parent',
    schoolId: SCHOOL_A,
    email: 'parent@school-a.edu',
    systemRole: SYSTEM_ROLES.PARENT,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_A, name: 'School A', code: 'SCH-A', status: 'approved' }
  };

  const userSchoolAStudent = {
    id: 'user-a-student',
    schoolId: SCHOOL_A,
    email: 'student@school-a.edu',
    systemRole: SYSTEM_ROLES.STUDENT,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_A, name: 'School A', code: 'SCH-A', status: 'approved' }
  };

  const userSchoolBAdmin = {
    id: 'user-b-admin',
    schoolId: SCHOOL_B,
    email: 'admin@school-b.edu',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_B, name: 'School B', code: 'SCH-B', status: 'approved' }
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
    vi.spyOn(authRepository, 'findUserById').mockImplementation(async (id) => {
      if (id === userSuperAdmin.id) return userSuperAdmin;
      if (id === userSchoolAAdmin.id) return userSchoolAAdmin;
      if (id === userSchoolAPrincipal.id) return userSchoolAPrincipal;
      if (id === userSchoolATeacher.id) return userSchoolATeacher;
      if (id === userSchoolAParent.id) return userSchoolAParent;
      if (id === userSchoolAStudent.id) return userSchoolAStudent;
      if (id === userSchoolBAdmin.id) return userSchoolBAdmin;
      return null;
    });

    vi.spyOn(authRepository, 'findSchoolById').mockImplementation(async (id) => {
      if (id === SCHOOL_A) return { id: SCHOOL_A, name: 'School A', code: 'SCH-A', status: 'approved' };
      if (id === SCHOOL_B) return { id: SCHOOL_B, name: 'School B', code: 'SCH-B', status: 'approved' };
      return null;
    });

    vi.spyOn(auditRepo, 'createAuditLog').mockResolvedValue({});
    vi.spyOn(emailTemplatesRepo, 'findEmailTemplatesSetting').mockResolvedValue(null);
    vi.spyOn(emailTemplatesRepo, 'upsertEmailTemplatesSetting').mockResolvedValue({});
    vi.spyOn(emailTemplatesRepo, 'executeTransaction').mockImplementation(async (cb) => cb({}));
  });

  describe('1. Authentication Security', () => {
    it('rejects unauthenticated GET /api/v1/email-templates with 401', async () => {
      const res = await request(app).get('/api/v1/email-templates');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('rejects unauthenticated PATCH /api/v1/email-templates/welcome with 401', async () => {
      const res = await request(app)
        .patch('/api/v1/email-templates/welcome')
        .send({ subject: 'New Subject' });
      expect(res.status).toBe(401);
    });

    it('rejects unauthenticated POST /api/v1/email-templates with 401', async () => {
      const res = await request(app)
        .post('/api/v1/email-templates')
        .send({ name: 'Custom', subject: 'Custom', body: 'Body' });
      expect(res.status).toBe(401);
    });

    it('rejects unauthenticated DELETE /api/v1/email-templates/custom with 401', async () => {
      const res = await request(app).delete('/api/v1/email-templates/custom');
      expect(res.status).toBe(401);
    });
  });

  describe('2. Role-Based Access Control (RBAC)', () => {
    it('allows SCHOOL_ADMIN to access email templates', async () => {
      const token = getAuthToken(userSchoolAAdmin);
      const res = await request(app)
        .get('/api/v1/email-templates')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('allows PRINCIPAL to access email templates', async () => {
      const token = getAuthToken(userSchoolAPrincipal);
      const res = await request(app)
        .get('/api/v1/email-templates')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('allows SUPER_ADMIN with X-Tenant-Id switch to access email templates', async () => {
      const token = getAuthToken(userSuperAdmin);
      const res = await request(app)
        .get('/api/v1/email-templates')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Tenant-Id', SCHOOL_A);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('rejects TEACHER with 403 Forbidden', async () => {
      const token = getAuthToken(userSchoolATeacher);
      const res = await request(app)
        .get('/api/v1/email-templates')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('rejects PARENT with 403 Forbidden', async () => {
      const token = getAuthToken(userSchoolAParent);
      const res = await request(app)
        .get('/api/v1/email-templates')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    });

    it('rejects STUDENT with 403 Forbidden', async () => {
      const token = getAuthToken(userSchoolAStudent);
      const res = await request(app)
        .get('/api/v1/email-templates')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    });
  });

  describe('3. Multi-Tenant Isolation & Anti-Poisoning', () => {
    it('scopes database queries strictly to authenticated user schoolId', async () => {
      const findSpy = vi.spyOn(emailTemplatesRepo, 'findEmailTemplatesSetting');
      const token = getAuthToken(userSchoolAAdmin);

      await request(app)
        .get('/api/v1/email-templates')
        .set('Authorization', `Bearer ${token}`);

      expect(findSpy).toHaveBeenCalledWith(SCHOOL_A, undefined);
      expect(findSpy).not.toHaveBeenCalledWith(SCHOOL_B, undefined);
    });

    it('strictly rejects non-superadmin attempting unauthorized tenant switch via X-Tenant-Id header', async () => {
      const token = getAuthToken(userSchoolAAdmin);
      const res = await request(app)
        .get('/api/v1/email-templates')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Tenant-Id', SCHOOL_B);

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain('Unauthorized tenant switch attempt');
    });

    it('strictly rejects client-supplied schoolId conflict in body or query', async () => {
      const token = getAuthToken(userSchoolAAdmin);
      const res = await request(app)
        .get(`/api/v1/email-templates?schoolId=${SCHOOL_B}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain('Cross-tenant access rejected');
    });
  });

  describe('4. Protected System Template Invariants', () => {
    it('prohibits deletion of system templates with 400 Validation Error', async () => {
      const token = getAuthToken(userSchoolAAdmin);
      const res = await request(app)
        .delete('/api/v1/email-templates/welcome')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('System template');
      expect(res.body.error.message).toContain('cannot be deleted');
    });
  });

  describe('5. Mass Assignment & Schema Hardening', () => {
    it('rejects unknown fields in PATCH update body', async () => {
      const token = getAuthToken(userSchoolAAdmin);
      const res = await request(app)
        .patch('/api/v1/email-templates/welcome')
        .set('Authorization', `Bearer ${token}`)
        .send({
          subject: 'Valid Subject',
          isSystem: false,
          maliciousField: 'exploit'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects client-supplied conflicting schoolId in body with 403 TenantAccessError', async () => {
      const token = getAuthToken(userSchoolAAdmin);
      const res = await request(app)
        .patch('/api/v1/email-templates/welcome')
        .set('Authorization', `Bearer ${token}`)
        .send({
          subject: 'Valid Subject',
          schoolId: SCHOOL_B
        });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain('Cross-tenant access rejected');
    });
  });
});
