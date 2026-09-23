import { describe, it, expect } from 'vitest';
import * as schemas from '../../../src/modules/notices/notice.schemas.js';

describe('Unit: Notice Schemas Tests — Backend Notice Domain', () => {
  const VALID_UUID = '11111111-1111-4111-8111-111111111111';
  const VALID_UUID_2 = '22222222-2222-4222-8222-222222222222';

  describe('1. createNoticeSchema', () => {
    it('validates a valid global notice payload', () => {
      const validData = {
        title: 'School Sports Day Announcement',
        content: 'Annual sports day will be held this Friday.',
        type: 'global',
        audience: 'all',
        priority: 'high'
      };

      const result = schemas.createNoticeSchema.body.safeParse(validData);
      expect(result.success).toBe(true);
      expect(result.data.title).toBe('School Sports Day Announcement');
      expect(result.data.type).toBe('global');
      expect(result.data.audience).toBe('all');
      expect(result.data.priority).toBe('high');
    });

    it('accepts message as an alias for content', () => {
      const validData = {
        title: 'Holiday Notice',
        message: 'School is closed on Monday.',
        type: 'global',
        audience: 'parents'
      };

      const result = schemas.createNoticeSchema.body.safeParse(validData);
      expect(result.success).toBe(true);
      expect(result.data.message).toBe('School is closed on Monday.');
    });

    it('validates a valid class notice with classId', () => {
      const validClassData = {
        title: 'Class 5A Test Tomorrow',
        content: 'Bring your science textbooks.',
        type: 'class',
        classId: VALID_UUID,
        audience: 'all',
        priority: 'normal'
      };

      const result = schemas.createNoticeSchema.body.safeParse(validClassData);
      expect(result.success).toBe(true);
      expect(result.data.classId).toBe(VALID_UUID);
    });

    it('rejects a class notice without classId', () => {
      const invalidClassData = {
        title: 'Class Test Tomorrow',
        content: 'Bring your textbooks.',
        type: 'class'
      };

      const result = schemas.createNoticeSchema.body.safeParse(invalidClassData);
      expect(result.success).toBe(false);
    });

    it('rejects empty title or missing content/message', () => {
      const emptyTitleData = {
        title: '   ',
        content: 'Some content'
      };
      expect(schemas.createNoticeSchema.body.safeParse(emptyTitleData).success).toBe(false);

      const noContentData = {
        title: 'Valid Title'
      };
      expect(schemas.createNoticeSchema.body.safeParse(noContentData).success).toBe(false);
    });

    it('rejects invalid UUID formats for classId and targetStudentIds', () => {
      const invalidIdsData = {
        title: 'Valid Title',
        content: 'Valid content',
        type: 'class',
        classId: 'not-a-uuid',
        targetStudentIds: ['also-not-a-uuid']
      };

      const result = schemas.createNoticeSchema.body.safeParse(invalidIdsData);
      expect(result.success).toBe(false);
    });

    it('rejects unsupported audience and priority values', () => {
      const invalidEnumData = {
        title: 'Valid Title',
        content: 'Valid Content',
        audience: 'unknown-audience',
        priority: 'critical'
      };

      const result = schemas.createNoticeSchema.body.safeParse(invalidEnumData);
      expect(result.success).toBe(false);
    });
  });

  describe('2. updateNoticeSchema', () => {
    it('validates a partial update payload with valid UUID param', () => {
      const validParams = { id: VALID_UUID };
      const validBody = {
        title: 'Updated Title',
        priority: 'high'
      };

      expect(schemas.updateNoticeSchema.params.safeParse(validParams).success).toBe(true);
      expect(schemas.updateNoticeSchema.body.safeParse(validBody).success).toBe(true);
    });

    it('rejects update with empty body', () => {
      const emptyBody = {};
      const result = schemas.updateNoticeSchema.body.safeParse(emptyBody);
      expect(result.success).toBe(false);
    });

    it('rejects invalid UUID parameter', () => {
      const invalidParams = { id: 'invalid-uuid-123' };
      const result = schemas.updateNoticeSchema.params.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });
  });

  describe('3. listNoticesSchema', () => {
    it('applies default pagination and sorting values', () => {
      const query = {};
      const result = schemas.listNoticesSchema.query.safeParse(query);
      expect(result.success).toBe(true);
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
      expect(result.data.sort).toBe('createdAt');
      expect(result.data.order).toBe('desc');
    });

    it('coerces string numbers for page and limit', () => {
      const query = {
        page: '3',
        limit: '50',
        type: 'global',
        audience: 'teachers',
        priority: 'high'
      };
      const result = schemas.listNoticesSchema.query.safeParse(query);
      expect(result.success).toBe(true);
      expect(result.data.page).toBe(3);
      expect(result.data.limit).toBe(50);
      expect(result.data.type).toBe('global');
    });

    it('rejects limit exceeding 100', () => {
      const query = { limit: '200' };
      const result = schemas.listNoticesSchema.query.safeParse(query);
      expect(result.success).toBe(false);
    });
  });
});
