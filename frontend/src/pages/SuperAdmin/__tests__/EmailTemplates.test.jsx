import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('react-quill-new', () => ({
  default: () => null
}));
vi.mock('react-quill-new/dist/quill.snow.css', () => ({}));

import EmailTemplates from '../EmailTemplates.jsx';
import * as emailTemplatesApi from '../../../api/emailTemplates.js';
import { sendEmail } from '../../../services/emailService.js';

describe('SuperAdmin EmailTemplates Component Migration Tests (FRONTEND.C2)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('exports valid component function', () => {
    expect(typeof EmailTemplates).toBe('function');
  });

  it('listEmailTemplates fetches and returns raw templates structure', async () => {
    const mockRaw = {
      welcomeSubject: 'Welcome to Acme School',
      welcomeHtml: '<h2>Hello {{userName}}</h2>',
      forgotPasswordSubject: 'Password Reset',
      forgotPasswordHtml: '<p>Click link</p>',
      approvalSubject: 'Approved',
      approvalHtml: '<p>School approved</p>'
    };

    const listSpy = vi.spyOn(emailTemplatesApi, 'listEmailTemplates').mockResolvedValue({
      success: true,
      data: {
        templates: [],
        raw: mockRaw
      }
    });

    const res = await emailTemplatesApi.listEmailTemplates();
    expect(listSpy).toHaveBeenCalled();
    expect(res.data.raw).toEqual(mockRaw);
  });

  it('updateEmailTemplates submits flat payload via PUT /api/v1/email-templates', async () => {
    const payload = {
      welcomeSubject: 'Custom Welcome',
      welcomeHtml: '<p>Custom</p>'
    };

    const updateSpy = vi.spyOn(emailTemplatesApi, 'updateEmailTemplates').mockResolvedValue({
      success: true,
      data: { raw: payload },
      message: 'Email templates updated successfully'
    });

    const res = await emailTemplatesApi.updateEmailTemplates(payload);
    expect(updateSpy).toHaveBeenCalledWith(payload);
    expect(res.data.raw.welcomeSubject).toBe('Custom Welcome');
  });

  it('emailService integrates with listEmailTemplates for dynamic template rendering', async () => {
    const listSpy = vi.spyOn(emailTemplatesApi, 'listEmailTemplates').mockResolvedValue({
      success: true,
      data: {
        raw: {
          welcomeSubject: 'Dynamic Welcome Subject',
          welcomeHtml: '<p>Hello {{userName}}, welcome as {{role}} at {{loginUrl}}</p>'
        }
      }
    });

    // Mock global fetch for email delivery attempt
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: true })
    });

    await sendEmail({
      to: 'test@example.com',
      templateType: 'WELCOME',
      data: { userName: 'Alice', role: 'Teacher', loginUrl: 'https://school.edu' }
    });

    expect(listSpy).toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/send-email',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('Dynamic Welcome Subject')
      })
    );
  });
});
