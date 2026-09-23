import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import * as authRepository from '../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../src/modules/auth/token.service.js';
import * as platformBrandingRepo from '../../src/modules/platform-branding/platform-branding.repository.js';
import { SYSTEM_ROLES } from '../../src/config/constants.js';

describe('Security: Platform Branding Authentication, RBAC & Parameter Defense', () => {
  const app = createApp();

  const userSuperAdmin = {
    id: 'user-super-admin',
    schoolId: null,
    email: 'superadmin@platform.edu',
    systemRole: SYSTEM_ROLES.SUPER_ADMIN,
    tokenVersion: 1,
    isActive: true
  };

  const userSchoolAdmin = {
    id: 'user-school-admin',
    schoolId: '11111111-1111-4111-8111-111111111111',
    email: 'admin@school-a.edu',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: '11111111-1111-4111-8111-111111111111', name: 'School A', code: 'SCH-A', status: 'approved' }
  };

  const userTeacher = {
    id: 'user-teacher',
    schoolId: '11111111-1111-4111-8111-111111111111',
    email: 'teacher@school-a.edu',
    systemRole: SYSTEM_ROLES.TEACHER,
    tokenVersion: 1,
    isActive: true,
    school: { id: '11111111-1111-4111-8111-111111111111', name: 'School A', code: 'SCH-A', status: 'approved' }
  };

  const generateToken = (user) => {
    return tokenService.issueAccessToken({
      sub: user.id,
      schoolId: user.schoolId,
      systemRole: user.systemRole,
      tokenVersion: user.tokenVersion
    });
  };

  let inMemorySetting = null;

  beforeEach(() => {
    vi.restoreAllMocks();
    inMemorySetting = null;

    vi.spyOn(authRepository, 'findUserById').mockImplementation(async (id) => {
      if (id === userSuperAdmin.id) return userSuperAdmin;
      if (id === userSchoolAdmin.id) return userSchoolAdmin;
      if (id === userTeacher.id) return userTeacher;
      return null;
    });

    vi.spyOn(authRepository, 'findSchoolById').mockImplementation(async (id) => {
      if (id === '11111111-1111-4111-8111-111111111111') return userSchoolAdmin.school;
      return null;
    });

    vi.spyOn(platformBrandingRepo, 'getPlatformSettingByKey').mockImplementation(async () => {
      return inMemorySetting;
    });

    vi.spyOn(platformBrandingRepo, 'upsertPlatformSetting').mockImplementation(async (key, data) => {
      inMemorySetting = {
        id: 'setting-uuid-1',
        key,
        data,
        updatedAt: new Date()
      };
      return inMemorySetting;
    });

    vi.spyOn(platformBrandingRepo, 'deletePlatformSettingByKey').mockImplementation(async () => {
      inMemorySetting = null;
      return { count: 1 };
    });
  });

  describe('Unauthenticated Public Read', () => {
    it('allows public unauthenticated GET without any Authorization header', async () => {
      const res = await request(app).get('/api/v1/platform/branding');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.platformName).toBe('School');
      expect(res.body.data.primaryColor).toBe('#7b40a3');
    });
  });

  describe('Authentication Enforcement on Mutations', () => {
    it('rejects unauthenticated PATCH /api/v1/platform/branding with 401', async () => {
      const res = await request(app)
        .patch('/api/v1/platform/branding')
        .send({ platformName: 'Hacked Name' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('rejects unauthenticated POST /api/v1/platform/branding/reset with 401', async () => {
      const res = await request(app)
        .post('/api/v1/platform/branding/reset')
        .send({});

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('RBAC Authorization Boundaries', () => {
    it('rejects School Admin PATCH /api/v1/platform/branding with 403 Forbidden', async () => {
      const token = generateToken(userSchoolAdmin);

      const res = await request(app)
        .patch('/api/v1/platform/branding')
        .set('Authorization', `Bearer ${token}`)
        .send({ platformName: 'Tenant Overwrite' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('rejects Teacher PATCH /api/v1/platform/branding with 403 Forbidden', async () => {
      const token = generateToken(userTeacher);

      const res = await request(app)
        .patch('/api/v1/platform/branding')
        .set('Authorization', `Bearer ${token}`)
        .send({ platformName: 'Teacher Overwrite' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('rejects School Admin POST /api/v1/platform/branding/reset with 403 Forbidden', async () => {
      const token = generateToken(userSchoolAdmin);

      const res = await request(app)
        .post('/api/v1/platform/branding/reset')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('allows SuperAdmin to PATCH /api/v1/platform/branding', async () => {
      const token = generateToken(userSuperAdmin);

      const res = await request(app)
        .patch('/api/v1/platform/branding')
        .set('Authorization', `Bearer ${token}`)
        .send({ platformName: 'Global Platform Portal', primaryColor: '#2563eb' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.platformName).toBe('Global Platform Portal');
      expect(res.body.data.primaryColor).toBe('#2563eb');
    });

    it('allows SuperAdmin to POST /api/v1/platform/branding/reset', async () => {
      const token = generateToken(userSuperAdmin);

      const res = await request(app)
        .post('/api/v1/platform/branding/reset')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.platformName).toBe('School');
      expect(res.body.data.primaryColor).toBe('#7b40a3');
    });
  });

  describe('Input Validation & Speculative Defense', () => {
    it('rejects arbitrary injected fields with 400 Bad Request', async () => {
      const token = generateToken(userSuperAdmin);

      const res = await request(app)
        .patch('/api/v1/platform/branding')
        .set('Authorization', `Bearer ${token}`)
        .send({
          platformName: 'Legitimate Name',
          injectedSpeculativeField: 'injection_attempt'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});
