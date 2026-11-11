import * as attendanceRepository from './attendance.repository.js';
import { prisma } from '../../database/prisma.client.js';
import { getTeacherAssignments } from '../classes/class.service.js';
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
 * True when the actor holds an ADMIN-PANEL role (e.g. Correspondent, Principal, Grade Co-ordinator)
 * whose attendance permission includes Create or Edit. Such roles may mark attendance for any class.
 * Teacher-panel roles (Staffs, Class Incharge, ...) are NOT affected and stay limited to their own
 * class / section.
 */
async function hasAdminPanelAttendanceAccess(schoolId, actor) {
  const userId = actor.id || actor.userId;
  if (!userId || !prisma.userRoleAssignment?.findMany) return false;

  const assignments = await prisma.userRoleAssignment.findMany({
    where: { schoolId, userId },
    include: {
      schoolRole: {
        include: {
          permissions: { where: { moduleKey: 'attendance' } }
        }
      }
    }
  });

  return assignments.some(
    (ra) =>
      String(ra.schoolRole?.loginPanel || '').toLowerCase() === 'admin' &&
      ra.schoolRole?.permissions?.some((p) => p.canCreate || p.canEdit)
  );
}

/**
 * Verifies whether the requesting actor is authorized to mark or update attendance for a given class.
 */
