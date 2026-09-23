import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as feeService from '../../../src/modules/fees/fee.service.js';
import * as feeRepository from '../../../src/modules/fees/fee.repository.js';
import * as auditRepository from '../../../src/modules/audit/audit.repository.js';
import {
  NotFoundError,
  ConflictError,
  RelationshipConflictError
} from '../../../src/utils/app-error.js';

vi.mock('../../../src/modules/fees/fee.repository.js');
vi.mock('../../../src/modules/audit/audit.repository.js');
vi.mock('../../../src/database/prisma.client.js', () => {
  const mockPrisma = {
    $transaction: vi.fn(async (cb) => cb(mockPrisma))
  };
  return { prisma: mockPrisma };
});

describe('Unit: Fee Service Business Rules & Invariants — Phase 4C.6-A', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const CLASS_ID = '22222222-2222-4222-8222-222222222222';
  const PERIOD_ID = '33333333-3333-4333-8333-333333333333';
  const FEE_STRUCTURE_ID = '44444444-4444-4444-8444-444444444444';
  const STUDENT_1_ID = '55555555-5555-4555-8555-555555555555';
  const STUDENT_2_ID = '66666666-6666-4666-8666-666666666666';

  const ACTOR = {
    id: 'admin-1',
    email: 'admin@school.edu',
    systemRole: 'SCHOOL_ADMIN'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    auditRepository.createAuditLog.mockResolvedValue({ id: 'audit-1' });
  });

  // ============================================================
  // 1. Fee Collection Periods
  // ============================================================
  describe('FeeCollectionPeriod Service', () => {
    it('lists collection periods with pagination', async () => {
      const mockPeriods = [{ id: PERIOD_ID, name: 'Term 1', schoolId: SCHOOL_ID }];
      feeRepository.findPeriods.mockResolvedValue({ periods: mockPeriods, total: 1 });

      const result = await feeService.listCollectionPeriods(SCHOOL_ID, { page: 1, limit: 20 });
      expect(result.periods).toEqual(mockPeriods);
      expect(result.pagination.total).toBe(1);
      expect(result.pagination.page).toBe(1);
    });

    it('retrieves collection period by ID or throws NotFoundError', async () => {
      feeRepository.findPeriodById.mockResolvedValueOnce({ id: PERIOD_ID, schoolId: SCHOOL_ID });
      const found = await feeService.getCollectionPeriodById(SCHOOL_ID, PERIOD_ID);
      expect(found.id).toBe(PERIOD_ID);

      feeRepository.findPeriodById.mockResolvedValueOnce(null);
      await expect(feeService.getCollectionPeriodById(SCHOOL_ID, 'non-existent')).rejects.toThrow(NotFoundError);
    });

    it('creates collection period and emits audit log', async () => {
      const payload = { name: 'Term 1', dueDate: '2026-10-15', displayOrder: 1 };
      const created = { id: PERIOD_ID, schoolId: SCHOOL_ID, ...payload };
      feeRepository.createPeriod.mockResolvedValue(created);

      const result = await feeService.createCollectionPeriod(SCHOOL_ID, payload, ACTOR);
      expect(result).toEqual(created);
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          schoolId: SCHOOL_ID,
          entityType: 'FeeCollectionPeriod',
          actionPerformed: 'CREATE_FEE_COLLECTION_PERIOD'
        })
      );
    });

    it('updates collection period with changes and emits audit log', async () => {
      const existing = { id: PERIOD_ID, schoolId: SCHOOL_ID, name: 'Term 1', dueDate: '2026-10-15', displayOrder: 0 };
      feeRepository.findPeriodByIdForUpdate.mockResolvedValue(existing);
      feeRepository.updatePeriod.mockResolvedValue({ ...existing, name: 'Term 1 Updated' });

      const updated = await feeService.updateCollectionPeriod(SCHOOL_ID, PERIOD_ID, { name: 'Term 1 Updated' }, ACTOR);
      expect(updated.name).toBe('Term 1 Updated');
      expect(feeRepository.updatePeriod).toHaveBeenCalled();
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actionPerformed: 'UPDATE_FEE_COLLECTION_PERIOD',
          modifiedFields: { name: { old: 'Term 1', new: 'Term 1 Updated' } }
        })
      );
    });

    it('performs no-op and skips DB write/audit if update payload matches existing values', async () => {
      const existing = { id: PERIOD_ID, schoolId: SCHOOL_ID, name: 'Term 1', dueDate: '2026-10-15', displayOrder: 0 };
      feeRepository.findPeriodByIdForUpdate.mockResolvedValue(existing);

      const result = await feeService.updateCollectionPeriod(SCHOOL_ID, PERIOD_ID, { name: 'Term 1' }, ACTOR);
      expect(result).toEqual(existing);
      expect(feeRepository.updatePeriod).not.toHaveBeenCalled();
      expect(auditRepository.createAuditLog).not.toHaveBeenCalled();
    });

    it('blocks deletion of collection period referenced by fee structures or invoices (409)', async () => {
      const existing = { id: PERIOD_ID, schoolId: SCHOOL_ID, name: 'Term 1' };
      feeRepository.findPeriodByIdForUpdate.mockResolvedValue(existing);
      feeRepository.countPeriodReferences.mockResolvedValue({ feeStructuresCount: 2, invoicesCount: 5, total: 7 });

      await expect(feeService.deleteCollectionPeriod(SCHOOL_ID, PERIOD_ID, ACTOR))
        .rejects.toThrow(RelationshipConflictError);
      expect(feeRepository.deletePeriod).not.toHaveBeenCalled();
    });

    it('deletes unreferenced collection period and emits audit log', async () => {
      const existing = { id: PERIOD_ID, schoolId: SCHOOL_ID, name: 'Term 1', dueDate: '2026-10-15', displayOrder: 0 };
      feeRepository.findPeriodByIdForUpdate.mockResolvedValue(existing);
      feeRepository.countPeriodReferences.mockResolvedValue({ feeStructuresCount: 0, invoicesCount: 0, total: 0 });
      feeRepository.deletePeriod.mockResolvedValue(existing);

      const result = await feeService.deleteCollectionPeriod(SCHOOL_ID, PERIOD_ID, ACTOR);
      expect(result.deleted).toBe(true);
      expect(feeRepository.deletePeriod).toHaveBeenCalledWith(SCHOOL_ID, PERIOD_ID, expect.anything());
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actionPerformed: 'DELETE_FEE_COLLECTION_PERIOD'
        })
      );
    });
  });

  // ============================================================
  // 2. Fee Structures & Automatic Invoice Generation
  // ============================================================
  describe('FeeStructure & Invoice Generation Service', () => {
    it('creates FeeStructure and generates snapshot invoices for active students in target class', async () => {
      const payload = {
        name: 'Tuition Fee Grade 10',
        amount: 50000,
        dueDate: '2026-10-15',
        classId: CLASS_ID,
        collectionPeriodId: PERIOD_ID,
        customData: { category: 'Standard' }
      };

      const createdFS = {
        id: FEE_STRUCTURE_ID,
        schoolId: SCHOOL_ID,
        ...payload
      };

      feeRepository.findClassInTenant.mockResolvedValue({ id: CLASS_ID, schoolId: SCHOOL_ID, name: 'Grade 10' });
      feeRepository.findPeriodById.mockResolvedValue({ id: PERIOD_ID, schoolId: SCHOOL_ID, name: 'Term 1' });
      feeRepository.createFeeStructure.mockResolvedValue(createdFS);
      feeRepository.findActiveStudentsByClass.mockResolvedValue([
        { id: STUDENT_1_ID, firstName: 'Alice', status: 'Active' },
        { id: STUDENT_2_ID, firstName: 'Bob', status: 'Active' }
      ]);
      feeRepository.findExistingInvoiceStudentIds.mockResolvedValue(new Set());
      feeRepository.createInvoicesBatch.mockResolvedValue({ count: 2 });

      const result = await feeService.createFeeStructure(SCHOOL_ID, payload, ACTOR);

      expect(result.id).toBe(FEE_STRUCTURE_ID);
      expect(result.invoicesGenerated).toBe(2);

      // Verify invoice snapshot data passed to repository
      expect(feeRepository.createInvoicesBatch).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            schoolId: SCHOOL_ID,
            studentId: STUDENT_1_ID,
            feeStructureId: FEE_STRUCTURE_ID,
            collectionPeriodId: PERIOD_ID,
            feeName: 'Tuition Fee Grade 10',
            amount: 50000,
            dueDate: '2026-10-15',
            status: 'Pending',
            customData: { category: 'Standard' }
          }),
          expect.objectContaining({
            schoolId: SCHOOL_ID,
            studentId: STUDENT_2_ID,
            feeStructureId: FEE_STRUCTURE_ID,
            amount: 50000,
            status: 'Pending'
          })
        ],
        expect.anything()
      );

      // Single aggregate audit log
      expect(auditRepository.createAuditLog).toHaveBeenCalledTimes(1);
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actionPerformed: 'CREATE_FEE_STRUCTURE',
          modifiedFields: expect.objectContaining({
            invoicesGenerated: 2
          })
        })
      );
    });

    it('rejects FeeStructure creation if target class does not exist in tenant', async () => {
      feeRepository.findClassInTenant.mockResolvedValue(null);

      await expect(feeService.createFeeStructure(SCHOOL_ID, {
        name: 'Tuition Fee',
        amount: 50000,
        dueDate: '2026-10-15',
        classId: 'foreign-class-id'
      }, ACTOR)).rejects.toThrow(RelationshipConflictError);

      expect(feeRepository.createFeeStructure).not.toHaveBeenCalled();
    });

    it('rejects FeeStructure creation if collectionPeriod does not exist in tenant', async () => {
      feeRepository.findClassInTenant.mockResolvedValue({ id: CLASS_ID, schoolId: SCHOOL_ID });
      feeRepository.findPeriodById.mockResolvedValue(null);

      await expect(feeService.createFeeStructure(SCHOOL_ID, {
        name: 'Tuition Fee',
        amount: 50000,
        dueDate: '2026-10-15',
        classId: CLASS_ID,
        collectionPeriodId: 'foreign-period-id'
      }, ACTOR)).rejects.toThrow(RelationshipConflictError);

      expect(feeRepository.createFeeStructure).not.toHaveBeenCalled();
    });

    it('preserves historical financial snapshot: updating FeeStructure template does NOT mutate issued invoices', async () => {
      const existingFS = {
        id: FEE_STRUCTURE_ID,
        schoolId: SCHOOL_ID,
        name: 'Tuition Fee Grade 10',
        amount: 50000,
        dueDate: '2026-10-15',
        classId: CLASS_ID,
        collectionPeriodId: PERIOD_ID,
        customData: null
      };

      feeRepository.findFeeStructureByIdForUpdate.mockResolvedValue(existingFS);
      feeRepository.updateFeeStructure.mockResolvedValue({
        ...existingFS,
        amount: 55000,
        dueDate: '2026-11-01'
      });

      const updated = await feeService.updateFeeStructure(
        SCHOOL_ID,
        FEE_STRUCTURE_ID,
        { amount: 55000, dueDate: '2026-11-01' },
        ACTOR
      );

      expect(updated.amount).toBe(55000);
      expect(feeRepository.updateFeeStructure).toHaveBeenCalledWith(
        SCHOOL_ID,
        FEE_STRUCTURE_ID,
        { amount: 55000, dueDate: '2026-11-01' },
        expect.anything()
      );
      // Verify invoices table was NOT modified
      expect(feeRepository.createInvoicesBatch).not.toHaveBeenCalled();
    });

    it('blocks classId update on FeeStructure if invoices already exist (409 Conflict)', async () => {
      const existingFS = {
        id: FEE_STRUCTURE_ID,
        schoolId: SCHOOL_ID,
        classId: CLASS_ID
      };

      feeRepository.findFeeStructureByIdForUpdate.mockResolvedValue(existingFS);
      feeRepository.countFeeStructureInvoices.mockResolvedValue(10); // 10 issued invoices

      await expect(feeService.updateFeeStructure(
        SCHOOL_ID,
        FEE_STRUCTURE_ID,
        { classId: '33333333-3333-4333-8333-333333333333' },
        ACTOR
      )).rejects.toThrow(ConflictError);

      expect(feeRepository.updateFeeStructure).not.toHaveBeenCalled();
    });

    it('allows classId update on FeeStructure if zero invoices exist', async () => {
      const NEW_CLASS_ID = '33333333-3333-4333-8333-333333333333';
      const existingFS = {
        id: FEE_STRUCTURE_ID,
        schoolId: SCHOOL_ID,
        classId: CLASS_ID
      };

      feeRepository.findFeeStructureByIdForUpdate.mockResolvedValue(existingFS);
      feeRepository.countFeeStructureInvoices.mockResolvedValue(0);
      feeRepository.findClassInTenant.mockResolvedValue({ id: NEW_CLASS_ID, schoolId: SCHOOL_ID });
      feeRepository.updateFeeStructure.mockResolvedValue({ ...existingFS, classId: NEW_CLASS_ID });

      const updated = await feeService.updateFeeStructure(
        SCHOOL_ID,
        FEE_STRUCTURE_ID,
        { classId: NEW_CLASS_ID },
        ACTOR
      );

      expect(updated.classId).toBe(NEW_CLASS_ID);
      expect(feeRepository.updateFeeStructure).toHaveBeenCalled();
    });

    it('blocks deletion of FeeStructure if invoices exist (409 Conflict)', async () => {
      const existingFS = { id: FEE_STRUCTURE_ID, schoolId: SCHOOL_ID };
      feeRepository.findFeeStructureByIdForUpdate.mockResolvedValue(existingFS);
      feeRepository.countFeeStructureInvoices.mockResolvedValue(5);

      await expect(feeService.deleteFeeStructure(SCHOOL_ID, FEE_STRUCTURE_ID, ACTOR))
        .rejects.toThrow(RelationshipConflictError);
      expect(feeRepository.deleteFeeStructure).not.toHaveBeenCalled();
    });

    it('deletes FeeStructure safely when zero invoices exist', async () => {
      const existingFS = {
        id: FEE_STRUCTURE_ID,
        schoolId: SCHOOL_ID,
        name: 'Old Fee',
        amount: 5000,
        dueDate: '2026-10-15',
        classId: CLASS_ID,
        collectionPeriodId: null
      };
      feeRepository.findFeeStructureByIdForUpdate.mockResolvedValue(existingFS);
      feeRepository.countFeeStructureInvoices.mockResolvedValue(0);
      feeRepository.deleteFeeStructure.mockResolvedValue(existingFS);

      const result = await feeService.deleteFeeStructure(SCHOOL_ID, FEE_STRUCTURE_ID, ACTOR);
      expect(result.deleted).toBe(true);
      expect(feeRepository.deleteFeeStructure).toHaveBeenCalledWith(SCHOOL_ID, FEE_STRUCTURE_ID, expect.anything());
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actionPerformed: 'DELETE_FEE_STRUCTURE'
        })
      );
    });
  });
});
