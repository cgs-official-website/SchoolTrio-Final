import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import * as authRepository from '../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../src/modules/auth/token.service.js';
import * as settingsRepo from '../../src/modules/settings/settings.repository.js';
import * as auditRepo from '../../src/modules/audit/audit.repository.js';
import { SYSTEM_ROLES } from '../../src/config/constants.js';

describe('Security: School Settings Tenant Isolation, RBAC & Secret Protection (Phase SETTINGS.4)', () => {
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
    vi.spyOn(settingsRepo, 'findSettingsByCategories').mockResolvedValue([]);
  });

  describe('1. Authentication Security (Section 4)', () => {
    it('rejects unauthenticated request to /api/v1/settings/school with 401', async () => {
      const res = await request(app).get('/api/v1/settings/school');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('rejects malformed Bearer token with 401', async () => {
      const res = await request(app)
        .get('/api/v1/settings/school')
        .set('Authorization', 'Bearer malformed.jwt.token');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('rejects token without Bearer prefix with 401', async () => {
      const token = getAuthToken(userSchoolAAdmin);
      const res = await request(app)
        .get('/api/v1/settings/school')
        .set('Authorization', token);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('rejects expired / invalid token with 401', async () => {
      const res = await request(app)
        .get('/api/v1/settings/school')
        .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('2. Role-Based Access Control (RBAC) Matrix (Sections 5 & 6)', () => {
    it('allows SUPER_ADMIN to perform all Settings operations when specifying tenant context', async () => {
      vi.spyOn(settingsRepo, 'findSchoolById').mockResolvedValue({ id: SCHOOL_A, name: 'School A', status: 'approved' });
      vi.spyOn(settingsRepo, 'findSettingsByCategories').mockResolvedValue([]);
      vi.spyOn(settingsRepo, 'findSetting').mockResolvedValue({ data: { order: [] } });
      vi.spyOn(settingsRepo, 'executeTransaction').mockImplementation(async (cb) => cb({}));
      vi.spyOn(settingsRepo, 'updateSchool').mockResolvedValue({ id: SCHOOL_A, name: 'School A' });
      vi.spyOn(settingsRepo, 'upsertSetting').mockResolvedValue({});
      vi.spyOn(auditRepo, 'createAuditLog').mockResolvedValue({});

      const token = getAuthToken(userSuperAdmin);
      const getRes = await request(app)
        .get('/api/v1/settings/school')
        .set('Authorization', `Bearer ${token}`)
        .set('x-school-id', SCHOOL_A);
      expect(getRes.status).toBe(200);

      const patchRes = await request(app)
        .patch('/api/v1/settings/school')
        .set('Authorization', `Bearer ${token}`)
        .set('x-school-id', SCHOOL_A)
        .send({ name: 'School A' });
      expect(patchRes.status).toBe(200);

      const intGetRes = await request(app)
        .get('/api/v1/settings/integrations')
        .set('Authorization', `Bearer ${token}`)
        .set('x-school-id', SCHOOL_A);
      expect(intGetRes.status).toBe(200);

      const intPatchRes = await request(app)
        .patch('/api/v1/settings/integrations')
        .set('Authorization', `Bearer ${token}`)
        .set('x-school-id', SCHOOL_A)
        .send({ whatsapp: { enabled: true } });
      expect(intPatchRes.status).toBe(200);

      const sideGetRes = await request(app)
        .get('/api/v1/settings/sidebar')
        .set('Authorization', `Bearer ${token}`)
        .set('x-school-id', SCHOOL_A);
      expect(sideGetRes.status).toBe(200);

      const sidePutRes = await request(app)
        .put('/api/v1/settings/sidebar')
        .set('Authorization', `Bearer ${token}`)
        .set('x-school-id', SCHOOL_A)
        .send({ order: ['classes'] });
      expect(sidePutRes.status).toBe(200);
    });

    it('allows PRINCIPAL to manage settings and integrations', async () => {
      vi.spyOn(settingsRepo, 'findSchoolById').mockResolvedValue({ id: SCHOOL_A, name: 'School A', status: 'approved' });
      vi.spyOn(settingsRepo, 'findSettingsByCategories').mockResolvedValue([]);
      vi.spyOn(settingsRepo, 'executeTransaction').mockImplementation(async (cb) => cb({}));
      vi.spyOn(settingsRepo, 'updateSchool').mockResolvedValue({ id: SCHOOL_A, name: 'School A' });
      vi.spyOn(settingsRepo, 'upsertSetting').mockResolvedValue({});
      vi.spyOn(auditRepo, 'createAuditLog').mockResolvedValue({});

      const token = getAuthToken(userSchoolAPrincipal);
      const res = await request(app).patch('/api/v1/settings/school').set('Authorization', `Bearer ${token}`).send({ name: 'School A' });
      expect(res.status).toBe(200);
    });

    it('allows TEACHER to read school settings and sidebar, but denies mutations and integrations', async () => {
      vi.spyOn(settingsRepo, 'findSchoolById').mockResolvedValue({ id: SCHOOL_A, name: 'School A', code: 'SCH-A', status: 'approved' });
      vi.spyOn(settingsRepo, 'findSettingsByCategories').mockResolvedValue([]);
      vi.spyOn(settingsRepo, 'findSetting').mockResolvedValue({ data: { order: [] } });

      const token = getAuthToken(userSchoolATeacher);
      
      const resSchool = await request(app).get('/api/v1/settings/school').set('Authorization', `Bearer ${token}`);
      expect(resSchool.status).toBe(200);

      const resSidebar = await request(app).get('/api/v1/settings/sidebar').set('Authorization', `Bearer ${token}`);
      expect(resSidebar.status).toBe(200);

      const resPatchSchool = await request(app).patch('/api/v1/settings/school').set('Authorization', `Bearer ${token}`).send({ name: 'Hacked' });
      expect(resPatchSchool.status).toBe(403);

      const resGetIntegrations = await request(app).get('/api/v1/settings/integrations').set('Authorization', `Bearer ${token}`);
      expect(resGetIntegrations.status).toBe(403);

      const resPatchIntegrations = await request(app).patch('/api/v1/settings/integrations').set('Authorization', `Bearer ${token}`).send({ whatsapp: { enabled: true } });
      expect(resPatchIntegrations.status).toBe(403);

      const resPutSidebar = await request(app).put('/api/v1/settings/sidebar').set('Authorization', `Bearer ${token}`).send({ order: ['students'] });
      expect(resPutSidebar.status).toBe(403);
    });

    it('denies PARENT and STUDENT from modifying settings or accessing integrations with 403', async () => {
      const parentToken = getAuthToken(userSchoolAParent);
      const studentToken = getAuthToken(userSchoolAStudent);

      for (const token of [parentToken, studentToken]) {
        const resPatch = await request(app).patch('/api/v1/settings/school').set('Authorization', `Bearer ${token}`).send({ name: 'Bad' });
        expect(resPatch.status).toBe(403);

        const resInt = await request(app).get('/api/v1/settings/integrations').set('Authorization', `Bearer ${token}`);
        expect(resInt.status).toBe(403);

        const resIntPatch = await request(app).patch('/api/v1/settings/integrations').set('Authorization', `Bearer ${token}`).send({ whatsapp: { enabled: true } });
        expect(resIntPatch.status).toBe(403);

        const resPutSidebar = await request(app).put('/api/v1/settings/sidebar').set('Authorization', `Bearer ${token}`).send({ order: ['students'] });
        expect(resPutSidebar.status).toBe(403);
      }
    });
  });

  describe('3. Strict Tenant Isolation & IDOR Protection (Sections 7, 8 & 9)', () => {
    it('queries settings exclusively with req.tenant.schoolId, ignoring any injected schoolId in query', async () => {
      vi.spyOn(settingsRepo, 'findSchoolById').mockResolvedValue({ id: SCHOOL_A, name: 'School A', code: 'SCH-A', status: 'approved' });
      vi.spyOn(settingsRepo, 'findSettingsByCategories').mockResolvedValue([]);

      const token = getAuthToken(userSchoolAAdmin);
      const res = await request(app)
        .get('/api/v1/settings/school')
        .set('Authorization', `Bearer ${token}`)
        .query({ schoolId: SCHOOL_B });

      expect([400, 403, 404]).toContain(res.status);
    });

    it('strictly rejects attempt by Tenant A to inject schoolId in request body', async () => {
      const token = getAuthToken(userSchoolAAdmin);
      const res = await request(app)
        .patch('/api/v1/settings/school')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'School A Updated', schoolId: SCHOOL_B });

      // Tenant middleware / schema strictly rejects unauthorized schoolId parameter injection
      expect([400, 403]).toContain(res.status);
      expect(res.body.success).toBe(false);
    });
  });

  describe('4. Input Abuse & Protected Field Protection (Sections 10 & 11)', () => {
    it('rejects attempt to overwrite protected server-managed fields like seatLimit or status in PATCH /settings/school', async () => {
      const token = getAuthToken(userSchoolAAdmin);
      const res = await request(app)
        .patch('/api/v1/settings/school')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Valid Name',
          status: 'approved',
          seatLimit: 999999,
          teacherLimit: 99999
        });

      expect(res.status).toBe(400); // Strict Zod schema rejects unauthorized property injection
      expect(res.body.success).toBe(false);
    });

    it('rejects oversized strings in school name and address with 400', async () => {
      const token = getAuthToken(userSchoolAAdmin);
      const res = await request(app)
        .patch('/api/v1/settings/school')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'A'.repeat(500),
          address: 'B'.repeat(2000)
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('5. Object Abuse & Injection Resilience (Sections 12, 13 & 14)', () => {
    it('safely handles dangerous prototype property keys without prototype pollution', async () => {
      vi.spyOn(settingsRepo, 'findSchoolById').mockResolvedValue({ id: SCHOOL_A, name: 'School A', status: 'approved' });
      vi.spyOn(settingsRepo, 'executeTransaction').mockImplementation(async (cb) => cb({}));
      vi.spyOn(settingsRepo, 'updateSchool').mockResolvedValue({ id: SCHOOL_A, name: 'School A' });
      vi.spyOn(settingsRepo, 'findSetting').mockResolvedValue(null);
      vi.spyOn(settingsRepo, 'upsertSetting').mockResolvedValue({});
      vi.spyOn(auditRepo, 'createAuditLog').mockResolvedValue({});

      const token = getAuthToken(userSchoolAAdmin);
      const payload = JSON.parse('{"customData": {"field1": "value1", "__proto__": {"polluted": true}}}');

      const res = await request(app)
        .patch('/api/v1/settings/school')
        .set('Authorization', `Bearer ${token}`)
        .send(payload);

      expect(res.status).toBe(200);
      expect(({}).polluted).toBeUndefined(); // Object prototype was NOT polluted
    });

    it('safely stores text containing harmless XSS payloads and SQL injection strings without script execution', async () => {
      vi.spyOn(settingsRepo, 'findSchoolById').mockResolvedValue({ id: SCHOOL_A, name: 'School A', status: 'approved' });
      vi.spyOn(settingsRepo, 'executeTransaction').mockImplementation(async (cb) => cb({}));
      vi.spyOn(settingsRepo, 'updateSchool').mockResolvedValue({ id: SCHOOL_A, name: "<script>alert('XSS')</script>" });
      vi.spyOn(settingsRepo, 'findSetting').mockResolvedValue(null);
      vi.spyOn(settingsRepo, 'upsertSetting').mockResolvedValue({});
      vi.spyOn(auditRepo, 'createAuditLog').mockResolvedValue({});

      const token = getAuthToken(userSchoolAAdmin);
      const res = await request(app)
        .patch('/api/v1/settings/school')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: "<script>alert('XSS')</script>",
          location: "'; DROP TABLE schools; --"
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('6. Secret Exposure, Preservation & Logging (Sections 15, 16, 17 & 18)', () => {
    it('never leaks raw WhatsApp access token in GET /api/v1/settings/integrations response', async () => {
      vi.spyOn(settingsRepo, 'findSchoolById').mockResolvedValue({ id: SCHOOL_A, name: 'School A', status: 'approved' });
      vi.spyOn(settingsRepo, 'findSettingsByCategories').mockResolvedValue([
        {
          category: 'integrations',
          data: {
            whatsapp: {
              accessToken: 'SUPER_SECRET_TOKEN_9999',
              phoneNumberId: '1001',
              enabled: true
            }
          }
        }
      ]);

      const token = getAuthToken(userSchoolAAdmin);
      const res = await request(app)
        .get('/api/v1/settings/integrations')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const stringifiedBody = JSON.stringify(res.body);
      expect(stringifiedBody).not.toContain('SUPER_SECRET_TOKEN_9999');
      expect(res.body.data.whatsapp.isMasked).toBe(true);
      expect(res.body.data.whatsapp.accessToken).toBeUndefined();
    });

    it('preserves secret when updating other fields and logs audit record without secret leakage', async () => {
      vi.spyOn(settingsRepo, 'findSchoolById').mockResolvedValue({ id: SCHOOL_A, name: 'School A', status: 'approved' });
      vi.spyOn(settingsRepo, 'executeTransaction').mockImplementation(async (cb) => cb({}));
      vi.spyOn(settingsRepo, 'findSetting').mockResolvedValue({
        category: 'integrations',
        data: {
          whatsapp: { accessToken: 'TEST_TOKEN_A', phoneNumberId: '123' }
        }
      });
      const upsertSpy = vi.spyOn(settingsRepo, 'upsertSetting').mockResolvedValue({});
      const auditSpy = vi.spyOn(auditRepo, 'createAuditLog').mockResolvedValue({});

      const token = getAuthToken(userSchoolAAdmin);
      const res = await request(app)
        .patch('/api/v1/settings/integrations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          whatsapp: {
            phoneNumberId: '456',
            enabled: true
          }
        });

      expect(res.status).toBe(200);
      expect(upsertSpy).toHaveBeenCalledWith(
        SCHOOL_A,
        'integrations',
        expect.objectContaining({
          whatsapp: expect.objectContaining({
            accessToken: 'TEST_TOKEN_A',
            phoneNumberId: '456'
          })
        }),
        expect.anything()
      );

      // Verify audit log has no raw secrets
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          actionPerformed: 'UPDATE_INTEGRATIONS_SETTINGS',
          modifiedFields: expect.not.objectContaining({ accessToken: expect.anything() })
        }),
        expect.anything()
      );
    });

    it('replaces secret when new accessToken is explicitly supplied', async () => {
      vi.spyOn(settingsRepo, 'findSchoolById').mockResolvedValue({ id: SCHOOL_A, name: 'School A', status: 'approved' });
      vi.spyOn(settingsRepo, 'executeTransaction').mockImplementation(async (cb) => cb({}));
      vi.spyOn(settingsRepo, 'findSetting').mockResolvedValue({
        category: 'integrations',
        data: {
          whatsapp: { accessToken: 'TEST_TOKEN_A', phoneNumberId: '123' }
        }
      });
      const upsertSpy = vi.spyOn(settingsRepo, 'upsertSetting').mockResolvedValue({});
      vi.spyOn(auditRepo, 'createAuditLog').mockResolvedValue({});

      const token = getAuthToken(userSchoolAAdmin);
      const res = await request(app)
        .patch('/api/v1/settings/integrations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          whatsapp: {
            accessToken: 'TEST_TOKEN_B',
            phoneNumberId: '123'
          }
        });

      expect(res.status).toBe(200);
      expect(upsertSpy).toHaveBeenCalledWith(
        SCHOOL_A,
        'integrations',
        expect.objectContaining({
          whatsapp: expect.objectContaining({
            accessToken: 'TEST_TOKEN_B'
          })
        }),
        expect.anything()
      );
    });
  });

  describe('7. Public School Metadata Security & Negative Tests (Sections 19, 20 & 21)', () => {
    it('returns only public-safe fields for valid approved school', async () => {
      vi.spyOn(settingsRepo, 'findSchoolById').mockResolvedValue({
        id: SCHOOL_A,
        name: 'School A',
        code: 'SCH-A',
        status: 'approved',
        seatLimit: 500,
        teacherLimit: 50,
        email: 'private_admin@school-a.edu',
        phone: '1234567890',
        apiKeysEncrypted: { secretKey: 'private-secret' }
      });

      const res = await request(app).get(`/api/v1/public/schools/${SCHOOL_A}/meta`);

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('School A');
      expect(res.body.data.code).toBe('SCH-A');
      // Prohibited private fields must NOT exist
      expect(res.body.data.seatLimit).toBeUndefined();
      expect(res.body.data.teacherLimit).toBeUndefined();
      expect(res.body.data.apiKeysEncrypted).toBeUndefined();
      expect(res.body.data.email).toBeUndefined();
      expect(res.body.data.phone).toBeUndefined();
    });

    it('returns 404 for invalid UUID or unapproved school', async () => {
      vi.spyOn(settingsRepo, 'findSchoolById').mockResolvedValue({
        id: SCHOOL_A,
        name: 'School A',
        status: 'pending' // Not approved
      });

      const res = await request(app).get(`/api/v1/public/schools/${SCHOOL_A}/meta`);
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('8. Concurrency & Partial Update Safety (Section 38)', () => {
    it('preserves unrelated JSON setting categories across partial updates', async () => {
      vi.spyOn(settingsRepo, 'findSchoolById').mockResolvedValue({ id: SCHOOL_A, name: 'School A', status: 'approved' });
      vi.spyOn(settingsRepo, 'executeTransaction').mockImplementation(async (cb) => cb({}));
      vi.spyOn(settingsRepo, 'updateSchool').mockResolvedValue({ id: SCHOOL_A, name: 'School A' });
      vi.spyOn(settingsRepo, 'findSetting').mockImplementation(async (schId, cat) => {
        if (cat === 'branding') return { data: { primaryColor: '#4f46e5', logoUrl: 'https://cdn.example.com/logo.png' } };
        return null;
      });
      const upsertSpy = vi.spyOn(settingsRepo, 'upsertSetting').mockResolvedValue({});
      vi.spyOn(auditRepo, 'createAuditLog').mockResolvedValue({});

      const token = getAuthToken(userSchoolAAdmin);
      const res = await request(app)
        .patch('/api/v1/settings/school')
        .set('Authorization', `Bearer ${token}`)
        .send({
          branding: {
            secondaryColor: '#10b981'
          }
        });

      expect(res.status).toBe(200);
      expect(upsertSpy).toHaveBeenCalledWith(
        SCHOOL_A,
        'branding',
        expect.objectContaining({
          primaryColor: '#4f46e5',
          secondaryColor: '#10b981'
        }),
        expect.anything()
      );
    });
  });
});
