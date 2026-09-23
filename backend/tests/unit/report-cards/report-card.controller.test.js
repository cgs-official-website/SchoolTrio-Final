import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as reportCardController from '../../../src/modules/report-cards/report-card.controller.js';
import * as reportCardService from '../../../src/modules/report-cards/report-card.service.js';

describe('ReportCard Controller Unit Tests (Phase 4C.7-C Batch 3B)', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const CLASS_ID = '22222222-2222-4222-8222-222222222222';
  const EXAM_ID = '33333333-3333-4333-8333-333333333333';
  const STUDENT_ID = '44444444-4444-4444-8444-444444444444';
  const REPORT_CARD_ID = '55555555-5555-4555-8555-555555555555';

  const mockActor = {
    id: 'user-123',
    userId: 'user-123',
    schoolId: SCHOOL_ID,
    systemRole: 'ADMIN'
  };

  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    vi.restoreAllMocks();

    mockReq = {
      tenant: { schoolId: SCHOOL_ID },
      user: mockActor,
      params: {},
      query: {},
      body: {}
    };

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };

    mockNext = vi.fn();
  });

  describe('previewReportCards', () => {
    it('calls reportCardService.generateReportCardPreview and returns 200 success response', async () => {
      mockReq.body = { classId: CLASS_ID, examId: EXAM_ID };
      const mockPreviewResult = {
        classId: CLASS_ID,
        examId: EXAM_ID,
        studentsCount: 2,
        students: []
      };

      const spy = vi.spyOn(reportCardService, 'generateReportCardPreview').mockResolvedValue(mockPreviewResult);

      await reportCardController.previewReportCards(mockReq, mockRes, mockNext);

      expect(spy).toHaveBeenCalledWith(SCHOOL_ID, mockReq.body, mockActor);
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Report card preview generated successfully',
          data: mockPreviewResult
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('catches and forwards errors to next(error)', async () => {
      const error = new Error('Preview computation failed');
      vi.spyOn(reportCardService, 'generateReportCardPreview').mockRejectedValue(error);

      await reportCardController.previewReportCards(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
      expect(mockRes.status).not.toHaveBeenCalled();
    });
  });

  describe('publishReportCards', () => {
    it('calls reportCardService.publishReportCards and returns 200 success response', async () => {
      mockReq.body = { classId: CLASS_ID, examId: EXAM_ID, studentIds: [STUDENT_ID] };
      const mockPublishResult = {
        publishedCount: 1,
        reportCards: [{ id: REPORT_CARD_ID }]
      };

      const spy = vi.spyOn(reportCardService, 'publishReportCards').mockResolvedValue(mockPublishResult);

      await reportCardController.publishReportCards(mockReq, mockRes, mockNext);

      expect(spy).toHaveBeenCalledWith(SCHOOL_ID, mockReq.body, mockActor);
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Report cards published successfully',
          data: mockPublishResult
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('catches and forwards errors to next(error)', async () => {
      const error = new Error('Publishing failed');
      vi.spyOn(reportCardService, 'publishReportCards').mockRejectedValue(error);

      await reportCardController.publishReportCards(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('getReportCard', () => {
    it('calls reportCardService.getReportCard and returns 200 success response', async () => {
      mockReq.params = { id: REPORT_CARD_ID };
      const mockReportCard = {
        id: REPORT_CARD_ID,
        schoolId: SCHOOL_ID,
        studentId: STUDENT_ID,
        title: 'Term 1 Report'
      };

      const spy = vi.spyOn(reportCardService, 'getReportCard').mockResolvedValue(mockReportCard);

      await reportCardController.getReportCard(mockReq, mockRes, mockNext);

      expect(spy).toHaveBeenCalledWith(SCHOOL_ID, REPORT_CARD_ID, mockActor);
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Report card retrieved successfully',
          data: mockReportCard
        })
      );
    });

    it('catches and forwards errors to next(error)', async () => {
      const error = new Error('Not found');
      vi.spyOn(reportCardService, 'getReportCard').mockRejectedValue(error);

      await reportCardController.getReportCard(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('listStudentReportCards', () => {
    it('calls reportCardService.listStudentReportCards and returns standard paginated response', async () => {
      mockReq.params = { studentId: STUDENT_ID };
      mockReq.query = { page: '1', limit: '10' };

      const mockResult = {
        reportCards: [{ id: REPORT_CARD_ID }],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1, hasNextPage: false, hasPrevPage: false }
      };

      const spy = vi.spyOn(reportCardService, 'listStudentReportCards').mockResolvedValue(mockResult);

      await reportCardController.listStudentReportCards(mockReq, mockRes, mockNext);

      expect(spy).toHaveBeenCalledWith(SCHOOL_ID, STUDENT_ID, mockReq.query, mockActor);
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Student report cards retrieved successfully',
          data: mockResult.reportCards,
          pagination: mockResult.pagination
        })
      );
    });

    it('catches and forwards errors to next(error)', async () => {
      const error = new Error('Student query failed');
      vi.spyOn(reportCardService, 'listStudentReportCards').mockRejectedValue(error);

      await reportCardController.listStudentReportCards(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('listClassReportCards', () => {
    it('calls reportCardService.listClassReportCards and returns standard paginated response', async () => {
      mockReq.params = { classId: CLASS_ID };
      mockReq.query = { page: '1', limit: '20' };

      const mockResult = {
        reportCards: [{ id: REPORT_CARD_ID }],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1, hasNextPage: false, hasPrevPage: false }
      };

      const spy = vi.spyOn(reportCardService, 'listClassReportCards').mockResolvedValue(mockResult);

      await reportCardController.listClassReportCards(mockReq, mockRes, mockNext);

      expect(spy).toHaveBeenCalledWith(SCHOOL_ID, CLASS_ID, mockReq.query, mockActor);
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Class report cards retrieved successfully',
          data: mockResult.reportCards,
          pagination: mockResult.pagination
        })
      );
    });

    it('catches and forwards errors to next(error)', async () => {
      const error = new Error('Class query failed');
      vi.spyOn(reportCardService, 'listClassReportCards').mockRejectedValue(error);

      await reportCardController.listClassReportCards(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });
});
