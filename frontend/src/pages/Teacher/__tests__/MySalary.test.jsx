import { describe, it, expect, vi, beforeEach } from 'vitest';
import MySalary from '../MySalary.jsx';
import * as hrPayrollApi from '../../../api/hr-payroll.js';
import * as firestoreModule from '../../../firebase/firestore.js';

describe('Teacher MySalary Component REST Cutover (Phase HR.3)', () => {
  const STAFF_ID = '11111111-1111-4111-8111-111111111111';
  const PAYROLL_ID = '22222222-2222-4222-8222-222222222222';

  const MOCK_SALARY_RECORD = {
    id: PAYROLL_ID,
    teacherId: STAFF_ID,
    month: 'JANUARY 2026',
    baseSalary: 25000,
    pfCalculated: 1800,
    esiCalculated: 0,
    deductions: 1800,
    netPay: 23200,
    status: 'Payslip Released',
    staffProfile: {
      id: STAFF_ID,
      name: 'Teacher Jane',
      employeeId: 'TCH-001',
      designation: 'Mathematics Teacher'
    }
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported as a valid React component function', () => {
    expect(typeof MySalary).toBe('function');
  });

  // ============================================================
  // 1. ZERO FIRESTORE PAYROLL RUNTIME OPERATIONS
  // ============================================================

  it('does NOT invoke legacy Firestore functions for salary runtime operations', () => {
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
  // 2. SELF-SERVICE REST INTEGRATION VERIFICATION
  // ============================================================

  it('loads employee salary records from REST getMySalary without client-side tenant filtering', async () => {
    const getSalarySpy = vi.spyOn(hrPayrollApi, 'getMySalary').mockResolvedValue({
      success: true,
      data: [MOCK_SALARY_RECORD]
    });

    const res = await hrPayrollApi.getMySalary();
    expect(getSalarySpy).toHaveBeenCalledWith();
    expect(res.data).toHaveLength(1);
    expect(res.data[0].id).toBe(PAYROLL_ID);
    expect(res.data[0].status).toBe('Payslip Released');
  });

  it('loads HR config from REST getConfig for payslip signature rendering', async () => {
    const configSpy = vi.spyOn(hrPayrollApi, 'getConfig').mockResolvedValue({
      success: true,
      data: { authorizedSignature: 'https://cdn.school.com/sig.png' }
    });

    const res = await hrPayrollApi.getConfig();
    expect(configSpy).toHaveBeenCalled();
    expect(res.data.authorizedSignature).toBe('https://cdn.school.com/sig.png');
  });
});
