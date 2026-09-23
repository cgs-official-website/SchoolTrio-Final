import { describe, it, expect } from 'vitest';
import {
  slugifyRoleName,
  normalizePermissions,
  DEFAULT_ROLES,
  DEFAULT_ROLE_NAMES,
  DEFAULT_ROLE_SLUGS,
  CANONICAL_MODULE_KEYS,
  CANONICAL_MODULE_SET
} from '../../../src/modules/rbac/rbac.constants.js';
import { ValidationError } from '../../../src/utils/app-error.js';

describe('RBAC Constants & Slugification Unit Tests', () => {
  describe('Default Roles Verification', () => {
    it('contains exactly 15 verified institutional default roles', () => {
      expect(DEFAULT_ROLES).toHaveLength(15);
      expect(DEFAULT_ROLE_NAMES).toHaveLength(15);
      expect(DEFAULT_ROLE_SLUGS).toHaveLength(15);
    });

    it('matches exact default role names', () => {
      const expectedNames = [
        'Correspondent',
        'Principal',
        'Vice Principal',
        'Subject Wise Head',
        'Class Incharge',
        'Staffs',
        'Administrative Officer',
        'Finance Department',
        'Library',
        'Canteen',
        'Transport',
        'Janitors',
        'Hostel',
        'Inventory',
        'Security'
      ];
      expect(DEFAULT_ROLE_NAMES).toEqual(expectedNames);
    });

    it('all default roles are flagged with isSystemDefault: true', () => {
      for (const role of DEFAULT_ROLES) {
        expect(role.isSystemDefault).toBe(true);
        expect(['admin', 'teacher']).toContain(role.loginPanel);
      }
    });
  });

  describe('Canonical Module Keys Verification', () => {
    it('contains 32 canonical module keys', () => {
      expect(CANONICAL_MODULE_KEYS).toHaveLength(32);
      expect(CANONICAL_MODULE_SET.has('classes')).toBe(true);
      expect(CANONICAL_MODULE_SET.has('students')).toBe(true);
      expect(CANONICAL_MODULE_SET.has('lesson_plans')).toBe(true);
      expect(CANONICAL_MODULE_SET.has('fees')).toBe(true);
      expect(CANONICAL_MODULE_SET.has('billing')).toBe(true);
    });
  });

  describe('slugifyRoleName()', () => {
    it('converts basic role names to lowercase hyphenated slugs', () => {
      expect(slugifyRoleName('Finance Department')).toBe('finance-department');
      expect(slugifyRoleName('Class Incharge')).toBe('class-incharge');
      expect(slugifyRoleName('Subject Wise Head')).toBe('subject-wise-head');
      expect(slugifyRoleName('Vice Principal')).toBe('vice-principal');
    });

    it('handles special characters, punctuation and apostrophes', () => {
      expect(slugifyRoleName("Teacher's Assistant")).toBe('teachers-assistant');
      expect(slugifyRoleName('Senior (Grade 10) Coordinator')).toBe('senior-grade-10-coordinator');
      expect(slugifyRoleName('IT & Media Specialist!')).toBe('it-media-specialist');
      expect(slugifyRoleName('Role / Dept & Team')).toBe('role-dept-team');
    });

    it('trims leading and trailing whitespace and hyphens', () => {
      expect(slugifyRoleName('  Library Assistant  ')).toBe('library-assistant');
      expect(slugifyRoleName('---Admin---')).toBe('admin');
      expect(slugifyRoleName('  --Hostel Warden--  ')).toBe('hostel-warden');
    });

    it('collapses multiple consecutive spaces and hyphens', () => {
      expect(slugifyRoleName('Lab    Attendant   Special')).toBe('lab-attendant-special');
      expect(slugifyRoleName('Lab---Attendant---Special')).toBe('lab-attendant-special');
    });

    it('throws ValidationError when input is empty, null, or whitespace only', () => {
      expect(() => slugifyRoleName('')).toThrow(ValidationError);
      expect(() => slugifyRoleName('   ')).toThrow(ValidationError);
      expect(() => slugifyRoleName(null)).toThrow(ValidationError);
      expect(() => slugifyRoleName(undefined)).toThrow(ValidationError);
    });

    it('throws ValidationError when name consists solely of special characters', () => {
      expect(() => slugifyRoleName('!@#$%^&*()')).toThrow(ValidationError);
      expect(() => slugifyRoleName('---')).toThrow(ValidationError);
    });

    it('truncates slugs exceeding 100 characters safely', () => {
      const longName = 'A'.repeat(120);
      const slug = slugifyRoleName(longName);
      expect(slug.length).toBe(100);
    });
  });

  describe('normalizePermissions()', () => {
    it('returns empty array when input is null or undefined', () => {
      expect(normalizePermissions(null)).toEqual([]);
      expect(normalizePermissions(undefined)).toEqual([]);
    });

    it('enforces Rule 1: canCreate=true implies canRead=true', () => {
      const input = {
        classes: { canRead: false, canCreate: true, canEdit: false, canDelete: false }
      };
      const result = normalizePermissions(input);
      expect(result).toEqual([
        { moduleKey: 'classes', canRead: true, canCreate: true, canEdit: false, canDelete: false }
      ]);
    });

    it('enforces Rule 1: canEdit=true implies canRead=true', () => {
      const input = {
        students: { canRead: false, canCreate: false, canEdit: true, canDelete: false }
      };
      const result = normalizePermissions(input);
      expect(result).toEqual([
        { moduleKey: 'students', canRead: true, canCreate: false, canEdit: true, canDelete: false }
      ]);
    });

    it('enforces Rule 1: canDelete=true implies canRead=true', () => {
      const input = {
        fees: { canRead: false, canCreate: false, canEdit: false, canDelete: true }
      };
      const result = normalizePermissions(input);
      expect(result).toEqual([
        { moduleKey: 'fees', canRead: true, canCreate: false, canEdit: false, canDelete: true }
      ]);
    });

    it('enforces Rule 2: canRead=false clears all write permissions', () => {
      const input = {
        library: { canRead: false, canCreate: false, canEdit: false, canDelete: false }
      };
      const result = normalizePermissions(input);
      expect(result).toEqual([
        { moduleKey: 'library', canRead: false, canCreate: false, canEdit: false, canDelete: false }
      ]);
    });

    it('supports array input format with legacy property names (read, create, edit, delete)', () => {
      const input = [
        { moduleKey: 'attendance', read: true, create: false, edit: true, delete: false },
        { moduleKey: 'homework', read: false, create: true, edit: false, delete: false }
      ];
      const result = normalizePermissions(input);
      expect(result).toEqual([
        { moduleKey: 'attendance', canRead: true, canCreate: false, canEdit: true, canDelete: false },
        { moduleKey: 'homework', canRead: true, canCreate: true, canEdit: false, canDelete: false }
      ]);
    });
  });
});
