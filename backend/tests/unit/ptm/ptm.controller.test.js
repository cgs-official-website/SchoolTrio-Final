import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as ptmController from '../../../src/modules/ptm/ptm.controller.js';
import * as ptmService from '../../../src/modules/ptm/ptm.service.js';
import { HTTP_STATUS } from '../../../src/config/constants.js';

vi.mock('../../../src/modules/ptm/ptm.service.js');

describe('Unit: PTM Controller Tests', () => {
  let req, res, next;

  beforeEach(() => {
    vi.clearAllMocks();
    req = {
      schoolId: '11111111-1111-4111-8111-111111111111',
      auth: {
        userId: '22222222-2222-4222-8222-222222222222',
        role: 'TEACHER'
      },
      params: {},
      query: {},
      body: {}
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };
    next = vi.fn();
  });

  it('listTeacherPtms returns 200 with formatted data and pagination', async () => {
    const mockResult = {
      data: [{ id: 'ptm-1', studentName: 'Alex' }],
      pagination: { page: 1, limit: 50, total: 1 }
    };
    ptmService.listTeacherPtms.mockResolvedValue(mockResult);

    await ptmController.listTeacherPtms(req, res, next);

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      ...mockResult
    });
  });

  it('listStudentPtms returns 200 with formatted data and pagination', async () => {
    req.params.studentId = '33333333-3333-4333-8333-333333333333';
    const mockResult = {
      data: [{ id: 'ptm-1', studentName: 'Alex' }],
      pagination: { page: 1, limit: 50, total: 1 }
    };
    ptmService.listStudentPtms.mockResolvedValue(mockResult);

    await ptmController.listStudentPtms(req, res, next);

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      ...mockResult
    });
  });

  it('getPtmById returns 200 with single appointment data', async () => {
    req.params.id = 'ptm-1';
    const mockResult = { id: 'ptm-1', studentName: 'Alex' };
    ptmService.getPtmById.mockResolvedValue(mockResult);

    await ptmController.getPtmById(req, res, next);

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: mockResult
    });
  });

  it('createPtm returns 201 with created appointment data', async () => {
    req.body = { studentId: 'student-1', date: '2026-09-20', timeSlot: '10:00 AM' };
    const mockResult = { id: 'ptm-1', status: 'Confirmed' };
    ptmService.createPtm.mockResolvedValue(mockResult);

    await ptmController.createPtm(req, res, next);

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.CREATED);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: mockResult
    });
  });

  it('updatePtmStatus returns 200 with updated appointment data', async () => {
    req.params.id = 'ptm-1';
    req.body = { status: 'Cancelled' };
    const mockResult = { id: 'ptm-1', status: 'Cancelled' };
    ptmService.updatePtmStatus.mockResolvedValue(mockResult);

    await ptmController.updatePtmStatus(req, res, next);

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: mockResult
    });
  });

  it('cancelPtm returns 200 with cancellation message', async () => {
    req.params.id = 'ptm-1';
    const mockResult = { message: 'PTM appointment successfully cancelled', id: 'ptm-1', status: 'Cancelled' };
    ptmService.cancelPtm.mockResolvedValue(mockResult);

    await ptmController.cancelPtm(req, res, next);

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      ...mockResult
    });
  });

  it('calls next with error if service throws', async () => {
    const error = new Error('Service error');
    ptmService.listTeacherPtms.mockRejectedValue(error);

    await ptmController.listTeacherPtms(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});
