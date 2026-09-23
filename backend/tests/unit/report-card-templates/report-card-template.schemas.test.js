import { describe, it, expect } from 'vitest';
import {
  templateTypeSchema,
  templateConfigSchema,
  saveReportCardTemplateSchema,
  getReportCardTemplateSchema
} from '../../../src/modules/report-card-templates/report-card-template.schemas.js';

describe('ReportCardTemplate Schema Validation Unit Tests (Phase 4C.7-C Batch 1)', () => {
  describe('1. Template Type Validation', () => {
    it('accepts valid templateType "report_card"', () => {
      const result = templateTypeSchema.safeParse('report_card');
      expect(result.success).toBe(true);
      expect(result.data).toBe('report_card');
    });

    it('defaults undefined templateType to "report_card"', () => {
      const result = templateTypeSchema.safeParse(undefined);
      expect(result.success).toBe(true);
      expect(result.data).toBe('report_card');
    });

    it('rejects empty templateType string', () => {
      const result = templateTypeSchema.safeParse('');
      expect(result.success).toBe(false);
    });

    it('rejects special characters in templateType', () => {
      const result = templateTypeSchema.safeParse('report/card$invalid');
      expect(result.success).toBe(false);
    });
  });

  describe('2. Template Configuration Schema', () => {
    it('validates a complete valid legacy configuration', () => {
      const validConfig = {
        themeColor: '#c99bc1',
        header: {
          showLogo: true,
          showAddress: true,
          showPhone: true,
          showEmail: true,
          title: 'PROGRESS REPORT',
          subtitle: 'Academic Session 2026-2027'
        },
        studentFields: {
          admissionNo: true,
          dob: true,
          fatherName: true,
          motherName: true,
          attendance: true
        },
        grading: {
          style: 'marks_and_grades',
          showTotal: true,
          showPercentage: true,
          showRank: false
        },
        footer: {
          signatures: ['Class Teacher', 'Principal', 'Parent'],
          gradingScaleText: 'A1: 91-100 | A2: 81-90',
          remarks: true
        }
      };

      const result = templateConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
      expect(result.data.themeColor).toBe('#c99bc1');
      expect(result.data.grading.style).toBe('marks_and_grades');
    });

    it('accepts partial config with minimal fields', () => {
      const partialConfig = {
        themeColor: '#3b82f6',
        header: {
          title: 'CUSTOM REPORT'
        }
      };

      const result = templateConfigSchema.safeParse(partialConfig);
      expect(result.success).toBe(true);
      expect(result.data.header.title).toBe('CUSTOM REPORT');
    });

    it('preserves unknown custom properties (passthrough compatibility)', () => {
      const extendedConfig = {
        themeColor: '#10b981',
        customField: 'customValue',
        header: {
          title: 'REPORT',
          customHeaderProp: 123
        }
      };

      const result = templateConfigSchema.safeParse(extendedConfig);
      expect(result.success).toBe(true);
      expect(result.data.customField).toBe('customValue');
      expect(result.data.header.customHeaderProp).toBe(123);
    });

    it('rejects invalid themeColor hex format', () => {
      const invalidColor = {
        themeColor: 'blue-color-not-hex'
      };

      const result = templateConfigSchema.safeParse(invalidColor);
      expect(result.success).toBe(false);
      expect(result.error.errors[0].message).toContain('Theme color must be a valid hex color code');
    });

    it('rejects invalid grading style value', () => {
      const invalidGrading = {
        grading: {
          style: 'invalid_grading_style'
        }
      };

      const result = templateConfigSchema.safeParse(invalidGrading);
      expect(result.success).toBe(false);
      expect(result.error.errors[0].message).toContain('Grading style must be');
    });

    it('rejects non-object config payloads', () => {
      expect(templateConfigSchema.safeParse('string-config').success).toBe(false);
      expect(templateConfigSchema.safeParse(123).success).toBe(false);
      expect(templateConfigSchema.safeParse(null).success).toBe(false);
    });

    it('validates header field type safety (booleans and strings)', () => {
      const invalidHeader = {
        header: {
          showLogo: 'not-a-boolean',
          title: 12345
        }
      };
      const result = templateConfigSchema.safeParse(invalidHeader);
      expect(result.success).toBe(false);
    });

    it('validates studentFields boolean constraints', () => {
      const invalidStudentFields = {
        studentFields: {
          admissionNo: 'true_string_invalid'
        }
      };
      const result = templateConfigSchema.safeParse(invalidStudentFields);
      expect(result.success).toBe(false);
    });

    it('validates footer signatures array and gradingScaleText max length', () => {
      const validFooter = {
        footer: {
          signatures: ['Principal', 'Teacher'],
          gradingScaleText: 'A: 90-100',
          remarks: true
        }
      };
      expect(templateConfigSchema.safeParse(validFooter).success).toBe(true);

      const invalidSignatures = {
        footer: {
          signatures: new Array(15).fill('Signature Title') // max 10
        }
      };
      expect(templateConfigSchema.safeParse(invalidSignatures).success).toBe(false);
    });
  });

  describe('3. Request Envelope Schemas & Protected Fields', () => {
    it('validates saveReportCardTemplateSchema body wrapper', () => {
      const payload = {
        config: {
          themeColor: '#3b82f6'
        }
      };

      const result = saveReportCardTemplateSchema.body.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('rejects saveReportCardTemplateSchema with missing config in body', () => {
      const payload = {};
      const result = saveReportCardTemplateSchema.body.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('validates getReportCardTemplateSchema params wrapper', () => {
      const params = {
        templateType: 'report_card'
      };

      const result = getReportCardTemplateSchema.params.safeParse(params);
      expect(result.success).toBe(true);
    });
  });
});
