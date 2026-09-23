import * as attendanceRepository from './attendance.repository.js';
import { prisma } from '../../database/prisma.client.js';
import { createAuditLog } from '../audit/audit.repository.js';
import {
  NotFoundError,
  ForbiddenError,
  TenantAccessError,
  ValidationError
} from '../../utils/app-error.js';
import { SYSTEM_ROLES } from '../../config/constants.js';

/**
 * Attendance & Daily Operations Service Layer
 */

/**
 * Resolves the academic year for an attendance date.
 * Resolution Priority:
 * 1. Explicit valid academicYear argument.
 * 2. SchoolSetting with category = 'academicConfig'.
 * 3. Deterministic April 1 - March 31 boundary calculation.
 */
export async function resolveAcademicYear(schoolId, explicitYear = null, dateStr = null) {
  if (explicitYear && typeof explicitYear === 'string' && explicitYear.trim()) {
    return explicitYear.trim();
  }

  if (schoolId) {
    const setting = await prisma.schoolSetting.findFirst({
      where: {
        schoolId,
        category: 'academicConfig'
      }
    });
    if (setting?.data?.academicYear) {
      return String(setting.data.academicYear).trim();
    }
  }

  // Fallback: Indian Academic Year (April 1 – March 31)
  const d = dateStr ? new Date(dateStr) : new Date();
  const month = d.getMonth(); // 0-indexed: 0 = Jan, 3 = April
  let startYear = d.getFullYear();
  if (month < 3) {
    startYear -= 1;
  }
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

/**
 * Resolves the absentee threshold for a school (default: 2).
 */
export async function resolveAbsenteeThreshold(schoolId) {
  if (!schoolId) return 2;
  const setting = await prisma.schoolSetting.findFirst({
    where: {
      schoolId,
      category: 'attendanceSettings'
    }
  });
  const threshold = Number(setting?.data?.absenteeThreshold);
  return Number.isInteger(threshold) && threshold > 0 ? threshold : 2;
}

/**
 * Verifies whether the requesting actor is authorized to mark or update attendance for a given class.
 */
export async function verifyTeacherClassAuthorization(schoolId, classId, actor) {
  if (!actor) {
    throw new ForbiddenError('Authentication context required');
  }

  const systemRole = actor.systemRole || actor.role;

  // 1. SuperAdmin and SchoolAdmin have full institutional access across all classes
  if (systemRole === SYSTEM_ROLES.SUPER_ADMIN || systemRole === SYSTEM_ROLES.SCHOOL_ADMIN || systemRole === 'admin' || systemRole === 'superadmin') {
    return true;
  }

  // 2. Check if user holds institutional permissions that grant school-wide attendance management
  const permissions = actor.permissions || [];
  if (permissions.includes('attendance:create') || permissions.includes('attendance:edit') || permissions.includes('attendance.create') || permissions.includes('attendance.edit')) {
    return true;
  }

  // 3. Class Teacher: Must be assigned as the classTeacherId for this specific class
  const staffProfile = await prisma.staffProfile.findFirst({
    where: {
      schoolId,
      userId: actor.id || actor.userId
    },
    select: {
      id: true,
      assignedClassId: true
    }
  });

  if (!staffProfile) {
    throw new ForbiddenError('Staff profile not found for this user in current tenant');
  }

  const targetClass = await prisma.class.findFirst({
    where: {
      id: classId,
      schoolId
    },
    select: {
      id: true,
      classTeacherId: true
    }
  });

  if (!targetClass) {
    throw new NotFoundError('Class');
  }

  const isClassTeacher = targetClass.classTeacherId === staffProfile.id || staffProfile.assignedClassId === classId;
  if (!isClassTeacher) {
    throw new ForbiddenError('You are only authorized to mark attendance for your assigned class');
  }

  return true;
}

/**
 * Lists paginated attendance sessions for a tenant.
 */
export async function listSessions(schoolId, query = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to list attendance sessions');
  }

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const options = {
    classId: query.classId,
    sectionId: query.sectionId,
    date: query.date,
    startDate: query.startDate,
    endDate: query.endDate,
    session: query.session,
    skip,
    take: limit,
    sort: query.sort,
    order: query.order
  };

  const [sessions, total] = await Promise.all([
    attendanceRepository.findSessions(schoolId, options),
    attendanceRepository.countSessions(schoolId, options)
  ]);

  return {
    sessions,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1
    }
  };
}

