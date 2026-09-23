import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as canteenController from '../../../src/modules/canteen/canteen.controller.js';
import * as canteenService from '../../../src/modules/canteen/canteen.service.js';

describe('Canteen Controller Unit Tests (Phase CA.2)', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const REQUEST_ID = '33333333-3333-4333-8333-333333333333';
  const STUDENT_ID = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. getPendingCanteenCount', () => {
    it('calls service with schoolId from tenant context and returns success response', async () => {
      const serviceSpy = vi.spyOn(canteenService, 'getPendingCanteenCount').mockResolvedValue({ count: 6 });

      const req = {
        tenant: { schoolId: SCHOOL_ID },
        auth: { userId: 'user-1', systemRole: 'TEACHER' }
      };

      const jsonMock = vi.fn();
      const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
      const res = {
        status: statusMock,
        json: jsonMock
      };
      const next = vi.fn();

      await canteenController.getPendingCanteenCount(req, res, next);

      expect(serviceSpy).toHaveBeenCalledWith(SCHOOL_ID, req.auth);
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: { count: 6 }
      }));
      expect(next).not.toHaveBeenCalled();
    });

    it('calls next with error if service throws', async () => {
      const error = new Error('Service failure');
      vi.spyOn(canteenService, 'getPendingCanteenCount').mockRejectedValue(error);

      const req = {
        tenant: { schoolId: SCHOOL_ID },
        auth: { userId: 'user-1' }
      };
      const res = {};
      const next = vi.fn();

      await canteenController.getPendingCanteenCount(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('2. listCanteenRequests', () => {
    it('calls listCanteenRequests service and returns 200 with data', async () => {
      const mockList = [{ id: REQUEST_ID, status: 'Pending' }];
      const serviceSpy = vi.spyOn(canteenService, 'listCanteenRequests').mockResolvedValue(mockList);

      const req = {
        tenant: { schoolId: SCHOOL_ID },
        auth: { userId: 'user-1', systemRole: 'SCHOOL_ADMIN' },
        query: { status: 'Pending' }
      };

      const jsonMock = vi.fn();
      const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
      const res = { status: statusMock, json: jsonMock };
      const next = vi.fn();

      await canteenController.listCanteenRequests(req, res, next);

      expect(serviceSpy).toHaveBeenCalledWith(SCHOOL_ID, req.query, req.auth);
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith({
        status: 'success',
        data: mockList
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('3. createCanteenRequest', () => {
    it('calls createCanteenRequest service and returns 201 with created record', async () => {
      const mockCreated = { id: REQUEST_ID, status: 'Pending' };
      const serviceSpy = vi.spyOn(canteenService, 'createCanteenRequest').mockResolvedValue(mockCreated);

      const req = {
        tenant: { schoolId: SCHOOL_ID },
        auth: { userId: 'user-1', systemRole: 'PARENT' },
        body: { studentId: STUDENT_ID, mealType: 'Breakfast' }
      };

      const jsonMock = vi.fn();
      const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
      const res = { status: statusMock, json: jsonMock };
      const next = vi.fn();

      await canteenController.createCanteenRequest(req, res, next);

      expect(serviceSpy).toHaveBeenCalledWith(SCHOOL_ID, req.body, req.auth);
      expect(statusMock).toHaveBeenCalledWith(201);
      expect(jsonMock).toHaveBeenCalledWith({
        status: 'success',
        message: 'Canteen meal request created successfully',
        data: mockCreated
      });
    });
  });

  describe('4. updateCanteenRequestStatus', () => {
    it('calls updateCanteenRequestStatus service and returns 200 with updated record', async () => {
      const mockUpdated = { id: REQUEST_ID, status: 'Approved' };
      const serviceSpy = vi.spyOn(canteenService, 'updateCanteenRequestStatus').mockResolvedValue(mockUpdated);

      const req = {
        tenant: { schoolId: SCHOOL_ID },
        auth: { userId: 'user-1', systemRole: 'SCHOOL_ADMIN' },
        params: { id: REQUEST_ID },
        body: { status: 'Approved' }
      };

      const jsonMock = vi.fn();
      const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
      const res = { status: statusMock, json: jsonMock };
      const next = vi.fn();

      await canteenController.updateCanteenRequestStatus(req, res, next);

      expect(serviceSpy).toHaveBeenCalledWith(SCHOOL_ID, REQUEST_ID, req.body, req.auth);
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith({
        status: 'success',
        message: 'Canteen request status updated successfully',
        data: mockUpdated
      });
    });
  });
});
