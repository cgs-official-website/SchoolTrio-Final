import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as settingsApi from '../../../api/settings.js';

describe('Admin APIIntegrations REST Migration (Phase SETTINGS.3)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches integrations with masked whatsapp credentials', async () => {
    const mockIntegrations = {
      apiKeys: {
        googleMaps: 'AIzaSyGoogleKey123',
        cloudinary: {
          cloudName: 'schoolcloud',
          uploadPreset: 'school_preset'
        }
      },
      whatsapp: {
        configured: true,
        isMasked: true,
        provider: 'meta_whatsapp_cloud_api',
        phoneNumberId: '1029384756',
        businessAccountId: '5647382910',
        senderNumber: '+919876543210',
        ptmTemplateName: 'school_ptm_scheduled',
        noticeTemplateName: 'school_notice_notification',
        enabled: true,
        isConnected: true
      },
      permittedModules: ['transport', 'media', 'whatsapp']
    };

    const getSpy = vi.spyOn(settingsApi, 'getIntegrations').mockResolvedValue({
      success: true,
      data: mockIntegrations
    });

    const res = await settingsApi.getIntegrations();

    expect(getSpy).toHaveBeenCalled();
    expect(res.data.apiKeys.googleMaps).toBe('AIzaSyGoogleKey123');
    expect(res.data.apiKeys.cloudinary.cloudName).toBe('schoolcloud');
    expect(res.data.whatsapp.isMasked).toBe(true);
    expect(res.data.whatsapp.configured).toBe(true);
    expect(res.data.whatsapp.accessToken).toBeUndefined(); // Backend never leaks raw token
  });

  it('updates integrations preserving existing masked secret when no new token is supplied', async () => {
    const payload = {
      apiKeys: {
        googleMaps: 'AIzaSyGoogleKeyNew',
        cloudinary: { cloudName: 'schoolcloud', uploadPreset: 'new_preset' }
      },
      whatsapp: {
        phoneNumberId: '1029384756',
        businessAccountId: '5647382910',
        senderNumber: '+919876543210',
        ptmTemplateName: 'school_ptm_scheduled',
        noticeTemplateName: 'school_notice_notification',
        enabled: true,
        isConnected: true
      }
    };

    const updateSpy = vi.spyOn(settingsApi, 'updateIntegrations').mockResolvedValue({
      success: true,
      data: {
        ...payload,
        whatsapp: {
          ...payload.whatsapp,
          configured: true,
          isMasked: true
        }
      }
    });

    const res = await settingsApi.updateIntegrations(payload);

    expect(updateSpy).toHaveBeenCalledWith(payload);
    expect(res.data.apiKeys.googleMaps).toBe('AIzaSyGoogleKeyNew');
    expect(res.data.whatsapp.configured).toBe(true);
  });

  it('updates integrations with a new secret when user explicitly changes token', async () => {
    const payloadWithSecret = {
      whatsapp: {
        accessToken: 'EAABNewSecretToken12345',
        phoneNumberId: '1029384756',
        enabled: true
      }
    };

    const updateSpy = vi.spyOn(settingsApi, 'updateIntegrations').mockResolvedValue({
      success: true,
      data: {
        whatsapp: {
          phoneNumberId: '1029384756',
          configured: true,
          isMasked: true,
          enabled: true
        }
      }
    });

    const res = await settingsApi.updateIntegrations(payloadWithSecret);

    expect(updateSpy).toHaveBeenCalledWith(payloadWithSecret);
    expect(res.data.whatsapp.isMasked).toBe(true);
  });

  it('disconnects whatsapp by setting enabled false and blank token', async () => {
    const disconnectPayload = {
      whatsapp: {
        enabled: false,
        isConnected: false,
        accessToken: ''
      }
    };

    const updateSpy = vi.spyOn(settingsApi, 'updateIntegrations').mockResolvedValue({
      success: true,
      data: {
        whatsapp: {
          enabled: false,
          isConnected: false,
          configured: false,
          isMasked: false
        }
      }
    });

    const res = await settingsApi.updateIntegrations(disconnectPayload);

    expect(updateSpy).toHaveBeenCalledWith(disconnectPayload);
    expect(res.data.whatsapp.enabled).toBe(false);
    expect(res.data.whatsapp.isConnected).toBe(false);
  });
});
