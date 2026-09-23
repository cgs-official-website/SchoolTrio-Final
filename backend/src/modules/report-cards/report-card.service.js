import { prisma } from '../../database/prisma.client.js';
import * as reportCardRepository from './report-card.repository.js';
import { getReportCardTemplate } from '../report-card-templates/report-card-template.service.js';
import { findExamById } from '../exams/exam.repository.js';
import { aggregateStudentRecords } from '../attendance/attendance.repository.js';
import { resolveAcademicYear } from '../attendance/attendance.service.js';
import { findStudents, findStudentByIdForUpdate } from '../students/student.repository.js';
import { findStaffProfileByUserId } from '../assessments/assessment.repository.js';
import { findParentByUserId, findParentStudentLink } from '../parents/parent.repository.js';
import { createAuditLog } from '../audit/audit.repository.js';
import { SYSTEM_ROLES } from '../../config/constants.js';
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  TenantAccessError
} from '../../utils/app-error.js';
import { parsePagination, buildPaginationMetadata } from '../../utils/pagination.js';
import { logger } from '../../utils/logger.js';

/**
 * Report Card Service
 * Core business domain logic for ReportCard preview generation, marks & attendance aggregation,
 * publication snapshot construction, idempotency, and role-based parent/student access control.
 */

/**
 * Calculates standard CBSE letter grade from percentage (A1 to E).
 *
 * @param {number|string} percentage - Percentage score (0-100)
 * @returns {string} Letter grade ('A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | 'D' | 'E')
 */
export function calculateLetterGrade(percentage) {
  const pct = Number(percentage);
  if (isNaN(pct) || pct < 0) return 'E';
  if (pct >= 91) return 'A1';
  if (pct >= 81) return 'A2';
  if (pct >= 71) return 'B1';
  if (pct >= 61) return 'B2';
  if (pct >= 51) return 'C1';
  if (pct >= 41) return 'C2';
  if (pct >= 33) return 'D';
  return 'E';
}

/**
 * Serializes a ReportCard database entity for clean client output.
 *
 * @param {Object} reportCard - ReportCard database record
 * @returns {Object} Clean domain object
 */
export function serializeReportCard(reportCard) {
  if (!reportCard) return null;
  return {
    id: reportCard.id,
    schoolId: reportCard.schoolId,
    studentId: reportCard.studentId,
    title: reportCard.title,
    term: reportCard.term || null,
    examId: reportCard.examId || null,
    marksData: reportCard.marksData,
    grades: reportCard.grades || null,
    attendanceSummary: reportCard.attendanceSummary || null,
    publishedAt: reportCard.publishedAt,
    updatedAt: reportCard.updatedAt,
    student: reportCard.student
      ? {
          id: reportCard.student.id,
          firstName: reportCard.student.firstName,
          lastName: reportCard.student.lastName || null,
          admissionNumber: reportCard.student.admissionNumber,
          rollNumber: reportCard.student.rollNumber || null,
          classId: reportCard.student.classId,
          className: reportCard.student.class?.name || null,
          sectionName: reportCard.student.section?.name || null
        }
      : undefined
  };
}

/**
 * Verifies that the caller is authorized to view or manage report cards for a target class.
 * Teachers are strictly scoped to their assigned class.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} classId - Target class UUID
 * @param {Object} actor - Authenticated user identity
 */
async function authorizeClassManagement(schoolId, classId, actor) {
  if (!actor) return;
  const role = (actor.systemRole || actor.role || '').toUpperCase();
  if (role === SYSTEM_ROLES.TEACHER || role === 'TEACHER') {
    const userId = actor.id || actor.userId;
    const profile = await findStaffProfileByUserId(schoolId, userId);
    if (!profile || profile.assignedClassId !== classId) {
      throw new ForbiddenError('Teachers are only authorized to manage report cards for their assigned class');
    }
  }
}

/**
 * Verifies that the caller is authorized to read a student's report cards.
 * Parents are scoped strictly to their linked children.
 * Students are scoped strictly to their own student record.
 * Teachers are scoped to their assigned class.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {Object} student - Student record with classId
 * @param {Object} actor - Authenticated user identity
 */
