import * as homeworkRepository from './homework.repository.js';
import { createAuditLog } from '../audit/audit.repository.js';
import { SYSTEM_ROLES } from '../../config/constants.js';
import {
  TenantAccessError,
  NotFoundError,
  ForbiddenError,
  ValidationError
} from '../../utils/app-error.js';

/**
 * Normalizes input attachments, remarks, and maxMarks into standard JSON storage object.
 *
 * @param {Array|Object|null} attachmentsInput - Raw attachments payload
 * @param {string|null} [remarksInput] - Explicit remarks string
 * @param {number|null} [maxMarksInput] - Explicit maxMarks number
 * @returns {Object} Structured JSON object for HomeworkAssignment.attachments
 */
export function normalizeAttachments(attachmentsInput, remarksInput, maxMarksInput) {
  let files = [];
  let remarks = remarksInput !== undefined && remarksInput !== null ? String(remarksInput).trim() : '';
  let maxMarks = maxMarksInput !== undefined && maxMarksInput !== null ? Number(maxMarksInput) : 0;

  if (attachmentsInput && typeof attachmentsInput === 'object') {
    if (Array.isArray(attachmentsInput)) {
      files = attachmentsInput;
    } else {
      if (Array.isArray(attachmentsInput.files)) {
        files = attachmentsInput.files;
      }
      if (remarksInput === undefined && attachmentsInput.remarks !== undefined) {
        remarks = String(attachmentsInput.remarks || '').trim();
      }
      if (maxMarksInput === undefined && attachmentsInput.maxMarks !== undefined) {
        maxMarks = Number(attachmentsInput.maxMarks) || 0;
      }
    }
  }

  return {
    files,
    remarks,
    maxMarks: Math.max(0, maxMarks)
  };
}

/**
 * Safely extracts files array, remarks string, and maxMarks from attachments JSON column.
 *
 * @param {Object|Array|null} attachmentsJson - Raw JSON from database
 * @returns {{ files: Array, remarks: string, maxMarks: number }}
 */
export function extractAttachmentDetails(attachmentsJson) {
  if (!attachmentsJson) {
    return { files: [], remarks: '', maxMarks: 0 };
  }

  if (Array.isArray(attachmentsJson)) {
    return { files: attachmentsJson, remarks: '', maxMarks: 0 };
  }

  if (typeof attachmentsJson === 'object') {
    return {
      files: Array.isArray(attachmentsJson.files) ? attachmentsJson.files : [],
      remarks: typeof attachmentsJson.remarks === 'string' ? attachmentsJson.remarks : '',
      maxMarks: Number(attachmentsJson.maxMarks) || 0
    };
  }

  return { files: [], remarks: '', maxMarks: 0 };
}

/**
 * Validates teacher authorization for target class.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} classId - Class UUID
 * @param {Object} actor - Authenticated user context
 */
async function authorizeTeacherClass(schoolId, classId, actor) {
  if (!actor) return;

  const role = (actor.systemRole || actor.role || '').toUpperCase();
  if (role === SYSTEM_ROLES.SUPER_ADMIN || role === SYSTEM_ROLES.ADMIN || role === 'SUPER_ADMIN' || role === 'ADMIN') {
    return;
  }

  if (role === SYSTEM_ROLES.TEACHER || role === 'TEACHER') {
    const userId = actor.id || actor.userId;
    const profile = await homeworkRepository.findStaffProfileByUserId(schoolId, userId);

    if (!profile) {
      throw new ForbiddenError('Staff profile not found for authenticated teacher');
    }

    const isAssigned = profile.assignedClassId === classId;
    const isHeading = profile.headedClasses?.some((c) => c.id === classId);

    if (!isAssigned && !isHeading) {
      throw new ForbiddenError('Teachers are only authorized to manage homework for their assigned class');
    }
  }
}

/**
 * Formats a homework assignment for parent/student response with merged submission data.
 *
 * @param {Object} assignment - Raw HomeworkAssignment entity
 * @param {Object|null} submission - Raw HomeworkSubmission entity (or null if missing)
 * @returns {Object} Formatted Parent Homework DTO
 */
