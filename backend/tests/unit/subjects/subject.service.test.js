import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as subjectService from '../../../src/modules/subjects/subject.service.js';
import * as subjectRepository from '../../../src/modules/subjects/subject.repository.js';
import * as auditRepository from '../../../src/modules/audit/audit.repository.js';
import { prisma } from '../../../src/database/prisma.client.js';
import {
  NotFoundError,
  ConflictError,
  TenantAccessError
} from '../../../src/utils/app-error.js';

vi.mock('../../../src/modules/subjects/subject.repository.js');
vi.mock('../../../src/modules/audit/audit.repository.js');
vi.mock('../../../src/database/prisma.client.js', () => ({
  prisma: {
    $transaction: vi.fn(async (cb) => cb(prisma))
  }
}));

describe('Unit: Subject Service Layer', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const SUBJECT_ID = '22222222-2222-4222-8222-222222222222';
  const ACTOR = {
    userId: '33333333-3333-4333-8333-333333333333',
    email: 'admin@school.edu',
    systemRole: 'SCHOOL_ADMIN'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listSubjects', () => {
    it('throws TenantAccessError when schoolId is missing', async () => {
      await expect(subjectService.listSubjects(null)).rejects.toThrow(TenantAccessError);
    });

    it('returns paginated subjects with metadata', async () => {
      const mockSubjects = [
        { id: SUBJECT_ID, schoolId: SCHOOL_ID, name: 'Mathematics', code: 'MATH101', credits: 4 }
      ];
      subjectRepository.findSubjects.mockResolvedValue(mockSubjects);
      subjectRepository.countSubjects.mockResolvedValue(1);

      const result = await subjectService.listSubjects(SCHOOL_ID, { page: 1, limit: 10 });
      expect(result.subjects).toEqual(mockSubjects);
      expect(result.pagination.total).toBe(1);
      expect(result.pagination.page).toBe(1);
    });
  });

  describe('getSubjectById', () => {
    it('throws NotFoundError when subject does not exist', async () => {
      subjectRepository.findSubjectById.mockResolvedValue(null);
      await expect(subjectService.getSubjectById(SCHOOL_ID, SUBJECT_ID)).rejects.toThrow(NotFoundError);
    });

    it('returns subject record when found', async () => {
      const mockSubject = { id: SUBJECT_ID, schoolId: SCHOOL_ID, name: 'Mathematics' };
      subjectRepository.findSubjectById.mockResolvedValue(mockSubject);

      const result = await subjectService.getSubjectById(SCHOOL_ID, SUBJECT_ID);
      expect(result).toEqual(mockSubject);
    });
  });

  describe('createSubject', () => {
    it('throws ConflictError if subject with same name already exists (case-insensitive)', async () => {
      subjectRepository.findSubjectByName.mockResolvedValue({ id: 'existing-id', name: 'mathematics' });

      await expect(
        subjectService.createSubject(SCHOOL_ID, { name: 'Mathematics' }, ACTOR)
      ).rejects.toThrow(ConflictError);
    });

    it('throws ConflictError if subject with same code already exists', async () => {
      subjectRepository.findSubjectByName.mockResolvedValue(null);
      subjectRepository.findSubjectByCode.mockResolvedValue({ id: 'existing-id', code: 'MATH101' });

      await expect(
        subjectService.createSubject(SCHOOL_ID, { name: 'Mathematics', code: 'MATH101' }, ACTOR)
      ).rejects.toThrow(ConflictError);
    });

    it('creates subject and records canonical CREATE_SUBJECT AuditLog', async () => {
      subjectRepository.findSubjectByName.mockResolvedValue(null);
      subjectRepository.findSubjectByCode.mockResolvedValue(null);
      const createdRecord = {
        id: SUBJECT_ID,
        schoolId: SCHOOL_ID,
        name: 'Mathematics',
        code: 'MATH101',
        credits: 4.0
      };
      subjectRepository.createSubject.mockResolvedValue(createdRecord);

      const result = await subjectService.createSubject(
        SCHOOL_ID,
        { name: 'Mathematics', code: 'MATH101', credits: 4.0 },
        ACTOR
      );

      expect(result).toEqual(createdRecord);
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          schoolId: SCHOOL_ID,
          entityType: 'Subject',
          entityId: SUBJECT_ID,
          actionPerformed: 'CREATE_SUBJECT: Mathematics',
          userName: ACTOR.email,
          userRole: ACTOR.systemRole,
          modifiedFields: {
            name: 'Mathematics',
            code: 'MATH101',
            credits: 4.0
          }
        })
      );
    });
  });

  describe('updateSubject', () => {
    it('throws NotFoundError if subject does not exist', async () => {
      subjectRepository.findSubjectById.mockResolvedValue(null);
      await expect(
        subjectService.updateSubject(SCHOOL_ID, SUBJECT_ID, { name: 'New Name' }, ACTOR)
      ).rejects.toThrow(NotFoundError);
    });

    it('throws ConflictError on duplicate name update', async () => {
      subjectRepository.findSubjectById.mockResolvedValue({ id: SUBJECT_ID, name: 'Old Name' });
      subjectRepository.findSubjectByName.mockResolvedValue({ id: 'other-id', name: 'Existing Name' });

      await expect(
        subjectService.updateSubject(SCHOOL_ID, SUBJECT_ID, { name: 'Existing Name' }, ACTOR)
      ).rejects.toThrow(ConflictError);
    });

    it('updates subject and records UPDATE_SUBJECT AuditLog with deltas', async () => {
      const existing = { id: SUBJECT_ID, name: 'Math', code: 'M101', credits: 3.0 };
      const updated = { id: SUBJECT_ID, name: 'Mathematics', code: 'MATH101', credits: 4.0 };
      subjectRepository.findSubjectById.mockResolvedValue(existing);
      subjectRepository.findSubjectByName.mockResolvedValue(null);
      subjectRepository.findSubjectByCode.mockResolvedValue(null);
      subjectRepository.updateSubject.mockResolvedValue(updated);

      const result = await subjectService.updateSubject(
        SCHOOL_ID,
        SUBJECT_ID,
        { name: 'Mathematics', code: 'MATH101', credits: 4.0 },
        ACTOR
      );

      expect(result).toEqual(updated);
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          schoolId: SCHOOL_ID,
          entityType: 'Subject',
          entityId: SUBJECT_ID,
          actionPerformed: 'UPDATE_SUBJECT: Mathematics',
          modifiedFields: {
            name: { old: 'Math', new: 'Mathematics' },
            code: { old: 'M101', new: 'MATH101' },
            credits: { old: 3.0, new: 4.0 }
          }
        })
      );
    });

    it('does not emit audit log if update is an exact no-op', async () => {
      const existing = { id: SUBJECT_ID, name: 'Mathematics', code: 'MATH101', credits: 4.0 };
      subjectRepository.findSubjectById.mockResolvedValue(existing);
      subjectRepository.updateSubject.mockResolvedValue(existing);

      await subjectService.updateSubject(
        SCHOOL_ID,
        SUBJECT_ID,
        { name: 'Mathematics', code: 'MATH101', credits: 4.0 },
        ACTOR
      );

      expect(auditRepository.createAuditLog).not.toHaveBeenCalled();
    });
  });

  describe('deleteSubject (Dependency Guards & Concurrency)', () => {
    const existingSubject = {
      id: SUBJECT_ID,
      schoolId: SCHOOL_ID,
      name: 'Mathematics',
      code: 'MATH101',
      credits: 4.0
    };

    it('throws NotFoundError if subject to delete does not exist in pre-check', async () => {
      subjectRepository.findSubjectById.mockResolvedValue(null);
      await expect(subjectService.deleteSubject(SCHOOL_ID, SUBJECT_ID, ACTOR)).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError if subject is deleted concurrently before row lock acquisition', async () => {
      subjectRepository.findSubjectById.mockResolvedValue(existingSubject);
      subjectRepository.findSubjectByIdForUpdate.mockResolvedValue(null);

      await expect(subjectService.deleteSubject(SCHOOL_ID, SUBJECT_ID, ACTOR)).rejects.toThrow(NotFoundError);
      expect(subjectRepository.findSubjectByIdForUpdate).toHaveBeenCalledWith(SCHOOL_ID, SUBJECT_ID, expect.anything());
      expect(subjectRepository.countSubjectDependencies).not.toHaveBeenCalled();
      expect(subjectRepository.deleteSubject).not.toHaveBeenCalled();
    });

    it('rejects deletion when subject has active examination assessments', async () => {
      subjectRepository.findSubjectById.mockResolvedValue(existingSubject);
      subjectRepository.findSubjectByIdForUpdate.mockResolvedValue(existingSubject);
      subjectRepository.countSubjectDependencies.mockResolvedValue({
        assessments: 3,
        homeworkAssignments: 0,
        lessonPlans: 0,
        timetablePeriods: 0,
        academicResources: 0
      });

      await expect(subjectService.deleteSubject(SCHOOL_ID, SUBJECT_ID, ACTOR)).rejects.toThrow(
        /examination assessments/
      );
      expect(subjectRepository.findSubjectByIdForUpdate).toHaveBeenCalledWith(SCHOOL_ID, SUBJECT_ID, expect.anything());
      expect(subjectRepository.deleteSubject).not.toHaveBeenCalled();
      expect(auditRepository.createAuditLog).not.toHaveBeenCalled();
    });

    it('rejects deletion when subject has active homework assignments', async () => {
      subjectRepository.findSubjectById.mockResolvedValue(existingSubject);
      subjectRepository.findSubjectByIdForUpdate.mockResolvedValue(existingSubject);
      subjectRepository.countSubjectDependencies.mockResolvedValue({
        assessments: 0,
        homeworkAssignments: 2,
        lessonPlans: 0,
        timetablePeriods: 0,
        academicResources: 0
      });

      await expect(subjectService.deleteSubject(SCHOOL_ID, SUBJECT_ID, ACTOR)).rejects.toThrow(
        /active homework assignments/
      );
      expect(subjectRepository.deleteSubject).not.toHaveBeenCalled();
    });

    it('rejects deletion when subject has associated lesson plans', async () => {
      subjectRepository.findSubjectById.mockResolvedValue(existingSubject);
      subjectRepository.findSubjectByIdForUpdate.mockResolvedValue(existingSubject);
      subjectRepository.countSubjectDependencies.mockResolvedValue({
        assessments: 0,
        homeworkAssignments: 0,
        lessonPlans: 1,
        timetablePeriods: 0,
        academicResources: 0
      });

      await expect(subjectService.deleteSubject(SCHOOL_ID, SUBJECT_ID, ACTOR)).rejects.toThrow(
        /associated lesson plans/
      );
      expect(subjectRepository.deleteSubject).not.toHaveBeenCalled();
    });

    it('rejects deletion when subject has active timetable periods', async () => {
      subjectRepository.findSubjectById.mockResolvedValue(existingSubject);
      subjectRepository.findSubjectByIdForUpdate.mockResolvedValue(existingSubject);
      subjectRepository.countSubjectDependencies.mockResolvedValue({
        assessments: 0,
        homeworkAssignments: 0,
        lessonPlans: 0,
        timetablePeriods: 5,
        academicResources: 0
      });

      await expect(subjectService.deleteSubject(SCHOOL_ID, SUBJECT_ID, ACTOR)).rejects.toThrow(
        /active timetable periods/
      );
      expect(subjectRepository.deleteSubject).not.toHaveBeenCalled();
    });

    it('rejects deletion when subject has linked academic resources', async () => {
      subjectRepository.findSubjectById.mockResolvedValue(existingSubject);
      subjectRepository.findSubjectByIdForUpdate.mockResolvedValue(existingSubject);
      subjectRepository.countSubjectDependencies.mockResolvedValue({
        assessments: 0,
        homeworkAssignments: 0,
        lessonPlans: 0,
        timetablePeriods: 0,
        academicResources: 4
      });

      await expect(subjectService.deleteSubject(SCHOOL_ID, SUBJECT_ID, ACTOR)).rejects.toThrow(
        /linked academic resources/
      );
      expect(subjectRepository.deleteSubject).not.toHaveBeenCalled();
    });

    it('successfully acquires row lock, checks 0 dependencies, deletes subject and records DELETE_SUBJECT AuditLog', async () => {
      subjectRepository.findSubjectById.mockResolvedValue(existingSubject);
      subjectRepository.findSubjectByIdForUpdate.mockResolvedValue(existingSubject);
      subjectRepository.countSubjectDependencies.mockResolvedValue({
        assessments: 0,
        homeworkAssignments: 0,
        lessonPlans: 0,
        timetablePeriods: 0,
        academicResources: 0
      });
      subjectRepository.deleteSubject.mockResolvedValue(existingSubject);

      await subjectService.deleteSubject(SCHOOL_ID, SUBJECT_ID, ACTOR);

      expect(subjectRepository.findSubjectByIdForUpdate).toHaveBeenCalledWith(SCHOOL_ID, SUBJECT_ID, expect.anything());
      expect(subjectRepository.countSubjectDependencies).toHaveBeenCalledWith(SCHOOL_ID, SUBJECT_ID, expect.anything());
      expect(subjectRepository.deleteSubject).toHaveBeenCalledWith(SCHOOL_ID, SUBJECT_ID, expect.anything());
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          schoolId: SCHOOL_ID,
          entityType: 'Subject',
          entityId: SUBJECT_ID,
          actionPerformed: 'DELETE_SUBJECT: Mathematics',
          modifiedFields: {
            deletedSubject: {
              id: SUBJECT_ID,
              name: 'Mathematics',
              code: 'MATH101',
              credits: 4.0
            }
          }
        })
      );
    });
  });
});