export async function verifyTeacherClassAuthorization(schoolId, classId, actor, sectionId = null) {
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

  // 2b. Admin-panel roles with attendance Create/Edit permission (set in Roles & Permissions)
  // may mark attendance for any class. Must run BEFORE the class-teacher section check below,
  // otherwise those roles are rejected for every section they are not class teacher of.
  if (await hasAdminPanelAttendanceAccess(schoolId, actor)) {
    return true;
  }

  // 3a. SECTION-LEVEL CHECK (source of truth: Section.classTeacherId).
  // A class can have several sections (V-A, V-B), each with its own class teacher. The legacy
  // StaffProfile.assignedClassId only stores the parent CLASS, so it cannot tell V-A from V-B
  // (and may be stale), which caused "You are only authorized to mark attendance for your
  // assigned class" for the genuine class teacher. Mirror exactly what the teacher sees in the
  // UI (GET /classes/my-classes?classTeacherOnly=true).
  if (sectionId) {
    const scope = await getTeacherAssignments(schoolId, actor.id || actor.userId);
    if (scope.staffProfile) {
      const allowed = scope.classTeacherSectionIds.size > 0
        ? scope.classTeacherSectionIds.has(sectionId)
        : (scope.sectionIds.has(sectionId) || scope.wholeClassIds.has(classId));
      if (allowed) {
        return true;
      }
      throw new ForbiddenError('You are only authorized to mark attendance for the section you are class teacher of');
    }
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
      customData: true,
      headedClasses: {
        select: { id: true }
      },
      headedSections: {
        select: { id: true, classId: true }
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
      classTeacherId: true,
      categoryId: true
    }
  });

  if (!targetClass) {
    throw new NotFoundError('Class');
  }

  if (staffProfile) {
    const subjectClassIds = Array.isArray(staffProfile.customData?.assignments?.subjectClassIds)
      ? staffProfile.customData.assignments.subjectClassIds.filter(Boolean)
      : [];

    const isDirectlyAssigned =
      targetClass.classTeacherId === staffProfile.id ||
      targetClass.classTeacherId === (actor.id || actor.userId) ||
      staffProfile.assignedClassId === classId ||
      (Array.isArray(staffProfile.headedClasses) && staffProfile.headedClasses.some(c => c.id === classId)) ||
      (Array.isArray(staffProfile.headedSections) && staffProfile.headedSections.some(s => s.classId === classId)) ||
      subjectClassIds.includes(classId);

    if (isDirectlyAssigned) {
      return true;
    }

    // Check if actor has Grade Coordinator role or RBAC permissions
    const roleAssignments = prisma.userRoleAssignment?.findMany
      ? await prisma.userRoleAssignment.findMany({
        where: {
          schoolId,
          userId: actor.id || actor.userId
        },
        include: {
          schoolRole: {
            include: {
              permissions: {
                where: { moduleKey: 'attendance' }
              }
            }
          }
        }
      })
      : [];

    const isCoordinator = roleAssignments.some(ra => {
      const slug = ra.schoolRole?.slug?.toLowerCase() || '';
      const name = ra.schoolRole?.name?.toLowerCase() || '';
      return slug.includes('coordinator') || slug.includes('co-ordinator') ||
        name.includes('coordinator') || name.includes('co-ordinator');
    });

    const hasAttendanceRbacPermission = roleAssignments.some(ra => {
      return ra.schoolRole?.permissions?.some(p => p.canCreate || p.canEdit);
    });

    if (isCoordinator || hasAttendanceRbacPermission) {
      const allAssignedIds = [staffProfile.assignedClassId, ...subjectClassIds].filter(Boolean);
      if (allAssignedIds.length > 0 && prisma.class?.findMany) {
        const assignedClassRecords = await prisma.class.findMany({
          where: {
            schoolId,
            id: { in: allAssignedIds }
          },
          select: { categoryId: true }
        });
        const coordinatedCategories = new Set(assignedClassRecords.map(c => c.categoryId).filter(Boolean));
        if (targetClass.categoryId && coordinatedCategories.has(targetClass.categoryId)) {
          return true;
        }
      }
    }

    if (staffProfile.assignedClassId && !isDirectlyAssigned) {
      // Legacy column may be stale - re-check against section/class-teacher assignments
      const scope = await getTeacherAssignments(schoolId, actor.id || actor.userId);
      if (scope.wholeClassIds.has(classId)) {
        return true;
      }
      if (scope.classTeacherSectionIds.size > 0 || scope.sectionIds.size > 0) {
        const sectionsOfClass = await prisma.section.findMany({
          where: { schoolId, classId, id: { in: Array.from(scope.classTeacherSectionIds.size > 0 ? scope.classTeacherSectionIds : scope.sectionIds) } },
          select: { id: true }
        });
        if (sectionsOfClass.length > 0) {
          return true;
        }
      }
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
    order: query.order,
    includeRecords: query.includeRecords === true || query.includeRecords === 'true'
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
  await verifyTeacherClassAuthorization(schoolId, classId, actor, sectionId || null);

  // 4. Validate Student IDs belong to target Class & Tenant
  const studentIds = records.map(r => r.studentId);
  const validStudents = await prisma.student.findMany({
    where: {
      id: { in: studentIds },
      schoolId,
      classId,
      ...(sectionId ? { sectionId } : {})
    },
    select: { id: true }
  });

  const foundStudentIds = new Set(validStudents.map(s => s.id));
  const hasInvalidStudent = studentIds.some(id => !foundStudentIds.has(id));
  if (hasInvalidStudent) {
    throw new ValidationError('One or more students do not belong to the target class/section and school');
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
  await verifyTeacherClassAuthorization(schoolId, existingSession.classId, actor, existingSession.sectionId || null);

  const { records } = data;

  // 2. Validate Student IDs belong to target Class & Tenant
  const studentIds = records.map(r => r.studentId);
  const validStudents = await prisma.student.findMany({
    where: {
      id: { in: studentIds },
      schoolId,
      classId: existingSession.classId,
      ...(existingSession.sectionId ? { sectionId: existingSession.sectionId } : {})
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

const calcPct = (present, absent, late) => {
  const recorded = present + absent + late;
  return recorded === 0 ? null : Number((((present + late) / recorded) * 100).toFixed(1));
};

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

  const filteredSessions = normalizedSession === 'ALL'
    ? dailySessions
    : dailySessions.filter(s => (s.session || 'STANDARD').toUpperCase() === normalizedSession);

  const sessionsByClass = new Map();
  for (const sess of filteredSessions) {
    if (!sessionsByClass.has(sess.classId)) sessionsByClass.set(sess.classId, []);
    sessionsByClass.get(sess.classId).push(sess);
  }

  const byClass = {};
  const gradeAcc = new Map();
  const pendingClassList = [];
  const pendingSections = [];
  const school = { total: 0, present: 0, absent: 0, late: 0 };
  let sectionsTotal = 0;
  let sectionsMarked = 0;

  for (const cls of allClasses) {
    const gradeLevel = cls.gradeLevel ? String(cls.gradeLevel) : 'General';
    const className = cls.name || 'Class';
    const enrolled = Array.isArray(cls.students) ? cls.students : [];
    const secList = Array.isArray(cls.sections) ? cls.sections : [];
    const classSessions = sessionsByClass.get(cls.id) || [];
    const studentSectionMap = new Map(
      enrolled.filter(s => s.sectionId).map(s => [s.id, s.sectionId])
    );

    const units = secList.length > 0
      ? secList.map(sec => ({
        sectionId: sec.id,
        name: (sec.name || '').trim(),
        strength: enrolled.filter(s => s.sectionId === sec.id).length
      }))
      : [{ sectionId: null, name: '', strength: enrolled.length }];

    const computed = units.map(u => {
      let present = 0;
      let absent = 0;
      let late = 0;

      for (const sess of classSessions) {
        const isOwn = !!u.sectionId && sess.sectionId === u.sectionId;
        if (u.sectionId && sess.sectionId && !isOwn) continue;

        for (const r of sess.records || []) {
          if (u.sectionId && !isOwn) {
          const belongs = studentSectionMap.get(r.studentId) === u.sectionId || secList.length === 1;
          if (!belongs) continue;
          }
          if (r.status === 'Present') present++;
          else if (r.status === 'Absent') absent++;
          else if (r.status === 'Late') late++;
        }
      }

      const recorded = present + absent + late;
      const isUnmarked = recorded === 0;
      const formattedName = u.name ? `${className} - Section ${u.name}` : className;

      return {
        id: u.sectionId ? `${cls.id}_${u.sectionId}` : cls.id,
        key: u.sectionId ? `${cls.id}:${u.sectionId}` : `${cls.id}:all`,
        classId: cls.id,
        sectionId: u.sectionId,
        className,
        sectionName: u.name || null,
        formattedName,
        gradeLevel,
        total: u.strength,
        present,
        absent,
        late,
        percentage: calcPct(present, absent, late),
        isUnmarked
      };
    });

    sectionsTotal += computed.length;
    const markedUnits = computed.filter(u => !u.isUnmarked);
    sectionsMarked += markedUnits.length;
    computed.filter(u => u.isUnmarked).forEach(u => pendingSections.push(u));

    if (markedUnits.length === 0) {
      pendingClassList.push({
        classId: cls.id,
        className,
        gradeLevel,
        total: enrolled.length,
        present: 0,
        absent: 0,
        late: 0,
        percentage: null,
        isUnmarked: true,
        sections: computed
      });
      continue;
    }

    const cPresent = markedUnits.reduce((n, u) => n + u.present, 0);
    const cAbsent = markedUnits.reduce((n, u) => n + u.absent, 0);
    const cLate = markedUnits.reduce((n, u) => n + u.late, 0);
    const cStrength = markedUnits.reduce((n, u) => n + u.total, 0);

    byClass[cls.id] = {
      classId: cls.id,
      className,
      gradeLevel,
      total: enrolled.length,
      present: cPresent,
      absent: cAbsent,
      late: cLate,
      percentage: calcPct(cPresent, cAbsent, cLate),
      sections: computed
    };

    if (!gradeAcc.has(gradeLevel)) {
      gradeAcc.set(gradeLevel, { total: 0, present: 0, absent: 0, late: 0 });
    }
    const g = gradeAcc.get(gradeLevel);
    g.total += cStrength;
    g.present += cPresent;
    g.absent += cAbsent;
    g.late += cLate;

    school.total += cStrength;
    school.present += cPresent;
    school.absent += cAbsent;
    school.late += cLate;
  }

  const byGrade = {};
  for (const [gradeLevel, g] of gradeAcc.entries()) {
    byGrade[gradeLevel] = { ...g, percentage: calcPct(g.present, g.absent, g.late) };
  }

  return {
    date: targetDate,
    session: normalizedSession,
    classesTotal: sectionsTotal,
    classesMarked: sectionsMarked,
    classesPending: pendingSections.length,
    pendingClassList,
    pendingSections,
    schoolWide: { ...school, percentage: calcPct(school.present, school.absent, school.late) },
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