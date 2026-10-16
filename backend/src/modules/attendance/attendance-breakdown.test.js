import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as attendanceService from './attendance.service.js';
import * as attendanceRepository from './attendance.repository.js';
import { TenantAccessError } from '../../utils/app-error.js';

vi.mock('./attendance.repository.js');

describe('ATT-001: Attendance Breakdown Student Strength & Session Filter', () => {
  const schoolId = '11111111-1111-1111-1111-111111111111';
  const otherSchoolId = '99999999-9999-9999-9999-999999999999';
  const classAId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const classBId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const targetDate = '2026-10-15';

  const mockStudentsClassA = [
    { id: 's1-uuid', sectionId: 'sec-a' },
    { id: 's2-uuid', sectionId: 'sec-a' },
    { id: 's3-uuid', sectionId: 'sec-a' },
    { id: 's4-uuid', sectionId: 'sec-a' }
  ];

  const mockStudentsClassB = [
    { id: 'sb1-uuid', sectionId: 'sec-b' },
    { id: 'sb2-uuid', sectionId: 'sec-b' },
    { id: 'sb3-uuid', sectionId: 'sec-b' }
  ];

  const mockClasses = [
    {
      id: classAId,
      name: 'Grade 10 - A',
      gradeLevel: 10,
      sections: [{ id: 'sec-a', name: 'A' }],
      students: mockStudentsClassA
    },
    {
      id: classBId,
      name: 'Grade 10 - B',
      gradeLevel: 10,
      sections: [{ id: 'sec-b', name: 'B' }],
      students: mockStudentsClassB
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    attendanceRepository.findClassesForDashboard.mockResolvedValue(mockClasses);
  });

  it('1. Four enrolled students with four FN records display strength 4', async () => {
    const fnSession = {
      id: 'sess-fn-1',
      classId: classAId,
      session: 'FN',
      class: { id: classAId, name: 'Grade 10 - A', gradeLevel: 10 },
      records: [
        { studentId: 's1-uuid', status: 'Present' },
        { studentId: 's2-uuid', status: 'Present' },
        { studentId: 's3-uuid', status: 'Present' },
        { studentId: 's4-uuid', status: 'Absent' }
      ]
    };

    attendanceRepository.findDailySessionsForDashboard.mockResolvedValue([fnSession]);

    const result = await attendanceService.getDashboardStats(schoolId, targetDate, 'FN');

    expect(result.byClass[classAId]).toBeDefined();
    expect(result.byClass[classAId].total).toBe(4);
    expect(result.byClass[classAId].present).toBe(3);
    expect(result.byClass[classAId].absent).toBe(1);
    expect(result.byClass[classAId].percentage).toBe(75);
    expect(result.schoolWide.total).toBe(4);
  });

  it('2. The same four students with four AN records still display strength 4', async () => {
    const anSession = {
      id: 'sess-an-1',
      classId: classAId,
      session: 'AN',
      class: { id: classAId, name: 'Grade 10 - A', gradeLevel: 10 },
      records: [
        { studentId: 's1-uuid', status: 'Present' },
        { studentId: 's2-uuid', status: 'Present' },
        { studentId: 's3-uuid', status: 'Late' },
        { studentId: 's4-uuid', status: 'Present' }
      ]
    };

    attendanceRepository.findDailySessionsForDashboard.mockResolvedValue([anSession]);

    const result = await attendanceService.getDashboardStats(schoolId, targetDate, 'AN');

    expect(result.byClass[classAId]).toBeDefined();
    expect(result.byClass[classAId].total).toBe(4);
    expect(result.byClass[classAId].present).toBe(3);
    expect(result.byClass[classAId].late).toBe(1);
    expect(result.byClass[classAId].percentage).toBe(100);
    expect(result.schoolWide.total).toBe(4);
  });

  it('3. Recording both sessions for all four students displays strength 4, NOT 8', async () => {
    const fnSession = {
      id: 'sess-fn-1',
      classId: classAId,
      session: 'FN',
      class: { id: classAId, name: 'Grade 10 - A', gradeLevel: 10 },
      records: [
        { studentId: 's1-uuid', status: 'Present' },
        { studentId: 's2-uuid', status: 'Present' },
        { studentId: 's3-uuid', status: 'Present' },
        { studentId: 's4-uuid', status: 'Present' }
      ]
    };

    const anSession = {
      id: 'sess-an-1',
      classId: classAId,
      session: 'AN',
      class: { id: classAId, name: 'Grade 10 - A', gradeLevel: 10 },
      records: [
        { studentId: 's1-uuid', status: 'Present' },
        { studentId: 's2-uuid', status: 'Present' },
        { studentId: 's3-uuid', status: 'Present' },
        { studentId: 's4-uuid', status: 'Present' }
      ]
    };

    attendanceRepository.findDailySessionsForDashboard.mockResolvedValue([fnSession, anSession]);

    const result = await attendanceService.getDashboardStats(schoolId, targetDate, 'all');

    expect(result.byClass[classAId].total).toBe(4);
    expect(result.byClass[classAId].total).not.toBe(8);
    expect(result.byClass[classAId].present).toBe(4); // (4 + 4) / 2 = 4
    expect(result.byClass[classAId].percentage).toBe(100);
    expect(result.byGrade['10'].total).toBe(4);
    expect(result.schoolWide.total).toBe(4);
  });

  it('4. FN statistics include only FN records when filtered by FN', async () => {
    const fnSession = {
      id: 'sess-fn-1',
      classId: classAId,
      session: 'FN',
      class: { id: classAId, name: 'Grade 10 - A', gradeLevel: 10 },
      records: [
        { studentId: 's1-uuid', status: 'Present' },
        { studentId: 's2-uuid', status: 'Absent' },
        { studentId: 's3-uuid', status: 'Present' },
        { studentId: 's4-uuid', status: 'Late' }
      ]
    };

    const anSession = {
      id: 'sess-an-1',
      classId: classAId,
      session: 'AN',
      class: { id: classAId, name: 'Grade 10 - A', gradeLevel: 10 },
      records: [
        { studentId: 's1-uuid', status: 'Absent' },
        { studentId: 's2-uuid', status: 'Absent' },
        { studentId: 's3-uuid', status: 'Absent' },
        { studentId: 's4-uuid', status: 'Absent' }
      ]
    };

    attendanceRepository.findDailySessionsForDashboard.mockResolvedValue([fnSession, anSession]);

    const result = await attendanceService.getDashboardStats(schoolId, targetDate, 'FN');

    expect(result.byClass[classAId].total).toBe(4);
    expect(result.byClass[classAId].present).toBe(2);
    expect(result.byClass[classAId].absent).toBe(1);
    expect(result.byClass[classAId].late).toBe(1);
    expect(result.byClass[classAId].percentage).toBe(75);
  });

  it('5. AN statistics include only AN records when filtered by AN', async () => {
    const fnSession = {
      id: 'sess-fn-1',
      classId: classAId,
      session: 'FN',
      class: { id: classAId, name: 'Grade 10 - A', gradeLevel: 10 },
      records: [
        { studentId: 's1-uuid', status: 'Present' },
        { studentId: 's2-uuid', status: 'Present' },
        { studentId: 's3-uuid', status: 'Present' },
        { studentId: 's4-uuid', status: 'Present' }
      ]
    };

    const anSession = {
      id: 'sess-an-1',
      classId: classAId,
      session: 'AN',
      class: { id: classAId, name: 'Grade 10 - A', gradeLevel: 10 },
      records: [
        { studentId: 's1-uuid', status: 'Present' },
        { studentId: 's2-uuid', status: 'Absent' },
        { studentId: 's3-uuid', status: 'Absent' },
        { studentId: 's4-uuid', status: 'Absent' }
      ]
    };

    attendanceRepository.findDailySessionsForDashboard.mockResolvedValue([fnSession, anSession]);

    const result = await attendanceService.getDashboardStats(schoolId, targetDate, 'AN');

    expect(result.byClass[classAId].total).toBe(4);
    expect(result.byClass[classAId].present).toBe(1);
    expect(result.byClass[classAId].absent).toBe(3);
    expect(result.byClass[classAId].late).toBe(0);
    expect(result.byClass[classAId].percentage).toBe(25);
  });

  it('6. All Sessions with only one recorded session does NOT divide by two', async () => {
    // Only FN is recorded (4 students, 3 present, 1 absent)
    const fnOnlySession = {
      id: 'sess-fn-single',
      classId: classAId,
      session: 'FN',
      class: { id: classAId, name: 'Grade 10 - A', gradeLevel: 10 },
      records: [
        { studentId: 's1-uuid', status: 'Present' },
        { studentId: 's2-uuid', status: 'Present' },
        { studentId: 's3-uuid', status: 'Present' },
        { studentId: 's4-uuid', status: 'Absent' }
      ]
    };

    attendanceRepository.findDailySessionsForDashboard.mockResolvedValue([fnOnlySession]);

    const result = await attendanceService.getDashboardStats(schoolId, targetDate, 'all');

    expect(result.byClass[classAId].total).toBe(4);
    expect(result.byClass[classAId].present).toBe(3); // 3 / 1 = 3 (NOT 3 / 2)
    expect(result.byClass[classAId].absent).toBe(1);  // 1 / 1 = 1
    expect(result.byClass[classAId].percentage).toBe(75);
  });

  it('7. All Sessions with two recorded sessions averages across the two sessions', async () => {
    // FN: 4 present, 0 absent
    // AN: 2 present, 2 absent
    // Average: (4 + 2)/2 = 3 present, (0 + 2)/2 = 1 absent
    const fnSession = {
      id: 'sess-fn-1',
      classId: classAId,
      session: 'FN',
      class: { id: classAId, name: 'Grade 10 - A', gradeLevel: 10 },
      records: [
        { studentId: 's1-uuid', status: 'Present' },
        { studentId: 's2-uuid', status: 'Present' },
        { studentId: 's3-uuid', status: 'Present' },
        { studentId: 's4-uuid', status: 'Present' }
      ]
    };

    const anSession = {
      id: 'sess-an-1',
      classId: classAId,
      session: 'AN',
      class: { id: classAId, name: 'Grade 10 - A', gradeLevel: 10 },
      records: [
        { studentId: 's1-uuid', status: 'Present' },
        { studentId: 's2-uuid', status: 'Present' },
        { studentId: 's3-uuid', status: 'Absent' },
        { studentId: 's4-uuid', status: 'Absent' }
      ]
    };

    attendanceRepository.findDailySessionsForDashboard.mockResolvedValue([fnSession, anSession]);

    const result = await attendanceService.getDashboardStats(schoolId, targetDate, 'all');

    expect(result.byClass[classAId].total).toBe(4);
    expect(result.byClass[classAId].present).toBe(3); // (4 + 2) / 2 = 3
    expect(result.byClass[classAId].absent).toBe(1);  // (0 + 2) / 2 = 1
    expect(result.byClass[classAId].percentage).toBe(75); // (6 / 8) * 100 = 75%
  });

  it('8. Missing attendance records do not reduce enrolled strength, and unmarked students are not marked absent', async () => {
    // Class A has 4 enrolled students, but only 2 records exist (s3 and s4 not marked)
    const partialSession = {
      id: 'sess-fn-partial',
      classId: classAId,
      session: 'FN',
      class: { id: classAId, name: 'Grade 10 - A', gradeLevel: 10 },
      records: [
        { studentId: 's1-uuid', status: 'Present' },
        { studentId: 's2-uuid', status: 'Present' }
      ]
    };

    attendanceRepository.findDailySessionsForDashboard.mockResolvedValue([partialSession]);

    const result = await attendanceService.getDashboardStats(schoolId, targetDate, 'FN');

    // Total strength remains 4; absent remains 0 (not silently classifying unmarked as absent)
    expect(result.byClass[classAId].total).toBe(4);
    expect(result.byClass[classAId].present).toBe(2);
    expect(result.byClass[classAId].absent).toBe(0);
    expect(result.byClass[classAId].percentage).toBe(50); // (2 / 4) * 100 = 50%
  });

  it('9. Existing STANDARD or sessionless historical records remain intact in All Sessions', async () => {
    const legacySession = {
      id: 'sess-legacy-1',
      classId: classAId,
      session: 'STANDARD',
      class: { id: classAId, name: 'Grade 10 - A', gradeLevel: 10 },
      records: [
        { studentId: 's1-uuid', status: 'Present' },
        { studentId: 's2-uuid', status: 'Present' },
        { studentId: 's3-uuid', status: 'Present' },
        { studentId: 's4-uuid', status: 'Present' }
      ]
    };

    attendanceRepository.findDailySessionsForDashboard.mockResolvedValue([legacySession]);

    // All Sessions includes legacy records without modification
    const resultAll = await attendanceService.getDashboardStats(schoolId, targetDate, 'all');
    expect(resultAll.byClass[classAId].total).toBe(4);
    expect(resultAll.byClass[classAId].present).toBe(4);

    // FN and AN filters do not improperly claim legacy STANDARD records
    const resultFN = await attendanceService.getDashboardStats(schoolId, targetDate, 'FN');
    expect(resultFN.byClass[classAId]).toBeUndefined();

    const resultAN = await attendanceService.getDashboardStats(schoolId, targetDate, 'AN');
    expect(resultAN.byClass[classAId]).toBeUndefined();
  });

  it('10. Grade and school totals do not double-count students across multiple classes or sessions', async () => {
    const sessionClassA = {
      id: 'sess-a',
      classId: classAId,
      session: 'FN',
      class: { id: classAId, name: 'Grade 10 - A', gradeLevel: 10 },
      records: [
        { studentId: 's1-uuid', status: 'Present' },
        { studentId: 's2-uuid', status: 'Present' },
        { studentId: 's3-uuid', status: 'Present' },
        { studentId: 's4-uuid', status: 'Present' }
      ]
    };

    const sessionClassB = {
      id: 'sess-b',
      classId: classBId,
      session: 'FN',
      class: { id: classBId, name: 'Grade 10 - B', gradeLevel: 10 },
      records: [
        { studentId: 'sb1-uuid', status: 'Absent' },
        { studentId: 'sb2-uuid', status: 'Absent' },
        { studentId: 'sb3-uuid', status: 'Absent' }
      ]
    };

    attendanceRepository.findDailySessionsForDashboard.mockResolvedValue([sessionClassA, sessionClassB]);

    const result = await attendanceService.getDashboardStats(schoolId, targetDate, 'FN');

    // Class A: 4 enrolled, 4 present, 100%
    expect(result.byClass[classAId].total).toBe(4);
    expect(result.byClass[classAId].present).toBe(4);
    expect(result.byClass[classAId].percentage).toBe(100);

    // Class B: 3 enrolled, 0 present, 3 absent, 0%
    expect(result.byClass[classBId].total).toBe(3);
    expect(result.byClass[classBId].present).toBe(0);
    expect(result.byClass[classBId].percentage).toBe(0);

    // Grade 10: 4 + 3 = 7 unique enrolled students
    expect(result.byGrade['10'].total).toBe(7);
    expect(result.byGrade['10'].present).toBe(4);
    expect(result.byGrade['10'].absent).toBe(3);
    expect(result.schoolWide.total).toBe(7);
  });

  it('11. Tenant isolation is strictly preserved', async () => {
    // Missing tenant context throws TenantAccessError
    await expect(attendanceService.getDashboardStats(null, targetDate, 'all'))
      .rejects.toThrow(TenantAccessError);

    // Calls to repository pass schoolId
    await attendanceService.getDashboardStats(otherSchoolId, targetDate, 'all');
    expect(attendanceRepository.findClassesForDashboard).toHaveBeenCalledWith(otherSchoolId);
    expect(attendanceRepository.findDailySessionsForDashboard).toHaveBeenCalledWith(otherSchoolId, targetDate);
  });

  it('12. Zero-student and zero-attendance cases do not produce divide-by-zero or NaN', async () => {
    const emptyClasses = [
      {
        id: 'empty-class-id',
        name: 'Empty Class',
        gradeLevel: 1,
        sections: [],
        students: []
      }
    ];

    attendanceRepository.findClassesForDashboard.mockResolvedValue(emptyClasses);
    attendanceRepository.findDailySessionsForDashboard.mockResolvedValue([]);

    const result = await attendanceService.getDashboardStats(schoolId, targetDate, 'all');

    expect(result.schoolWide.total).toBe(0);
    expect(result.schoolWide.percentage).toBe(100);
    expect(Number.isNaN(result.schoolWide.percentage)).toBe(false);
    expect(result.classesMarked).toBe(0);
    expect(result.classesPending).toBe(1);
    expect(result.classesTotal).toBe(1);
  });
});
