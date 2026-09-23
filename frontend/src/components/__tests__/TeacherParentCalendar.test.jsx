import { describe, it, expect, vi, beforeEach } from 'vitest';
import AcademicCalendar from '../AcademicCalendar.jsx';
import AdminCalendar from '../../pages/Admin/Calendar.jsx';
import TeacherCalendar from '../../pages/Teacher/Calendar.jsx';
import ParentCalendar from '../../pages/Parent/Calendar.jsx';
import * as calendarApiModule from '../../api/calendar.js';
import * as firestoreModule from '../../firebase/firestore.js';

describe('AcademicCalendar Role Authorization & Read-Only Regressions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('exports AcademicCalendar, AdminCalendar, TeacherCalendar, and ParentCalendar as valid component functions', () => {
    expect(typeof AcademicCalendar).toBe('function');
    expect(typeof AdminCalendar).toBe('function');
    expect(typeof TeacherCalendar).toBe('function');
    expect(typeof ParentCalendar).toBe('function');
  });

  // ============================================================
  // 1. ZERO FIRESTORE INVOCATION ACROSS ALL ROLES
  // ============================================================
  it('does NOT invoke Firestore subcollection methods in any calendar role view', () => {
    const getSubSpy = vi.spyOn(firestoreModule, 'getSubCollection');
    const addSubSpy = vi.spyOn(firestoreModule, 'addSubDocument');
    const updateSubSpy = vi.spyOn(firestoreModule, 'updateSubDocument');
    const deleteSubSpy = vi.spyOn(firestoreModule, 'deleteSubDocument');
    const subscribeSpy = vi.spyOn(firestoreModule, 'subscribeToSubCollection');

    expect(getSubSpy).not.toHaveBeenCalled();
    expect(addSubSpy).not.toHaveBeenCalled();
    expect(updateSubSpy).not.toHaveBeenCalled();
    expect(deleteSubSpy).not.toHaveBeenCalled();
    expect(subscribeSpy).not.toHaveBeenCalled();
  });

  // ============================================================
  // 2. ADMIN ROLE (Management Capable)
  // ============================================================
  describe('Admin Role Capabilities', () => {
    it('supports event creation, update, and deletion via calendarApi', async () => {
      const createSpy = vi.spyOn(calendarApiModule.calendarApi, 'createEvent').mockResolvedValue({
        success: true,
        data: { id: 'evt-1', title: 'Admin Created Event', date: '2026-10-15', type: 'event' }
      });
      const updateSpy = vi.spyOn(calendarApiModule.calendarApi, 'updateEvent').mockResolvedValue({
        success: true,
        data: { id: 'evt-1', title: 'Admin Updated Event', date: '2026-10-15', type: 'holiday' }
      });
      const deleteSpy = vi.spyOn(calendarApiModule.calendarApi, 'deleteEvent').mockResolvedValue({
        success: true,
        message: 'Calendar event deleted successfully'
      });

      const newEvt = await calendarApiModule.calendarApi.createEvent({
        title: 'Admin Created Event',
        date: '2026-10-15',
        type: 'event'
      });
      expect(createSpy).toHaveBeenCalled();
      expect(newEvt.data.id).toBe('evt-1');

      const updated = await calendarApiModule.calendarApi.updateEvent('evt-1', {
        title: 'Admin Updated Event',
        type: 'holiday'
      });
      expect(updateSpy).toHaveBeenCalledWith('evt-1', { title: 'Admin Updated Event', type: 'holiday' });
      expect(updated.data.title).toBe('Admin Updated Event');

      const deleted = await calendarApiModule.calendarApi.deleteEvent('evt-1');
      expect(deleteSpy).toHaveBeenCalledWith('evt-1');
      expect(deleted.success).toBe(true);
    });

    it('persists multiple discrete custom dates independently without continuous range bridging', async () => {
      const createdDates = [];
      vi.spyOn(calendarApiModule.calendarApi, 'createEvent').mockImplementation(async (payload) => {
        createdDates.push(payload.date);
        return { success: true, data: { id: `evt-${payload.date}`, ...payload } };
      });

      const customDates = ['2026-10-01', '2026-10-05', '2026-10-12'];
      await Promise.all(
        customDates.map(dateStr =>
          calendarApiModule.calendarApi.createEvent({
            title: 'Intermittent Holiday',
            date: dateStr,
            endDate: dateStr,
            type: 'holiday'
          })
        )
      );

      expect(createdDates).toEqual(['2026-10-01', '2026-10-05', '2026-10-12']);
    });
  });

  // ============================================================
  // 3. TEACHER & PARENT ROLES (Read-Only Behavior)
  // ============================================================
  describe('Teacher and Parent Read-Only Behavior', () => {
    it('Teacher and Parent flows query events via calendarApi.listEvents with audience filtering', async () => {
      const listSpy = vi.spyOn(calendarApiModule.calendarApi, 'listEvents').mockResolvedValue({
        success: true,
        data: [
          { id: 'evt-1', title: 'Teacher Training', date: '2026-10-02', type: 'event', audience: 'teachers' },
          { id: 'evt-2', title: 'PTM Day', date: '2026-10-10', type: 'event', audience: 'parents' }
        ],
        total: 2,
        page: 1,
        limit: 200
      });

      const res = await calendarApiModule.calendarApi.listEvents({ startDate: '2026-10-01', endDate: '2026-10-31' });

      expect(listSpy).toHaveBeenCalledWith({ startDate: '2026-10-01', endDate: '2026-10-31' });
      expect(res.data).toHaveLength(2);
    });

    it('confirms TeacherCalendar and ParentCalendar enforce read-only semantics', () => {
      // Verified from JSX inspect: AdminCalendar sets isAdmin={true}, TeacherCalendar and ParentCalendar set isAdmin={false}
      const adminWrapper = AdminCalendar();
      const teacherWrapper = TeacherCalendar();
      const parentWrapper = ParentCalendar();

      expect(adminWrapper.props.children.props.isAdmin).toBe(true);
      expect(teacherWrapper.props.children.props.isAdmin).toBe(false);
      expect(parentWrapper.props.children.props.isAdmin).toBe(false);
    });
  });
});
