import { ApiResponse } from '../../utils/api-response.js';
import { HTTP_STATUS } from '../../config/constants.js';
import * as homeworkService from './homework.service.js';

/**
 * Lists homework assignments for staff/admin.
 * GET /api/v1/homework
 */
export async function listHomework(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId || req.auth?.schoolId || req.schoolId;
    const actor = req.auth || req.user;

    const result = await homeworkService.listHomework(schoolId, req.query, actor);

    return ApiResponse.paginated(
      res,
      result.homeworks,
      result.pagination,
      'Homework assignments retrieved successfully'
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Gets unread/new homework count for authenticated user.
 * GET /api/v1/homework/unread-count
 */
export async function getUnreadHomeworkCount(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId || req.auth?.schoolId || req.schoolId;
    const actor = req.auth || req.user;
    const since = req.query?.since;

    const result = await homeworkService.getUnreadHomeworkCount(schoolId, since, actor);

    return ApiResponse.success(
      res,
      result,
      'Unread homework count retrieved successfully'
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Gets a single homework assignment with full student submission roster.
 * GET /api/v1/homework/:id
 */
export async function getHomeworkById(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId || req.auth?.schoolId || req.schoolId;
    const homeworkId = req.params.id;
    const actor = req.auth || req.user;

    const result = await homeworkService.getHomeworkById(schoolId, homeworkId, actor);

    return ApiResponse.success(
      res,
      result,
      'Homework assignment retrieved successfully'
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Creates a new homework assignment.
 * POST /api/v1/homework
 */
export async function createHomework(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId || req.auth?.schoolId || req.schoolId;
    const actor = req.auth || req.user;

    const result = await homeworkService.createHomework(schoolId, req.body, actor);

    return ApiResponse.success(
      res,
      result,
      'Homework assignment created successfully',
      HTTP_STATUS.CREATED
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Updates an existing homework assignment.
 * PUT /api/v1/homework/:id
 */
export async function updateHomework(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId || req.auth?.schoolId || req.schoolId;
    const homeworkId = req.params.id;
    const actor = req.auth || req.user;

    const result = await homeworkService.updateHomework(schoolId, homeworkId, req.body, actor);

    return ApiResponse.success(
      res,
      result,
      'Homework assignment updated successfully'
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Deletes a homework assignment.
 * DELETE /api/v1/homework/:id
 */
export async function deleteHomework(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId || req.auth?.schoolId || req.schoolId;
    const homeworkId = req.params.id;
    const actor = req.auth || req.user;

    const result = await homeworkService.deleteHomework(schoolId, homeworkId, actor);

    return ApiResponse.success(
      res,
      result,
      'Homework assignment deleted successfully'
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Staff updates/evaluates a student's submission.
 * PATCH /api/v1/homework/:id/submissions/:studentId
 */
export async function updateStaffSubmission(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId || req.auth?.schoolId || req.schoolId;
    const homeworkId = req.params.id;
    const studentId = req.params.studentId;
    const actor = req.auth || req.user;

    const result = await homeworkService.updateStaffSubmission(
      schoolId,
      homeworkId,
      studentId,
      req.body,
      actor
    );

    return ApiResponse.success(
      res,
      result,
      'Submission evaluated successfully'
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Lists student-scoped homework assignments for parent/student view.
 * GET /api/v1/students/:studentId/homework
 */
export async function getStudentHomework(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId || req.auth?.schoolId || req.schoolId;
    const studentId = req.params.studentId;
    const actor = req.auth || req.user;

    const result = await homeworkService.getStudentHomework(schoolId, studentId, req.query, actor);

    return ApiResponse.paginated(
      res,
      result.homeworks,
      result.pagination,
      'Student homework retrieved successfully'
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Parent updates student homework status.
 * PATCH /api/v1/students/:studentId/homework/:homeworkId/status
 */
export async function updateStudentHomeworkStatus(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId || req.auth?.schoolId || req.schoolId;
    const studentId = req.params.studentId;
    const homeworkId = req.params.homeworkId;
    const actor = req.auth || req.user;

    const result = await homeworkService.updateStudentHomeworkStatus(
      schoolId,
      studentId,
      homeworkId,
      req.body,
      actor
    );

    return ApiResponse.success(
      res,
      result,
      'Homework status updated successfully'
    );
  } catch (err) {
    next(err);
  }
}
