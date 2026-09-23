import { describe, it, expect } from 'vitest';
import {
  generateReportCardPreviewSchema,
  publishReportCardsSchema,
  getReportCardParamsSchema,
  listStudentReportCardsSchema,
  listClassReportCardsSchema
} from '../../../src/modules/report-cards/report-card.schemas.js';

describe('Report Card Schemas Unit Tests (Phase 4C.7-C Batch 2)', () => {
  const VALID_UUID_1 = '11111111-1111-4111-8111-111111111111';
  const VALID_UUID_2 = '22222222-2222-4222-8222-222222222222';

  describe('1. generateReportCardPreviewSchema', () => {
    it('accepts valid preview payload with classId only', () => {
      const payload = {
        classId: VALID_UUID_1
      };
      const result = generateReportCardPreviewSchema.body.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.classId).toBe(VALID_UUID_1);
    });

    it('accepts valid preview payload with classId and examId', () => {
      const payload = {
        classId: VALID_UUID_1,
        examId: VALID_UUID_2
      };
      const result = generateReportCardPreviewSchema.body.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.classId).toBe(VALID_UUID_1);
      expect(result.data.examId).toBe(VALID_UUID_2);
    });

    it('rejects preview payload with missing classId', () => {
      const payload = {};
      const result = generateReportCardPreviewSchema.body.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('rejects preview payload with invalid classId UUID', () => {
      const payload = {
        classId: 'invalid-uuid-string'
      };
      const result = generateReportCardPreviewSchema.body.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('2. publishReportCardsSchema', () => {
    it('accepts valid publication payload with classId, examId, and studentIds array', () => {
      const payload = {
        classId: VALID_UUID_1,
        examId: VALID_UUID_2,
        studentIds: [VALID_UUID_1, VALID_UUID_2]
      };
      const result = publishReportCardsSchema.body.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.studentIds).toHaveLength(2);
    });

    it('rejects publication payload with empty studentIds array if provided', () => {
      const payload = {
        classId: VALID_UUID_1,
        studentIds: []
      };
      const result = publishReportCardsSchema.body.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('3. getReportCardParamsSchema', () => {
    it('accepts valid report card UUID param', () => {
      const params = { id: VALID_UUID_1 };
      const result = getReportCardParamsSchema.params.safeParse(params);
      expect(result.success).toBe(true);
    });

    it('rejects non-UUID report card id', () => {
      const params = { id: 'not-a-uuid' };
      const result = getReportCardParamsSchema.params.safeParse(params);
      expect(result.success).toBe(false);
    });
  });

  describe('4. listStudentReportCardsSchema', () => {
    it('accepts valid query and params with defaults', () => {
      const params = { studentId: VALID_UUID_1 };
      const query = { page: '2', limit: '10', sort: 'publishedAt', order: 'desc' };

      const paramsResult = listStudentReportCardsSchema.params.safeParse(params);
      const queryResult = listStudentReportCardsSchema.query.safeParse(query);

      expect(paramsResult.success).toBe(true);
      expect(queryResult.success).toBe(true);
      expect(queryResult.data.page).toBe(2);
      expect(queryResult.data.limit).toBe(10);
    });
  });

  describe('5. listClassReportCardsSchema', () => {
    it('accepts valid classId and optional examId filter', () => {
      const params = { classId: VALID_UUID_1 };
      const query = { examId: VALID_UUID_2 };

      const paramsResult = listClassReportCardsSchema.params.safeParse(params);
      const queryResult = listClassReportCardsSchema.query.safeParse(query);

      expect(paramsResult.success).toBe(true);
      expect(queryResult.success).toBe(true);
      expect(queryResult.data.examId).toBe(VALID_UUID_2);
    });
  });
});
