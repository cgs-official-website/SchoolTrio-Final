import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as studentService from '../../../src/modules/students/student.service.js';
import * as studentRepository from '../../../src/modules/students/student.repository.js';
import { prisma, basePrisma } from '../../../src/database/prisma.client.js';
import { ValidationError, TenantAccessError } from '../../../src/utils/app-error.js';

describe('Unit: Student Bulk Import Service', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const CLASS_ID = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects missing schoolId with TenantAccessError', async () => {
    await expect(
      studentService.bulkImportStudents(null, [{ admissionNumber: 'ADM-1', firstName: 'John' }])
    ).rejects.toThrow(TenantAccessError);
  });

  it('rejects empty payload with ValidationError', async () => {
    await expect(
      studentService.bulkImportStudents(SCHOOL_ID, [])
    ).rejects.toThrow(ValidationError);
  });

  it('successfully creates new students and updates existing students with string DOB', async () => {
    const existingStudent = {
      id: 'st-1',
      schoolId: SCHOOL_ID,
      admissionNumber: 'ADM-101',
      firstName: 'John',
      lastName: 'Doe',
      dob: '2015-01-01',
      gender: 'Male',
      bloodGroup: 'O+',
      classId: CLASS_ID,
      sectionId: null,
      status: 'Active',
      customData: {}
    };

    vi.spyOn(prisma.school, 'findUnique').mockResolvedValue({
      id: SCHOOL_ID,
      plan: 'pro',
      seatLimit: 500
    });

    vi.spyOn(prisma.student, 'count').mockResolvedValue(10);

    vi.spyOn(prisma.student, 'findMany').mockResolvedValue([existingStudent]);
    vi.spyOn(prisma.feeStructure, 'findMany').mockResolvedValue([]);

    const mockCreated = [
      {
        id: 'st-2',
        schoolId: SCHOOL_ID,
        admissionNumber: 'ADM-102',
        firstName: 'Jane',
        lastName: 'Smith',
        dob: '2016-02-02',
        gender: 'Female',
        bloodGroup: 'A+',
        classId: CLASS_ID,
        sectionId: null,
        status: 'Active',
        customData: {}
      }
    ];

    const mockUpdated = {
      ...existingStudent,
      dob: '2015-05-15',
      lastName: 'Doe Updated'
    };

    vi.spyOn(studentRepository, 'createStudentsInBulk').mockResolvedValue(mockCreated);
    vi.spyOn(studentRepository, 'updateStudentForBulk').mockResolvedValue(mockUpdated);

    // Mock basePrisma.$transaction
    vi.spyOn(basePrisma, '$transaction').mockImplementation(async (callback) => {
      return callback({
        student: {
          update: vi.fn().mockResolvedValue(mockUpdated)
        },
        invoice: {
          createMany: vi.fn().mockResolvedValue({ count: 0 })
        }
      });
    });

    const payloads = [
      { admissionNumber: 'ADM-101', firstName: 'John', lastName: 'Doe Updated', dob: '2015-05-15', classId: CLASS_ID },
      { admissionNumber: 'ADM-102', firstName: 'Jane', lastName: 'Smith', dob: '2016-02-02', classId: CLASS_ID }
    ];

    const result = await studentService.bulkImportStudents(SCHOOL_ID, payloads, { email: 'admin@school.edu' });

    expect(result.success).toBe(true);
    expect(result.createdCount).toBe(1);
    expect(result.updatedCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(result.totalProcessed).toBe(2);
  });

  it('enforces capacity limit when total count exceeds seat limit', async () => {
    vi.spyOn(prisma.school, 'findUnique').mockResolvedValue({
      id: SCHOOL_ID,
      plan: 'basic',
      seatLimit: 100
    });

    vi.spyOn(prisma.student, 'count').mockResolvedValue(100);

    const payloads = [
      { admissionNumber: 'ADM-101', firstName: 'John', lastName: 'Doe' }
    ];

    await expect(
      studentService.bulkImportStudents(SCHOOL_ID, payloads)
    ).rejects.toThrow(/capacity limit/i);
  });
});
