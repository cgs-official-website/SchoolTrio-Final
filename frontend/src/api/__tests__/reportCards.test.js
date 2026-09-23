import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  previewReportCards,
  publishReportCards,
  getReportCard,
  getStudentReportCards,
  getClassReportCards,
  reportCardsApi
} from '../reportCards.js';
import * as clientModule from '../client.js';

describe('reportCardsApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('previewReportCards', () => {
    it('calls POST /api/v1/report-cards/preview with payload', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { targetClass: { id: 'cls-1' }, studentCards: [] }
      });

      const payload = { classId: 'cls-1', examId: 'exam-1' };
      const res = await previewReportCards(payload);

      expect(spy).toHaveBeenCalledWith('/api/v1/report-cards/preview', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      expect(res.data.targetClass.id).toBe('cls-1');
    });
  });

  describe('publishReportCards', () => {
    it('calls POST /api/v1/report-cards/publish for formal report', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { publishedCount: 25, classId: 'cls-1', examId: 'exam-1' }
      });

      const payload = { classId: 'cls-1', examId: 'exam-1' };
      const res = await publishReportCards(payload);

      expect(spy).toHaveBeenCalledWith('/api/v1/report-cards/publish', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      expect(res.data.publishedCount).toBe(25);
    });

    it('calls POST /api/v1/report-cards/publish for continuous assessment (null examId)', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { publishedCount: 25, classId: 'cls-1', examId: null }
      });

      const payload = { classId: 'cls-1' };
      const res = await publishReportCards(payload);

      expect(spy).toHaveBeenCalledWith('/api/v1/report-cards/publish', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      expect(res.data.examId).toBeNull();
    });
  });

  describe('getReportCard', () => {
    it('calls GET /api/v1/report-cards/:id with UUID', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: 'rc-uuid-123', studentId: 'stu-1' }
      });

      const res = await getReportCard('rc-uuid-123');

      expect(spy).toHaveBeenCalledWith('/api/v1/report-cards/rc-uuid-123', {
        method: 'GET'
      });
      expect(res.data.id).toBe('rc-uuid-123');
    });
  });

  describe('getStudentReportCards', () => {
    it('calls GET /api/v1/report-cards/student/:studentId with query params', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: [{ id: 'rc-1' }],
        pagination: { page: 1, limit: 20, total: 1 }
      });

      const query = { page: 1, limit: 10, sortBy: 'publishedAt', sortOrder: 'desc' };
      const res = await getStudentReportCards('stu-1', query);

      expect(spy).toHaveBeenCalledWith(
        '/api/v1/report-cards/student/stu-1?page=1&limit=10&sortBy=publishedAt&sortOrder=desc',
        { method: 'GET' }
      );
      expect(res.data).toHaveLength(1);
    });

    it('omits undefined and null query params cleanly', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: []
      });

      await getStudentReportCards('stu-1', { page: 2, examId: undefined, term: null, academicYear: '' });

      expect(spy).toHaveBeenCalledWith('/api/v1/report-cards/student/stu-1?page=2', {
        method: 'GET'
      });
    });
  });

  describe('getClassReportCards', () => {
    it('calls GET /api/v1/report-cards/class/:classId without query string if empty', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: []
      });

      await getClassReportCards('cls-1');

      expect(spy).toHaveBeenCalledWith('/api/v1/report-cards/class/cls-1', {
        method: 'GET'
      });
    });
  });

  describe('default export', () => {
    it('contains all methods', () => {
      expect(reportCardsApi.previewReportCards).toBe(previewReportCards);
      expect(reportCardsApi.publishReportCards).toBe(publishReportCards);
      expect(reportCardsApi.getReportCard).toBe(getReportCard);
      expect(reportCardsApi.getStudentReportCards).toBe(getStudentReportCards);
      expect(reportCardsApi.getClassReportCards).toBe(getClassReportCards);
    });
  });
});
