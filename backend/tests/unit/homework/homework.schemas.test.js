import { describe, it, expect } from 'vitest';
import * as schemas from '../../../src/modules/homework/homework.schemas.js';

describe('Unit: Homework Schemas Tests — Phase 4C.7-D.2-I-M.1', () => {
  const VALID_UUID = '11111111-1111-4111-8111-111111111111';
  const VALID_UUID_2 = '22222222-2222-4222-8222-222222222222';

  describe('1. createHomeworkSchema', () => {
    it('validates a correct payload', () => {
      const validData = {
        title: 'Math Assignment 1',
        description: 'Complete all odd exercises',
        classId: VALID_UUID,
        subjectId: VALID_UUID_2,
        dueDate: '2026-09-30',
        remarks: 'Show calculation steps',
        maxMarks: 50,
        attachments: [
          {
            name: 'math.pdf',
            url: 'https://example.com/math.pdf',
            size: 1024,
            type: 'application/pdf'
          }
        ]
      };

      const result = schemas.createHomeworkSchema.body.safeParse(validData);
      expect(result.success).toBe(true);
      expect(result.data.title).toBe('Math Assignment 1');
      expect(result.data.dueDate).toBe('2026-09-30');
    });

    it('rejects an invalid calendar date in dueDate', () => {
      const invalidData = {
        title: 'Math Assignment 1',
        classId: VALID_UUID,
        subjectId: VALID_UUID_2,
        dueDate: '2026-02-30' // Feb 30 does not exist
      };

      const result = schemas.createHomeworkSchema.body.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('rejects non-UUID classId or subjectId', () => {
      const invalidData = {
        title: 'Math Assignment 1',
        classId: 'invalid-id',
        subjectId: VALID_UUID_2,
        dueDate: '2026-09-30'
      };

      const result = schemas.createHomeworkSchema.body.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('rejects empty title', () => {
      const invalidData = {
        title: '   ',
        classId: VALID_UUID,
        subjectId: VALID_UUID_2,
        dueDate: '2026-09-30'
      };

      const result = schemas.createHomeworkSchema.body.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('2. updateStudentHomeworkStatusSchema', () => {
    it('accepts all 4 valid statuses', () => {
      for (const status of ['Not Started', 'In Progress', 'Completed', 'Submitted']) {
        const result = schemas.updateStudentHomeworkStatusSchema.body.safeParse({ status });
        expect(result.success).toBe(true);
        expect(result.data.status).toBe(status);
      }
    });

    it('rejects unknown status strings', () => {
      const result = schemas.updateStudentHomeworkStatusSchema.body.safeParse({ status: 'Finished' });
      expect(result.success).toBe(false);
    });

    it('validates params format', () => {
      const validParams = {
        studentId: VALID_UUID,
        homeworkId: VALID_UUID_2
      };
      const result = schemas.updateStudentHomeworkStatusSchema.params.safeParse(validParams);
      expect(result.success).toBe(true);
    });
  });

  describe('3. updateSubmissionSchema', () => {
    it('validates staff grade and feedback update', () => {
      const validData = {
        status: 'Submitted',
        grade: 'A+',
        feedback: 'Excellent work'
      };

      const result = schemas.updateSubmissionSchema.body.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('rejects grade exceeding 10 characters', () => {
      const invalidData = {
        grade: 'GRADE_EXCEEDING_LIMIT_123'
      };

      const result = schemas.updateSubmissionSchema.body.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('rejects completely empty submission update object', () => {
      const result = schemas.updateSubmissionSchema.body.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});
