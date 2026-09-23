import * as attendanceService from './attendance.service.js';
import { ApiResponse } from '../../utils/api-response.js';
import { HTTP_STATUS } from '../../config/constants.js';

/**
 * Attendance HTTP Controller Handlers
 */

/**
 * Lists paginated attendance sessions with filters.
 * GET /api/v1/attendance/sessions
 */
export async function listSessions(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const { sessions, pagination } = await attendanceService.listSessions(schoolId, req.query);
    return ApiResponse.paginated(res, sessions, pagination, 'Attendance sessions retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Retrieves a single attendance session with student records.
 * GET /api/v1/attendance/sessions/:id
 */
export async function getSession(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const session = await attendanceService.getSessionById(schoolId, req.params.id);
    return ApiResponse.success(res, session, 'Attendance session retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Submits or upserts an attendance session for a class.
 * POST /api/v1/attendance/sessions
 */
export async function createSession(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const actor = req.user || req.auth;
    const session = await attendanceService.submitAttendanceSession(schoolId, req.body, actor);
    return ApiResponse.success(res, session, 'Attendance session recorded successfully', HTTP_STATUS.CREATED);
  } catch (error) {
    return next(error);
  }
}

/**
 * Updates student records in an existing attendance session.
 * PATCH /api/v1/attendance/sessions/:id
 */
export async function updateSession(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const actor = req.user || req.auth;
    const updated = await attendanceService.updateAttendanceSession(schoolId, req.params.id, req.body, actor);
    return ApiResponse.success(res, updated, 'Attendance session updated successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Voids / deletes an attendance session (Admin only).
 * DELETE /api/v1/attendance/sessions/:id
 */
export async function deleteSession(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const actor = req.user || req.auth;
    await attendanceService.deleteAttendanceSession(schoolId, req.params.id, actor);
    return ApiResponse.success(res, null, 'Attendance session deleted successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Retrieves daily dashboard attendance metrics.
 * GET /api/v1/attendance/dashboard-stats
 */
export async function getDashboardStats(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const stats = await attendanceService.getDashboardStats(schoolId, req.query.date);
    return ApiResponse.success(res, stats, 'Attendance dashboard stats retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Retrieves detailed student attendance timeline and cumulative statistics.
 * GET /api/v1/attendance/students/:studentId
 */
export async function getStudentAttendance(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const requester = req.user || req.auth;
    const result = await attendanceService.getStudentAttendance(schoolId, req.params.studentId, req.query, requester);
    return ApiResponse.success(res, result, 'Student attendance retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Lists absentee flags.
 * GET /api/v1/attendance/absentee-flags
 */
export async function listAbsenteeFlags(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const { flags, pagination } = await attendanceService.listAbsenteeFlags(schoolId, req.query);
    return ApiResponse.paginated(res, flags, pagination, 'Absentee flags retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Resolves an absentee flag.
 * PATCH /api/v1/attendance/absentee-flags/:id/resolve
 */
export async function resolveAbsenteeFlag(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const actor = req.user || req.auth;
    const updated = await attendanceService.resolveAbsenteeFlag(schoolId, req.params.id, req.body, actor);
    return ApiResponse.success(res, updated, 'Absentee flag resolved successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Retrieves attendance configuration settings for tenant.
 * GET /api/v1/attendance/settings
 */
export async function getSettings(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const settings = await attendanceService.getAttendanceSettings(schoolId);
    return ApiResponse.success(res, settings, 'Attendance settings retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Updates attendance configuration settings for tenant.
 * PATCH /api/v1/attendance/settings
 */
export async function updateSettings(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const actor = req.user || req.auth;
    const updated = await attendanceService.updateAttendanceSettings(schoolId, req.body, actor);
    return ApiResponse.success(res, updated, 'Attendance settings updated successfully');
  } catch (error) {
    return next(error);
  }
}

