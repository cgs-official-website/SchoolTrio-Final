import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import * as authRepository from '../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../src/modules/auth/token.service.js';
import * as platformBrandingRepo from '../../src/modules/platform-branding/platform-branding.repository.js';
import { SYSTEM_ROLES } from '../../src/config/constants.js';

describe('Integration: Platform Branding REST Routes (/api/v1/platform/branding)', () => {
  const app = createApp();

  const userSuperAdmin = {
    id: 'user-super-admin-int',
    schoolId: null,
    email: 'superadmin@platform.edu',
    systemRole: SYSTEM_ROLES.SUPER_ADMIN,
    tokenVersion: 1,
    isActive: true
  };

  const getSuperAdminToken = () => {
    return tokenService.issueAccessToken({
      sub: userSuperAdmin.id,
      schoolId: userSuperAdmin.schoolId,
      systemRole: userSuperAdmin.systemRole,
      tokenVersion: userSuperAdmin.tokenVersion
    });
  };

  let inMemorySetting = null;

  beforeEach(() => {
    vi.restoreAllMocks();
    inMemorySetting = null;

    vi.spyOn(authRepository, 'findUserById').mockImplementation(async (id) => {
      if (id === userSuperAdmin.id) return userSuperAdmin;
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
        updatedAt: new Date('2026-09-19T14:30:00.000Z')
      };
      return inMemorySetting;
    });

    vi.spyOn(platformBrandingRepo, 'deletePlatformSettingByKey').mockImplementation(async () => {
      inMemorySetting = null;
      return { count: 1 };
    });
  });

  it('verifies end-to-end lifecycle: default GET -> SuperAdmin PATCH -> updated GET -> reset POST -> default GET', async () => {
    // 1. Initial public GET returns platform defaults
    const getRes1 = await request(app).get('/api/v1/platform/branding');
    expect(getRes1.status).toBe(200);
    expect(getRes1.body.success).toBe(true);
    expect(getRes1.body.data).toEqual({
      platformName: 'School',
      primaryColor: '#7b40a3',
      logoUrl: '/logo.png',
      faviconUrl: '/logo.png',
      loginBackgroundImage:
        'https://images.unsplash.com/photo-1577896851231-70ef18881754?q=80&w=2070',
      updatedAt: null
    });

    // 2. SuperAdmin PATCH updates platform branding
    const token = getSuperAdminToken();
    const updatePayload = {
      platformName: 'Horizon Multi-Academy Platform',
      primaryColor: '#3b82f6',
      logoUrl: 'https://cdn.horizon.edu/logo.png',
      faviconUrl: 'https://cdn.horizon.edu/favicon.ico',
      loginBackgroundImage: 'https://cdn.horizon.edu/background.png'
    };

    const patchRes = await request(app)
      .patch('/api/v1/platform/branding')
      .set('Authorization', `Bearer ${token}`)
      .send(updatePayload);

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.success).toBe(true);
    expect(patchRes.body.data.platformName).toBe('Horizon Multi-Academy Platform');
    expect(patchRes.body.data.primaryColor).toBe('#3b82f6');
    expect(patchRes.body.data.updatedAt).toBe('2026-09-19T14:30:00.000Z');

    // 3. Public GET now returns updated branding
    const getRes2 = await request(app).get('/api/v1/platform/branding');
    expect(getRes2.status).toBe(200);
    expect(getRes2.body.data.platformName).toBe('Horizon Multi-Academy Platform');
    expect(getRes2.body.data.primaryColor).toBe('#3b82f6');

    // 4. SuperAdmin POST /reset resets to defaults
    const resetRes = await request(app)
      .post('/api/v1/platform/branding/reset')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(resetRes.status).toBe(200);
    expect(resetRes.body.success).toBe(true);
    expect(resetRes.body.data.platformName).toBe('School');
    expect(resetRes.body.data.primaryColor).toBe('#7b40a3');
    expect(resetRes.body.data.updatedAt).toBeNull();

    // 5. Final public GET returns platform defaults again
    const getRes3 = await request(app).get('/api/v1/platform/branding');
    expect(getRes3.status).toBe(200);
    expect(getRes3.body.data.platformName).toBe('School');
    expect(getRes3.body.data.primaryColor).toBe('#7b40a3');
  });
});
