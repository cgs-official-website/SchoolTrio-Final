import * as assessmentGradeRepository from './assessment-grade.repository.js';
import { prisma } from '../../database/prisma.client.js';
import { realtimeService } from '../../services/realtime.service.js';
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
    marksObtained: grade.marksObtained !== null && grade.marksObtained !== undefined ? Number(grade.marksObtained) : 0,
    isAbsent: Boolean(grade.isAbsent),
    isExempt: Boolean(grade.isExempt),
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
 * Helper to get assigned subject IDs for a teacher profile.
 */
export function getTeacherAssignedSubjectIds(profile) {
  if (!profile) return [];
  const custom = profile.customData || {};
  const assignments = custom.assignments || {};
  const list = [
    ...(Array.isArray(assignments.assignedSubjectIds) ? assignments.assignedSubjectIds : []),
    ...(Array.isArray(custom.assignedSubjectIds) ? custom.assignedSubjectIds : []),
    ...(Array.isArray(profile.assignedSubjectIds) ? profile.assignedSubjectIds : [])
  ];
  return [...new Set(list.filter(Boolean))];
}

/**
 * Helper to get assigned class IDs for a teacher profile.
 */
export function getTeacherAssignedClassIds(profile) {
  if (!profile) return [];
  const custom = profile.customData || {};
  const assignments = custom.assignments || {};
  const list = [
    profile.assignedClassId,
    assignments.assignedClassId,
    ...(Array.isArray(assignments.subjectClassIds) ? assignments.subjectClassIds : []),
    ...(Array.isArray(custom.subjectClassIds) ? custom.subjectClassIds : []),
    ...(Array.isArray(profile.subjectClassIds) ? profile.subjectClassIds : [])
  ];
  return [...new Set(list.filter(Boolean))];
}

/**
 * Checks whether a teacher is the class teacher for a specific class.
 */
export function isClassTeacherOf(profile, classId) {
  if (!profile || !classId) return false;
  if (profile.assignedClassId === classId) return true;
  if (profile.customData?.assignments?.assignedClassId === classId) return true;
  if (Array.isArray(profile.headedClasses) && profile.headedClasses.some(c => c.id === classId)) return true;
  return false;
}

/**
 * Verifies that the authenticated teacher is authorized to READ/VIEW marks for an assessment.
 * - Class teacher: can view all marks/subjects of their class students.
 * - Subject teacher: can view marks for their assigned subject.
 */
async function authorizeTeacherGradeReadAccess(schoolId, assessmentClassId, subjectIdOrActor = null, sectionId = null, actorObj = null) {
  let assessmentSubjectId = null;
  let assessmentSectionId = null;
  let actor = null;

  if (subjectIdOrActor && typeof subjectIdOrActor === 'object' && ('role' in subjectIdOrActor || 'systemRole' in subjectIdOrActor || 'id' in subjectIdOrActor || 'userId' in subjectIdOrActor)) {
    actor = subjectIdOrActor;
  } else {
    assessmentSubjectId = subjectIdOrActor;
    assessmentSectionId = sectionId;
    actor = actorObj;
  }

  if (!actor) return;

  const role = (actor.systemRole || actor.role || '').toUpperCase();
  if (role === SYSTEM_ROLES.TEACHER || role === 'TEACHER') {
    const userId = actor.id || actor.userId;
    const profile = await assessmentGradeRepository.findStaffProfileByUserId(schoolId, userId);

    if (!profile) {
      throw new ForbiddenError('Staff profile not found for authenticated teacher');
    }

    // Class Teacher can view all subjects/assessments in their assigned class
    if (isClassTeacherOf(profile, assessmentClassId)) {
      return;
    }

    // Subject Teacher can view assessments for their assigned subject in classes they teach
    const teacherSubjectIds = getTeacherAssignedSubjectIds(profile);
    const teacherClassIds = getTeacherAssignedClassIds(profile);

    const matchesSubject = !assessmentSubjectId || teacherSubjectIds.length === 0 || teacherSubjectIds.includes(assessmentSubjectId);
    const matchesClassOrSection = teacherClassIds.length === 0 || 
      teacherClassIds.includes(assessmentClassId) || 
      (assessmentSectionId && teacherClassIds.includes(assessmentSectionId));

    if (matchesSubject && matchesClassOrSection) {
      return;
    }

    throw new ForbiddenError('You are only authorized to view marks for subjects and classes assigned to you');
  }
}

/**
 * Verifies that the authenticated teacher is authorized to UPDATE/MUTATE marks for an assessment.
 * - Subject teacher: can update their subject mark only.
 * - Class teacher: can only update marks if they are ALSO the assigned subject teacher for that subject.
 */
