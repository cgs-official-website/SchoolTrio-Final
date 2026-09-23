import { prisma } from '../../database/prisma.client.js';

/**
 * Attendance Data Access Repository Layer
 *
 * Strict Multi-Tenant Invariants:
 * 1. Every query is filtered by schoolId.
 * 2. Cross-tenant access is strictly prohibited.
 * 3. Supports transaction propagation via optional `tx` client.
 */

export const SESSION_SELECT_CONFIG = {
  id: true,
  schoolId: true,
  classId: true,
  sectionId: true,
  date: true,
  session: true,
  markedByUserId: true,
  submittedAt: true,
  createdAt: true,
  updatedAt: true,
  class: {
    select: {
      id: true,
      name: true,
      gradeLevel: true,
      classTeacherId: true
    }
  },
  section: {
    select: {
      id: true,
      name: true
    }
  },
  _count: {
    select: {
      records: true
    }
  }
};

export const SESSION_DETAIL_SELECT_CONFIG = {
  ...SESSION_SELECT_CONFIG,
  records: {
    select: {
      id: true,
      studentId: true,
      status: true,
      remark: true,
      createdAt: true,
      updatedAt: true,
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          admissionNumber: true,
          rollNumber: true
        }
      }
    },
    orderBy: [
      { student: { firstName: 'asc' } },
      { student: { lastName: 'asc' } }
    ]
  }
};

/**
 * Lists paginated attendance sessions for a tenant.
 */
export async function findSessions(schoolId, options = {}, tx = prisma) {
  const where = { schoolId };

  if (options.classId) where.classId = options.classId;
  if (options.sectionId) where.sectionId = options.sectionId;
  if (options.session) where.session = options.session;

  if (options.date) {
    where.date = options.date;
  } else if (options.startDate || options.endDate) {
    where.date = {};
    if (options.startDate) where.date.gte = options.startDate;
    if (options.endDate) where.date.lte = options.endDate;
  }

  const orderBy = [];
  if (options.sort === 'createdAt') {
    orderBy.push({ createdAt: options.order || 'desc' });
  } else if (options.sort === 'updatedAt') {
    orderBy.push({ updatedAt: options.order || 'desc' });
  } else {
    orderBy.push({ date: options.order || 'desc' });
    orderBy.push({ session: 'asc' });
  }

  return tx.attendanceSession.findMany({
    where,
    select: SESSION_SELECT_CONFIG,
    skip: options.skip,
    take: options.take,
    orderBy
  });
}

/**
 * Counts attendance sessions matching filters.
 */
export async function countSessions(schoolId, options = {}, tx = prisma) {
  const where = { schoolId };

  if (options.classId) where.classId = options.classId;
  if (options.sectionId) where.sectionId = options.sectionId;
  if (options.session) where.session = options.session;

  if (options.date) {
    where.date = options.date;
  } else if (options.startDate || options.endDate) {
    where.date = {};
    if (options.startDate) where.date.gte = options.startDate;
    if (options.endDate) where.date.lte = options.endDate;
  }

  return tx.attendanceSession.count({ where });
}

/**
 * Finds a single attendance session by ID.
 */
export async function findSessionById(schoolId, id, tx = prisma) {
  return tx.attendanceSession.findFirst({
    where: {
      id,
      schoolId
    },
    select: SESSION_DETAIL_SELECT_CONFIG
  });
}

/**
 * Finds an attendance session by natural key (schoolId + classId + date + session).
 */
export async function findSessionByNaturalKey(schoolId, classId, date, session, tx = prisma) {
  return tx.attendanceSession.findFirst({
    where: {
      schoolId,
      classId,
      date,
      session
    },
    select: SESSION_DETAIL_SELECT_CONFIG
  });
}

/**
 * Acquires a row-level lock on an AttendanceSession row.
 */
export async function lockSessionForUpdate(schoolId, id, tx) {
  const rows = await tx.$queryRaw`
    SELECT id, school_id, class_id, section_id, date, session, marked_by_user_id
    FROM attendance_sessions
    WHERE school_id = ${schoolId}::uuid AND id = ${id}::uuid
    FOR UPDATE
  `;
  return rows[0] || null;
}

/**
 * Acquires a row-level lock on an AttendanceSession by natural key.
 */
export async function lockSessionByNaturalKeyForUpdate(schoolId, classId, date, session, tx) {
  const rows = await tx.$queryRaw`
    SELECT id, school_id, class_id, section_id, date, session, marked_by_user_id
    FROM attendance_sessions
    WHERE school_id = ${schoolId}::uuid
      AND class_id = ${classId}::uuid
      AND date = ${date}
      AND session = ${session}
    FOR UPDATE
  `;
  return rows[0] || null;
}

/**
 * Creates a new AttendanceSession entity.
 */
export async function createSession(data, tx = prisma) {
  return tx.attendanceSession.create({
    data,
    select: SESSION_SELECT_CONFIG
  });
}

/**
 * Updates an AttendanceSession entity.
 */
