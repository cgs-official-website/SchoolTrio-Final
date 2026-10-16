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
  if (
    systemRole === SYSTEM_ROLES.SUPER_ADMIN ||
    systemRole === SYSTEM_ROLES.SCHOOL_ADMIN ||
    systemRole === 'SUPER_ADMIN' ||
    systemRole === 'ADMIN' ||
    systemRole === 'admin' ||
    systemRole === 'superadmin' ||
    systemRole === 'PRINCIPAL' ||
    systemRole === 'principal'
  ) {
    return true;
  }

  // 2. Check if user holds institutional permissions that grant school-wide attendance management
  const permissions = actor.permissions || [];
  if (
    permissions.includes('attendance:create') ||
    permissions.includes('attendance:edit') ||
    permissions.includes('attendance:manage') ||
    permissions.includes('attendance.create') ||
    permissions.includes('attendance.edit')
  ) {
    return true;
  }

  // 3. Class Teacher / Staff Check
  const staffProfile = await prisma.staffProfile.findFirst({
    where: {
      schoolId,
      userId: actor.id || actor.userId
    },
    select: {
      id: true,
      assignedClassId: true,
      headedClasses: {
        select: { id: true }
      }
    }
  });

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

  if (staffProfile) {
    const isClassTeacher =
      targetClass.classTeacherId === staffProfile.id ||
      staffProfile.assignedClassId === classId ||
      (Array.isArray(staffProfile.headedClasses) && staffProfile.headedClasses.some(c => c.id === classId));

    if (isClassTeacher) {
      return true;
    }

    if (staffProfile.assignedClassId && staffProfile.assignedClassId !== classId) {
      throw new ForbiddenError('You are only authorized to mark attendance for your assigned class');
    }
  }

  // Fallback: If actor is an active teacher/staff in the tenant without specific restrictions, allow attendance entry
  if (
    systemRole === SYSTEM_ROLES.TEACHER ||
    systemRole === SYSTEM_ROLES.STAFF ||
    systemRole === 'TEACHER' ||
    systemRole === 'teacher' ||
    systemRole === 'STAFF' ||
    systemRole === 'staff'
  ) {
    return true;
  }

  throw new ForbiddenError('You are only authorized to mark attendance for your school classes');
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
    // Step A: Atomic Session Upsert
    const sessionRow = await attendanceRepository.upsertSession({
      schoolId,
      classId,
      sectionId: sectionId || null,
      date,
      session,
      markedByUserId,
      submittedAt: new Date()
    }, tx);

    const sessionId = sessionRow.id;

    // Step B: Bulk upsert individual student records
    await attendanceRepository.batchUpsertRecords(
      schoolId,
      sessionId,
      records,
      tx
    );

    // Step C: Efficient Batch Recalculate Student Stats & Absentee Flags
    await attendanceRepository.batchRecalculateStudentStats(
      schoolId,
      classId,
      studentIds,
      academicYear,
      monthStr,
      absenteeThreshold,
      tx
    );

    // Step D: Auto-resolve pending attendance notifications for this class & date
    await attendanceRepository.resolvePendingAttendanceNotifications(schoolId, classId, date, tx);

    return attendanceRepository.findSessionById(schoolId, sessionId, tx);
  }, {
    maxWait: 10000,
    timeout: 60000
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

    // Step B: Bulk upsert modified student records
    await attendanceRepository.batchUpsertRecords(
      schoolId,
      id,
      records,
      tx
    );

    // Step C: Efficient Batch Recalculate Student Stats & Absentee Flags
    await attendanceRepository.batchRecalculateStudentStats(
      schoolId,
      existingSession.classId,
      studentIds,
      academicYear,
      monthStr,
      absenteeThreshold,
      tx
    );

    // Step D: Auto-resolve pending attendance notifications for this class & date
    await attendanceRepository.resolvePendingAttendanceNotifications(schoolId, existingSession.classId, existingSession.date, tx);

    return attendanceRepository.findSessionById(schoolId, id, tx);
  }, {
    maxWait: 10000,
    timeout: 60000
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

    // Step D: Efficient Batch Recalculate Student Stats & Absentee Flags
    await attendanceRepository.batchRecalculateStudentStats(
      schoolId,
      existingSession.classId,
      affectedStudentIds,
      academicYear,
      monthStr,
      absenteeThreshold,
      tx
    );
  }, {
    maxWait: 10000,
    timeout: 60000
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
 * Retrieves daily dashboard statistics for a given calendar date and optional session filter.
 * - 'FN': Calculates statistics strictly from Forenoon records.
 * - 'AN': Calculates statistics strictly from Afternoon records.
 * - 'ALL': Combines attendance statistics across recorded sessions using the established
 *          institutional attendance rate and session-average counts (averages only recorded sessions).
 * - Total student strength is calculated from unique enrolled active students, never by summing session records.
 * - Grade and school-wide totals use Set unions of unique enrolled student IDs to prevent duplicate inflation.
 */
export async function getDashboardStats(schoolId, dateStr = null, sessionFilter = 'all') {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required');
  }

  const targetDate = dateStr || new Date().toISOString().split('T')[0];
  const normalizedSession = (sessionFilter || 'ALL').trim().toUpperCase();

  const [allClasses, dailySessions] = await Promise.all([
    attendanceRepository.findClassesForDashboard(schoolId),
    attendanceRepository.findDailySessionsForDashboard(schoolId, targetDate)
  ]);

  // Filter sessions by session parameter:
  // - When 'ALL': includes all sessions (FN, AN, and legacy STANDARD)
  // - When 'FN': strictly Forenoon sessions
  // - When 'AN': strictly Afternoon sessions
  const filteredSessions = normalizedSession === 'ALL'
    ? dailySessions
    : dailySessions.filter(s => (s.session || 'STANDARD').toUpperCase() === normalizedSession);

  const schoolWide = { total: 0, present: 0, absent: 0, late: 0, percentage: 100 };
  const byGrade = {};
  const byClass = {};

  const classMap = new Map(allClasses.map(c => [c.id, c]));
  const markedClassIds = new Set(filteredSessions.map(s => s.classId));
  const pendingClasses = allClasses.filter(c => !markedClassIds.has(c.id)).map(c => c.id);

  // Group filtered sessions by class
  const sessionsByClass = new Map();
  for (const session of filteredSessions) {
    if (!sessionsByClass.has(session.classId)) {
      sessionsByClass.set(session.classId, []);
    }
    sessionsByClass.get(session.classId).push(session);
  }

  // Track unique enrolled student IDs at grade and school levels to prevent duplicate counting
  const gradeStudentIdsMap = new Map();
  const schoolWideStudentIds = new Set();
  const gradeRecordTotals = new Map();

  for (const [classId, classSessions] of sessionsByClass.entries()) {
    const classObj = classMap.get(classId);
    const gradeLevel = classObj?.gradeLevel
      ? String(classObj.gradeLevel)
      : (classSessions[0]?.class?.gradeLevel ? String(classSessions[0].class.gradeLevel) : 'General');
    const className = classObj?.name || classSessions[0]?.class?.name || 'Class';

    // Collect enrolled active students for this class
    const enrolledStudents = Array.isArray(classObj?.students) ? classObj.students : [];
    const classStudentIds = new Set(enrolledStudents.map(s => s.id));

    // Fallback if students array was not populated in mock/legacy data: use unique student IDs in records
    const recordStudentIds = new Set();
    for (const sess of classSessions) {
      for (const r of sess.records || []) {
        if (r.studentId) recordStudentIds.add(r.studentId);
      }
    }

    const classStrength = classStudentIds.size > 0 ? classStudentIds.size : recordStudentIds.size;

    // Register unique students for grade and school-wide aggregation
    if (!gradeStudentIdsMap.has(gradeLevel)) {
      gradeStudentIdsMap.set(gradeLevel, new Set());
    }
    const targetStudentIds = classStudentIds.size > 0 ? classStudentIds : recordStudentIds;
    targetStudentIds.forEach(id => {
      gradeStudentIdsMap.get(gradeLevel).add(id);
      schoolWideStudentIds.add(id);
    });

    let classPresent = 0;
    let classAbsent = 0;
    let classLate = 0;
    let classPercentage = 100;

    const sessionCount = classSessions.length;

    if (normalizedSession === 'ALL') {
      // All Sessions: calculate session-average counts across recorded sessions
      // (average only sessions actually recorded; do NOT divide by 2 if only 1 session exists)
      let rawPresent = 0;
      let rawAbsent = 0;
      let rawLate = 0;

      for (const sess of classSessions) {
        for (const record of sess.records || []) {
          if (record.status === 'Present') rawPresent++;
          else if (record.status === 'Absent') rawAbsent++;
          else if (record.status === 'Late') rawLate++;
        }
      }

      const divisor = Math.max(1, sessionCount);
      classPresent = Math.round(rawPresent / divisor);
      classAbsent = Math.round(rawAbsent / divisor);
      classLate = Math.round(rawLate / divisor);

      // Preserve existing combined attendance-rate definition
      const totalRawSlots = rawPresent + rawAbsent + rawLate;
      if (totalRawSlots > 0) {
        classPercentage = Number((((rawPresent + rawLate) / totalRawSlots) * 100).toFixed(1));
      } else if (classStrength > 0) {
        classPercentage = Number((((classPresent + classLate) / classStrength) * 100).toFixed(1));
      } else {
        classPercentage = 100;
      }
    } else {
      // FN or AN: calculate statistics strictly from the selected session's records
      for (const sess of classSessions) {
        for (const record of sess.records || []) {
          if (record.status === 'Present') classPresent++;
          else if (record.status === 'Absent') classAbsent++;
          else if (record.status === 'Late') classLate++;
        }
      }

      classPercentage = classStrength === 0
        ? 100
        : Number((((classPresent + classLate) / classStrength) * 100).toFixed(1));
    }

    // Calculate per-section statistics if class has sections defined
    const classSectionsList = Array.isArray(classObj?.sections) ? classObj.sections : [];
    const studentSectionMap = new Map();
    enrolledStudents.forEach(s => {
      if (s.id && s.sectionId) {
        studentSectionMap.set(s.id, s.sectionId);
      }
    });

    const computedSections = [];
    if (classSectionsList.length > 0) {
      for (const sec of classSectionsList) {
        const secEnrolledStudents = enrolledStudents.filter(s => s.sectionId === sec.id);
        const secStudentIds = new Set(secEnrolledStudents.map(s => s.id));

        // If enrolled students list was not provided, fallback to records
        if (secStudentIds.size === 0) {
          for (const sess of classSessions) {
            if (sess.sectionId === sec.id) {
              for (const r of sess.records || []) {
                if (r.studentId) secStudentIds.add(r.studentId);
              }
            }
          }
        }
        const secStrength = secStudentIds.size;

        let secRawPresent = 0;
        let secRawAbsent = 0;
        let secRawLate = 0;
        let secHasRecords = false;
        let secSessionCount = 0;

        for (const sess of classSessions) {
          const isSecSession = sess.sectionId === sec.id;
          const isClassWide = !sess.sectionId;
          if (!isSecSession && !isClassWide) continue;

          let sessionHadSecRecords = false;
          for (const r of sess.records || []) {
            const belongsToSec = isSecSession ||
              (studentSectionMap.get(r.studentId) === sec.id) ||
              (classSectionsList.length === 1);

            if (belongsToSec) {
              sessionHadSecRecords = true;
              secHasRecords = true;
              if (r.status === 'Present') secRawPresent++;
              else if (r.status === 'Absent') secRawAbsent++;
              else if (r.status === 'Late') secRawLate++;
            }
          }
          if (sessionHadSecRecords || isSecSession) {
            secSessionCount++;
          }
        }

        let secPresent = 0;
        let secAbsent = 0;
        let secLate = 0;
        let secPercentage = 100;

        if (secHasRecords) {
          if (normalizedSession === 'ALL') {
            const divisor = Math.max(1, secSessionCount);
            secPresent = Math.round(secRawPresent / divisor);
            secAbsent = Math.round(secRawAbsent / divisor);
            secLate = Math.round(secRawLate / divisor);

            const totalRawSlots = secRawPresent + secRawAbsent + secRawLate;
            if (totalRawSlots > 0) {
              secPercentage = Number((((secRawPresent + secRawLate) / totalRawSlots) * 100).toFixed(1));
            } else if (secStrength > 0) {
              secPercentage = Number((((secPresent + secLate) / secStrength) * 100).toFixed(1));
            } else {
              secPercentage = 100;
            }
          } else {
            secPresent = secRawPresent;
            secAbsent = secRawAbsent;
            secLate = secRawLate;
            secPercentage = secStrength === 0
              ? 100
              : Number((((secPresent + secLate) / secStrength) * 100).toFixed(1));
          }
        } else {
          secPercentage = 0;
        }

        const secName = (sec.name || '').trim();
        const formattedName = secName ? `${className} - Section ${secName}` : className;

        computedSections.push({
          id: `${classId}_${sec.id}`,
          key: `${classId}:${sec.id}`,
          classId,
          sectionId: sec.id,
          className,
          sectionName: secName,
          formattedName,
          gradeLevel,
          total: secStrength,
          present: secPresent,
          absent: secAbsent,
          late: secLate,
          percentage: secPercentage,
          isUnmarked: !secHasRecords
        });
      }
    } else {
      computedSections.push({
        id: classId,
        key: `${classId}:all`,
        classId,
        sectionId: null,
        className,
        sectionName: null,
        formattedName: className,
        gradeLevel,
        total: classStrength,
        present: classPresent,
        absent: classAbsent,
        late: classLate,
        percentage: classPercentage,
        isUnmarked: classSessions.length === 0
      });
    }

    byClass[classId] = {
      classId,
      className,
      gradeLevel,
      total: classStrength,
      present: classPresent,
      absent: classAbsent,
      late: classLate,
      percentage: classPercentage,
      sections: computedSections
    };

    // Aggregate counts for grade-level roll-up
    if (!gradeRecordTotals.has(gradeLevel)) {
      gradeRecordTotals.set(gradeLevel, { present: 0, absent: 0, late: 0, rawClassStrengths: 0 });
    }
    const grp = gradeRecordTotals.get(gradeLevel);
    grp.present += classPresent;
    grp.absent += classAbsent;
    grp.late += classLate;
    grp.rawClassStrengths += classStrength;

    schoolWide.present += classPresent;
    schoolWide.absent += classAbsent;
    schoolWide.late += classLate;
  }

  // Populate grade-level statistics with unique enrolled student totals
  for (const [gradeLevel, grp] of gradeRecordTotals.entries()) {
    const uniqueStudents = gradeStudentIdsMap.get(gradeLevel);
    const gradeTotal = (uniqueStudents && uniqueStudents.size > 0)
      ? uniqueStudents.size
      : grp.rawClassStrengths;

    const gradePercentage = gradeTotal === 0
      ? 100
      : Number((((grp.present + grp.late) / gradeTotal) * 100).toFixed(1));

    byGrade[gradeLevel] = {
      total: gradeTotal,
      present: grp.present,
      absent: grp.absent,
      late: grp.late,
      percentage: gradePercentage
    };
  }

  // School-wide totals with unique enrolled student total
  schoolWide.total = schoolWideStudentIds.size > 0
    ? schoolWideStudentIds.size
    : Object.values(byClass).reduce((sum, c) => sum + c.total, 0);

  schoolWide.percentage = schoolWide.total === 0
    ? 100
    : Number((((schoolWide.present + schoolWide.late) / schoolWide.total) * 100).toFixed(1));

  // Build granular pending class and section details
  const pendingClassList = allClasses
    .filter(c => !markedClassIds.has(c.id))
    .map(c => {
      const gradeLevel = c.gradeLevel ? String(c.gradeLevel) : 'General';
      const enrolled = Array.isArray(c.students) ? c.students : [];
      const secList = Array.isArray(c.sections) ? c.sections : [];

      const sections = secList.length > 0
        ? secList.map(s => {
            const secStudents = enrolled.filter(stu => stu.sectionId === s.id);
            const secName = (s.name || '').trim();
            return {
              id: `${c.id}_${s.id}`,
              key: `${c.id}:${s.id}`,
              classId: c.id,
              sectionId: s.id,
              className: c.name,
              sectionName: secName,
              formattedName: secName ? `${c.name} - Section ${secName}` : c.name,
              gradeLevel,
              total: secStudents.length,
              present: 0,
              absent: 0,
              late: 0,
              percentage: 0,
              isUnmarked: true
            };
          })
        : [{
            id: c.id,
            key: `${c.id}:all`,
            classId: c.id,
            sectionId: null,
            className: c.name,
            sectionName: null,
            formattedName: c.name,
            gradeLevel,
            total: enrolled.length,
            present: 0,
            absent: 0,
            late: 0,
            percentage: 0,
            isUnmarked: true
          }];

      return {
        classId: c.id,
        className: c.name,
        gradeLevel,
        total: enrolled.length,
        present: 0,
        absent: 0,
        late: 0,
        percentage: 0,
        isUnmarked: true,
        sections
      };
    });

  return {
    date: targetDate,
    session: normalizedSession,
    classesTotal: allClasses.length,
    classesMarked: markedClassIds.size,
    classesPending: pendingClasses.length,
    pendingClassList,
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

  let [records, total, cumulativeStat] = await Promise.all([
    attendanceRepository.findRecordsByStudent(schoolId, studentId, options),
    attendanceRepository.countRecordsByStudent(schoolId, studentId, options),
    attendanceRepository.findAttendanceStat(schoolId, studentId, academicYear)
  ]);

  if (!cumulativeStat) {
    const dynamicStat = await attendanceRepository.aggregateStudentRecords(schoolId, studentId);
    if (dynamicStat && dynamicStat.totalDays > 0) {
      cumulativeStat = {
        academicYear,
        ...dynamicStat
      };
    }
  }

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