async function authorizeTeacherGradeMutationAccess(schoolId, assessmentClassId, subjectIdOrActor = null, sectionId = null, actorObj = null) {
  let assessmentSubjectId = null;
  let assessmentSectionId = null;
  let actor = null;

  if (subjectIdOrActor && typeof subjectIdOrActor === 'object' && ('role' in subjectIdOrActor || 'systemRole' in subjectIdOrActor || 'id' in subjectIdOrActor || 'userId' in subjectIdOrActor)) {
    actor = subjectIdOrActor;
  } else {
    assessmentSubjectId = subjectIdOrActor;
    assessmentSectionId = sectionId;
    actor = actorObj;
  }

  if (!actor) return;

  const role = (actor.systemRole || actor.role || '').toUpperCase();
  if (role === SYSTEM_ROLES.TEACHER || role === 'TEACHER') {
    const userId = actor.id || actor.userId;
    const profile = await assessmentGradeRepository.findStaffProfileByUserId(schoolId, userId);

    if (!profile) {
      throw new ForbiddenError('Staff profile not found for authenticated teacher');
    }

    const isClassTeacher = isClassTeacherOf(profile, assessmentClassId);
    const teacherSubjectIds = getTeacherAssignedSubjectIds(profile);
    const teacherClassIds = getTeacherAssignedClassIds(profile);
    const teachesInClass = isClassTeacher || teacherClassIds.length === 0 || 
      teacherClassIds.includes(assessmentClassId) || 
      (assessmentSectionId && teacherClassIds.includes(assessmentSectionId));

    if (!teachesInClass) {
      throw new ForbiddenError('You are only authorized to enter marks for subjects and classes assigned to you');
    }

    // If assessment has a specific subject and teacher has assigned subjects configured:
    if (assessmentSubjectId && teacherSubjectIds.length > 0) {
      const isSubjectTeacher = teacherSubjectIds.includes(assessmentSubjectId);
      if (!isSubjectTeacher) {
        if (isClassTeacher) {
          throw new ForbiddenError('Only the assigned subject teacher or school administrator can update marks for this subject');
        }
        throw new ForbiddenError('You are only authorized to enter marks for subjects assigned to you');
      }
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

  await authorizeTeacherGradeReadAccess(schoolId, assessment.classId, assessment.subjectId, assessment.sectionId, actor);

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

    // Teacher authorization: Must be assigned to assessment subject or be class teacher for the class
    if (role === SYSTEM_ROLES.TEACHER || role === 'TEACHER') {
      await authorizeTeacherGradeReadAccess(schoolId, assessment.classId, assessment.subjectId, assessment.sectionId, actor);
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

  // Check lock status
  const exam = assessment.examId ? await prisma.examination.findFirst({
    where: { id: assessment.examId, schoolId }
  }) : null;

  const isLocked = assessment.status === 'LOCKED' || exam?.status === 'FINALIZED';
  const role = actor ? (actor.systemRole || actor.role || '').toUpperCase() : '';
  const isAdmin = role === SYSTEM_ROLES.SUPER_ADMIN || role === SYSTEM_ROLES.SCHOOL_ADMIN || role === 'SUPER_ADMIN' || role === 'SCHOOL_ADMIN' || role === 'ADMIN';

  if (isLocked && !isAdmin) {
    throw new ForbiddenError('Marks for this assessment/exam are locked and finalized. Only an administrator can override marks.');
  }

  if (isLocked && isAdmin && (!data.overrideReason || !data.overrideReason.trim())) {
    throw new ValidationError('An override reason is required to modify marks for a finalized/locked assessment or exam.');
  }

  // 2. Authorize Teacher class/subject mutation access (subject teacher only or authorized class teacher who is also subject teacher)
  await authorizeTeacherGradeMutationAccess(schoolId, assessment.classId, assessment.subjectId, assessment.sectionId, actor);

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
  const isAbsent = Boolean(data.isAbsent);
  const isExempt = Boolean(data.isExempt);
  const numericMarks = isAbsent || isExempt ? 0 : Number(data.marksObtained || 0);
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
    isAbsent,
    isExempt,
    remarks: data.remarks !== undefined ? (data.remarks && data.remarks.trim() ? data.remarks.trim() : null) : undefined
  });

  // 6. Update assessment status if needed
  if (assessment.status === 'PENDING') {
    await prisma.assessment.update({
      where: { id: assessmentId },
      data: { status: 'IN_PROGRESS' }
    });
  }

  // 7. Emit real-time update to tenant school
  try {
    realtimeService.emitToSchool(schoolId, 'marks:updated', {
      assessmentId,
      examId: assessment.examId,
      classId: assessment.classId,
      studentId,
      marksObtained: numericMarks
    });
  } catch (err) {
    logger.warn({ msg: '[REALTIME EVENT WARNING] Failed to emit marks:updated', error: err.message });
  }

  // 8. Non-blocking Audit Logging
  try {
    const userId = actor ? (actor.id || actor.userId) : null;
    if (userId) {
      await createAuditLog({
        schoolId,
        userId,
        action: isLocked ? 'OVERRIDE_ASSESSMENT_GRADE' : 'UPDATE_ASSESSMENT_GRADE',
        resource: 'AssessmentGrade',
        resourceId: savedGrade.id,
        details: {
          assessmentId,
          studentId,
          marksObtained: numericMarks,
          isAbsent,
          isExempt,
          overrideReason: data.overrideReason || null,
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
 * @param {Object} data - Bulk payload ({ grades: Array<{ studentId, marksObtained, remarks }>, isDraft, overrideReason })
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

  // Check lock status
  const exam = assessment.examId ? await prisma.examination.findFirst({
    where: { id: assessment.examId, schoolId }
  }) : null;

  const isLocked = assessment.status === 'LOCKED' || exam?.status === 'FINALIZED';
  const role = actor ? (actor.systemRole || actor.role || '').toUpperCase() : '';
  const isAdmin = role === SYSTEM_ROLES.SUPER_ADMIN || role === SYSTEM_ROLES.SCHOOL_ADMIN || role === 'SUPER_ADMIN' || role === 'SCHOOL_ADMIN' || role === 'ADMIN';

  if (isLocked && !isAdmin) {
    throw new ForbiddenError('Marks for this assessment/exam are locked and finalized. Only an administrator can override marks.');
  }

  if (isLocked && isAdmin && (!data.overrideReason || !data.overrideReason.trim())) {
    throw new ValidationError('An override reason is required to modify marks for a finalized/locked assessment or exam.');
  }

  // 2. Authorize Teacher class/subject mutation access (subject teacher only or authorized class teacher who is also subject teacher)
  await authorizeTeacherGradeMutationAccess(schoolId, assessment.classId, assessment.subjectId, assessment.sectionId, actor);

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

      const isAbsent = Boolean(item.isAbsent);
      const isExempt = Boolean(item.isExempt);
      const numericMarks = isAbsent || isExempt ? 0 : Number(item.marksObtained || 0);

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
      const isAbsent = Boolean(item.isAbsent);
      const isExempt = Boolean(item.isExempt);
      const numericMarks = isAbsent || isExempt ? 0 : Number(item.marksObtained || 0);

      const saved = await assessmentGradeRepository.upsertGrade(
        schoolId,
        assessmentId,
        item.studentId,
        {
          marksObtained: numericMarks,
          isAbsent,
          isExempt,
          remarks: item.remarks !== undefined ? (item.remarks && item.remarks.trim() ? item.remarks.trim() : null) : undefined
        },
        tx
      );
      results.push(saved);
    }

    return results;
  });

  // 4. Update assessment task status based on draft vs submit
  const newAssessmentStatus = isLocked 
    ? 'LOCKED' 
    : (data.isDraft ? 'IN_PROGRESS' : 'SUBMITTED');

  if (assessmentGradeRepository.updateAssessmentStatus) {
    await assessmentGradeRepository.updateAssessmentStatus(schoolId, assessmentId, newAssessmentStatus);
  }

  // 5. Emit real-time event to school
  try {
    realtimeService.emitToSchool(schoolId, 'marks:updated', {
      assessmentId,
      examId: assessment.examId,
      classId: assessment.classId,
      count: savedRecords.length,
      status: newAssessmentStatus
    });
  } catch (err) {
    logger.warn({ msg: '[REALTIME EVENT WARNING] Failed to emit marks:updated', error: err.message });
  }

  // 6. Non-blocking Audit Logging
  try {
    const userId = actor ? (actor.id || actor.userId) : null;
    if (userId) {
      await createAuditLog({
        schoolId,
        userId,
        action: isLocked ? 'OVERRIDE_ASSESSMENT_GRADES_BULK' : 'RECORD_ASSESSMENT_GRADES_BULK',
        resource: 'AssessmentGrade',
        resourceId: assessmentId,
        details: {
          assessmentId,
          gradesCount: savedRecords.length,
          totalMarks: maxMarks,
          isDraft: Boolean(data.isDraft),
          overrideReason: data.overrideReason || null
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

  await authorizeTeacherGradeMutationAccess(schoolId, assessment.classId, assessment.subjectId, assessment.sectionId, actor);

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
