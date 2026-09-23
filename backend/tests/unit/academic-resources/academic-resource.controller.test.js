import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as academicResourceController from '../../../src/modules/academic-resources/academic-resource.controller.js';
import * as academicResourceService from '../../../src/modules/academic-resources/academic-resource.service.js';

describe('Academic Resource Controller', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const RESOURCE_ID = '22222222-2222-4222-8222-222222222222';
  const USER_ID = '33333333-3333-4333-8333-333333333333';

  let mockReq;
  let mockRes;
  let next;

  beforeEach(() => {
    vi.restoreAllMocks();

    mockReq = {
      tenant: { schoolId: SCHOOL_ID },
      user: { id: USER_ID, role: 'TEACHER' },
      query: {},
      params: {},
      body: {}
    };

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };

    next = vi.fn();
  });

  describe('listAcademicResources', () => {
    it('returns paginated response with 200 status', async () => {
      const mockResult = {
        data: [{ id: RESOURCE_ID, title: 'Sample' }],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
      };
      vi.spyOn(academicResourceService, 'listAcademicResources').mockResolvedValue(mockResult);

      await academicResourceController.listAcademicResources(mockReq, mockRes, next);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: mockResult.data
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('propagates errors to next()', async () => {
      const err = new Error('Service error');
      vi.spyOn(academicResourceService, 'listAcademicResources').mockRejectedValue(err);

      await academicResourceController.listAcademicResources(mockReq, mockRes, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('getAcademicResourceById', () => {
    it('returns resource DTO with 200 status', async () => {
      mockReq.params = { id: RESOURCE_ID };
      const mockDto = { id: RESOURCE_ID, title: 'Sample' };
      vi.spyOn(academicResourceService, 'getAcademicResourceById').mockResolvedValue(mockDto);

      await academicResourceController.getAcademicResourceById(mockReq, mockRes, next);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: mockDto
        })
      );
    });

    it('propagates error when lookup fails', async () => {
      mockReq.params = { id: RESOURCE_ID };
      const err = new Error('Not found');
      vi.spyOn(academicResourceService, 'getAcademicResourceById').mockRejectedValue(err);

      await academicResourceController.getAcademicResourceById(mockReq, mockRes, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('createAcademicResource', () => {
    it('creates resource and returns 201 status', async () => {
      mockReq.body = { title: 'New Resource', classId: '44444444-4444-4444-8444-444444444444' };
      const mockCreated = { id: RESOURCE_ID, title: 'New Resource' };
      vi.spyOn(academicResourceService, 'createAcademicResource').mockResolvedValue(mockCreated);

      await academicResourceController.createAcademicResource(mockReq, mockRes, next);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: mockCreated
        })
      );
    });
  });

  describe('updateAcademicResource', () => {
    it('updates resource and returns 200 status', async () => {
      mockReq.params = { id: RESOURCE_ID };
      mockReq.body = { title: 'Updated Title' };
      const mockUpdated = { id: RESOURCE_ID, title: 'Updated Title' };
      vi.spyOn(academicResourceService, 'updateAcademicResource').mockResolvedValue(mockUpdated);

      await academicResourceController.updateAcademicResource(mockReq, mockRes, next);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: mockUpdated
        })
      );
    });
  });

  describe('deleteAcademicResource', () => {
    it('deletes resource and returns 200 status', async () => {
      mockReq.params = { id: RESOURCE_ID };
      vi.spyOn(academicResourceService, 'deleteAcademicResource').mockResolvedValue({
        success: true,
        message: 'Academic resource deleted successfully'
      });

      await academicResourceController.deleteAcademicResource(mockReq, mockRes, next);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Academic resource deleted successfully'
        })
      );
    });
  });
});
