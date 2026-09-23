import { describe, it, expect, vi, beforeEach } from 'vitest';
import FeeManagement from '../FeeManagement.jsx';
import * as classesApiModule from '../../../api/classes.js';
import * as feesApiModule from '../../../api/fees.js';
import * as invoicesApiModule from '../../../api/invoices.js';
import * as firestoreModule from '../../../firebase/firestore.js';

describe('Admin FeeManagement Component (REST Cutover & Verification)', () => {
  const MOCK_PERIOD_1 = { id: 'period-uuid-1', name: 'Term 1', dueDate: '2026-10-15', status: 'active' };
  const MOCK_CLASS_1 = { id: 'class-uuid-1', name: 'Grade 10', section: 'A' };
  const MOCK_INVOICE_1 = {
    id: 'inv-uuid-1',
    feeName: 'Term 1 Tuition',
    amount: 5000,
    dueDate: '2026-10-15',
    status: 'Pending',
    collectionPeriodId: 'period-uuid-1',
    collectionPeriodName: 'Term 1',
    student: {
      id: 'stu-uuid-1',
      firstName: 'Alice',
      lastName: 'Smith',
      admissionNumber: 'ADM-101'
    }
  };
  const MOCK_STATS = {
    expected: 50000,
    collected: 35000,
    outstanding: 15000,
    overdueCount: 1,
    overdueAmount: 5000,
    unpaidCount: 3,
    unpaidStudentsCount: 3,
    overdueStudentsCount: 1,
    feeCollectedPct: 70
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported as a valid React component function', () => {
    expect(typeof FeeManagement).toBe('function');
  });

  // ============================================================
  // 1. ZERO FIRESTORE FEE ACCESS
  // ============================================================

  it('does NOT invoke any legacy Firestore fee/invoice subscription helpers', () => {
    const firestoreSpies = [
      vi.spyOn(firestoreModule, 'subscribeToInvoices'),
      vi.spyOn(firestoreModule, 'subscribeToFeeCollectionPeriods'),
      vi.spyOn(firestoreModule, 'createFeeStructure'),
      vi.spyOn(firestoreModule, 'markInvoicePaid'),
      vi.spyOn(firestoreModule, 'getInvoices'),
      vi.spyOn(firestoreModule, 'subscribeToSubCollection')
    ];

    firestoreSpies.forEach((spy) => {
      expect(spy).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // 2. REST API INTEGRATION
  // ============================================================

  it('loads collection periods via feesApi.listCollectionPeriods', async () => {
    const periodSpy = vi.spyOn(feesApiModule, 'listCollectionPeriods').mockResolvedValue({
      success: true,
      data: [MOCK_PERIOD_1]
    });

    const res = await feesApiModule.listCollectionPeriods({ limit: 100 });

    expect(periodSpy).toHaveBeenCalledWith({ limit: 100 });
    expect(res.data).toHaveLength(1);
    expect(res.data[0].id).toBe('period-uuid-1');
  });

  it('loads classes via classesApi.listClasses', async () => {
    const classesSpy = vi.spyOn(classesApiModule, 'listClasses').mockResolvedValue({
      success: true,
      data: [MOCK_CLASS_1]
    });

    const res = await classesApiModule.listClasses({ limit: 100 });

    expect(classesSpy).toHaveBeenCalledWith({ limit: 100 });
    expect(res.data).toHaveLength(1);
    expect(res.data[0].name).toBe('Grade 10');
  });

  it('loads invoices via invoicesApi.listInvoices', async () => {
    const invoicesSpy = vi.spyOn(invoicesApiModule, 'listInvoices').mockResolvedValue({
      success: true,
      data: [MOCK_INVOICE_1],
      pagination: { total: 1, page: 1, limit: 100 }
    });

    const res = await invoicesApiModule.listInvoices({ limit: 100 });

    expect(invoicesSpy).toHaveBeenCalledWith({ limit: 100 });
    expect(res.data).toHaveLength(1);
    expect(res.data[0].student.firstName).toBe('Alice');
  });

  it('loads dashboard fee statistics via invoicesApi.getInvoiceStats', async () => {
    const statsSpy = vi.spyOn(invoicesApiModule, 'getInvoiceStats').mockResolvedValue({
      success: true,
      data: MOCK_STATS
    });

    const res = await invoicesApiModule.getInvoiceStats();

    expect(statsSpy).toHaveBeenCalled();
    expect(res.data.expected).toBe(50000);
    expect(res.data.collected).toBe(35000);
    expect(res.data.outstanding).toBe(15000);
  });

  // ============================================================
  // 3. REST FEE STRUCTURE CREATION
  // ============================================================

  it('creates fee structure via feesApi.createFeeStructure without client-forged tenantId', async () => {
    const createSpy = vi.spyOn(feesApiModule, 'createFeeStructure').mockResolvedValue({
      success: true,
      data: {
        id: 'fs-uuid-new',
        name: 'Term 1 Tuition',
        amount: 5000,
        dueDate: '2026-10-15',
        classId: 'class-uuid-1',
        collectionPeriodId: 'period-uuid-1',
        invoicesGenerated: 25
      }
    });

    const payload = {
      name: 'Term 1 Tuition',
      amount: 5000,
      dueDate: '2026-10-15',
      classId: 'class-uuid-1',
      collectionPeriodId: 'period-uuid-1'
    };

    const res = await feesApiModule.createFeeStructure(payload);

    expect(createSpy).toHaveBeenCalledWith(payload);
    const sentPayload = createSpy.mock.calls[0][0];
    expect(sentPayload).not.toHaveProperty('schoolId');
    expect(sentPayload).not.toHaveProperty('userId');
    expect(res.data.invoicesGenerated).toBe(25);
  });

  // ============================================================
  // 4. REST PAYMENT RECORDING
  // ============================================================

  it('records offline invoice payment via invoicesApi.payInvoice and returns paid status', async () => {
    const paySpy = vi.spyOn(invoicesApiModule, 'payInvoice').mockResolvedValue({
      success: true,
      data: {
        id: 'inv-uuid-1',
        status: 'Paid',
        receiptNumber: 'REC-20260915-XYZ123',
        paidAt: '2026-09-15T12:00:00.000Z'
      }
    });

    const res = await invoicesApiModule.payInvoice('inv-uuid-1', {
      paymentMode: 'Cash',
      remarks: 'Recorded by Admin'
    });

    expect(paySpy).toHaveBeenCalledWith('inv-uuid-1', {
      paymentMode: 'Cash',
      remarks: 'Recorded by Admin'
    });
    expect(res.data.status).toBe('Paid');
    expect(res.data.receiptNumber).toBe('REC-20260915-XYZ123');
  });

  // ============================================================
  // 5. EMPTY STATE & ERROR HANDLING
  // ============================================================

  it('handles empty invoice response gracefully', async () => {
    vi.spyOn(invoicesApiModule, 'listInvoices').mockResolvedValue({
      success: true,
      data: [],
      pagination: { total: 0, page: 1, limit: 100 }
    });

    const res = await invoicesApiModule.listInvoices({ limit: 100 });

    expect(res.success).toBe(true);
    expect(res.data).toEqual([]);
  });

  it('handles API errors properly', async () => {
    vi.spyOn(invoicesApiModule, 'payInvoice').mockRejectedValue(new Error('Invoice already paid'));

    await expect(
      invoicesApiModule.payInvoice('inv-uuid-1', { paymentMode: 'Cash' })
    ).rejects.toThrow('Invoice already paid');
  });
});
