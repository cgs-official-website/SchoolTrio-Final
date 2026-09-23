import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  listAssessments,
  getAssessment,
  createAssessment,
  updateAssessment,
  deleteAssessment,
  getAssessmentGrades,
  getStudentAssessmentGrade,
  bulkUpsertAssessmentGrades,
  deleteAssessmentGrade,
  assessmentsApi
} from '../assessments.js';
import * as clientModule from '../client.js';

describe('assessmentsApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('listAssessments', () => {
    it('calls GET /api/v1/assessments without query string if empty', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: [{ id: 'asmt-1', title: 'Midterm Quiz', totalMarks: 50 }],
        pagination: { page: 1, limit: 20, total: 1 }
      });

      const res = await listAssessments();

      expect(spy).toHaveBeenCalledWith('/api/v1/assessments', {
        method: 'GET'
      });
      expect(res.data[0].title).toBe('Midterm Quiz');
    });

    it('appends query string with classId, examId, and pagination parameters without schoolId', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: []
      });

      await listAssessments({ classId: 'cls-uuid-1', examId: 'exam-uuid-1', limit: 100 });

      expect(spy).toHaveBeenCalledWith(
        '/api/v1/assessments?classId=cls-uuid-1&examId=exam-uuid-1&limit=100',
        { method: 'GET' }
      );
      const callUrl = spy.mock.calls[0][0];
      expect(callUrl).not.toContain('schoolId');
    });
  });

  describe('getAssessment', () => {
    it('calls GET /api/v1/assessments/:id with encoded ID', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: 'asmt-uuid-123', title: 'Unit Test' }
      });

      const res = await getAssessment('asmt-uuid-123');

      expect(spy).toHaveBeenCalledWith('/api/v1/assessments/asmt-uuid-123', {
        method: 'GET'
      });
      expect(res.data.id).toBe('asmt-uuid-123');
    });
  });

  describe('createAssessment', () => {
    it('calls POST /api/v1/assessments with payload as JSON body', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: 'asmt-new-uuid', title: 'Final Test', totalMarks: 100 }
      });

      const payload = {
        title: 'Final Test',
        classId: 'cls-1',
        totalMarks: 100,
        date: '2026-09-11',
        examId: 'exam-1'
      };

      const res = await createAssessment(payload);

      expect(spy).toHaveBeenCalledWith('/api/v1/assessments', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      expect(res.data.id).toBe('asmt-new-uuid');
      const bodySent = JSON.parse(spy.mock.calls[0][1].body);
      expect(bodySent).not.toHaveProperty('schoolId');
    });
  });

  describe('updateAssessment', () => {
    it('calls PATCH /api/v1/assessments/:id with partial payload', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: 'asmt-uuid-up', title: 'Updated Title' }
      });

      const payload = { title: 'Updated Title', passingMarks: 40 };
      const res = await updateAssessment('asmt-uuid-up', payload);

      expect(spy).toHaveBeenCalledWith('/api/v1/assessments/asmt-uuid-up', {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      expect(res.data.title).toBe('Updated Title');
    });
  });

  describe('deleteAssessment', () => {
    it('calls DELETE /api/v1/assessments/:id', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { message: 'Assessment deleted successfully', id: 'asmt-del-1' }
      });

      const res = await deleteAssessment('asmt-del-1');

      expect(spy).toHaveBeenCalledWith('/api/v1/assessments/asmt-del-1', {
        method: 'DELETE'
      });
      expect(res.data.id).toBe('asmt-del-1');
    });
  });

  describe('getAssessmentGrades', () => {
    it('calls GET /api/v1/assessments/:assessmentId/grades without query string if empty', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: [{ id: 'g-1', studentId: 's-1', marksObtained: 85 }],
        pagination: { page: 1, limit: 50, total: 1 }
      });

      const res = await getAssessmentGrades('asmt-uuid-1');

      expect(spy).toHaveBeenCalledWith('/api/v1/assessments/asmt-uuid-1/grades', {
        method: 'GET'
      });
      expect(res.data[0].marksObtained).toBe(85);
    });

    it('appends formatted query string when query options provided', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: []
      });

      await getAssessmentGrades('asmt-uuid-2', { page: 2, limit: 20, search: 'John', emptyField: null });

      expect(spy).toHaveBeenCalledWith(
        '/api/v1/assessments/asmt-uuid-2/grades?page=2&limit=20&search=John',
        { method: 'GET' }
      );
    });
  });

  describe('getStudentAssessmentGrade', () => {
    it('calls GET /api/v1/assessments/:assessmentId/grades/:studentId', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: 'g-1', assessmentId: 'a-1', studentId: 's-1', marksObtained: 92.5 }
      });

      const res = await getStudentAssessmentGrade('a-1', 's-1');

      expect(spy).toHaveBeenCalledWith('/api/v1/assessments/a-1/grades/s-1', {
        method: 'GET'
      });
      expect(res.data.marksObtained).toBe(92.5);
    });
  });

  describe('bulkUpsertAssessmentGrades', () => {
    it('calls POST /api/v1/assessments/:assessmentId/grades/bulk with payload', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { count: 2, grades: [] }
      });

      const payload = {
        grades: [
          { studentId: 's-1', marksObtained: 90 },
          { studentId: 's-2', marksObtained: 0 }
        ]
      };

      const res = await bulkUpsertAssessmentGrades('asmt-uuid-3', payload);

      expect(spy).toHaveBeenCalledWith('/api/v1/assessments/asmt-uuid-3/grades/bulk', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      expect(res.data.count).toBe(2);
    });
  });

  describe('deleteAssessmentGrade', () => {
    it('calls DELETE /api/v1/assessments/:assessmentId/grades/:studentId', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { message: 'Assessment grade cleared successfully', assessmentId: 'a-1', studentId: 's-1' }
      });

      const res = await deleteAssessmentGrade('a-1', 's-1');

      expect(spy).toHaveBeenCalledWith('/api/v1/assessments/a-1/grades/s-1', {
        method: 'DELETE'
      });
      expect(res.data.studentId).toBe('s-1');
    });
  });

  describe('default export', () => {
    it('contains all methods', () => {
      expect(assessmentsApi.listAssessments).toBe(listAssessments);
      expect(assessmentsApi.getAssessment).toBe(getAssessment);
      expect(assessmentsApi.createAssessment).toBe(createAssessment);
      expect(assessmentsApi.updateAssessment).toBe(updateAssessment);
      expect(assessmentsApi.deleteAssessment).toBe(deleteAssessment);
      expect(assessmentsApi.getAssessmentGrades).toBe(getAssessmentGrades);
      expect(assessmentsApi.getStudentAssessmentGrade).toBe(getStudentAssessmentGrade);
      expect(assessmentsApi.bulkUpsertAssessmentGrades).toBe(bulkUpsertAssessmentGrades);
      expect(assessmentsApi.deleteAssessmentGrade).toBe(deleteAssessmentGrade);
    });
  });
});
