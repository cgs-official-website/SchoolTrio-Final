import * as assessmentRepository from './assessment.repository.js';
import { findChildrenByParentUserId } from '../parents/parent.repository.js';
import { createAuditLog } from '../audit/audit.repository.js';
import {
  NotFoundError,
  ConflictError,
  ForbiddenError,
  TenantAccessError
} from '../../utils/app-error.js';
import { SYSTEM_ROLES } from '../../config/constants.js';
import { parsePagination, buildPaginationMetadata } from '../../utils/pagination.js';
import { logger } from '../../utils/logger.js';

/**
 * Assessment Service
 * Business logic for formative, continuous, and exam-linked assessments,
 * including class-based teacher authorization, deletion safety, and audit tracking.
 */

/**
 * Verifies whether an authenticated user is authorized to manage assessments for a specific class.
 * Teachers are restricted strictly to their assigned class.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} classId - Class UUID
 * @param {Object} actor - Authenticated user identity ({ id, userId, systemRole, role })
 */
async function authorizeClassAccess(schoolId, classId, actor) {
  if (!actor) return;

  const role = (actor.systemRole || actor.role || '').toUpperCase();
  if (role === SYSTEM_ROLES.TEACHER || role === 'TEACHER') {
    const userId = actor.id || actor.userId;
    const profile = await assessmentRepository.findStaffProfileByUserId(schoolId, userId);

    if (!profile || profile.assignedClassId !== classId) {
      throw new ForbiddenError('Teachers are only authorized to manage assessments for their assigned class');
    }
  }
}

/**
 * Lists assessments with pagination, search, and filtering.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {Object} query - Query parameters (classId, examId, subjectId, search, date, page, limit, sort, order)
 * @param {Object} actor - Authenticated user identity
 * @returns {Promise<{ assessments: Array<Object>, pagination: Object }>}
 */
export async function listAssessments(schoolId, query = {}, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to list assessments');
  }

  // If teacher, enforce assigned class filter
  const role = actor ? (actor.systemRole || actor.role || '').toUpperCase() : '';
  let effectiveClassId = query.classId;

  if (role === SYSTEM_ROLES.TEACHER || role === 'TEACHER') {
    const userId = actor.id || actor.userId;
    const profile = await assessmentRepository.findStaffProfileByUserId(schoolId, userId);
    if (!profile || !profile.assignedClassId) {
      return {
        assessments: [],
        pagination: buildPaginationMetadata(0, 1, 20)
      };
    }
    // Restrict teacher querying to their assigned class
    if (effectiveClassId && effectiveClassId !== profile.assignedClassId) {
      throw new ForbiddenError('Teachers can only access assessments for their assigned class');
    }
    effectiveClassId = profile.assignedClassId;
  }

  // If parent, restrict to classes where parent has an active linked child
  if (role === SYSTEM_ROLES.PARENT || role === 'PARENT') {
    const userId = actor.id || actor.userId;
    const childrenLinks = await findChildrenByParentUserId(userId, schoolId);
    if (!childrenLinks || childrenLinks.length === 0) {
      return {
        assessments: [],
        pagination: buildPaginationMetadata(0, 1, 20)
      };
    }

    const linkedClassIds = [...new Set(childrenLinks.map(c => c.student?.classId).filter(Boolean))];
    if (linkedClassIds.length === 0) {
      return {
        assessments: [],
        pagination: buildPaginationMetadata(0, 1, 20)
      };
    }

    if (query.classId) {
      if (!linkedClassIds.includes(query.classId)) {
        throw new ForbiddenError('Access denied: You do not have a linked student in this class');
      }
      effectiveClassId = query.classId;
    } else {
      effectiveClassId = { in: linkedClassIds };
    }
  }

  const paginationParams = parsePagination(query, {
    defaultSort: 'createdAt',
    defaultOrder: 'desc'
  });

  const filterOptions = {
    classId: effectiveClassId,
    examId: query.examId,
    subjectId: query.subjectId,
    search: query.search ? query.search.trim() : undefined,
    date: query.date
  };

  const paginationOptions = {
    page: paginationParams.page,
    limit: paginationParams.limit,
    skip: paginationParams.skip,
    sort: paginationParams.sort,
    order: paginationParams.order
  };

  const result = await assessmentRepository.findAssessments(schoolId, filterOptions, paginationOptions);
  const pagination = buildPaginationMetadata(result.total, paginationParams.page, paginationParams.limit);

  return {
    assessments: result.items,
    pagination
  };
}

