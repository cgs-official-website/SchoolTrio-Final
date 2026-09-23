import { describe, it, expect } from 'vitest';
import * as ptmSchemas from '../../../src/modules/ptm/ptm.schema.js';

describe('Unit: PTM Schema Validation Tests', () => {
  const VALID_UUID_1 = '11111111-1111-4111-8111-111111111111';
  const VALID_UUID_2 = '22222222-2222-4222-8222-222222222222';

  describe('createPtmSchema', () => {
    it('validates a correct appointment creation payload', () => {
      const validPayload = {
        studentId: VALID_UUID_1,
        teacherId: VALID_UUID_2,
        date: '2026-09-25',
        timeSlot: '11:00 AM',
        type: 'Online',
        notes: 'Review homework'
      };

      const parsed = ptmSchemas.createPtmSchema.body.safeParse(validPayload);
      expect(parsed.success).toBe(true);
      expect(parsed.data.type).toBe('Online');
      expect(parsed.data.status).toBe('Confirmed');
    });

    it('accepts time as an alias for timeSlot', () => {
      const payload = {
        studentId: VALID_UUID_1,
        date: '2026-09-25',
        time: '14:30'
      };

      const parsed = ptmSchemas.createPtmSchema.body.safeParse(payload);
      expect(parsed.success).toBe(true);
      expect(parsed.data.time).toBe('14:30');
    });

    it('rejects invalid date format', () => {
      const payload = {
        studentId: VALID_UUID_1,
        date: '25-09-2026',
        timeSlot: '11:00 AM'
      };

      const parsed = ptmSchemas.createPtmSchema.body.safeParse(payload);
      expect(parsed.success).toBe(false);
    });

    it('rejects invalid studentId format', () => {
      const payload = {
        studentId: 'not-a-uuid',
        date: '2026-09-25',
        timeSlot: '11:00 AM'
      };

      const parsed = ptmSchemas.createPtmSchema.body.safeParse(payload);
      expect(parsed.success).toBe(false);
    });

    it('rejects payload missing both timeSlot and time', () => {
      const payload = {
        studentId: VALID_UUID_1,
        date: '2026-09-25'
      };

      const parsed = ptmSchemas.createPtmSchema.body.safeParse(payload);
      expect(parsed.success).toBe(false);
    });
  });

  describe('updatePtmStatusSchema', () => {
    it('accepts valid statuses and normalizes casing', () => {
      const payload = { status: 'cancelled' };
      const parsed = ptmSchemas.updatePtmStatusSchema.body.safeParse(payload);
      expect(parsed.success).toBe(true);
      expect(parsed.data.status).toBe('Cancelled');
    });

    it('rejects unrecognized status values', () => {
      const payload = { status: 'UnknownStatus' };
      const parsed = ptmSchemas.updatePtmStatusSchema.body.safeParse(payload);
      expect(parsed.success).toBe(false);
    });
  });
});
