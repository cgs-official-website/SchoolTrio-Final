import { describe, it, expect } from 'vitest';
import * as schemas from '../../../src/modules/custom-modules/custom-modules.schemas.js';

describe('Custom Modules & Form Builder Schemas Unit Tests', () => {
  describe('1. Field & Section Schemas', () => {
    it('accepts all 8 permitted field types', () => {
      const fieldTypes = ['text', 'number', 'email', 'date', 'select', 'checkbox', 'relation', 'file'];
      for (const type of fieldTypes) {
        const result = schemas.fieldSchema.safeParse({
          id: `field_${type}`,
          label: `${type} Field`,
          type,
          required: true,
          options: type === 'select' ? 'Option 1, Option 2' : '',
          relationModule: type === 'relation' ? 'staff' : ''
        });
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid or dangerous field types', () => {
      const invalidTypes = ['dangerousComponent', 'script', 'eval', 'ReactComponent', 'dropdown'];
      for (const type of invalidTypes) {
        const result = schemas.fieldSchema.safeParse({
          id: 'field_invalid',
          label: 'Invalid Field',
          type
        });
        expect(result.success).toBe(false);
      }
    });

    it('rejects missing or empty field id or label', () => {
      const res1 = schemas.fieldSchema.safeParse({ id: '', label: 'Label', type: 'text' });
      const res2 = schemas.fieldSchema.safeParse({ id: 'f_1', label: '', type: 'text' });
      expect(res1.success).toBe(false);
      expect(res2.success).toBe(false);
    });

    it('accepts a valid section containing multiple fields', () => {
      const result = schemas.sectionSchema.safeParse({
        id: 'sec_1',
        title: 'Personal Info',
        fields: [
          { id: 'f_1', label: 'First Name', type: 'text', required: true },
          { id: 'f_2', label: 'Age', type: 'number', required: false }
        ]
      });
      expect(result.success).toBe(true);
    });

    it('rejects sections with empty titles', () => {
      const result = schemas.sectionSchema.safeParse({
        id: 'sec_1',
        title: '',
        fields: []
      });
      expect(result.success).toBe(false);
    });
  });

  describe('2. Upsert Form Schema Schema', () => {
    it('validates schema with sections array', () => {
      const result = schemas.rawUpsertFormSchemaSchema.safeParse({
        sections: [
          {
            id: 'sec_main',
            title: 'Main Details',
            fields: [{ id: 'f_title', label: 'Title', type: 'text', required: true }]
          }
        ]
      });
      expect(result.success).toBe(true);
    });

    it('validates legacy schema with top-level fields array', () => {
      const result = schemas.rawUpsertFormSchemaSchema.safeParse({
        fields: [
          { id: 'f_legacy_1', label: 'Legacy Field', type: 'text', required: false }
        ]
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty payload containing neither sections nor fields', () => {
      const result = schemas.rawUpsertFormSchemaSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('3. Custom Module Metadata Schemas', () => {
    it('validates valid module creation input', () => {
      const result = schemas.rawCreateCustomModuleSchema.safeParse({
        name: 'Alumni Network',
        icon: 'GraduationCap',
        order: 2
      });
      expect(result.success).toBe(true);
      expect(result.data.name).toBe('Alumni Network');
    });

    it('rejects empty module name on creation', () => {
      const result = schemas.rawCreateCustomModuleSchema.safeParse({
        name: '   '
      });
      expect(result.success).toBe(false);
    });

    it('validates module update input with partial fields', () => {
      const result = schemas.rawUpdateCustomModuleSchema.safeParse({
        name: 'Renamed Module',
        order: 5,
        isActive: false
      });
      expect(result.success).toBe(true);
      expect(result.data.isActive).toBe(false);
    });
  });

  describe('4. Prototype Pollution Checker', () => {
    it('throws error when __proto__ key is present', () => {
      const dangerousObj = JSON.parse('{"__proto__": {"polluted": true}, "name": "Safe"}');
      expect(() => schemas.checkPrototypePollution(dangerousObj)).toThrow(/Forbidden property key/);
    });

    it('throws error when constructor key is present in nested object', () => {
      const dangerousObj = {
        nested: {
          constructor: { polluted: true }
        }
      };
      expect(() => schemas.checkPrototypePollution(dangerousObj)).toThrow(/Forbidden property key/);
    });

    it('passes for safe clean objects', () => {
      const safeObj = {
        name: 'Clean Module',
        sections: [{ id: 'sec_1', title: 'Details', fields: [] }]
      };
      expect(() => schemas.checkPrototypePollution(safeObj)).not.toThrow();
    });
  });
});