/**
 * Retrieves a single assessment record by ID.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} id - Assessment UUID
 * @param {Object} actor - Authenticated user identity
 * @returns {Promise<Object>}
 */
export async function getAssessmentById(schoolId, id, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to get assessment');
  }

  const assessment = await assessmentRepository.findAssessmentById(schoolId, id);
  if (!assessment) {
    throw new NotFoundError(`Assessment with ID '${id}' not found`);
  }

  if (actor) {
    const role = (actor.systemRole || actor.role || '').toUpperCase();
    if (role === SYSTEM_ROLES.TEACHER || role === 'TEACHER') {
      await authorizeClassAccess(schoolId, assessment.classId, actor);
    }
    if (role === SYSTEM_ROLES.PARENT || role === 'PARENT') {
      const userId = actor.id || actor.userId;
      const childrenLinks = await findChildrenByParentUserId(userId, schoolId);
      const linkedClassIds = (childrenLinks || []).map(c => c.student?.classId).filter(Boolean);
      if (!linkedClassIds.includes(assessment.classId)) {
        throw new ForbiddenError('Access denied: You do not have a linked student in this assessment\'s class');
      }
    }
  }

  return assessment;
}

/**
 * Creates a new assessment record.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {Object} data - Assessment data (title, classId, totalMarks, passingMarks, date, examId, subjectId)
 * @param {Object} actor - Authenticated user identity for authorization and audit
 * @returns {Promise<Object>}
 */
export async function createAssessment(schoolId, data, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to create assessment');
  }

  // 1. Authorize class access for teachers
  await authorizeClassAccess(schoolId, data.classId, actor);

  // 2. Verify Class exists and belongs to school
  const classObj = await assessmentRepository.verifyClassExists(schoolId, data.classId);
  if (!classObj) {
    throw new NotFoundError(`Class with ID '${data.classId}' not found`);
  }

  // 3. Verify Examination exists if examId is supplied
  if (data.examId) {
    const examObj = await assessmentRepository.verifyExamExists(schoolId, data.examId);
    if (!examObj) {
      throw new NotFoundError(`Examination with ID '${data.examId}' not found`);
    }
  }

  // 4. Verify Subject exists if subjectId is supplied
  if (data.subjectId) {
    const subjectObj = await assessmentRepository.verifySubjectExists(schoolId, data.subjectId);
    if (!subjectObj) {
      throw new NotFoundError(`Subject with ID '${data.subjectId}' not found`);
    }
  }

  // 5. Create Assessment
  const assessment = await assessmentRepository.createAssessment(schoolId, {
    title: data.title.trim(),
    classId: data.classId,
    totalMarks: data.totalMarks,
    passingMarks: data.passingMarks !== undefined ? data.passingMarks : null,
    date: data.date || null,
    examId: data.examId || null,
    subjectId: data.subjectId || null
  });

  // 6. Non-blocking Audit Logging
  try {
    const userId = actor ? actor.id || actor.userId : null;
    if (userId) {
      await createAuditLog({
        schoolId,
        userId,
        action: 'CREATE_ASSESSMENT',
        resource: 'Assessment',
        resourceId: assessment.id,
        details: {
          title: assessment.title,
          classId: assessment.classId,
          totalMarks: assessment.totalMarks,
          examId: assessment.examId,
          subjectId: assessment.subjectId
        }
      });
    }
  } catch (auditErr) {
    logger.warn({ msg: '[AUDIT LOG WARNING] Failed to record assessment creation audit log', error: auditErr.message });
  }

  return assessment;
}

/**
 * Updates an existing assessment record.
 * Protects historical marks by preventing mutation of totalMarks or references if grades are recorded.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} id - Assessment UUID
 * @param {Object} data - Partial assessment attributes to update
 * @param {Object} actor - Authenticated user identity
 * @returns {Promise<Object>}
 */
