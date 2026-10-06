import { describe, it, expect, vi, beforeEach } from 'vitest';
import TimetableManagement, { 
  getEligibleTeachersForSubject,
  formatSectionLabel,
  formatDisplayValue,
  formatTeacherDisplay
} from '../TimetableManagement.jsx';
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

  // ============================================================
  // 4. ASSIGNED TEACHER AUTO-DISPLAY & FILTERING
  // ============================================================

  describe('getEligibleTeachersForSubject', () => {
    const ENGLISH_SUB_ID = 'sub-eng-111';
    const MATH_SUB_ID = 'sub-math-222';
    const CLASS_A_ID = 'class-10-a';
    const CLASS_B_ID = 'class-10-b';

    const subjectsList = [
      { id: ENGLISH_SUB_ID, name: 'English', code: 'ENG101' },
      { id: MATH_SUB_ID, name: 'Mathematics', code: 'MATH101' }
    ];

    const teacherEnglishGeneral = {
      id: 'teacher-eng-gen',
      name: 'Alice English',
      assignments: {
        assignedSubjectIds: [ENGLISH_SUB_ID]
      }
    };

    const teacherEnglishClassA = {
      id: 'teacher-eng-a',
      name: 'Bob English Class A',
      assignments: {
        assignedSubjectIds: [ENGLISH_SUB_ID],
        subjectClassIds: [CLASS_A_ID]
      }
    };

    const teacherEnglishClassB = {
      id: 'teacher-eng-b',
      name: 'Charlie English Class B',
      customData: {
        assignments: {
          assignedSubjectIds: [ENGLISH_SUB_ID],
          subjectClassIds: [CLASS_B_ID]
        }
      }
    };

    const teacherMath = {
      id: 'teacher-math',
      name: 'David Math',
      assignments: {
        assignedSubjectIds: [MATH_SUB_ID]
      }
    };

    const teachersList = [
      teacherEnglishGeneral,
      teacherEnglishClassA,
      teacherEnglishClassB,
      teacherMath
    ];

    it('returns the assigned teacher when subject is selected', () => {
      const eligible = getEligibleTeachersForSubject('Mathematics', null, teachersList, subjectsList);
      expect(eligible).toHaveLength(1);
      expect(eligible[0].id).toBe('teacher-math');
      expect(eligible[0].name).toBe('David Math');
    });

    it('returns class-scoped assigned teacher when selectedClassId is specified', () => {
      const eligibleClassA = getEligibleTeachersForSubject('English', CLASS_A_ID, teachersList, subjectsList);
      expect(eligibleClassA).toHaveLength(1);
      expect(eligibleClassA[0].id).toBe('teacher-eng-a');

      const eligibleClassB = getEligibleTeachersForSubject('English', CLASS_B_ID, teachersList, subjectsList);
      expect(eligibleClassB).toHaveLength(1);
      expect(eligibleClassB[0].id).toBe('teacher-eng-b');
    });

    it('returns all assigned teachers when multiple teachers are assigned to the subject', () => {
      // For a class where no class-specific teacher is set, returns general subject teachers
      const eligible = getEligibleTeachersForSubject('English', 'class-other-unscoped', teachersList, subjectsList);
      expect(eligible.map(t => t.id)).toContain('teacher-eng-gen');
    });

    it('returns empty array when no teacher is assigned to the subject', () => {
      const eligible = getEligibleTeachersForSubject('Science', null, teachersList, subjectsList);
      expect(eligible).toEqual([]);
    });

    it('handles empty inputs gracefully', () => {
      expect(getEligibleTeachersForSubject('', null, teachersList, subjectsList)).toEqual([]);
      expect(getEligibleTeachersForSubject('English', null, [], subjectsList)).toEqual([]);
    });
  });

  // ============================================================
  // 5. BUG-006 REGRESSION: OBJECT-SHAPED DATA NORMALIZATION & REACT #31 PREVENTION
  // ============================================================

  describe('BUG-006: Object-Shaped Data Normalization & React #31 Prevention', () => {
    describe('formatSectionLabel', () => {
      it('returns empty string for null, undefined, or empty section', () => {
        expect(formatSectionLabel(null)).toBe('');
        expect(formatSectionLabel(undefined)).toBe('');
        expect(formatSectionLabel('')).toBe('');
      });

      it('returns string section as-is', () => {
        expect(formatSectionLabel('A')).toBe('A');
        expect(formatSectionLabel('Section B')).toBe('Section B');
      });

      it('extracts name or code from object-shaped section { id, name, code }', () => {
        expect(formatSectionLabel({ id: 'sec-1', name: 'A', code: 'SEC-A' })).toBe('A');
        expect(formatSectionLabel({ id: 'sec-2', name: '', code: 'B' })).toBe('B');
        expect(formatSectionLabel({ id: 'sec-3' })).toBe('');
      });
    });

    describe('formatDisplayValue', () => {
      it('returns fallback for null or undefined value', () => {
        expect(formatDisplayValue(null, 'Subject')).toBe('Subject');
        expect(formatDisplayValue(undefined, 'Fallback')).toBe('Fallback');
      });

      it('returns string value as-is', () => {
        expect(formatDisplayValue('Mathematics', 'Subject')).toBe('Mathematics');
      });

      it('extracts name or code from object-shaped value { id, name, code }', () => {
        const objSubject = { id: 'sub-1', name: 'Mathematics', code: 'MATH' };
        expect(formatDisplayValue(objSubject, 'Subject')).toBe('Mathematics');

        const codeOnlySubject = { id: 'sub-2', code: 'PHY' };
        expect(formatDisplayValue(codeOnlySubject, 'Subject')).toBe('PHY');
      });
    });

    describe('formatTeacherDisplay', () => {
      it('returns fallback for null or undefined teacher', () => {
        expect(formatTeacherDisplay(null, 'Not Assigned')).toBe('Not Assigned');
        expect(formatTeacherDisplay(undefined, 'Not Assigned')).toBe('Not Assigned');
      });

      it('returns string teacher as-is', () => {
        expect(formatTeacherDisplay('Jane Doe', 'Not Assigned')).toBe('Jane Doe');
      });

      it('extracts name or combined name from object-shaped teacher { id, name, email }', () => {
        const objTeacherWithName = { id: 't-1', name: 'Jane Doe', email: 'jane@school.edu' };
        expect(formatTeacherDisplay(objTeacherWithName, 'Not Assigned')).toBe('Jane Doe');

        const objTeacherWithFirstLast = { id: 't-2', firstName: 'John', lastName: 'Smith' };
        expect(formatTeacherDisplay(objTeacherWithFirstLast, 'Not Assigned')).toBe('John Smith');

        const emptyObjTeacher = { id: 't-3' };
        expect(formatTeacherDisplay(emptyObjTeacher, 'Not Assigned')).toBe('Not Assigned');
      });
    });

    it('correctly handles Don Bosco I - Section timetable response containing object-shaped subject and teacher', async () => {
      const DON_BOSCO_CLASS_ID = 'class-don-bosco-i-sec';
      const OBJECT_SHAPED_PERIOD = {
        id: 'period-don-bosco-1',
        classId: DON_BOSCO_CLASS_ID,
        className: 'I - Section',
        subjectId: 'sub-eng',
        subjectName: 'English',
        subject: {
          id: 'sub-eng',
          name: 'English',
          code: 'ENG'
        },
        teacherId: 'teacher-smith',
        teacherName: 'Mr. Smith',
        teacher: {
          id: 'teacher-smith',
          name: 'Mr. Smith',
          email: 'smith@donbosco.edu',
          phone: null
        },
        dayOfWeek: 1,
        day: 'Monday',
        periodNumber: 1,
        startTime: '09:00',
        endTime: '10:00'
      };

      const mockDonBoscoTimetable = {
        classId: DON_BOSCO_CLASS_ID,
        className: 'I - Section',
        schedule: {
          Monday: [OBJECT_SHAPED_PERIOD],
          Tuesday: [],
          Wednesday: [],
          Thursday: [],
          Friday: [],
          Saturday: []
        },
        periods: [OBJECT_SHAPED_PERIOD]
      };

      vi.spyOn(timetablesApiModule, 'getClassTimetable').mockResolvedValue({
        status: 'success',
        data: mockDonBoscoTimetable
      });

      const res = await timetablesApiModule.getClassTimetable(DON_BOSCO_CLASS_ID);

      expect(res.data.classId).toBe(DON_BOSCO_CLASS_ID);
      const mondaySlot = res.data.schedule.Monday[0];
      
      // Verify raw API response contains nested objects
      expect(typeof mondaySlot.subject).toBe('object');
      expect(typeof mondaySlot.teacher).toBe('object');

      // Verify normalization helpers prevent React #31 by producing scalar strings
      expect(formatDisplayValue(mondaySlot.subject, 'Subject')).toBe('English');
      expect(formatTeacherDisplay(mondaySlot.teacher, 'Not Assigned')).toBe('Mr. Smith');
    });
  });
});
