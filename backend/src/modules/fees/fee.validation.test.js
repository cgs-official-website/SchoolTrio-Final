import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createFeeStructureSchema,
  calendarDateSchema,
  futureOrTodayDateSchema,
  getAuthoritativeTodayString
} from './fee.schemas.js';
import * as feeService from './fee.service.js';
import * as feeRepository from './fee.repository.js';
import { prisma } from '../../database/prisma.client.js';
import { ValidationError } from '../../utils/app-error.js';

vi.mock('./fee.repository.js');
vi.mock('../../database/prisma.client.js', () => ({
  prisma: {
    $transaction: vi.fn(),
    school: {
      findFirst: vi.fn()
    }
  }
}));
vi.mock('../audit/audit.repository.js', () => ({
  createAuditLog: vi.fn().mockResolvedValue({})
}));

describe('FPM-001: Fee Due Date Validation & Regression Suite', () => {
  // Deterministic reference anchor: 2026-10-12 12:00:00 UTC (17:30 IST)
  const FIXED_NOW = new Date('2026-10-12T12:00:00.000Z');
  const TODAY_STR = '2026-10-12';
  const YESTERDAY_STR = '2026-10-11';
  const TOMORROW_STR = '2026-10-13';
  const TENANT_ID = '11111111-1111-4111-8111-111111111111';
  const CLASS_ID = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ============================================================
  // BACKEND SCHEMA TESTS
  // ============================================================
  describe('Backend Schema Tests (createFeeStructureSchema & futureOrTodayDateSchema)', () => {
    const validBasePayload = {
      name: 'Term 1 Tuition Fee',
      amount: 1500,
      dueDate: TODAY_STR,
      classId: CLASS_ID
    };

    it('1. Rejects a date before the authoritative current calendar date', async () => {
      const payload = { ...validBasePayload, dueDate: YESTERDAY_STR };
      const result = await createFeeStructureSchema.body.safeParseAsync(payload);

      expect(result.success).toBe(false);
      const dueDateError = result.error.errors.find(e => e.path.includes('dueDate'));
      expect(dueDateError).toBeDefined();
      expect(dueDateError.message).toBe('Due date cannot be in the past');
    });

    it('2. Accepts today\'s calendar date', async () => {
      const payload = { ...validBasePayload, dueDate: TODAY_STR };
      const result = await createFeeStructureSchema.body.safeParseAsync(payload);

      expect(result.success).toBe(true);
      expect(result.data.dueDate).toBe(TODAY_STR);
    });

    it('3. Accepts a future calendar date', async () => {
      const payload = { ...validBasePayload, dueDate: TOMORROW_STR };
      const result = await createFeeStructureSchema.body.safeParseAsync(payload);

      expect(result.success).toBe(true);
      expect(result.data.dueDate).toBe(TOMORROW_STR);
    });

    it('4. Rejects a malformed date string', async () => {
      const malformedDates = ['12-10-2026', '2026/10/12', '2026-10', 'invalid-date'];
      for (const badDate of malformedDates) {
        const payload = { ...validBasePayload, dueDate: badDate };
        const result = await createFeeStructureSchema.body.safeParseAsync(payload);

        expect(result.success).toBe(false);
        const dueDateError = result.error.errors.find(e => e.path.includes('dueDate'));
        expect(dueDateError).toBeDefined();
      }
    });

    it('5. Rejects an impossible calendar date such as 2026-02-31', async () => {
      const impossibleDates = ['2026-02-31', '2026-04-31', '2026-11-31'];
      for (const badDate of impossibleDates) {
        const payload = { ...validBasePayload, dueDate: badDate };
        const result = await createFeeStructureSchema.body.safeParseAsync(payload);

        expect(result.success).toBe(false);
        const dueDateError = result.error.errors.find(e => e.path.includes('dueDate'));
        expect(dueDateError).toBeDefined();
        expect(dueDateError.message).toBe('Due date must be a valid calendar date');
      }
    });

    it('6. Rejects a missing dueDate', async () => {
      const { dueDate: _, ...missingDueDatePayload } = validBasePayload;
      const result = await createFeeStructureSchema.body.safeParseAsync(missingDueDatePayload);

      expect(result.success).toBe(false);
      const dueDateError = result.error.errors.find(e => e.path.includes('dueDate'));
      expect(dueDateError).toBeDefined();
      expect(dueDateError.message).toBe('Due date is required');
    });

    it('7. Preserves calendarDateSchema for existing historical/update operations without past date restrictions', async () => {
      // Historical/update schemas use calendarDateSchema, allowing historical dates if needed
      const historicalDate = '2020-01-01';
      const result = await calendarDateSchema.safeParseAsync(historicalDate);
      expect(result.success).toBe(true);
      expect(result.data).toBe(historicalDate);
    });
  });

  // ============================================================
  // BACKEND SERVICE TESTS (Defense in Depth)
  // ============================================================
  describe('Backend Service Tests (createFeeStructure Defense in Depth)', () => {
    const actor = { email: 'admin@school.com', role: 'ADMIN' };

    it('8. Rejects a past date before class verification and before entering transaction', async () => {
      prisma.school.findFirst.mockResolvedValue({ timezone: 'Asia/Kolkata' });

      const pastPayload = {
        name: 'Tuition Fee Past',
        amount: 2000,
        dueDate: YESTERDAY_STR,
        classId: CLASS_ID
      };

      await expect(
        feeService.createFeeStructure(TENANT_ID, pastPayload, actor)
      ).rejects.toThrow(ValidationError);

      await expect(
        feeService.createFeeStructure(TENANT_ID, pastPayload, actor)
      ).rejects.toThrow('Due date cannot be in the past');

      // Verify zero repository reads or writes executed
      expect(feeRepository.findClassInTenant).not.toHaveBeenCalled();
      expect(feeRepository.createFeeStructure).not.toHaveBeenCalled();
      expect(feeRepository.createInvoicesBatch).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('9. Rejects past date when school timezone is non-default and resolved correctly', async () => {
      // Suppose school is in Tokyo (UTC+9) where local date is 2026-10-13 when UTC is 2026-10-12 16:00
      vi.setSystemTime(new Date('2026-10-12T16:00:00.000Z'));
      // In Tokyo (+9), it is 2026-10-13 01:00:00. A date of '2026-10-12' is past for Tokyo.
      prisma.school.findFirst.mockResolvedValue({ timezone: 'Asia/Tokyo' });

      const payload = {
        name: 'Tuition Fee Tokyo',
        amount: 1500,
        dueDate: '2026-10-12',
        classId: CLASS_ID
      };

      await expect(
        feeService.createFeeStructure(TENANT_ID, payload, actor)
      ).rejects.toThrow('Due date cannot be in the past');

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('10. Accepts today\'s date and executes atomic fee structure and invoice creation', async () => {
      prisma.school.findFirst.mockResolvedValue({ timezone: 'Asia/Kolkata' });
      feeRepository.findClassInTenant.mockResolvedValue({ id: CLASS_ID, name: 'Grade 10-A' });

      const mockFeeStructure = {
        id: '33333333-3333-4333-8333-333333333333',
        schoolId: TENANT_ID,
        name: 'Term 1 Fee',
        amount: 1500,
        dueDate: TODAY_STR,
        classId: CLASS_ID
      };
      const mockActiveStudents = [
        { id: 's1', firstName: 'Alice' },
        { id: 's2', firstName: 'Bob' }
      ];

      feeRepository.createFeeStructure.mockResolvedValue(mockFeeStructure);
      feeRepository.findActiveStudentsByClass.mockResolvedValue(mockActiveStudents);
      feeRepository.findExistingInvoiceStudentIds.mockResolvedValue(new Set());
      feeRepository.createInvoicesBatch.mockResolvedValue({ count: 2 });

      // Mock prisma.$transaction to invoke the callback
      prisma.$transaction.mockImplementation(async (cb) => cb({}));

      const payload = {
        name: 'Term 1 Fee',
        amount: 1500,
        dueDate: TODAY_STR,
        classId: CLASS_ID
      };

      const result = await feeService.createFeeStructure(TENANT_ID, payload, actor);

      expect(result).toBeDefined();
      expect(result.id).toBe(mockFeeStructure.id);
      expect(result.invoicesGenerated).toBe(2);
      expect(feeRepository.createFeeStructure).toHaveBeenCalled();
      expect(feeRepository.createInvoicesBatch).toHaveBeenCalled();
    });

    it('11. Accepts a future date and executes atomic fee structure and invoice creation', async () => {
      prisma.school.findFirst.mockResolvedValue({ timezone: 'Asia/Kolkata' });
      feeRepository.findClassInTenant.mockResolvedValue({ id: CLASS_ID, name: 'Grade 10-A' });

      const mockFeeStructure = {
        id: '44444444-4444-4444-8444-444444444444',
        schoolId: TENANT_ID,
        name: 'Term 2 Fee',
        amount: 2500,
        dueDate: TOMORROW_STR,
        classId: CLASS_ID
      };

      feeRepository.createFeeStructure.mockResolvedValue(mockFeeStructure);
      feeRepository.findActiveStudentsByClass.mockResolvedValue([]);
      feeRepository.findExistingInvoiceStudentIds.mockResolvedValue(new Set());
      feeRepository.createInvoicesBatch.mockResolvedValue({ count: 0 });

      prisma.$transaction.mockImplementation(async (cb) => cb({}));

      const payload = {
        name: 'Term 2 Fee',
        amount: 2500,
        dueDate: TOMORROW_STR,
        classId: CLASS_ID
      };

      const result = await feeService.createFeeStructure(TENANT_ID, payload, actor);

      expect(result).toBeDefined();
      expect(result.id).toBe(mockFeeStructure.id);
      expect(result.invoicesGenerated).toBe(0);
      expect(feeRepository.createFeeStructure).toHaveBeenCalled();
    });
  });

  // ============================================================
  // TIMEZONE UTILITY UNIT TESTS
  // ============================================================
  describe('Authoritative Today Date Utility (getAuthoritativeTodayString)', () => {
    it('12. Formats date accurately in canonical YYYY-MM-DD for standard timezone', () => {
      const todayStr = getAuthoritativeTodayString('Asia/Kolkata');
      expect(todayStr).toBe('2026-10-12');
      expect(todayStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('13. Gracefully falls back to Asia/Kolkata when an invalid timezone string is provided', () => {
      const todayStr = getAuthoritativeTodayString('INVALID_TIMEZONE_STRING');
      expect(todayStr).toBe('2026-10-12');
    });
  });
});