export async function updateAssessment(schoolId, id, data, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to update assessment');
  }

  const existing = await assessmentRepository.findAssessmentById(schoolId, id);
  if (!existing) {
    throw new NotFoundError(`Assessment with ID '${id}' not found`);
  }

  // Authorize teacher access
  await authorizeClassAccess(schoolId, existing.classId, actor);

  // Safety check: if grades exist, block changes to totalMarks, examId, subjectId
  const gradesCount = await assessmentRepository.countAssessmentGrades(schoolId, id);
  if (gradesCount > 0) {
    if (data.totalMarks !== undefined && Number(data.totalMarks) !== Number(existing.totalMarks)) {
      throw new ConflictError(
        `Cannot modify totalMarks for assessment '${existing.title}': ${gradesCount} student mark(s) already recorded`
      );
    }
    if (data.examId !== undefined && data.examId !== existing.examId) {
      throw new ConflictError(
        `Cannot reassign examination link for assessment '${existing.title}': grades already recorded`
      );
    }
    if (data.subjectId !== undefined && data.subjectId !== existing.subjectId) {
      throw new ConflictError(
        `Cannot reassign subject link for assessment '${existing.title}': grades already recorded`
      );
    }
  }

  // Verify Exam if updated
  if (data.examId && data.examId !== existing.examId) {
    const examObj = await assessmentRepository.verifyExamExists(schoolId, data.examId);
    if (!examObj) {
      throw new NotFoundError(`Examination with ID '${data.examId}' not found`);
    }
  }

  // Verify Subject if updated
  if (data.subjectId && data.subjectId !== existing.subjectId) {
    const subjectObj = await assessmentRepository.verifySubjectExists(schoolId, data.subjectId);
    if (!subjectObj) {
      throw new NotFoundError(`Subject with ID '${data.subjectId}' not found`);
    }
  }

  const updatePayload = {};
  if (data.title !== undefined) updatePayload.title = data.title.trim();
  if (data.totalMarks !== undefined) updatePayload.totalMarks = data.totalMarks;
  if (data.passingMarks !== undefined) updatePayload.passingMarks = data.passingMarks;
  if (data.date !== undefined) updatePayload.date = data.date;
  if (data.examId !== undefined) updatePayload.examId = data.examId;
  if (data.subjectId !== undefined) updatePayload.subjectId = data.subjectId;

  const updatedAssessment = await assessmentRepository.updateAssessment(schoolId, id, updatePayload);

  // Non-blocking Audit Logging
  try {
    const userId = actor ? actor.id || actor.userId : null;
    if (userId) {
      await createAuditLog({
        schoolId,
        userId,
        action: 'UPDATE_ASSESSMENT',
        resource: 'Assessment',
        resourceId: updatedAssessment.id,
        details: {
          updatedFields: Object.keys(updatePayload),
          title: updatedAssessment.title
        }
      });
    }
  } catch (auditErr) {
    logger.warn({ msg: '[AUDIT LOG WARNING] Failed to record assessment update audit log', error: auditErr.message });
  }

  return updatedAssessment;
}

/**
 * Deletes an assessment record safely.
 * Blocks deletion with 409 Conflict if any student grades are recorded.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} id - Assessment UUID
 * @param {Object} actor - Authenticated user identity
 * @returns {Promise<{ message: string, id: string }>}
 */
export async function deleteAssessment(schoolId, id, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to delete assessment');
  }

  const existing = await assessmentRepository.findAssessmentById(schoolId, id);
  if (!existing) {
    throw new NotFoundError(`Assessment with ID '${id}' not found`);
  }

  // Authorize teacher access
  await authorizeClassAccess(schoolId, existing.classId, actor);

  // Safety check: ensure no student grades are recorded
  const gradesCount = await assessmentRepository.countAssessmentGrades(schoolId, id);
  if (gradesCount > 0) {
    throw new ConflictError(
      `Cannot delete assessment '${existing.title}': ${gradesCount} student mark(s) are recorded for this assessment`
    );
  }

  await assessmentRepository.deleteAssessment(schoolId, id);

  // Non-blocking Audit Logging
  try {
    const userId = actor ? actor.id || actor.userId : null;
    if (userId) {
      await createAuditLog({
        schoolId,
        userId,
        action: 'DELETE_ASSESSMENT',
        resource: 'Assessment',
        resourceId: id,
        details: {
          title: existing.title,
          classId: existing.classId,
          totalMarks: existing.totalMarks
        }
      });
    }
  } catch (auditErr) {
    logger.warn({ msg: '[AUDIT LOG WARNING] Failed to record assessment deletion audit log', error: auditErr.message });
  }

  return {
    message: 'Assessment deleted successfully',
    id
  };
}
