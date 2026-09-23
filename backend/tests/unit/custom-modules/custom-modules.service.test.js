import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as customModulesService from '../../../src/modules/custom-modules/custom-modules.service.js';
import * as customModulesRepo from '../../../src/modules/custom-modules/custom-modules.repository.js';
import * as settingsRepo from '../../../src/modules/settings/settings.repository.js';
import * as auditRepo from '../../../src/modules/audit/audit.repository.js';
import { NotFoundError, ValidationError, ConflictError } from '../../../src/utils/app-error.js';

describe('Custom Modules Service Unit Tests', () => {
  const schoolId = '11111111-1111-4111-8111-111111111111';
  const moduleId = '22222222-2222-4222-8222-222222222222';
  const recordId = '33333333-3333-4333-8333-333333333333';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Custom Module CRUD', () => {
    it('creates module atomically with default schema and sidebar order', async () => {
      vi.spyOn(customModulesRepo, 'findModuleByName').mockResolvedValue(null);
      vi.spyOn(customModulesRepo, 'countModules').mockResolvedValue(3);
      vi.spyOn(customModulesRepo, 'createModule').mockResolvedValue({
        id: moduleId,
        schoolId,
        name: 'Hostel Gate Pass',
        icon: 'Folder',
        order: 3,
        isActive: true
      });
      vi.spyOn(customModulesRepo, 'upsertSchema').mockResolvedValue({});
      vi.spyOn(settingsRepo, 'findSetting').mockResolvedValue({
        data: { order: ['students', 'staff'] }
      });
      vi.spyOn(settingsRepo, 'upsertSetting').mockResolvedValue({});
      vi.spyOn(auditRepo, 'createAuditLog').mockResolvedValue({});
      vi.spyOn(customModulesRepo, 'executeTransaction').mockImplementation(async (cb) => cb({}));

      const result = await customModulesService.createCustomModule(
        schoolId,
        { name: 'Hostel Gate Pass' },
        { email: 'admin@school.com', role: 'SCHOOL_ADMIN' }
      );

      expect(result.id).toBe(moduleId);
      expect(result.name).toBe('Hostel Gate Pass');
      expect(customModulesRepo.createModule).toHaveBeenCalledWith(
        schoolId,
        expect.objectContaining({ name: 'Hostel Gate Pass', order: 3 }),
        expect.anything()
      );
      expect(customModulesRepo.upsertSchema).toHaveBeenCalledWith(
        schoolId,
        moduleId,
        expect.any(Array),
        expect.anything()
      );
      expect(settingsRepo.upsertSetting).toHaveBeenCalledWith(
        schoolId,
        'sidebar',
        { order: ['students', 'staff', moduleId] },
        expect.anything()
      );
      expect(auditRepo.createAuditLog).toHaveBeenCalled();
    });

    it('rejects duplicate module name on creation', async () => {
      vi.spyOn(customModulesRepo, 'findModuleByName').mockResolvedValue({ id: 'existing', name: 'Alumni' });

      await expect(
        customModulesService.createCustomModule(schoolId, { name: 'Alumni' })
      ).rejects.toThrow(ConflictError);
    });

    it('deletes module atomically, cascading schema, records, and sidebar order', async () => {
      vi.spyOn(customModulesRepo, 'findModuleById').mockResolvedValue({ id: moduleId, name: 'To Delete' });
      vi.spyOn(customModulesRepo, 'deleteRecordsByModule').mockResolvedValue({});
      vi.spyOn(customModulesRepo, 'deleteSchema').mockResolvedValue({});
      vi.spyOn(customModulesRepo, 'deleteModule').mockResolvedValue({});
      vi.spyOn(settingsRepo, 'findSetting').mockResolvedValue({
        data: { order: ['students', moduleId, 'staff'] }
      });
      vi.spyOn(settingsRepo, 'upsertSetting').mockResolvedValue({});
      vi.spyOn(auditRepo, 'createAuditLog').mockResolvedValue({});
      vi.spyOn(customModulesRepo, 'executeTransaction').mockImplementation(async (cb) => cb({}));

      const result = await customModulesService.deleteCustomModule(schoolId, moduleId);

      expect(result.success).toBe(true);
      expect(customModulesRepo.deleteRecordsByModule).toHaveBeenCalledWith(schoolId, moduleId, expect.anything());
      expect(customModulesRepo.deleteSchema).toHaveBeenCalledWith(schoolId, moduleId, expect.anything());
      expect(customModulesRepo.deleteModule).toHaveBeenCalledWith(schoolId, moduleId, expect.anything());
      expect(settingsRepo.upsertSetting).toHaveBeenCalledWith(
        schoolId,
        'sidebar',
        { order: ['students', 'staff'] },
        expect.anything()
      );
      expect(auditRepo.createAuditLog).toHaveBeenCalled();
    });
  });

  describe('2. Form Schemas', () => {
    it('returns stored schema with sections', async () => {
      vi.spyOn(customModulesRepo, 'findSchemaByModuleKey').mockResolvedValue({
        id: 'schema-1',
        moduleKey: moduleId,
        sections: [{ id: 'sec_1', title: 'Main', fields: [] }],
        updatedAt: new Date()
      });

      const schema = await customModulesService.getFormSchema(schoolId, moduleId);
      expect(schema.moduleKey).toBe(moduleId);
      expect(schema.sections.length).toBe(1);
    });

    it('returns default fallback schema for uncustomized core module', async () => {
      vi.spyOn(customModulesRepo, 'findSchemaByModuleKey').mockResolvedValue(null);

      const schema = await customModulesService.getFormSchema(schoolId, 'staff');
      expect(schema.moduleKey).toBe('staff');
      expect(schema.sections.length).toBeGreaterThan(0);
      expect(schema.isDefault).toBe(true);
    });

    it('normalizes legacy fields array on upsert', async () => {
      vi.spyOn(customModulesRepo, 'upsertSchema').mockResolvedValue({
        id: 'schema-1',
        moduleKey: 'students',
        sections: [{ id: 'default', title: 'Custom Details', fields: [{ id: 'f_1', label: 'Extra', type: 'text' }] }],
        updatedAt: new Date()
      });
      vi.spyOn(auditRepo, 'createAuditLog').mockResolvedValue({});

      const result = await customModulesService.upsertFormSchema(schoolId, 'students', {
        fields: [{ id: 'f_1', label: 'Extra', type: 'text' }]
      });

      expect(result.sections[0].title).toBe('Custom Details');
      expect(customModulesRepo.upsertSchema).toHaveBeenCalledWith(
        schoolId,
        'students',
        expect.arrayContaining([
          expect.objectContaining({ id: 'default', title: 'Custom Details' })
        ])
      );
    });
  });

  describe('3. Dynamic Record Validation & CRUD', () => {
    const mockSections = [
      {
        id: 'sec_1',
        title: 'General',
        fields: [
          { id: 'f_name', label: 'Full Name', type: 'text', required: true },
          { id: 'f_age', label: 'Age', type: 'number', required: false },
          { id: 'f_email', label: 'Email', type: 'email', required: true },
          { id: 'f_gender', label: 'Gender', type: 'select', required: true, options: 'Male, Female, Other' },
          { id: 'f_subscribed', label: 'Subscribed', type: 'checkbox', required: false }
        ]
      }
    ];

    it('validates a correct record against active schema', () => {
      const validData = {
        f_name: 'John Doe',
        f_age: 28,
        f_email: 'john@example.com',
        f_gender: 'Male',
        f_subscribed: true
      };

      expect(() =>
        customModulesService.validateRecordAgainstSchema(mockSections, validData)
      ).not.toThrow();
    });

    it('rejects record with unknown fields not defined in schema', () => {
      const maliciousData = {
        f_name: 'John Doe',
        f_email: 'john@example.com',
        f_gender: 'Male',
        injectedField: 'malicious payload'
      };

      expect(() =>
        customModulesService.validateRecordAgainstSchema(mockSections, maliciousData)
      ).toThrow(/Unknown field key: "injectedField"/);
    });

    it('rejects missing required fields', () => {
      const incompleteData = {
        f_age: 28,
        f_email: 'john@example.com',
        f_gender: 'Male'
        // missing f_name
      };

      expect(() =>
        customModulesService.validateRecordAgainstSchema(mockSections, incompleteData)
      ).toThrow(/Required field "Full Name" \(f_name\) cannot be empty/);
    });

    it('rejects invalid select options', () => {
      const invalidOptionData = {
        f_name: 'John Doe',
        f_email: 'john@example.com',
        f_gender: 'InvalidOption'
      };

      expect(() =>
        customModulesService.validateRecordAgainstSchema(mockSections, invalidOptionData)
      ).toThrow(/Invalid option "InvalidOption"/);
    });

    it('rejects malformed email format', () => {
      const invalidEmailData = {
        f_name: 'John Doe',
        f_email: 'not-an-email',
        f_gender: 'Female'
      };

      expect(() =>
        customModulesService.validateRecordAgainstSchema(mockSections, invalidEmailData)
      ).toThrow(/must be a valid email address/);
    });

    it('creates record after successful schema validation', async () => {
      vi.spyOn(customModulesRepo, 'findModuleById').mockResolvedValue({ id: moduleId, name: 'Passes' });
      vi.spyOn(customModulesRepo, 'findSchemaByModuleKey').mockResolvedValue({
        id: 'schema-1',
        moduleKey: moduleId,
        sections: mockSections
      });
      vi.spyOn(customModulesRepo, 'createRecord').mockResolvedValue({
        id: recordId,
        schoolId,
        customModuleId: moduleId,
        data: { f_name: 'Jane Doe', f_email: 'jane@example.com', f_gender: 'Female' }
      });
      vi.spyOn(auditRepo, 'createAuditLog').mockResolvedValue({});

      const record = await customModulesService.createModuleRecord(
        schoolId,
        moduleId,
        { f_name: 'Jane Doe', f_email: 'jane@example.com', f_gender: 'Female' },
        { id: 'user-1', email: 'admin@school.com' }
      );

      expect(record.id).toBe(recordId);
      expect(customModulesRepo.createRecord).toHaveBeenCalled();
      expect(auditRepo.createAuditLog).toHaveBeenCalled();
    });
  });
});