export async function updateSession(schoolId, id, data, tx = prisma) {
  return tx.attendanceSession.update({
    where: {
      schoolId_id: { schoolId, id }
    },
    data,
    select: SESSION_SELECT_CONFIG
  });
}

/**
 * Deletes an AttendanceSession entity (cascades to records).
 */
export async function deleteSession(schoolId, id, tx = prisma) {
  return tx.attendanceSession.delete({
    where: {
      schoolId_id: { schoolId, id }
    }
  });
}

/**
 * Upserts a single AttendanceRecord.
 */
export async function upsertRecord(schoolId, sessionId, studentId, status, remark = null, tx = prisma) {
  return tx.attendanceRecord.upsert({
    where: {
      schoolId_sessionId_studentId: {
        schoolId,
        sessionId,
        studentId
      }
    },
    create: {
      schoolId,
      sessionId,
      studentId,
      status,
      remark
    },
    update: {
      status,
      remark
    }
  });
}

/**
 * Finds all student records belonging to a session.
 */
export async function findRecordsBySessionId(schoolId, sessionId, tx = prisma) {
  return tx.attendanceRecord.findMany({
    where: {
      schoolId,
      sessionId
    },
    select: {
      id: true,
      studentId: true,
      status: true,
      remark: true
    }
  });
}

/**
 * Finds student attendance timeline records.
 */
export async function findRecordsByStudent(schoolId, studentId, options = {}, tx = prisma) {
  const where = {
    schoolId,
    studentId
  };

  if (options.startDate || options.endDate) {
    where.session = {
      date: {}
    };
    if (options.startDate) where.session.date.gte = options.startDate;
    if (options.endDate) where.session.date.lte = options.endDate;
  }

  return tx.attendanceRecord.findMany({
    where,
    select: {
      id: true,
      status: true,
      remark: true,
      createdAt: true,
      session: {
        select: {
          id: true,
          date: true,
          session: true,
          class: {
            select: {
              id: true,
              name: true
            }
          }
        }
      }
    },
    skip: options.skip,
    take: options.take,
    orderBy: {
      session: {
        date: 'desc'
      }
    }
  });
}

/**
 * Counts student attendance timeline records.
 */
export async function countRecordsByStudent(schoolId, studentId, options = {}, tx = prisma) {
  const where = {
    schoolId,
    studentId
  };

  if (options.startDate || options.endDate) {
    where.session = {
      date: {}
    };
    if (options.startDate) where.session.date.gte = options.startDate;
    if (options.endDate) where.session.date.lte = options.endDate;
  }

  return tx.attendanceRecord.count({ where });
}

/**
 * Aggregates all source AttendanceRecords for a student within an academic year date range.
 */
export async function aggregateStudentRecords(schoolId, studentId, startDate = null, endDate = null, tx = prisma) {
  const where = {
    schoolId,
    studentId
  };

  if (startDate || endDate) {
    where.session = {
      date: {}
    };
    if (startDate) where.session.date.gte = startDate;
    if (endDate) where.session.date.lte = endDate;
  }

  const records = await tx.attendanceRecord.findMany({
    where,
    select: {
      status: true
    }
  });

  let present = 0;
  let absent = 0;
  let late = 0;

  for (const r of records) {
    if (r.status === 'Present') present++;
    else if (r.status === 'Absent') absent++;
    else if (r.status === 'Late') late++;
  }

  const total = present + absent + late;
  const percentage = total === 0 ? 100 : Number((((present + late) / total) * 100).toFixed(1));

  return {
    totalDays: total,
    presentDays: present,
    absentDays: absent,
    lateDays: late,
    percentage
  };
}

/**
 * Finds an AttendanceStat record for a student and academic year.
 */
export async function findAttendanceStat(schoolId, studentId, academicYear, tx = prisma) {
  return tx.attendanceStat.findFirst({
    where: {
      schoolId,
      studentId,
      academicYear
    }
  });
}

/**
 * Acquires a row lock on an AttendanceStat record.
 */
export async function lockAttendanceStatForUpdate(schoolId, studentId, academicYear, tx) {
  const rows = await tx.$queryRaw`
    SELECT id, school_id, student_id, academic_year, total_days, present_days, absent_days, late_days, percentage
    FROM attendance_stats
    WHERE school_id = ${schoolId}::uuid
      AND student_id = ${studentId}::uuid
      AND academic_year = ${academicYear}
    FOR UPDATE
  `;
  return rows[0] || null;
}

/**
 * Upserts an AttendanceStat record.
 */
export async function upsertAttendanceStat(schoolId, studentId, academicYear, stats, tx = prisma) {
  return tx.attendanceStat.upsert({
    where: {
      schoolId_studentId_academicYear: {
        schoolId,
        studentId,
        academicYear
      }
    },
    create: {
      schoolId,
      studentId,
      academicYear,
      totalDays: stats.totalDays,
      presentDays: stats.presentDays,
      absentDays: stats.absentDays,
      lateDays: stats.lateDays,
      percentage: stats.percentage
    },
    update: {
      totalDays: stats.totalDays,
      presentDays: stats.presentDays,
      absentDays: stats.absentDays,
      lateDays: stats.lateDays,
      percentage: stats.percentage
    }
  });
}