async function authorizeStudentReportCardAccess(schoolId, student, actor) {
  if (!actor) return;
  const role = (actor.systemRole || actor.role || '').toUpperCase();

  // Superadmin, Principal, Admin have school-wide read access
  if ([SYSTEM_ROLES.SUPER_ADMIN, SYSTEM_ROLES.PRINCIPAL, SYSTEM_ROLES.ADMIN, 'SUPER_ADMIN', 'PRINCIPAL', 'ADMIN'].includes(role)) {
    return;
  }

  // Teacher check
  if (role === SYSTEM_ROLES.TEACHER || role === 'TEACHER') {
    const userId = actor.id || actor.userId;
    const profile = await findStaffProfileByUserId(schoolId, userId);
    if (!profile || profile.assignedClassId !== student.classId) {
      throw new ForbiddenError('Teachers are only authorized to view report cards for students in their assigned class');
    }
    return;
  }

  // Parent check
  if (role === SYSTEM_ROLES.PARENT || role === 'PARENT') {
    const userId = actor.id || actor.userId;
    const parentProfile = await findParentByUserId(userId);
    if (!parentProfile) {
      throw new ForbiddenError('Parent profile not found');
    }
    const link = await findParentStudentLink(schoolId, student.id, parentProfile.id);
    if (!link) {
      throw new ForbiddenError('Access denied: You are not linked to this student');
    }
    return;
  }

  // Student check
  if (role === SYSTEM_ROLES.STUDENT || role === 'STUDENT') {
    const actorStudentId = actor.studentId || actor.id;
    if (actorStudentId !== student.id) {
      throw new ForbiddenError('Access denied: Students can only view their own report cards');
    }
    return;
  }
}

/**
 * Gathers and aggregates all academic marks, grades, attendance, and template configuration
 * for students in a class (for either a formal examination or continuous assessment).
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} classId - Class UUID
 * @param {string|null} [examId=null] - Optional Examination UUID (null for continuous assessment)
 * @param {Array<string>} [targetStudentIds=null] - Optional subset of student UUIDs
 * @param {Object} [actor=null] - Authenticated user identity
 * @returns {Promise<{
 *   targetClass: Object,
 *   exam: Object|null,
 *   template: Object,
 *   academicYear: string,
 *   studentCards: Array<Object>
 * }>}
 */
