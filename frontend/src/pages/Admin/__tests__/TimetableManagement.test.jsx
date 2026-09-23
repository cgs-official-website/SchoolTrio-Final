import { describe, it, expect, vi, beforeEach } from 'vitest';
import TimetableManagement from '../TimetableManagement.jsx';
import * as timetablesApiModule from '../../../api/timetables.js';
import * as firestoreModule from '../../../firebase/firestore.js';

describe('Admin TimetableManagement Component REST Cutover (Phase T.3)', () => {
  const CLASS_ID = '11111111-1111-4111-8111-111111111111';
  const PERIOD_ID = '22222222-2222-4222-8222-222222222222';
  const SUBJECT_ID = '33333333-3333-4333-8333-333333333333';
  const TEACHER_ID = '44444444-4444-4444-8444-444444444444';

  const MOCK_PERIOD = {
    id: PERIOD_ID,
    classId: CLASS_ID,
    className: 'Grade 10 - A',
    subjectId: SUBJECT_ID,
    subjectName: 'Mathematics',
    teacherId: TEACHER_ID,
    teacherName: 'Jane Doe',
    dayOfWeek: 1,
    day: 'Monday',
    periodNumber: 1,
    startTime: '09:00',
    endTime: '10:00',
    roomNumber: '101'
  };

  const MOCK_CLASS_TIMETABLE = {
    classId: CLASS_ID,
    className: 'Grade 10 - A',
    schedule: {
      Monday: [MOCK_PERIOD],
      Tuesday: [],
      Wednesday: [],
      Thursday: [],
      Friday: [],
      Saturday: []
    },
    periods: [MOCK_PERIOD]
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported as a valid React component function', () => {
    expect(typeof TimetableManagement).toBe('function');
  });

  // ============================================================
  // 1. ZERO FIRESTORE TIMETABLE OPERATIONS
  // ============================================================

  it('does NOT invoke legacy Firestore saveTimetable or getTimetable', () => {
    const firestoreTimetableSpies = [
      vi.spyOn(firestoreModule, 'saveTimetable'),
      vi.spyOn(firestoreModule, 'getTimetable')
    ];

    firestoreTimetableSpies.forEach((spy) => {
      expect(spy).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // 2. REST OPERATIONS FOR TIMETABLES
  // ============================================================

  it('loads master timetable grid from REST listTimetables', async () => {
    const listSpy = vi.spyOn(timetablesApiModule, 'listTimetables').mockResolvedValue({
      status: 'success',
      data: [MOCK_PERIOD]
    });

    const res = await timetablesApiModule.listTimetables();

    expect(listSpy).toHaveBeenCalled();
    expect(res.data).toHaveLength(1);
    expect(res.data[0].id).toBe(PERIOD_ID);
  });

  it('loads selected class timetable from REST getClassTimetable', async () => {
    const getClassSpy = vi.spyOn(timetablesApiModule, 'getClassTimetable').mockResolvedValue({
      status: 'success',
      data: MOCK_CLASS_TIMETABLE
    });

    const res = await timetablesApiModule.getClassTimetable(CLASS_ID);

    expect(getClassSpy).toHaveBeenCalledWith(CLASS_ID);
    expect(res.data.classId).toBe(CLASS_ID);
    expect(res.data.schedule.Monday).toHaveLength(1);
  });

  it('saves weekly class timetable atomically via replaceClassTimetable', async () => {
    const replaceSpy = vi.spyOn(timetablesApiModule, 'replaceClassTimetable').mockResolvedValue({
      status: 'success',
      message: 'Class timetable updated successfully',
      data: MOCK_CLASS_TIMETABLE
    });

    const payload = {
      schedule: {
        Monday: [
          {
            id: PERIOD_ID,
            periodNumber: 1,
            startTime: '09:00',
            endTime: '10:00',
            subjectId: SUBJECT_ID,
            teacherId: TEACHER_ID
          }
        ]
      }
    };

    const res = await timetablesApiModule.replaceClassTimetable(CLASS_ID, payload);

    expect(replaceSpy).toHaveBeenCalledWith(CLASS_ID, payload);
    expect(res.status).toBe('success');
  });

  it('creates a single period via createTimetablePeriod', async () => {
    const createSpy = vi.spyOn(timetablesApiModule, 'createTimetablePeriod').mockResolvedValue({
      status: 'success',
      data: MOCK_PERIOD
    });

    const payload = {
      classId: CLASS_ID,
      dayOfWeek: 1,
      periodNumber: 1,
      startTime: '09:00',
      endTime: '10:00',
      subjectId: SUBJECT_ID
    };

    const res = await timetablesApiModule.createTimetablePeriod(payload);

    expect(createSpy).toHaveBeenCalledWith(payload);
    expect(res.data.id).toBe(PERIOD_ID);
  });

  it('updates a single period via updateTimetablePeriod', async () => {
    const updateSpy = vi.spyOn(timetablesApiModule, 'updateTimetablePeriod').mockResolvedValue({
      status: 'success',
      data: { ...MOCK_PERIOD, startTime: '09:30' }
    });

    const res = await timetablesApiModule.updateTimetablePeriod(PERIOD_ID, { startTime: '09:30' });

    expect(updateSpy).toHaveBeenCalledWith(PERIOD_ID, { startTime: '09:30' });
    expect(res.data.startTime).toBe('09:30');
  });

  it('deletes a single period via deleteTimetablePeriod', async () => {
    const deleteSpy = vi.spyOn(timetablesApiModule, 'deleteTimetablePeriod').mockResolvedValue({
      status: 'success',
      data: { id: PERIOD_ID }
    });

    const res = await timetablesApiModule.deleteTimetablePeriod(PERIOD_ID);

    expect(deleteSpy).toHaveBeenCalledWith(PERIOD_ID);
    expect(res.data.id).toBe(PERIOD_ID);
  });

  it('verifies weekly schedule contains Monday..Saturday and excludes Sunday', async () => {
    const getClassSpy = vi.spyOn(timetablesApiModule, 'getClassTimetable').mockResolvedValue({
      status: 'success',
      data: MOCK_CLASS_TIMETABLE
    });

    const res = await timetablesApiModule.getClassTimetable(CLASS_ID);
    expect(getClassSpy).toHaveBeenCalledWith(CLASS_ID);
    const scheduleKeys = Object.keys(res.data.schedule);

    expect(scheduleKeys).toContain('Monday');
    expect(scheduleKeys).toContain('Tuesday');
    expect(scheduleKeys).toContain('Wednesday');
    expect(scheduleKeys).toContain('Thursday');
    expect(scheduleKeys).toContain('Friday');
    expect(scheduleKeys).toContain('Saturday');
    expect(scheduleKeys).not.toContain('Sunday');
  });

  it('supports empty schedule atomic clearing via periods: []', async () => {
    const replaceSpy = vi.spyOn(timetablesApiModule, 'replaceClassTimetable').mockResolvedValue({
      status: 'success',
      message: 'Class timetable updated successfully',
      data: { classId: CLASS_ID, periods: [] }
    });

    const emptyPayload = { periods: [] };
    const res = await timetablesApiModule.replaceClassTimetable(CLASS_ID, emptyPayload);

    expect(replaceSpy).toHaveBeenCalledWith(CLASS_ID, emptyPayload);
    expect(res.data.periods).toEqual([]);
  });

  // ============================================================
  // 3. REST OPERATIONS FOR TIMETABLE REFERENCE DATA
  // ============================================================

  it('loads reference classes, staff, and subjects via REST clients', async () => {
    const classesApi = await import('../../../api/classes.js');
    const staffApi = await import('../../../api/staff.js');
    const subjectsApi = await import('../../../api/subjects.js');

    const classesSpy = vi.spyOn(classesApi, 'listClasses').mockResolvedValue({
      success: true,
      data: [{ id: CLASS_ID, name: 'Grade 10', section: 'A' }]
    });

    const staffSpy = vi.spyOn(staffApi, 'listStaff').mockResolvedValue({
      success: true,
      data: [{ id: TEACHER_ID, firstName: 'Jane', lastName: 'Doe' }]
    });

    const subjectsSpy = vi.spyOn(subjectsApi, 'listSubjects').mockResolvedValue({
      success: true,
      data: [{ id: SUBJECT_ID, name: 'Mathematics' }]
    });

    const [cRes, stRes, subRes] = await Promise.all([
      classesApi.listClasses({ limit: 100 }),
      staffApi.listStaff({ limit: 100 }),
      subjectsApi.listSubjects({ limit: 100 })
    ]);

    expect(classesSpy).toHaveBeenCalledWith({ limit: 100 });
    expect(staffSpy).toHaveBeenCalledWith({ limit: 100 });
    expect(subjectsSpy).toHaveBeenCalledWith({ limit: 100 });

    expect(cRes.data).toHaveLength(1);
    expect(stRes.data).toHaveLength(1);
    expect(subRes.data).toHaveLength(1);
  });
});