/**
 * Retrieves a single attendance session with full student records.
 */
export async function getSessionById(schoolId, id) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required');
  }

  const session = await attendanceRepository.findSessionById(schoolId, id);
  if (!session) {
    throw new NotFoundError('Attendance session');
  }

  return session;
}

/**
 * Creates or upserts an attendance session with atomic batch records and recalculates student stats.
 */
export async function submitAttendanceSession(schoolId, data, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to submit attendance');
  }

  const { classId, sectionId, date, session = 'STANDARD', records } = data;

  // 1. Verify Class exists in tenant
  const cls = await prisma.class.findFirst({
    where: { id: classId, schoolId },
    select: { id: true, name: true, classTeacherId: true }
  });
  if (!cls) {
    throw new NotFoundError('Class');
  }

  // 2. Verify Section if provided
  if (sectionId) {
    const sec = await prisma.section.findFirst({
      where: { id: sectionId, classId, schoolId }
    });
    if (!sec) {
      throw new NotFoundError('Section');
    }
  }

  // 3. Verify Teacher Authorization
  await verifyTeacherClassAuthorization(schoolId, classId, actor);

  // 4. Validate Student IDs belong to target Class & Tenant
  const studentIds = records.map(r => r.studentId);
  const validStudents = await prisma.student.findMany({
    where: {
      id: { in: studentIds },
      schoolId,
      classId
    },
    select: { id: true }
  });

  const foundStudentIds = new Set(validStudents.map(s => s.id));
  const hasInvalidStudent = studentIds.some(id => !foundStudentIds.has(id));
  if (hasInvalidStudent) {
    throw new ValidationError('One or more students do not belong to the target class and school');
  }

  // 5. Resolve Academic Year and Absentee Threshold
  const academicYear = await resolveAcademicYear(schoolId, data.academicYear, date);
  const absenteeThreshold = await resolveAbsenteeThreshold(schoolId);
  const monthStr = date.slice(0, 7); // YYYY-MM
  const markedByUserId = actor?.id || actor?.userId || null;

  let savedSession;
  let isNewSession = false;

  // 6. Transactional Execution
  savedSession = await prisma.$transaction(async (tx) => {
    // Step A: Check if session exists or acquire row lock
    let sessionRow = await attendanceRepository.findSessionByNaturalKey(schoolId, classId, date, session, tx);

    if (sessionRow) {
      await attendanceRepository.lockSessionForUpdate(schoolId, sessionRow.id, tx);
      await attendanceRepository.updateSession(schoolId, sessionRow.id, {
        sectionId: sectionId || sessionRow.sectionId,
        markedByUserId: markedByUserId || sessionRow.markedByUserId,
        submittedAt: new Date()
      }, tx);
    } else {
      try {
        sessionRow = await attendanceRepository.createSession({
          schoolId,
          classId,
          sectionId: sectionId || null,
          date,
          session,
          markedByUserId,
          submittedAt: new Date()
        }, tx);
        isNewSession = true;
      } catch (err) {
        if (err.code === 'P2002') {
          // Race condition recovery: acquire row lock and continue as update
          sessionRow = await attendanceRepository.lockSessionByNaturalKeyForUpdate(schoolId, classId, date, session, tx);
          if (!sessionRow) {
            throw err;
          }
        } else {
          throw err;
        }
      }
    }

    const sessionId = sessionRow.id;

    // Step B: Upsert individual student records
    for (const item of records) {
      await attendanceRepository.upsertRecord(
        schoolId,
        sessionId,
        item.studentId,
        item.status,
        item.remark || null,
        tx
      );
    }

    // Step C: Deterministic Student Lock Ordering & Aggregate Stat Recalculation
    const sortedStudentIds = Array.from(new Set(studentIds)).sort();

    for (const studentId of sortedStudentIds) {
      // Row lock AttendanceStat
      await attendanceRepository.lockAttendanceStatForUpdate(schoolId, studentId, academicYear, tx);

      // Aggregate source records for statistical integrity
      const aggregatedStats = await attendanceRepository.aggregateStudentRecords(schoolId, studentId, null, null, tx);

      // Upsert AttendanceStat
      await attendanceRepository.upsertAttendanceStat(schoolId, studentId, academicYear, aggregatedStats, tx);

      // Recalculate Monthly Absentee Flag
      const monthlyAbsents = await attendanceRepository.countStudentMonthlyAbsents(schoolId, studentId, monthStr, tx);

      if (monthlyAbsents >= absenteeThreshold) {
        await attendanceRepository.upsertAbsenteeFlag(schoolId, studentId, classId, monthStr, monthlyAbsents, tx);
      } else {
        await attendanceRepository.deleteAbsenteeFlag(schoolId, studentId, monthStr, tx);
      }
    }

    // Step D: Auto-resolve pending attendance notifications for this class & date
    await attendanceRepository.resolvePendingAttendanceNotifications(schoolId, classId, date, tx);

    return attendanceRepository.findSessionById(schoolId, sessionId, tx);
  });

  // 7. Canonical Audit Logging
  await createAuditLog({
    schoolId,
    entityType: 'AttendanceSession',
    entityId: savedSession.id,
    actionPerformed: isNewSession
      ? `RECORD_ATTENDANCE: ${cls.name} (${date} - ${session})`
      : `UPDATE_ATTENDANCE: ${cls.name} (${date} - ${session})`,
    userName: actor?.email || actor?.userId || 'Teacher',
    userRole: actor?.systemRole || null,
    modifiedFields: {
      classId: { old: null, new: classId },
      date: { old: null, new: date },
      session: { old: null, new: session },
      recordsCount: { old: null, new: records.length }
    }
  });

  return savedSession;
}

