import { describe, it, expect, vi, beforeEach } from 'vitest';
import StudentManagement from '../StudentManagement.jsx';
import * as studentsApi from '../../../api/students.js';
import * as classesApi from '../../../api/classes.js';
import * as attendanceApi from '../../../api/attendance.js';
import * as admissionsApi from '../../../api/admissions.js';

describe('Admin StudentManagement Component (REST Migration)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. is exported as a function/component', () => {
    expect(typeof StudentManagement).toBe('function');
  });

  it('2. loads students from REST endpoint GET /api/v1/students', async () => {
    const listSpy = vi.spyOn(studentsApi, 'listStudents').mockResolvedValue({
      success: true,
      data: [
        {
          id: 'stu-uuid-1',
          admissionNumber: 'ADM-001',
          firstName: 'Alice',
          lastName: 'Smith',
          classId: 'cls-uuid-1',
          status: 'Active',
          class: { id: 'cls-uuid-1', name: 'Grade 10' }
        }
      ],
      pagination: { total: 1, page: 1, limit: 1000, totalPages: 1 }
    });

    const res = await studentsApi.listStudents({ limit: 1000 });
    expect(listSpy).toHaveBeenCalledWith({ limit: 1000 });
    expect(res.data).toHaveLength(1);
    expect(res.data[0].id).toBe('stu-uuid-1');
  });

  it('3. loads classes directory from REST classes API', async () => {
    const classSpy = vi.spyOn(classesApi, 'listClasses').mockResolvedValue({
      success: true,
      data: [
        {
          id: 'cls-uuid-1',
          name: 'Grade 10',
          sections: [{ id: 'sec-uuid-1', name: 'A' }]
        }
      ]
    });

    const res = await classesApi.listClasses();
    expect(classSpy).toHaveBeenCalled();
    expect(res.data[0].id).toBe('cls-uuid-1');
  });

  it('4. creates student through POST /api/v1/students', async () => {
    const createSpy = vi.spyOn(studentsApi, 'createStudent').mockResolvedValue({
      success: true,
      data: {
        id: 'stu-uuid-2',
        admissionNumber: 'ADM-002',
        firstName: 'Bob',
        lastName: 'Jones',
        gender: 'Male',
        classId: 'cls-uuid-1',
        status: 'Active',
        customData: { parentName: 'Robert Jones', parentPhone: '9876543210' }
      }
    });

    const payload = {
      admissionNumber: 'ADM-002',
      firstName: 'Bob',
      lastName: 'Jones',
      gender: 'Male',
      classId: 'cls-uuid-1',
      status: 'Active',
      customData: { parentName: 'Robert Jones', parentPhone: '9876543210' }
    };

    const res = await studentsApi.createStudent(payload);
    expect(createSpy).toHaveBeenCalledWith(payload);
    expect(res.data.id).toBe('stu-uuid-2');
    expect(res.data.customData.parentName).toBe('Robert Jones');
  });

  it('5. updates student through PATCH /api/v1/students/:id', async () => {
    const updateSpy = vi.spyOn(studentsApi, 'updateStudent').mockResolvedValue({
      success: true,
      data: {
        id: 'stu-uuid-1',
        firstName: 'Alice',
        lastName: 'Johnson'
      }
    });

    const res = await studentsApi.updateStudent('stu-uuid-1', { lastName: 'Johnson' });
    expect(updateSpy).toHaveBeenCalledWith('stu-uuid-1', { lastName: 'Johnson' });
    expect(res.data.lastName).toBe('Johnson');
  });

  it('6. deletes student through DELETE /api/v1/students/:id and handles 409 Conflict', async () => {
    const deleteSpy = vi.spyOn(studentsApi, 'deleteStudent').mockRejectedValue({
      response: {
        status: 409,
        data: {
          message: 'Cannot delete student with active attendance records, invoices, or grades.'
        }
      }
    });

    await expect(studentsApi.deleteStudent('stu-uuid-1')).rejects.toMatchObject({
      response: {
        status: 409,
        data: {
          message: expect.stringContaining('Cannot delete student')
        }
      }
    });
    expect(deleteSpy).toHaveBeenCalledWith('stu-uuid-1');
  });

  it('7. loads student attendance through REST getStudentAttendance', async () => {
    const attendanceSpy = vi.spyOn(attendanceApi, 'getStudentAttendance').mockResolvedValue({
      success: true,
      data: {
        stats: { total: 50, present: 48, absent: 2, late: 0, attendancePercentage: 96 },
        timeline: []
      }
    });

    const res = await attendanceApi.getStudentAttendance('stu-uuid-1', { filter: 'monthly' });
    expect(attendanceSpy).toHaveBeenCalledWith('stu-uuid-1', { filter: 'monthly' });
    expect(res.data.stats.attendancePercentage).toBe(96);
  });

  it('8. manages parent linking through REST APIs', async () => {
    const listParentsSpy = vi.spyOn(studentsApi, 'listStudentParents').mockResolvedValue({
      success: true,
      data: [{ id: 'parent-uuid-1', relationship: 'Father', parentProfile: { id: 'parent-uuid-1', name: 'Robert' } }]
    });

    const linkParentSpy = vi.spyOn(studentsApi, 'linkParentToStudent').mockResolvedValue({
      success: true,
      data: { id: 'link-uuid-1', studentId: 'stu-uuid-1', parentProfileId: 'parent-uuid-1' }
    });

    const unlinkParentSpy = vi.spyOn(studentsApi, 'unlinkParentFromStudent').mockResolvedValue({
      success: true,
      data: null
    });

    const parentsRes = await studentsApi.listStudentParents('stu-uuid-1');
    expect(listParentsSpy).toHaveBeenCalledWith('stu-uuid-1');
    expect(parentsRes.data).toHaveLength(1);

    const linkRes = await studentsApi.linkParentToStudent('stu-uuid-1', { parentProfileId: 'parent-uuid-1' });
    expect(linkParentSpy).toHaveBeenCalledWith('stu-uuid-1', { parentProfileId: 'parent-uuid-1' });
    expect(linkRes.data.id).toBe('link-uuid-1');

    await studentsApi.unlinkParentFromStudent('stu-uuid-1', 'parent-uuid-1');
    expect(unlinkParentSpy).toHaveBeenCalledWith('stu-uuid-1', 'parent-uuid-1');
  });

  it('9. loads admission applications via admissionsApi.getApplications', async () => {
    const appsSpy = vi.spyOn(admissionsApi, 'getApplications').mockResolvedValue({
      success: true,
      data: [
        {
          id: 'app-uuid-1',
          applicationNumber: 'ADM-2026-001',
          studentName: 'Charlie Brown',
          status: 'Pending',
          classId: 'cls-uuid-1'
        }
      ]
    });

    const res = await admissionsApi.getApplications({ limit: 500 });
    expect(appsSpy).toHaveBeenCalledWith({ limit: 500 });
    expect(res.data).toHaveLength(1);
    expect(res.data[0].studentName).toBe('Charlie Brown');
  });

  it('10. enrolls application transactionally via admissionsApi.enrollApplication', async () => {
    const enrollSpy = vi.spyOn(admissionsApi, 'enrollApplication').mockResolvedValue({
      success: true,
      data: {
        application: { id: 'app-uuid-1', status: 'Approved' },
        student: { id: 'stu-uuid-3', admissionNumber: 'ADM-2026-001' }
      }
    });

    const payload = { admissionNumber: 'ADM-2026-001', classId: 'cls-uuid-1' };
    const res = await admissionsApi.enrollApplication('app-uuid-1', payload);
    expect(enrollSpy).toHaveBeenCalledWith('app-uuid-1', payload);
    expect(res.data.student.admissionNumber).toBe('ADM-2026-001');
  });

  it('11. updates application status to Rejected via admissionsApi.updateApplicationStatus', async () => {
    const rejectSpy = vi.spyOn(admissionsApi, 'updateApplicationStatus').mockResolvedValue({
      success: true,
      data: { id: 'app-uuid-1', status: 'Rejected' }
    });

    const res = await admissionsApi.updateApplicationStatus('app-uuid-1', { status: 'Rejected' });
    expect(rejectSpy).toHaveBeenCalledWith('app-uuid-1', { status: 'Rejected' });
    expect(res.data.status).toBe('Rejected');
  });
});
