import { describe, it, expect } from 'vitest';
import * as subjectSchemas from '../../../src/modules/subjects/subject.schemas.js';

describe('Unit: Subject Zod Validation Schemas', () => {
  describe('createSubjectSchema', () => {
    it('validates a valid create subject payload', () => {
      const payload = {
        body: {
          name: 'Mathematics',
          code: 'MATH101',
          credits: 4.0
        }
      };
      const result = subjectSchemas.createSubjectSchema.body.safeParse(payload.body);
      expect(result.success).toBe(true);
      expect(result.data.name).toBe('Mathematics');
      expect(result.data.code).toBe('MATH101');
      expect(result.data.credits).toBe(4.0);
    });

    it('validates minimal create subject payload with optional fields omitted', () => {
      const payload = {
        body: {
          name: 'Social Studies'
        }
      };
      const result = subjectSchemas.createSubjectSchema.body.safeParse(payload.body);
      expect(result.success).toBe(true);
      expect(result.data.name).toBe('Social Studies');
      expect(result.data.code).toBeUndefined();
      expect(result.data.credits).toBeUndefined();
    });

    it('rejects missing or empty subject name', () => {
      const payload1 = { body: {} };
      const result1 = subjectSchemas.createSubjectSchema.body.safeParse(payload1.body);
      expect(result1.success).toBe(false);

      const payload2 = { body: { name: '   ' } };
      const result2 = subjectSchemas.createSubjectSchema.body.safeParse(payload2.body);
      expect(result2.success).toBe(false);
    });

    it('rejects subject name exceeding 100 characters', () => {
      const payload = { body: { name: 'A'.repeat(101) } };
      const result = subjectSchemas.createSubjectSchema.body.safeParse(payload.body);
      expect(result.success).toBe(false);
    });

    it('rejects negative or excessive credits', () => {
      const payloadNeg = { body: { name: 'Science', credits: -1 } };
      const resultNeg = subjectSchemas.createSubjectSchema.body.safeParse(payloadNeg.body);
      expect(resultNeg.success).toBe(false);

      const payloadMax = { body: { name: 'Science', credits: 100 } };
      const resultMax = subjectSchemas.createSubjectSchema.body.safeParse(payloadMax.body);
      expect(resultMax.success).toBe(false);
    });
  });

  describe('updateSubjectSchema', () => {
    const validUuid = '11111111-1111-4111-8111-111111111111';

    it('validates partial update with valid name', () => {
      const payload = {
        params: { id: validUuid },
        body: { name: 'Advanced Mathematics' }
      };
      const paramsResult = subjectSchemas.updateSubjectSchema.params.safeParse(payload.params);
      const bodyResult = subjectSchemas.updateSubjectSchema.body.safeParse(payload.body);
      expect(paramsResult.success).toBe(true);
      expect(bodyResult.success).toBe(true);
    });

    it('rejects update with empty body', () => {
      const result = subjectSchemas.updateSubjectSchema.body.safeParse({});
      expect(result.success).toBe(false);
    });

    it('rejects invalid UUID in params', () => {
      const result = subjectSchemas.updateSubjectSchema.params.safeParse({ id: 'not-a-uuid' });
      expect(result.success).toBe(false);
    });
  });

  describe('listSubjectsSchema', () => {
    it('coerces and validates query pagination parameters', () => {
      const query = {
        page: '2',
        limit: '25',
        search: 'math',
        code: 'm101',
        sort: 'name',
        order: 'desc'
      };
      const result = subjectSchemas.listSubjectsSchema.query.safeParse(query);
      expect(result.success).toBe(true);
      expect(result.data.page).toBe(2);
      expect(result.data.limit).toBe(25);
      expect(result.data.search).toBe('math');
      expect(result.data.code).toBe('m101');
      expect(result.data.sort).toBe('name');
      expect(result.data.order).toBe('desc');
    });

    it('rejects invalid order enum or excessive limit', () => {
      const resultOrder = subjectSchemas.listSubjectsSchema.query.safeParse({ order: 'invalid' });
      expect(resultOrder.success).toBe(false);

      const resultLimit = subjectSchemas.listSubjectsSchema.query.safeParse({ limit: '200' });
      expect(resultLimit.success).toBe(false);
    });
  });
});
