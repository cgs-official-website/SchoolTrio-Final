import { ApiResponse } from '../../utils/api-response.js';
import { HTTP_STATUS } from '../../config/constants.js';
import * as noticeService from './notice.service.js';

/**
 * Lists notices for the authenticated user based on role and query filters.
 * GET /api/v1/notices
 */
export async function listNotices(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId || req.auth?.schoolId || req.schoolId;
    const actor = req.auth || req.user;

    const result = await noticeService.listNotices(schoolId, req.query, actor);

    return ApiResponse.paginated(
      res,
      result.notices,
      result.pagination,
      'Notices retrieved successfully'
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Gets a single notice by ID.
 * GET /api/v1/notices/:id
 */
export async function getNoticeById(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId || req.auth?.schoolId || req.schoolId;
    const noticeId = req.params.id;
    const actor = req.auth || req.user;

    const result = await noticeService.getNoticeById(schoolId, noticeId, actor);

    return ApiResponse.success(
      res,
      result,
      'Notice retrieved successfully'
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Creates a new notice document.
 * POST /api/v1/notices
 */
export async function createNotice(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId || req.auth?.schoolId || req.schoolId;
    const actor = req.auth || req.user;

    const result = await noticeService.createNotice(schoolId, req.body, actor);

    return ApiResponse.success(
      res,
      result,
      'Notice created successfully',
      HTTP_STATUS.CREATED
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Updates an existing notice.
 * PUT /api/v1/notices/:id or PATCH /api/v1/notices/:id
 */
export async function updateNotice(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId || req.auth?.schoolId || req.schoolId;
    const noticeId = req.params.id;
    const actor = req.auth || req.user;

    const result = await noticeService.updateNotice(schoolId, noticeId, req.body, actor);

    return ApiResponse.success(
      res,
      result,
      'Notice updated successfully'
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Deletes a notice.
 * DELETE /api/v1/notices/:id
 */
export async function deleteNotice(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId || req.auth?.schoolId || req.schoolId;
    const noticeId = req.params.id;
    const actor = req.auth || req.user;

    const result = await noticeService.deleteNotice(schoolId, noticeId, actor);

    return ApiResponse.success(
      res,
      result,
      'Notice deleted successfully'
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Records a read receipt for a notice.
 * POST /api/v1/notices/:id/view or PATCH /api/v1/notices/:id/view
 */
export async function markNoticeViewed(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId || req.auth?.schoolId || req.schoolId;
    const noticeId = req.params.id;
    const actor = req.auth || req.user;

    const result = await noticeService.recordNoticeView(schoolId, noticeId, actor);

    return ApiResponse.success(
      res,
      result,
      'Notice view recorded successfully'
    );
  } catch (err) {
    next(err);
  }
}
