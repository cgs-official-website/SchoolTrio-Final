import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { validateFeeDueDate } from './FeeManagement.jsx';
import { getTodayDateString } from '../../utils/validationUtils.js';

describe('FPM-001: Frontend Fee Due Date Validation & Regression Suite', () => {
  const filePath = path.resolve(__dirname, 'FeeManagement.jsx');
  const fileContent = fs.readFileSync(filePath, 'utf-8');

  // Reference date: 2026-10-12
  const FIXED_TODAY = '2026-10-12';
  const PAST_DATE = '2026-10-11';
  const FUTURE_DATE = '2026-10-13';

  // ============================================================
  // UNIT TESTS: validateFeeDueDate
  // ============================================================
  describe('1. validateFeeDueDate logic', () => {
    it('rejects a past date with the standard error message', () => {
      const result = validateFeeDueDate(PAST_DATE, FIXED_TODAY);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Due date cannot be in the past.');
    });

    it('accepts today\'s date', () => {
      const result = validateFeeDueDate(FIXED_TODAY, FIXED_TODAY);
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    it('accepts a future date', () => {
      const result = validateFeeDueDate(FUTURE_DATE, FIXED_TODAY);
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    it('rejects an empty or missing date string', () => {
      const emptyResult = validateFeeDueDate('', FIXED_TODAY);
      expect(emptyResult.valid).toBe(false);
      expect(emptyResult.error).toBe('Due date is required.');

      const nullResult = validateFeeDueDate(null, FIXED_TODAY);
      expect(nullResult.valid).toBe(false);
      expect(nullResult.error).toBe('Due date is required.');

      const undefinedResult = validateFeeDueDate(undefined, FIXED_TODAY);
      expect(undefinedResult.valid).toBe(false);
      expect(undefinedResult.error).toBe('Due date is required.');
    });

    it('defaults comparison to getTodayDateString() when todayStr is omitted', () => {
      const realToday = getTodayDateString();
      const result = validateFeeDueDate(realToday);
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();

      const pastHistorical = '2020-01-01';
      const pastResult = validateFeeDueDate(pastHistorical);
      expect(pastResult.valid).toBe(false);
      expect(pastResult.error).toBe('Due date cannot be in the past.');
    });
  });

  // ============================================================
  // STATIC CODE & TEMPLATE REGRESSION TESTS
  // ============================================================
  describe('2. FeeManagement Component Lifecycle & Template Inspection', () => {
    it('verifies getTodayDateString is imported from validationUtils', () => {
      expect(fileContent).toContain("import { getTodayDateString } from '../../utils/validationUtils';");
    });

    it('verifies newFee state is initialized with getTodayDateString()', () => {
      expect(fileContent).toMatch(/dueDate:\s*getTodayDateString\(\)/);
    });

    it('verifies due date input has min={getTodayDateString()}', () => {
      // Must contain min={getTodayDateString()} on the date input
      expect(fileContent).toMatch(/<input[^>]*type="date"[^>]*min=\{getTodayDateString\(\)\}/);
    });

    it('verifies handleCreate validates due date before fee creation and stops submission on error', () => {
      // Must validate using validateFeeDueDate
      expect(fileContent).toContain('const dateValidation = validateFeeDueDate(newFee.dueDate);');
      // Must toast error and return early
      expect(fileContent).toMatch(/if\s*\(!dateValidation\.valid\)\s*\{\s*toast\.error\(dateValidation\.error\);\s*return;\s*\}/);
    });

    it('verifies fee creation API is only called after validation passes', () => {
      const handleCreateBody = fileContent.slice(fileContent.indexOf('const handleCreate ='));
      const validationIndex = handleCreateBody.indexOf('validateFeeDueDate');
      const apiCallIndex = handleCreateBody.indexOf('feesApi.createFeeStructure');

      expect(validationIndex).toBeGreaterThan(-1);
      expect(apiCallIndex).toBeGreaterThan(-1);
      expect(validationIndex).toBeLessThan(apiCallIndex);
    });

    it('verifies form reset restores dueDate to getTodayDateString()', () => {
      expect(fileContent).toContain('dueDate: getTodayDateString()');
      expect(fileContent).toContain("setNewFee({ name: '', amount: '', dueDate: getTodayDateString(), classId: '', collectionPeriodId: '', collectionPeriodName: '', customData: {} });");
    });
  });
});
