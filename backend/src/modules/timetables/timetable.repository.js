import { prisma } from '../../database/prisma.client.js';

const PERIOD_INCLUDES = Object.freeze({
  class: {
    select: {
      id: true,
      name: true
    }
  },
  section: {
    select: {
      id: true,
      name: true
    }
  },
  subject: {
    select: {
      id: true,
      name: true,
      code: true
    }
  },
  teacher: {
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      designation: true
    }
  }
});

/**
 * Executes an atomic transaction.
 * @param {Function} callback
 * @returns {Promise<any>}
 */
export async function runTransaction(callback) {
  return prisma.$transaction(async (tx) => {
    return callback(tx);
  });
}

/**
 * Finds timetable periods matching criteria within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} [filterOptions={}]
 * @param {Object} [tx=prisma]
 * @returns {Promise<Array>}
 */
export async function findTimetablePeriods(schoolId, filterOptions = {}, tx = prisma) {
  const where = {
    schoolId
  };

  if (filterOptions.classId) where.classId = filterOptions.classId;
  if (filterOptions.teacherId) where.teacherId = filterOptions.teacherId;
  if (filterOptions.subjectId) where.subjectId = filterOptions.subjectId;
  if (filterOptions.sectionId) where.sectionId = filterOptions.sectionId;
  if (filterOptions.dayOfWeek !== undefined && filterOptions.dayOfWeek !== null) {
    where.dayOfWeek = filterOptions.dayOfWeek;
  }

  return tx.timetablePeriod.findMany({
    where,
    include: PERIOD_INCLUDES,
    orderBy: [
      { dayOfWeek: 'asc' },
      { startTime: 'asc' },
      { periodNumber: 'asc' }
    ]
  });
}

/**
 * Finds a single timetable period by ID within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - Period UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object|null>}
 */
export async function findTimetablePeriodById(schoolId, id, tx = prisma) {
  return tx.timetablePeriod.findFirst({
    where: {
      id,
      schoolId
    },
    include: PERIOD_INCLUDES
  });
}

/**
 * Finds a class by ID within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} classId - Class UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object|null>}
 */
