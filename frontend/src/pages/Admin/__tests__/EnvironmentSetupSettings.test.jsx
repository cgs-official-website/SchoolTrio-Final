import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as settingsApi from '../../../api/settings.js';

describe('Admin EnvironmentSetup School Settings REST Migration (Phase SETTINGS.3)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches composite school settings via getSchoolSettings', async () => {
    const mockSchoolData = {
      id: 'school-123',
      name: 'Springfield Academy',
      contactPhone: '9988776655',
      location: '123 Education Lane, Delhi',
      website: 'https://springfield.edu',
      branding: {
        logoUrl: 'https://cdn.example.com/logo.png'
      },
      academicConfig: {
        currentYear: '2026-2027',
        termType: 'Semester'
      },
      customData: {
        affiliationNumber: 'AFF-9988'
      }
    };

    const getSpy = vi.spyOn(settingsApi, 'getSchoolSettings').mockResolvedValue({
      success: true,
      data: mockSchoolData
    });

    const res = await settingsApi.getSchoolSettings();

    expect(getSpy).toHaveBeenCalled();
    expect(res.data.name).toBe('Springfield Academy');
    expect(res.data.contactPhone).toBe('9988776655');
    expect(res.data.branding.logoUrl).toBe('https://cdn.example.com/logo.png');
    expect(res.data.academicConfig.termType).toBe('Semester');
    expect(res.data.customData.affiliationNumber).toBe('AFF-9988');
  });

  it('updates school settings via updateSchoolSettings', async () => {
    const updatePayload = {
      name: 'Springfield Academy International',
      contactPhone: '1122334455',
      location: '456 Global Campus, Delhi',
      website: 'https://springfield-intl.edu',
      branding: {
        logoUrl: 'https://cdn.example.com/new-logo.png'
      },
      academicConfig: {
        currentYear: '2026-2027',
        termType: 'Trimester_TN'
      },
      customData: {
        affiliationNumber: 'AFF-9988-INTL'
      }
    };

    const updateSpy = vi.spyOn(settingsApi, 'updateSchoolSettings').mockResolvedValue({
      success: true,
      data: {
        id: 'school-123',
        ...updatePayload
      }
    });

    const res = await settingsApi.updateSchoolSettings(updatePayload);

    expect(updateSpy).toHaveBeenCalledWith(updatePayload);
    expect(res.data.name).toBe('Springfield Academy International');
    expect(res.data.branding.logoUrl).toBe('https://cdn.example.com/new-logo.png');
    expect(res.data.academicConfig.termType).toBe('Trimester_TN');
  });

  it('handles partial update without erasing unrelated fields', async () => {
    const partialPayload = {
      name: 'Springfield Academy Renamed'
    };

    const updateSpy = vi.spyOn(settingsApi, 'updateSchoolSettings').mockResolvedValue({
      success: true,
      data: {
        id: 'school-123',
        name: 'Springfield Academy Renamed',
        branding: { logoUrl: 'https://cdn.example.com/logo.png' },
        academicConfig: { currentYear: '2026-2027', termType: 'Semester' }
      }
    });

    const res = await settingsApi.updateSchoolSettings(partialPayload);

    expect(updateSpy).toHaveBeenCalledWith(partialPayload);
    expect(res.data.name).toBe('Springfield Academy Renamed');
    expect(res.data.branding.logoUrl).toBe('https://cdn.example.com/logo.png');
  });

  it('fetches environment setup form schema via REST getFormSchema', async () => {
    const customModulesApi = await import('../../../api/customModules.js');
    const schemaSpy = vi.spyOn(customModulesApi, 'getFormSchema').mockResolvedValue({
      success: true,
      data: {
        fields: [
          { id: 'affiliationNo', label: 'Affiliation No', type: 'text', required: true }
        ]
      }
    });

    const res = await customModulesApi.getFormSchema('environment_setup');

    expect(schemaSpy).toHaveBeenCalledWith('environment_setup');
    expect(res.data.fields).toHaveLength(1);
    expect(res.data.fields[0].id).toBe('affiliationNo');
  });

  describe('Contact Phone 10-Digit Frontend Validation & Sanitization', () => {
    const sanitizePhone = (val) => (val || '').replace(/\D/g, '').slice(0, 10);
    const isValidPhone = (val) => /^[0-9]{10}$/.test(val);

    it('sanitizes 13-digit input (9876543210111) to 10 digits', () => {
      const sanitized = sanitizePhone('9876543210111');
      expect(sanitized).toBe('9876543210');
      expect(isValidPhone(sanitized)).toBe(true);
    });

    it('sanitizes alphanumeric input (abc9876543210) to only 10 digits', () => {
      const sanitized = sanitizePhone('abc9876543210');
      expect(sanitized).toBe('9876543210');
      expect(isValidPhone(sanitized)).toBe(true);
    });

    it('identifies 9-digit input as invalid', () => {
      const sanitized = sanitizePhone('987654321');
      expect(sanitized).toBe('987654321');
      expect(isValidPhone(sanitized)).toBe(false);
    });

    it('identifies valid 10-digit phone as valid', () => {
      const sanitized = sanitizePhone('9876543210');
      expect(sanitized).toBe('9876543210');
      expect(isValidPhone(sanitized)).toBe(true);
    });
  });
});