/**
 * Updates an existing attendance session's student records and recalculates stats.
 */
export async function updateAttendanceSession(schoolId, id, data, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to update attendance');
  }

  const existingSession = await attendanceRepository.findSessionById(schoolId, id);
  if (!existingSession) {
    throw new NotFoundError('Attendance session');
  }

  // 1. Verify Teacher Authorization
  await verifyTeacherClassAuthorization(schoolId, existingSession.classId, actor);

  const { records } = data;

  // 2. Validate Student IDs belong to target Class & Tenant
  const studentIds = records.map(r => r.studentId);
  const validStudents = await prisma.student.findMany({
    where: {
      id: { in: studentIds },
      schoolId,
      classId: existingSession.classId
    },
    select: { id: true }
  });

  const foundStudentIds = new Set(validStudents.map(s => s.id));
  const hasInvalidStudent = studentIds.some(id => !foundStudentIds.has(id));
  if (hasInvalidStudent) {
    throw new ValidationError('One or more students do not belong to the target class and school');
  }

  const academicYear = await resolveAcademicYear(schoolId, null, existingSession.date);
  const absenteeThreshold = await resolveAbsenteeThreshold(schoolId);
  const monthStr = existingSession.date.slice(0, 7);

  let updatedSession;

  // 3. Transactional Execution
  updatedSession = await prisma.$transaction(async (tx) => {
    // Step A: Row lock target session
    await attendanceRepository.lockSessionForUpdate(schoolId, id, tx);

    // Step B: Upsert modified student records
    for (const item of records) {
      await attendanceRepository.upsertRecord(
        schoolId,
        id,
        item.studentId,
        item.status,
        item.remark || null,
        tx
      );
    }

    // Step C: Deterministic Student Lock Ordering & Stat Recalculation
    const sortedStudentIds = Array.from(new Set(studentIds)).sort();

    for (const studentId of sortedStudentIds) {
      await attendanceRepository.lockAttendanceStatForUpdate(schoolId, studentId, academicYear, tx);
      const aggregatedStats = await attendanceRepository.aggregateStudentRecords(schoolId, studentId, null, null, tx);
      await attendanceRepository.upsertAttendanceStat(schoolId, studentId, academicYear, aggregatedStats, tx);

      const monthlyAbsents = await attendanceRepository.countStudentMonthlyAbsents(schoolId, studentId, monthStr, tx);
      if (monthlyAbsents >= absenteeThreshold) {
        await attendanceRepository.upsertAbsenteeFlag(schoolId, studentId, existingSession.classId, monthStr, monthlyAbsents, tx);
      } else {
        await attendanceRepository.deleteAbsenteeFlag(schoolId, studentId, monthStr, tx);
      }
    }

    // Step D: Auto-resolve pending attendance notifications for this class & date
    await attendanceRepository.resolvePendingAttendanceNotifications(schoolId, existingSession.classId, existingSession.date, tx);

    return attendanceRepository.findSessionById(schoolId, id, tx);
  });

  // 4. Canonical Audit Logging
  await createAuditLog({
    schoolId,
    entityType: 'AttendanceSession',
    entityId: id,
    actionPerformed: `UPDATE_ATTENDANCE: ${existingSession.class?.name || id} (${existingSession.date} - ${existingSession.session})`,
    userName: actor?.email || actor?.userId || 'Teacher',
    userRole: actor?.systemRole || null,
    modifiedFields: {
      recordsUpdated: { old: null, new: records.length }
    }
  });

  return updatedSession;
}

