import * as assessmentGradeRepository from './assessment-grade.repository.js';
import { findParentByUserId, findParentStudentLink } from '../parents/parent.repository.js';
import { createAuditLog } from '../audit/audit.repository.js';
import { SYSTEM_ROLES } from '../../config/constants.js';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
  ForbiddenError,
  TenantAccessError
} from '../../utils/app-error.js';
import { parsePagination, buildPaginationMetadata } from '../../utils/pagination.js';
import { logger } from '../../utils/logger.js';

/**
 * Assessment Grade Service
 * Core business domain logic for recording, updating, bulk-saving, and clearing student marks.
 */

/**
 * Helper to serialize Decimal and numerical values cleanly.
 *
 * @param {Object} grade - AssessmentGrade database record
 * @returns {Object}
 */
export function serializeGrade(grade) {
  if (!grade) return null;
  return {
    id: grade.id,
    schoolId: grade.schoolId,
    assessmentId: grade.assessmentId,
    studentId: grade.studentId,
    marksObtained: Number(grade.marksObtained),
    grade: grade.grade || null,
    remarks: grade.remarks || null,
    createdAt: grade.createdAt,
    updatedAt: grade.updatedAt,
    student: grade.student
      ? {
          id: grade.student.id,
          firstName: grade.student.firstName,
          lastName: grade.student.lastName || null,
          admissionNumber: grade.student.admissionNumber,
          rollNumber: grade.student.rollNumber || null
        }
      : undefined
  };
}

/**
 * Verifies that the authenticated teacher is assigned to the assessment's class.
 * Administrative roles bypass this check.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} assessmentClassId - Class UUID associated with the assessment
 * @param {Object} actor - Authenticated user identity ({ id, userId, systemRole, role })
 */
async function authorizeTeacherClassAccess(schoolId, assessmentClassId, actor) {
  if (!actor) return;

  const role = (actor.systemRole || actor.role || '').toUpperCase();
  if (role === SYSTEM_ROLES.TEACHER || role === 'TEACHER') {
    const userId = actor.id || actor.userId;
    const profile = await assessmentGradeRepository.findStaffProfileByUserId(schoolId, userId);

    if (!profile || profile.assignedClassId !== assessmentClassId) {
      throw new ForbiddenError('Teachers are only authorized to manage marks for their assigned class');
    }
  }
}

/**
 * Lists all student grades recorded for an assessment.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} assessmentId - Assessment UUID
 * @param {Object} [query={}] - Query filters and pagination
 * @param {Object} [actor=null] - Authenticated user identity
 * @returns {Promise<{ grades: Array<Object>, pagination: Object }>}
 */
export async function listAssessmentGrades(schoolId, assessmentId, query = {}, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to list grades');
  }

  const assessment = await assessmentGradeRepository.findAssessmentForGradeOperation(schoolId, assessmentId);
  if (!assessment) {
    throw new NotFoundError(`Assessment with ID '${assessmentId}' not found`);
  }

  await authorizeTeacherClassAccess(schoolId, assessment.classId, actor);

  const paginationParams = parsePagination(query, {
    defaultSort: 'createdAt',
    defaultOrder: 'asc'
  });

  const options = {
    search: query.search ? query.search.trim() : undefined,
    page: paginationParams.page,
    limit: paginationParams.limit,
    skip: paginationParams.skip,
    sort: paginationParams.sort,
    order: paginationParams.order
  };

  const result = await assessmentGradeRepository.findGradesByAssessment(schoolId, assessmentId, options);
  const pagination = buildPaginationMetadata(result.total, paginationParams.page, paginationParams.limit);

  return {
    grades: result.items.map(serializeGrade),
    pagination
  };
}

/**
 * Retrieves a single student's recorded grade for an assessment.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} assessmentId - Assessment UUID
 * @param {string} studentId - Student UUID
 * @param {Object} [actor=null] - Authenticated user identity
 * @returns {Promise<Object>}
 */
