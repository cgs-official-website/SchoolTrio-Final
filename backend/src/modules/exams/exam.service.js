import * as examRepository from './exam.repository.js';
import { createAuditLog } from '../audit/audit.repository.js';
import { resolveAcademicYear } from '../attendance/attendance.service.js';
import {
  NotFoundError,
  ConflictError,
  TenantAccessError
} from '../../utils/app-error.js';
import { parsePagination, buildPaginationMetadata } from '../../utils/pagination.js';
import { logger } from '../../utils/logger.js';

/**
 * Examination Service
 * Business logic for formal examination schedules, verification, and audit tracking.
 */

/**
 * Lists examinations with pagination, search, and filtering.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {Object} query - Query parameters (search, term, academicYear, startDate, endDate, page, limit, sort, order)
 * @returns {Promise<{ exams: Array<Object>, pagination: Object }>}
 */
export async function listExams(schoolId, query = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to list examinations');
  }

  const paginationParams = parsePagination(query, {
    defaultSort: 'createdAt',
    defaultOrder: 'desc'
  });

  const filterOptions = {
    search: query.search ? query.search.trim() : undefined,
    term: query.term ? query.term.trim() : undefined,
    academicYear: query.academicYear ? query.academicYear.trim() : undefined,
    startDate: query.startDate,
    endDate: query.endDate
  };

  const paginationOptions = {
    page: paginationParams.page,
    limit: paginationParams.limit,
    skip: paginationParams.skip,
    sort: paginationParams.sort,
    order: paginationParams.order
  };

  const result = await examRepository.findExams(schoolId, filterOptions, paginationOptions);
  const pagination = buildPaginationMetadata(result.total, paginationParams.page, paginationParams.limit);

  return {
    exams: result.items,
    pagination
  };
}

/**
 * Retrieves a single examination record by ID.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} id - Examination UUID
 * @returns {Promise<Object>}
 */
export async function getExamById(schoolId, id) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to get examination');
  }

  const exam = await examRepository.findExamById(schoolId, id);
  if (!exam) {
    throw new NotFoundError(`Examination with ID '${id}' not found`);
  }

  return exam;
}

/**
 * Creates a new examination record for a school tenant.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {Object} data - Examination data (name, term, academicYear, startDate, endDate)
 * @param {string} userId - Authenticated user UUID for audit logging
 * @returns {Promise<Object>}
 */
export async function createExam(schoolId, data, userId = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to create examination');
  }

  // 1. Resolve Academic Year (Explicit -> SchoolSetting -> Date-derived fallback)
  const academicYear = await resolveAcademicYear(schoolId, data.academicYear, data.startDate);

  // 2. Resolve Term (Explicit -> stored as supplied; omitted -> null)
  const term = data.term !== undefined && data.term !== null && data.term.trim() ? data.term.trim() : null;

  // 3. Create Examination
  const exam = await examRepository.createExam(schoolId, {
    name: data.name.trim(),
    term,
    academicYear,
    startDate: data.startDate || null,
    endDate: data.endDate || null
  });

  // 4. Non-blocking Audit Logging
  try {
    if (userId) {
      await createAuditLog({
        schoolId,
        userId,
        action: 'CREATE_EXAM',
        resource: 'Examination',
        resourceId: exam.id,
        details: {
          name: exam.name,
          term: exam.term,
          academicYear: exam.academicYear,
          startDate: exam.startDate,
          endDate: exam.endDate
        }
      });
    }
  } catch (auditErr) {
    logger.warn({ msg: '[AUDIT LOG WARNING] Failed to record exam creation audit log', error: auditErr.message });
  }

  return exam;
}

/**
 * Updates an existing examination record.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} id - Examination UUID
 * @param {Object} data - Partial examination attributes to update
 * @param {string} userId - Authenticated user UUID for audit logging
 * @returns {Promise<Object>}
 */
export async function updateExam(schoolId, id, data, userId = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to update examination');
  }

  const existing = await examRepository.findExamById(schoolId, id);
  if (!existing) {
    throw new NotFoundError(`Examination with ID '${id}' not found`);
  }

  // Merge dates for validation if only one date is being updated
  const updatedStartDate = data.startDate !== undefined ? data.startDate : existing.startDate;
  const updatedEndDate = data.endDate !== undefined ? data.endDate : existing.endDate;
  if (updatedStartDate && updatedEndDate && updatedStartDate > updatedEndDate) {
    throw new ConflictError('Start date cannot be after end date');
  }

  const updatePayload = {};
  if (data.name !== undefined) updatePayload.name = data.name.trim();
  if (data.term !== undefined) updatePayload.term = data.term.trim();
  if (data.academicYear !== undefined) updatePayload.academicYear = data.academicYear.trim();
  if (data.startDate !== undefined) updatePayload.startDate = data.startDate;
  if (data.endDate !== undefined) updatePayload.endDate = data.endDate;

  const updatedExam = await examRepository.updateExam(schoolId, id, updatePayload);

  // Non-blocking Audit Logging
  try {
    if (userId) {
      await createAuditLog({
        schoolId,
        userId,
        action: 'UPDATE_EXAM',
        resource: 'Examination',
        resourceId: updatedExam.id,
        details: {
          updatedFields: Object.keys(updatePayload),
          previous: {
            name: existing.name,
            term: existing.term,
            academicYear: existing.academicYear
          },
          current: {
            name: updatedExam.name,
            term: updatedExam.term,
            academicYear: updatedExam.academicYear
          }
        }
      });
    }
  } catch (auditErr) {
    logger.warn({ msg: '[AUDIT LOG WARNING] Failed to record exam update audit log', error: auditErr.message });
  }

  return updatedExam;
}

/**
 * Deletes an examination record safely.
 * Rejects deletion with 409 Conflict if dependent assessments exist.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} id - Examination UUID
 * @param {string} userId - Authenticated user UUID for audit logging
 * @returns {Promise<{ message: string, id: string }>}
 */
export async function deleteExam(schoolId, id, userId = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to delete examination');
  }

  const existing = await examRepository.findExamById(schoolId, id);
  if (!existing) {
    throw new NotFoundError(`Examination with ID '${id}' not found`);
  }

  // Safety check: ensure no linked assessments exist
  const dependentAssessmentsCount = await examRepository.countDependentAssessments(schoolId, id);
  if (dependentAssessmentsCount > 0) {
    throw new ConflictError(
      `Cannot delete examination '${existing.name}': ${dependentAssessmentsCount} assessment(s) are linked to it`
    );
  }

  await examRepository.deleteExam(schoolId, id);

  // Non-blocking Audit Logging
  try {
    if (userId) {
      await createAuditLog({
        schoolId,
        userId,
        action: 'DELETE_EXAM',
        resource: 'Examination',
        resourceId: id,
        details: {
          name: existing.name,
          term: existing.term,
          academicYear: existing.academicYear
        }
      });
    }
  } catch (auditErr) {
    logger.warn({ msg: '[AUDIT LOG WARNING] Failed to record exam deletion audit log', error: auditErr.message });
  }

  return {
    message: 'Examination deleted successfully',
    id
  };
}
