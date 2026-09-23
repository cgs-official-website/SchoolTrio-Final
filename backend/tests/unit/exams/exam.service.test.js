import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as examService from '../../../src/modules/exams/exam.service.js';
import * as examRepository from '../../../src/modules/exams/exam.repository.js';
import * as auditRepository from '../../../src/modules/audit/audit.repository.js';
import { NotFoundError, ConflictError, TenantAccessError } from '../../../src/utils/app-error.js';

vi.mock('../../../src/modules/exams/exam.repository.js');
vi.mock('../../../src/modules/audit/audit.repository.js');
vi.mock('../../../src/modules/attendance/attendance.service.js', () => ({
  resolveAcademicYear: vi.fn().mockImplementation(async (_schoolId, explicitYear) => {
    return explicitYear || '2026-2027';
  })
}));

describe('Examination Service Unit Tests', () => {
  const schoolId = '86e6e8b1-f3be-44fb-9759-268027ec2802';
  const userId = '11111111-2222-3333-4444-555555555555';
  const examId = '99999999-8888-7777-6666-555555555555';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listExams', () => {
    it('throws TenantAccessError when schoolId is missing', async () => {
      await expect(examService.listExams(null)).rejects.toThrow(TenantAccessError);
    });

    it('returns paginated examinations list', async () => {
      const mockItems = [
        { id: examId, name: 'Term 1 Exam', term: 'Term 1', academicYear: '2026-2027' }
      ];
      examRepository.findExams.mockResolvedValue({
        items: mockItems,
        total: 1
      });

      const result = await examService.listExams(schoolId, { page: 1, limit: 20 });
      expect(result.exams).toEqual(mockItems);
      expect(result.pagination.total).toBe(1);
      expect(result.pagination.page).toBe(1);
    });
  });

  describe('getExamById', () => {
    it('returns exam when found', async () => {
      const mockExam = { id: examId, schoolId, name: 'Final Exam', term: 'Term 3' };
      examRepository.findExamById.mockResolvedValue(mockExam);

      const result = await examService.getExamById(schoolId, examId);
      expect(result).toEqual(mockExam);
    });

    it('throws NotFoundError when exam does not exist', async () => {
      examRepository.findExamById.mockResolvedValue(null);
      await expect(examService.getExamById(schoolId, examId)).rejects.toThrow(NotFoundError);
    });
  });

  describe('createExam', () => {
    it('creates examination and records audit log (omitted term becomes null)', async () => {
      const payload = {
        name: 'Midterm 2026',
        startDate: '2026-09-15',
        endDate: '2026-09-20'
      };

      const mockCreated = {
        id: examId,
        schoolId,
        name: 'Midterm 2026',
        term: null,
        academicYear: '2026-2027',
        startDate: '2026-09-15',
        endDate: '2026-09-20'
      };

      examRepository.createExam.mockResolvedValue(mockCreated);
      auditRepository.createAuditLog.mockResolvedValue({});

      const result = await examService.createExam(schoolId, payload, userId);
      expect(result).toEqual(mockCreated);
      expect(examRepository.createExam).toHaveBeenCalledWith(schoolId, expect.objectContaining({
        name: 'Midterm 2026',
        term: null,
        academicYear: '2026-2027'
      }));
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        schoolId,
        userId,
        action: 'CREATE_EXAM',
        resourceId: examId
      }));
    });

    it('uses custom term when provided', async () => {
      const payload = {
        name: 'Quarterly Exam',
        term: 'Quarter 1'
      };

      const mockCreated = {
        id: examId,
        schoolId,
        name: 'Quarterly Exam',
        term: 'Quarter 1',
        academicYear: '2026-2027'
      };

      examRepository.createExam.mockResolvedValue(mockCreated);

      const result = await examService.createExam(schoolId, payload, userId);
      expect(result.term).toBe('Quarter 1');
    });
  });

  describe('updateExam', () => {
    it('updates examination fields successfully', async () => {
      const existingExam = {
        id: examId,
        schoolId,
        name: 'Old Name',
        term: 'Term 1',
        academicYear: '2026-2027',
        startDate: '2026-09-10',
        endDate: '2026-09-20'
      };

      examRepository.findExamById.mockResolvedValue(existingExam);
      examRepository.updateExam.mockResolvedValue({
        ...existingExam,
        name: 'New Name'
      });

      const result = await examService.updateExam(schoolId, examId, { name: 'New Name' }, userId);
      expect(result.name).toBe('New Name');
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        action: 'UPDATE_EXAM'
      }));
    });

    it('throws ConflictError if startDate is updated to be after existing endDate', async () => {
      const existingExam = {
        id: examId,
        schoolId,
        name: 'Exam',
        startDate: '2026-09-10',
        endDate: '2026-09-20'
      };

      examRepository.findExamById.mockResolvedValue(existingExam);

      await expect(
        examService.updateExam(schoolId, examId, { startDate: '2026-09-25' }, userId)
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('deleteExam', () => {
    it('deletes exam successfully when 0 dependent assessments exist', async () => {
      const existingExam = { id: examId, schoolId, name: 'Exam To Delete' };
      examRepository.findExamById.mockResolvedValue(existingExam);
      examRepository.countDependentAssessments.mockResolvedValue(0);
      examRepository.deleteExam.mockResolvedValue(existingExam);

      const result = await examService.deleteExam(schoolId, examId, userId);
      expect(result.id).toBe(examId);
      expect(examRepository.deleteExam).toHaveBeenCalledWith(schoolId, examId);
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        action: 'DELETE_EXAM'
      }));
    });

    it('throws ConflictError (409) if dependent assessments exist', async () => {
      const existingExam = { id: examId, schoolId, name: 'Exam With Assessments' };
      examRepository.findExamById.mockResolvedValue(existingExam);
      examRepository.countDependentAssessments.mockResolvedValue(3);

      await expect(examService.deleteExam(schoolId, examId, userId)).rejects.toThrow(ConflictError);
      expect(examRepository.deleteExam).not.toHaveBeenCalled();
    });

    it('throws NotFoundError if exam to delete does not exist', async () => {
      examRepository.findExamById.mockResolvedValue(null);
      await expect(examService.deleteExam(schoolId, examId, userId)).rejects.toThrow(NotFoundError);
    });
  });
});
