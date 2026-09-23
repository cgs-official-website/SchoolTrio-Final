import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as lessonPlanController from '../../../src/modules/lesson-plans/lesson-plan.controller.js';
import * as lessonPlanService from '../../../src/modules/lesson-plans/lesson-plan.service.js';

describe('Lesson Plan Controller Unit Tests', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const PLAN_ID = '22222222-2222-4222-8222-222222222222';
  const ACTOR = { id: 'user-1', email: 'teacher@school.com', systemRole: 'TEACHER' };

  let mockReq;
  let mockRes;
  let nextFn;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockReq = {
      tenant: { schoolId: SCHOOL_ID },
      user: ACTOR,
      params: {},
      query: {},
      body: {}
    };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };
    nextFn = vi.fn();
  });

  describe('listLessonPlans', () => {
    it('returns 200 with list data and pagination metadata', async () => {
      const mockResult = {
        data: [{ id: PLAN_ID, topic: 'Calculus' }],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false
        }
      };

      vi.spyOn(lessonPlanService, 'listLessonPlans').mockResolvedValue(mockResult);

      await lessonPlanController.listLessonPlans(mockReq, mockRes, nextFn);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: mockResult.data,
          pagination: expect.objectContaining({
            total: 1,
            limit: 20,
            page: 1
          })
        })
      );
    });

    it('passes error to next on failure', async () => {
      const error = new Error('Service error');
      vi.spyOn(lessonPlanService, 'listLessonPlans').mockRejectedValue(error);

      await lessonPlanController.listLessonPlans(mockReq, mockRes, nextFn);

      expect(nextFn).toHaveBeenCalledWith(error);
    });
  });

  describe('getLessonPlanById', () => {
    it('returns 200 with single lesson plan DTO', async () => {
      const mockDto = { id: PLAN_ID, topic: 'Geometry' };
      mockReq.params = { id: PLAN_ID };

      vi.spyOn(lessonPlanService, 'getLessonPlanById').mockResolvedValue(mockDto);

      await lessonPlanController.getLessonPlanById(mockReq, mockRes, nextFn);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: mockDto
        })
      );
    });

    it('passes error to next on failure', async () => {
      const error = new Error('Not found');
      mockReq.params = { id: PLAN_ID };
      vi.spyOn(lessonPlanService, 'getLessonPlanById').mockRejectedValue(error);

      await lessonPlanController.getLessonPlanById(mockReq, mockRes, nextFn);

      expect(nextFn).toHaveBeenCalledWith(error);
    });
  });

  describe('createLessonPlan', () => {
    it('returns 201 with created lesson plan', async () => {
      const mockCreated = { id: PLAN_ID, topic: 'New Topic' };
      mockReq.body = { topic: 'New Topic' };

      vi.spyOn(lessonPlanService, 'createLessonPlan').mockResolvedValue(mockCreated);

      await lessonPlanController.createLessonPlan(mockReq, mockRes, nextFn);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: mockCreated
        })
      );
    });
  });

  describe('updateLessonPlan', () => {
    it('returns 200 with updated lesson plan', async () => {
      const mockUpdated = { id: PLAN_ID, topic: 'Updated Topic' };
      mockReq.params = { id: PLAN_ID };
      mockReq.body = { topic: 'Updated Topic' };

      vi.spyOn(lessonPlanService, 'updateLessonPlan').mockResolvedValue(mockUpdated);

      await lessonPlanController.updateLessonPlan(mockReq, mockRes, nextFn);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: mockUpdated
        })
      );
    });
  });

  describe('deleteLessonPlan', () => {
    it('returns 200 with success message', async () => {
      mockReq.params = { id: PLAN_ID };
      vi.spyOn(lessonPlanService, 'deleteLessonPlan').mockResolvedValue({
        success: true,
        message: 'Lesson plan deleted successfully'
      });

      await lessonPlanController.deleteLessonPlan(mockReq, mockRes, nextFn);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Lesson plan deleted successfully'
        })
      );
    });
  });
});
