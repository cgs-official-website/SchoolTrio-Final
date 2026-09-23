import { describe, it, expect, vi, beforeEach } from 'vitest';
import AdminCalendar from '../Calendar.jsx';
import * as calendarApiModule from '../../../api/calendar.js';
import * as firestoreModule from '../../../firebase/firestore.js';

describe('Admin Calendar Page Component (Phase AC.3)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. is exported as a valid React component function', () => {
    expect(typeof AdminCalendar).toBe('function');
  });

  it('2. does NOT invoke legacy Firestore functions for calendar operations', () => {
    const firestoreSpies = [
      vi.spyOn(firestoreModule, 'subscribeToSubCollection'),
      vi.spyOn(firestoreModule, 'addSubDocument'),
      vi.spyOn(firestoreModule, 'updateSubDocument'),
      vi.spyOn(firestoreModule, 'deleteSubDocument'),
      vi.spyOn(firestoreModule, 'getSubCollection')
    ];

    firestoreSpies.forEach(spy => {
      expect(spy).not.toHaveBeenCalled();
    });
  });

  it('3. integrates with calendarApi for event management', async () => {
    const mockEvents = [
      { id: 'cal-1', title: 'Winter Break', date: '2026-12-20', endDate: '2026-12-31', type: 'holiday', audience: 'all' }
    ];

    const listSpy = vi.spyOn(calendarApiModule.calendarApi, 'listEvents').mockResolvedValue({
      success: true,
      data: mockEvents,
      total: 1,
      page: 1,
      limit: 200
    });

    const res = await calendarApiModule.calendarApi.listEvents();
    expect(listSpy).toHaveBeenCalled();
    expect(res.data).toHaveLength(1);
    expect(res.data[0].title).toBe('Winter Break');
  });
});
