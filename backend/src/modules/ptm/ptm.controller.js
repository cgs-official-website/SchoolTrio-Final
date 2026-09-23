import * as ptmService from './ptm.service.js';
import { HTTP_STATUS } from '../../config/constants.js';

/**
 * Controller for listing PTM appointments for teacher/class.
 * GET /api/v1/ptm/teacher
 */
export async function listTeacherPtms(req, res, next) {
  try {
    const actor = req.auth || req.user;
    const result = await ptmService.listTeacherPtms(req.schoolId, req.query, actor);
    return res.status(HTTP_STATUS.OK).json({
      success: true,
      ...result
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Controller for listing PTM appointments for a specific student (Parent or Staff).
 * GET /api/v1/ptm/student/:studentId
 */
export async function listStudentPtms(req, res, next) {
  try {
    const actor = req.auth || req.user;
    const result = await ptmService.listStudentPtms(
      req.schoolId,
      req.params.studentId,
      req.query,
      actor
    );
    return res.status(HTTP_STATUS.OK).json({
      success: true,
      ...result
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Controller for getting a single PTM appointment by ID.
 * GET /api/v1/ptm/:id
 */
export async function getPtmById(req, res, next) {
  try {
    const actor = req.auth || req.user;
    const result = await ptmService.getPtmById(req.schoolId, req.params.id, actor);
    return res.status(HTTP_STATUS.OK).json({
      success: true,
      data: result
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Controller for creating a new PTM appointment.
 * POST /api/v1/ptm
 */
export async function createPtm(req, res, next) {
  try {
    const actor = req.auth || req.user;
    const result = await ptmService.createPtm(req.schoolId, req.body, actor);
    return res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: result
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Controller for updating PTM appointment status.
 * PATCH /api/v1/ptm/:id/status
 */
export async function updatePtmStatus(req, res, next) {
  try {
    const actor = req.auth || req.user;
    const result = await ptmService.updatePtmStatus(
      req.schoolId,
      req.params.id,
      req.body,
      actor
    );
    return res.status(HTTP_STATUS.OK).json({
      success: true,
      data: result
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Controller for cancelling a PTM appointment.
 * DELETE /api/v1/ptm/:id
 */
export async function cancelPtm(req, res, next) {
  try {
    const actor = req.auth || req.user;
    const result = await ptmService.cancelPtm(req.schoolId, req.params.id, actor);
    return res.status(HTTP_STATUS.OK).json({
      success: true,
      ...result
    });
  } catch (error) {
    return next(error);
  }
}
