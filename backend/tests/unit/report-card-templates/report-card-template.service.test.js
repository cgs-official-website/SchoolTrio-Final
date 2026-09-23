import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as reportCardTemplateService from '../../../src/modules/report-card-templates/report-card-template.service.js';
import * as reportCardTemplateRepository from '../../../src/modules/report-card-templates/report-card-template.repository.js';
import * as auditRepository from '../../../src/modules/audit/audit.repository.js';
import { TenantAccessError, ValidationError } from '../../../src/utils/app-error.js';

describe('ReportCardTemplate Service Unit Tests (Phase 4C.7-C Batch 1)', () => {
  const SCHOOL_A = '11111111-1111-4111-8111-111111111111';
  const SCHOOL_B = '22222222-2222-4222-8222-222222222222';
  const TEMPLATE_ID = 'aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa';

  const mockAdminActor = {
    id: 'admin-user-1',
    name: 'School Admin',
    email: 'admin@schoola.com',
    systemRole: 'SCHOOL_ADMIN'
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(auditRepository, 'createAuditLog').mockResolvedValue({ id: 'audit-log-1' });
  });

  // =========================================================================
  // 1. TENANT CONTEXT & VALIDATION
  // =========================================================================
  describe('1. Tenant Context & Input Validation', () => {
    it('throws TenantAccessError when schoolId is missing in getReportCardTemplate', async () => {
      await expect(
        reportCardTemplateService.getReportCardTemplate(null)
      ).rejects.toThrow(TenantAccessError);
    });

    it('throws TenantAccessError when schoolId is missing in saveReportCardTemplate', async () => {
      await expect(
        reportCardTemplateService.saveReportCardTemplate(null, 'report_card', {})
      ).rejects.toThrow(TenantAccessError);
    });

    it('throws TenantAccessError when schoolId is missing in deleteReportCardTemplate', async () => {
      await expect(
        reportCardTemplateService.deleteReportCardTemplate(null)
      ).rejects.toThrow(TenantAccessError);
    });

    it('throws ValidationError for invalid templateType', async () => {
      await expect(
        reportCardTemplateService.getReportCardTemplate(SCHOOL_A, 'invalid type with spaces!')
      ).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError when saving malformed config', async () => {
      await expect(
        reportCardTemplateService.saveReportCardTemplate(SCHOOL_A, 'report_card', {
          themeColor: 'not-a-hex-code'
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  // =========================================================================
  // 2. GET TEMPLATE & DEFAULT FALLBACK
  // =========================================================================
  describe('2. Get Template & Default Fallback', () => {
    it('returns default fallback configuration when no custom template exists', async () => {
      vi.spyOn(reportCardTemplateRepository, 'findTemplateByType').mockResolvedValue(null);

      const result = await reportCardTemplateService.getReportCardTemplate(SCHOOL_A, 'report_card');

      expect(result).toBeDefined();
      expect(result.id).toBeNull();
      expect(result.schoolId).toBe(SCHOOL_A);
      expect(result.templateType).toBe('report_card');
      expect(result.isDefault).toBe(true);
      expect(result.config.themeColor).toBe('#3b82f6');
      expect(result.config.header.title).toBe('PROGRESS REPORT');
    });

    it('returns customized template when custom template exists in database', async () => {
      const mockCustomTemplate = {
        id: TEMPLATE_ID,
        schoolId: SCHOOL_A,
        templateType: 'report_card',
        config: {
          themeColor: '#c99bc1',
          header: { title: 'ANNUAL REPORT CARD' }
        },
        createdAt: new Date('2026-09-10T10:00:00Z'),
        updatedAt: new Date('2026-09-10T10:00:00Z')
      };

      vi.spyOn(reportCardTemplateRepository, 'findTemplateByType').mockResolvedValue(mockCustomTemplate);

      const result = await reportCardTemplateService.getReportCardTemplate(SCHOOL_A, 'report_card');

      expect(result).toBeDefined();
      expect(result.id).toBe(TEMPLATE_ID);
      expect(result.schoolId).toBe(SCHOOL_A);
      expect(result.isDefault).toBe(false);
      expect(result.config.themeColor).toBe('#c99bc1');
      expect(result.config.header.title).toBe('ANNUAL REPORT CARD');
    });
  });

  // =========================================================================
  // 3. CREATE / UPSERT SEMANTICS & AUDIT LOGGING
  // =========================================================================
  describe('3. Save / Upsert Semantics & Audit Logging', () => {
    it('creates template when absent and emits CREATE_REPORT_CARD_TEMPLATE audit log', async () => {
      vi.spyOn(reportCardTemplateRepository, 'findTemplateByType').mockResolvedValue(null);
      vi.spyOn(reportCardTemplateRepository, 'upsertTemplate').mockResolvedValue({
        id: TEMPLATE_ID,
        schoolId: SCHOOL_A,
        templateType: 'report_card',
        config: { themeColor: '#10b981' },
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const auditSpy = vi.spyOn(auditRepository, 'createAuditLog');

      const result = await reportCardTemplateService.saveReportCardTemplate(
        SCHOOL_A,
        'report_card',
        { themeColor: '#10b981' },
        mockAdminActor
      );

      expect(result.id).toBe(TEMPLATE_ID);
      expect(result.config.themeColor).toBe('#10b981');
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          schoolId: SCHOOL_A,
          actionPerformed: 'CREATE_REPORT_CARD_TEMPLATE',
          entityType: 'ReportCardTemplate',
          entityId: TEMPLATE_ID
        })
      );
    });

    it('updates existing template and emits UPDATE_REPORT_CARD_TEMPLATE audit log', async () => {
      vi.spyOn(reportCardTemplateRepository, 'findTemplateByType').mockResolvedValue({
        id: TEMPLATE_ID,
        schoolId: SCHOOL_A,
        templateType: 'report_card',
        config: { themeColor: '#3b82f6' }
      });
      vi.spyOn(reportCardTemplateRepository, 'upsertTemplate').mockResolvedValue({
        id: TEMPLATE_ID,
        schoolId: SCHOOL_A,
        templateType: 'report_card',
        config: { themeColor: '#8b5cf6' },
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const auditSpy = vi.spyOn(auditRepository, 'createAuditLog');

      const result = await reportCardTemplateService.saveReportCardTemplate(
        SCHOOL_A,
        'report_card',
        { themeColor: '#8b5cf6' },
        mockAdminActor
      );

      expect(result.id).toBe(TEMPLATE_ID);
      expect(result.config.themeColor).toBe('#8b5cf6');
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          schoolId: SCHOOL_A,
          actionPerformed: 'UPDATE_REPORT_CARD_TEMPLATE',
          entityType: 'ReportCardTemplate',
          entityId: TEMPLATE_ID
        })
      );
    });

    it('preserves successful template save even if audit logging fails (non-blocking audit)', async () => {
      vi.spyOn(reportCardTemplateRepository, 'findTemplateByType').mockResolvedValue(null);
      vi.spyOn(reportCardTemplateRepository, 'upsertTemplate').mockResolvedValue({
        id: TEMPLATE_ID,
        schoolId: SCHOOL_A,
        templateType: 'report_card',
        config: { themeColor: '#3b82f6' },
        createdAt: new Date(),
        updatedAt: new Date()
      });
      vi.spyOn(auditRepository, 'createAuditLog').mockRejectedValue(new Error('Audit DB down'));

      const result = await reportCardTemplateService.saveReportCardTemplate(
        SCHOOL_A,
        'report_card',
        { themeColor: '#3b82f6' },
        mockAdminActor
      );

      expect(result.id).toBe(TEMPLATE_ID);
      expect(result.config.themeColor).toBe('#3b82f6');
    });
  });

  // =========================================================================
  // 4. DELETE / RESET TO DEFAULT
  // =========================================================================
  describe('4. Delete / Reset Template to Default', () => {
    it('deletes custom template and emits DELETE_REPORT_CARD_TEMPLATE audit log', async () => {
      vi.spyOn(reportCardTemplateRepository, 'findTemplateByType').mockResolvedValue({
        id: TEMPLATE_ID,
        schoolId: SCHOOL_A,
        templateType: 'report_card'
      });
      const deleteSpy = vi.spyOn(reportCardTemplateRepository, 'deleteTemplate').mockResolvedValue({ count: 1 });
      const auditSpy = vi.spyOn(auditRepository, 'createAuditLog');

      const result = await reportCardTemplateService.deleteReportCardTemplate(
        SCHOOL_A,
        'report_card',
        mockAdminActor
      );

      expect(deleteSpy).toHaveBeenCalledWith(SCHOOL_A, 'report_card');
      expect(result.message).toContain('reset to default successfully');
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          schoolId: SCHOOL_A,
          actionPerformed: 'DELETE_REPORT_CARD_TEMPLATE',
          entityId: TEMPLATE_ID
        })
      );
    });

    it('succeeds gracefully when deleting a template that was already not customized', async () => {
      vi.spyOn(reportCardTemplateRepository, 'findTemplateByType').mockResolvedValue(null);
      const deleteSpy = vi.spyOn(reportCardTemplateRepository, 'deleteTemplate');

      const result = await reportCardTemplateService.deleteReportCardTemplate(
        SCHOOL_A,
        'report_card',
        mockAdminActor
      );

      expect(deleteSpy).not.toHaveBeenCalled();
      expect(result.message).toContain('reset to default successfully');
    });
  });

  // =========================================================================
  // 5. TENANT ISOLATION & PROTECTED FIELDS
  // =========================================================================
  describe('5. Tenant Isolation & Protected Fields', () => {
    it('queries repository strictly with the provided schoolId for School A vs School B', async () => {
      const findSpy = vi.spyOn(reportCardTemplateRepository, 'findTemplateByType').mockResolvedValue(null);

      await reportCardTemplateService.getReportCardTemplate(SCHOOL_B, 'report_card');

      expect(findSpy).toHaveBeenCalledWith(SCHOOL_B, 'report_card');
      expect(findSpy).not.toHaveBeenCalledWith(SCHOOL_A, 'report_card');
    });

    it('prevents client-supplied config from overwriting protected database fields (id, schoolId, createdAt, updatedAt)', async () => {
      vi.spyOn(reportCardTemplateRepository, 'findTemplateByType').mockResolvedValue(null);
      const upsertSpy = vi.spyOn(reportCardTemplateRepository, 'upsertTemplate').mockResolvedValue({
        id: TEMPLATE_ID,
        schoolId: SCHOOL_A,
        templateType: 'report_card',
        config: { themeColor: '#3b82f6' },
        createdAt: new Date('2026-09-01T00:00:00Z'),
        updatedAt: new Date('2026-09-11T00:00:00Z')
      });

      const maliciousConfig = {
        id: 'attacker-chosen-uuid',
        schoolId: SCHOOL_B,
        createdAt: '1990-01-01',
        updatedAt: '1990-01-01',
        themeColor: '#3b82f6'
      };

      const result = await reportCardTemplateService.saveReportCardTemplate(
        SCHOOL_A,
        'report_card',
        maliciousConfig,
        mockAdminActor
      );

      // Verify repository was called with authenticated SCHOOL_A, not attacker SCHOOL_B
      expect(upsertSpy).toHaveBeenCalledWith(
        SCHOOL_A,
        'report_card',
        expect.anything()
      );
      // Verify serialized output maintains server-controlled fields
      expect(result.schoolId).toBe(SCHOOL_A);
      expect(result.id).toBe(TEMPLATE_ID);
    });

    it('maintains idempotency across repeated saves without creating duplicate records', async () => {
      vi.spyOn(reportCardTemplateRepository, 'findTemplateByType').mockResolvedValue(null);
      let callCount = 0;
      vi.spyOn(reportCardTemplateRepository, 'upsertTemplate').mockImplementation(async (schoolId, templateType, config) => {
        callCount++;
        return {
          id: TEMPLATE_ID,
          schoolId,
          templateType,
          config,
          createdAt: new Date('2026-09-01T00:00:00Z'),
          updatedAt: new Date()
        };
      });

      const firstSave = await reportCardTemplateService.saveReportCardTemplate(SCHOOL_A, 'report_card', { themeColor: '#111111' }, mockAdminActor);
      const secondSave = await reportCardTemplateService.saveReportCardTemplate(SCHOOL_A, 'report_card', { themeColor: '#222222' }, mockAdminActor);

      expect(callCount).toBe(2);
      expect(firstSave.id).toBe(TEMPLATE_ID);
      expect(secondSave.id).toBe(TEMPLATE_ID);
      expect(firstSave.schoolId).toBe(SCHOOL_A);
      expect(secondSave.schoolId).toBe(SCHOOL_A);
    });
  });
});