export function formatParentHomework(assignment, submission) {
  const { files, remarks, maxMarks } = extractAttachmentDetails(assignment.attachments);
  const todayStr = new Date().toISOString().split('T')[0];

  const subDto = submission
    ? {
        id: submission.id,
        status: submission.status,
        submittedAt: submission.status === 'Submitted' ? submission.submittedAt : null,
        grade: submission.grade || null,
        feedback: submission.feedback || null,
        updatedAt: submission.updatedAt
      }
    : {
        id: null,
        status: 'Not Started',
        submittedAt: null,
        grade: null,
        feedback: null,
        updatedAt: null
      };

  const isOverdue =
    assignment.dueDate < todayStr && subDto.status !== 'Completed' && subDto.status !== 'Submitted';

  const assignedDate = assignment.createdAt
    ? new Date(assignment.createdAt).toISOString().split('T')[0]
    : todayStr;

  return {
    id: assignment.id,
    title: assignment.title,
    description: assignment.description || null,
    subjectId: assignment.subjectId,
    subjectName: assignment.subject?.name || null,
    subjectCode: assignment.subject?.code || null,
    classId: assignment.classId,
    className: assignment.class?.name || null,
    dueDate: assignment.dueDate,
    assignedDate,
    remarks,
    maxMarks,
    attachments: files,
    submission: subDto,
    isOverdue
  };
}

/**
 * Formats a homework assignment for staff/teacher list summary response.
 *
 * @param {Object} assignment - Raw HomeworkAssignment entity
 * @returns {Object} Formatted Homework Summary DTO
 */
export function formatHomeworkSummary(assignment) {
  const { files, remarks, maxMarks } = extractAttachmentDetails(assignment.attachments);
  const submissions = assignment.submissions || [];

  let submittedCount = 0;
  let completedCount = 0;
  let inProgressCount = 0;

  for (const s of submissions) {
    if (s.status === 'Submitted') submittedCount++;
    else if (s.status === 'Completed') completedCount++;
    else if (s.status === 'In Progress') inProgressCount++;
  }

  return {
    id: assignment.id,
    title: assignment.title,
    description: assignment.description || null,
    classId: assignment.classId,
    className: assignment.class?.name || null,
    subjectId: assignment.subjectId,
    subjectName: assignment.subject?.name || null,
    subjectCode: assignment.subject?.code || null,
    dueDate: assignment.dueDate,
    remarks,
    maxMarks,
    attachmentCount: files.length,
    attachments: files,
    submittedCount,
    completedCount,
    inProgressCount,
    totalSubmissionsRecorded: submissions.length,
    createdAt: assignment.createdAt,
    updatedAt: assignment.updatedAt
  };
}

/**
 * Formats a homework assignment with complete class student submission roster.
 *
 * @param {Object} assignment - Raw HomeworkAssignment entity with class students and submissions
 * @returns {Object} Formatted Homework Detail Roster DTO
 */
export function formatHomeworkDetailWithRoster(assignment) {
  const { files, remarks, maxMarks } = extractAttachmentDetails(assignment.attachments);
  const students = assignment.class?.students || [];
  const submissionsMap = new Map();

  for (const sub of assignment.submissions || []) {
    submissionsMap.set(sub.studentId, sub);
  }

  let submittedCount = 0;
  let completedCount = 0;
  let inProgressCount = 0;
  let notStartedCount = 0;

  const roster = students.map((student) => {
    const sub = submissionsMap.get(student.id);
    const status = sub?.status || 'Not Started';

    if (status === 'Submitted') submittedCount++;
    else if (status === 'Completed') completedCount++;
    else if (status === 'In Progress') inProgressCount++;
    else notStartedCount++;

    return {
      studentId: student.id,
      studentName: `${student.firstName} ${student.lastName}`.trim(),
      admissionNumber: student.admissionNumber || '',
      rollNumber: student.rollNumber || null,
      status,
      submittedAt: status === 'Submitted' && sub?.submittedAt ? sub.submittedAt : null,
      grade: sub?.grade || null,
      feedback: sub?.feedback || null,
      updatedAt: sub?.updatedAt || null
    };
  });

  return {
    id: assignment.id,
    title: assignment.title,
    description: assignment.description || null,
    classId: assignment.classId,
    className: assignment.class?.name || null,
    subjectId: assignment.subjectId,
    subjectName: assignment.subject?.name || null,
    subjectCode: assignment.subject?.code || null,
    dueDate: assignment.dueDate,
    remarks,
    maxMarks,
    attachments: files,
    totalStudents: students.length,
    submittedCount,
    completedCount,
    inProgressCount,
    notStartedCount,
    roster,
    createdAt: assignment.createdAt,
    updatedAt: assignment.updatedAt
  };
}

