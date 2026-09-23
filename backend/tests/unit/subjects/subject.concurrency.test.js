import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as subjectService from '../../../src/modules/subjects/subject.service.js';
import * as subjectRepository from '../../../src/modules/subjects/subject.repository.js';
import * as auditRepository from '../../../src/modules/audit/audit.repository.js';
import { prisma } from '../../../src/database/prisma.client.js';
import { ConflictError, NotFoundError } from '../../../src/utils/app-error.js';

vi.mock('../../../src/modules/subjects/subject.repository.js');
vi.mock('../../../src/modules/audit/audit.repository.js');
vi.mock('../../../src/database/prisma.client.js', () => ({
  prisma: {
    $transaction: vi.fn(async (cb) => cb(prisma))
  }
}));

describe('Unit: Subject Deletion Concurrency & Transaction Serialization', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const SUBJECT_ID = '22222222-2222-4222-8222-222222222222';
  const ACTOR = {
    userId: '33333333-3333-4333-8333-333333333333',
    email: 'admin@school.edu',
    systemRole: 'SCHOOL_ADMIN'
  };

  const existingSubject = {
    id: SUBJECT_ID,
    schoolId: SCHOOL_ID,
    name: 'Physics',
    code: 'PHYS101',
    credits: 3.0
  };

  beforeEach(() => {
    vi.clearAllMocks();
    subjectRepository.findSubjectById.mockResolvedValue(existingSubject);
    subjectRepository.findSubjectByIdForUpdate.mockResolvedValue(existingSubject);
    auditRepository.createAuditLog.mockResolvedValue({ id: 'audit-id' });
  });

  it('guarantees FOR UPDATE lock is acquired before dependency count queries', async () => {
    const callOrder = [];

    subjectRepository.findSubjectByIdForUpdate.mockImplementation(async () => {
      callOrder.push('FOR_UPDATE_LOCK');
      return existingSubject;
    });

    subjectRepository.countSubjectDependencies.mockImplementation(async () => {
      callOrder.push('COUNT_DEPENDENCIES');
      return {
        assessments: 0,
        homeworkAssignments: 0,
        lessonPlans: 0,
        timetablePeriods: 0,
        academicResources: 0
      };
    });

    subjectRepository.deleteSubject.mockImplementation(async () => {
      callOrder.push('DELETE_SUBJECT');
      return existingSubject;
    });

    await subjectService.deleteSubject(SCHOOL_ID, SUBJECT_ID, ACTOR);

    expect(callOrder).toEqual(['FOR_UPDATE_LOCK', 'COUNT_DEPENDENCIES', 'DELETE_SUBJECT']);
    expect(auditRepository.createAuditLog).toHaveBeenCalledTimes(1);
  });

  it('aborts delete transaction when concurrent Assessment insert occurs before lock', async () => {
    subjectRepository.countSubjectDependencies.mockResolvedValue({
      assessments: 1, // Race: assessment was created
      homeworkAssignments: 0,
      lessonPlans: 0,
      timetablePeriods: 0,
      academicResources: 0
    });

    await expect(subjectService.deleteSubject(SCHOOL_ID, SUBJECT_ID, ACTOR)).rejects.toThrow(ConflictError);
    expect(subjectRepository.deleteSubject).not.toHaveBeenCalled();
    expect(auditRepository.createAuditLog).not.toHaveBeenCalled();
  });

  it('aborts delete transaction when concurrent HomeworkAssignment insert occurs', async () => {
    subjectRepository.countSubjectDependencies.mockResolvedValue({
      assessments: 0,
      homeworkAssignments: 1,
      lessonPlans: 0,
      timetablePeriods: 0,
      academicResources: 0
    });

    await expect(subjectService.deleteSubject(SCHOOL_ID, SUBJECT_ID, ACTOR)).rejects.toThrow(ConflictError);
    expect(subjectRepository.deleteSubject).not.toHaveBeenCalled();
    expect(auditRepository.createAuditLog).not.toHaveBeenCalled();
  });

  it('aborts delete transaction when concurrent LessonPlan insert occurs', async () => {
    subjectRepository.countSubjectDependencies.mockResolvedValue({
      assessments: 0,
      homeworkAssignments: 0,
      lessonPlans: 1,
      timetablePeriods: 0,
      academicResources: 0
    });

    await expect(subjectService.deleteSubject(SCHOOL_ID, SUBJECT_ID, ACTOR)).rejects.toThrow(ConflictError);
    expect(subjectRepository.deleteSubject).not.toHaveBeenCalled();
    expect(auditRepository.createAuditLog).not.toHaveBeenCalled();
  });

  it('aborts delete transaction when concurrent TimetablePeriod insert occurs', async () => {
    subjectRepository.countSubjectDependencies.mockResolvedValue({
      assessments: 0,
      homeworkAssignments: 0,
      lessonPlans: 0,
      timetablePeriods: 1,
      academicResources: 0
    });

    await expect(subjectService.deleteSubject(SCHOOL_ID, SUBJECT_ID, ACTOR)).rejects.toThrow(ConflictError);
    expect(subjectRepository.deleteSubject).not.toHaveBeenCalled();
    expect(auditRepository.createAuditLog).not.toHaveBeenCalled();
  });

  it('aborts delete transaction when concurrent AcademicResource insert occurs', async () => {
    subjectRepository.countSubjectDependencies.mockResolvedValue({
      assessments: 0,
      homeworkAssignments: 0,
      lessonPlans: 0,
      timetablePeriods: 0,
      academicResources: 1
    });

    await expect(subjectService.deleteSubject(SCHOOL_ID, SUBJECT_ID, ACTOR)).rejects.toThrow(ConflictError);
    expect(subjectRepository.deleteSubject).not.toHaveBeenCalled();
    expect(auditRepository.createAuditLog).not.toHaveBeenCalled();
  });

  it('safely handles concurrent delete race where racing transaction deletes subject first', async () => {
    // First transaction succeeds
    // Second transaction finds subject in pre-check, but findSubjectByIdForUpdate returns null
    subjectRepository.findSubjectByIdForUpdate.mockResolvedValue(null);

    await expect(subjectService.deleteSubject(SCHOOL_ID, SUBJECT_ID, ACTOR)).rejects.toThrow(NotFoundError);
    expect(subjectRepository.countSubjectDependencies).not.toHaveBeenCalled();
    expect(subjectRepository.deleteSubject).not.toHaveBeenCalled();
    expect(auditRepository.createAuditLog).not.toHaveBeenCalled();
  });
});