export async function getAssessmentGrade(schoolId, assessmentId, studentId, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to get grade');
  }

  const assessment = await assessmentGradeRepository.findAssessmentForGradeOperation(schoolId, assessmentId);
  if (!assessment) {
    throw new NotFoundError(`Assessment with ID '${assessmentId}' not found`);
  }

  if (actor) {
    const role = (actor.systemRole || actor.role || '').toUpperCase();

    // Teacher authorization: Must be assigned to assessment class
    if (role === SYSTEM_ROLES.TEACHER || role === 'TEACHER') {
      await authorizeTeacherClassAccess(schoolId, assessment.classId, actor);
    }

    // Parent authorization: Must have active ParentStudentLink to student, and student must be in assessment class
    if (role === SYSTEM_ROLES.PARENT || role === 'PARENT') {
      const userId = actor.id || actor.userId;
      const parentProfile = await findParentByUserId(userId);
      if (!parentProfile) {
        throw new ForbiddenError('Parent profile not found');
      }

      const link = await findParentStudentLink(schoolId, studentId, parentProfile.id);
      if (!link) {
        throw new ForbiddenError('Access denied: You are not linked to this student');
      }

      const student = await assessmentGradeRepository.findStudentForGradeOperation(schoolId, studentId);
      if (!student || student.classId !== assessment.classId) {
        throw new ForbiddenError('Access denied: Assessment does not belong to the student\'s class');
      }
    }

    // Student authorization: Must be own studentId
    if (role === SYSTEM_ROLES.STUDENT || role === 'STUDENT') {
      const actorStudentId = actor.studentId || actor.id;
      if (actorStudentId !== studentId) {
        throw new ForbiddenError('Access denied: Students can only view their own grades');
      }
    }
  }

  const grade = await assessmentGradeRepository.findGrade(schoolId, assessmentId, studentId);
  if (!grade) {
    throw new NotFoundError(`Grade record not found for student '${studentId}' on assessment '${assessmentId}'`);
  }

  return serializeGrade(grade);
}

/**
 * Creates or updates a single student's mark for an assessment.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} assessmentId - Assessment UUID
 * @param {string} studentId - Student UUID
 * @param {Object} data - Grade attributes ({ marksObtained, remarks })
 * @param {Object} [actor=null] - Authenticated user identity
 * @returns {Promise<Object>}
 */
export async function upsertSingleGrade(schoolId, assessmentId, studentId, data, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to upsert grade');
  }

  // 1. Resolve Assessment
  const assessment = await assessmentGradeRepository.findAssessmentForGradeOperation(schoolId, assessmentId);
  if (!assessment) {
    throw new NotFoundError(`Assessment with ID '${assessmentId}' not found`);
  }

  // 2. Authorize Teacher class access
  await authorizeTeacherClassAccess(schoolId, assessment.classId, actor);

  // 3. Resolve Student and verify class membership
  const student = await assessmentGradeRepository.findStudentForGradeOperation(schoolId, studentId);
  if (!student) {
    throw new NotFoundError(`Student with ID '${studentId}' not found`);
  }

  if (student.classId !== assessment.classId) {
    const studentName = `${student.firstName} ${student.lastName || ''}`.trim();
    throw new ConflictError(
      `Student '${studentName}' (ID: '${studentId}') is enrolled in class '${student.classId}', not assessment class '${assessment.classId}'`
    );
  }

  // 4. Validate marks against assessment totalMarks using integer cents comparison for Decimal safety
  const numericMarks = Number(data.marksObtained);
  const maxMarks = Number(assessment.totalMarks);

  if (numericMarks < 0) {
    throw new ValidationError('Marks obtained cannot be negative');
  }

  if (Math.round(numericMarks * 100) > Math.round(maxMarks * 100)) {
    throw new ValidationError(
      `Marks obtained (${numericMarks}) exceeds assessment total marks (${maxMarks})`
    );
  }

  // 5. Execute atomic upsert
  const savedGrade = await assessmentGradeRepository.upsertGrade(schoolId, assessmentId, studentId, {
    marksObtained: numericMarks,
    remarks: data.remarks !== undefined ? (data.remarks && data.remarks.trim() ? data.remarks.trim() : null) : undefined
  });

  // 6. Non-blocking Audit Logging
  try {
    const userId = actor ? (actor.id || actor.userId) : null;
    if (userId) {
      await createAuditLog({
        schoolId,
        userId,
        action: 'UPDATE_ASSESSMENT_GRADE',
        resource: 'AssessmentGrade',
        resourceId: savedGrade.id,
        details: {
          assessmentId,
          studentId,
          marksObtained: numericMarks,
          totalMarks: maxMarks
        }
      });
    }
  } catch (auditErr) {
    logger.warn({ msg: '[AUDIT LOG WARNING] Failed to record grade update audit log', error: auditErr.message });
  }

  return serializeGrade(savedGrade);
}

/**
 * Atomically upserts an array of student marks for an assessment inside a single database transaction.
 * Partial batches are allowed. Omitted students are NEVER deleted.
 * If any single student validation fails, the entire transaction rolls back.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} assessmentId - Assessment UUID
 * @param {Object} data - Bulk payload ({ grades: Array<{ studentId, marksObtained, remarks }> })
 * @param {Object} [actor=null] - Authenticated user identity
 * @returns {Promise<{ count: number, grades: Array<Object> }>}
 */
