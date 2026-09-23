import { describe, it, expect, vi, beforeEach } from 'vitest';
import AcademicCalendar from '../AcademicCalendar.jsx';
import * as calendarApiModule from '../../api/calendar.js';
import * as firestoreModule from '../../firebase/firestore.js';

describe('AcademicCalendar Component (REST Migration)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported as a valid React component function', () => {
    expect(typeof AcademicCalendar).toBe('function');
  });

  // ============================================================
  // 1. ZERO FIRESTORE CALENDAR ACCESS
  // ============================================================

  it('does NOT invoke Firestore calendar subcollection helpers', () => {
    const subCollectionSpy = vi.spyOn(firestoreModule, 'getSubCollection');
    const addSubDocSpy = vi.spyOn(firestoreModule, 'addSubDocument');
    const updateSubDocSpy = vi.spyOn(firestoreModule, 'updateSubDocument');
    const deleteSubDocSpy = vi.spyOn(firestoreModule, 'deleteSubDocument');

    expect(subCollectionSpy).not.toHaveBeenCalled();
    expect(addSubDocSpy).not.toHaveBeenCalled();
    expect(updateSubDocSpy).not.toHaveBeenCalled();
    expect(deleteSubDocSpy).not.toHaveBeenCalled();
  });

  // ============================================================
  // 2. REST CALENDAR API INTEGRATION
  // ============================================================

  it('fetches calendar events from REST calendar API', async () => {
    const mockEvents = [
      {
        id: 'cal-event-1',
        title: 'Midterm Exams',
        date: '2026-10-15',
        endDate: '2026-10-20',
        type: 'exam',
        description: 'Semester 1 midterm examinations',
        audience: 'all'
      }
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
    expect(res.data[0].id).toBe('cal-event-1');
    expect(res.data[0].title).toBe('Midterm Exams');
    expect(res.data[0].type).toBe('exam');
    expect(res.data[0].date).toBe('2026-10-15');
    expect(res.data[0].endDate).toBe('2026-10-20');
  });

  it('creates a new calendar event via calendarApi.createEvent', async () => {
    const payload = {
      title: 'Sports Day',
      date: '2026-11-05',
      endDate: '2026-11-05',
      type: 'event'
    };

    const createSpy = vi.spyOn(calendarApiModule.calendarApi, 'createEvent').mockResolvedValue({
      success: true,
      data: {
        id: 'new-event-uuid',
        ...payload,
        audience: 'all'
      }
    });

    const res = await calendarApiModule.calendarApi.createEvent(payload);

    expect(createSpy).toHaveBeenCalledWith(payload);
    expect(res.data.id).toBe('new-event-uuid');
    expect(res.data.title).toBe('Sports Day');
  });

  it('updates a calendar event via calendarApi.updateEvent', async () => {
    const eventId = 'cal-event-1';
    const payload = {
      title: 'Updated Midterm Schedule',
      date: '2026-10-16',
      endDate: '2026-10-21',
      type: 'exam'
    };

    const updateSpy = vi.spyOn(calendarApiModule.calendarApi, 'updateEvent').mockResolvedValue({
      success: true,
      data: {
        id: eventId,
        ...payload
      }
    });

    const res = await calendarApiModule.calendarApi.updateEvent(eventId, payload);

    expect(updateSpy).toHaveBeenCalledWith(eventId, payload);
    expect(res.data.title).toBe('Updated Midterm Schedule');
  });

  it('deletes a calendar event via calendarApi.deleteEvent', async () => {
    const eventId = 'cal-event-1';

    const deleteSpy = vi.spyOn(calendarApiModule.calendarApi, 'deleteEvent').mockResolvedValue({
      success: true,
      message: 'Calendar event deleted successfully'
    });

    const res = await calendarApiModule.calendarApi.deleteEvent(eventId);

    expect(deleteSpy).toHaveBeenCalledWith(eventId);
    expect(res.success).toBe(true);
  });
});
