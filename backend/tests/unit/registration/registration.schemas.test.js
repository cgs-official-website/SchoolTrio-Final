import { describe, it, expect } from 'vitest';
import {
  registerSchoolSchema,
  registerTeacherSchema,
  registerParentSchema
} from '../../../src/modules/registration/registration.schemas.js';

describe('Registration Schemas Validation Unit Tests', () => {
  // ==========================================
  // 1. School Registration Schema
  // ==========================================
  describe('registerSchoolSchema', () => {
    const validSchoolPayload = {
      name: 'Springfield Academy',
      code: 'sp-acad-01',
      type: 'K12',
      email: 'info@springfield.edu',
      phone: '9876543210',
      address: '742 Evergreen Terrace',
      seatLimit: 500,
      teacherLimit: 50,
      admin: {
        name: 'Seymour Skinner',
        email: 'principal@springfield.edu',
        password: 'ValidPassword123'
      }
    };

    it('passes validation with complete valid payload and normalizes code to uppercase', () => {
      const parsed = registerSchoolSchema.body.safeParse(validSchoolPayload);
      expect(parsed.success).toBe(true);
      expect(parsed.data.code).toBe('SP-ACAD-01');
    });

    it('fails when school name is missing or too short', () => {
      const invalid = { ...validSchoolPayload, name: 'A' };
      const result = registerSchoolSchema.body.safeParse(invalid);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('at least 2 characters');
    });

    it('fails when school code contains invalid characters', () => {
      const invalid = { ...validSchoolPayload, code: 'INVALID CODE with spaces!' };
      const result = registerSchoolSchema.body.safeParse(invalid);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('alphanumeric');
    });

    it('fails when admin email is invalid', () => {
      const invalid = {
        ...validSchoolPayload,
        admin: { ...validSchoolPayload.admin, email: 'not-an-email' }
      };
      const result = registerSchoolSchema.body.safeParse(invalid);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('Invalid administrator email');
    });

    it('fails when admin password violates complexity requirements', () => {
      // Missing uppercase and number
      const weakPassword = {
        ...validSchoolPayload,
        admin: { ...validSchoolPayload.admin, password: 'weakpassword' }
      };
      const result = registerSchoolSchema.body.safeParse(weakPassword);
      expect(result.success).toBe(false);
      const messages = result.error.issues.map(i => i.message);
      expect(messages.some(m => m.includes('uppercase') || m.includes('number'))).toBe(true);
    });

    it('fails when admin password is too short', () => {
      const shortPassword = {
        ...validSchoolPayload,
        admin: { ...validSchoolPayload.admin, password: 'Pass1' }
      };
      const result = registerSchoolSchema.body.safeParse(shortPassword);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('at least 8 characters');
    });
  });

  // ==========================================
  // 2. Teacher Registration Schema
  // ==========================================
  describe('registerTeacherSchema', () => {
    const validTeacherPayload = {
      schoolId: '11111111-1111-4111-8111-111111111111',
      email: 'edna.krabappel@springfield.edu',
      password: 'TeacherPassword123',
      employeeId: 'EMP-001',
      name: 'Edna Krabappel',
      phone: '9876543210'
    };

    it('passes validation with valid payload', () => {
      const parsed = registerTeacherSchema.body.safeParse(validTeacherPayload);
      expect(parsed.success).toBe(true);
      expect(parsed.data.email).toBe('edna.krabappel@springfield.edu');
    });

    it('fails when schoolId is not a valid UUID', () => {
      const invalid = { ...validTeacherPayload, schoolId: 'not-a-uuid' };
      const result = registerTeacherSchema.body.safeParse(invalid);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('Invalid school ID format');
    });

    it('fails when password is missing or weak', () => {
      const invalid = { ...validTeacherPayload, password: 'short' };
      const result = registerTeacherSchema.body.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  // ==========================================
  // 3. Parent Registration Schema
  // ==========================================
  describe('registerParentSchema', () => {
    const validParentPayload = {
      schoolId: '11111111-1111-4111-8111-111111111111',
      name: 'Marge Simpson',
      email: 'marge.simpson@springfield.edu',
      password: 'ParentPassword123',
      phone: '9876543210',
      admissionNumber: 'ADM-2024-001',
      dob: '2015-04-19',
      relationship: 'Mother'
    };

    it('passes validation with valid payload', () => {
      const parsed = registerParentSchema.body.safeParse(validParentPayload);
      expect(parsed.success).toBe(true);
      expect(parsed.data.admissionNumber).toBe('ADM-2024-001');
      expect(parsed.data.relationship).toBe('Mother');
    });

    it('fails when dob format is invalid', () => {
      const invalid = { ...validParentPayload, dob: '19-04-2015' };
      const result = registerParentSchema.body.safeParse(invalid);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('YYYY-MM-DD');
    });

    it('fails when dob is in the future', () => {
      const invalid = { ...validParentPayload, dob: '2099-01-01' };
      const result = registerParentSchema.body.safeParse(invalid);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('future');
    });

    it('fails when relationship is empty', () => {
      const invalid = { ...validParentPayload, relationship: '   ' };
      const result = registerParentSchema.body.safeParse(invalid);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('Relationship cannot be empty');
    });
  });
});
