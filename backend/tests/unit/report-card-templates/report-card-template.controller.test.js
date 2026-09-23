import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as reportCardTemplateController from '../../../src/modules/report-card-templates/report-card-template.controller.js';
import * as reportCardTemplateService from '../../../src/modules/report-card-templates/report-card-template.service.js';

describe('ReportCardTemplate Controller Unit Tests (Phase 4C.7-C Batch 3B)', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const TEMPLATE_TYPE = 'report_card';

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

  describe('getTemplate', () => {
    it('calls reportCardTemplateService.getReportCardTemplate and returns 200 success response', async () => {
      mockReq.params = { templateType: TEMPLATE_TYPE };
      const mockTemplate = {
        id: 'tpl-1',
        schoolId: SCHOOL_ID,
        templateType: TEMPLATE_TYPE,
        config: { themeColor: '#3b82f6' },
        isDefault: false
      };

      const spy = vi.spyOn(reportCardTemplateService, 'getReportCardTemplate').mockResolvedValue(mockTemplate);

      await reportCardTemplateController.getTemplate(mockReq, mockRes, mockNext);

      expect(spy).toHaveBeenCalledWith(SCHOOL_ID, TEMPLATE_TYPE, mockActor);
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Report card template retrieved successfully',
          data: mockTemplate
        })
      );
    });

    it('defaults templateType to "report_card" if omitted in params', async () => {
      mockReq.params = {};
      const mockTemplate = {
        templateType: 'report_card',
        config: { themeColor: '#3b82f6' }
      };

      const spy = vi.spyOn(reportCardTemplateService, 'getReportCardTemplate').mockResolvedValue(mockTemplate);

      await reportCardTemplateController.getTemplate(mockReq, mockRes, mockNext);

      expect(spy).toHaveBeenCalledWith(SCHOOL_ID, 'report_card', mockActor);
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it('catches and forwards errors to next(error)', async () => {
      const error = new Error('Template retrieval error');
      vi.spyOn(reportCardTemplateService, 'getReportCardTemplate').mockRejectedValue(error);

      await reportCardTemplateController.getTemplate(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('saveTemplate', () => {
    it('calls reportCardTemplateService.saveReportCardTemplate and returns 200 success response', async () => {
      const config = { themeColor: '#c99bc1', header: { title: 'PROGRESS REPORT' } };
      mockReq.params = { templateType: TEMPLATE_TYPE };
      mockReq.body = { config };

      const mockSaved = {
        id: 'tpl-1',
        schoolId: SCHOOL_ID,
        templateType: TEMPLATE_TYPE,
        config,
        isDefault: false
      };

      const spy = vi.spyOn(reportCardTemplateService, 'saveReportCardTemplate').mockResolvedValue(mockSaved);

      await reportCardTemplateController.saveTemplate(mockReq, mockRes, mockNext);

      expect(spy).toHaveBeenCalledWith(SCHOOL_ID, TEMPLATE_TYPE, config, mockActor);
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Report card template saved successfully',
          data: mockSaved
        })
      );
    });

    it('catches and forwards errors to next(error)', async () => {
      const error = new Error('Template save error');
      vi.spyOn(reportCardTemplateService, 'saveReportCardTemplate').mockRejectedValue(error);

      await reportCardTemplateController.saveTemplate(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('deleteTemplate', () => {
    it('calls reportCardTemplateService.deleteReportCardTemplate and returns 200 success response', async () => {
      mockReq.params = { templateType: TEMPLATE_TYPE };
      const mockResult = {
        message: 'Report card template reset to default successfully',
        templateType: TEMPLATE_TYPE
      };

      const spy = vi.spyOn(reportCardTemplateService, 'deleteReportCardTemplate').mockResolvedValue(mockResult);

      await reportCardTemplateController.deleteTemplate(mockReq, mockRes, mockNext);

      expect(spy).toHaveBeenCalledWith(SCHOOL_ID, TEMPLATE_TYPE, mockActor);
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Report card template reset to default successfully',
          data: mockResult
        })
      );
    });

    it('catches and forwards errors to next(error)', async () => {
      const error = new Error('Template delete error');
      vi.spyOn(reportCardTemplateService, 'deleteReportCardTemplate').mockRejectedValue(error);

      await reportCardTemplateController.deleteTemplate(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });
});
