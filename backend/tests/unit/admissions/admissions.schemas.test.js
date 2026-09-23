import { describe, it, expect } from 'vitest';
import * as schemas from '../../../src/modules/admissions/admissions.schemas.js';

describe('Admissions & Lead Management Schemas Unit Tests (Phase ADMISSION.2)', () => {
  const validUuid = '11111111-1111-4111-8111-111111111111';
  const formUuid = '22222222-2222-4222-8222-222222222222';
  const classUuid = '33333333-3333-4333-8333-333333333333';

  describe('1. createLeadFormSchema', () => {
    it('validates a correct lead form creation payload', () => {
      const payload = {
        body: {
          title: 'Admission Enquiry 2026',
          description: 'General admission inquiry form',
          successMessage: 'Thank you! We will reach out soon.',
          fields: [
            { id: 'f_name', label: 'Parent Name', type: 'text', required: true, options: [] },
            { id: 'f_phone', label: 'Phone Number', type: 'phone', required: true, options: [] },
            { id: 'f_grade', label: 'Grade Interested', type: 'dropdown', required: false, options: ['Grade 1', 'Grade 2'] }
          ],
          isActive: true
        }
      };

      const parsed = schemas.createLeadFormSchema.body.safeParse(payload.body);
      expect(parsed.success).toBe(true);
    });

    it('rejects lead form with empty title or no fields', () => {
      const payload = {
        body: {
          title: '',
          fields: []
        }
      };

      const parsed = schemas.createLeadFormSchema.body.safeParse(payload.body);
      expect(parsed.success).toBe(false);
    });

    it('rejects lead form with invalid field type', () => {
      const payload = {
        body: {
          title: 'Invalid Form',
          fields: [
            { id: 'f_1', label: 'Unknown', type: 'invalid_type', required: false }
          ]
        }
      };

      const parsed = schemas.createLeadFormSchema.body.safeParse(payload.body);
      expect(parsed.success).toBe(false);
    });
  });

  describe('2. updateLeadStatusSchema', () => {
    it('accepts valid lead statuses', () => {
      for (const status of ['Cold', 'Warm', 'Hot', 'New', 'Contacted', 'Enrolled', 'Closed']) {
        const parsed = schemas.updateLeadStatusSchema.body.safeParse({ status });
        expect(parsed.success).toBe(true);
      }
    });

    it('rejects invalid status', () => {
      const parsed = schemas.updateLeadStatusSchema.body.safeParse({ status: 'INVALID_STATUS' });
      expect(parsed.success).toBe(false);
    });
  });

  describe('3. publicLeadSubmitSchema', () => {
    it('validates public lead submission params and data body', () => {
      const payload = {
        params: { schoolId: validUuid, formId: formUuid },
        body: {
          data: {
            f_name: 'John Doe',
            f_phone: '9876543210',
            f_grade: 'Grade 5'
          }
        }
      };

      const parsedParams = schemas.publicLeadSubmitSchema.params.safeParse(payload.params);
      const parsedBody = schemas.publicLeadSubmitSchema.body.safeParse(payload.body);

      expect(parsedParams.success).toBe(true);
      expect(parsedBody.success).toBe(true);
    });

    it('rejects invalid schoolId or formId format in public lead', () => {
      const parsedParams = schemas.publicLeadSubmitSchema.params.safeParse({
        schoolId: 'not-a-uuid',
        formId: formUuid
      });
      expect(parsedParams.success).toBe(false);
    });
  });

  describe('4. publicAdmissionSubmitSchema', () => {
    it('validates a complete admission application payload', () => {
      const payload = {
        params: { schoolId: validUuid },
        body: {
          firstName: 'Alice',
          lastName: 'Smith',
          dob: '2015-06-12',
          gender: 'Female',
          classId: classUuid,
          parentName: 'Bob Smith',
          parentRelationship: 'Father',
          parentPhone: '9876543210',
          parentEmail: 'bob@example.com',
          homeAddress: '123 Maple Street',
          city: 'Springfield',
          state: 'Illinois',
          pincode: '62701'
        }
      };

      const parsedParams = schemas.publicAdmissionSubmitSchema.params.safeParse(payload.params);
      const parsedBody = schemas.publicAdmissionSubmitSchema.body.safeParse(payload.body);

      expect(parsedParams.success).toBe(true);
      expect(parsedBody.success).toBe(true);
    });

    it('rejects invalid DOB format or missing parent contact', () => {
      const payload = {
        firstName: 'Alice',
        dob: '12/06/2015', // Invalid format (must be YYYY-MM-DD)
        parentName: 'Bob Smith',
        parentPhone: '123' // Too short
      };

      const parsed = schemas.publicAdmissionSubmitSchema.body.safeParse(payload);
      expect(parsed.success).toBe(false);
    });
  });

  describe('5. enrollApplicationSchema', () => {
    it('validates correct enrollment payload', () => {
      const payload = {
        params: { id: validUuid },
        body: {
          admissionNumber: 'ADM-2026-001',
          classId: classUuid,
          sectionId: validUuid,
          rollNumber: '12'
        }
      };

      const parsedParams = schemas.enrollApplicationSchema.params.safeParse(payload.params);
      const parsedBody = schemas.enrollApplicationSchema.body.safeParse(payload.body);

      expect(parsedParams.success).toBe(true);
      expect(parsedBody.success).toBe(true);
    });

    it('rejects enrollment without admissionNumber or invalid classId', () => {
      const parsedBody = schemas.enrollApplicationSchema.body.safeParse({
        admissionNumber: '',
        classId: 'invalid-uuid'
      });
      expect(parsedBody.success).toBe(false);
    });
  });
});
