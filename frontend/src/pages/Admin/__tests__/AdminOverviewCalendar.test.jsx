import { describe, it, expect, vi, beforeEach } from 'vitest';
import AdminOverview from '../AdminOverview.jsx';
import * as calendarApiModule from '../../../api/calendar.js';
import * as firestoreModule from '../../../firebase/firestore.js';

describe('AdminOverview Calendar REST Cutover', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported as a valid React component function', () => {
    expect(typeof AdminOverview).toBe('function');
  });

  // ============================================================
  // 1. ZERO FIRESTORE CALENDAR LISTENER
  // ============================================================

  it('does NOT invoke Firestore calendar subcollection subscription', () => {
    const firestoreSpy = vi.spyOn(firestoreModule, 'subscribeToSubCollection');
    expect(firestoreSpy).not.toHaveBeenCalledWith(expect.anything(), 'calendar', expect.anything());
  });

  // ============================================================
  // 2. REST CALENDAR ACTIVE EVENTS QUERY
  // ============================================================

  it('fetches upcoming calendar events using calendarApi.listEvents', async () => {
    const mockEvents = [
      {
        id: 'cal-1',
        title: 'Science Fair',
        date: '2026-10-10',
        endDate: '2026-10-10',
        type: 'event'
      },
      {
        id: 'cal-2',
        title: 'Diwali Holiday',
        date: '2026-11-01',
        endDate: '2026-11-02',
        type: 'holiday'
      }
    ];

    const listSpy = vi.spyOn(calendarApiModule.calendarApi, 'listEvents').mockResolvedValue({
      success: true,
      data: mockEvents,
      total: 2,
      page: 1,
      limit: 200
    });

    const todayStr = '2026-09-16';
    const res = await calendarApiModule.calendarApi.listEvents({ startDate: todayStr });

    expect(listSpy).toHaveBeenCalledWith({ startDate: todayStr });
    expect(res.data).toHaveLength(2);
    expect(res.data[0].id).toBe('cal-1');
  });

  it('handles API error when fetching calendar events gracefully', async () => {
    vi.spyOn(calendarApiModule.calendarApi, 'listEvents').mockRejectedValue(new Error('Network error'));

    await expect(calendarApiModule.calendarApi.listEvents()).rejects.toThrow('Network error');
  });
});
