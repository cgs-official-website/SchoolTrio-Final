import { ApiResponse } from '../../utils/api-response.js';
import * as canteenService from './canteen.service.js';

/**
 * Retrieves the count of pending canteen meal requests for administrative/staff backlog.
 * GET /api/v1/canteen/pending-count
 */
export async function getPendingCanteenCount(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId || req.auth?.schoolId || req.schoolId;
    const actor = req.auth || req.user;

    const result = await canteenService.getPendingCanteenCount(schoolId, actor);

    return ApiResponse.success(
      res,
      result,
      'Pending canteen request count retrieved successfully'
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Lists canteen meal requests for the tenant.
 * GET /api/v1/canteen/requests
 */
export async function listCanteenRequests(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const actor = req.auth || req.user;

    const requests = await canteenService.listCanteenRequests(schoolId, req.query, actor);

    res.status(200).json({
      status: 'success',
      data: requests
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Creates a new canteen meal request.
 * POST /api/v1/canteen/requests
 */
export async function createCanteenRequest(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const actor = req.auth || req.user;

    const request = await canteenService.createCanteenRequest(schoolId, req.body, actor);

    res.status(201).json({
      status: 'success',
      message: 'Canteen meal request created successfully',
      data: request
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Updates status of a canteen meal request.
 * PATCH /api/v1/canteen/requests/:id/status
 */
export async function updateCanteenRequestStatus(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const { id } = req.params;
    const actor = req.auth || req.user;

    const request = await canteenService.updateCanteenRequestStatus(schoolId, id, req.body, actor);

    res.status(200).json({
      status: 'success',
      message: 'Canteen request status updated successfully',
      data: request
    });
  } catch (err) {
    next(err);
  }
}

export const canteenController = {
  getPendingCanteenCount,
  listCanteenRequests,
  createCanteenRequest,
  updateCanteenRequestStatus
};

export default canteenController;
