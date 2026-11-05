import * as examRepository from './exam.repository.js';
import { prisma, runWithTenantContext } from '../../database/prisma.client.js';
import { createAuditLog } from '../audit/audit.repository.js';
import { resolveAcademicYear } from '../attendance/attendance.service.js';
import {
  NotFoundError,
  ConflictError,
  TenantAccessError,
  ValidationError
} from '../../utils/app-error.js';
import { isTeacherActor } from '../../utils/teacher-scope.js';
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
export async function listExams(schoolId, query = {}, actor = null) {
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
    endDate: query.endDate,
    // Teachers/staff must not see DRAFT exams until admin publishes them for staff entry
    publishedOnly: isTeacherActor(actor)
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
export async function getExamById(schoolId, id, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to get examination');
  }

  const exam = await examRepository.findExamById(schoolId, id);
  if (!exam) {
    throw new NotFoundError(`Examination with ID '${id}' not found`);
  }

  if (isTeacherActor(actor) && exam.status === 'DRAFT') {
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
  // Normalise input into a list of { classId, sectionId } targets
  let requested = [];
  if (Array.isArray(data.targets) && data.targets.length > 0) {
    requested = data.targets.map((t) => ({ classId: t.classId, sectionId: t.sectionId || null }));
  } else if (data.classId) {
    const ids = [...new Set([
      ...(Array.isArray(data.sectionIds) ? data.sectionIds : []),
      ...(data.sectionId ? [data.sectionId] : [])
    ])];
    requested = ids.length > 0
      ? ids.map((sectionId) => ({ classId: data.classId, sectionId }))
      : [{ classId: data.classId, sectionId: null }];
  }
  if (requested.length === 0) {
    throw new ValidationError('Select at least one target class');
  }

  // Validate every class and section against the tenant's real data
  const classIds = [...new Set(requested.map((t) => t.classId))];
  const sectionRows = await prisma.section.findMany({
    where: { schoolId, classId: { in: classIds } },
    select: { id: true, classId: true }
  });
  const classRows = await prisma.class.findMany({
    where: { schoolId, id: { in: classIds } },
    select: { id: true, name: true }
  });
  if (classRows.length !== classIds.length) {
    throw new ValidationError('One or more selected classes were not found');
  }
  const sectionsByClass = new Map(classIds.map((id) => [id, new Set()]));
  sectionRows.forEach((r) => sectionsByClass.get(r.classId)?.add(r.id));

  const seen = new Set();
  const targets = [];
  for (const t of requested) {
    const className = classRows.find((c) => c.id === t.classId)?.name || 'class';
    const valid = sectionsByClass.get(t.classId);
    if (valid.size > 0) {
      if (!t.sectionId) {
        throw new ValidationError(`Select at least one section for class ${className}`);
      }
      if (!valid.has(t.sectionId)) {
        throw new ValidationError(`Selected section does not belong to class ${className}`);
      }
    } else if (t.sectionId) {
      throw new ValidationError(`Class ${className} has no such section`);
    }
    const key = `${t.classId}:${t.sectionId || ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      targets.push(t);
    }
  }

  // Reject the whole request up-front if any section already has this exam
  const academicYear = await resolveAcademicYear(schoolId, data.academicYear, data.startDate);
  for (const { classId, sectionId } of targets) {
    const dup = await examRepository.findDuplicateExam(schoolId, academicYear, data.name.trim(), classId, sectionId);
    if (dup) {
      throw new ConflictError(
        `An exam with name '${data.name.trim()}' already exists for this class/section in academic year '${academicYear}'`
      );
    }
  }

  const created = [];
  for (const { classId, sectionId } of targets) {
    created.push(await createSingleExam(schoolId, { ...data, classId, sectionId, sectionIds: undefined, targets: undefined }, userId));
  }
  return created.length === 1 ? created[0] : created;
}

async function createSingleExam(schoolId, data, userId = null) {
  // 1. Resolve Academic Year (Explicit -> SchoolSetting -> Date-derived fallback)
  const academicYear = await resolveAcademicYear(schoolId, data.academicYear, data.startDate);

  // 2. Resolve Term (Explicit -> stored as supplied; omitted -> null)
  const term = data.term !== undefined && data.term !== null && data.term.trim() ? data.term.trim() : null;

  // 3. Duplicate exam validation
  // Prevent duplicate exam with same name + academicYear (+ classId & sectionId if provided)
  const existingDuplicate = examRepository.findDuplicateExam
    ? await examRepository.findDuplicateExam(schoolId, academicYear, data.name.trim(), data.classId || null, data.sectionId || null)
    : null;

  if (existingDuplicate) {
    throw new ConflictError(
      `An exam with name '${data.name.trim()}' already exists for this class/section in academic year '${academicYear}'`
    );
  }

  // 4. Create Examination
  const exam = await examRepository.createExam(schoolId, {
    name: data.name.trim(),
    term,
    academicYear,
    examType: data.examType || 'Final',
    status: data.status || 'DRAFT',
    classId: data.classId || null,
    sectionId: data.sectionId || null,
    subjectsConfig: data.subjectsConfig || null,
    startDate: data.startDate || null,
    endDate: data.endDate || null
  });

  // 5. If classId and subjectsConfig are specified, automatically generate/sync Assessment columns
  if (exam.classId && Array.isArray(exam.subjectsConfig) && exam.subjectsConfig.length > 0) {
    await runWithTenantContext({ schoolId }, async () => {
      for (const sub of exam.subjectsConfig) {
        await prisma.assessment.create({
          data: {
            schoolId,
            examId: exam.id,
            classId: exam.classId,
            sectionId: exam.sectionId || null,
            subjectId: sub.subjectId,
            title: `${exam.name} - ${sub.subjectName || 'Subject'}`,
            totalMarks: sub.maxMarks,
            passingMarks: sub.passMarks !== undefined ? sub.passMarks : null,
            weightage: sub.weightage !== undefined ? sub.weightage : 100,
            date: sub.examDate || exam.startDate || null,
            status: 'PENDING'
          }
        });
      }
    });
  }

  // 6. Non-blocking Audit Logging
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
          examType: exam.examType,
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

const EXAM_CONTENT_FIELDS = [
  'name', 'term', 'academicYear', 'examType', 'classId', 'sectionId',
  'subjectsConfig', 'startDate', 'endDate'
];

const assessmentStatusForExam = (status) =>
  status === 'FINALIZED' ? 'LOCKED' : (status === 'PUBLISHED' ? 'IN_PROGRESS' : 'PENDING');

/**
 * Keeps the Assessment rows (the columns teachers see) in sync with an exam's
 * class / section / subjectsConfig after the admin edits the exam.
 * Validation runs before any write, so a rejected edit changes nothing.
 */
async function syncExamAssessments(schoolId, examId, next, assessmentStatus) {
  await runWithTenantContext({ schoolId }, async () => {
    const current = await prisma.assessment.findMany({
      where: { schoolId, examId },
      include: { _count: { select: { assessmentGrades: true } } }
    });

    const configs = next.classId && Array.isArray(next.subjectsConfig) ? next.subjectsConfig : [];
    const wantedSubjects = new Set(configs.map((c) => c.subjectId));

    for (const a of current) {
      const removed = !wantedSubjects.has(a.subjectId);
      const classChanged = a.classId !== next.classId;
      if ((removed || classChanged) && a._count.assessmentGrades > 0) {
        throw new ConflictError(
          classChanged && !removed
            ? 'Cannot change the class of this exam: teachers have already entered marks.'
            : `Cannot remove subject from this exam: marks have already been entered for '${a.title}'.`
        );
      }
    }

    const bySubject = new Map(current.map((a) => [a.subjectId, a]));

    // Remove assessments of subjects dropped from the exam (no marks entered, verified above)
    const removeIds = current.filter((a) => !wantedSubjects.has(a.subjectId)).map((a) => a.id);
    if (removeIds.length > 0) {
      await prisma.assessment.deleteMany({ where: { schoolId, id: { in: removeIds } } });
    }

    for (const sub of configs) {
      const fields = {
        classId: next.classId,
        sectionId: next.sectionId || null,
        title: `${next.name} - ${sub.subjectName || 'Subject'}`,
        totalMarks: sub.maxMarks,
        passingMarks: sub.passMarks !== undefined ? sub.passMarks : null,
        weightage: sub.weightage !== undefined ? sub.weightage : 100,
        date: sub.examDate || next.startDate || null,
        status: assessmentStatus
      };
      const found = bySubject.get(sub.subjectId);
      if (found) {
        await prisma.assessment.update({ where: { id: found.id }, data: fields });
      } else {
        await prisma.assessment.create({
          data: { schoolId, examId, subjectId: sub.subjectId, ...fields }
        });
      }
    }
  });
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

  const contentChanged = EXAM_CONTENT_FIELDS.some((f) => data[f] !== undefined);

  if (existing.status === 'FINALIZED' && contentChanged && data.status === undefined) {
    throw new ConflictError('This exam is finalized and locked. Unlock it before editing.');
  }

  const updatePayload = {};
  if (data.name !== undefined) updatePayload.name = data.name.trim();
  if (data.term !== undefined) updatePayload.term = data.term.trim();
  if (data.academicYear !== undefined) updatePayload.academicYear = data.academicYear.trim();
  if (data.examType !== undefined) updatePayload.examType = data.examType;
  if (data.status !== undefined) updatePayload.status = data.status;
  if (data.classId !== undefined) updatePayload.classId = data.classId;
  if (data.sectionId !== undefined) updatePayload.sectionId = data.sectionId;
  if (data.subjectsConfig !== undefined) updatePayload.subjectsConfig = data.subjectsConfig;
  if (data.startDate !== undefined) updatePayload.startDate = data.startDate;
  if (data.endDate !== undefined) updatePayload.endDate = data.endDate;

  // Editing a published exam sends it back to DRAFT: the admin must press
  // "Publish for Staff Entry" again before teachers see the edited version.
  if (contentChanged && data.status === undefined && existing.status !== 'DRAFT') {
    updatePayload.status = 'DRAFT';
  }

  // Duplicate name check when name / class / section / year changed
  if (data.name !== undefined || data.classId !== undefined || data.sectionId !== undefined || data.academicYear !== undefined) {
    const dup = await examRepository.findDuplicateExam(
      schoolId,
      updatePayload.academicYear ?? existing.academicYear,
      (updatePayload.name ?? existing.name).trim(),
      data.classId !== undefined ? data.classId : existing.classId,
      data.sectionId !== undefined ? data.sectionId : existing.sectionId
    );
    if (dup && dup.id !== id) {
      throw new ConflictError(`An exam named '${updatePayload.name ?? existing.name}' already exists for this class/section in this academic year`);
    }
  }

  // Sync teacher-facing assessment columns BEFORE saving the exam so a rejected edit changes nothing
  const syncFields = ['name', 'classId', 'sectionId', 'subjectsConfig', 'startDate'];
  if (syncFields.some((f) => data[f] !== undefined)) {
    await syncExamAssessments(
      schoolId,
      id,
      {
        name: updatePayload.name ?? existing.name,
        classId: data.classId !== undefined ? data.classId : existing.classId,
        sectionId: data.sectionId !== undefined ? data.sectionId : existing.sectionId,
        subjectsConfig: data.subjectsConfig !== undefined ? data.subjectsConfig : existing.subjectsConfig,
        startDate: data.startDate !== undefined ? data.startDate : existing.startDate
      },
      assessmentStatusForExam(updatePayload.status ?? existing.status)
    );
  }

  const updatedExam = await examRepository.updateExam(schoolId, id, updatePayload);

  // If the edit sent the exam back to DRAFT, hide every assessment from teachers again
  if (updatePayload.status && updatePayload.status !== existing.status) {
    await runWithTenantContext({ schoolId }, async () => {
      await prisma.assessment.updateMany({
        where: { schoolId, examId: id },
        data: { status: assessmentStatusForExam(updatePayload.status) }
      });
    });
  }

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
 * Changes examination lifecycle state: DRAFT -> PUBLISHED -> FINALIZED
 */
export async function updateExamStatus(schoolId, id, status, userId = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to update exam status');
  }

  const existing = await examRepository.findExamById(schoolId, id);
  if (!existing) {
    throw new NotFoundError(`Examination with ID '${id}' not found`);
  }

  const validStatuses = ['DRAFT', 'PUBLISHED', 'FINALIZED'];
  if (!validStatuses.includes(status)) {
    throw new ValidationError(`Invalid exam status '${status}'. Must be one of: ${validStatuses.join(', ')}`);
  }

  // Update exam status
  const updated = await examRepository.updateExam(schoolId, id, { status });

  // Cascade status to linked assessments
  const assessmentStatus = status === 'FINALIZED' ? 'LOCKED' : (status === 'PUBLISHED' ? 'IN_PROGRESS' : 'PENDING');
  await runWithTenantContext({ schoolId }, async () => {
    await prisma.assessment.updateMany({
      where: {
        schoolId,
        examId: id
      },
      data: {
        status: assessmentStatus
      }
    });
  });

  // Non-blocking Audit Logging
  try {
    if (userId) {
      await createAuditLog({
        schoolId,
        userId,
        action: `EXAM_STATUS_${status}`,
        resource: 'Examination',
        resourceId: id,
        details: {
          previousStatus: existing.status,
          newStatus: status
        }
      });
    }
  } catch (auditErr) {
    logger.warn({ msg: '[AUDIT LOG WARNING] Failed to record exam status audit log', error: auditErr.message });
  }

  return updated;
}

/**
 * Retrieves entry progress for all subjects and sections under an exam.
 */
export async function getExamProgress(schoolId, id) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required');
  }

  const exam = await examRepository.findExamById(schoolId, id);
  if (!exam) {
    throw new NotFoundError(`Examination with ID '${id}' not found`);
  }

  return runWithTenantContext({ schoolId }, async () => {
    // Find all assessments linked to this exam
    const assessments = await prisma.assessment.findMany({
      where: {
        schoolId,
        examId: id
      },
      include: {
        subject: true,
        class: {
          include: {
            sections: true
          }
        },
        assessmentGrades: true
      }
    });

    // Fetch all staff profiles to identify who teaches these subjects
    const staffProfiles = await prisma.staffProfile.findMany({
      where: { schoolId },
      select: {
        id: true,
        name: true,
        email: true,
        assignedClassId: true,
        customData: true
      }
    });

    const progressList = [];

    for (const a of assessments) {
      // Total students in this class
      const totalStudents = await prisma.student.count({
        where: {
          schoolId,
          classId: a.classId,
          ...(a.sectionId ? { sectionId: a.sectionId } : {})
        }
      });

      const gradesEntered = a.assessmentGrades.length;
      const percentage = totalStudents > 0 ? Math.round((gradesEntered / totalStudents) * 100) : 0;

      // Identify assigned staff
      const assignedStaff = staffProfiles.find(sp => {
        const custom = sp.customData || {};
        const assignments = custom.assignments || {};
        const subjectIds = assignments.assignedSubjectIds || [];
        const classIds = assignments.subjectClassIds || [];
        const matchesSubject = a.subjectId && subjectIds.includes(a.subjectId);
        const matchesClass = classIds.includes(a.classId) || (a.sectionId && classIds.includes(a.sectionId)) || sp.assignedClassId === a.classId;
        return matchesSubject && matchesClass;
      }) || staffProfiles.find(sp => sp.assignedClassId === a.classId) || null;

      progressList.push({
        assessmentId: a.id,
        title: a.title,
        subjectId: a.subjectId,
        subjectName: a.subject?.name || 'General',
        classId: a.classId,
        className: a.class?.name || 'Unknown Class',
        sectionId: a.sectionId,
        status: a.status,
        totalMarks: Number(a.totalMarks),
        passingMarks: a.passingMarks ? Number(a.passingMarks) : null,
        totalStudents,
        gradesEntered,
        completionPercentage: percentage,
        assignedStaffName: assignedStaff?.name || 'Unassigned',
        assignedStaffEmail: assignedStaff?.email || null,
        lastUpdated: a.updatedAt
      });
    }

    return {
      examId: exam.id,
      examName: exam.name,
      examStatus: exam.status,
      progress: progressList
    };
  });
}

/**
 * Deletes an examination record safely.
 * Rejects deletion with 409 Conflict if dependent assessments exist with marks entered.
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

  // Safety check: ensure no student marks have been entered if countDependentGrades exists
  if (examRepository.countDependentGrades) {
    const linkedGradesCount = await examRepository.countDependentGrades(schoolId, id);
    if (linkedGradesCount > 0) {
      throw new ConflictError(
        `Cannot delete examination '${existing.name}': ${linkedGradesCount} student grade(s) have already been entered.`
      );
    }
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