export async function findClassInTenant(schoolId, classId, tx = prisma) {
  return tx.class.findFirst({
    where: {
      id: classId,
      schoolId
    },
    include: {
      classTeacher: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });
}

/**
 * Finds a section by ID within a tenant and optionally verifies class ownership.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} sectionId - Section UUID
 * @param {string|null} [classId=null] - Optional class UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object|null>}
 */
export async function findSectionInTenant(schoolId, sectionId, classId = null, tx = prisma) {
  const where = {
    id: sectionId,
    schoolId
  };
  if (classId) {
    where.classId = classId;
  }
  return tx.section.findFirst({
    where
  });
}

/**
 * Finds a subject by ID within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} subjectId - Subject UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object|null>}
 */
export async function findSubjectInTenant(schoolId, subjectId, tx = prisma) {
  return tx.subject.findFirst({
    where: {
      id: subjectId,
      schoolId
    }
  });
}

/**
 * Finds a staff profile by ID within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} teacherId - StaffProfile UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object|null>}
 */
export async function findTeacherInTenant(schoolId, teacherId, tx = prisma) {
  return tx.staffProfile.findFirst({
    where: {
      id: teacherId,
      schoolId
    },
    include: {
      user: {
        select: {
          isActive: true
        }
      }
    }
  });
}

/**
 * Finds a staff profile by User ID within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} userId - User UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object|null>}
 */
export async function findStaffProfileByUserId(schoolId, userId, tx = prisma) {
  return tx.staffProfile.findFirst({
    where: {
      userId,
      schoolId
    },
    include: {
      user: {
        select: {
          isActive: true
        }
      },
      assignedClass: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });
}

/**
 * Finds a student profile by User ID within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} userId - User UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object|null>}
 */
export async function findStudentByUserId(schoolId, userId, tx = prisma) {
  return tx.student.findFirst({
    where: {
      userId,
      schoolId
    },
    include: {
      class: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });
}

/**
 * Finds all student class IDs linked to a parent's User ID within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} userId - Parent User UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<Array<string>>} List of authorized class IDs
 */
export async function findAuthorizedClassIdsForParent(schoolId, userId, tx = prisma) {
  const parentProfile = await tx.parentProfile.findFirst({
    where: {
      userId,
      schoolId
    },
    select: {
      id: true
    }
  });

  if (!parentProfile) {
    return [];
  }

  const links = await tx.parentStudentLink.findMany({
    where: {
      parentId: parentProfile.id,
      schoolId
    },
    select: {
      student: {
        select: {
          classId: true
        }
      }
    }
  });

  const classIds = new Set();
  for (const link of links) {
    if (link.student?.classId) {
      classIds.add(link.student.classId);
    }
  }

  return Array.from(classIds);
}

/**
 * Creates a single timetable period.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} data - Field data
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object>}
 */
export async function createTimetablePeriod(schoolId, data, tx = prisma) {
  return tx.timetablePeriod.create({
    data: {
      schoolId,
      classId: data.classId,
      sectionId: data.sectionId || null,
      subjectId: data.subjectId || null,
      teacherId: data.teacherId || null,
      dayOfWeek: data.dayOfWeek,
      periodNumber: data.periodNumber || 1,
      startTime: data.startTime,
      endTime: data.endTime,
      roomNumber: data.roomNumber || null
    },
    include: PERIOD_INCLUDES
  });
}

/**
 * Updates a single timetable period.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - Period UUID
 * @param {Object} data - Update fields
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object>}
 */
export async function updateTimetablePeriod(schoolId, id, data, tx = prisma) {
  return tx.timetablePeriod.update({
    where: {
      schoolId_id: {
        schoolId,
        id
      }
    },
    data: {
      ...(data.classId !== undefined ? { classId: data.classId } : {}),
      ...(data.sectionId !== undefined ? { sectionId: data.sectionId || null } : {}),
      ...(data.subjectId !== undefined ? { subjectId: data.subjectId || null } : {}),
      ...(data.teacherId !== undefined ? { teacherId: data.teacherId || null } : {}),
      ...(data.dayOfWeek !== undefined ? { dayOfWeek: data.dayOfWeek } : {}),
      ...(data.periodNumber !== undefined ? { periodNumber: data.periodNumber } : {}),
      ...(data.startTime !== undefined ? { startTime: data.startTime } : {}),
      ...(data.endTime !== undefined ? { endTime: data.endTime } : {}),
      ...(data.roomNumber !== undefined ? { roomNumber: data.roomNumber || null } : {})
    },
    include: PERIOD_INCLUDES
  });
}

/**
 * Deletes a single timetable period.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - Period UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object>}
 */
export async function deleteTimetablePeriod(schoolId, id, tx = prisma) {
  return tx.timetablePeriod.delete({
    where: {
      schoolId_id: {
        schoolId,
        id
      }
    }
  });
}

/**
 * Atomically replaces the entire timetable for a class.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} classId - Class UUID
 * @param {Array<Object>} periodsData - Array of validated period objects
 * @param {Object} tx - Transaction client (required)
 * @returns {Promise<Array<Object>>} All saved periods
 */
export async function replaceClassTimetable(schoolId, classId, periodsData, tx) {
  // 1. Delete existing timetable periods for this class in tenant
  await tx.timetablePeriod.deleteMany({
    where: {
      schoolId,
      classId
    }
  });

  // 2. Insert validated periods
  if (periodsData.length > 0) {
    await tx.timetablePeriod.createMany({
      data: periodsData.map((p) => ({
        schoolId,
        classId,
        sectionId: p.sectionId || null,
        subjectId: p.subjectId || null,
        teacherId: p.teacherId || null,
        dayOfWeek: p.dayOfWeek,
        periodNumber: p.periodNumber || 1,
        startTime: p.startTime,
        endTime: p.endTime,
        roomNumber: p.roomNumber || null
      }))
    });
  }

  // 3. Return fresh structured periods
  return tx.timetablePeriod.findMany({
    where: {
      schoolId,
      classId
    },
    include: PERIOD_INCLUDES,
    orderBy: [
      { dayOfWeek: 'asc' },
      { startTime: 'asc' },
      { periodNumber: 'asc' }
    ]
  });
}
