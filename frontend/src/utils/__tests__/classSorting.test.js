import { describe, it, expect } from 'vitest';
import {
  getSectionName,
  formatClassSection,
  sortClassesAscending,
  sortSectionsAscending
} from '../classSorting';

describe('classSorting Utility & BUG-007 Section Formatting Tests', () => {
  describe('getSectionName', () => {
    it('handles null, undefined, or empty inputs', () => {
      expect(getSectionName(null)).toBe('');
      expect(getSectionName(undefined)).toBe('');
      expect(getSectionName('')).toBe('');
      expect(getSectionName({})).toBe('');
    });

    it('extracts string section directly', () => {
      expect(getSectionName('A')).toBe('A');
      expect(getSectionName(' Section B ')).toBe('Section B');
    });

    it('extracts section name from section object { id, name, code }', () => {
      expect(getSectionName({ id: 'sec-1', name: 'A', code: 'SEC-A' })).toBe('A');
      expect(getSectionName({ id: 'sec-2', code: 'B' })).toBe('B');
    });

    it('extracts section name from class object with section string', () => {
      expect(getSectionName({ name: 'I Standard', section: 'A' })).toBe('A');
    });

    it('extracts section name from class object with section object', () => {
      expect(getSectionName({ name: 'I Standard', section: { id: 's-1', name: 'A' } })).toBe('A');
    });

    it('extracts section name from class object with sectionName property', () => {
      expect(getSectionName({ name: 'I Standard', sectionName: 'A' })).toBe('A');
    });

    it('extracts section name from class object with sections array (single section)', () => {
      const cls = {
        id: 'c-1',
        name: 'I Standard',
        sections: [{ id: 's-1', name: 'A' }]
      };
      expect(getSectionName(cls)).toBe('A');
    });

    it('extracts comma-separated section names from class object with multiple sections', () => {
      const cls = {
        id: 'c-1',
        name: 'I Standard',
        sections: [{ id: 's-1', name: 'A' }, { id: 's-2', name: 'B' }]
      };
      expect(getSectionName(cls)).toBe('A, B');
    });

    it('returns empty string when sections array is empty', () => {
      const cls = {
        id: 'c-1',
        name: 'I Standard',
        sections: []
      };
      expect(getSectionName(cls)).toBe('');
    });
  });

  describe('formatClassSection', () => {
    it('returns empty string for null or undefined input', () => {
      expect(formatClassSection(null)).toBe('');
      expect(formatClassSection(undefined)).toBe('');
    });

    it('returns plain string input as-is', () => {
      expect(formatClassSection('I Standard - Section A')).toBe('I Standard - Section A');
    });

    it('formats class with single section in sections array as "Class – Section X"', () => {
      const cls = {
        id: 'c-1',
        name: 'I Standard',
        sections: [{ id: 's-1', name: 'A' }]
      };
      expect(formatClassSection(cls)).toBe('I Standard - Section A');
    });

    it('formats class with section property as "Class – Section X"', () => {
      const cls = {
        id: 'c-1',
        name: 'I Standard',
        section: 'A'
      };
      expect(formatClassSection(cls)).toBe('I Standard - Section A');
    });

    it('formats class with multiple sections in sections array', () => {
      const cls = {
        id: 'c-1',
        name: 'I Standard',
        sections: [{ id: 's-1', name: 'A' }, { id: 's-2', name: 'B' }]
      };
      expect(formatClassSection(cls)).toBe('I Standard - Section A, B');
    });

    it('formats class without sections as just className', () => {
      const cls = {
        id: 'c-1',
        name: 'I Standard',
        sections: []
      };
      expect(formatClassSection(cls)).toBe('I Standard');
    });

    it('prevents duplicating section if className already contains the section', () => {
      const cls1 = {
        name: 'I Standard - Section A',
        section: 'A'
      };
      expect(formatClassSection(cls1)).toBe('I Standard - Section A');

      const cls2 = {
        name: 'I Standard - A',
        section: 'A'
      };
      expect(formatClassSection(cls2)).toBe('I Standard - A');
    });
  });

  describe('sortClassesAscending', () => {
    it('sorts classes in natural ascending order by name and section', () => {
      const input = [
        { name: 'Class 10', sections: [{ name: 'A' }] },
        { name: 'Class 1', sections: [{ name: 'B' }] },
        { name: 'Class 1', sections: [{ name: 'A' }] },
        { name: 'Class 2', sections: [{ name: 'A' }] },
        { name: 'Nursery', sections: [{ name: 'A' }] }
      ];

      const sorted = sortClassesAscending(input);
      expect(sorted.map(c => formatClassSection(c))).toEqual([
        'Class 1 - Section A',
        'Class 1 - Section B',
        'Class 2 - Section A',
        'Class 10 - Section A',
        'Nursery - Section A'
      ]);
    });

    it('handles empty or non-array inputs gracefully', () => {
      expect(sortClassesAscending([])).toEqual([]);
      expect(sortClassesAscending(null)).toEqual([]);
    });
  });

  describe('sortSectionsAscending', () => {
    it('sorts section strings and objects in natural ascending order', () => {
      const sections = ['C', 'A', '10', 'B', '2'];
      expect(sortSectionsAscending(sections)).toEqual(['2', '10', 'A', 'B', 'C']);

      const sectionObjs = [{ name: 'C' }, { name: 'A' }, { name: 'B' }];
      expect(sortSectionsAscending(sectionObjs)).toEqual([{ name: 'A' }, { name: 'B' }, { name: 'C' }]);
    });
  });
});
