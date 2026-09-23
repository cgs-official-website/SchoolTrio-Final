import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import * as authRepository from '../../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../../src/modules/auth/token.service.js';
import * as settingsRepo from '../../../src/modules/settings/settings.repository.js';
import * as auditRepo from '../../../src/modules/audit/audit.repository.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';

describe('Settings & Environment Configuration Integration Tests (Phase SETTINGS.2)', () => {
  const app = createApp();

  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';

  const mockAdminUser = {
    id: 'user-admin-1',
    schoolId: SCHOOL_ID,
    email: 'admin@greenwood.edu',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_ID, name: 'Greenwood High', code: 'GW-01', status: 'approved' }
  };

  const getAuthToken = (user = mockAdminUser) => {
    return tokenService.issueAccessToken({
      sub: user.id,
      schoolId: user.schoolId,
      systemRole: user.systemRole,
      tokenVersion: user.tokenVersion
    });
  };

  const mockSchool = {
    id: SCHOOL_ID,
    name: 'Greenwood High',
    code: 'GW-01',
    phone: '+91 9876543210',
    email: 'info@greenwood.edu',
    address: '123 Main Road',
    timezone: 'Asia/Kolkata',
    logoUrl: 'https://cdn.example.com/logo.png',
    status: 'approved'
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
  });

  describe('1. GET /api/v1/settings/school', () => {
    it('returns composite school settings for authenticated tenant user', async () => {
      vi.spyOn(settingsRepo, 'findSchoolById').mockResolvedValue(mockSchool);
      vi.spyOn(settingsRepo, 'findSettingsByCategories').mockResolvedValue([
        { category: 'general', data: { website: 'https://greenwood.edu' } },
        { category: 'branding', data: { primaryColor: '#4f46e5' } },
        { category: 'academicConfig', data: { currentYear: '2026-2027', termType: 'Semester' } },
        { category: 'customData', data: { customId: 'ABC' } }
      ]);

      const token = getAuthToken();
      const res = await request(app)
        .get('/api/v1/settings/school')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Greenwood High');
      expect(res.body.data.website).toBe('https://greenwood.edu');
      expect(res.body.data.academicConfig.currentYear).toBe('2026-2027');
    });
  });

  describe('2. PATCH /api/v1/settings/school', () => {
    it('updates school settings successfully and returns updated DTO', async () => {
      vi.spyOn(settingsRepo, 'findSchoolById').mockResolvedValue(mockSchool);
      vi.spyOn(settingsRepo, 'executeTransaction').mockImplementation(async (cb) => cb({}));
      vi.spyOn(settingsRepo, 'updateSchool').mockResolvedValue({ ...mockSchool, name: 'Greenwood High Updated' });
      vi.spyOn(settingsRepo, 'findSetting').mockResolvedValue(null);
      vi.spyOn(settingsRepo, 'upsertSetting').mockResolvedValue({});
      vi.spyOn(auditRepo, 'createAuditLog').mockResolvedValue({});
      vi.spyOn(settingsRepo, 'findSettingsByCategories').mockResolvedValue([
        { category: 'general', data: { website: 'https://newsite.edu' } }
      ]);

      const token = getAuthToken();
      const res = await request(app)
        .patch('/api/v1/settings/school')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Greenwood High Updated',
          website: 'https://newsite.edu'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Greenwood High');
      expect(res.body.data.website).toBe('https://newsite.edu');
    });
  });

  describe('3. GET & PATCH /api/v1/settings/integrations', () => {
    it('fetches integrations with masked WhatsApp access token', async () => {
      vi.spyOn(settingsRepo, 'findSchoolById').mockResolvedValue(mockSchool);
      vi.spyOn(settingsRepo, 'findSettingsByCategories').mockResolvedValue([
        {
          category: 'integrations',
          data: {
            whatsapp: {
              accessToken: 'SUPER_SECRET_TOKEN',
              phoneNumberId: '123456',
              enabled: true
            }
          }
        },
        {
          category: 'apiKeys',
          data: {
            cloudinary: { cloudName: 'cloud-x', uploadPreset: 'preset-y' }
          }
        }
      ]);

      const token = getAuthToken();
      const res = await request(app)
        .get('/api/v1/settings/integrations')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.whatsapp.isMasked).toBe(true);
      expect(res.body.data.whatsapp.accessToken).toBeUndefined();
      expect(res.body.data.apiKeys.cloudinary.cloudName).toBe('cloud-x');
    });

    it('updates integrations preserving existing token when mask placeholder is submitted', async () => {
      vi.spyOn(settingsRepo, 'findSchoolById').mockResolvedValue(mockSchool);
      vi.spyOn(settingsRepo, 'executeTransaction').mockImplementation(async (cb) => cb({}));
      vi.spyOn(settingsRepo, 'findSetting').mockResolvedValue({
        category: 'integrations',
        data: {
          whatsapp: { accessToken: 'ORIGINAL_SECRET_KEY', phoneNumberId: '123' }
        }
      });
      const upsertSpy = vi.spyOn(settingsRepo, 'upsertSetting').mockResolvedValue({});
      vi.spyOn(auditRepo, 'createAuditLog').mockResolvedValue({});
      vi.spyOn(settingsRepo, 'findSettingsByCategories').mockResolvedValue([]);

      const token = getAuthToken();
      const res = await request(app)
        .patch('/api/v1/settings/integrations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          whatsapp: {
            accessToken: '••••••••',
            phoneNumberId: '456'
          }
        });

      expect(res.status).toBe(200);
      expect(upsertSpy).toHaveBeenCalledWith(
        SCHOOL_ID,
        'integrations',
        expect.objectContaining({
          whatsapp: expect.objectContaining({
            accessToken: 'ORIGINAL_SECRET_KEY',
            phoneNumberId: '456'
          })
        }),
        expect.anything()
      );
    });
  });

  describe('4. GET & PUT /api/v1/settings/sidebar', () => {
    it('retrieves and updates sidebar navigation order', async () => {
      vi.spyOn(settingsRepo, 'findSetting').mockResolvedValue({
        category: 'sidebar',
        data: { order: ['classes', 'students'] }
      });
      vi.spyOn(settingsRepo, 'executeTransaction').mockImplementation(async (cb) => cb({}));
      vi.spyOn(settingsRepo, 'upsertSetting').mockResolvedValue({});
      vi.spyOn(auditRepo, 'createAuditLog').mockResolvedValue({});

      const token = getAuthToken();
      const getRes = await request(app)
        .get('/api/v1/settings/sidebar')
        .set('Authorization', `Bearer ${token}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.order).toEqual(['classes', 'students']);

      const putRes = await request(app)
        .put('/api/v1/settings/sidebar')
        .set('Authorization', `Bearer ${token}`)
        .send({
          order: ['students', 'classes', 'attendance']
        });

      expect(putRes.status).toBe(200);
      expect(putRes.body.data.order).toEqual(['students', 'classes', 'attendance']);
    });
  });

  describe('5. GET /api/v1/public/schools/:schoolId/meta', () => {
    it('returns public metadata for valid school without authentication', async () => {
      vi.spyOn(settingsRepo, 'findSchoolById').mockResolvedValue(mockSchool);

      const res = await request(app).get(`/api/v1/public/schools/${SCHOOL_ID}/meta`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual({
        id: SCHOOL_ID,
        name: 'Greenwood High',
        code: 'GW-01',
        logoUrl: 'https://cdn.example.com/logo.png'
      });
    });

    it('returns 404 for non-existent school', async () => {
      vi.spyOn(settingsRepo, 'findSchoolById').mockResolvedValue(null);

      const res = await request(app).get(`/api/v1/public/schools/${SCHOOL_ID}/meta`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });
});
