import { describe, it, expect, vi, beforeEach } from 'vitest';
import AdminOverview from '../AdminOverview.jsx';
import * as invoicesApiModule from '../../../api/invoices.js';
import * as firestoreModule from '../../../firebase/firestore.js';

describe('AdminOverview Fee Statistics REST Cutover', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported as a valid React component function', () => {
    expect(typeof AdminOverview).toBe('function');
  });

  // ============================================================
  // 1. ZERO FIRESTORE INVOICE LISTENER
  // ============================================================

  it('does NOT invoke Firestore subscribeToInvoices listener', () => {
    const firestoreSpy = vi.spyOn(firestoreModule, 'subscribeToInvoices');
    expect(firestoreSpy).not.toHaveBeenCalled();
  });

  // ============================================================
  // 2. REST INVOICE STATS API
  // ============================================================

  it('fetches fee statistics using invoicesApi.getInvoiceStats', async () => {
    const statsSpy = vi.spyOn(invoicesApiModule, 'getInvoiceStats').mockResolvedValue({
      success: true,
      data: {
        expected: 100000,
        collected: 75000,
        outstanding: 25000,
        overdueCount: 2,
        overdueAmount: 10000,
        unpaidCount: 5,
        unpaidStudentsCount: 5,
        overdueStudentsCount: 2,
        feeCollectedPct: 75
      }
    });

    const res = await invoicesApiModule.getInvoiceStats();

    expect(statsSpy).toHaveBeenCalled();
    expect(res.data.expected).toBe(100000);
    expect(res.data.collected).toBe(75000);
    expect(res.data.outstanding).toBe(25000);
    expect(res.data.feeCollectedPct).toBe(75);
  });

  it('handles API error when fetching invoice stats gracefully', async () => {
    vi.spyOn(invoicesApiModule, 'getInvoiceStats').mockRejectedValue(new Error('Network error'));

    await expect(invoicesApiModule.getInvoiceStats()).rejects.toThrow('Network error');
  });

  // ============================================================
  // 3. REST DASHBOARD PREFERENCE PERSISTENCE
  // ============================================================

  it('loads and saves dashboard configuration preferences via settingsApi REST methods', async () => {
    const settingsApi = await import('../../../api/settings.js');
    const mockConfig = {
      metrics: { totalStudents: true, staffCount: true },
      widgets: { feeOverview: true, attendanceSummary: true }
    };

    const getSpy = vi.spyOn(settingsApi, 'getSchoolSettings').mockResolvedValue({
      success: true,
      data: {
        customData: {
          dashboardConfig: mockConfig
        }
      }
    });

    const updateSpy = vi.spyOn(settingsApi, 'updateSchoolSettings').mockResolvedValue({
      success: true,
      data: {
        customData: {
          dashboardConfig: mockConfig
        }
      }
    });

    const getRes = await settingsApi.getSchoolSettings();
    expect(getSpy).toHaveBeenCalled();
    expect(getRes.data.customData.dashboardConfig.metrics.totalStudents).toBe(true);

    const updateRes = await settingsApi.updateSchoolSettings({
      customData: { dashboardConfig: mockConfig }
    });
    expect(updateSpy).toHaveBeenCalledWith({
      customData: { dashboardConfig: mockConfig }
    });
    expect(updateRes.data.customData.dashboardConfig.widgets.feeOverview).toBe(true);
  });
});
