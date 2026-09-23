import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  listExams,
  getExam,
  createExam,
  updateExam,
  deleteExam,
  examsApi
} from '../exams.js';
import * as clientModule from '../client.js';

describe('examsApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('listExams', () => {
    it('calls GET /api/v1/exams without query string if empty', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: [{ id: 'exam-1', name: 'Mid-Term 2026' }],
        pagination: { page: 1, limit: 50, total: 1 }
      });

      const res = await listExams();

      expect(spy).toHaveBeenCalledWith('/api/v1/exams', {
        method: 'GET'
      });
      expect(res.data[0].name).toBe('Mid-Term 2026');
    });

    it('appends formatted query string when query options provided', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: []
      });

      await listExams({ search: 'Final', academicYear: '2026-2027', term: null, page: 1 });

      expect(spy).toHaveBeenCalledWith(
        '/api/v1/exams?search=Final&academicYear=2026-2027&page=1',
        { method: 'GET' }
      );
    });
  });

  describe('getExam', () => {
    it('calls GET /api/v1/exams/:id with exam UUID', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: 'exam-uuid-1', name: 'Final 2026' }
      });

      const res = await getExam('exam-uuid-1');

      expect(spy).toHaveBeenCalledWith('/api/v1/exams/exam-uuid-1', {
        method: 'GET'
      });
      expect(res.data.id).toBe('exam-uuid-1');
    });
  });

  describe('createExam', () => {
    it('calls POST /api/v1/exams with validated payload', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: 'new-exam-uuid', name: 'Unit Test 1', startDate: '2026-10-01', endDate: '2026-10-05' }
      });

      const payload = {
        name: 'Unit Test 1',
        startDate: '2026-10-01',
        endDate: '2026-10-05'
      };

      const res = await createExam(payload);

      expect(spy).toHaveBeenCalledWith('/api/v1/exams', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      expect(res.data.id).toBe('new-exam-uuid');
    });

    it('never sends client-side schoolId in create payload', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: 'exam-safe' }
      });

      const payload = {
        name: 'Mid-Term Exam',
        startDate: '2026-11-01',
        endDate: '2026-11-10'
      };

      await createExam(payload);

      const parsedBody = JSON.parse(spy.mock.calls[0][1].body);
      expect(parsedBody).not.toHaveProperty('schoolId');
    });
  });

  describe('updateExam', () => {
    it('calls PATCH /api/v1/exams/:id with update payload', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: 'exam-patch-1', name: 'Updated Exam Name' }
      });

      const payload = { name: 'Updated Exam Name' };
      const res = await updateExam('exam-patch-1', payload);

      expect(spy).toHaveBeenCalledWith('/api/v1/exams/exam-patch-1', {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      expect(res.data.name).toBe('Updated Exam Name');
    });
  });

  describe('deleteExam', () => {
    it('calls DELETE /api/v1/exams/:id', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { message: 'Examination deleted successfully', id: 'exam-del-1' }
      });

      const res = await deleteExam('exam-del-1');

      expect(spy).toHaveBeenCalledWith('/api/v1/exams/exam-del-1', {
        method: 'DELETE'
      });
      expect(res.data.id).toBe('exam-del-1');
    });
  });

  describe('default export', () => {
    it('contains all methods', () => {
      expect(examsApi.listExams).toBe(listExams);
      expect(examsApi.getExam).toBe(getExam);
      expect(examsApi.createExam).toBe(createExam);
      expect(examsApi.updateExam).toBe(updateExam);
      expect(examsApi.deleteExam).toBe(deleteExam);
    });
  });
});
