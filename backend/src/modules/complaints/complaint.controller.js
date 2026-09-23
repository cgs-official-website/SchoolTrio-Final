import { ApiResponse } from '../../utils/api-response.js';
import * as complaintService from './complaint.service.js';

/**
 * Retrieves the count of pending complaints for administrative backlog.
 * GET /api/v1/complaints/pending-count
 */
export async function getPendingComplaintsCount(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId || req.auth?.schoolId || req.schoolId;
    const actor = req.auth || req.user;

    const result = await complaintService.getPendingComplaintsCount(schoolId, actor);

    return ApiResponse.success(
      res,
      result,
      'Pending complaint count retrieved successfully'
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Lists complaints with pagination and optional filtering.
 * GET /api/v1/complaints
 */
export async function listComplaints(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const actor = req.auth || req.user;

    const result = await complaintService.listComplaints(schoolId, actor, req.query);

    return ApiResponse.paginated(
      res,
      result.data,
      result.pagination,
      'Complaints retrieved successfully'
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves a single complaint by ID.
 * GET /api/v1/complaints/:id
 */
export async function getComplaintById(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const { id } = req.params;
    const actor = req.auth || req.user;

    const result = await complaintService.getComplaintById(schoolId, id, actor);

    return ApiResponse.success(
      res,
      result,
      'Complaint retrieved successfully'
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Creates a new complaint.
 * POST /api/v1/complaints
 */
export async function createComplaint(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const actor = req.auth || req.user;

    const result = await complaintService.createComplaint(schoolId, actor, req.body);

    return ApiResponse.success(
      res,
      result,
      'Complaint created successfully',
      201
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Updates status and resolution of a complaint (resolve or reject).
 * PATCH /api/v1/complaints/:id/status
 */
export async function updateComplaintStatus(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const { id } = req.params;
    const actor = req.auth || req.user;

    const result = await complaintService.updateComplaintStatus(schoolId, id, actor, req.body);

    return ApiResponse.success(
      res,
      result,
      'Complaint status updated successfully'
    );
  } catch (err) {
    next(err);
  }
}

export const complaintController = {
  getPendingComplaintsCount,
  listComplaints,
  getComplaintById,
  createComplaint,
  updateComplaintStatus
};

export default complaintController;
