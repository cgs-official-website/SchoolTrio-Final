import { describe, it, expect } from 'vitest';
import * as assessmentSchemas from '../../../src/modules/assessments/assessment.schemas.js';

describe('Assessment Zod Schemas Unit Tests', () => {
  const validUUID = 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d';
  const classUUID = 'b2c3d4e5-f6a7-4b8c-8d0e-1f2a3b4c5d6e';
  const examUUID = 'c3d4e5f6-a7b8-4c9d-8e1f-2a3b4c5d6e7f';
  const subjectUUID = 'd4e5f6a7-b8c9-4d0e-8f2a-3b4c5d6e7f8a';

  describe('createAssessmentSchema', () => {
    it('passes validation with full valid payload', () => {
      const payload = {
        title: 'Midterm Science Quiz',
        classId: classUUID,
        totalMarks: 50,
        passingMarks: 18,
        date: '2026-09-12',
        examId: examUUID,
        subjectId: subjectUUID
      };

      const result = assessmentSchemas.createAssessmentSchema.body.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.title).toBe('Midterm Science Quiz');
      expect(result.data.totalMarks).toBe(50);
      expect(result.data.passingMarks).toBe(18);
    });

    it('passes validation with minimal required payload (title, classId, totalMarks)', () => {
      const payload = {
        title: 'Weekly Math Test',
        classId: classUUID,
        totalMarks: 100
      };

      const result = assessmentSchemas.createAssessmentSchema.body.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.title).toBe('Weekly Math Test');
      expect(result.data.classId).toBe(classUUID);
      expect(result.data.totalMarks).toBe(100);
      expect(result.data.subjectId).toBeUndefined();
      expect(result.data.examId).toBeUndefined();
    });

    it('fails when title is missing or empty', () => {
      const result1 = assessmentSchemas.createAssessmentSchema.body.safeParse({
        classId: classUUID,
        totalMarks: 50
      });
      expect(result1.success).toBe(false);

      const result2 = assessmentSchemas.createAssessmentSchema.body.safeParse({
        title: '   ',
        classId: classUUID,
        totalMarks: 50
      });
      expect(result2.success).toBe(false);
    });

    it('fails when totalMarks is 0 or negative', () => {
      const result1 = assessmentSchemas.createAssessmentSchema.body.safeParse({
        title: 'Test',
        classId: classUUID,
        totalMarks: 0
      });
      expect(result1.success).toBe(false);

      const result2 = assessmentSchemas.createAssessmentSchema.body.safeParse({
        title: 'Test',
        classId: classUUID,
        totalMarks: -10
      });
      expect(result2.success).toBe(false);
    });

    it('accepts valid optional passingMarks', () => {
      const payload = {
        title: 'Quiz',
        classId: classUUID,
        totalMarks: 50,
        passingMarks: 20
      };

      const result = assessmentSchemas.createAssessmentSchema.body.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.passingMarks).toBe(20);
    });

    it('fails on malformed UUID format for classId, examId, or subjectId', () => {
      const result1 = assessmentSchemas.createAssessmentSchema.body.safeParse({
        title: 'Test',
        classId: 'invalid-uuid',
        totalMarks: 50
      });
      expect(result1.success).toBe(false);

      const result2 = assessmentSchemas.createAssessmentSchema.body.safeParse({
        title: 'Test',
        classId: classUUID,
        totalMarks: 50,
        examId: 'bad-exam-id'
      });
      expect(result2.success).toBe(false);
    });
  });

  describe('updateAssessmentSchema', () => {
    it('passes validation for partial updates', () => {
      const payload = {
        title: 'Updated Quiz Title',
        totalMarks: 75
      };

      const result = assessmentSchemas.updateAssessmentSchema.body.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.title).toBe('Updated Quiz Title');
      expect(result.data.totalMarks).toBe(75);
    });

    it('validates UUID params', () => {
      const valid = assessmentSchemas.updateAssessmentSchema.params.safeParse({ id: validUUID });
      expect(valid.success).toBe(true);

      const invalid = assessmentSchemas.updateAssessmentSchema.params.safeParse({ id: 'not-uuid' });
      expect(invalid.success).toBe(false);
    });
  });

  describe('listAssessmentsSchema', () => {
    it('validates query filters for classId, examId, and pagination', () => {
      const query = {
        classId: classUUID,
        examId: examUUID,
        page: '1',
        limit: '25',
        search: 'Quiz'
      };

      const result = assessmentSchemas.listAssessmentsSchema.query.safeParse(query);
      expect(result.success).toBe(true);
      expect(result.data.classId).toBe(classUUID);
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(25);
    });
  });
});