// ============================================================
// STAFF SERVICE METHODS
// ============================================================

/**
 * Lists homework assignments with filtering and pagination for staff/admin.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} query - Query parameters
 * @param {Object} [actor=null] - Authenticated user context
 * @returns {Promise<{ homeworks: Array, pagination: Object }>}
 */
export async function listHomework(schoolId, query = {}, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to list homework');
  }

  const role = (actor?.systemRole || actor?.role || '').toUpperCase();
  let effectiveClassId = query.classId;

  // If teacher, enforce assigned class scoping
  if (role === SYSTEM_ROLES.TEACHER || role === 'TEACHER') {
    const userId = actor.id || actor.userId;
    const profile = await homeworkRepository.findStaffProfileByUserId(schoolId, userId);
    if (!profile || !profile.assignedClassId) {
      return {
        homeworks: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false
        }
      };
    }
    if (effectiveClassId && effectiveClassId !== profile.assignedClassId) {
      throw new ForbiddenError('Teachers can only access homework for their assigned class');
    }
    effectiveClassId = profile.assignedClassId;
  }

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));

  const options = {
    classId: effectiveClassId,
    subjectId: query.subjectId,
    startDate: query.startDate,
    endDate: query.endDate,
    search: query.search,
    page,
    limit,
    sort: query.sort,
    order: query.order
  };

  const { homeworks, total } = await homeworkRepository.findHomeworkList(schoolId, options);
  const totalPages = Math.ceil(total / limit) || 1;

  return {
    homeworks: homeworks.map(formatHomeworkSummary),
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1
    }
  };
}

/**
 * Retrieves a single homework assignment with full student submission roster.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} homeworkId - Homework UUID
 * @param {Object} [actor=null] - Authenticated user context
 * @returns {Promise<Object>} Formatted Homework Detail Roster DTO
 */
export async function getHomeworkById(schoolId, homeworkId, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to retrieve homework');
  }

  const assignment = await homeworkRepository.findHomeworkWithRoster(schoolId, homeworkId);
  if (!assignment) {
    throw new NotFoundError('Homework assignment');
  }

  await authorizeTeacherClass(schoolId, assignment.classId, actor);

  return formatHomeworkDetailWithRoster(assignment);
}

/**
 * Creates a new homework assignment.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} data - Assignment payload
 * @param {Object} [actor=null] - Authenticated user context
 * @returns {Promise<Object>} Created Homework DTO
 */
export async function createHomework(schoolId, data, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to create homework');
  }

  // 1. Verify Class in tenant
  const targetClass = await homeworkRepository.findClassById(schoolId, data.classId);
  if (!targetClass) {
    throw new NotFoundError('Class');
  }

  // 2. Authorize teacher for class
  await authorizeTeacherClass(schoolId, data.classId, actor);

  // 3. Verify Subject in tenant
  const targetSubject = await homeworkRepository.findSubjectById(schoolId, data.subjectId);
  if (!targetSubject) {
    throw new NotFoundError('Subject');
  }

  // 4. Normalize attachments, remarks, maxMarks
  const structuredAttachments = normalizeAttachments(data.attachments, data.remarks, data.maxMarks);

  // 5. Create assignment
  const created = await homeworkRepository.createHomework(schoolId, {
    title: data.title,
    description: data.description,
    classId: data.classId,
    subjectId: data.subjectId,
    dueDate: data.dueDate,
    attachments: structuredAttachments
  });

  // 6. Audit log (non-blocking)
  createAuditLog({
    schoolId,
    action: 'homework.assignment.create',
    entityType: 'HomeworkAssignment',
    entityId: created.id,
    userId: actor?.id || actor?.userId || null,
    metadata: {
      title: created.title,
      classId: created.classId,
      subjectId: created.subjectId,
      dueDate: created.dueDate
    }
  }).catch(() => {});

  return formatHomeworkSummary(created);
}