/**
 * Voids / deletes an attendance session (Admin only) and recalculates affected student stats.
 */
export async function deleteAttendanceSession(schoolId, id, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to delete attendance session');
  }

  if (actor) {
    const systemRole = actor.systemRole || actor.role;
    if (
      systemRole === SYSTEM_ROLES.TEACHER ||
      systemRole === SYSTEM_ROLES.STAFF ||
      systemRole === SYSTEM_ROLES.PARENT ||
      systemRole === 'teacher' ||
      systemRole === 'staff' ||
      systemRole === 'parent'
    ) {
      throw new ForbiddenError('Teachers and staff are not authorized to delete attendance sessions');
    }
  }

  const existingSession = await attendanceRepository.findSessionById(schoolId, id);
  if (!existingSession) {
    throw new NotFoundError('Attendance session');
  }

  const academicYear = await resolveAcademicYear(schoolId, null, existingSession.date);
  const absenteeThreshold = await resolveAbsenteeThreshold(schoolId);
  const monthStr = existingSession.date.slice(0, 7);

  await prisma.$transaction(async (tx) => {
    // Step A: Lock session for update
    await attendanceRepository.lockSessionForUpdate(schoolId, id, tx);

    // Step B: Collect affected student IDs
    const affectedRecords = await attendanceRepository.findRecordsBySessionId(schoolId, id, tx);
    const affectedStudentIds = Array.from(new Set(affectedRecords.map(r => r.studentId))).sort();

    // Step C: Delete session (cascades to attendance_records)
    await attendanceRepository.deleteSession(schoolId, id, tx);

    // Step D: Recalculate stats for all affected students
    for (const studentId of affectedStudentIds) {
      await attendanceRepository.lockAttendanceStatForUpdate(schoolId, studentId, academicYear, tx);
      const aggregatedStats = await attendanceRepository.aggregateStudentRecords(schoolId, studentId, null, null, tx);
      await attendanceRepository.upsertAttendanceStat(schoolId, studentId, academicYear, aggregatedStats, tx);

      const monthlyAbsents = await attendanceRepository.countStudentMonthlyAbsents(schoolId, studentId, monthStr, tx);
      if (monthlyAbsents >= absenteeThreshold) {
        await attendanceRepository.upsertAbsenteeFlag(schoolId, studentId, existingSession.classId, monthStr, monthlyAbsents, tx);
      } else {
        await attendanceRepository.deleteAbsenteeFlag(schoolId, studentId, monthStr, tx);
      }
    }
  });

  // Canonical Audit Logging
  await createAuditLog({
    schoolId,
    entityType: 'AttendanceSession',
    entityId: id,
    actionPerformed: `DELETE_ATTENDANCE_SESSION: ${id}`,
    userName: actor?.email || actor?.userId || 'Administrator',
    userRole: actor?.systemRole || null,
    modifiedFields: {
      id: { old: id, new: null }
    }
  });

  return null;
}

/**
 * Retrieves daily dashboard statistics for a given calendar date.
 */