async function aggregateReportCardData(schoolId, classId, examId = null, targetStudentIds = null, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required');
  }

  // 1. Authorize class access
  await authorizeClassManagement(schoolId, classId, actor);

  // 2. Validate Class
  const targetClass = await prisma.class.findFirst({
    where: {
      id: classId,
      schoolId
    }
  });
  if (!targetClass) {
    throw new NotFoundError('Class not found');
  }

  // 3. Validate Exam (if formal exam report)
  let exam = null;
  let examAssessments = [];
  if (examId) {
    exam = await findExamById(schoolId, examId);
    if (!exam) {
      throw new NotFoundError('Examination not found');
    }

    // Assessments linked to this exam and class
    examAssessments = await prisma.assessment.findMany({
      where: {
        schoolId,
        classId,
        examId
      },
      orderBy: {
        createdAt: 'asc'
      }
    });
  } else {
    // Continuous assessment summary: include all class assessments
    examAssessments = await prisma.assessment.findMany({
      where: {
        schoolId,
        classId
      },
      orderBy: {
        createdAt: 'asc'
      }
    });
  }

  // 4. Resolve Template
  const template = await getReportCardTemplate(schoolId, 'report_card');

  // 5. Resolve Academic Year & Attendance Date Range
  const academicYear = exam?.academicYear || await resolveAcademicYear(schoolId);
  const startYear = parseInt(academicYear.split('-')[0], 10) || new Date().getFullYear();
  const academicYearStartDate = `${startYear}-04-01`;
  const todayDate = new Date().toISOString().split('T')[0];

  const attendanceStartDate = exam?.startDate || academicYearStartDate;
  const attendanceEndDate = exam?.endDate || todayDate;

  // 6. Fetch Enrolled Students
  const allStudents = await findStudents(schoolId, { classId, take: 500 });
  let studentsToProcess = allStudents;

  if (targetStudentIds && Array.isArray(targetStudentIds) && targetStudentIds.length > 0) {
    const studentIdSet = new Set(targetStudentIds);
    studentsToProcess = allStudents.filter(s => studentIdSet.has(s.id));
    if (studentsToProcess.length !== targetStudentIds.length) {
      throw new ValidationError('One or more selected students do not belong to the target class');
    }
  }

  // Sort alphabetically by first name, last name
  studentsToProcess.sort((a, b) => a.firstName.localeCompare(b.firstName) || (a.lastName || '').localeCompare(b.lastName || ''));

  // 7. Fetch all Assessment Grades for the relevant assessments
  const assessmentIds = examAssessments.map(a => a.id);
  const gradesRecords = assessmentIds.length > 0
    ? await prisma.assessmentGrade.findMany({
        where: {
          schoolId,
          assessmentId: { in: assessmentIds }
        }
      })
    : [];

  // Group grades by studentId -> assessmentId -> gradeRecord
  const gradeMap = new Map();
  for (const g of gradesRecords) {
    if (!gradeMap.has(g.studentId)) {
      gradeMap.set(g.studentId, new Map());
    }
    gradeMap.get(g.studentId).set(g.assessmentId, g);
  }

  // 8. Process each student
  const studentCards = [];

  for (const student of studentsToProcess) {
    const marksBreakdown = {};
    let totalObtained = 0;
    let totalMax = 0;
    const subjectGrades = {};

    const studentGrades = gradeMap.get(student.id) || new Map();

    for (const assessment of examAssessments) {
      const gradeRecord = studentGrades.get(assessment.id);
      const maxMarks = Number(assessment.totalMarks);

      if (gradeRecord && gradeRecord.marksObtained !== null && gradeRecord.marksObtained !== undefined) {
        const obtained = Number(gradeRecord.marksObtained);
        totalObtained += obtained;
        totalMax += maxMarks;

        const subjectPercentage = maxMarks > 0 ? (obtained / maxMarks) * 100 : 0;
        const letterGrade = calculateLetterGrade(subjectPercentage);
        subjectGrades[assessment.id] = letterGrade;

        marksBreakdown[assessment.id] = {
          title: assessment.title,
          subjectId: assessment.subjectId || null,
          obtained,
          max: maxMarks,
          grade: letterGrade,
          remarks: gradeRecord.remarks || null
        };
      } else {
        totalMax += maxMarks;
        marksBreakdown[assessment.id] = {
          title: assessment.title,
          subjectId: assessment.subjectId || null,
          obtained: '-',
          max: maxMarks,
          grade: '-',
          remarks: null
        };
      }
    }

    const percentage = totalMax > 0 ? Number(((totalObtained / totalMax) * 100).toFixed(1)) : 0.0;
    const overallGrade = calculateLetterGrade(percentage);

    // 9. Compute Attendance
    const attendanceStats = await aggregateStudentRecords(
      schoolId,
      student.id,
      attendanceStartDate,
      attendanceEndDate
    );

    const attendanceSummary = {
      totalSessions: attendanceStats.totalDays,
      present: attendanceStats.presentDays,
      late: attendanceStats.lateDays,
      absent: attendanceStats.absentDays,
      percentage: attendanceStats.percentage
    };

    const title = exam ? exam.name : 'Class Assessments Summary';
    const term = exam ? exam.term || null : null;

    const publisherName = actor?.name || actor?.email || 'Class Teacher';

    const marksData = {
      classId,
      className: targetClass.name,
      studentId: student.id,
      studentName: `${student.firstName} ${student.lastName || ''}`.trim(),
      admissionNumber: student.admissionNumber,
      rollNumber: student.rollNumber || null,
      marks: marksBreakdown,
      totalObtained,
      totalMax,
      percentage: percentage.toFixed(1),
      overallGrade,
      reportTemplate: template.config,
      publishedBy: publisherName
    };

    const gradesPayload = {
      totalObtained,
      totalMax,
      percentage,
      overallGrade,
      subjectGrades
    };

    studentCards.push({
      student,
      title,
      term,
      examId: exam ? exam.id : null,
      marksData,
      grades: gradesPayload,
      attendanceSummary
    });
  }

  return {
    targetClass,
    exam,
    template,
    academicYear,
    studentCards
  };
}

