import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as assessmentGradeService from '../../../src/modules/assessment-grades/assessment-grade.service.js';
import * as assessmentGradeRepository from '../../../src/modules/assessment-grades/assessment-grade.repository.js';
import * as auditRepository from '../../../src/modules/audit/audit.repository.js';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
  ForbiddenError,
  TenantAccessError
} from '../../../src/utils/app-error.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';

vi.mock('../../../src/modules/assessment-grades/assessment-grade.repository.js');
vi.mock('../../../src/modules/audit/audit.repository.js');

describe('Assessment Grade Service Unit Tests (Phase 4C.7-B Batch 1)', () => {
  const schoolId = '11111111-1111-4111-8111-111111111111';
  const classId = 'aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa';
  const otherClassId = 'bbbbbbbb-2222-4bbb-8bbb-bbbbbbbbbbbb';
  const assessmentId = 'cccccccc-3333-4ccc-8ccc-cccccccccccc';
  const student1Id = 'dddddddd-4444-4ddd-8ddd-dddddddddddd';
  const student2Id = 'eeeeeeee-5555-4eee-8eee-eeeeeeeeeeee';
  const teacherUserId = 'ffffffff-6666-4fff-8fff-ffffffffffff';
  const adminUserId = '99999999-7777-4999-8999-999999999999';

  const teacherActor = {
    id: teacherUserId,
    systemRole: SYSTEM_ROLES.TEACHER
  };

  const adminActor = {
    id: adminUserId,
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN
  };

  const mockAssessment = {
    id: assessmentId,
    schoolId,
    classId,
    title: 'Midterm Science Test',
    totalMarks: 50.0
  };

  const mockStudent1 = {
    id: student1Id,
    schoolId,
    classId,
    firstName: 'Alice',
    lastName: 'Smith',
    admissionNumber: 'ADM-001',
    status: 'Active'
  };

  const mockStudent2 = {
    id: student2Id,
    schoolId,
    classId,
    firstName: 'Bob',
    lastName: 'Jones',
    admissionNumber: 'ADM-002',
    status: 'Active'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    auditRepository.createAuditLog.mockResolvedValue({ id: 'audit-log-id' });
  });

  describe('listAssessmentGrades', () => {
    it('throws TenantAccessError when schoolId is missing', async () => {
      await expect(assessmentGradeService.listAssessmentGrades(null, assessmentId)).rejects.toThrow(TenantAccessError);
    });

    it('throws NotFoundError when assessment does not exist', async () => {
      assessmentGradeRepository.findAssessmentForGradeOperation.mockResolvedValue(null);
      await expect(
        assessmentGradeService.listAssessmentGrades(schoolId, assessmentId)
      ).rejects.toThrow(NotFoundError);
    });

    it('throws ForbiddenError when teacher belongs to a different class', async () => {
      assessmentGradeRepository.findAssessmentForGradeOperation.mockResolvedValue(mockAssessment);
      assessmentGradeRepository.findStaffProfileByUserId.mockResolvedValue({
        id: 'staff-1',
        assignedClassId: otherClassId
      });

      await expect(
        assessmentGradeService.listAssessmentGrades(schoolId, assessmentId, {}, teacherActor)
      ).rejects.toThrow(ForbiddenError);
    });

    it('returns paginated grades for authorized teacher', async () => {
      assessmentGradeRepository.findAssessmentForGradeOperation.mockResolvedValue(mockAssessment);
      assessmentGradeRepository.findStaffProfileByUserId.mockResolvedValue({
        id: 'staff-1',
        assignedClassId: classId
      });
      assessmentGradeRepository.findGradesByAssessment.mockResolvedValue({
        items: [
          {
            id: 'grade-1',
            schoolId,
            assessmentId,
            studentId: student1Id,
            marksObtained: 45.0,
            grade: null,
            student: mockStudent1
          }
        ],
        total: 1
      });

      const result = await assessmentGradeService.listAssessmentGrades(schoolId, assessmentId, {}, teacherActor);
      expect(result.grades).toHaveLength(1);
      expect(result.grades[0].marksObtained).toBe(45.0);
      expect(result.grades[0].student.firstName).toBe('Alice');
      expect(result.pagination.total).toBe(1);
    });
  });

  describe('upsertSingleGrade', () => {
    it('throws NotFoundError when assessment does not exist or is cross-tenant', async () => {
      assessmentGradeRepository.findAssessmentForGradeOperation.mockResolvedValue(null);

      await expect(
        assessmentGradeService.upsertSingleGrade(schoolId, assessmentId, student1Id, { marksObtained: 40 })
      ).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError when student does not exist or is cross-tenant', async () => {
      assessmentGradeRepository.findAssessmentForGradeOperation.mockResolvedValue(mockAssessment);
      assessmentGradeRepository.findStudentForGradeOperation.mockResolvedValue(null);

      await expect(
        assessmentGradeService.upsertSingleGrade(schoolId, assessmentId, student1Id, { marksObtained: 40 }, adminActor)
      ).rejects.toThrow(NotFoundError);
    });

    it('throws ConflictError (409) when student belongs to a different class than assessment', async () => {
      assessmentGradeRepository.findAssessmentForGradeOperation.mockResolvedValue(mockAssessment);
      assessmentGradeRepository.findStudentForGradeOperation.mockResolvedValue({
        ...mockStudent1,
        classId: otherClassId
      });

      await expect(
        assessmentGradeService.upsertSingleGrade(schoolId, assessmentId, student1Id, { marksObtained: 40 }, adminActor)
      ).rejects.toThrow(ConflictError);
    });

    it('throws ForbiddenError (403) when teacher attempts to grade an unassigned class', async () => {
      assessmentGradeRepository.findAssessmentForGradeOperation.mockResolvedValue(mockAssessment);
      assessmentGradeRepository.findStaffProfileByUserId.mockResolvedValue({
        id: 'staff-1',
        assignedClassId: otherClassId
      });

      await expect(
        assessmentGradeService.upsertSingleGrade(schoolId, assessmentId, student1Id, { marksObtained: 40 }, teacherActor)
      ).rejects.toThrow(ForbiddenError);
    });

    it('allows mark equal to totalMarks (e.g. 50 out of 50)', async () => {
      assessmentGradeRepository.findAssessmentForGradeOperation.mockResolvedValue(mockAssessment); // totalMarks = 50
      assessmentGradeRepository.findStaffProfileByUserId.mockResolvedValue({
        id: 'staff-1',
        assignedClassId: classId
      });
      assessmentGradeRepository.findStudentForGradeOperation.mockResolvedValue(mockStudent1);
      assessmentGradeRepository.upsertGrade.mockResolvedValue({
        id: 'grade-1',
        schoolId,
        assessmentId,
        studentId: student1Id,
        marksObtained: 50.0,
        grade: null,
        student: mockStudent1
      });

      const result = await assessmentGradeService.upsertSingleGrade(
        schoolId,
        assessmentId,
        student1Id,
        { marksObtained: 50 },
        teacherActor
      );
      expect(result.marksObtained).toBe(50.0);
      expect(result.grade).toBeNull();
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'UPDATE_ASSESSMENT_GRADE' })
      );
    });

    it('rejects mark exceeding totalMarks with ValidationError (e.g. 50.01 out of 50)', async () => {
      assessmentGradeRepository.findAssessmentForGradeOperation.mockResolvedValue(mockAssessment); // totalMarks = 50
      assessmentGradeRepository.findStudentForGradeOperation.mockResolvedValue(mockStudent1);

      await expect(
        assessmentGradeService.upsertSingleGrade(
          schoolId,
          assessmentId,
          student1Id,
          { marksObtained: 50.01 },
          adminActor
        )
      ).rejects.toThrow(ValidationError);
      expect(assessmentGradeRepository.upsertGrade).not.toHaveBeenCalled();
    });

    it('preserves zero (0) as a legitimate mark', async () => {
      assessmentGradeRepository.findAssessmentForGradeOperation.mockResolvedValue(mockAssessment);
      assessmentGradeRepository.findStudentForGradeOperation.mockResolvedValue(mockStudent1);
      assessmentGradeRepository.upsertGrade.mockResolvedValue({
        id: 'grade-zero',
        schoolId,
        assessmentId,
        studentId: student1Id,
        marksObtained: 0.0,
        grade: null,
        student: mockStudent1
      });

      const result = await assessmentGradeService.upsertSingleGrade(
        schoolId,
        assessmentId,
        student1Id,
        { marksObtained: 0 },
        adminActor
      );
      expect(result.marksObtained).toBe(0);
    });
  });

  describe('bulkUpsertGrades', () => {
    it('executes atomic batch upsert inside transaction for partial submissions', async () => {
      assessmentGradeRepository.findAssessmentForGradeOperation.mockResolvedValue(mockAssessment);
      assessmentGradeRepository.findStaffProfileByUserId.mockResolvedValue({
        id: 'staff-1',
        assignedClassId: classId
      });

      // Mock interactive transaction execution
      assessmentGradeRepository.executeInTransaction.mockImplementation(async (callback) => {
        return callback({});
      });

      assessmentGradeRepository.findStudentsByIdsForGradeOperation.mockResolvedValue([
        mockStudent1,
        mockStudent2
      ]);

      assessmentGradeRepository.upsertGrade
        .mockResolvedValueOnce({
          id: 'grade-1',
          schoolId,
          assessmentId,
          studentId: student1Id,
          marksObtained: 42.5,
          grade: null,
          student: mockStudent1
        })
        .mockResolvedValueOnce({
          id: 'grade-2',
          schoolId,
          assessmentId,
          studentId: student2Id,
          marksObtained: 38.0,
          grade: null,
          student: mockStudent2
        });

      const payload = {
        grades: [
          { studentId: student1Id, marksObtained: 42.5 },
          { studentId: student2Id, marksObtained: 38 }
        ]
      };

      const result = await assessmentGradeService.bulkUpsertGrades(schoolId, assessmentId, payload, teacherActor);
      expect(result.count).toBe(2);
      expect(result.grades[0].marksObtained).toBe(42.5);
      expect(result.grades[1].marksObtained).toBe(38.0);
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'RECORD_ASSESSMENT_GRADES_BULK' })
      );
    });

    it('rolls back entire transaction if one student is not found', async () => {
      assessmentGradeRepository.findAssessmentForGradeOperation.mockResolvedValue(mockAssessment);
      assessmentGradeRepository.executeInTransaction.mockImplementation(async (callback) => {
        return callback({});
      });

      // Only student1 is returned by repository; student2 is missing
      assessmentGradeRepository.findStudentsByIdsForGradeOperation.mockResolvedValue([mockStudent1]);

      const payload = {
        grades: [
          { studentId: student1Id, marksObtained: 40 },
          { studentId: student2Id, marksObtained: 35 }
        ]
      };

      await expect(
        assessmentGradeService.bulkUpsertGrades(schoolId, assessmentId, payload, adminActor)
      ).rejects.toThrow(NotFoundError);
      expect(assessmentGradeRepository.upsertGrade).not.toHaveBeenCalled();
    });

    it('rolls back entire transaction if one student belongs to a different class', async () => {
      assessmentGradeRepository.findAssessmentForGradeOperation.mockResolvedValue(mockAssessment);
      assessmentGradeRepository.executeInTransaction.mockImplementation(async (callback) => {
        return callback({});
      });

      // student2 has a wrong classId
      assessmentGradeRepository.findStudentsByIdsForGradeOperation.mockResolvedValue([
        mockStudent1,
        { ...mockStudent2, classId: otherClassId }
      ]);

      const payload = {
        grades: [
          { studentId: student1Id, marksObtained: 40 },
          { studentId: student2Id, marksObtained: 35 }
        ]
      };

      await expect(
        assessmentGradeService.bulkUpsertGrades(schoolId, assessmentId, payload, adminActor)
      ).rejects.toThrow(ConflictError);
      expect(assessmentGradeRepository.upsertGrade).not.toHaveBeenCalled();
    });

    it('rolls back entire transaction if one student mark exceeds totalMarks', async () => {
      assessmentGradeRepository.findAssessmentForGradeOperation.mockResolvedValue(mockAssessment); // totalMarks = 50
      assessmentGradeRepository.executeInTransaction.mockImplementation(async (callback) => {
        return callback({});
      });

      assessmentGradeRepository.findStudentsByIdsForGradeOperation.mockResolvedValue([
        mockStudent1,
        mockStudent2
      ]);

      const payload = {
        grades: [
          { studentId: student1Id, marksObtained: 40 },
          { studentId: student2Id, marksObtained: 55 } // Invalid: 55 > 50
        ]
      };

      await expect(
        assessmentGradeService.bulkUpsertGrades(schoolId, assessmentId, payload, adminActor)
      ).rejects.toThrow(ValidationError);
      expect(assessmentGradeRepository.upsertGrade).not.toHaveBeenCalled();
    });

    it('rejects duplicate student IDs in a single bulk request with ValidationError', async () => {
      assessmentGradeRepository.findAssessmentForGradeOperation.mockResolvedValue(mockAssessment);

      const payloadWithDuplicates = {
        grades: [
          { studentId: student1Id, marksObtained: 40 },
          { studentId: student1Id, marksObtained: 45 } // Duplicate student ID
        ]
      };

      await expect(
        assessmentGradeService.bulkUpsertGrades(schoolId, assessmentId, payloadWithDuplicates, adminActor)
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('Edge-case Total Marks Boundaries & Protected Fields', () => {
    it('validates totalMarks = 1 (mark = 1 valid, mark = 1.01 invalid)', async () => {
      assessmentGradeRepository.findAssessmentForGradeOperation.mockResolvedValue({
        ...mockAssessment,
        totalMarks: 1.0
      });
      assessmentGradeRepository.findStudentForGradeOperation.mockResolvedValue(mockStudent1);
      assessmentGradeRepository.upsertGrade.mockResolvedValue({
        id: 'grade-1',
        schoolId,
        assessmentId,
        studentId: student1Id,
        marksObtained: 1.0,
        grade: null,
        student: mockStudent1
      });

      const validRes = await assessmentGradeService.upsertSingleGrade(
        schoolId,
        assessmentId,
        student1Id,
        { marksObtained: 1.0 },
        adminActor
      );
      expect(validRes.marksObtained).toBe(1.0);

      await expect(
        assessmentGradeService.upsertSingleGrade(
          schoolId,
          assessmentId,
          student1Id,
          { marksObtained: 1.01 },
          adminActor
        )
      ).rejects.toThrow(ValidationError);
    });

    it('validates totalMarks = 10 (mark = 10 valid, mark = 10.01 invalid)', async () => {
      assessmentGradeRepository.findAssessmentForGradeOperation.mockResolvedValue({
        ...mockAssessment,
        totalMarks: 10.0
      });
      assessmentGradeRepository.findStudentForGradeOperation.mockResolvedValue(mockStudent1);
      assessmentGradeRepository.upsertGrade.mockResolvedValue({
        id: 'grade-1',
        schoolId,
        assessmentId,
        studentId: student1Id,
        marksObtained: 10.0,
        grade: null,
        student: mockStudent1
      });

      const validRes = await assessmentGradeService.upsertSingleGrade(
        schoolId,
        assessmentId,
        student1Id,
        { marksObtained: 10.0 },
        adminActor
      );
      expect(validRes.marksObtained).toBe(10.0);

      await expect(
        assessmentGradeService.upsertSingleGrade(
          schoolId,
          assessmentId,
          student1Id,
          { marksObtained: 10.01 },
          adminActor
        )
      ).rejects.toThrow(ValidationError);
    });

    it('validates totalMarks = 999.99 (mark = 999.99 valid)', async () => {
      assessmentGradeRepository.findAssessmentForGradeOperation.mockResolvedValue({
        ...mockAssessment,
        totalMarks: 999.99
      });
      assessmentGradeRepository.findStudentForGradeOperation.mockResolvedValue(mockStudent1);
      assessmentGradeRepository.upsertGrade.mockResolvedValue({
        id: 'grade-1',
        schoolId,
        assessmentId,
        studentId: student1Id,
        marksObtained: 999.99,
        grade: null,
        student: mockStudent1
      });

      const validRes = await assessmentGradeService.upsertSingleGrade(
        schoolId,
        assessmentId,
        student1Id,
        { marksObtained: 999.99 },
        adminActor
      );
      expect(validRes.marksObtained).toBe(999.99);
    });

    it('ignores client-supplied grade field and keeps grade null', async () => {
      assessmentGradeRepository.findAssessmentForGradeOperation.mockResolvedValue(mockAssessment);
      assessmentGradeRepository.findStudentForGradeOperation.mockResolvedValue(mockStudent1);
      assessmentGradeRepository.upsertGrade.mockResolvedValue({
        id: 'grade-1',
        schoolId,
        assessmentId,
        studentId: student1Id,
        marksObtained: 45.0,
        grade: null,
        student: mockStudent1
      });

      const res = await assessmentGradeService.upsertSingleGrade(
        schoolId,
        assessmentId,
        student1Id,
        { marksObtained: 45, grade: 'A+' }, // Injected letter grade
        adminActor
      );
      expect(res.grade).toBeNull();
      // Verify repository was called without client-supplied grade
      expect(assessmentGradeRepository.upsertGrade).toHaveBeenCalledWith(
        schoolId,
        assessmentId,
        student1Id,
        expect.not.objectContaining({ grade: 'A+' })
      );
    });

    it('trims whitespace-only remarks to null', async () => {
      assessmentGradeRepository.findAssessmentForGradeOperation.mockResolvedValue(mockAssessment);
      assessmentGradeRepository.findStudentForGradeOperation.mockResolvedValue(mockStudent1);
      assessmentGradeRepository.upsertGrade.mockResolvedValue({
        id: 'grade-1',
        schoolId,
        assessmentId,
        studentId: student1Id,
        marksObtained: 45.0,
        remarks: null,
        grade: null,
        student: mockStudent1
      });

      await assessmentGradeService.upsertSingleGrade(
        schoolId,
        assessmentId,
        student1Id,
        { marksObtained: 45, remarks: '   ' },
        adminActor
      );

      expect(assessmentGradeRepository.upsertGrade).toHaveBeenCalledWith(
        schoolId,
        assessmentId,
        student1Id,
        expect.objectContaining({ remarks: null })
      );
    });
  });

  describe('deleteAssessmentGrade', () => {
    it('throws NotFoundError when grade record to delete does not exist', async () => {
      assessmentGradeRepository.findAssessmentForGradeOperation.mockResolvedValue(mockAssessment);
      assessmentGradeRepository.findGrade.mockResolvedValue(null);

      await expect(
        assessmentGradeService.deleteAssessmentGrade(schoolId, assessmentId, student1Id, adminActor)
      ).rejects.toThrow(NotFoundError);
    });

    it('deletes grade record and records audit log', async () => {
      assessmentGradeRepository.findAssessmentForGradeOperation.mockResolvedValue(mockAssessment);
      assessmentGradeRepository.findGrade.mockResolvedValue({
        id: 'grade-to-delete',
        schoolId,
        assessmentId,
        studentId: student1Id,
        marksObtained: 45
      });
      assessmentGradeRepository.deleteGrade.mockResolvedValue({});

      const result = await assessmentGradeService.deleteAssessmentGrade(
        schoolId,
        assessmentId,
        student1Id,
        adminActor
      );
      expect(result.message).toContain('cleared successfully');
      expect(assessmentGradeRepository.deleteGrade).toHaveBeenCalledWith(schoolId, assessmentId, student1Id);
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DELETE_ASSESSMENT_GRADE' })
      );
    });
  });

  describe('Concurrency Semantics (MOCK / SIMULATED)', () => {
    it('[SIMULATION] atomic upsert delegates conflict resolution to PostgreSQL unique index', async () => {
      assessmentGradeRepository.findAssessmentForGradeOperation.mockResolvedValue(mockAssessment);
      assessmentGradeRepository.findStudentForGradeOperation.mockResolvedValue(mockStudent1);

      // Simulate sequential updates where the second update overwrites the first
      assessmentGradeRepository.upsertGrade.mockResolvedValue({
        id: 'grade-1',
        schoolId,
        assessmentId,
        studentId: student1Id,
        marksObtained: 48.0,
        grade: null
      });

      const res = await assessmentGradeService.upsertSingleGrade(
        schoolId,
        assessmentId,
        student1Id,
        { marksObtained: 48 },
        adminActor
      );
      expect(res.marksObtained).toBe(48.0);
    });
  });
});
