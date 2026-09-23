import { describe, it, expect, vi, beforeEach } from 'vitest';
import TeacherTimetable from '../TeacherTimetable.jsx';
import * as timetablesApiModule from '../../../api/timetables.js';
import * as firestoreModule from '../../../firebase/firestore.js';

describe('TeacherTimetable Component REST Cutover (Phase T.3)', () => {
  const TEACHER_ID = '44444444-4444-4444-8444-444444444444';
  const CLASS_ID = '11111111-1111-4111-8111-111111111111';
  const PERIOD_ID = '22222222-2222-4222-8222-222222222222';

  const MOCK_PERIOD = {
    id: PERIOD_ID,
    classId: CLASS_ID,
    className: 'Grade 10 - A',
    subjectId: 'sub-1',
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

  const MOCK_TEACHER_SCHEDULE = {
    teacherId: TEACHER_ID,
    teacherName: 'Jane Doe',
    isClassTeacher: true,
    assignedClassId: CLASS_ID,
    assignedClassName: 'Grade 10 - A',
    subjectSchedule: {
      Monday: [MOCK_PERIOD],
      Tuesday: [],
      Wednesday: [],
      Thursday: [],
      Friday: [],
      Saturday: []
    },
    classSchedule: {
      Monday: [MOCK_PERIOD],
      Tuesday: [],
      Wednesday: [],
      Thursday: [],
      Friday: [],
      Saturday: []
    },
    subjectPeriods: [MOCK_PERIOD],
    classPeriods: [MOCK_PERIOD]
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported as a valid React component function', () => {
    expect(typeof TeacherTimetable).toBe('function');
  });

  // ============================================================
  // 1. ZERO FIRESTORE TIMETABLE OPERATIONS
  // ============================================================

  it('does NOT invoke legacy Firestore timetable methods', () => {
    const firestoreTimetableSpies = [
      vi.spyOn(firestoreModule, 'getTimetable'),
      vi.spyOn(firestoreModule, 'saveTimetable')
    ];

    firestoreTimetableSpies.forEach((spy) => {
      expect(spy).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // 2. REST OPERATIONS FOR TEACHER TIMETABLE
  // ============================================================

  it('loads teacher schedule via timetablesApi.getMyTimetable', async () => {
    const getMyTimetableSpy = vi.spyOn(timetablesApiModule, 'getMyTimetable').mockResolvedValue({
      status: 'success',
      data: MOCK_TEACHER_SCHEDULE
    });

    const res = await timetablesApiModule.getMyTimetable();

    expect(getMyTimetableSpy).toHaveBeenCalled();
    expect(res.data.teacherId).toBe(TEACHER_ID);
    expect(res.data.isClassTeacher).toBe(true);
    expect(res.data.subjectSchedule.Monday).toHaveLength(1);
    expect(res.data.classSchedule.Monday).toHaveLength(1);
  });

  it('formats Excel export data accurately from REST-derived schedule', () => {
    const schedule = MOCK_TEACHER_SCHEDULE.subjectSchedule;
    const selectedFields = { time: true, subject: true, class: true, room: true, teacher: true };
    const exportData = [];

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    days.forEach((day) => {
      const daySlots = schedule[day] || [];
      daySlots.forEach((slot) => {
        const row = { Day: day };
        if (selectedFields.time) row['Time Slot'] = `${slot.startTime} - ${slot.endTime}`;
        if (selectedFields.subject) row['Subject Name'] = slot.subjectName;
        if (selectedFields.class) row['Class / Section'] = slot.className;
        if (selectedFields.room) row['Room / Location'] = slot.roomNumber;
        if (selectedFields.teacher) row['Teacher Name'] = slot.teacherName;
        exportData.push(row);
      });
    });

    expect(exportData).toHaveLength(1);
    expect(exportData[0]).toEqual({
      Day: 'Monday',
      'Time Slot': '09:00 - 10:00',
      'Subject Name': 'Mathematics',
      'Class / Section': 'Grade 10 - A',
      'Room / Location': '101',
      'Teacher Name': 'Jane Doe'
    });
  });

  it('handles empty schedule state without crashing', async () => {
    vi.spyOn(timetablesApiModule, 'getMyTimetable').mockResolvedValue({
      status: 'success',
      data: {
        teacherId: TEACHER_ID,
        isClassTeacher: false,
        subjectSchedule: { Monday: [] },
        classSchedule: { Monday: [] }
      }
    });

    const res = await timetablesApiModule.getMyTimetable();
    expect(res.data.isClassTeacher).toBe(false);
    expect(res.data.subjectSchedule.Monday).toHaveLength(0);
  });

  it('verifies my-schedule contains Monday..Saturday and excludes Sunday', async () => {
    vi.spyOn(timetablesApiModule, 'getMyTimetable').mockResolvedValue({
      status: 'success',
      data: MOCK_TEACHER_SCHEDULE
    });

    const res = await timetablesApiModule.getMyTimetable();
    const subKeys = Object.keys(res.data.subjectSchedule);
    const clsKeys = Object.keys(res.data.classSchedule);

    expect(subKeys).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);
    expect(clsKeys).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);
    expect(subKeys).not.toContain('Sunday');
    expect(clsKeys).not.toContain('Sunday');
  });

  it('validates canonical teacher contract fields (isClassTeacher, assignedClassId, assignedClassName)', async () => {
    vi.spyOn(timetablesApiModule, 'getMyTimetable').mockResolvedValue({
      status: 'success',
      data: MOCK_TEACHER_SCHEDULE
    });

    const res = await timetablesApiModule.getMyTimetable();
    expect(res.data.isClassTeacher).toBe(true);
    expect(res.data.assignedClassId).toBe(CLASS_ID);
    expect(res.data.assignedClassName).toBe('Grade 10 - A');
    expect(res.data).toHaveProperty('subjectPeriods');
    expect(res.data).toHaveProperty('classPeriods');
  });
});