export async function bulkUpsertGrades(schoolId, assessmentId, data, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to bulk upsert grades');
  }

  if (!data || !Array.isArray(data.grades) || data.grades.length === 0) {
    throw new ValidationError('Grades array is required and must contain at least one grade entry');
  }

  // 1. Resolve Assessment
  const assessment = await assessmentGradeRepository.findAssessmentForGradeOperation(schoolId, assessmentId);
  if (!assessment) {
    throw new NotFoundError(`Assessment with ID '${assessmentId}' not found`);
  }

  // 2. Authorize Teacher class access
  await authorizeTeacherClassAccess(schoolId, assessment.classId, actor);

  const maxMarks = Number(assessment.totalMarks);

  // Check for duplicate student IDs in the same request payload to prevent accidental overwrites
  const seenStudentIds = new Set();
  for (const item of data.grades) {
    if (seenStudentIds.has(item.studentId)) {
      throw new ValidationError(`Duplicate student ID '${item.studentId}' found in bulk grades payload`);
    }
    seenStudentIds.add(item.studentId);
  }
  const studentIds = Array.from(seenStudentIds);

  // 3. Execute atomic batch inside transaction
  const savedRecords = await assessmentGradeRepository.executeInTransaction(async (tx) => {
    // 3a. Batch load all referenced students
    const students = await assessmentGradeRepository.findStudentsByIdsForGradeOperation(schoolId, studentIds, tx);
    const loadedStudentMap = new Map(students.map((s) => [s.id, s]));

    // 3b. Validate each item before writing
    for (const item of data.grades) {
      const student = loadedStudentMap.get(item.studentId);
      if (!student) {
        throw new NotFoundError(`Student with ID '${item.studentId}' not found`);
      }

      if (student.classId !== assessment.classId) {
        const studentName = `${student.firstName} ${student.lastName || ''}`.trim();
        throw new ConflictError(
          `Student '${studentName}' (ID: '${item.studentId}') does not belong to Assessment class '${assessment.classId}'`
        );
      }

      const numericMarks = Number(item.marksObtained);
      if (numericMarks < 0) {
        throw new ValidationError(`Marks obtained for student '${item.studentId}' cannot be negative`);
      }

      if (Math.round(numericMarks * 100) > Math.round(maxMarks * 100)) {
        throw new ValidationError(
          `Marks obtained (${numericMarks}) for student '${item.studentId}' exceeds assessment total marks (${maxMarks})`
        );
      }
    }

    // 3c. Perform atomic upserts
    const results = [];
    for (const item of data.grades) {
      const saved = await assessmentGradeRepository.upsertGrade(
        schoolId,
        assessmentId,
        item.studentId,
        {
          marksObtained: Number(item.marksObtained),
          remarks: item.remarks !== undefined ? (item.remarks && item.remarks.trim() ? item.remarks.trim() : null) : undefined
        },
        tx
      );
      results.push(saved);
    }

    return results;
  });

  // 4. Non-blocking Audit Logging
  try {
    const userId = actor ? (actor.id || actor.userId) : null;
    if (userId) {
      await createAuditLog({
        schoolId,
        userId,
        action: 'RECORD_ASSESSMENT_GRADES_BULK',
        resource: 'AssessmentGrade',
        resourceId: assessmentId,
        details: {
          assessmentId,
          gradesCount: savedRecords.length,
          totalMarks: maxMarks
        }
      });
    }
  } catch (auditErr) {
    logger.warn({ msg: '[AUDIT LOG WARNING] Failed to record bulk grades audit log', error: auditErr.message });
  }

  return {
    count: savedRecords.length,
    grades: savedRecords.map(serializeGrade)
  };
}

/**
 * Clears/deletes a single student's recorded grade for an assessment.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} assessmentId - Assessment UUID
 * @param {string} studentId - Student UUID
 * @param {Object} [actor=null] - Authenticated user identity
 * @returns {Promise<{ message: string, assessmentId: string, studentId: string }>}
 */
export async function deleteAssessmentGrade(schoolId, assessmentId, studentId, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to delete grade');
  }

  const assessment = await assessmentGradeRepository.findAssessmentForGradeOperation(schoolId, assessmentId);
  if (!assessment) {
    throw new NotFoundError(`Assessment with ID '${assessmentId}' not found`);
  }

  await authorizeTeacherClassAccess(schoolId, assessment.classId, actor);

  const existingGrade = await assessmentGradeRepository.findGrade(schoolId, assessmentId, studentId);
  if (!existingGrade) {
    throw new NotFoundError(`Grade record not found for student '${studentId}' on assessment '${assessmentId}'`);
  }

  await assessmentGradeRepository.deleteGrade(schoolId, assessmentId, studentId);

  // Non-blocking Audit Logging
  try {
    const userId = actor ? (actor.id || actor.userId) : null;
    if (userId) {
      await createAuditLog({
        schoolId,
        userId,
        action: 'DELETE_ASSESSMENT_GRADE',
        resource: 'AssessmentGrade',
        resourceId: existingGrade.id,
        details: {
          assessmentId,
          studentId,
          previousMarks: Number(existingGrade.marksObtained)
        }
      });
    }
  } catch (auditErr) {
    logger.warn({ msg: '[AUDIT LOG WARNING] Failed to record grade deletion audit log', error: auditErr.message });
  }

  return {
    message: 'Assessment grade cleared successfully',
    assessmentId,
    studentId
  };
}
