import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as emailTemplatesService from '../../../src/modules/email-templates/email-templates.service.js';
import * as emailTemplatesRepo from '../../../src/modules/email-templates/email-templates.repository.js';
import * as auditRepository from '../../../src/modules/audit/audit.repository.js';
import { NotFoundError, ValidationError, ConflictError } from '../../../src/utils/app-error.js';

describe('Email Templates Service Unit Tests', () => {
  const mockSchoolId = '11111111-1111-1111-1111-111111111111';
  const mockActor = {
    userId: 'user-admin-1',
    email: 'admin@school.edu',
    systemRole: 'SCHOOL_ADMIN'
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(auditRepository, 'createAuditLog').mockResolvedValue({});
    vi.spyOn(emailTemplatesRepo, 'executeTransaction').mockImplementation(async (cb) => cb({}));
  });

  describe('listTemplates', () => {
    it('returns standard system defaults when no custom settings exist', async () => {
      vi.spyOn(emailTemplatesRepo, 'findEmailTemplatesSetting').mockResolvedValue(null);

      const result = await emailTemplatesService.listTemplates(mockSchoolId);

      expect(result.templates).toHaveLength(3);
      const welcome = result.templates.find(t => t.id === 'welcome');
      expect(welcome).toBeDefined();
      expect(welcome.name).toBe('Welcome Email');
      expect(welcome.isSystem).toBe(true);
      expect(welcome.subject).toBe('Welcome to Acme School');

      // Verify legacy flat format is also returned
      expect(result.raw).toBeDefined();
      expect(result.raw.welcomeSubject).toBe('Welcome to Acme School');
      expect(result.raw.welcomeHtml).toContain('Hello {{userName}}');
    });

    it('merges saved overrides with system defaults', async () => {
      vi.spyOn(emailTemplatesRepo, 'findEmailTemplatesSetting').mockResolvedValue({
        schoolId: mockSchoolId,
        category: 'emailTemplates',
        data: {
          templates: {
            welcome: {
              subject: 'Custom School Welcome',
              body: '<p>Custom welcome message</p>',
              isActive: true
            }
          }
        }
      });

      const result = await emailTemplatesService.listTemplates(mockSchoolId);
      const welcome = result.templates.find(t => t.id === 'welcome');
      expect(welcome.subject).toBe('Custom School Welcome');
      expect(welcome.body).toBe('<p>Custom welcome message</p>');
      expect(welcome.isSystem).toBe(true);

      // Verify forgotPassword still has default values
      const forgotPassword = result.templates.find(t => t.id === 'forgotPassword');
      expect(forgotPassword.subject).toBe('Password Reset Request');
    });

    it('filters templates by search term and active status', async () => {
      vi.spyOn(emailTemplatesRepo, 'findEmailTemplatesSetting').mockResolvedValue({
        schoolId: mockSchoolId,
        category: 'emailTemplates',
        data: {
          templates: {
            approval: {
              isActive: false
            }
          }
        }
      });

      const activeOnly = await emailTemplatesService.listTemplates(mockSchoolId, { isActive: 'true' });
      expect(activeOnly.templates.some(t => t.id === 'approval')).toBe(false);

      const searched = await emailTemplatesService.listTemplates(mockSchoolId, { search: 'password' });
      expect(searched.templates).toHaveLength(1);
      expect(searched.templates[0].id).toBe('forgotPassword');
    });

    it('throws ValidationError if schoolId is missing', async () => {
      await expect(emailTemplatesService.listTemplates(null)).rejects.toThrow(ValidationError);
    });
  });

  describe('getTemplateById', () => {
    it('returns template when found', async () => {
      vi.spyOn(emailTemplatesRepo, 'findEmailTemplatesSetting').mockResolvedValue(null);

      const template = await emailTemplatesService.getTemplateById(mockSchoolId, 'welcome');
      expect(template.id).toBe('welcome');
      expect(template.variables).toContain('{{userName}}');
    });

    it('throws NotFoundError when template ID is not found', async () => {
      vi.spyOn(emailTemplatesRepo, 'findEmailTemplatesSetting').mockResolvedValue(null);

      await expect(
        emailTemplatesService.getTemplateById(mockSchoolId, 'non-existent-template')
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('createCustomTemplate', () => {
    it('successfully creates a custom template and dispatches audit log', async () => {
      vi.spyOn(emailTemplatesRepo, 'findEmailTemplatesSetting').mockResolvedValue(null);
      const upsertSpy = vi.spyOn(emailTemplatesRepo, 'upsertEmailTemplatesSetting').mockResolvedValue({});

      const payload = {
        name: 'Notice of Fee Due',
        subject: 'Reminder: Outstanding Fees',
        body: '<p>Dear Parent, please settle your fees.</p>',
        variables: ['{{dueDate}}']
      };

      const created = await emailTemplatesService.createCustomTemplate(mockSchoolId, payload, mockActor);

      expect(created.id).toBe('notice-of-fee-due');
      expect(created.isSystem).toBe(false);
      expect(created.subject).toBe('Reminder: Outstanding Fees');
      expect(upsertSpy).toHaveBeenCalled();
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          schoolId: mockSchoolId,
          entityType: 'EmailTemplate',
          actionPerformed: 'CREATE_EMAIL_TEMPLATE'
        }),
        expect.anything()
      );
    });

    it('prohibits creating a template that shadows a system template ID', async () => {
      const payload = {
        id: 'welcome',
        name: 'Welcome Email',
        subject: 'Override',
        body: '<p>Override</p>'
      };

      await expect(
        emailTemplatesService.createCustomTemplate(mockSchoolId, payload, mockActor)
      ).rejects.toThrow(ConflictError);
    });

    it('prohibits creating a template with an ID that already exists', async () => {
      vi.spyOn(emailTemplatesRepo, 'findEmailTemplatesSetting').mockResolvedValue({
        schoolId: mockSchoolId,
        category: 'emailTemplates',
        data: {
          templates: {
            'existing-custom': {
              id: 'existing-custom',
              name: 'Existing',
              subject: 'Sub',
              body: 'Body'
            }
          }
        }
      });

      const payload = {
        id: 'existing-custom',
        name: 'Existing',
        subject: 'Sub',
        body: 'Body'
      };

      await expect(
        emailTemplatesService.createCustomTemplate(mockSchoolId, payload, mockActor)
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('updateTemplate', () => {
    it('updates template content, preserves system status, and records audit log', async () => {
      vi.spyOn(emailTemplatesRepo, 'findEmailTemplatesSetting').mockResolvedValue(null);
      const upsertSpy = vi.spyOn(emailTemplatesRepo, 'upsertEmailTemplatesSetting').mockResolvedValue({});

      const updated = await emailTemplatesService.updateTemplate(
        mockSchoolId,
        'welcome',
        { subject: 'Brand New Welcome Subject', body: '<p>New Body</p>' },
        mockActor
      );

      expect(updated.id).toBe('welcome');
      expect(updated.subject).toBe('Brand New Welcome Subject');
      expect(updated.body).toBe('<p>New Body</p>');
      expect(updated.isSystem).toBe(true);
      expect(upsertSpy).toHaveBeenCalled();
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          schoolId: mockSchoolId,
          entityType: 'EmailTemplate',
          actionPerformed: 'UPDATE_EMAIL_TEMPLATE'
        }),
        expect.anything()
      );
    });

    it('throws NotFoundError when updating non-existent template', async () => {
      vi.spyOn(emailTemplatesRepo, 'findEmailTemplatesSetting').mockResolvedValue(null);

      await expect(
        emailTemplatesService.updateTemplate(
          mockSchoolId,
          'unknown-template',
          { subject: 'New Subject' },
          mockActor
        )
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('resetTemplate', () => {
    it('resets a modified system template to default values and logs audit', async () => {
      vi.spyOn(emailTemplatesRepo, 'findEmailTemplatesSetting').mockResolvedValue({
        schoolId: mockSchoolId,
        category: 'emailTemplates',
        data: {
          templates: {
            welcome: {
              subject: 'Modified Subject',
              body: '<p>Modified Body</p>'
            }
          }
        }
      });
      const upsertSpy = vi.spyOn(emailTemplatesRepo, 'upsertEmailTemplatesSetting').mockResolvedValue({});

      const reset = await emailTemplatesService.resetTemplate(mockSchoolId, 'welcome', mockActor);

      expect(reset.subject).toBe('Welcome to Acme School');
      expect(reset.body).toContain('Hello {{userName}}');
      expect(upsertSpy).toHaveBeenCalled();
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actionPerformed: 'RESET_EMAIL_TEMPLATE'
        }),
        expect.anything()
      );
    });

    it('rejects resetting non-system templates', async () => {
      vi.spyOn(emailTemplatesRepo, 'findEmailTemplatesSetting').mockResolvedValue(null);

      await expect(
        emailTemplatesService.resetTemplate(mockSchoolId, 'custom-notice', mockActor)
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('bulkUpdateTemplates', () => {
    it('supports legacy flat fields matching frontend EmailTemplates.jsx', async () => {
      vi.spyOn(emailTemplatesRepo, 'findEmailTemplatesSetting').mockResolvedValue(null);
      const upsertSpy = vi.spyOn(emailTemplatesRepo, 'upsertEmailTemplatesSetting').mockResolvedValue({});

      const payload = {
        welcomeSubject: 'Acme School - Welcome',
        welcomeHtml: '<p>Acme welcome</p>',
        forgotPasswordSubject: 'Acme Password Reset',
        forgotPasswordHtml: '<p>Acme reset</p>'
      };

      const result = await emailTemplatesService.bulkUpdateTemplates(mockSchoolId, payload, mockActor);

      expect(result.raw.welcomeSubject).toBe('Acme School - Welcome');
      expect(result.raw.forgotPasswordSubject).toBe('Acme Password Reset');
      expect(upsertSpy).toHaveBeenCalled();
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actionPerformed: 'UPDATE_EMAIL_TEMPLATES'
        }),
        expect.anything()
      );
    });
  });

  describe('deleteTemplate', () => {
    it('strictly prohibits deleting system templates', async () => {
      vi.spyOn(emailTemplatesRepo, 'findEmailTemplatesSetting').mockResolvedValue(null);

      await expect(
        emailTemplatesService.deleteTemplate(mockSchoolId, 'welcome', mockActor)
      ).rejects.toThrow(ValidationError);

      await expect(
        emailTemplatesService.deleteTemplate(mockSchoolId, 'forgotPassword', mockActor)
      ).rejects.toThrow(ValidationError);

      await expect(
        emailTemplatesService.deleteTemplate(mockSchoolId, 'approval', mockActor)
      ).rejects.toThrow(ValidationError);
    });

    it('successfully deletes a custom template and logs audit', async () => {
      vi.spyOn(emailTemplatesRepo, 'findEmailTemplatesSetting').mockResolvedValue({
        schoolId: mockSchoolId,
        category: 'emailTemplates',
        data: {
          templates: {
            'custom-1': {
              id: 'custom-1',
              name: 'Custom Notice',
              isSystem: false
            }
          }
        }
      });
      const upsertSpy = vi.spyOn(emailTemplatesRepo, 'upsertEmailTemplatesSetting').mockResolvedValue({});

      const result = await emailTemplatesService.deleteTemplate(mockSchoolId, 'custom-1', mockActor);

      expect(result.deleted).toBe(true);
      expect(result.id).toBe('custom-1');
      expect(upsertSpy).toHaveBeenCalled();
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actionPerformed: 'DELETE_EMAIL_TEMPLATE',
          entityId: 'custom-1'
        }),
        expect.anything()
      );
    });

    it('throws NotFoundError if deleting a non-existent custom template', async () => {
      vi.spyOn(emailTemplatesRepo, 'findEmailTemplatesSetting').mockResolvedValue(null);

      await expect(
        emailTemplatesService.deleteTemplate(mockSchoolId, 'non-existent', mockActor)
      ).rejects.toThrow(NotFoundError);
    });
  });
});