/**
 * Updates an existing homework assignment.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} homeworkId - Homework UUID
 * @param {Object} data - Update fields
 * @param {Object} [actor=null] - Authenticated user context
 * @returns {Promise<Object>} Updated Homework DTO
 */
export async function updateHomework(schoolId, homeworkId, data, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to update homework');
  }

  const existing = await homeworkRepository.findHomeworkById(schoolId, homeworkId);
  if (!existing) {
    throw new NotFoundError('Homework assignment');
  }

  await authorizeTeacherClass(schoolId, existing.classId, actor);

  const updatePayload = {};

  if (data.title !== undefined) updatePayload.title = data.title;
  if (data.description !== undefined) updatePayload.description = data.description;
  if (data.dueDate !== undefined) updatePayload.dueDate = data.dueDate;

  // Class modification protection
  if (data.classId !== undefined && data.classId !== existing.classId) {
    const submissionCount = await homeworkRepository.countSubmissionsByHomeworkId(schoolId, homeworkId);
    if (submissionCount > 0) {
      throw new ValidationError('Cannot change class for a homework assignment with existing student submissions');
    }

    const newClass = await homeworkRepository.findClassById(schoolId, data.classId);
    if (!newClass) {
      throw new NotFoundError('Class');
    }
    await authorizeTeacherClass(schoolId, data.classId, actor);
    updatePayload.classId = data.classId;
  }

  // Subject modification
  if (data.subjectId !== undefined) {
    const newSubject = await homeworkRepository.findSubjectById(schoolId, data.subjectId);
    if (!newSubject) {
      throw new NotFoundError('Subject');
    }
    updatePayload.subjectId = data.subjectId;
  }

  // Attachments / remarks / maxMarks preservation
  if (data.attachments !== undefined || data.remarks !== undefined || data.maxMarks !== undefined) {
    const existingExtracted = extractAttachmentDetails(existing.attachments);
    const attachmentsToUse = data.attachments !== undefined ? data.attachments : existingExtracted.files;
    const remarksToUse = data.remarks !== undefined ? data.remarks : existingExtracted.remarks;
    const maxMarksToUse = data.maxMarks !== undefined ? data.maxMarks : existingExtracted.maxMarks;

    updatePayload.attachments = normalizeAttachments(attachmentsToUse, remarksToUse, maxMarksToUse);
  }

  const updated = await homeworkRepository.updateHomework(schoolId, homeworkId, updatePayload);

  createAuditLog({
    schoolId,
    action: 'homework.assignment.update',
    entityType: 'HomeworkAssignment',
    entityId: updated.id,
    userId: actor?.id || actor?.userId || null,
    metadata: {
      changedFields: Object.keys(updatePayload)
    }
  }).catch(() => {});

  return formatHomeworkSummary(updated);
}

/**
 * Deletes a homework assignment and its cascading submissions.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} homeworkId - Homework UUID
 * @param {Object} [actor=null] - Authenticated user context
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function deleteHomework(schoolId, homeworkId, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to delete homework');
  }

  const existing = await homeworkRepository.findHomeworkById(schoolId, homeworkId);
  if (!existing) {
    throw new NotFoundError('Homework assignment');
  }

  await authorizeTeacherClass(schoolId, existing.classId, actor);

  await homeworkRepository.deleteHomework(schoolId, homeworkId);

  createAuditLog({
    schoolId,
    action: 'homework.assignment.delete',
    entityType: 'HomeworkAssignment',
    entityId: homeworkId,
    userId: actor?.id || actor?.userId || null,
    metadata: {
      title: existing.title,
      classId: existing.classId
    }
  }).catch(() => {});

  return { success: true, message: 'Homework assignment deleted successfully' };
}

/**
 * Staff updates or grades a student's submission.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} homeworkId - Homework UUID
 * @param {string} studentId - Student UUID
 * @param {Object} data - Update fields ({ status, grade, feedback })
 * @param {Object} [actor=null] - Authenticated user context
 * @returns {Promise<Object>} Updated submission DTO
 */
