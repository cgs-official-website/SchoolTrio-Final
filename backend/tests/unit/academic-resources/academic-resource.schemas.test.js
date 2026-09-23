import { describe, it, expect } from 'vitest';
import {
  listAcademicResourcesQuerySchema,
  academicResourceIdParamsSchema,
  createAcademicResourceBodySchema,
  updateAcademicResourceBodySchema,
  resourceUrlSchema
} from '../../../src/modules/academic-resources/academic-resource.schemas.js';

describe('Academic Resource Schemas', () => {
  const VALID_UUID_1 = '11111111-1111-4111-8111-111111111111';
  const VALID_UUID_2 = '22222222-2222-4222-8222-222222222222';
  const VALID_UUID_3 = '33333333-3333-4333-8333-333333333333';

  describe('resourceUrlSchema', () => {
    it('accepts valid http and https URLs', () => {
      expect(resourceUrlSchema.parse('https://example.com/file.pdf')).toBe('https://example.com/file.pdf');
      expect(resourceUrlSchema.parse('http://example.com/image.png')).toBe('http://example.com/image.png');
      expect(resourceUrlSchema.parse('  https://example.com/doc.docx  ')).toBe('https://example.com/doc.docx');
    });

    it('rejects dangerous protocols: javascript:, data:, vbscript:', () => {
      expect(() => resourceUrlSchema.parse('javascript:alert(1)')).toThrow();
      expect(() => resourceUrlSchema.parse('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==')).toThrow();
      expect(() => resourceUrlSchema.parse('vbscript:msgbox(1)')).toThrow();
      expect(() => resourceUrlSchema.parse('ftp://example.com/file.pdf')).toThrow();
      expect(() => resourceUrlSchema.parse('file:///etc/passwd')).toThrow();
    });

    it('rejects malformed URLs', () => {
      expect(() => resourceUrlSchema.parse('not-a-url')).toThrow();
      expect(() => resourceUrlSchema.parse('')).toThrow();
    });
  });

  describe('listAcademicResourcesQuerySchema', () => {
    it('applies default pagination values', () => {
      const parsed = listAcademicResourcesQuerySchema.parse({});
      expect(parsed.page).toBe(1);
      expect(parsed.limit).toBe(20);
    });

    it('clamps limit to maximum of 100 and parses string numbers', () => {
      const parsed = listAcademicResourcesQuerySchema.parse({ page: '2', limit: '50' });
      expect(parsed.page).toBe(2);
      expect(parsed.limit).toBe(50);

      expect(() => listAcademicResourcesQuerySchema.parse({ limit: '101' })).toThrow();
      expect(() => listAcademicResourcesQuerySchema.parse({ limit: '0' })).toThrow();
      expect(() => listAcademicResourcesQuerySchema.parse({ page: '0' })).toThrow();
    });

    it('parses valid optional filters', () => {
      const parsed = listAcademicResourcesQuerySchema.parse({
        classId: VALID_UUID_1,
        subjectId: VALID_UUID_2,
        uploaderId: VALID_UUID_3,
        type: 'Video',
        search: 'Physics Notes'
      });

      expect(parsed.classId).toBe(VALID_UUID_1);
      expect(parsed.subjectId).toBe(VALID_UUID_2);
      expect(parsed.uploaderId).toBe(VALID_UUID_3);
      expect(parsed.type).toBe('video'); // normalized to lowercase
      expect(parsed.search).toBe('Physics Notes');
    });

    it('rejects invalid filter UUIDs', () => {
      expect(() => listAcademicResourcesQuerySchema.parse({ classId: 'invalid-uuid' })).toThrow();
      expect(() => listAcademicResourcesQuerySchema.parse({ subjectId: 'invalid-uuid' })).toThrow();
      expect(() => listAcademicResourcesQuerySchema.parse({ uploaderId: 'invalid-uuid' })).toThrow();
    });

    it('rejects invalid resource type', () => {
      expect(() => listAcademicResourcesQuerySchema.parse({ type: 'audio' })).toThrow();
      expect(() => listAcademicResourcesQuerySchema.parse({ type: 'executable' })).toThrow();
    });

    it('rejects overly long search string (>100 chars)', () => {
      expect(() => listAcademicResourcesQuerySchema.parse({ search: 'a'.repeat(101) })).toThrow();
    });
  });

  describe('academicResourceIdParamsSchema', () => {
    it('accepts valid UUID', () => {
      const parsed = academicResourceIdParamsSchema.parse({ id: VALID_UUID_1 });
      expect(parsed.id).toBe(VALID_UUID_1);
    });

    it('rejects invalid UUID', () => {
      expect(() => academicResourceIdParamsSchema.parse({ id: 'invalid-uuid' })).toThrow();
      expect(() => academicResourceIdParamsSchema.parse({})).toThrow();
    });
  });

  describe('createAcademicResourceBodySchema', () => {
    it('validates a complete valid payload', () => {
      const payload = {
        title: 'Introduction to Calculus',
        classId: VALID_UUID_1,
        subjectId: VALID_UUID_2,
        fileUrl: 'https://cdn.school.edu/math/calc.pdf',
        type: 'Document',
        description: 'Comprehensive chapter 1 guide'
      };

      const parsed = createAcademicResourceBodySchema.parse(payload);
      expect(parsed.title).toBe('Introduction to Calculus');
      expect(parsed.classId).toBe(VALID_UUID_1);
      expect(parsed.subjectId).toBe(VALID_UUID_2);
      expect(parsed.fileUrl).toBe('https://cdn.school.edu/math/calc.pdf');
      expect(parsed.type).toBe('document'); // normalized to lowercase
      expect(parsed.description).toBe('Comprehensive chapter 1 guide');
    });

    it('accepts minimal required payload and sets default type', () => {
      const payload = {
        title: 'Class Rules',
        classId: VALID_UUID_1
      };

      const parsed = createAcademicResourceBodySchema.parse(payload);
      expect(parsed.title).toBe('Class Rules');
      expect(parsed.classId).toBe(VALID_UUID_1);
      expect(parsed.type).toBe('document');
      expect(parsed.subjectId).toBeUndefined();
      expect(parsed.fileUrl).toBeUndefined();
      expect(parsed.description).toBeUndefined();
    });

    it('accepts null for optional fields: subjectId, fileUrl, description', () => {
      const payload = {
        title: 'Annual General Circular',
        classId: VALID_UUID_1,
        subjectId: null,
        fileUrl: null,
        description: null
      };

      const parsed = createAcademicResourceBodySchema.parse(payload);
      expect(parsed.subjectId).toBeNull();
      expect(parsed.fileUrl).toBeNull();
      expect(parsed.description).toBeNull();
    });

    it('rejects missing title or classId', () => {
      expect(() => createAcademicResourceBodySchema.parse({ classId: VALID_UUID_1 })).toThrow();
      expect(() => createAcademicResourceBodySchema.parse({ title: 'Math' })).toThrow();
      expect(() => createAcademicResourceBodySchema.parse({ title: '', classId: VALID_UUID_1 })).toThrow();
    });

    it('rejects title longer than 200 chars', () => {
      expect(() =>
        createAcademicResourceBodySchema.parse({
          title: 'A'.repeat(201),
          classId: VALID_UUID_1
        })
      ).toThrow();
    });

    it('rejects invalid fileUrl', () => {
      expect(() =>
        createAcademicResourceBodySchema.parse({
          title: 'Test',
          classId: VALID_UUID_1,
          fileUrl: 'javascript:alert(1)'
        })
      ).toThrow();
    });

    it('rejects invalid resource type', () => {
      expect(() =>
        createAcademicResourceBodySchema.parse({
          title: 'Test',
          classId: VALID_UUID_1,
          type: 'archive'
        })
      ).toThrow();
    });
  });

  describe('updateAcademicResourceBodySchema', () => {
    it('accepts valid partial update fields', () => {
      const parsed = updateAcademicResourceBodySchema.parse({
        title: 'Updated Calculus Chapter 1',
        type: 'Link',
        fileUrl: 'https://youtube.com/watch?v=123'
      });

      expect(parsed.title).toBe('Updated Calculus Chapter 1');
      expect(parsed.type).toBe('link');
      expect(parsed.fileUrl).toBe('https://youtube.com/watch?v=123');
    });

    it('rejects empty update body (at least one field required)', () => {
      expect(() => updateAcademicResourceBodySchema.parse({})).toThrow();
    });

    it('rejects invalid URL in update', () => {
      expect(() =>
        updateAcademicResourceBodySchema.parse({
          fileUrl: 'data:text/plain;base64,abc'
        })
      ).toThrow();
    });

    it('rejects invalid classId UUID in update', () => {
      expect(() =>
        updateAcademicResourceBodySchema.parse({
          classId: 'not-a-uuid'
        })
      ).toThrow();
    });
  });
});