/**
 * Generates an in-memory preview of report cards for a class without persisting to the database.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {Object} input - { classId, examId }
 * @param {Object} [actor=null] - Authenticated user identity
 * @returns {Promise<Object>}
 */
export async function generateReportCardPreview(schoolId, input = {}, actor = null) {
  const { classId, examId } = input;
  if (!classId) {
    throw new ValidationError('classId is required');
  }

  const { targetClass, exam, template, academicYear, studentCards } = await aggregateReportCardData(
    schoolId,
    classId,
    examId || null,
    null,
    actor
  );

  return {
    classId: targetClass.id,
    className: targetClass.name,
    examId: exam ? exam.id : null,
    examName: exam ? exam.name : 'Class Assessments Summary',
    term: exam ? exam.term || null : null,
    academicYear,
    template: template.config,
    studentsCount: studentCards.length,
    students: studentCards.map(c => ({
      student: {
        id: c.student.id,
        firstName: c.student.firstName,
        lastName: c.student.lastName,
        admissionNumber: c.student.admissionNumber,
        rollNumber: c.student.rollNumber
      },
      title: c.title,
      term: c.term,
      marks: c.marksData.marks,
      totalObtained: c.marksData.totalObtained,
      totalMax: c.marksData.totalMax,
      percentage: c.marksData.percentage,
      overallGrade: c.marksData.overallGrade,
      attendanceSummary: c.attendanceSummary
    }))
  };
}

/**
 * Publishes and persists historical snapshot report cards for students in a class.
 * Uses atomic upsert semantics:
 * - Formal: keyed on (schoolId, studentId, examId)
 * - Continuous: keyed on (schoolId, studentId, classId)
 * Emits post-commit non-blocking audit logging.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {Object} input - { classId, examId, studentIds }
 * @param {Object} [actor=null] - Authenticated user identity
 * @returns {Promise<{ publishedCount: number, reportCards: Array<Object> }>}
 */
export async function publishReportCards(schoolId, input = {}, actor = null) {
  const { classId, examId, studentIds } = input;
  if (!classId) {
    throw new ValidationError('classId is required');
  }

  const { targetClass, exam, studentCards } = await aggregateReportCardData(
    schoolId,
    classId,
    examId || null,
    studentIds || null,
    actor
  );

  if (studentCards.length === 0) {
    throw new ValidationError('No students found to publish report cards');
  }

  // Execute atomic batch upsert inside transaction
  const publishedRecords = await prisma.$transaction(async (tx) => {
    const results = [];
    const publishedTimestamp = new Date();

    for (const card of studentCards) {
      // 1. Acquire pessimistic row-lock on student to prevent concurrent duplicate publishing
      await findStudentByIdForUpdate(schoolId, card.student.id, tx);

      const payload = {
        title: card.title,
        term: card.term,
        marksData: card.marksData,
        grades: card.grades,
        attendanceSummary: card.attendanceSummary,
        publishedAt: publishedTimestamp
      };

      let savedRecord;
      if (card.examId) {
        // Formal Exam Report Card
        savedRecord = await reportCardRepository.upsertFormalReportCard(
          schoolId,
          card.student.id,
          card.examId,
          payload,
          tx
        );
      } else {
        // Continuous Assessment Report Card
        savedRecord = await reportCardRepository.upsertContinuousReportCard(
          schoolId,
          card.student.id,
          classId,
          payload,
          tx
        );
      }

      results.push(savedRecord);
    }

    return results;
  });

  // Post-commit non-blocking audit log
  try {
    const userId = actor ? (actor.id || actor.userId) : null;
    const userName = actor?.name || actor?.email || 'Administrator';
    const userRole = actor?.systemRole || actor?.role || null;

    await createAuditLog({
      schoolId,
      userId,
      entityType: 'ReportCard',
      entityId: publishedRecords[0]?.id || classId,
      actionPerformed: exam ? 'PUBLISH_FORMAL_REPORT_CARDS' : 'PUBLISH_CONTINUOUS_REPORT_CARDS',
      userName,
      userRole,
      modifiedFields: {
        classId,
        className: targetClass.name,
        examId: exam ? exam.id : null,
        examName: exam ? exam.name : 'Class Assessments Summary',
        publishedCount: publishedRecords.length
      }
    });
  } catch (auditErr) {
    logger.warn({ msg: '[AUDIT LOG WARNING] Failed to record report card publish audit log', error: auditErr.message });
  }

  return {
    publishedCount: publishedRecords.length,
    reportCards: publishedRecords.map(r => serializeReportCard(r))
  };
}