export async function updateStaffSubmission(schoolId, homeworkId, studentId, data, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to evaluate submission');
  }

  const assignment = await homeworkRepository.findHomeworkById(schoolId, homeworkId);
  if (!assignment) {
    throw new NotFoundError('Homework assignment');
  }

  await authorizeTeacherClass(schoolId, assignment.classId, actor);

  const student = await homeworkRepository.findStudentInTenant(schoolId, studentId);
  if (!student || student.classId !== assignment.classId) {
    throw new NotFoundError('Student in assignment class');
  }

  const submissionPayload = {};
  if (data.status !== undefined) submissionPayload.status = data.status;
  if (data.grade !== undefined) submissionPayload.grade = data.grade;
  if (data.feedback !== undefined) submissionPayload.feedback = data.feedback;

  if (data.status === 'Submitted') {
    submissionPayload.submittedAt = new Date();
  }

  const upserted = await homeworkRepository.upsertSubmission(
    schoolId,
    homeworkId,
    studentId,
    submissionPayload
  );

  const auditAction =
    data.grade !== undefined || data.feedback !== undefined
      ? 'homework.submission.grade'
      : 'homework.submission.status_update';

  createAuditLog({
    schoolId,
    action: auditAction,
    entityType: 'HomeworkSubmission',
    entityId: upserted.id,
    userId: actor?.id || actor?.userId || null,
    metadata: {
      homeworkId,
      studentId,
      status: upserted.status,
      grade: upserted.grade
    }
  }).catch(() => {});

  return {
    id: upserted.id,
    homeworkId: upserted.homeworkId,
    studentId: upserted.studentId,
    status: upserted.status,
    grade: upserted.grade,
    feedback: upserted.feedback,
    submittedAt: upserted.status === 'Submitted' ? upserted.submittedAt : null,
    updatedAt: upserted.updatedAt
  };
}

// ============================================================
// PARENT / STUDENT SERVICE METHODS
// ============================================================

/**
 * Retrieves student-scoped homework assignments for student's class with merged submission data.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} studentId - Student UUID
 * @param {Object} [query={}] - Query parameters
 * @param {Object} [actor=null] - Authenticated user context
 * @returns {Promise<{ homeworks: Array, pagination: Object }>}
 */
export async function getStudentHomework(schoolId, studentId, query = {}, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to retrieve student homework');
  }

  // 1. Verify student exists in tenant
  const student = await homeworkRepository.findStudentInTenant(schoolId, studentId);
  if (!student) {
    throw new NotFoundError('Student');
  }

  // 2. Check parent authorization if parent
  const role = (actor?.systemRole || actor?.role || '').toUpperCase();
  if (role === SYSTEM_ROLES.PARENT || role === 'PARENT') {
    const userId = actor.id || actor.userId;
    const authorizedStudentIds = await homeworkRepository.findAuthorizedStudentIdsForParent(schoolId, userId);

    if (!authorizedStudentIds.includes(studentId)) {
      throw new NotFoundError('Student');
    }
  }

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));

  const options = {
    subjectId: query.subjectId,
    search: query.search,
    page,
    limit,
    sort: query.sort,
    order: query.order
  };

  const { homeworks, total } = await homeworkRepository.findStudentHomeworkList(
    schoolId,
    student.classId,
    studentId,
    options
  );

  let formattedList = homeworks.map((hw) => {
    const submission = hw.submissions && hw.submissions.length > 0 ? hw.submissions[0] : null;
    return formatParentHomework(hw, submission);
  });

  // In-memory status filter if query.status is specified (since missing submissions synthesize 'Not Started')
  if (query.status) {
    formattedList = formattedList.filter((item) => item.submission.status === query.status);
  }

  const totalPages = Math.ceil(total / limit) || 1;

  return {
    homeworks: formattedList,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1
    }
  };
}

/**
 * Parent updates student homework status via self-service.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} studentId - Student UUID
 * @param {string} homeworkId - Homework UUID
 * @param {Object} data - Payload ({ status })
 * @param {Object} [actor=null] - Authenticated user context
 * @returns {Promise<Object>} Updated submission status DTO
 */
