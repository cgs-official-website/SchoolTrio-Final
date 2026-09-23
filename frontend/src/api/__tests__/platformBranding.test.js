import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as clientModule from '../client.js';
import {
  getPlatformBranding,
  updatePlatformBranding,
  resetPlatformBranding,
  DEFAULT_PLATFORM_BRANDING
} from '../platformBranding.js';

describe('Unit: Platform Branding REST API Client (FRONTEND.C3)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('DEFAULT_PLATFORM_BRANDING', () => {
    it('provides audited immutable default branding attributes', () => {
      expect(DEFAULT_PLATFORM_BRANDING).toEqual({
        platformName: 'School',
        primaryColor: '#7b40a3',
        logoUrl: '/logo.png',
        faviconUrl: '/logo.png',
        loginBackgroundImage:
          'https://images.unsplash.com/photo-1577896851231-70ef18881754?q=80&w=2070'
      });
      expect(Object.isFrozen(DEFAULT_PLATFORM_BRANDING)).toBe(true);
    });
  });

  describe('getPlatformBranding', () => {
    it('calls apiClient with GET /api/v1/platform/branding', async () => {
      const mockResponse = {
        success: true,
        data: {
          platformName: 'Acme School System',
          primaryColor: '#3b82f6',
          logoUrl: 'https://cdn.example.com/logo.png',
          faviconUrl: 'https://cdn.example.com/favicon.ico',
          loginBackgroundImage: 'https://cdn.example.com/bg.jpg',
          updatedAt: '2026-09-19T18:00:00.000Z'
        }
      };

      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockResponse);

      const result = await getPlatformBranding();

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/platform/branding', {
        method: 'GET'
      });
      expect(result).toEqual(mockResponse);
    });

    it('propagates ApiError on network or server errors', async () => {
      vi.spyOn(clientModule, 'apiClient').mockRejectedValue(
        new clientModule.ApiError('Server unavailable', 503, 'SERVICE_UNAVAILABLE')
      );

      await expect(getPlatformBranding()).rejects.toThrow('Server unavailable');
    });
  });

  describe('updatePlatformBranding', () => {
    it('calls apiClient with PATCH /api/v1/platform/branding and stringified payload', async () => {
      const payload = {
        platformName: 'Custom Academy',
        primaryColor: '#10b981',
        logoUrl: 'https://cdn.example.com/new-logo.png'
      };

      const mockResponse = {
        success: true,
        data: {
          ...payload,
          faviconUrl: '/logo.png',
          loginBackgroundImage: 'https://images.unsplash.com/...',
          updatedAt: '2026-09-19T18:30:00.000Z'
        },
        message: 'Platform branding updated successfully'
      };

      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockResponse);

      const result = await updatePlatformBranding(payload);

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/platform/branding', {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      expect(result).toEqual(mockResponse);
    });

    it('propagates ApiError on 401 unauthenticated or 403 forbidden access', async () => {
      vi.spyOn(clientModule, 'apiClient').mockRejectedValue(
        new clientModule.ApiError('Forbidden access', 403, 'FORBIDDEN')
      );

      await expect(updatePlatformBranding({ primaryColor: '#ff0000' })).rejects.toThrow(
        'Forbidden access'
      );
    });
  });

  describe('resetPlatformBranding', () => {
    it('calls apiClient with POST /api/v1/platform/branding/reset', async () => {
      const mockResponse = {
        success: true,
        data: { ...DEFAULT_PLATFORM_BRANDING, updatedAt: null },
        message: 'Platform branding reset to defaults successfully'
      };

      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockResponse);

      const result = await resetPlatformBranding();

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/platform/branding/reset', {
        method: 'POST'
      });
      expect(result).toEqual(mockResponse);
    });

    it('propagates ApiError if non-superadmin attempts reset', async () => {
      vi.spyOn(clientModule, 'apiClient').mockRejectedValue(
        new clientModule.ApiError('Forbidden', 403, 'FORBIDDEN')
      );

      await expect(resetPlatformBranding()).rejects.toThrow('Forbidden');
    });
  });
});
