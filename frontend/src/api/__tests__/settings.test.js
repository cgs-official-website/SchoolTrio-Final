import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as clientModule from '../client.js';
import {
  getSchoolSettings,
  updateSchoolSettings,
  getIntegrations,
  updateIntegrations,
  getSidebarSettings,
  updateSidebarSettings,
  getPublicSchoolMeta,
  settingsApi
} from '../settings.js';

describe('Settings API Client Unit Tests (Phase SETTINGS.3)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. School Settings', () => {
    it('fetches school settings', async () => {
      const mockData = {
        id: 'school-1',
        name: 'Greenwood High',
        phone: '+91 9876543210',
        website: 'https://greenwood.edu'
      };
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: mockData
      });

      const res = await getSchoolSettings();
      expect(spy).toHaveBeenCalledWith('/api/v1/settings/school', { method: 'GET' });
      expect(res.data.name).toBe('Greenwood High');
    });

    it('updates school settings', async () => {
      const payload = {
        name: 'Greenwood High Updated',
        website: 'https://newsite.edu',
        branding: { logoUrl: 'https://cdn.example.com/logo.png' }
      };
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: 'school-1', ...payload }
      });

      const res = await updateSchoolSettings(payload);
      expect(spy).toHaveBeenCalledWith('/api/v1/settings/school', {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      expect(res.data.name).toBe('Greenwood High Updated');
    });
  });

  describe('2. Integrations', () => {
    it('fetches integrations with masked credentials', async () => {
      const mockIntegrations = {
        apiKeys: { googleMaps: 'AIzaMapsKey' },
        whatsapp: { isMasked: true, enabled: true }
      };
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: mockIntegrations
      });

      const res = await getIntegrations();
      expect(spy).toHaveBeenCalledWith('/api/v1/settings/integrations', { method: 'GET' });
      expect(res.data.whatsapp.isMasked).toBe(true);
    });

    it('updates integrations', async () => {
      const payload = {
        whatsapp: { enabled: true, phoneNumberId: '123456' }
      };
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: payload
      });

      const res = await updateIntegrations(payload);
      expect(spy).toHaveBeenCalledWith('/api/v1/settings/integrations', {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      expect(res.data.whatsapp.phoneNumberId).toBe('123456');
    });
  });

  describe('3. Sidebar Settings', () => {
    it('fetches sidebar ordering', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { order: ['classes', 'students', 'staff'] }
      });

      const res = await getSidebarSettings();
      expect(spy).toHaveBeenCalledWith('/api/v1/settings/sidebar', { method: 'GET' });
      expect(res.data.order).toEqual(['classes', 'students', 'staff']);
    });

    it('updates sidebar ordering', async () => {
      const order = ['students', 'classes', 'attendance'];
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { order }
      });

      const res = await updateSidebarSettings(order);
      expect(spy).toHaveBeenCalledWith('/api/v1/settings/sidebar', {
        method: 'PUT',
        body: JSON.stringify({ order })
      });
      expect(res.data.order).toEqual(order);
    });
  });

  describe('4. Public School Metadata', () => {
    it('fetches public school metadata by schoolId', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: 'sch-uuid-1', name: 'Greenwood High', code: 'GW-01', logoUrl: 'https://cdn.example.com/logo.png' }
      });

      const res = await getPublicSchoolMeta('sch-uuid-1');
      expect(spy).toHaveBeenCalledWith('/api/v1/public/schools/sch-uuid-1/meta', { method: 'GET' });
      expect(res.data.code).toBe('GW-01');
    });

    it('throws error when schoolId is missing', async () => {
      await expect(getPublicSchoolMeta('')).rejects.toThrow('schoolId is required');
    });
  });

  describe('5. Default Object Export', () => {
    it('exports all methods on settingsApi object', () => {
      expect(typeof settingsApi.getSchoolSettings).toBe('function');
      expect(typeof settingsApi.updateSchoolSettings).toBe('function');
      expect(typeof settingsApi.getIntegrations).toBe('function');
      expect(typeof settingsApi.updateIntegrations).toBe('function');
      expect(typeof settingsApi.getSidebarSettings).toBe('function');
      expect(typeof settingsApi.updateSidebarSettings).toBe('function');
      expect(typeof settingsApi.getPublicSchoolMeta).toBe('function');
    });
  });
});
