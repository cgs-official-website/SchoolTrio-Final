import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as assessmentService from '../../../src/modules/assessments/assessment.service.js';
import * as assessmentRepository from '../../../src/modules/assessments/assessment.repository.js';
import * as auditRepository from '../../../src/modules/audit/audit.repository.js';
import { NotFoundError, ConflictError, ForbiddenError, TenantAccessError } from '../../../src/utils/app-error.js';

vi.mock('../../../src/modules/assessments/assessment.repository.js');
vi.mock('../../../src/modules/audit/audit.repository.js');

describe('Assessment Service Unit Tests', () => {
  const schoolId = '86e6e8b1-f3be-44fb-9759-268027ec2802';
  const teacherUserId = '11111111-2222-3333-4444-555555555555';
  const adminUserId = '22222222-3333-4444-5555-666666666666';
  const assessmentId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const classIdA = '11111111-0000-0000-0000-000000000001';
  const classIdB = '11111111-0000-0000-0000-000000000002';
  const examId = 'eeeeeeee-0000-0000-0000-000000000001';
  const subjectId = 'ssssssss-0000-0000-0000-000000000001';

  const teacherActor = {
    id: teacherUserId,
    systemRole: 'TEACHER'
  };

  const adminActor = {
    id: adminUserId,
    systemRole: 'PRINCIPAL'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listAssessments', () => {
    it('throws TenantAccessError when schoolId is missing', async () => {
      await expect(assessmentService.listAssessments(null)).rejects.toThrow(TenantAccessError);
    });

    it('returns assessments for admin caller without class restrictions', async () => {
      const mockItems = [{ id: assessmentId, title: 'Math Quiz', classId: classIdA }];
      assessmentRepository.findAssessments.mockResolvedValue({
        items: mockItems,
        total: 1
      });

      const result = await assessmentService.listAssessments(schoolId, { classId: classIdA }, adminActor);
      expect(result.assessments).toEqual(mockItems);
      expect(assessmentRepository.findAssessments).toHaveBeenCalledWith(
        schoolId,
        expect.objectContaining({ classId: classIdA }),
        expect.any(Object)
      );
    });

    it('restricts teacher queries to their assigned class', async () => {
      assessmentRepository.findStaffProfileByUserId.mockResolvedValue({
        id: 'staff-1',
        assignedClassId: classIdA
      });
      assessmentRepository.findAssessments.mockResolvedValue({
        items: [{ id: assessmentId, classId: classIdA }],
        total: 1
      });

      const result = await assessmentService.listAssessments(schoolId, {}, teacherActor);
      expect(assessmentRepository.findAssessments).toHaveBeenCalledWith(
        schoolId,
        expect.objectContaining({ classId: classIdA }),
        expect.any(Object)
      );
      expect(result.assessments.length).toBe(1);
    });

    it('throws ForbiddenError if teacher attempts to query another class', async () => {
      assessmentRepository.findStaffProfileByUserId.mockResolvedValue({
        id: 'staff-1',
        assignedClassId: classIdA
      });

      await expect(
        assessmentService.listAssessments(schoolId, { classId: classIdB }, teacherActor)
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('createAssessment', () => {
    it('allows teacher to create assessment for their assigned class', async () => {
      assessmentRepository.findStaffProfileByUserId.mockResolvedValue({
        id: 'staff-1',
        assignedClassId: classIdA
      });
      assessmentRepository.verifyClassExists.mockResolvedValue({ id: classIdA, name: 'Grade 10' });
      assessmentRepository.verifyExamExists.mockResolvedValue({ id: examId, name: 'Midterm' });
      assessmentRepository.verifySubjectExists.mockResolvedValue({ id: subjectId, name: 'Math' });

      const mockCreated = {
        id: assessmentId,
        schoolId,
        title: 'Chapter 1 Quiz',
        classId: classIdA,
        totalMarks: 50,
        examId,
        subjectId
      };
      assessmentRepository.createAssessment.mockResolvedValue(mockCreated);
      auditRepository.createAuditLog.mockResolvedValue({});

      const payload = {
        title: 'Chapter 1 Quiz',
        classId: classIdA,
        totalMarks: 50,
        examId,
        subjectId
      };

      const result = await assessmentService.createAssessment(schoolId, payload, teacherActor);
      expect(result).toEqual(mockCreated);
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        action: 'CREATE_ASSESSMENT',
        resourceId: assessmentId
      }));
    });

    it('throws ForbiddenError if teacher attempts to create assessment for unassigned class', async () => {
      assessmentRepository.findStaffProfileByUserId.mockResolvedValue({
        id: 'staff-1',
        assignedClassId: classIdA
      });

      const payload = {
        title: 'Quiz',
        classId: classIdB, // Mismatch!
        totalMarks: 50
      };

      await expect(
        assessmentService.createAssessment(schoolId, payload, teacherActor)
      ).rejects.toThrow(ForbiddenError);
    });

    it('throws NotFoundError if class does not exist in tenant', async () => {
      assessmentRepository.verifyClassExists.mockResolvedValue(null);

      const payload = {
        title: 'Quiz',
        classId: classIdA,
        totalMarks: 50
      };

      await expect(
        assessmentService.createAssessment(schoolId, payload, adminActor)
      ).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError if exam does not exist in tenant', async () => {
      assessmentRepository.verifyClassExists.mockResolvedValue({ id: classIdA });
      assessmentRepository.verifyExamExists.mockResolvedValue(null);

      const payload = {
        title: 'Quiz',
        classId: classIdA,
        totalMarks: 50,
        examId: 'missing-exam-id'
      };

      await expect(
        assessmentService.createAssessment(schoolId, payload, adminActor)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('updateAssessment', () => {
    it('updates assessment fields safely when 0 grades exist', async () => {
      const existing = {
        id: assessmentId,
        schoolId,
        classId: classIdA,
        title: 'Old Title',
        totalMarks: 50
      };

      assessmentRepository.findAssessmentById.mockResolvedValue(existing);
      assessmentRepository.countAssessmentGrades.mockResolvedValue(0);
      assessmentRepository.updateAssessment.mockResolvedValue({
        ...existing,
        title: 'New Title',
        totalMarks: 100
      });

      const result = await assessmentService.updateAssessment(
        schoolId,
        assessmentId,
        { title: 'New Title', totalMarks: 100 },
        adminActor
      );

      expect(result.title).toBe('New Title');
      expect(result.totalMarks).toBe(100);
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        action: 'UPDATE_ASSESSMENT'
      }));
    });

    it('throws ConflictError (409) if attempting to modify totalMarks when grades exist', async () => {
      const existing = {
        id: assessmentId,
        schoolId,
        classId: classIdA,
        title: 'Graded Assessment',
        totalMarks: 50
      };

      assessmentRepository.findAssessmentById.mockResolvedValue(existing);
      assessmentRepository.countAssessmentGrades.mockResolvedValue(15); // Grades exist!

      await expect(
        assessmentService.updateAssessment(schoolId, assessmentId, { totalMarks: 75 }, adminActor)
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('deleteAssessment', () => {
    it('deletes assessment safely when 0 grades exist', async () => {
      const existing = {
        id: assessmentId,
        schoolId,
        classId: classIdA,
        title: 'Empty Assessment'
      };

      assessmentRepository.findAssessmentById.mockResolvedValue(existing);
      assessmentRepository.countAssessmentGrades.mockResolvedValue(0);
      assessmentRepository.deleteAssessment.mockResolvedValue(existing);

      const result = await assessmentService.deleteAssessment(schoolId, assessmentId, adminActor);
      expect(result.id).toBe(assessmentId);
      expect(assessmentRepository.deleteAssessment).toHaveBeenCalledWith(schoolId, assessmentId);
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        action: 'DELETE_ASSESSMENT'
      }));
    });

    it('throws ConflictError (409) when attempting to delete assessment with recorded grades', async () => {
      const existing = {
        id: assessmentId,
        schoolId,
        classId: classIdA,
        title: 'Graded Assessment'
      };

      assessmentRepository.findAssessmentById.mockResolvedValue(existing);
      assessmentRepository.countAssessmentGrades.mockResolvedValue(24); // 24 student marks recorded

      await expect(
        assessmentService.deleteAssessment(schoolId, assessmentId, adminActor)
      ).rejects.toThrow(ConflictError);
      expect(assessmentRepository.deleteAssessment).not.toHaveBeenCalled();
    });

    it('throws NotFoundError if assessment does not exist', async () => {
      assessmentRepository.findAssessmentById.mockResolvedValue(null);

      await expect(
        assessmentService.deleteAssessment(schoolId, assessmentId, adminActor)
      ).rejects.toThrow(NotFoundError);
    });
  });
});
