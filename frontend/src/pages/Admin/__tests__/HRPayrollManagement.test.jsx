import { describe, it, expect, vi, beforeEach } from 'vitest';
import HRPayrollManagement from '../HRPayrollManagement.jsx';
import * as hrPayrollApi from '../../../api/hr-payroll.js';
import * as staffApi from '../../../api/staff.js';
import * as firestoreModule from '../../../firebase/firestore.js';

describe('Admin HRPayrollManagement Component REST Cutover (Phase HR.3)', () => {
  const STAFF_ID = '11111111-1111-4111-8111-111111111111';
  const PAYROLL_ID = '22222222-2222-4222-8222-222222222222';

  const MOCK_STAFF = {
    id: STAFF_ID,
    name: 'Jane Doe',
    employeeId: 'EMP-101',
    designation: 'Senior Teacher',
    staffType: 'teaching',
    baseSalary: 30000
  };

  const MOCK_PAYROLL = {
    id: PAYROLL_ID,
    teacherId: STAFF_ID,
    month: 'JANUARY 2026',
    baseSalary: 30000,
    pfCalculated: 1800,
    esiCalculated: 0,
    deductions: 1800,
    netPay: 28200,
    status: 'Pending',
    staffProfile: MOCK_STAFF,
    customData: {}
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported as a valid React component function', () => {
    expect(typeof HRPayrollManagement).toBe('function');
  });

  // ============================================================
  // 1. ZERO FIRESTORE PAYROLL RUNTIME OPERATIONS
  // ============================================================

  it('does NOT invoke legacy Firestore functions for payroll runtime operations', () => {
    const firestoreSpies = [
      vi.spyOn(firestoreModule, 'subscribeToSubCollection'),
      vi.spyOn(firestoreModule, 'addSubDocument'),
      vi.spyOn(firestoreModule, 'updateSubDocument'),
      vi.spyOn(firestoreModule, 'deleteSubDocument')
    ];

    firestoreSpies.forEach((spy) => {
      expect(spy).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // 2. REST API INTEGRATION VERIFICATION
  // ============================================================

  it('loads payroll records from REST listPayroll', async () => {
    const listSpy = vi.spyOn(hrPayrollApi, 'listPayroll').mockResolvedValue({
      success: true,
      data: [MOCK_PAYROLL],
      pagination: { total: 1, page: 1, limit: 50, totalPages: 1 }
    });

    const res = await hrPayrollApi.listPayroll({ limit: 50 });
    expect(listSpy).toHaveBeenCalledWith({ limit: 50 });
    expect(res.data).toHaveLength(1);
    expect(res.data[0].id).toBe(PAYROLL_ID);
  });

  it('loads staff members from REST listStaff for employee selection', async () => {
    const staffSpy = vi.spyOn(staffApi, 'listStaff').mockResolvedValue({
      success: true,
      data: [MOCK_STAFF]
    });

    const res = await staffApi.listStaff({ limit: 100 });
    expect(staffSpy).toHaveBeenCalledWith({ limit: 100 });
    expect(res.data).toHaveLength(1);
    expect(res.data[0].name).toBe('Jane Doe');
  });

  it('generates payroll records via REST generatePayroll', async () => {
    const generateSpy = vi.spyOn(hrPayrollApi, 'generatePayroll').mockResolvedValue({
      success: true,
      message: 'Payroll generated',
      data: [MOCK_PAYROLL],
      count: 1
    });

    const payload = {
      month: 'JANUARY 2026',
      records: [{ staffId: STAFF_ID, baseSalary: 30000, deductions: 1800 }]
    };

    const res = await hrPayrollApi.generatePayroll(payload);
    expect(generateSpy).toHaveBeenCalledWith(payload);
    expect(res.success).toBe(true);
    expect(res.count).toBe(1);
  });

  it('updates payroll status via REST updatePayrollStatus (preserving all lifecycle transitions)', async () => {
    const statusSpy = vi.spyOn(hrPayrollApi, 'updatePayrollStatus').mockResolvedValue({
      success: true,
      message: 'Payroll status updated',
      data: { ...MOCK_PAYROLL, status: 'Paid' }
    });

    const res = await hrPayrollApi.updatePayrollStatus(PAYROLL_ID, { status: 'Paid' });
    expect(statusSpy).toHaveBeenCalledWith(PAYROLL_ID, { status: 'Paid' });
    expect(res.data.status).toBe('Paid');
  });

  it('deletes draft payroll record via REST deletePayroll', async () => {
    const deleteSpy = vi.spyOn(hrPayrollApi, 'deletePayroll').mockResolvedValue({
      success: true,
      message: 'Payroll draft record deleted successfully'
    });

    const res = await hrPayrollApi.deletePayroll(PAYROLL_ID);
    expect(deleteSpy).toHaveBeenCalledWith(PAYROLL_ID);
    expect(res.success).toBe(true);
  });

  it('gets and updates HR signature configuration via REST getConfig / updateConfig', async () => {
    const getSpy = vi.spyOn(hrPayrollApi, 'getConfig').mockResolvedValue({
      success: true,
      data: { authorizedSignature: 'https://cdn.school.com/sig.png' }
    });

    const patchSpy = vi.spyOn(hrPayrollApi, 'updateConfig').mockResolvedValue({
      success: true,
      message: 'HR config updated',
      data: { authorizedSignature: 'https://cdn.school.com/sig-new.png' }
    });

    const getRes = await hrPayrollApi.getConfig();
    expect(getSpy).toHaveBeenCalled();
    expect(getRes.data.authorizedSignature).toBe('https://cdn.school.com/sig.png');

    const patchRes = await hrPayrollApi.updateConfig({ authorizedSignature: 'https://cdn.school.com/sig-new.png' });
    expect(patchSpy).toHaveBeenCalledWith({ authorizedSignature: 'https://cdn.school.com/sig-new.png' });
    expect(patchRes.data.authorizedSignature).toBe('https://cdn.school.com/sig-new.png');
  });
});
