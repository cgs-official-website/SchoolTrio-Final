import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as studentService from '../../../src/modules/students/student.service.js';
import * as studentRepository from '../../../src/modules/students/student.repository.js';
import * as auditRepository from '../../../src/modules/audit/audit.repository.js';
import { prisma } from '../../../src/database/prisma.client.js';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
  TenantAccessError
} from '../../../src/utils/app-error.js';

vi.mock('../../../src/modules/students/student.repository.js');
vi.mock('../../../src/modules/audit/audit.repository.js');
vi.mock('../../../src/database/prisma.client.js', () => {
  const mockPrisma = {
    class: {
      findFirst: vi.fn()
    },
    section: {
      findFirst: vi.fn()
    },
    $transaction: vi.fn(async (cb) => cb(mockPrisma))
  };
  return { prisma: mockPrisma };
});

describe('Unit: Student Service Layer — Phase 4C.3-A', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const STUDENT_ID = '22222222-2222-4222-8222-222222222222';
  const CLASS_ID = '33333333-3333-4333-8333-333333333333';
  const SECTION_ID = '44444444-4444-4444-8444-444444444444';

  const ACTOR = {
    userId: '55555555-5555-4555-8555-555555555555',
    email: 'admin@school.edu',
    systemRole: 'SCHOOL_ADMIN'
  };

  const mockStudent = {
    id: STUDENT_ID,
    schoolId: SCHOOL_ID,
    admissionNumber: 'ADM-101',
    rollNumber: '1',
    firstName: 'John',
    lastName: 'Doe',
    dob: '2015-05-15',
    gender: 'Male',
    bloodGroup: 'O+',
    aadhaarNumber: '123456789012',
    photoUrl: 'https://cdn.example.com/p.jpg',
    status: 'Active',
    classId: CLASS_ID,
    sectionId: SECTION_ID,
    customData: { legacyHouse: 'Blue' },
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01')
  };

  beforeEach(() => {
    vi.clearAllMocks();
    studentRepository.findStudentById.mockResolvedValue(mockStudent);
    studentRepository.findStudentByIdForUpdate.mockResolvedValue(mockStudent);
    studentRepository.findStudentByAdmissionNumber.mockResolvedValue(null);
    studentRepository.countStudentDependencies.mockResolvedValue({
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
    });
    auditRepository.createAuditLog.mockResolvedValue({ id: 'audit-id' });
    prisma.class.findFirst.mockResolvedValue({ id: CLASS_ID, schoolId: SCHOOL_ID, name: 'Grade 5' });
    prisma.section.findFirst.mockResolvedValue({ id: SECTION_ID, classId: CLASS_ID, schoolId: SCHOOL_ID, name: 'A' });
  });

  describe('1. listStudents', () => {
    it('returns paginated student list and metadata', async () => {
      studentRepository.findStudents.mockResolvedValue([mockStudent]);
      studentRepository.countStudents.mockResolvedValue(1);

      const result = await studentService.listStudents(SCHOOL_ID, { page: 1, limit: 20 });
      expect(result.students).toEqual([mockStudent]);
      expect(result.pagination.total).toBe(1);
      expect(result.pagination.page).toBe(1);
    });

    it('throws TenantAccessError when schoolId is missing', async () => {
      await expect(studentService.listStudents(null)).rejects.toThrow(TenantAccessError);
    });
  });

  describe('2. getStudentById', () => {
    it('returns student when found in tenant', async () => {
      const result = await studentService.getStudentById(SCHOOL_ID, STUDENT_ID);
      expect(result).toEqual(mockStudent);
      expect(studentRepository.findStudentById).toHaveBeenCalledWith(SCHOOL_ID, STUDENT_ID);
    });

    it('throws NotFoundError when student does not exist', async () => {
      studentRepository.findStudentById.mockResolvedValue(null);
      await expect(studentService.getStudentById(SCHOOL_ID, 'nonexistent-id')).rejects.toThrow(NotFoundError);
    });

    it('throws TenantAccessError when schoolId is missing', async () => {
      await expect(studentService.getStudentById(null, STUDENT_ID)).rejects.toThrow(TenantAccessError);
    });
  });

  describe('3. createStudent', () => {
    it('successfully creates student and dispatches CREATE_STUDENT AuditLog', async () => {
      const payload = {
        admissionNumber: '  ADM-200  ',
        firstName: '  Alice  ',
        lastName: '  Smith  ',
        dob: '2016-01-01',
        gender: 'Female',
        bloodGroup: 'B+',
        classId: CLASS_ID,
        sectionId: SECTION_ID,
        status: 'Active'
      };

      const createdObj = {
        id: 'new-student-id',
        schoolId: SCHOOL_ID,
        admissionNumber: 'ADM-200',
        firstName: 'Alice',
        lastName: 'Smith',
        status: 'Active',
        classId: CLASS_ID,
        sectionId: SECTION_ID
      };

      studentRepository.createStudent.mockResolvedValue(createdObj);

      const result = await studentService.createStudent(SCHOOL_ID, payload, ACTOR);

      expect(result).toEqual(createdObj);
      expect(studentRepository.findStudentByAdmissionNumber).toHaveBeenCalledWith(SCHOOL_ID, 'ADM-200');
      expect(studentRepository.createStudent).toHaveBeenCalledWith(expect.objectContaining({
        admissionNumber: 'ADM-200',
        firstName: 'Alice',
        lastName: 'Smith'
      }));
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        schoolId: SCHOOL_ID,
        entityType: 'Student',
        entityId: 'new-student-id',
        actionPerformed: 'CREATE_STUDENT: Alice Smith'
      }));
    });

    it('rejects duplicate admission number within tenant with ConflictError', async () => {
      studentRepository.findStudentByAdmissionNumber.mockResolvedValue(mockStudent);

      await expect(studentService.createStudent(SCHOOL_ID, {
        admissionNumber: 'ADM-101',
        firstName: 'Duplicate'
      })).rejects.toThrow(ConflictError);
    });

    it('rejects invalid classId with ValidationError', async () => {
      prisma.class.findFirst.mockResolvedValue(null);

      await expect(studentService.createStudent(SCHOOL_ID, {
        admissionNumber: 'ADM-300',
        firstName: 'Test',
        classId: 'invalid-class-id'
      })).rejects.toThrow(ValidationError);
    });

    it('rejects sectionId when classId is missing with ValidationError', async () => {
      await expect(studentService.createStudent(SCHOOL_ID, {
        admissionNumber: 'ADM-300',
        firstName: 'Test',
        sectionId: SECTION_ID
      })).rejects.toThrow(ValidationError);
    });

    it('rejects sectionId when section does not belong to class with ValidationError', async () => {
      prisma.section.findFirst.mockResolvedValue(null);

      await expect(studentService.createStudent(SCHOOL_ID, {
        admissionNumber: 'ADM-300',
        firstName: 'Test',
        classId: CLASS_ID,
        sectionId: SECTION_ID
      })).rejects.toThrow(ValidationError);
    });
  });

  describe('4. updateStudent', () => {
    it('updates student fields and writes UPDATE_STUDENT AuditLog with field deltas', async () => {
      const updatedStudent = {
        ...mockStudent,
        firstName: 'Johnny',
        status: 'Transferred'
      };
      studentRepository.updateStudent.mockResolvedValue(updatedStudent);

      const result = await studentService.updateStudent(
        SCHOOL_ID,
        STUDENT_ID,
        { firstName: '  Johnny  ', status: 'Transferred' },
        ACTOR
      );

      expect(result).toEqual(updatedStudent);
      expect(studentRepository.updateStudent).toHaveBeenCalledWith(
        SCHOOL_ID,
        STUDENT_ID,
        expect.objectContaining({ firstName: 'Johnny', status: 'Transferred' })
      );
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        schoolId: SCHOOL_ID,
        entityType: 'Student',
        entityId: STUDENT_ID,
        actionPerformed: 'UPDATE_STUDENT: Johnny Doe',
        modifiedFields: {
          firstName: { old: 'John', new: 'Johnny' },
          status: { old: 'Active', new: 'Transferred' }
        }
      }));
    });

    it('handles no-op update without database write or AuditLog', async () => {
      const result = await studentService.updateStudent(
        SCHOOL_ID,
        STUDENT_ID,
        { firstName: 'John', status: 'Active' },
        ACTOR
      );

      expect(result).toEqual(mockStudent);
      expect(studentRepository.updateStudent).not.toHaveBeenCalled();
      expect(auditRepository.createAuditLog).not.toHaveBeenCalled();
    });

    it('rejects duplicate admission number on update with ConflictError', async () => {
      const anotherStudent = { id: 'other-student-id', admissionNumber: 'ADM-999' };
      studentRepository.findStudentByAdmissionNumber.mockResolvedValue(anotherStudent);

      await expect(studentService.updateStudent(
        SCHOOL_ID,
        STUDENT_ID,
        { admissionNumber: 'ADM-999' },
        ACTOR
      )).rejects.toThrow(ConflictError);
    });

    it('validates section reassignment to mismatching class with ValidationError', async () => {
      prisma.section.findFirst.mockResolvedValue(null);

      await expect(studentService.updateStudent(
        SCHOOL_ID,
        STUDENT_ID,
        { sectionId: 'other-section-id' },
        ACTOR
      )).rejects.toThrow(ValidationError);
    });

    it('throws NotFoundError when student does not exist', async () => {
      studentRepository.findStudentById.mockResolvedValue(null);

      await expect(studentService.updateStudent(
        SCHOOL_ID,
        'nonexistent-id',
        { firstName: 'Test' },
        ACTOR
      )).rejects.toThrow(NotFoundError);
    });
  });

  describe('5. deleteStudent', () => {
    it('successfully deletes zero-dependency student inside transaction with FOR UPDATE lock', async () => {
      studentRepository.deleteStudent.mockResolvedValue(mockStudent);

      await studentService.deleteStudent(SCHOOL_ID, STUDENT_ID, ACTOR);

      expect(studentRepository.findStudentByIdForUpdate).toHaveBeenCalledWith(
        SCHOOL_ID,
        STUDENT_ID,
        expect.anything()
      );
      expect(studentRepository.countStudentDependencies).toHaveBeenCalledWith(
        SCHOOL_ID,
        STUDENT_ID,
        expect.anything()
      );
      expect(studentRepository.deleteStudent).toHaveBeenCalledWith(
        SCHOOL_ID,
        STUDENT_ID,
        expect.anything()
      );
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        schoolId: SCHOOL_ID,
        entityType: 'Student',
        entityId: STUDENT_ID,
        actionPerformed: 'DELETE_STUDENT: John Doe'
      }));
    });

    it('throws NotFoundError when student does not exist before transaction', async () => {
      studentRepository.findStudentById.mockResolvedValue(null);

      await expect(studentService.deleteStudent(SCHOOL_ID, 'nonexistent-id', ACTOR)).rejects.toThrow(NotFoundError);
      expect(studentRepository.deleteStudent).not.toHaveBeenCalled();
    });
  });
});