export async function updateStudentHomeworkStatus(schoolId, studentId, homeworkId, data, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to update homework status');
  }

  // 1. Verify student exists in tenant
  const student = await homeworkRepository.findStudentInTenant(schoolId, studentId);
  if (!student) {
    throw new NotFoundError('Student');
  }

  // 2. Check parent authorization if parent
  const role = (actor?.systemRole || actor?.role || '').toUpperCase();
  if (role === SYSTEM_ROLES.PARENT || role === 'PARENT') {
    const userId = actor.id || actor.userId;
    const authorizedStudentIds = await homeworkRepository.findAuthorizedStudentIdsForParent(schoolId, userId);

    if (!authorizedStudentIds.includes(studentId)) {
      throw new NotFoundError('Student');
    }
  }

  // 3. Verify homework exists in student's class and tenant
  const assignment = await homeworkRepository.findHomeworkById(schoolId, homeworkId);
  if (!assignment || assignment.classId !== student.classId) {
    throw new NotFoundError('Homework assignment for student class');
  }

  // 4. Atomic upsert submission status
  const submissionPayload = {
    status: data.status
  };
  if (data.status === 'Submitted') {
    submissionPayload.submittedAt = new Date();
  }

  const upserted = await homeworkRepository.upsertSubmission(
    schoolId,
    homeworkId,
    studentId,
    submissionPayload
  );

  createAuditLog({
    schoolId,
    action: 'homework.submission.status_update',
    entityType: 'HomeworkSubmission',
    entityId: upserted.id,
    userId: actor?.id || actor?.userId || null,
    metadata: {
      homeworkId,
      studentId,
      status: upserted.status
    }
  }).catch(() => {});

  return {
    id: upserted.id,
    homeworkId: upserted.homeworkId,
    studentId: upserted.studentId,
    status: upserted.status,
    submittedAt: upserted.status === 'Submitted' ? upserted.submittedAt : null,
    grade: upserted.grade || null,
    feedback: upserted.feedback || null,
    updatedAt: upserted.updatedAt
  };
}

/**
 * Computes unread/new homework count for the authenticated actor.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string|null} since - ISO timestamp representing lastViewed cutoff
 * @param {Object} [actor=null] - Authenticated user context
 * @returns {Promise<{ count: number }>}
 */
export async function getUnreadHomeworkCount(schoolId, since = null, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to retrieve unread homework count');
  }

  const role = (actor?.systemRole || actor?.role || '').toUpperCase();
  let sinceDate = null;
  if (since) {
    const parsed = new Date(since);
    if (!isNaN(parsed.getTime())) {
      sinceDate = parsed;
    }
  }

  let count = 0;

  if (role === SYSTEM_ROLES.TEACHER || role === 'TEACHER') {
    const userId = actor?.id || actor?.userId;
    const profile = await homeworkRepository.findStaffProfileByUserId(schoolId, userId);
    if (profile?.assignedClassId) {
      count = await homeworkRepository.countHomeworkSince(schoolId, {
        classIds: [profile.assignedClassId],
        sinceDate
      });
    }
  } else if (role === SYSTEM_ROLES.PARENT || role === 'PARENT') {
    const userId = actor?.id || actor?.userId;
    const authorizedStudentIds = await homeworkRepository.findAuthorizedStudentIdsForParent(schoolId, userId);
    if (authorizedStudentIds && authorizedStudentIds.length > 0) {
      const students = await homeworkRepository.findStudentsClasses(schoolId, authorizedStudentIds);
      const classIds = [...new Set(students.map((s) => s.classId).filter(Boolean))];
      if (classIds.length > 0) {
        count = await homeworkRepository.countHomeworkSince(schoolId, {
          classIds,
          sinceDate
        });
      }
    }
  } else if (
    role === SYSTEM_ROLES.SUPER_ADMIN ||
    role === SYSTEM_ROLES.ADMIN ||
    role === SYSTEM_ROLES.SCHOOL_ADMIN ||
    role === 'SUPER_ADMIN' ||
    role === 'ADMIN' ||
    role === 'SCHOOL_ADMIN'
  ) {
    count = await homeworkRepository.countHomeworkSince(schoolId, { sinceDate });
  }

  return { count };
}


