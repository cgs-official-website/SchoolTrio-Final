import * as registrationService from './registration.service.js';
import { ApiResponse } from '../../utils/api-response.js';
import { HTTP_STATUS } from '../../config/constants.js';

/**
 * Registration Controller Layer
 * Handles incoming public registration HTTP requests and delegates to registration service.
 */

/**
 * 1. POST /api/v1/public/schools/register
 */
export async function registerSchool(req, res, next) {
  try {
    const result = await registrationService.registerSchool(req.body);
    return ApiResponse.success(
      res,
      result,
      'School registered successfully. Your registration is currently under review.',
      HTTP_STATUS.CREATED
    );
  } catch (err) {
    next(err);
  }
}

/**
 * 2. POST /api/v1/public/teachers/register (or /api/v1/public/teacher-registration)
 */
export async function registerTeacher(req, res, next) {
  try {
    const result = await registrationService.registerTeacher(req.body);
    return ApiResponse.success(
      res,
      result,
      'Staff account successfully registered and activated. You may now log in.',
      HTTP_STATUS.OK
    );
  } catch (err) {
    next(err);
  }
}

/**
 * 3. POST /api/v1/public/parents/register (or /api/v1/public/parent-registration)
 */
export async function registerParent(req, res, next) {
  try {
    const result = await registrationService.registerParent(req.body);
    return ApiResponse.success(
      res,
      result,
      'Parent account registered and student linked successfully. You may now log in.',
      HTTP_STATUS.CREATED
    );
  } catch (err) {
    next(err);
  }
}