/**
 * Counts monthly absent records for a student (e.g. monthStr = '2026-09').
 */
export async function countStudentMonthlyAbsents(schoolId, studentId, monthStr, tx = prisma) {
  return tx.attendanceRecord.count({
    where: {
      schoolId,
      studentId,
      status: 'Absent',
      session: {
        date: {
          startsWith: monthStr
        }
      }
    }
  });
}

/**
 * Finds an AbsenteeFlag record for a student and month.
 */
export async function findAbsenteeFlag(schoolId, studentId, monthStr, tx = prisma) {
  return tx.absenteeFlag.findFirst({
    where: {
      schoolId,
      studentId,
      monthStr
    }
  });
}

/**
 * Upserts an AbsenteeFlag record.
 */
export async function upsertAbsenteeFlag(schoolId, studentId, classId, monthStr, absentCount, tx = prisma) {
  return tx.absenteeFlag.upsert({
    where: {
      schoolId_studentId_monthStr: {
        schoolId,
        studentId,
        monthStr
      }
    },
    create: {
      schoolId,
      studentId,
      classId,
      monthStr,
      absentCount,
      isResolved: false
    },
    update: {
      absentCount,
      classId
    }
  });
}

/**
 * Deletes an AbsenteeFlag record if count drops below threshold.
 */
export async function deleteAbsenteeFlag(schoolId, studentId, monthStr, tx = prisma) {
  return tx.absenteeFlag.deleteMany({
    where: {
      schoolId,
      studentId,
      monthStr
    }
  });
}

/**
 * Lists paginated AbsenteeFlag records with filters.
 */
export async function findAbsenteeFlags(schoolId, options = {}, tx = prisma) {
  const where = { schoolId };

  if (options.classId) where.classId = options.classId;
  if (options.month) where.monthStr = options.month;
  if (options.isResolved !== undefined) where.isResolved = options.isResolved;

  return tx.absenteeFlag.findMany({
    where,
    select: {
      id: true,
      schoolId: true,
      studentId: true,
      classId: true,
      monthStr: true,
      absentCount: true,
      flaggedAt: true,
      isResolved: true,
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          admissionNumber: true,
          rollNumber: true
        }
      },
      class: {
        select: {
          id: true,
          name: true
        }
      }
    },
    skip: options.skip,
    take: options.take,
    orderBy: [
      { absentCount: 'desc' },
      { flaggedAt: 'desc' }
    ]
  });
}

/**
 * Counts AbsenteeFlag records matching filters.
 */
export async function countAbsenteeFlags(schoolId, options = {}, tx = prisma) {
  const where = { schoolId };

  if (options.classId) where.classId = options.classId;
  if (options.month) where.monthStr = options.month;
  if (options.isResolved !== undefined) where.isResolved = options.isResolved;

  return tx.absenteeFlag.count({ where });
}

/**
 * Finds an AbsenteeFlag by ID.
 */
export async function findAbsenteeFlagById(schoolId, id, tx = prisma) {
  return tx.absenteeFlag.findFirst({
    where: {
      id,
      schoolId
    },
    select: {
      id: true,
      schoolId: true,
      studentId: true,
      classId: true,
      monthStr: true,
      absentCount: true,
      flaggedAt: true,
      isResolved: true,
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          admissionNumber: true
        }
      }
    }
  });
}

/**
 * Updates an AbsenteeFlag (e.g. mark resolved).
 */
export async function updateAbsenteeFlag(schoolId, id, data, tx = prisma) {
  return tx.absenteeFlag.update({
    where: {
      schoolId_id: { schoolId, id }
    },
    data
  });
}

/**
 * Finds all active classes for dashboard calculations.
 */
export async function findClassesForDashboard(schoolId, tx = prisma) {
  return tx.class.findMany({
    where: { schoolId },
    select: {
      id: true,
      name: true,
      gradeLevel: true,
      sections: {
        select: {
          id: true,
          name: true
        }
      }
    },
    orderBy: { name: 'asc' }
  });
}

/**
 * Finds all attendance sessions and records for a specific calendar date.
 */
export async function findDailySessionsForDashboard(schoolId, date, tx = prisma) {
  return tx.attendanceSession.findMany({
    where: {
      schoolId,
      date
    },
    select: {
      id: true,
      classId: true,
      sectionId: true,
      session: true,
      class: {
        select: {
          id: true,
          name: true,
          gradeLevel: true
        }
      },
      records: {
        select: {
          studentId: true,
          status: true
        }
      }
    }
  });
}

/**
 * Resolves (marks read = true) pending attendance notifications for a specific class and date within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} classId - Class UUID
 * @param {string} date - YYYY-MM-DD date string
 * @param {Object} [tx=prisma] - Optional transaction client
 * @returns {Promise<{ count: number }>}
 */
export async function resolvePendingAttendanceNotifications(schoolId, classId, date, tx = prisma) {
  return tx.notification.updateMany({
    where: {
      schoolId,
      classId,
      date,
      type: 'attendance_pending',
      read: false
    },
    data: {
      read: true
    }
  });
}


