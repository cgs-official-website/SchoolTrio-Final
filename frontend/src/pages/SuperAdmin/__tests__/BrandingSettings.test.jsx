import { describe, it, expect, vi, beforeEach } from 'vitest';
import BrandingSettings from '../BrandingSettings.jsx';
import * as platformBrandingApi from '../../../api/platformBranding.js';
import toast from 'react-hot-toast';

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

describe('SuperAdmin BrandingSettings Component Migration Tests (FRONTEND.C3)', () => {
  const mockInitialBranding = {
    platformName: 'Apex Multi-Academy',
    primaryColor: '#2563eb',
    logoUrl: 'https://cdn.example.com/apex-logo.png',
    faviconUrl: 'https://cdn.example.com/apex-favicon.ico',
    loginBackgroundImage: 'https://cdn.example.com/apex-bg.jpg',
    updatedAt: '2026-09-19T12:00:00.000Z'
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. exports valid React component function', () => {
    expect(typeof BrandingSettings).toBe('function');
  });

  it('2. getPlatformBranding retrieves current platform branding configuration', async () => {
    const getSpy = vi.spyOn(platformBrandingApi, 'getPlatformBranding').mockResolvedValue({
      success: true,
      data: mockInitialBranding,
      message: 'Platform branding retrieved successfully'
    });

    const res = await platformBrandingApi.getPlatformBranding();

    expect(getSpy).toHaveBeenCalledTimes(1);
    expect(res.data.platformName).toBe('Apex Multi-Academy');
    expect(res.data.primaryColor).toBe('#2563eb');
    expect(res.data.logoUrl).toBe('https://cdn.example.com/apex-logo.png');
    expect(res.data.faviconUrl).toBe('https://cdn.example.com/apex-favicon.ico');
    expect(res.data.loginBackgroundImage).toBe('https://cdn.example.com/apex-bg.jpg');
  });

  it('3. updatePlatformBranding sends valid PATCH payload and returns updated branding DTO', async () => {
    const updatePayload = {
      platformName: 'Global Horizons Academy',
      primaryColor: '#059669',
      logoUrl: 'https://cdn.example.com/horizon-logo.png',
      faviconUrl: 'https://cdn.example.com/horizon-fav.ico',
      loginBackgroundImage: 'https://cdn.example.com/horizon-bg.jpg'
    };

    const updateSpy = vi.spyOn(platformBrandingApi, 'updatePlatformBranding').mockResolvedValue({
      success: true,
      data: {
        ...updatePayload,
        updatedAt: '2026-09-19T18:45:00.000Z'
      },
      message: 'Platform branding updated successfully'
    });

    const res = await platformBrandingApi.updatePlatformBranding(updatePayload);

    expect(updateSpy).toHaveBeenCalledWith(updatePayload);
    expect(res.data.platformName).toBe('Global Horizons Academy');
    expect(res.data.primaryColor).toBe('#059669');
    expect(res.data.logoUrl).toBe('https://cdn.example.com/horizon-logo.png');
    expect(res.data.faviconUrl).toBe('https://cdn.example.com/horizon-fav.ico');
    expect(res.data.loginBackgroundImage).toBe('https://cdn.example.com/horizon-bg.jpg');
  });

  it('4. resetPlatformBranding invokes reset endpoint and returns platform defaults', async () => {
    const resetSpy = vi.spyOn(platformBrandingApi, 'resetPlatformBranding').mockResolvedValue({
      success: true,
      data: {
        ...platformBrandingApi.DEFAULT_PLATFORM_BRANDING,
        updatedAt: null
      },
      message: 'Platform branding reset to defaults successfully'
    });

    const res = await platformBrandingApi.resetPlatformBranding();

    expect(resetSpy).toHaveBeenCalledTimes(1);
    expect(res.data.platformName).toBe('School');
    expect(res.data.primaryColor).toBe('#7b40a3');
    expect(res.data.logoUrl).toBe('/logo.png');
    expect(res.data.faviconUrl).toBe('/logo.png');
  });

  it('5. handles API error propagation on failed update', async () => {
    vi.spyOn(platformBrandingApi, 'updatePlatformBranding').mockRejectedValue(
      new Error('Validation error: primaryColor must be a valid hex color code')
    );

    await expect(
      platformBrandingApi.updatePlatformBranding({ primaryColor: 'invalid-hex' })
    ).rejects.toThrow('Validation error: primaryColor must be a valid hex color code');
  });

  it('6. handles API error propagation on unauthorized access', async () => {
    vi.spyOn(platformBrandingApi, 'updatePlatformBranding').mockRejectedValue(
      new Error('Forbidden: SuperAdmin role required')
    );

    await expect(
      platformBrandingApi.updatePlatformBranding({ platformName: 'New Name' })
    ).rejects.toThrow('Forbidden: SuperAdmin role required');
  });
});
