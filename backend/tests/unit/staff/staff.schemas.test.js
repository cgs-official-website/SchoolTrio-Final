import { describe, it, expect } from 'vitest';
import {
  listStaffSchema,
  staffParamsSchema,
  createStaffSchema,
  updateStaffSchema,
  assignStaffSchema,
  updateStaffSelfSchema
} from '../../../src/modules/staff/staff.schemas.js';

describe('Unit: Staff Schemas Validation — Phase 4C.4', () => {
  const VALID_UUID = '11111111-1111-4111-8111-111111111111';
  const VALID_UUID_2 = '22222222-2222-4222-8222-222222222222';

  describe('1. listStaffSchema', () => {
    it('accepts valid query parameters', () => {
      const result = listStaffSchema.query.safeParse({
        search: 'John',
        phone: '9876543210',
        email: 'john@example.com',
        staffType: 'teaching',
        status: 'Active',
        roleId: VALID_UUID,
        classId: VALID_UUID_2,
        page: '1',
        limit: '20',
        sort: 'name',
        order: 'asc'
      });
      expect(result.success).toBe(true);
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    });

    it('rejects invalid staffType or status', () => {
      const resultType = listStaffSchema.query.safeParse({ staffType: 'invalid-type' });
      expect(resultType.success).toBe(false);

      const resultStatus = listStaffSchema.query.safeParse({ status: 'UnknownStatus' });
      expect(resultStatus.success).toBe(false);
    });

    it('rejects negative or out-of-bound pagination', () => {
      const resultZero = listStaffSchema.query.safeParse({ page: 0 });
      expect(resultZero.success).toBe(false);

      const resultMaxLimit = listStaffSchema.query.safeParse({ limit: 150 });
      expect(resultMaxLimit.success).toBe(false);
    });
  });

  describe('2. staffParamsSchema', () => {
    it('accepts valid UUID param', () => {
      const result = staffParamsSchema.params.safeParse({ id: VALID_UUID });
      expect(result.success).toBe(true);
    });

    it('rejects malformed UUID param', () => {
      const result = staffParamsSchema.params.safeParse({ id: 'non-uuid-123' });
      expect(result.success).toBe(false);
    });
  });

  describe('3. createStaffSchema', () => {
    it('accepts a fully specified valid payload', () => {
      const payload = {
        firstName: 'Robert',
        lastName: 'Doe',
        email: 'robert.doe@school.edu',
        phone: '9876543210',
        employeeId: 'EMP-001',
        staffType: 'teaching',
        designation: 'Senior Teacher',
        roleId: VALID_UUID,
        assignedClassId: VALID_UUID_2,
        baseSalary: 55000,
        status: 'Active',
        gender: 'Male',
        bloodGroup: 'O+',
        maritalStatus: 'Single',
        nationality: 'Indian',
        address: '123 Main Street',
        emergencyContact: '9876543211',
        fatherGuardianName: 'John Doe Sr.',
        languagesKnown: 'English, Hindi',
        qualifications: { highest: 'M.Sc' },
        financial: { panNumber: 'ABCDE1234F', bankAccountNumber: '123456789' },
        assignments: {
          assignedSubjectIds: [VALID_UUID],
          subjectClassIds: [VALID_UUID_2]
        }
      };

      const result = createStaffSchema.body.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.email).toBe('robert.doe@school.edu');
    });

    it('rejects missing required fields (firstName, email)', () => {
      const missingFirst = createStaffSchema.body.safeParse({ email: 'test@school.edu' });
      expect(missingFirst.success).toBe(false);

      const missingEmail = createStaffSchema.body.safeParse({ firstName: 'Robert' });
      expect(missingEmail.success).toBe(false);
    });

    it('rejects invalid email formats', () => {
      const result = createStaffSchema.body.safeParse({
        firstName: 'Robert',
        email: 'invalid-email-address'
      });
      expect(result.success).toBe(false);
    });

    it('rejects negative baseSalary', () => {
      const result = createStaffSchema.body.safeParse({
        firstName: 'Robert',
        email: 'robert@school.edu',
        baseSalary: -500
      });
      expect(result.success).toBe(false);
    });
  });

  describe('4. updateStaffSchema', () => {
    it('accepts partial valid update payload', () => {
      const result = updateStaffSchema.body.safeParse({
        designation: 'Headmaster',
        phone: '9999999999',
        status: 'Inactive',
        baseSalary: 60000
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty update body', () => {
      const result = updateStaffSchema.body.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('5. assignStaffSchema', () => {
    it('accepts valid assignment payload', () => {
      const result = assignStaffSchema.body.safeParse({
        assignedClassId: VALID_UUID,
        assignedSubjectIds: [VALID_UUID_2],
        subjectClassIds: [VALID_UUID]
      });
      expect(result.success).toBe(true);
    });

    it('allows clearing assignedClassId with null', () => {
      const result = assignStaffSchema.body.safeParse({
        assignedClassId: null
      });
      expect(result.success).toBe(true);
      expect(result.data.assignedClassId).toBeNull();
    });

    it('rejects invalid UUID inside subject or class array', () => {
      const result = assignStaffSchema.body.safeParse({
        assignedSubjectIds: ['not-a-uuid']
      });
      expect(result.success).toBe(false);
    });
  });

  describe('6. updateStaffSelfSchema', () => {
    it('accepts valid self-service personal information update', () => {
      const result = updateStaffSelfSchema.body.safeParse({
        phone: '9876543210',
        address: '456 New Road',
        emergencyContact: '9876543212',
        maritalStatus: 'Married',
        languagesKnown: 'English, Tamil'
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty self-service payload', () => {
      const result = updateStaffSelfSchema.body.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});
