import { describe, it, expect } from 'vitest';
import * as examSchemas from '../../../src/modules/exams/exam.schemas.js';

describe('Examination Zod Schemas Unit Tests', () => {
  const validUUID = 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d';

  describe('createExamSchema', () => {
    it('passes validation with valid complete payload', () => {
      const payload = {
        name: 'Midterm Examination 2026',
        term: 'Term 1',
        academicYear: '2026-2027',
        startDate: '2026-10-01',
        endDate: '2026-10-10'
      };

      const result = examSchemas.createExamSchema.body.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.name).toBe('Midterm Examination 2026');
      expect(result.data.term).toBe('Term 1');
    });

    it('passes validation with minimal required payload (name only)', () => {
      const payload = {
        name: 'Chapter Quiz'
      };

      const result = examSchemas.createExamSchema.body.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.name).toBe('Chapter Quiz');
    });

    it('fails when name is missing or empty', () => {
      const result1 = examSchemas.createExamSchema.body.safeParse({});
      expect(result1.success).toBe(false);

      const result2 = examSchemas.createExamSchema.body.safeParse({ name: '   ' });
      expect(result2.success).toBe(false);
    });

    it('fails when name exceeds 150 characters', () => {
      const result = examSchemas.createExamSchema.body.safeParse({
        name: 'A'.repeat(151)
      });
      expect(result.success).toBe(false);
    });

    it('fails when startDate is after endDate', () => {
      const payload = {
        name: 'Invalid Date Exam',
        startDate: '2026-10-15',
        endDate: '2026-10-10'
      };

      const result = examSchemas.createExamSchema.body.safeParse(payload);
      expect(result.success).toBe(false);
      expect(result.error.errors[0].message).toContain('Start date cannot be after end date');
    });

    it('fails on invalid date format', () => {
      const payload = {
        name: 'Invalid Date Format Exam',
        startDate: '01-10-2026'
      };

      const result = examSchemas.createExamSchema.body.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('updateExamSchema', () => {
    it('passes validation with partial updates', () => {
      const payload = {
        name: 'Updated Midterm Name',
        term: 'Term 2'
      };

      const result = examSchemas.updateExamSchema.body.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.name).toBe('Updated Midterm Name');
      expect(result.data.term).toBe('Term 2');
    });

    it('validates UUID param format', () => {
      const validResult = examSchemas.updateExamSchema.params.safeParse({ id: validUUID });
      expect(validResult.success).toBe(true);

      const invalidResult = examSchemas.updateExamSchema.params.safeParse({ id: 'not-a-uuid' });
      expect(invalidResult.success).toBe(false);
    });

    it('fails when updating with invalid date ranges', () => {
      const payload = {
        startDate: '2026-11-20',
        endDate: '2026-11-10'
      };

      const result = examSchemas.updateExamSchema.body.safeParse(payload);
      expect(result.success).toBe(false);
      expect(result.error.errors[0].message).toContain('Start date cannot be after end date');
    });
  });

  describe('listExamsSchema', () => {
    it('coerces and validates query parameters correctly', () => {
      const query = {
        page: '2',
        limit: '50',
        search: 'Annual',
        term: 'Term 1',
        academicYear: '2026-2027',
        order: 'asc'
      };

      const result = examSchemas.listExamsSchema.query.safeParse(query);
      expect(result.success).toBe(true);
      expect(result.data.page).toBe(2);
      expect(result.data.limit).toBe(50);
      expect(result.data.order).toBe('asc');
    });

    it('rejects invalid order enum values', () => {
      const query = {
        order: 'invalid_order'
      };

      const result = examSchemas.listExamsSchema.query.safeParse(query);
      expect(result.success).toBe(false);
    });
  });
});