export async function getDashboardStats(schoolId, dateStr = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required');
  }

  const targetDate = dateStr || new Date().toISOString().split('T')[0];

  const [allClasses, dailySessions] = await Promise.all([
    attendanceRepository.findClassesForDashboard(schoolId),
    attendanceRepository.findDailySessionsForDashboard(schoolId, targetDate)
  ]);

  const schoolWide = { total: 0, present: 0, absent: 0, late: 0, percentage: 100 };
  const byGrade = {};
  const byClass = {};

  const markedClassIds = new Set(dailySessions.map(s => s.classId));
  const pendingClasses = allClasses.filter(c => !markedClassIds.has(c.id)).map(c => c.id);

  for (const session of dailySessions) {
    const classId = session.classId;
    const gradeLevel = session.class?.gradeLevel ? String(session.class.gradeLevel) : 'General';

    if (!byGrade[gradeLevel]) {
      byGrade[gradeLevel] = { total: 0, present: 0, absent: 0, late: 0, percentage: 100 };
    }

    if (!byClass[classId]) {
      byClass[classId] = {
        classId,
        className: session.class?.name || 'Class',
        gradeLevel,
        total: 0,
        present: 0,
        absent: 0,
        late: 0,
        percentage: 100
      };
    }

    for (const record of session.records) {
      schoolWide.total++;
      byGrade[gradeLevel].total++;
      byClass[classId].total++;

      if (record.status === 'Present') {
        schoolWide.present++;
        byGrade[gradeLevel].present++;
        byClass[classId].present++;
      } else if (record.status === 'Absent') {
        schoolWide.absent++;
        byGrade[gradeLevel].absent++;
        byClass[classId].absent++;
      } else if (record.status === 'Late') {
        schoolWide.late++;
        byGrade[gradeLevel].late++;
        byClass[classId].late++;
      }
    }
  }

  const calcPercentage = (s) => {
    if (s.total === 0) return 100;
    return Number((((s.present + s.late) / s.total) * 100).toFixed(1));
  };

  schoolWide.percentage = calcPercentage(schoolWide);
  Object.keys(byGrade).forEach(g => {
    byGrade[g].percentage = calcPercentage(byGrade[g]);
  });
  Object.keys(byClass).forEach(c => {
    byClass[c].percentage = calcPercentage(byClass[c]);
  });

  return {
    date: targetDate,
    classesTotal: allClasses.length,
    classesMarked: markedClassIds.size,
    classesPending: pendingClasses.length,
    schoolWide,
    byGrade,
    byClass
  };
}

/**
 * Retrieves detailed student attendance timeline and cumulative statistics.
 */
export async function getStudentAttendance(schoolId, studentId, query = {}, requester = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required');
  }

  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      admissionNumber: true,
      rollNumber: true,
      classId: true,
      class: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  if (!student) {
    throw new NotFoundError('Student');
  }

  // Parent Authorization Check
  if (requester && (requester.systemRole === SYSTEM_ROLES.PARENT || requester.role === 'parent')) {
    const parentProfile = await prisma.parentProfile.findFirst({
      where: {
        schoolId,
        userId: requester.id || requester.userId
      },
      select: { id: true }
    });

    if (!parentProfile) {
      throw new ForbiddenError('Parent profile not found');
    }

    const link = await prisma.parentStudentLink.findFirst({
      where: {
        schoolId,
        parentProfileId: parentProfile.id,
        studentId
      }
    });

    if (!link) {
      throw new ForbiddenError('You are not authorized to view attendance for this student');
    }
  }

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 50));
  const skip = (page - 1) * limit;

  const now = new Date();
  const options = {
    skip,
    take: limit
  };

  if (query.filter === 'weekly') {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 7);
    options.startDate = sevenDaysAgo.toISOString().split('T')[0];
    options.endDate = now.toISOString().split('T')[0];
  } else if (query.filter === 'monthly') {
    const monthPrefix = now.toISOString().split('T')[0].slice(0, 7);
    options.startDate = `${monthPrefix}-01`;
    options.endDate = now.toISOString().split('T')[0];
  }

  const academicYear = await resolveAcademicYear(schoolId, query.academicYear);

  const [records, total, cumulativeStat] = await Promise.all([
    attendanceRepository.findRecordsByStudent(schoolId, studentId, options),
    attendanceRepository.countRecordsByStudent(schoolId, studentId, options),
    attendanceRepository.findAttendanceStat(schoolId, studentId, academicYear)
  ]);

  return {
    student,
    cumulativeStat: cumulativeStat || {
      academicYear,
      totalDays: 0,
      presentDays: 0,
      absentDays: 0,
      lateDays: 0,
      percentage: 100
    },
    timeline: records,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1
    }
  };
}

/**
 * Lists paginated AbsenteeFlag records.
 */
export async function listAbsenteeFlags(schoolId, query = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required');
  }

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const options = {
    classId: query.classId,
    month: query.month,
    isResolved: query.isResolved,
    skip,
    take: limit
  };

  const [flags, total] = await Promise.all([
    attendanceRepository.findAbsenteeFlags(schoolId, options),
    attendanceRepository.countAbsenteeFlags(schoolId, options)
  ]);

  return {
    flags,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1
    }
  };
}

/**
 * Resolves an AbsenteeFlag.
 */