/**
 * Retrieves a single ReportCard by ID within tenant scope, verifying caller access permissions.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} id - ReportCard UUID
 * @param {Object} [actor=null] - Authenticated user identity
 * @returns {Promise<Object>}
 */
export async function getReportCard(schoolId, id, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required');
  }
  if (!id) {
    throw new ValidationError('Report card ID is required');
  }

  const reportCard = await reportCardRepository.findReportCardById(schoolId, id);
  if (!reportCard) {
    throw new NotFoundError('Report card not found');
  }

  // Authorize student-level access (for Parent / Student / Teacher)
  if (actor && reportCard.student) {
    await authorizeStudentReportCardAccess(schoolId, reportCard.student, actor);
  }

  return serializeReportCard(reportCard);
}

/**
 * Lists published report cards for a specific student with pagination.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} studentId - Student UUID
 * @param {Object} [query={}] - Query params (examId, page, limit, sort, order)
 * @param {Object} [actor=null] - Authenticated user identity
 * @returns {Promise<{ reportCards: Array<Object>, pagination: Object }>}
 */
export async function listStudentReportCards(schoolId, studentId, query = {}, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required');
  }
  if (!studentId) {
    throw new ValidationError('studentId is required');
  }

  // Verify student exists within tenant
  const student = await prisma.student.findFirst({
    where: {
      id: studentId,
      schoolId
    }
  });
  if (!student) {
    throw new NotFoundError('Student not found');
  }

  // Authorize caller access for this student
  await authorizeStudentReportCardAccess(schoolId, student, actor);

  const paginationParams = parsePagination(query, {
    defaultSort: 'publishedAt',
    defaultOrder: 'desc'
  });

  const filterOptions = {
    examId: query.examId || undefined
  };

  const paginationOptions = {
    page: paginationParams.page,
    limit: paginationParams.limit,
    skip: paginationParams.skip,
    sort: paginationParams.sort,
    order: paginationParams.order
  };

  const result = await reportCardRepository.findReportCardsByStudent(
    schoolId,
    studentId,
    filterOptions,
    paginationOptions
  );

  const pagination = buildPaginationMetadata(result.total, paginationParams.page, paginationParams.limit);

  return {
    reportCards: result.items.map(r => serializeReportCard(r)),
    pagination
  };
}

/**
 * Lists published report cards for a class with pagination.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} classId - Class UUID
 * @param {Object} [query={}] - Query params (examId, page, limit, sort, order)
 * @param {Object} [actor=null] - Authenticated user identity
 * @returns {Promise<{ reportCards: Array<Object>, pagination: Object }>}
 */
export async function listClassReportCards(schoolId, classId, query = {}, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required');
  }
  if (!classId) {
    throw new ValidationError('classId is required');
  }

  // Authorize class access
  await authorizeClassManagement(schoolId, classId, actor);

  const paginationParams = parsePagination(query, {
    defaultSort: 'publishedAt',
    defaultOrder: 'desc'
  });

  const filterOptions = {
    examId: query.examId || undefined
  };

  const paginationOptions = {
    page: paginationParams.page,
    limit: paginationParams.limit,
    skip: paginationParams.skip,
    sort: paginationParams.sort,
    order: paginationParams.order
  };

  const result = await reportCardRepository.findReportCardsByClass(
    schoolId,
    classId,
    filterOptions,
    paginationOptions
  );

  const pagination = buildPaginationMetadata(result.total, paginationParams.page, paginationParams.limit);

  return {
    reportCards: result.items.map(r => serializeReportCard(r)),
    pagination
  };
}
