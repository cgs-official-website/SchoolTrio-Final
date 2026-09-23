import { describe, it, expect } from 'vitest';
import {
  studentHealthParamsSchema,
  updateStudentHealthSchema
} from '../../../src/modules/student-health/student-health.schemas.js';

describe('Student Health Schemas Unit Tests', () => {
  const validUUID = '11111111-1111-4111-8111-111111111111';

  describe('studentHealthParamsSchema', () => {
    it('validates a valid student UUID', async () => {
      const result = await studentHealthParamsSchema.params.safeParseAsync({ id: validUUID });
      expect(result.success).toBe(true);
      expect(result.data.id).toBe(validUUID);
    });

    it('rejects an invalid UUID format', async () => {
      const result = await studentHealthParamsSchema.params.safeParseAsync({ id: 'invalid-uuid-format' });
      expect(result.success).toBe(false);
      expect(result.error.errors[0].message).toContain('Invalid student ID format');
    });
  });

  describe('updateStudentHealthSchema', () => {
    const validPayload = {
      bloodGroup: 'O+',
      allergies: ['Peanuts', 'Dust'],
      medicalConditions: ['Asthma'],
      medications: ['Albuterol Inhaler'],
      emergencyContactName: 'Jane Doe',
      emergencyContactPhone: '+1-555-0199',
      doctorName: 'Dr. John Watson',
      doctorPhone: '+1-555-0188',
      notes: 'Requires inhaler during physical training'
    };

    it('validates complete health payload successfully', async () => {
      const result = await updateStudentHealthSchema.body.safeParseAsync(validPayload);
      expect(result.success).toBe(true);
      expect(result.data.bloodGroup).toBe('O+');
      expect(result.data.allergies).toHaveLength(2);
      expect(result.data.notes).toBe('Requires inhaler during physical training');
    });

    it('validates partial health updates (e.g. only bloodGroup or only allergies)', async () => {
      const resBlood = await updateStudentHealthSchema.body.safeParseAsync({ bloodGroup: 'AB-' });
      expect(resBlood.success).toBe(true);

      const resAllergies = await updateStudentHealthSchema.body.safeParseAsync({ allergies: ['Penicillin'] });
      expect(resAllergies.success).toBe(true);
    });

    it('rejects empty update object', async () => {
      const result = await updateStudentHealthSchema.body.safeParseAsync({});
      expect(result.success).toBe(false);
      expect(result.error.errors[0].message).toContain('At least one health field must be provided');
    });

    it('rejects invalid blood group values', async () => {
      const result = await updateStudentHealthSchema.body.safeParseAsync({ bloodGroup: 'Z+' });
      expect(result.success).toBe(false);
      expect(result.error.errors[0].message).toContain('Blood group must be one of');
    });

    it('rejects unknown fields (mass assignment / prototype attack)', async () => {
      const result = await updateStudentHealthSchema.body.safeParseAsync({
        bloodGroup: 'A+',
        schoolId: 'foreign-tenant-id',
        role: 'SUPER_ADMIN'
      });
      expect(result.success).toBe(false);
      expect(result.error.errors[0].message).toContain('Unknown fields are not allowed');
    });

    it('rejects oversized allergy arrays (> 20 items)', async () => {
      const oversizedArray = Array.from({ length: 25 }, (_, i) => `Allergy ${i}`);
      const result = await updateStudentHealthSchema.body.safeParseAsync({
        allergies: oversizedArray
      });
      expect(result.success).toBe(false);
      expect(result.error.errors[0].message).toContain('Cannot exceed 20 allergy items');
    });

    it('rejects oversized notes string (> 2000 chars)', async () => {
      const longNote = 'A'.repeat(2001);
      const result = await updateStudentHealthSchema.body.safeParseAsync({
        notes: longNote
      });
      expect(result.success).toBe(false);
      expect(result.error.errors[0].message).toContain('Health notes cannot exceed 2000 characters');
    });
  });
});
