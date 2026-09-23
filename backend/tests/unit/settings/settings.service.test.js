import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as settingsService from '../../../src/modules/settings/settings.service.js';
import * as settingsRepo from '../../../src/modules/settings/settings.repository.js';
import * as auditRepo from '../../../src/modules/audit/audit.repository.js';
import { NotFoundError, ValidationError } from '../../../src/utils/app-error.js';

describe('School Settings Service Unit Tests (Phase SETTINGS.2)', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';

  const mockSchool = {
    id: SCHOOL_ID,
    name: 'Greenwood High',
    code: 'GW-01',
    phone: '+91 9876543210',
    email: 'info@greenwood.edu',
    address: '123 Main Road',
    timezone: 'Asia/Kolkata',
    logoUrl: 'https://cdn.example.com/school-logo.png',
    status: 'approved',
    apiKeysEncrypted: {
      googleMaps: 'AIzaMaps123',
      cloudinary: { cloudName: 'gw-cloud', uploadPreset: 'gw-preset' }
    }
  };

  const mockSettings = [
    {
      category: 'general',
      data: { website: 'https://greenwood.edu' }
    },
    {
      category: 'branding',
      data: {
        logoUrl: 'https://cdn.example.com/school-logo.png',
        faviconUrl: 'https://cdn.example.com/favicon.ico',
        primaryColor: '#4f46e5',
        secondaryColor: '#06b6d4'
      }
    },
    {
      category: 'academicConfig',
      data: {
        currentYear: '2026-2027',
        termType: 'Semester'
      }
    },
    {
      category: 'customData',
      data: {
        affiliation: 'CBSE'
      }
    }
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. getSchoolSettings', () => {
    it('composes complete school settings DTO from School and SchoolSetting records', async () => {
      vi.spyOn(settingsRepo, 'findSchoolById').mockResolvedValue(mockSchool);
      vi.spyOn(settingsRepo, 'findSettingsByCategories').mockResolvedValue(mockSettings);

      const result = await settingsService.getSchoolSettings(SCHOOL_ID);

      expect(result).toBeDefined();
      expect(result.id).toBe(SCHOOL_ID);
      expect(result.name).toBe('Greenwood High');
      expect(result.phone).toBe('+91 9876543210');
      expect(result.contactPhone).toBe('+91 9876543210');
      expect(result.location).toBe('123 Main Road');
      expect(result.website).toBe('https://greenwood.edu');
      expect(result.branding.logoUrl).toBe('https://cdn.example.com/school-logo.png');
      expect(result.academicConfig.currentYear).toBe('2026-2027');
      expect(result.customData.affiliation).toBe('CBSE');
    });

    it('throws NotFoundError when school does not exist', async () => {
      vi.spyOn(settingsRepo, 'findSchoolById').mockResolvedValue(null);

      await expect(settingsService.getSchoolSettings(SCHOOL_ID)).rejects.toThrow(NotFoundError);
    });

    it('throws ValidationError when schoolId is missing', async () => {
      await expect(settingsService.getSchoolSettings(null)).rejects.toThrow(ValidationError);
    });
  });

  describe('2. updateSchoolSettings', () => {
    it('updates School model and SchoolSetting categories in a transaction and records audit log', async () => {
      vi.spyOn(settingsRepo, 'findSchoolById').mockResolvedValue(mockSchool);
      vi.spyOn(settingsRepo, 'executeTransaction').mockImplementation(async (cb) => cb({}));
      vi.spyOn(settingsRepo, 'updateSchool').mockResolvedValue({ ...mockSchool, name: 'New Name' });
      vi.spyOn(settingsRepo, 'findSetting').mockResolvedValue(null);
      vi.spyOn(settingsRepo, 'upsertSetting').mockResolvedValue({});
      vi.spyOn(auditRepo, 'createAuditLog').mockResolvedValue({});
      vi.spyOn(settingsRepo, 'findSettingsByCategories').mockResolvedValue(mockSettings);

      const payload = {
        name: 'New Name',
        website: 'https://newsite.edu',
        branding: { logoUrl: 'https://cdn.example.com/new-logo.png' }
      };

      const result = await settingsService.updateSchoolSettings(SCHOOL_ID, payload, { email: 'admin@school.edu' });

      expect(result).toBeDefined();
      expect(settingsRepo.updateSchool).toHaveBeenCalled();
      expect(auditRepo.createAuditLog).toHaveBeenCalled();
    });
  });

  describe('3. getIntegrationsSettings', () => {
    it('returns integrations with masked WhatsApp access token and safe credentials', async () => {
      vi.spyOn(settingsRepo, 'findSchoolById').mockResolvedValue(mockSchool);
      vi.spyOn(settingsRepo, 'findSettingsByCategories').mockResolvedValue([
        {
          category: 'integrations',
          data: {
            whatsapp: {
              provider: 'meta_whatsapp_cloud_api',
              accessToken: 'SECRET_ACCESS_TOKEN_123',
              phoneNumberId: '123456',
              enabled: true,
              isConnected: true
            }
          }
        },
        {
          category: 'apiKeys',
          data: {
            googleMaps: 'AIzaMaps123',
            cloudinary: { cloudName: 'gw-cloud', uploadPreset: 'gw-preset' }
          }
        }
      ]);

      const result = await settingsService.getIntegrationsSettings(SCHOOL_ID);

      expect(result.apiKeys.googleMaps).toBe('AIzaMaps123');
      expect(result.apiKeys.cloudinary.cloudName).toBe('gw-cloud');
      expect(result.whatsapp.phoneNumberId).toBe('123456');
      expect(result.whatsapp.isMasked).toBe(true);
      // Raw access token MUST NOT be exposed
      expect(result.whatsapp.accessToken).toBeUndefined();
    });
  });

  describe('4. updateIntegrationsSettings', () => {
    it('preserves existing access token when payload contains mask placeholder', async () => {
      vi.spyOn(settingsRepo, 'findSchoolById').mockResolvedValue(mockSchool);
      vi.spyOn(settingsRepo, 'executeTransaction').mockImplementation(async (cb) => cb({}));
      vi.spyOn(settingsRepo, 'findSetting').mockResolvedValue({
        category: 'integrations',
        data: {
          whatsapp: {
            accessToken: 'EXISTING_SECRET_TOKEN',
            phoneNumberId: '123456'
          }
        }
      });
      const upsertSpy = vi.spyOn(settingsRepo, 'upsertSetting').mockResolvedValue({});
      vi.spyOn(auditRepo, 'createAuditLog').mockResolvedValue({});
      vi.spyOn(settingsRepo, 'findSettingsByCategories').mockResolvedValue([]);

      const payload = {
        whatsapp: {
          accessToken: '••••••••', // Masked placeholder
          phoneNumberId: '999999'
        }
      };

      await settingsService.updateIntegrationsSettings(SCHOOL_ID, payload, { email: 'admin@school.edu' });

      expect(upsertSpy).toHaveBeenCalledWith(
        SCHOOL_ID,
        'integrations',
        expect.objectContaining({
          whatsapp: expect.objectContaining({
            accessToken: 'EXISTING_SECRET_TOKEN', // Preserved!
            phoneNumberId: '999999'
          })
        }),
        expect.anything()
      );
    });

    it('updates access token when unmasked new token is provided', async () => {
      vi.spyOn(settingsRepo, 'findSchoolById').mockResolvedValue(mockSchool);
      vi.spyOn(settingsRepo, 'executeTransaction').mockImplementation(async (cb) => cb({}));
      vi.spyOn(settingsRepo, 'findSetting').mockResolvedValue({
        category: 'integrations',
        data: {
          whatsapp: {
            accessToken: 'OLD_TOKEN'
          }
        }
      });
      const upsertSpy = vi.spyOn(settingsRepo, 'upsertSetting').mockResolvedValue({});
      vi.spyOn(auditRepo, 'createAuditLog').mockResolvedValue({});
      vi.spyOn(settingsRepo, 'findSettingsByCategories').mockResolvedValue([]);

      const payload = {
        whatsapp: {
          accessToken: 'NEW_UNMASKED_TOKEN_123',
          phoneNumberId: '123456'
        }
      };

      await settingsService.updateIntegrationsSettings(SCHOOL_ID, payload, { email: 'admin@school.edu' });

      expect(upsertSpy).toHaveBeenCalledWith(
        SCHOOL_ID,
        'integrations',
        expect.objectContaining({
          whatsapp: expect.objectContaining({
            accessToken: 'NEW_UNMASKED_TOKEN_123'
          })
        }),
        expect.anything()
      );
    });
  });

  describe('5. getSidebarSettings & updateSidebarSettings', () => {
    it('retrieves and updates sidebar navigation ordering', async () => {
      vi.spyOn(settingsRepo, 'findSetting').mockResolvedValue({
        category: 'sidebar',
        data: { order: ['classes', 'students', 'staff'] }
      });
      vi.spyOn(settingsRepo, 'executeTransaction').mockImplementation(async (cb) => cb({}));
      vi.spyOn(settingsRepo, 'upsertSetting').mockResolvedValue({});
      vi.spyOn(auditRepo, 'createAuditLog').mockResolvedValue({});

      const getRes = await settingsService.getSidebarSettings(SCHOOL_ID);
      expect(getRes.order).toEqual(['classes', 'students', 'staff']);

      const updateRes = await settingsService.updateSidebarSettings(SCHOOL_ID, ['students', 'classes'], { email: 'admin@school.edu' });
      expect(updateRes.order).toEqual(['students', 'classes']);
      expect(settingsRepo.upsertSetting).toHaveBeenCalledWith(
        SCHOOL_ID,
        'sidebar',
        { order: ['students', 'classes'] },
        expect.anything()
      );
    });
  });

  describe('6. getPublicSchoolMeta', () => {
    it('returns only public-safe fields for approved school', async () => {
      vi.spyOn(settingsRepo, 'findSchoolById').mockResolvedValue(mockSchool);

      const result = await settingsService.getPublicSchoolMeta(SCHOOL_ID);

      expect(result).toEqual({
        id: SCHOOL_ID,
        name: 'Greenwood High',
        code: 'GW-01',
        logoUrl: 'https://cdn.example.com/school-logo.png'
      });
      // Ensure private/sensitive fields are not leaked
      expect(result.apiKeysEncrypted).toBeUndefined();
      expect(result.seatLimit).toBeUndefined();
      expect(result.teacherLimit).toBeUndefined();
    });

    it('throws NotFoundError for non-existent or unapproved school', async () => {
      vi.spyOn(settingsRepo, 'findSchoolById').mockResolvedValue({ ...mockSchool, status: 'pending' });

      await expect(settingsService.getPublicSchoolMeta(SCHOOL_ID)).rejects.toThrow(NotFoundError);
    });
  });
});
