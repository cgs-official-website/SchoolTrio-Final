import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as clientModule from '../client.js';
import {
  listEmailTemplates,
  getEmailTemplate,
  updateEmailTemplates,
  resetEmailTemplate
} from '../emailTemplates.js';

describe('Unit: Email Templates REST API Client (FRONTEND.C2)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('listEmailTemplates', () => {
    it('calls apiClient with GET /api/v1/email-templates when no query params provided', async () => {
      const mockResponse = {
        success: true,
        data: {
          templates: [{ id: 'welcome', name: 'Welcome Email' }],
          raw: { welcomeSubject: 'Welcome!', welcomeHtml: '<p>Hello</p>' }
        }
      };

      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockResponse);

      const result = await listEmailTemplates();

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/email-templates', {
        method: 'GET'
      });
      expect(result).toEqual(mockResponse);
    });

    it('appends query parameters when filtering by isActive, isSystem, or search', async () => {
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({ success: true });

      await listEmailTemplates({ isActive: true, isSystem: false, search: 'Welcome' });

      expect(apiSpy).toHaveBeenCalledWith(
        '/api/v1/email-templates?isActive=true&isSystem=false&search=Welcome',
        { method: 'GET' }
      );
    });

    it('propagates ApiError on unauthenticated or unauthorized access', async () => {
      vi.spyOn(clientModule, 'apiClient').mockRejectedValue(
        new clientModule.ApiError('Unauthorized', 401, 'UNAUTHORIZED')
      );

      await expect(listEmailTemplates()).rejects.toThrow('Unauthorized');
    });
  });

  describe('getEmailTemplate', () => {
    it('calls apiClient with GET /api/v1/email-templates/:id with encoded ID', async () => {
      const mockTemplate = {
        id: 'forgotPassword',
        name: 'Forgot Password',
        subject: 'Reset Password'
      };

      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: mockTemplate
      });

      const result = await getEmailTemplate('forgotPassword');

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/email-templates/forgotPassword', {
        method: 'GET'
      });
      expect(result.data).toEqual(mockTemplate);
    });

    it('throws when ID is omitted', async () => {
      await expect(getEmailTemplate('')).rejects.toThrow('Template ID is required');
    });
  });

  describe('updateEmailTemplates', () => {
    it('calls apiClient with PUT /api/v1/email-templates and stringified payload', async () => {
      const payload = {
        welcomeSubject: 'Welcome to Our School',
        welcomeHtml: '<p>Welcome</p>',
        forgotPasswordSubject: 'Password Reset',
        forgotPasswordHtml: '<p>Reset</p>',
        approvalSubject: 'Approved',
        approvalHtml: '<p>Approved</p>'
      };

      const mockResponse = {
        success: true,
        data: { raw: payload },
        message: 'Email templates updated successfully'
      };

      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockResponse);

      const result = await updateEmailTemplates(payload);

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/email-templates', {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      expect(result).toEqual(mockResponse);
    });

    it('propagates ApiError on validation or forbidden update', async () => {
      vi.spyOn(clientModule, 'apiClient').mockRejectedValue(
        new clientModule.ApiError('Forbidden', 403, 'FORBIDDEN')
      );

      await expect(updateEmailTemplates({})).rejects.toThrow('Forbidden');
    });
  });

  describe('resetEmailTemplate', () => {
    it('calls apiClient with POST /api/v1/email-templates/:id/reset', async () => {
      const mockReset = {
        id: 'welcome',
        subject: 'Welcome to Acme School',
        isSystem: true
      };

      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: mockReset
      });

      const result = await resetEmailTemplate('welcome');

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/email-templates/welcome/reset', {
        method: 'POST'
      });
      expect(result.data).toEqual(mockReset);
    });

    it('throws when template ID is omitted', async () => {
      await expect(resetEmailTemplate('')).rejects.toThrow('Template ID is required');
    });
  });
});
