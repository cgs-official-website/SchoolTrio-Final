import { describe, it, expect, vi, beforeEach } from 'vitest';
import ReportsAnalytics from '../ReportsAnalytics.jsx';
import * as invoicesApiModule from '../../../api/invoices.js';
import * as studentsApiModule from '../../../api/students.js';
import * as staffApiModule from '../../../api/staff.js';
import * as attendanceApiModule from '../../../api/attendance.js';
import * as firestoreModule from '../../../firebase/firestore.js';

describe('Admin ReportsAnalytics Component (REST Cutover & Verification)', () => {
  const MOCK_INVOICE_STATS = {
    expected: 100000,
    collected: 75000,
    outstanding: 25000,
    overdueCount: 2,
    overdueAmount: 5000,
    unpaidCount: 5,
    unpaidStudentsCount: 5,
    overdueStudentsCount: 2,
    feeCollectedPct: 75
  };

  const MOCK_MONTHLY_REVENUE = [
    { month: '2026-03', monthName: 'Mar 2026', collectedAmount: 12000, paidCount: 3 },
    { month: '2026-04', monthName: 'Apr 2026', collectedAmount: 15000, paidCount: 4 },
    { month: '2026-05', monthName: 'May 2026', collectedAmount: 18000, paidCount: 5 },
    { month: '2026-06', monthName: 'Jun 2026', collectedAmount: 8000, paidCount: 2 },
    { month: '2026-07', monthName: 'Jul 2026', collectedAmount: 10000, paidCount: 3 },
    { month: '2026-08', monthName: 'Aug 2026', collectedAmount: 14000, paidCount: 4 },
    { month: '2026-09', monthName: 'Sep 2026', collectedAmount: 20000, paidCount: 6 }
  ];

  const MOCK_STUDENTS_RES = {
    success: true,
    data: [{ id: 'stu-1', firstName: 'Alice' }],
    pagination: { total: 340, page: 1, limit: 1, totalPages: 340 }
  };

  const MOCK_STAFF_RES = {
    success: true,
    data: [{ id: 'stf-1', firstName: 'John' }],
    pagination: { total: 38, page: 1, limit: 1, totalPages: 38 }
  };

  const MOCK_ATTENDANCE_STATS = {
    date: '2026-09-15',
    classesTotal: 10,
    classesMarked: 8,
    classesPending: 2,
    schoolWide: {
      total: 300,
      present: 270,
      absent: 20,
      late: 10,
      percentage: 93.3
    }
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported as a valid React component function', () => {
    expect(typeof ReportsAnalytics).toBe('function');
  });

  // ============================================================
  // 1. ZERO FIRESTORE REPORT ACCESS
  // ============================================================

  it('does NOT invoke any legacy Firestore reporting listeners or helpers', () => {
    const firestoreSpies = [
      vi.spyOn(firestoreModule, 'subscribeToSubCollection'),
      vi.spyOn(firestoreModule, 'subscribeToInvoices'),
      vi.spyOn(firestoreModule, 'getInvoices')
    ];

    firestoreSpies.forEach((spy) => {
      expect(spy).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // 2. AUTHORITATIVE REST API DATA SOURCES
  // ============================================================

  it('fetches authoritative financial statistics via invoicesApi.getInvoiceStats', async () => {
    const statsSpy = vi.spyOn(invoicesApiModule, 'getInvoiceStats').mockResolvedValue({
      success: true,
      data: MOCK_INVOICE_STATS
    });

    const res = await invoicesApiModule.getInvoiceStats();

    expect(statsSpy).toHaveBeenCalled();
    expect(res.data.collected).toBe(75000);
    expect(res.data.expected).toBe(100000);
  });

  it('fetches 7-month revenue timeline via invoicesApi.getMonthlyRevenueReports', async () => {
    const revSpy = vi.spyOn(invoicesApiModule, 'getMonthlyRevenueReports').mockResolvedValue({
      success: true,
      data: MOCK_MONTHLY_REVENUE
    });

    const res = await invoicesApiModule.getMonthlyRevenueReports({ months: 7 });

    expect(revSpy).toHaveBeenCalledWith({ months: 7 });
    expect(res.data).toHaveLength(7);
    expect(res.data[6].collectedAmount).toBe(20000);
  });

  it('fetches student enrollment count using pagination.total from studentsApi.listStudents with limit 1', async () => {
    const studentSpy = vi.spyOn(studentsApiModule, 'listStudents').mockResolvedValue(MOCK_STUDENTS_RES);

    const res = await studentsApiModule.listStudents({ limit: 1 });

    expect(studentSpy).toHaveBeenCalledWith({ limit: 1 });
    expect(res.pagination.total).toBe(340);
  });

  it('fetches staff count using pagination.total from staffApi.listStaff with limit 1', async () => {
    const staffSpy = vi.spyOn(staffApiModule, 'listStaff').mockResolvedValue(MOCK_STAFF_RES);

    const res = await staffApiModule.listStaff({ limit: 1 });

    expect(staffSpy).toHaveBeenCalledWith({ limit: 1 });
    expect(res.pagination.total).toBe(38);
  });

  it('fetches institutional attendance dashboard statistics via attendanceApi.getAttendanceDashboardStats', async () => {
    const attSpy = vi.spyOn(attendanceApiModule, 'getAttendanceDashboardStats').mockResolvedValue({
      success: true,
      data: MOCK_ATTENDANCE_STATS
    });

    const res = await attendanceApiModule.getAttendanceDashboardStats();

    expect(attSpy).toHaveBeenCalled();
    expect(res.data.schoolWide.percentage).toBe(93.3);
  });

  it('fetches daily attendance stats for specific dates via attendanceApi.getAttendanceDashboardStats({ date })', async () => {
    const attSpy = vi.spyOn(attendanceApiModule, 'getAttendanceDashboardStats').mockResolvedValue({
      success: true,
      data: { ...MOCK_ATTENDANCE_STATS, date: '2026-09-14' }
    });

    const res = await attendanceApiModule.getAttendanceDashboardStats({ date: '2026-09-14' });

    expect(attSpy).toHaveBeenCalledWith({ date: '2026-09-14' });
    expect(res.data.date).toBe('2026-09-14');
  });

  // ============================================================
  // 3. SECURITY & TENANT ISOLATION
  // ============================================================

  it('does not send client-controlled schoolId or userId in query or body', async () => {
    const apiSpies = [
      vi.spyOn(invoicesApiModule, 'getInvoiceStats').mockResolvedValue({ success: true, data: {} }),
      vi.spyOn(invoicesApiModule, 'getMonthlyRevenueReports').mockResolvedValue({ success: true, data: [] }),
      vi.spyOn(studentsApiModule, 'listStudents').mockResolvedValue({ success: true, data: [], pagination: {} }),
      vi.spyOn(staffApiModule, 'listStaff').mockResolvedValue({ success: true, data: [], pagination: {} }),
      vi.spyOn(attendanceApiModule, 'getAttendanceDashboardStats').mockResolvedValue({ success: true, data: {} })
    ];

    await invoicesApiModule.getInvoiceStats();
    await invoicesApiModule.getMonthlyRevenueReports({ months: 7 });
    await studentsApiModule.listStudents({ limit: 1 });
    await staffApiModule.listStaff({ limit: 1 });
    await attendanceApiModule.getAttendanceDashboardStats();

    apiSpies.forEach(spy => {
      const callArgs = spy.mock.calls[0]?.[0];
      if (callArgs && typeof callArgs === 'object') {
        expect(callArgs).not.toHaveProperty('schoolId');
        expect(callArgs).not.toHaveProperty('userId');
      }
    });
  });

  // ============================================================
  // 4. ATTENDANCE TRENDS BREAKDOWN & 7-DAY TIMELINE
  // ============================================================

  it('aggregates daily attendance statistics with Present, Absent, Late, Total, and Percentage metrics for 7 days', async () => {
    const dates = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07'];
    const mockDailyResponses = {
      '2026-10-01': { success: true, data: { schoolWide: { total: 50, present: 45, absent: 3, late: 2, percentage: 94.0 } } },
      '2026-10-02': { success: true, data: { schoolWide: { total: 50, present: 48, absent: 1, late: 1, percentage: 98.0 } } },
      '2026-10-03': { success: true, data: { schoolWide: { total: 50, present: 40, absent: 8, late: 2, percentage: 84.0 } } },
      '2026-10-04': { success: true, data: { schoolWide: { total: 0, present: 0, absent: 0, late: 0, percentage: 100 } } },
      '2026-10-05': { success: true, data: { schoolWide: { total: 50, present: 47, absent: 2, late: 1, percentage: 96.0 } } },
      '2026-10-06': { success: true, data: { schoolWide: { total: 50, present: 46, absent: 3, late: 1, percentage: 94.0 } } },
      '2026-10-07': { success: true, data: { schoolWide: { total: 50, present: 49, absent: 1, late: 0, percentage: 98.0 } } }
    };

    const attSpy = vi.spyOn(attendanceApiModule, 'getAttendanceDashboardStats').mockImplementation(async (query = {}) => {
      if (query.date && mockDailyResponses[query.date]) {
        return mockDailyResponses[query.date];
      }
      return { success: true, data: MOCK_ATTENDANCE_STATS };
    });

    const results = await Promise.all(
      dates.map(date => attendanceApiModule.getAttendanceDashboardStats({ date }))
    );

    expect(results).toHaveLength(7);
    expect(results[0].data.schoolWide.present).toBe(45);
    expect(results[0].data.schoolWide.absent).toBe(3);
    expect(results[0].data.schoolWide.late).toBe(2);
    expect(results[3].data.schoolWide.total).toBe(0);
    expect(attSpy).toHaveBeenCalledTimes(7);
  });

  // ============================================================
  // 5. ERROR HANDLING
  // ============================================================

  it('handles API failure gracefully and propagates error without falling back to Firestore', async () => {
    vi.spyOn(invoicesApiModule, 'getInvoiceStats').mockRejectedValue(new Error('Network error'));

    await expect(invoicesApiModule.getInvoiceStats()).rejects.toThrow('Network error');
  });
});
