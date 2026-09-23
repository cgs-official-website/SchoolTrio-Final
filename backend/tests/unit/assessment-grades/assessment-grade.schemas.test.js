import { describe, it, expect } from 'vitest';
import * as assessmentGradeSchemas from '../../../src/modules/assessment-grades/assessment-grade.schemas.js';

describe('Assessment Grade Zod Schemas Unit Tests (Phase 4C.7-B Batch 1)', () => {
  const validUUID = 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d';
  const studentUUID = 'b2c3d4e5-f6a7-4b8c-8d0e-1f2a3b4c5d6e';

  describe('upsertSingleGradeSchema', () => {
    it('passes validation with valid integer marks', () => {
      const payload = {
        marksObtained: 85,
        remarks: 'Good progress'
      };

      const result = assessmentGradeSchemas.upsertSingleGradeSchema.body.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.marksObtained).toBe(85);
      expect(result.data.remarks).toBe('Good progress');
    });

    it('passes validation with valid 1-decimal and 2-decimal marks', () => {
      const result1 = assessmentGradeSchemas.upsertSingleGradeSchema.body.safeParse({ marksObtained: 45.5 });
      expect(result1.success).toBe(true);
      expect(result1.data.marksObtained).toBe(45.5);

      const result2 = assessmentGradeSchemas.upsertSingleGradeSchema.body.safeParse({ marksObtained: '87.25' });
      expect(result2.success).toBe(true);
      expect(result2.data.marksObtained).toBe(87.25);
    });

    it('passes validation for zero (0) as a legitimate mark', () => {
      const result = assessmentGradeSchemas.upsertSingleGradeSchema.body.safeParse({ marksObtained: 0 });
      expect(result.success).toBe(true);
      expect(result.data.marksObtained).toBe(0);
    });

    it('passes validation for maximum boundary 999.99', () => {
      const result = assessmentGradeSchemas.upsertSingleGradeSchema.body.safeParse({ marksObtained: 999.99 });
      expect(result.success).toBe(true);
      expect(result.data.marksObtained).toBe(999.99);
    });

    it('fails when marksObtained is negative', () => {
      const result = assessmentGradeSchemas.upsertSingleGradeSchema.body.safeParse({ marksObtained: -1 });
      expect(result.success).toBe(false);
    });

    it('fails when marksObtained exceeds 999.99', () => {
      const result = assessmentGradeSchemas.upsertSingleGradeSchema.body.safeParse({ marksObtained: 1000 });
      expect(result.success).toBe(false);
    });

    it('fails when marksObtained has more than 2 decimal places', () => {
      const result = assessmentGradeSchemas.upsertSingleGradeSchema.body.safeParse({ marksObtained: 87.555 });
      expect(result.success).toBe(false);
    });

    it('fails on non-numeric marks string', () => {
      const result = assessmentGradeSchemas.upsertSingleGradeSchema.body.safeParse({ marksObtained: 'abc' });
      expect(result.success).toBe(false);
    });

    it('accepts null or omitted remarks', () => {
      const result1 = assessmentGradeSchemas.upsertSingleGradeSchema.body.safeParse({ marksObtained: 50, remarks: null });
      expect(result1.success).toBe(true);
      expect(result1.data.remarks).toBeNull();

      const result2 = assessmentGradeSchemas.upsertSingleGradeSchema.body.safeParse({ marksObtained: 50 });
      expect(result2.success).toBe(true);
      expect(result2.data.remarks).toBeUndefined();
    });

    it('validates UUID params', () => {
      const valid = assessmentGradeSchemas.upsertSingleGradeSchema.params.safeParse({
        assessmentId: validUUID,
        studentId: studentUUID
      });
      expect(valid.success).toBe(true);

      const invalid = assessmentGradeSchemas.upsertSingleGradeSchema.params.safeParse({
        assessmentId: 'bad-uuid',
        studentId: studentUUID
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe('bulkUpsertGradesSchema', () => {
    it('passes validation for valid array of grades', () => {
      const payload = {
        grades: [
          { studentId: studentUUID, marksObtained: 45 },
          { studentId: validUUID, marksObtained: 88.5, remarks: 'Well done' }
        ]
      };

      const result = assessmentGradeSchemas.bulkUpsertGradesSchema.body.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.grades).toHaveLength(2);
    });

    it('fails when grades array is empty', () => {
      const result = assessmentGradeSchemas.bulkUpsertGradesSchema.body.safeParse({ grades: [] });
      expect(result.success).toBe(false);
      expect(result.error.errors[0].message).toContain('at least one item');
    });

    it('fails when any item has an invalid student UUID or invalid mark', () => {
      const payload = {
        grades: [
          { studentId: 'not-a-uuid', marksObtained: 45 },
          { studentId: validUUID, marksObtained: 88.555 }
        ]
      };

      const result = assessmentGradeSchemas.bulkUpsertGradesSchema.body.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });
});
