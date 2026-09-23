import { describe, it, expect } from 'vitest';
import {
  listParentsSchema,
  parentParamsSchema,
  updateParentSchema,
  studentParentParamsSchema,
  studentParentUnlinkParamsSchema,
  linkParentToStudentSchema,
  linkChildSelfServiceSchema,
  unlinkChildSelfServiceSchema
} from '../../../src/modules/parents/parent.schemas.js';

describe('Unit: Parent Validation Schemas (Zod)', () => {
  const VALID_UUID = '11111111-1111-4111-8111-111111111111';
  const STUDENT_UUID = '22222222-2222-4222-8222-222222222222';
  const PARENT_UUID = '33333333-3333-4333-8333-333333333333';

  describe('1. parentParamsSchema', () => {
    it('accepts valid UUID parameter', () => {
      const result = parentParamsSchema.params.safeParse({ id: VALID_UUID });
      expect(result.success).toBe(true);
    });

    it('rejects invalid UUID format', () => {
      const result = parentParamsSchema.params.safeParse({ id: 'invalid-id' });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('Invalid parent ID format');
    });
  });

  describe('2. updateParentSchema', () => {
    it('accepts valid partial update payload', () => {
      const result = updateParentSchema.body.safeParse({
        name: 'Jane Doe',
        phone: '9876543210',
        email: 'jane.doe@example.com',
        address: '123 Elm Street',
        emergencyContact: '9876543211',
        isActive: false
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty update body', () => {
      const result = updateParentSchema.body.safeParse({});
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('At least one field must be provided for update');
    });

    it('rejects empty name when supplied', () => {
      const result = updateParentSchema.body.safeParse({ name: '   ' });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('Parent name cannot be empty');
    });

    it('rejects invalid email format', () => {
      const result = updateParentSchema.body.safeParse({ email: 'not-an-email' });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('Invalid email address format');
    });

    it('accepts setting nullable fields to null', () => {
      const result = updateParentSchema.body.safeParse({
        phone: null,
        email: null,
        address: null,
        emergencyContact: null
      });
      expect(result.success).toBe(true);
    });
  });

  describe('3. studentParentParamsSchema & studentParentUnlinkParamsSchema', () => {
    it('accepts valid studentId param', () => {
      const result = studentParentParamsSchema.params.safeParse({ studentId: STUDENT_UUID });
      expect(result.success).toBe(true);
    });

    it('accepts valid studentId and parentId for unlinking', () => {
      const result = studentParentUnlinkParamsSchema.params.safeParse({
        studentId: STUDENT_UUID,
        parentId: PARENT_UUID
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid UUID in unlink params', () => {
      const result = studentParentUnlinkParamsSchema.params.safeParse({
        studentId: STUDENT_UUID,
        parentId: 'invalid'
      });
      expect(result.success).toBe(false);
    });
  });

  describe('4. linkParentToStudentSchema', () => {
    it('accepts Mode A: linking existing parent by parentProfileId', () => {
      const result = linkParentToStudentSchema.body.safeParse({
        parentProfileId: PARENT_UUID,
        relationship: 'Father'
      });
      expect(result.success).toBe(true);
    });

    it('accepts Mode B: creating new parent and linking', () => {
      const result = linkParentToStudentSchema.body.safeParse({
        name: 'Robert Smith',
        relationship: 'Mother',
        phone: '9988776655',
        email: 'robert.smith@example.com'
      });
      expect(result.success).toBe(true);
    });

    it('rejects payload missing both parentProfileId and name', () => {
      const result = linkParentToStudentSchema.body.safeParse({
        relationship: 'Guardian'
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain(
        'Either parentProfileId (for existing parent) or name (for new parent) must be provided'
      );
    });

    it('rejects missing relationship', () => {
      const result = linkParentToStudentSchema.body.safeParse({
        parentProfileId: PARENT_UUID
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('Relationship is required');
    });

    it('rejects empty relationship', () => {
      const result = linkParentToStudentSchema.body.safeParse({
        parentProfileId: PARENT_UUID,
        relationship: '  '
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('Relationship cannot be empty');
    });
  });

  describe('5. listParentsSchema', () => {
    it('accepts valid query parameters', () => {
      const result = listParentsSchema.query.safeParse({
        search: 'John',
        phone: '9876',
        email: 'john@example.com',
        page: '2',
        limit: '25',
        sort: 'name',
        order: 'desc'
      });
      expect(result.success).toBe(true);
      expect(result.data.page).toBe(2);
      expect(result.data.limit).toBe(25);
    });

    it('rejects limit exceeding 100', () => {
      const result = listParentsSchema.query.safeParse({ limit: '150' });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('Limit cannot exceed 100');
    });
  });

  describe('6. linkChildSelfServiceSchema', () => {
    it('accepts valid link child payload', () => {
      const result = linkChildSelfServiceSchema.body.safeParse({
        admissionNumber: 'ADM-001',
        dob: '2015-05-10',
        relationship: 'Mother'
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing admissionNumber', () => {
      const result = linkChildSelfServiceSchema.body.safeParse({
        dob: '2015-05-10',
        relationship: 'Mother'
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('Admission number is required');
    });

    it('rejects invalid dob format', () => {
      const result = linkChildSelfServiceSchema.body.safeParse({
        admissionNumber: 'ADM-001',
        dob: '10/05/2015',
        relationship: 'Mother'
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('Date of birth must be in YYYY-MM-DD format');
    });

    it('rejects future dob', () => {
      const result = linkChildSelfServiceSchema.body.safeParse({
        admissionNumber: 'ADM-001',
        dob: '2099-01-01',
        relationship: 'Mother'
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('Date of birth cannot be in the future');
    });

    it('rejects missing relationship', () => {
      const result = linkChildSelfServiceSchema.body.safeParse({
        admissionNumber: 'ADM-001',
        dob: '2015-05-10'
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('Relationship is required');
    });
  });

  describe('7. unlinkChildSelfServiceSchema', () => {
    it('accepts valid student UUID', () => {
      const result = unlinkChildSelfServiceSchema.params.safeParse({
        studentId: STUDENT_UUID
      });
      expect(result.success).toBe(true);
    });

    it('rejects malformed student UUID', () => {
      const result = unlinkChildSelfServiceSchema.params.safeParse({
        studentId: 'not-a-uuid'
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('Invalid student ID format');
    });
  });
});
