import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as homeworkController from '../../../src/modules/homework/homework.controller.js';
import * as homeworkService from '../../../src/modules/homework/homework.service.js';
import { HTTP_STATUS } from '../../../src/config/constants.js';

vi.mock('../../../src/modules/homework/homework.service.js');

describe('Unit: Homework Controller Tests — Phase 4C.7-D.2-I-M.1', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const STUDENT_ID = '22222222-2222-4222-8222-222222222222';
  const HOMEWORK_ID = '33333333-3333-4333-8333-333333333333';

  let req, res, next;

  beforeEach(() => {
    vi.clearAllMocks();
    req = {
      tenant: { schoolId: SCHOOL_ID },
      auth: { id: 'user-1', schoolId: SCHOOL_ID, role: 'ADMIN' },
      query: {},
      params: {},
      body: {}
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };
    next = vi.fn();
  });

  it('listHomework returns paginated response', async () => {
    const mockData = {
      homeworks: [{ id: HOMEWORK_ID, title: 'Math HW' }],
      pagination: { total: 1, page: 1, limit: 20 }
    };
    homeworkService.listHomework.mockResolvedValue(mockData);

    await homeworkController.listHomework(req, res, next);

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: mockData.homeworks,
        pagination: expect.objectContaining({
          total: 1,
          page: 1,
          limit: 20
        })
      })
    );
  });

  it('createHomework returns created status', async () => {
    const mockCreated = { id: HOMEWORK_ID, title: 'Math HW' };
    homeworkService.createHomework.mockResolvedValue(mockCreated);
    req.body = { title: 'Math HW' };

    await homeworkController.createHomework(req, res, next);

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.CREATED);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: mockCreated
      })
    );
  });

  it('updateStudentHomeworkStatus returns updated status', async () => {
    req.params = { studentId: STUDENT_ID, homeworkId: HOMEWORK_ID };
    req.body = { status: 'Completed' };
    const mockUpdated = { id: 'sub-1', status: 'Completed' };
    homeworkService.updateStudentHomeworkStatus.mockResolvedValue(mockUpdated);

    await homeworkController.updateStudentHomeworkStatus(req, res, next);

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: mockUpdated
      })
    );
  });

  it('handles service errors via next()', async () => {
    const err = new Error('Database failure');
    homeworkService.listHomework.mockRejectedValue(err);

    await homeworkController.listHomework(req, res, next);

    expect(next).toHaveBeenCalledWith(err);
  });
});