export async function resolveAbsenteeFlag(schoolId, id, data, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required');
  }

  const existingFlag = await attendanceRepository.findAbsenteeFlagById(schoolId, id);
  if (!existingFlag) {
    throw new NotFoundError('Absentee flag');
  }

  const isResolved = data.isResolved !== undefined ? Boolean(data.isResolved) : true;

  const updatedFlag = await attendanceRepository.updateAbsenteeFlag(schoolId, id, {
    isResolved
  });

  await createAuditLog({
    schoolId,
    entityType: 'AbsenteeFlag',
    entityId: id,
    actionPerformed: `RESOLVE_ABSENTEE_FLAG: ${existingFlag.student?.firstName || id} (${existingFlag.monthStr})`,
    userName: actor?.email || actor?.userId || 'Staff',
    userRole: actor?.systemRole || null,
    modifiedFields: {
      isResolved: { old: existingFlag.isResolved, new: isResolved },
      resolutionNotes: data.resolutionNotes || null
    }
  });

  return updatedFlag;
}

/**
 * Retrieves attendance settings for a tenant.
 */
export async function getAttendanceSettings(schoolId) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required');
  }

  const [setting, school] = await Promise.all([
    prisma.schoolSetting.findFirst({
      where: {
        schoolId,
        category: 'attendanceSettings'
      }
    }),
    prisma.school.findFirst({
      where: { id: schoolId },
      select: { timezone: true }
    })
  ]);

  const rawData = setting?.data || {};
  return {
    cutoffTime: rawData.cutoffTime || '09:30',
    lateThreshold: rawData.lateThreshold || rawData.cutoffTime || '09:30',
    absenteeThreshold: Number.isInteger(Number(rawData.absenteeThreshold)) && Number(rawData.absenteeThreshold) > 0
      ? Number(rawData.absenteeThreshold)
      : 2,
    workingHoursStart: rawData.workingHoursStart || '09:00',
    workingHoursEnd: rawData.workingHoursEnd || '16:00',
    timezone: rawData.timezone || school?.timezone || 'Asia/Kolkata',
    lastCutoffCheckDate: rawData.lastCutoffCheckDate || null
  };
}

/**
 * Updates attendance settings for a tenant.
 */
export async function updateAttendanceSettings(schoolId, data, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required');
  }

  const existingSetting = await prisma.schoolSetting.findFirst({
    where: {
      schoolId,
      category: 'attendanceSettings'
    }
  });

  const mergedData = {
    ...(existingSetting?.data || {}),
    ...(data.cutoffTime !== undefined && { cutoffTime: data.cutoffTime }),
    ...(data.lateThreshold !== undefined && { lateThreshold: data.lateThreshold }),
    ...(data.absenteeThreshold !== undefined && { absenteeThreshold: Number(data.absenteeThreshold) }),
    ...(data.workingHoursStart !== undefined && { workingHoursStart: data.workingHoursStart }),
    ...(data.workingHoursEnd !== undefined && { workingHoursEnd: data.workingHoursEnd }),
    ...(data.timezone !== undefined && { timezone: data.timezone })
  };

  const updatedSetting = await prisma.schoolSetting.upsert({
    where: {
      schoolId_category: {
        schoolId,
        category: 'attendanceSettings'
      }
    },
    create: {
      schoolId,
      category: 'attendanceSettings',
      data: mergedData
    },
    update: {
      data: mergedData
    }
  });

  await createAuditLog({
    schoolId,
    entityType: 'SchoolSetting',
    entityId: updatedSetting.id,
    actionPerformed: 'UPDATE_ATTENDANCE_SETTINGS',
    userName: actor?.email || actor?.userId || 'Administrator',
    userRole: actor?.systemRole || null,
    modifiedFields: {
      attendanceSettings: {
        old: existingSetting?.data || null,
        new: mergedData
      }
    }
  });

  return {
    cutoffTime: mergedData.cutoffTime || '09:30',
    lateThreshold: mergedData.lateThreshold || mergedData.cutoffTime || '09:30',
    absenteeThreshold: mergedData.absenteeThreshold || 2,
    workingHoursStart: mergedData.workingHoursStart || '09:00',
    workingHoursEnd: mergedData.workingHoursEnd || '16:00',
    timezone: mergedData.timezone || 'Asia/Kolkata',
    lastCutoffCheckDate: mergedData.lastCutoffCheckDate || null
  };
}

