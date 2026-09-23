import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as platformBrandingService from '../../../src/modules/platform-branding/platform-branding.service.js';
import * as platformBrandingRepo from '../../../src/modules/platform-branding/platform-branding.repository.js';
import { logger } from '../../../src/utils/logger.js';

describe('Unit: Platform Branding Service', () => {
  const mockActor = {
    userId: 'superadmin-uuid-1',
    email: 'superadmin@platform.com',
    role: 'SUPER_ADMIN'
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('getPlatformBranding', () => {
    it('returns platform defaults when no setting row exists in database', () => {
      vi.spyOn(platformBrandingRepo, 'getPlatformSettingByKey').mockResolvedValue(null);

      const branding = platformBrandingService.getPlatformBranding();
      return expect(branding).resolves.toEqual({
        platformName: 'School',
        primaryColor: '#7b40a3',
        logoUrl: '/logo.png',
        faviconUrl: '/logo.png',
        loginBackgroundImage:
          'https://images.unsplash.com/photo-1577896851231-70ef18881754?q=80&w=2070',
        updatedAt: null
      });
    });

    it('returns saved configuration merged with defaults when setting exists', async () => {
      const updatedAtDate = new Date('2026-09-19T12:00:00.000Z');
      vi.spyOn(platformBrandingRepo, 'getPlatformSettingByKey').mockResolvedValue({
        id: 'setting-uuid-1',
        key: 'global_branding',
        data: {
          platformName: 'EduCloud Platform',
          primaryColor: '#2563eb'
        },
        createdAt: new Date(),
        updatedAt: updatedAtDate
      });

      const branding = await platformBrandingService.getPlatformBranding();

      expect(branding).toEqual({
        platformName: 'EduCloud Platform',
        primaryColor: '#2563eb',
        logoUrl: '/logo.png',
        faviconUrl: '/logo.png',
        loginBackgroundImage:
          'https://images.unsplash.com/photo-1577896851231-70ef18881754?q=80&w=2070',
        updatedAt: updatedAtDate.toISOString()
      });
    });
  });

  describe('updatePlatformBranding', () => {
    it('merges partial updates, saves via repository, and emits audit log', async () => {
      vi.spyOn(platformBrandingRepo, 'getPlatformSettingByKey').mockResolvedValue(null);

      const updatedAtDate = new Date('2026-09-19T13:00:00.000Z');
      const upsertSpy = vi
        .spyOn(platformBrandingRepo, 'upsertPlatformSetting')
        .mockImplementation(async (key, data) => ({
          id: 'setting-uuid-1',
          key,
          data,
          updatedAt: updatedAtDate
        }));

      const loggerSpy = vi.spyOn(logger, 'info');

      const payload = {
        platformName: 'Global High School',
        primaryColor: '#059669'
      };

      const result = await platformBrandingService.updatePlatformBranding(payload, mockActor);

      expect(upsertSpy).toHaveBeenCalledWith('global_branding', {
        platformName: 'Global High School',
        primaryColor: '#059669',
        logoUrl: '/logo.png',
        faviconUrl: '/logo.png',
        loginBackgroundImage:
          'https://images.unsplash.com/photo-1577896851231-70ef18881754?q=80&w=2070'
      });

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'UPDATE_PLATFORM_BRANDING',
          actorId: mockActor.userId,
          actorEmail: mockActor.email,
          actorRole: mockActor.role,
          modifiedFields: payload
        }),
        expect.stringContaining('Global platform branding updated')
      );

      expect(result.platformName).toBe('Global High School');
      expect(result.primaryColor).toBe('#059669');
      expect(result.updatedAt).toBe(updatedAtDate.toISOString());
    });
  });

  describe('resetPlatformBranding', () => {
    it('deletes setting row and returns default branding', async () => {
      const deleteSpy = vi
        .spyOn(platformBrandingRepo, 'deletePlatformSettingByKey')
        .mockResolvedValue({ count: 1 });

      const loggerSpy = vi.spyOn(logger, 'info');

      const result = await platformBrandingService.resetPlatformBranding(mockActor);

      expect(deleteSpy).toHaveBeenCalledWith('global_branding');
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'RESET_PLATFORM_BRANDING',
          actorId: mockActor.userId,
          actorEmail: mockActor.email
        }),
        expect.stringContaining('Global platform branding reset to defaults')
      );

      expect(result).toEqual({
        platformName: 'School',
        primaryColor: '#7b40a3',
        logoUrl: '/logo.png',
        faviconUrl: '/logo.png',
        loginBackgroundImage:
          'https://images.unsplash.com/photo-1577896851231-70ef18881754?q=80&w=2070',
        updatedAt: null
      });
    });
  });
});
