import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as studentService from '../../../src/modules/students/student.service.js';
import * as studentRepository from '../../../src/modules/students/student.repository.js';
import * as auditRepository from '../../../src/modules/audit/audit.repository.js';
import { prisma } from '../../../src/database/prisma.client.js';
import { ConflictError, NotFoundError } from '../../../src/utils/app-error.js';

vi.mock('../../../src/modules/students/student.repository.js');
vi.mock('../../../src/modules/audit/audit.repository.js');
vi.mock('../../../src/database/prisma.client.js', () => ({
  prisma: {
    $transaction: vi.fn(async (cb) => cb(prisma))
  }
}));

describe('Unit: Student Deletion Concurrency & Transaction Serialization', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const STUDENT_ID = '22222222-2222-4222-8222-222222222222';
  const ACTOR = {
    userId: '33333333-3333-4333-8333-333333333333',
    email: 'admin@school.edu',
    systemRole: 'SCHOOL_ADMIN'
  };

  const existingStudent = {
    id: STUDENT_ID,
    schoolId: SCHOOL_ID,
    admissionNumber: 'ADM-101',
    firstName: 'John',
    lastName: 'Doe',
    status: 'Active'
  };

  const baseZeroDeps = {
    invoices: 0,
    attendanceRecords: 0,
    attendanceStats: 0,
    absenteeFlags: 0,
    assessmentGrades: 0,
    reportCards: 0,
    homeworkSubmissions: 0,
    bookIssues: 0,
    chatRooms: 0,
    ptmAppointments: 0,
    canteenRequests: 0
  };

  beforeEach(() => {
    vi.clearAllMocks();
    studentRepository.findStudentById.mockResolvedValue(existingStudent);
    studentRepository.findStudentByIdForUpdate.mockResolvedValue(existingStudent);
    auditRepository.createAuditLog.mockResolvedValue({ id: 'audit-id' });
  });

  it('guarantees FOR UPDATE lock is acquired before dependency count queries', async () => {
    const callOrder = [];

    studentRepository.findStudentByIdForUpdate.mockImplementation(async () => {
      callOrder.push('FOR_UPDATE_LOCK');
      return existingStudent;
    });

    studentRepository.countStudentDependencies.mockImplementation(async () => {
      callOrder.push('COUNT_DEPENDENCIES');
      return { ...baseZeroDeps };
    });

    studentRepository.deleteStudent.mockImplementation(async () => {
      callOrder.push('DELETE_STUDENT');
      return existingStudent;
    });

    await studentService.deleteStudent(SCHOOL_ID, STUDENT_ID, ACTOR);

    expect(callOrder).toEqual(['FOR_UPDATE_LOCK', 'COUNT_DEPENDENCIES', 'DELETE_STUDENT']);
    expect(auditRepository.createAuditLog).toHaveBeenCalledTimes(1);
  });

  const dependencyScenarios = [
    { dep: 'invoices', label: 'billing invoices' },
    { dep: 'attendanceRecords', label: 'recorded attendance records' },
    { dep: 'attendanceStats', label: 'attendance statistics' },
    { dep: 'absenteeFlags', label: 'absentee flags' },
    { dep: 'assessmentGrades', label: 'examination assessment grades' },
    { dep: 'reportCards', label: 'generated report cards' },
    { dep: 'homeworkSubmissions', label: 'submitted homework' },
    { dep: 'bookIssues', label: 'library book issue records' },
    { dep: 'chatRooms', label: 'active chat rooms' },
    { dep: 'ptmAppointments', label: 'parent-teacher meeting appointments' },
    { dep: 'canteenRequests', label: 'canteen requests' }
  ];

  dependencyScenarios.forEach(({ dep, label: _label }) => {
    it(`aborts delete transaction when concurrent ${dep} exists`, async () => {
      studentRepository.countStudentDependencies.mockResolvedValue({
        ...baseZeroDeps,
        [dep]: 1
      });

      await expect(studentService.deleteStudent(SCHOOL_ID, STUDENT_ID, ACTOR))
        .rejects
        .toThrow(ConflictError);

      expect(studentRepository.deleteStudent).not.toHaveBeenCalled();
      expect(auditRepository.createAuditLog).not.toHaveBeenCalled();
    });
  });

  it('aborts delete transaction if student is deleted concurrently before lock', async () => {
    studentRepository.findStudentByIdForUpdate.mockResolvedValue(null);

    await expect(studentService.deleteStudent(SCHOOL_ID, STUDENT_ID, ACTOR))
      .rejects
      .toThrow(NotFoundError);

    expect(studentRepository.countStudentDependencies).not.toHaveBeenCalled();
    expect(studentRepository.deleteStudent).not.toHaveBeenCalled();
    expect(auditRepository.createAuditLog).not.toHaveBeenCalled();
  });
});
