import { describe, it, expect } from 'vitest';
import {
  isValidDateString,
  calculateWeekNumber,
  createLessonPlanBodySchema,
  updateLessonPlanBodySchema,
  listLessonPlansQuerySchema,
  lessonPlanIdParamsSchema,
  statusEnumSchema
} from '../../../src/modules/lesson-plans/lesson-plan.schemas.js';

describe('Lesson Plan Schemas & Helper Unit Tests', () => {
  const VALID_UUID = '11111111-1111-4111-8111-111111111111';
  const VALID_CLASS_ID = '22222222-2222-4222-8222-222222222222';
  const VALID_SUBJECT_ID = '33333333-3333-4333-8333-333333333333';
  const VALID_TEACHER_ID = '44444444-4444-4444-8444-444444444444';

  describe('isValidDateString helper', () => {
    it('accepts valid calendar dates', () => {
      expect(isValidDateString('2026-09-16')).toBe(true);
      expect(isValidDateString('2024-02-29')).toBe(true); // Leap year
      expect(isValidDateString('2026-12-31')).toBe(true);
      expect(isValidDateString('2026-01-01')).toBe(true);
    });

    it('rejects impossible calendar dates', () => {
      expect(isValidDateString('2026-02-29')).toBe(false); // 2026 is non-leap year
      expect(isValidDateString('2026-02-30')).toBe(false);
      expect(isValidDateString('2026-04-31')).toBe(false); // April has 30 days
      expect(isValidDateString('2026-06-31')).toBe(false); // June has 30 days
      expect(isValidDateString('2026-09-31')).toBe(false); // September has 30 days
      expect(isValidDateString('2026-11-31')).toBe(false); // November has 30 days
      expect(isValidDateString('2026-13-01')).toBe(false); // Invalid month
      expect(isValidDateString('2026-00-10')).toBe(false); // Invalid month 0
      expect(isValidDateString('2026-05-00')).toBe(false); // Invalid day 0
    });

    it('rejects malformed string types', () => {
      expect(isValidDateString('')).toBe(false);
      expect(isValidDateString('not-a-date')).toBe(false);
      expect(isValidDateString('2026/09/16')).toBe(false);
      expect(isValidDateString('16-09-2026')).toBe(false);
      expect(isValidDateString(null)).toBe(false);
      expect(isValidDateString(undefined)).toBe(false);
      expect(isValidDateString(12345678)).toBe(false);
    });
  });

  describe('calculateWeekNumber helper', () => {
    it('calculates deterministic ISO week numbers across year boundaries and weeks 52/53', () => {
      // 2026 boundary tests
      expect(calculateWeekNumber('2026-01-01')).toBe(1); // Thursday -> Week 1
      expect(calculateWeekNumber('2026-09-16')).toBe(38); // Wednesday -> Week 38
      expect(calculateWeekNumber('2026-12-28')).toBe(53); // Monday -> Week 53
      expect(calculateWeekNumber('2026-12-31')).toBe(53); // Thursday -> Week 53

      // Year transitions & Week 52/53 boundaries
      expect(calculateWeekNumber('2020-01-01')).toBe(1); // Wednesday -> Week 1
      expect(calculateWeekNumber('2020-12-31')).toBe(53); // Thursday -> Week 53
      expect(calculateWeekNumber('2021-01-01')).toBe(53); // Friday -> Part of Week 53 of 2020
      expect(calculateWeekNumber('2021-01-03')).toBe(53); // Sunday -> Part of Week 53 of 2020
      expect(calculateWeekNumber('2021-01-04')).toBe(1); // Monday -> Week 1 of 2021
      expect(calculateWeekNumber('2024-12-29')).toBe(52); // Sunday -> Week 52 of 2024
      expect(calculateWeekNumber('2024-12-30')).toBe(1); // Monday -> Part of Week 1 of 2025
      expect(calculateWeekNumber('2024-12-31')).toBe(1); // Tuesday -> Part of Week 1 of 2025
      expect(calculateWeekNumber('2025-01-01')).toBe(1); // Wednesday -> Week 1 of 2025
      expect(calculateWeekNumber('2024-02-29')).toBe(9); // Leap day -> Week 9
    });
  });

  describe('statusEnumSchema', () => {
    it('normalizes lowercase and title-case statuses to lowercase', () => {
      expect(statusEnumSchema.parse('draft')).toBe('draft');
      expect(statusEnumSchema.parse('Draft')).toBe('draft');
      expect(statusEnumSchema.parse('ready')).toBe('ready');
      expect(statusEnumSchema.parse('Ready')).toBe('ready');
      expect(statusEnumSchema.parse('completed')).toBe('completed');
      expect(statusEnumSchema.parse('Completed')).toBe('completed');
    });

    it('rejects invalid statuses', () => {
      expect(() => statusEnumSchema.parse('in-progress')).toThrow();
      expect(() => statusEnumSchema.parse('archived')).toThrow();
      expect(() => statusEnumSchema.parse('published')).toThrow();
    });
  });

  describe('createLessonPlanBodySchema', () => {
    it('validates a correct creation payload', () => {
      const payload = {
        classId: VALID_CLASS_ID,
        subjectId: VALID_SUBJECT_ID,
        topic: 'Introduction to Calculus',
        date: '2026-09-16',
        objectives: 'Understand basic limits',
        status: 'Draft',
        teacherId: VALID_TEACHER_ID
      };

      const result = createLessonPlanBodySchema.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.status).toBe('draft');
      expect(result.data.topic).toBe('Introduction to Calculus');
    });

    it('defaults status to draft when omitted', () => {
      const payload = {
        classId: VALID_CLASS_ID,
        subjectId: VALID_SUBJECT_ID,
        topic: 'Algebra Basics',
        date: '2026-09-16'
      };

      const result = createLessonPlanBodySchema.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.status).toBe('draft');
    });

    it('rejects missing required fields', () => {
      expect(createLessonPlanBodySchema.safeParse({}).success).toBe(false);
      expect(
        createLessonPlanBodySchema.safeParse({
          subjectId: VALID_SUBJECT_ID,
          topic: 'Test',
          date: '2026-09-16'
        }).success
      ).toBe(false); // missing classId
      expect(
        createLessonPlanBodySchema.safeParse({
          classId: VALID_CLASS_ID,
          topic: 'Test',
          date: '2026-09-16'
        }).success
      ).toBe(false); // missing subjectId
      expect(
        createLessonPlanBodySchema.safeParse({
          classId: VALID_CLASS_ID,
          subjectId: VALID_SUBJECT_ID,
          date: '2026-09-16'
        }).success
      ).toBe(false); // missing topic
      expect(
        createLessonPlanBodySchema.safeParse({
          classId: VALID_CLASS_ID,
          subjectId: VALID_SUBJECT_ID,
          topic: 'Test'
        }).success
      ).toBe(false); // missing date
    });

    it('rejects empty or whitespace-only topic', () => {
      const result = createLessonPlanBodySchema.safeParse({
        classId: VALID_CLASS_ID,
        subjectId: VALID_SUBJECT_ID,
        topic: '   ',
        date: '2026-09-16'
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid UUIDs', () => {
      const result = createLessonPlanBodySchema.safeParse({
        classId: 'not-a-uuid',
        subjectId: VALID_SUBJECT_ID,
        topic: 'Topic',
        date: '2026-09-16'
      });
      expect(result.success).toBe(false);
    });

    it('rejects impossible dates', () => {
      const result = createLessonPlanBodySchema.safeParse({
        classId: VALID_CLASS_ID,
        subjectId: VALID_SUBJECT_ID,
        topic: 'Topic',
        date: '2026-02-30'
      });
      expect(result.success).toBe(false);
    });
  });

  describe('updateLessonPlanBodySchema', () => {
    it('accepts partial valid updates', () => {
      const result = updateLessonPlanBodySchema.safeParse({
        topic: 'Advanced Calculus',
        status: 'Ready'
      });
      expect(result.success).toBe(true);
      expect(result.data.topic).toBe('Advanced Calculus');
      expect(result.data.status).toBe('ready');
    });

    it('accepts empty object for update', () => {
      const result = updateLessonPlanBodySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('rejects empty string topic', () => {
      const result = updateLessonPlanBodySchema.safeParse({
        topic: '  '
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid UUID update', () => {
      const result = updateLessonPlanBodySchema.safeParse({
        classId: 'invalid-uuid'
      });
      expect(result.success).toBe(false);
    });

    it('rejects impossible date update', () => {
      const result = updateLessonPlanBodySchema.safeParse({
        date: '2026-04-31'
      });
      expect(result.success).toBe(false);
    });
  });

  describe('listLessonPlansQuerySchema', () => {
    it('parses valid query parameters with defaults', () => {
      const result = listLessonPlansQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    });

    it('validates date range when startDate <= endDate', () => {
      const result = listLessonPlansQuerySchema.safeParse({
        startDate: '2026-09-01',
        endDate: '2026-09-30'
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid date range when startDate > endDate', () => {
      const result = listLessonPlansQuerySchema.safeParse({
        startDate: '2026-09-30',
        endDate: '2026-09-01'
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid limit exceeding max limit', () => {
      const result = listLessonPlansQuerySchema.safeParse({
        limit: 500
      });
      expect(result.success).toBe(false);
    });
  });

  describe('lessonPlanIdParamsSchema', () => {
    it('accepts valid UUID', () => {
      const result = lessonPlanIdParamsSchema.safeParse({ id: VALID_UUID });
      expect(result.success).toBe(true);
    });

    it('rejects invalid UUID', () => {
      const result = lessonPlanIdParamsSchema.safeParse({ id: 'bad-id' });
      expect(result.success).toBe(false);
    });
  });
});
