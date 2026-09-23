import { describe, it, expect } from 'vitest';
import {
  listCanteenRequestsSchema,
  canteenRequestIdParamSchema,
  createCanteenRequestSchema,
  updateCanteenRequestStatusSchema
} from '../../../src/modules/canteen/canteen.schemas.js';

describe('Canteen Zod Schemas Unit Tests (Phase CA.2)', () => {
  const VALID_UUID = '11111111-1111-4111-8111-111111111111';

  describe('1. listCanteenRequestsSchema', () => {
    it('validates allowed query parameters', () => {
      const validQuery = {
        status: 'Pending',
        mealType: 'Breakfast',
        date: '2026-09-16',
        search: 'John Doe',
        studentId: VALID_UUID,
        limit: '20',
        page: '1'
      };

      const result = listCanteenRequestsSchema.safeParse({ query: validQuery });
      expect(result.success).toBe(true);
    });

    it('rejects invalid status', () => {
      const result = listCanteenRequestsSchema.safeParse({
        query: { status: 'InvalidStatus' }
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid mealType', () => {
      const result = listCanteenRequestsSchema.safeParse({
        query: { mealType: 'Dinner' }
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid date format', () => {
      const result = listCanteenRequestsSchema.safeParse({
        query: { date: '16-09-2026' }
      });
      expect(result.success).toBe(false);
    });
  });

  describe('2. canteenRequestIdParamSchema', () => {
    it('accepts valid UUID param', () => {
      const result = canteenRequestIdParamSchema.safeParse({
        params: { id: VALID_UUID }
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid UUID param', () => {
      const result = canteenRequestIdParamSchema.safeParse({
        params: { id: 'invalid-uuid-123' }
      });
      expect(result.success).toBe(false);
    });
  });

  describe('3. createCanteenRequestSchema', () => {
    it('accepts valid creation payload with Breakfast', () => {
      const result = createCanteenRequestSchema.safeParse({
        body: {
          studentId: VALID_UUID,
          mealType: 'Breakfast',
          date: '2026-09-16'
        }
      });
      expect(result.success).toBe(true);
    });

    it('accepts valid creation payload with Lunch without explicit date', () => {
      const result = createCanteenRequestSchema.safeParse({
        body: {
          studentId: VALID_UUID,
          mealType: 'Lunch'
        }
      });
      expect(result.success).toBe(true);
    });

    it('rejects unsupported mealType (Dinner / Snacks)', () => {
      const result = createCanteenRequestSchema.safeParse({
        body: {
          studentId: VALID_UUID,
          mealType: 'Snacks'
        }
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing studentId', () => {
      const result = createCanteenRequestSchema.safeParse({
        body: {
          mealType: 'Breakfast'
        }
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid date format', () => {
      const result = createCanteenRequestSchema.safeParse({
        body: {
          studentId: VALID_UUID,
          mealType: 'Breakfast',
          date: '2026/09/16'
        }
      });
      expect(result.success).toBe(false);
    });
  });

  describe('4. updateCanteenRequestStatusSchema', () => {
    it('accepts valid transition statuses', () => {
      ['Approved', 'Delivered', 'Cancelled'].forEach((status) => {
        const result = updateCanteenRequestStatusSchema.safeParse({
          params: { id: VALID_UUID },
          body: { status }
        });
        expect(result.success).toBe(true);
      });
    });

    it('rejects Pending status in update body', () => {
      const result = updateCanteenRequestStatusSchema.safeParse({
        params: { id: VALID_UUID },
        body: { status: 'Pending' }
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid status strings', () => {
      const result = updateCanteenRequestStatusSchema.safeParse({
        params: { id: VALID_UUID },
        body: { status: 'Unknown' }
      });
      expect(result.success).toBe(false);
    });
  });
});
