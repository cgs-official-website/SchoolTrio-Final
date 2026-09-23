import { describe, it, expect } from 'vitest';
import * as feeSchemas from '../../../src/modules/fees/fee.schemas.js';

describe('Unit: Fee Validation Schemas — Phase 4C.6-A', () => {
  const VALID_UUID_1 = '11111111-1111-4111-8111-111111111111';
  const VALID_UUID_2 = '22222222-2222-4222-8222-222222222222';

  // ============================================================
  // 1. Calendar Date & Decimal Amount Validation Helpers
  // ============================================================
  describe('Helper: calendarDateSchema', () => {
    it('accepts valid ISO calendar dates', () => {
      expect(feeSchemas.calendarDateSchema.safeParse('2026-09-10').success).toBe(true);
      expect(feeSchemas.calendarDateSchema.safeParse('2024-02-29').success).toBe(true); // Leap year
      expect(feeSchemas.calendarDateSchema.safeParse('2026-12-31').success).toBe(true);
    });

    it('rejects malformed date strings', () => {
      expect(feeSchemas.calendarDateSchema.safeParse('10-09-2026').success).toBe(false);
      expect(feeSchemas.calendarDateSchema.safeParse('2026/09/10').success).toBe(false);
      expect(feeSchemas.calendarDateSchema.safeParse('invalid-date').success).toBe(false);
      expect(feeSchemas.calendarDateSchema.safeParse('').success).toBe(false);
    });

    it('rejects non-existent calendar dates', () => {
      expect(feeSchemas.calendarDateSchema.safeParse('2026-02-29').success).toBe(false); // 2026 not leap
      expect(feeSchemas.calendarDateSchema.safeParse('2026-04-31').success).toBe(false); // April has 30 days
      expect(feeSchemas.calendarDateSchema.safeParse('2026-13-01').success).toBe(false); // Month 13
    });
  });

  describe('Helper: decimalAmountSchema', () => {
    it('accepts valid positive numbers and strings with at most 2 decimal places', () => {
      expect(feeSchemas.decimalAmountSchema.safeParse(50000).success).toBe(true);
      expect(feeSchemas.decimalAmountSchema.safeParse(1250.5).success).toBe(true);
      expect(feeSchemas.decimalAmountSchema.safeParse(0.01).success).toBe(true);
      expect(feeSchemas.decimalAmountSchema.safeParse('50000').success).toBe(true);
      expect(feeSchemas.decimalAmountSchema.safeParse('1250.75').success).toBe(true);
      expect(feeSchemas.decimalAmountSchema.safeParse(99999999.99).success).toBe(true);
    });

    it('rejects zero, negative amounts, and excess decimals', () => {
      expect(feeSchemas.decimalAmountSchema.safeParse(0).success).toBe(false);
      expect(feeSchemas.decimalAmountSchema.safeParse(-50).success).toBe(false);
      expect(feeSchemas.decimalAmountSchema.safeParse(50.123).success).toBe(false);
      expect(feeSchemas.decimalAmountSchema.safeParse('50.123').success).toBe(false);
      expect(feeSchemas.decimalAmountSchema.safeParse(100000000).success).toBe(false);
    });

    it('rejects NaN, Infinity, and malformed strings', () => {
      expect(feeSchemas.decimalAmountSchema.safeParse(NaN).success).toBe(false);
      expect(feeSchemas.decimalAmountSchema.safeParse(Infinity).success).toBe(false);
      expect(feeSchemas.decimalAmountSchema.safeParse(-Infinity).success).toBe(false);
      expect(feeSchemas.decimalAmountSchema.safeParse('abc').success).toBe(false);
      expect(feeSchemas.decimalAmountSchema.safeParse('50.5.5').success).toBe(false);
    });
  });

  // ============================================================
  // 2. Fee Collection Period Schemas
  // ============================================================
  describe('FeeCollectionPeriod Schemas', () => {
    it('validates correct createFeeCollectionPeriod payload', () => {
      const payload = {
        name: 'Term 1 2026-2027',
        dueDate: '2026-10-15',
        displayOrder: 1
      };
      const result = feeSchemas.createFeeCollectionPeriodSchema.body.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.displayOrder).toBe(1);
    });

    it('defaults displayOrder to 0 if omitted', () => {
      const payload = {
        name: 'Term 2 2026-2027',
        dueDate: '2027-01-15'
      };
      const result = feeSchemas.createFeeCollectionPeriodSchema.body.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.displayOrder).toBe(0);
    });

    it('rejects create with missing or invalid fields', () => {
      expect(feeSchemas.createFeeCollectionPeriodSchema.body.safeParse({ dueDate: '2026-10-15' }).success).toBe(false);
      expect(feeSchemas.createFeeCollectionPeriodSchema.body.safeParse({ name: '', dueDate: '2026-10-15' }).success).toBe(false);
      expect(feeSchemas.createFeeCollectionPeriodSchema.body.safeParse({ name: 'A'.repeat(101), dueDate: '2026-10-15' }).success).toBe(false);
      expect(feeSchemas.createFeeCollectionPeriodSchema.body.safeParse({ name: 'Valid', dueDate: 'invalid-date' }).success).toBe(false);
      expect(feeSchemas.createFeeCollectionPeriodSchema.body.safeParse({ name: 'Valid', dueDate: '2026-10-15', displayOrder: -1 }).success).toBe(false);
    });

    it('validates updateFeeCollectionPeriod payload', () => {
      const validPartial = { name: 'Updated Term 1' };
      const result = feeSchemas.updateFeeCollectionPeriodSchema.body.safeParse(validPartial);
      expect(result.success).toBe(true);
    });

    it('rejects empty updateFeeCollectionPeriod payload', () => {
      const emptyPayload = {};
      const result = feeSchemas.updateFeeCollectionPeriodSchema.body.safeParse(emptyPayload);
      expect(result.success).toBe(false);
    });

    it('validates feePeriodParamsSchema', () => {
      expect(feeSchemas.feePeriodParamsSchema.params.safeParse({ id: VALID_UUID_1 }).success).toBe(true);
      expect(feeSchemas.feePeriodParamsSchema.params.safeParse({ id: 'invalid-uuid' }).success).toBe(false);
    });
  });

  // ============================================================
  // 3. Fee Structure Schemas
  // ============================================================
  describe('FeeStructure Schemas', () => {
    it('validates correct createFeeStructure payload', () => {
      const payload = {
        name: 'Annual Tuition Fee Grade 10',
        amount: 50000,
        dueDate: '2026-10-15',
        classId: VALID_UUID_1,
        collectionPeriodId: VALID_UUID_2,
        customData: { discountCategory: 'General' }
      };
      const result = feeSchemas.createFeeStructureSchema.body.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.name).toBe('Annual Tuition Fee Grade 10');
      expect(result.data.amount).toBe(50000);
      expect(result.data.classId).toBe(VALID_UUID_1);
      expect(result.data.collectionPeriodId).toBe(VALID_UUID_2);
    });

    it('allows collectionPeriodId and customData to be null or omitted', () => {
      const payload = {
        name: 'Admission Fee',
        amount: 5000.50,
        dueDate: '2026-10-15',
        classId: VALID_UUID_1
      };
      const result = feeSchemas.createFeeStructureSchema.body.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('rejects createFeeStructure with invalid amount or dates', () => {
      expect(feeSchemas.createFeeStructureSchema.body.safeParse({
        name: 'Fee',
        amount: -500,
        dueDate: '2026-10-15',
        classId: VALID_UUID_1
      }).success).toBe(false);

      expect(feeSchemas.createFeeStructureSchema.body.safeParse({
        name: 'Fee',
        amount: 500.123,
        dueDate: '2026-10-15',
        classId: VALID_UUID_1
      }).success).toBe(false);

      expect(feeSchemas.createFeeStructureSchema.body.safeParse({
        name: 'Fee',
        amount: 500,
        dueDate: '2026-02-30',
        classId: VALID_UUID_1
      }).success).toBe(false);

      expect(feeSchemas.createFeeStructureSchema.body.safeParse({
        name: 'Fee',
        amount: 500,
        dueDate: '2026-10-15',
        classId: 'invalid-uuid'
      }).success).toBe(false);
    });

    it('validates updateFeeStructure payload', () => {
      const validUpdate = { amount: 55000, dueDate: '2026-11-01' };
      const result = feeSchemas.updateFeeStructureSchema.body.safeParse(validUpdate);
      expect(result.success).toBe(true);
    });

    it('rejects empty updateFeeStructure payload', () => {
      const result = feeSchemas.updateFeeStructureSchema.body.safeParse({});
      expect(result.success).toBe(false);
    });

    it('validates feeStructureParamsSchema', () => {
      expect(feeSchemas.feeStructureParamsSchema.params.safeParse({ id: VALID_UUID_1 }).success).toBe(true);
      expect(feeSchemas.feeStructureParamsSchema.params.safeParse({ id: 'not-uuid' }).success).toBe(false);
    });
  });
});
