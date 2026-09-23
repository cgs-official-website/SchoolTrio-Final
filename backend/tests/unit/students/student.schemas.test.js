import { describe, it, expect } from 'vitest';
import {
  listStudentsSchema,
  studentParamsSchema,
  createStudentSchema,
  updateStudentSchema,
  STUDENT_STATUSES,
  BLOOD_GROUPS
} from '../../../src/modules/students/student.schemas.js';

describe('Unit: Student Validation Schemas (Zod)', () => {
  const VALID_UUID = '11111111-1111-4111-8111-111111111111';
  const CLASS_UUID = '22222222-2222-4222-8222-222222222222';
  const SECTION_UUID = '33333333-3333-4333-8333-333333333333';

  describe('1. studentParamsSchema', () => {
    it('accepts valid UUID parameter', () => {
      const result = studentParamsSchema.params.safeParse({ id: VALID_UUID });
      expect(result.success).toBe(true);
    });

    it('rejects invalid UUID format', () => {
      const result = studentParamsSchema.params.safeParse({ id: 'invalid-id' });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('Invalid student ID format');
    });

    it('rejects missing id parameter', () => {
      const result = studentParamsSchema.params.safeParse({});
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('Student ID is required');
    });
  });

  describe('2. createStudentSchema', () => {
    it('accepts valid complete student creation payload', () => {
      const validPayload = {
        admissionNumber: 'ADM-2026-001',
        firstName: 'John',
        lastName: 'Doe',
        dob: '2015-05-15',
        gender: 'Male',
        bloodGroup: 'O+',
        aadhaarNumber: '123456789012',
        photoUrl: 'https://cdn.example.com/photos/student.jpg',
        rollNumber: '12',
        classId: CLASS_UUID,
        sectionId: SECTION_UUID,
        status: 'Active',
        customData: { parentOccupation: 'Engineer' }
      };

      const result = createStudentSchema.body.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it('accepts minimal required payload (admissionNumber, firstName)', () => {
      const minimalPayload = {
        admissionNumber: 'ADM-001',
        firstName: 'Alice'
      };

      const result = createStudentSchema.body.safeParse(minimalPayload);
      expect(result.success).toBe(true);
      expect(result.data.status).toBe('Active');
    });

    it('rejects missing admissionNumber', () => {
      const result = createStudentSchema.body.safeParse({
        firstName: 'Alice'
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('Admission number is required');
    });

    it('rejects empty/whitespace admissionNumber', () => {
      const result = createStudentSchema.body.safeParse({
        admissionNumber: '   ',
        firstName: 'Alice'
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('Admission number is required');
    });

    it('rejects missing firstName', () => {
      const result = createStudentSchema.body.safeParse({
        admissionNumber: 'ADM-001'
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('First name is required');
    });

    it('rejects empty/whitespace firstName', () => {
      const result = createStudentSchema.body.safeParse({
        admissionNumber: 'ADM-001',
        firstName: '  '
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('First name is required');
    });

    it('rejects future date of birth', () => {
      const futureDate = '2099-01-01';
      const result = createStudentSchema.body.safeParse({
        admissionNumber: 'ADM-001',
        firstName: 'Bob',
        dob: futureDate
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('Date of birth cannot be in the future');
    });

    it('rejects invalid date format for dob', () => {
      const result = createStudentSchema.body.safeParse({
        admissionNumber: 'ADM-001',
        firstName: 'Bob',
        dob: '15/05/2015'
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('Date of birth must be in YYYY-MM-DD format');
    });

    it('validates Aadhaar format (must be 12 numeric ASCII digits)', () => {
      // Valid
      expect(createStudentSchema.body.safeParse({
        admissionNumber: 'ADM-001',
        firstName: 'Bob',
        aadhaarNumber: '123456789012'
      }).success).toBe(true);

      // Too short
      expect(createStudentSchema.body.safeParse({
        admissionNumber: 'ADM-001',
        firstName: 'Bob',
        aadhaarNumber: '12345678901'
      }).success).toBe(false);

      // Non-numeric
      expect(createStudentSchema.body.safeParse({
        admissionNumber: 'ADM-001',
        firstName: 'Bob',
        aadhaarNumber: '12345678901A'
      }).success).toBe(false);
    });

    it('validates canonical blood groups', () => {
      for (const bg of BLOOD_GROUPS) {
        const result = createStudentSchema.body.safeParse({
          admissionNumber: 'ADM-001',
          firstName: 'Bob',
          bloodGroup: bg
        });
        expect(result.success).toBe(true);
      }

      const invalidBgResult = createStudentSchema.body.safeParse({
        admissionNumber: 'ADM-001',
        firstName: 'Bob',
        bloodGroup: 'XYZ'
      });
      expect(invalidBgResult.success).toBe(false);
    });

    it('validates canonical student statuses', () => {
      for (const st of STUDENT_STATUSES) {
        const result = createStudentSchema.body.safeParse({
          admissionNumber: 'ADM-001',
          firstName: 'Bob',
          status: st
        });
        expect(result.success).toBe(true);
      }

      const invalidStatusResult = createStudentSchema.body.safeParse({
        admissionNumber: 'ADM-001',
        firstName: 'Bob',
        status: 'Expelled'
      });
      expect(invalidStatusResult.success).toBe(false);
    });

    it('rejects invalid classId and sectionId UUIDs', () => {
      const result = createStudentSchema.body.safeParse({
        admissionNumber: 'ADM-001',
        firstName: 'Bob',
        classId: 'not-a-uuid',
        sectionId: 'not-a-uuid'
      });
      expect(result.success).toBe(false);
    });
  });

  describe('3. updateStudentSchema', () => {
    it('accepts partial valid updates', () => {
      const result = updateStudentSchema.body.safeParse({
        firstName: 'Jane',
        status: 'Transferred'
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty update body (no fields provided)', () => {
      const result = updateStudentSchema.body.safeParse({});
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('At least one field must be provided for update');
    });

    it('rejects empty string for firstName when supplied', () => {
      const result = updateStudentSchema.body.safeParse({
        firstName: '  '
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('First name cannot be empty');
    });

    it('rejects empty string for admissionNumber when supplied', () => {
      const result = updateStudentSchema.body.safeParse({
        admissionNumber: '  '
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('Admission number cannot be empty');
    });

    it('accepts setting nullable fields to null', () => {
      const result = updateStudentSchema.body.safeParse({
        lastName: null,
        classId: null,
        sectionId: null,
        dob: null,
        bloodGroup: null,
        aadhaarNumber: null,
        photoUrl: null,
        rollNumber: null,
        customData: null
      });
      expect(result.success).toBe(true);
    });
  });

  describe('4. listStudentsSchema', () => {
    it('accepts valid query parameters', () => {
      const result = listStudentsSchema.query.safeParse({
        search: 'John',
        admissionNumber: 'ADM-001',
        classId: CLASS_UUID,
        sectionId: SECTION_UUID,
        status: 'Active',
        gender: 'Male',
        bloodGroup: 'A+',
        page: '2',
        limit: '25',
        sort: 'admissionNumber',
        order: 'desc'
      });
      expect(result.success).toBe(true);
      expect(result.data.page).toBe(2);
      expect(result.data.limit).toBe(25);
    });

    it('rejects limit exceeding 1000', () => {
      const result = listStudentsSchema.query.safeParse({
        limit: '1500'
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('Limit cannot exceed 1000');
    });

    it('rejects invalid order enum', () => {
      const result = listStudentsSchema.query.safeParse({
        order: 'backwards'
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('Order must be either "asc" or "desc"');
    });
  });
});
