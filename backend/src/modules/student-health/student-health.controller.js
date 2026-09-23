import * as studentHealthService from './student-health.service.js';
import { ApiResponse } from '../../utils/api-response.js';

/**
 * Controller: Get a student's health record.
 * GET /api/v1/students/:id/health
 */
export const getStudentHealth = async (req, res, next) => {
  try {
    const schoolId = req.tenant?.schoolId;
    const studentId = req.params.id;
    const actor = req.auth || req.user || {};

    const health = await studentHealthService.getStudentHealth(schoolId, studentId, actor);
    return ApiResponse.success(res, health, 'Student health record retrieved successfully');
  } catch (err) {
    next(err);
  }
};

/**
 * Controller: Update a student's health record.
 * PATCH /api/v1/students/:id/health
 */
export const updateStudentHealth = async (req, res, next) => {
  try {
    const schoolId = req.tenant?.schoolId;
    const studentId = req.params.id;
    const actor = req.auth || req.user || {};

    const updated = await studentHealthService.updateStudentHealth(schoolId, studentId, req.body, actor);
    return ApiResponse.success(res, updated, 'Student health record updated successfully');
  } catch (err) {
    next(err);
  }
};
