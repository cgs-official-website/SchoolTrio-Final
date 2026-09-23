import { describe, it, expect } from 'vitest';
import * as schemas from '../../../src/modules/settings/settings.schemas.js';

describe('School Settings & Environment Configuration Schemas Unit Tests (Phase SETTINGS.2)', () => {
  const validUuid = '11111111-1111-4111-8111-111111111111';

  describe('1. updateSchoolSettingsSchema', () => {
    it('validates a valid complete school settings update payload', () => {
      const payload = {
        name: 'Greenwood High International',
        phone: '+91 9876543210',
        contactPhone: '+91 9876543210',
        email: 'principal@greenwood.edu',
        address: '123 Academic Way, Knowledge City',
        location: '123 Academic Way, Knowledge City',
        website: 'https://www.greenwood.edu',
        timezone: 'Asia/Kolkata',
        branding: {
          logoUrl: 'https://res.cloudinary.com/demo/image/upload/v1/logo.png',
          faviconUrl: 'https://res.cloudinary.com/demo/image/upload/v1/favicon.ico',
          primaryColor: '#4f46e5',
          secondaryColor: '#06b6d4'
        },
        academicConfig: {
          currentYear: '2026-2027',
          termType: 'Semester'
        },
        customData: {
          customAffiliationNo: 'CBSE-998877',
          enableBiometricAttendance: true
        }
      };

      const parsed = schemas.updateSchoolSettingsSchema.body.safeParse(payload);
      expect(parsed.success).toBe(true);
    });

    it('accepts partial update payload', () => {
      const payload = {
        name: 'Updated School Name Only'
      };

      const parsed = schemas.updateSchoolSettingsSchema.body.safeParse(payload);
      expect(parsed.success).toBe(true);
    });

    it('rejects unknown root properties due to strict schema', () => {
      const payload = {
        name: 'Valid Name',
        injectedTenantId: 'rogue-tenant',
        seatLimit: 99999
      };

      const parsed = schemas.updateSchoolSettingsSchema.body.safeParse(payload);
      expect(parsed.success).toBe(false);
    });

    it('rejects invalid email address', () => {
      const payload = {
        email: 'not-an-email'
      };

      const parsed = schemas.updateSchoolSettingsSchema.body.safeParse(payload);
      expect(parsed.success).toBe(false);
    });

    it('rejects invalid website URL if not empty', () => {
      const payload = {
        website: 'invalid-url-string'
      };

      const parsed = schemas.updateSchoolSettingsSchema.body.safeParse(payload);
      expect(parsed.success).toBe(false);
    });

    it('allows empty string website URL to clear website', () => {
      const payload = {
        website: ''
      };

      const parsed = schemas.updateSchoolSettingsSchema.body.safeParse(payload);
      expect(parsed.success).toBe(true);
    });
  });

  describe('2. updateIntegrationsSchema', () => {
    it('validates a complete integrations update payload', () => {
      const payload = {
        apiKeys: {
          googleMaps: 'AIzaSyDemoGoogleMapsKey12345',
          cloudinary: {
            cloudName: 'sms-tenant-cloud',
            uploadPreset: 'sms_preset_unsigned'
          }
        },
        whatsapp: {
          provider: 'meta_whatsapp_cloud_api',
          accessToken: 'EAAG1234567890MetaToken',
          phoneNumberId: '109876543210',
          businessAccountId: '209876543210',
          senderNumber: '+919876543210',
          ptmTemplateName: 'custom_ptm_template',
          noticeTemplateName: 'custom_notice_template',
          enabled: true,
          isConnected: true
        }
      };

      const parsed = schemas.updateIntegrationsSchema.body.safeParse(payload);
      expect(parsed.success).toBe(true);
    });

    it('accepts partial integrations update', () => {
      const payload = {
        apiKeys: {
          cloudinary: {
            cloudName: 'cloud-only',
            uploadPreset: 'preset-only'
          }
        }
      };

      const parsed = schemas.updateIntegrationsSchema.body.safeParse(payload);
      expect(parsed.success).toBe(true);
    });

    it('rejects unknown root fields on integrations update', () => {
      const payload = {
        rogueField: 'hack',
        apiKeys: {}
      };

      const parsed = schemas.updateIntegrationsSchema.body.safeParse(payload);
      expect(parsed.success).toBe(false);
    });
  });

  describe('3. updateSidebarSchema', () => {
    it('validates a valid sidebar ordering list', () => {
      const payload = {
        order: ['classes', 'students', 'staff', 'attendance', 'fees', 'reports']
      };

      const parsed = schemas.updateSidebarSchema.body.safeParse(payload);
      expect(parsed.success).toBe(true);
    });

    it('rejects non-array or empty string elements', () => {
      const payload = {
        order: ['classes', '']
      };

      const parsed = schemas.updateSidebarSchema.body.safeParse(payload);
      expect(parsed.success).toBe(false);
    });
  });

  describe('4. publicSchoolMetaParamsSchema', () => {
    it('accepts valid UUID schoolId', () => {
      const payload = {
        schoolId: validUuid
      };

      const parsed = schemas.publicSchoolMetaParamsSchema.params.safeParse(payload);
      expect(parsed.success).toBe(true);
    });

    it('rejects malformed UUID schoolId', () => {
      const payload = {
        schoolId: 'non-uuid-id'
      };

      const parsed = schemas.publicSchoolMetaParamsSchema.params.safeParse(payload);
      expect(parsed.success).toBe(false);
    });
  });
});
