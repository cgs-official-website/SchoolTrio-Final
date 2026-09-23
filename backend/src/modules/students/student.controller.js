import * as studentService from './student.service.js';
import { ApiResponse } from '../../utils/api-response.js';
import { HTTP_STATUS } from '../../config/constants.js';

/**
 * Student HTTP Controller Handlers
 */

/**
 * Lists all students for a tenant with pagination, searching, and filtering.
 * GET /api/v1/students
 */
export async function listStudents(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const { students, pagination } = await studentService.listStudents(schoolId, req.query);
    return ApiResponse.paginated(res, students, pagination, 'Students retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Retrieves a single student by ID.
 * GET /api/v1/students/:id
 */
export async function getStudent(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const student = await studentService.getStudentById(schoolId, req.params.id);
    return ApiResponse.success(res, student, 'Student retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Creates a new student.
 * POST /api/v1/students
 */
export async function createStudent(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const actor = req.user || req.auth;
    const createdStudent = await studentService.createStudent(schoolId, req.body, actor);
    return ApiResponse.success(res, createdStudent, 'Student created successfully', HTTP_STATUS.CREATED);
  } catch (error) {
    return next(error);
  }
}

/**
 * Updates a student.
 * PATCH /api/v1/students/:id
 */
export async function updateStudent(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const actor = req.user || req.auth;
    const updatedStudent = await studentService.updateStudent(schoolId, req.params.id, req.body, actor);
    return ApiResponse.success(res, updatedStudent, 'Student updated successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Deletes a student.
 * DELETE /api/v1/students/:id
 */
export async function deleteStudent(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const actor = req.user || req.auth;
    await studentService.deleteStudent(schoolId, req.params.id, actor);
    return ApiResponse.success(res, null, 'Student deleted successfully');
  } catch (error) {
    return next(error);
  }
}
