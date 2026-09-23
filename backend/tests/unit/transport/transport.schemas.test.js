import { describe, it, expect } from 'vitest';
import {
  createVehicleSchema,
  createRouteSchema,
  createStopSchema,
  assignStudentSchema,
  normalizeRegistrationNumber,
  normalizePhoneNumber
} from '../../../src/modules/transport/transport.schemas.js';

describe('Transport Validation Schemas Unit Tests (Phase TR.2)', () => {
  describe('Helper normalization functions', () => {
    it('normalizes registration numbers', () => {
      expect(normalizeRegistrationNumber('  tn 56 k 1146 ')).toBe('TN 56 K 1146');
      expect(normalizeRegistrationNumber('mh-12-pq-4567')).toBe('MH-12-PQ-4567');
      expect(normalizeRegistrationNumber(null)).toBe('');
    });

    it('normalizes 10-digit phone numbers', () => {
      expect(normalizePhoneNumber('+91 98765 43210')).toBe('9876543210');
      expect(normalizePhoneNumber('09876543210')).toBe('9876543210');
      expect(normalizePhoneNumber('9876543210')).toBe('9876543210');
    });
  });

  describe('createVehicleSchema', () => {
    it('validates a valid vehicle payload', () => {
      const payload = {
        body: {
          registrationNumber: 'TN 56 K 1146',
          model: 'Tata Starbus 2023',
          capacity: 32,
          insuranceExpiry: '2027-05-15',
          status: 'Active'
        }
      };
      const parsed = createVehicleSchema.safeParse(payload);
      expect(parsed.success).toBe(true);
    });

    it('rejects invalid registration format', () => {
      const payload = {
        body: {
          registrationNumber: 'INVALID_REG',
          capacity: 32
        }
      };
      const parsed = createVehicleSchema.safeParse(payload);
      expect(parsed.success).toBe(false);
    });

    it('rejects non-positive capacity', () => {
      const payload = {
        body: {
          registrationNumber: 'TN 56 K 1146',
          capacity: 0
        }
      };
      const parsed = createVehicleSchema.safeParse(payload);
      expect(parsed.success).toBe(false);
    });
  });

  describe('createRouteSchema', () => {
    it('validates a valid route payload', () => {
      const payload = {
        body: {
          name: 'Route 4 - Erode North',
          routeNumber: 'R-04',
          driverName: 'Moorthy',
          driverPhone: '9876543210',
          capacity: 30
        }
      };
      const parsed = createRouteSchema.safeParse(payload);
      expect(parsed.success).toBe(true);
    });

    it('rejects route with short name or invalid phone', () => {
      const payload = {
        body: {
          name: 'A',
          driverPhone: '123'
        }
      };
      const parsed = createRouteSchema.safeParse(payload);
      expect(parsed.success).toBe(false);
    });
  });

  describe('createStopSchema', () => {
    it('validates a valid stop payload', () => {
      const payload = {
        params: {
          routeId: '11111111-1111-4111-8111-111111111111'
        },
        body: {
          stopName: 'Central Bus Stand',
          pickupTime: '07:45',
          dropTime: '16:15',
          stopOrder: 1
        }
      };
      const parsed = createStopSchema.safeParse(payload);
      expect(parsed.success).toBe(true);
    });

    it('rejects invalid time format', () => {
      const payload = {
        params: {
          routeId: '11111111-1111-4111-8111-111111111111'
        },
        body: {
          stopName: 'Central Bus Stand',
          pickupTime: '25:70'
        }
      };
      const parsed = createStopSchema.safeParse(payload);
      expect(parsed.success).toBe(false);
    });
  });

  describe('assignStudentSchema', () => {
    it('validates a valid assignment payload', () => {
      const payload = {
        params: {
          routeId: '11111111-1111-4111-8111-111111111111'
        },
        body: {
          studentId: '22222222-2222-4222-8222-222222222222',
          pickupStopId: '33333333-3333-4333-8333-333333333333'
        }
      };
      const parsed = assignStudentSchema.safeParse(payload);
      expect(parsed.success).toBe(true);
    });

    it('rejects malformed UUIDs', () => {
      const payload = {
        params: {
          routeId: 'invalid-uuid'
        },
        body: {
          studentId: 'not-a-uuid'
        }
      };
      const parsed = assignStudentSchema.safeParse(payload);
      expect(parsed.success).toBe(false);
    });
  });
});
