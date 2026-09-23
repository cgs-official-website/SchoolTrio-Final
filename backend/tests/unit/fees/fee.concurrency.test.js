import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as feeService from '../../../src/modules/fees/fee.service.js';
import * as feeRepository from '../../../src/modules/fees/fee.repository.js';
import * as auditRepository from '../../../src/modules/audit/audit.repository.js';

vi.mock('../../../src/modules/fees/fee.repository.js');
vi.mock('../../../src/modules/audit/audit.repository.js');
vi.mock('../../../src/database/prisma.client.js', () => {
  const mockPrisma = {
    $transaction: vi.fn(async (cb) => cb(mockPrisma))
  };
  return { prisma: mockPrisma };
});

describe('Unit: Fee Domain Concurrency & Row-Locking Safety — Phase 4C.6-A', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const CLASS_ID = '22222222-2222-4222-8222-222222222222';
  const PERIOD_ID = '33333333-3333-4333-8333-333333333333';
  const FEE_STRUCTURE_ID = '44444444-4444-4444-8444-444444444444';

  const STUDENT_1_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const STUDENT_2_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const STUDENT_3_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  const ACTOR = {
    id: 'admin-1',
    email: 'admin@school.edu',
    systemRole: 'SCHOOL_ADMIN'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    auditRepository.createAuditLog.mockResolvedValue({ id: 'audit-1' });
  });

  it('acquires exclusive row-level lock (FOR UPDATE) before deleting a FeeStructure', async () => {
    const existingFS = { id: FEE_STRUCTURE_ID, schoolId: SCHOOL_ID };
    feeRepository.findFeeStructureByIdForUpdate.mockResolvedValue(existingFS);
    feeRepository.countFeeStructureInvoices.mockResolvedValue(0);
    feeRepository.deleteFeeStructure.mockResolvedValue(existingFS);

    await feeService.deleteFeeStructure(SCHOOL_ID, FEE_STRUCTURE_ID, ACTOR);

    expect(feeRepository.findFeeStructureByIdForUpdate).toHaveBeenCalledWith(
      SCHOOL_ID,
      FEE_STRUCTURE_ID,
      expect.anything()
    );
  });

  it('acquires exclusive row-level lock (FOR UPDATE) before deleting a FeeCollectionPeriod', async () => {
    const existingPeriod = { id: PERIOD_ID, schoolId: SCHOOL_ID };
    feeRepository.findPeriodByIdForUpdate.mockResolvedValue(existingPeriod);
    feeRepository.countPeriodReferences.mockResolvedValue({ feeStructuresCount: 0, invoicesCount: 0, total: 0 });
    feeRepository.deletePeriod.mockResolvedValue(existingPeriod);

    await feeService.deleteCollectionPeriod(SCHOOL_ID, PERIOD_ID, ACTOR);

    expect(feeRepository.findPeriodByIdForUpdate).toHaveBeenCalledWith(
      SCHOOL_ID,
      PERIOD_ID,
      expect.anything()
    );
  });

  it('acquires exclusive row-level lock (FOR UPDATE) before updating a FeeStructure', async () => {
    const existingFS = {
      id: FEE_STRUCTURE_ID,
      schoolId: SCHOOL_ID,
      amount: 50000,
      dueDate: '2026-10-15'
    };
    feeRepository.findFeeStructureByIdForUpdate.mockResolvedValue(existingFS);
    feeRepository.updateFeeStructure.mockResolvedValue({ ...existingFS, amount: 52000 });

    await feeService.updateFeeStructure(SCHOOL_ID, FEE_STRUCTURE_ID, { amount: 52000 }, ACTOR);

    expect(feeRepository.findFeeStructureByIdForUpdate).toHaveBeenCalledWith(
      SCHOOL_ID,
      FEE_STRUCTURE_ID,
      expect.anything()
    );
  });

  it('filters out students who already have active invoices for the fee structure to prevent duplicate invoice issuance', async () => {
    const payload = {
      name: 'Exam Fee',
      amount: 1500,
      dueDate: '2026-11-15',
      classId: CLASS_ID
    };

    const createdFS = {
      id: FEE_STRUCTURE_ID,
      schoolId: SCHOOL_ID,
      ...payload
    };

    feeRepository.findClassInTenant.mockResolvedValue({ id: CLASS_ID, schoolId: SCHOOL_ID });
    feeRepository.createFeeStructure.mockResolvedValue(createdFS);

    // Class has 3 students
    feeRepository.findActiveStudentsByClass.mockResolvedValue([
      { id: STUDENT_1_ID, firstName: 'Student 1', status: 'Active' },
      { id: STUDENT_2_ID, firstName: 'Student 2', status: 'Active' },
      { id: STUDENT_3_ID, firstName: 'Student 3', status: 'Active' }
    ]);

    // STUDENT_1_ID and STUDENT_2_ID already have active invoices
    feeRepository.findExistingInvoiceStudentIds.mockResolvedValue(new Set([STUDENT_1_ID, STUDENT_2_ID]));
    feeRepository.createInvoicesBatch.mockResolvedValue({ count: 1 });

    const result = await feeService.createFeeStructure(SCHOOL_ID, payload, ACTOR);

    expect(result.invoicesGenerated).toBe(1);

    // Only STUDENT_3_ID should be in the batch creation list
    expect(feeRepository.createInvoicesBatch).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          schoolId: SCHOOL_ID,
          studentId: STUDENT_3_ID,
          feeStructureId: FEE_STRUCTURE_ID,
          amount: 1500
        })
      ],
      expect.anything()
    );
  });
});
