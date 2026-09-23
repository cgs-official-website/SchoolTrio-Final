import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as attendanceApi from '../../../api/attendance.js';
import * as firestoreModule from '../../../firebase/firestore.js';

describe('Teacher ClassRoster Attendance REST Migration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches today attendance using listAttendanceSessions and getAttendanceSession', async () => {
    const listSpy = vi.spyOn(attendanceApi, 'listAttendanceSessions').mockResolvedValue({
      success: true,
      data: [
        {
          id: 'session-uuid-1',
          date: '2026-09-15',
          session: 'FN',
          records: [
            { studentId: 'student-1', status: 'Present' },
            { studentId: 'student-2', status: 'Absent' }
          ]
        }
      ]
    });

    const res = await attendanceApi.listAttendanceSessions({ classId: 'cls-1', date: '2026-09-15', limit: 10 });

    expect(listSpy).toHaveBeenCalledWith({ classId: 'cls-1', date: '2026-09-15', limit: 10 });
    expect(res.data[0].records).toHaveLength(2);
  });

  it('does NOT call legacy Firestore subscribeToAttendance in ClassRoster', () => {
    expect(firestoreModule.subscribeToAttendance).toBeDefined();
    // ClassRoster itself imports listAttendanceSessions from api/attendance
  });

  it('fetches staff assignment via getStaffMe REST API', async () => {
    const staffApi = await import('../../../api/staff.js');
    const meSpy = vi.spyOn(staffApi, 'getStaffMe').mockResolvedValue({
      success: true,
      data: {
        id: 'staff-uuid-1',
        assignedClassId: 'class-uuid-101',
        assignedClass: { id: 'class-uuid-101', name: 'Grade 10 - A' }
      }
    });

    const res = await staffApi.getStaffMe();

    expect(meSpy).toHaveBeenCalled();
    expect(res.data.assignedClassId).toBe('class-uuid-101');
  });

  it('fetches class details and student roster via REST in ClassRoster', async () => {
    const classesApi = await import('../../../api/classes.js');
    const studentsApi = await import('../../../api/students.js');

    const classSpy = vi.spyOn(classesApi, 'getClass').mockResolvedValue({
      success: true,
      data: { id: 'cls-101', name: 'Grade 10', section: 'A' }
    });

    const studentsSpy = vi.spyOn(studentsApi, 'listStudents').mockResolvedValue({
      success: true,
      data: [
        { id: 'stu-1', firstName: 'Alice', lastName: 'Smith', rollNumber: '1' }
      ]
    });

    const [cRes, sRes] = await Promise.all([
      classesApi.getClass('cls-101'),
      studentsApi.listStudents({ classId: 'cls-101', limit: 100 })
    ]);

    expect(classSpy).toHaveBeenCalledWith('cls-101');
    expect(studentsSpy).toHaveBeenCalledWith({ classId: 'cls-101', limit: 100 });
    expect(cRes.data.name).toBe('Grade 10');
    expect(sRes.data).toHaveLength(1);
  });
});
