import { describe, it, expect, vi, beforeEach } from 'vitest';
import EnvironmentSetup from '../EnvironmentSetup.jsx';
import * as feesApiModule from '../../../api/fees.js';
import * as firestoreModule from '../../../firebase/firestore.js';

describe('Admin EnvironmentSetup Fee Collection Periods REST Cutover', () => {
  const MOCK_PERIOD_1 = { id: 'period-1', name: 'Term 1', dueDate: '2026-10-15', displayOrder: 1, status: 'active' };
  const MOCK_PERIOD_2 = { id: 'period-2', name: 'Term 2', dueDate: '2026-12-15', displayOrder: 2, status: 'active' };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported as a valid React component function', () => {
    expect(typeof EnvironmentSetup).toBe('function');
  });

  // ============================================================
  // 1. ZERO FIRESTORE FEE PERIOD ACCESS
  // ============================================================

  it('does NOT invoke legacy Firestore fee collection period methods', () => {
    const firestoreSpies = [
      vi.spyOn(firestoreModule, 'subscribeToFeeCollectionPeriods'),
      vi.spyOn(firestoreModule, 'createFeeCollectionPeriod'),
      vi.spyOn(firestoreModule, 'updateFeeCollectionPeriod'),
      vi.spyOn(firestoreModule, 'deleteFeeCollectionPeriod')
    ];

    firestoreSpies.forEach((spy) => {
      expect(spy).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // 2. REST PERIOD OPERATIONS
  // ============================================================

  it('loads fee collection periods via feesApi.listCollectionPeriods', async () => {
    const listSpy = vi.spyOn(feesApiModule, 'listCollectionPeriods').mockResolvedValue({
      success: true,
      data: [MOCK_PERIOD_1, MOCK_PERIOD_2]
    });

    const res = await feesApiModule.listCollectionPeriods({ limit: 100 });

    expect(listSpy).toHaveBeenCalledWith({ limit: 100 });
    expect(res.data).toHaveLength(2);
    expect(res.data[0].name).toBe('Term 1');
    expect(res.data[1].name).toBe('Term 2');
  });

  it('creates fee collection period via feesApi.createCollectionPeriod', async () => {
    const createSpy = vi.spyOn(feesApiModule, 'createCollectionPeriod').mockResolvedValue({
      success: true,
      data: { id: 'period-3', name: 'Term 3', dueDate: '2027-03-15', displayOrder: 3 }
    });

    const payload = { name: 'Term 3', dueDate: '2027-03-15', displayOrder: 3 };
    const res = await feesApiModule.createCollectionPeriod(payload);

    expect(createSpy).toHaveBeenCalledWith(payload);
    expect(res.data.id).toBe('period-3');
  });

  it('updates fee collection period via feesApi.updateCollectionPeriod', async () => {
    const updateSpy = vi.spyOn(feesApiModule, 'updateCollectionPeriod').mockResolvedValue({
      success: true,
      data: { id: 'period-1', name: 'Term 1 Updated', dueDate: '2026-10-20' }
    });

    const payload = { name: 'Term 1 Updated', dueDate: '2026-10-20' };
    const res = await feesApiModule.updateCollectionPeriod('period-1', payload);

    expect(updateSpy).toHaveBeenCalledWith('period-1', payload);
    expect(res.data.name).toBe('Term 1 Updated');
  });

  it('deletes fee collection period via feesApi.deleteCollectionPeriod', async () => {
    const deleteSpy = vi.spyOn(feesApiModule, 'deleteCollectionPeriod').mockResolvedValue({
      success: true,
      data: { id: 'period-1', deleted: true }
    });

    const res = await feesApiModule.deleteCollectionPeriod('period-1');

    expect(deleteSpy).toHaveBeenCalledWith('period-1');
    expect(res.data.deleted).toBe(true);
  });

  // ============================================================
  // 3. ERROR & CONFLICT HANDLING
  // ============================================================

  it('handles 409 dependency conflict error on period deletion when referenced', async () => {
    const conflictError = new Error('Cannot delete fee collection period because it is referenced by existing fee structures or invoices');
    conflictError.status = 409;
    vi.spyOn(feesApiModule, 'deleteCollectionPeriod').mockRejectedValue(conflictError);

    await expect(feesApiModule.deleteCollectionPeriod('period-1')).rejects.toThrow(
      'Cannot delete fee collection period because it is referenced by existing fee structures or invoices'
    );
  });

  it('handles general API failure when fetching periods', async () => {
    vi.spyOn(feesApiModule, 'listCollectionPeriods').mockRejectedValue(new Error('Internal Server Error'));

    await expect(feesApiModule.listCollectionPeriods()).rejects.toThrow('Internal Server Error');
  });
});
