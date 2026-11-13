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
  if (filterOptions.excludeClassId) where.classId = { not: filterOptions.excludeClassId };
  if (filterOptions.teacherId) {
    if (Array.isArray(filterOptions.teacherId)) {
      where.teacherId = { in: filterOptions.teacherId };
    } else {
      where.teacherId = filterOptions.teacherId;
    }
  }
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
 * Finds the class teacher of a section.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} sectionId - Section UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<{id: string, name: string}|null>}
 */
export async function findSectionClassTeacher(schoolId, sectionId, tx = prisma) {
  const section = await tx.section.findFirst({
    where: { id: sectionId, schoolId },
    select: { classTeacher: { select: { id: true, name: true } } }
  });
  return section?.classTeacher || null;
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
      parentProfileId: parentProfile.id,
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
 * Finds the ids of the sections the parent's children attend (optionally within one class).
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} userId - Parent User UUID
 * @param {string|null} [classId=null]
 * @param {Object} [tx=prisma]
 * @returns {Promise<Array<string>>}
 */
export async function findAuthorizedSectionIdsForParent(schoolId, userId, classId = null, tx = prisma) {
  const parentProfile = await tx.parentProfile.findFirst({
    where: { userId, schoolId },
    select: { id: true }
  });
  if (!parentProfile) return [];

  const links = await tx.parentStudentLink.findMany({
    where: { parentProfileId: parentProfile.id, schoolId },
    select: { student: { select: { classId: true, sectionId: true } } }
  });

  const ids = new Set();
  for (const link of links) {
    const st = link.student;
    if (!st?.sectionId) continue;
    if (classId && st.classId !== classId) continue;
    ids.add(st.sectionId);
  }
  return Array.from(ids);
}

/**
 * Lists the section ids of a class (used to detect when every section has its own timetable).
 */
export async function findSectionIdsByClass(schoolId, classId, tx = prisma) {
  const rows = await tx.section.findMany({
    where: { schoolId, classId },
    select: { id: true }
  });
  return rows.map((r) => r.id);
}

/**
 * Atomically replaces the timetable of a class.
 *
 * - With `sectionId`: ONLY that section's periods are replaced. Sibling sections are untouched,
 *   so V-A and V-B each keep their own timetable.
 * - Without `sectionId`: legacy behaviour, every period of the class is replaced.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} classId - Class UUID
 * @param {Array<Object>} periodsData - Array of validated period objects
 * @param {Object} tx - Transaction client (required)
 * @param {Object} [options]
 * @param {string|null} [options.sectionId]
 * @returns {Promise<Array<Object>>} All saved periods (of the section, or of the class)
 */
export async function replaceClassTimetable(schoolId, classId, periodsData, tx, options = {}) {
  const sectionId = options.sectionId || null;

  // 1. Delete existing timetable periods in scope
  await tx.timetablePeriod.deleteMany({
    where: {
      schoolId,
      classId,
      ...(sectionId ? { sectionId } : {})
    }
  });

  // 2. Insert validated periods
  if (periodsData.length > 0) {
    await tx.timetablePeriod.createMany({
        data: periodsData.map((p) => ({
        schoolId,
        classId,
        sectionId: sectionId || p.sectionId || null,
        subjectId: p.subjectId || null,
        teacherId: p.teacherId || null,
        templateSlotId: p.templateSlotId || null,
        dayOfWeek: p.dayOfWeek,
        periodNumber: p.periodNumber || 1,
        startTime: p.startTime,
        endTime: p.endTime,
        roomNumber: p.roomNumber || null
      }))
    });
  }

  // 2b. Once EVERY section of the class has its own timetable, the old shared
  //     (section-less) periods are obsolete: remove them so they stop leaking into any view.
  if (sectionId) {
    const allSectionIds = await findSectionIdsByClass(schoolId, classId, tx);
    if (allSectionIds.length > 0) {
      const withOwn = await tx.timetablePeriod.groupBy({
        by: ['sectionId'],
        where: { schoolId, classId, sectionId: { in: allSectionIds } }
      });
      if (withOwn.length === allSectionIds.length) {
        await tx.timetablePeriod.deleteMany({ where: { schoolId, classId, sectionId: null } });
      }
    }
  }

  // 3. Return fresh structured periods
  return tx.timetablePeriod.findMany({
    where: {
      schoolId,
      classId,
      ...(sectionId ? { OR: [{ sectionId }, { sectionId: null }] } : {})
    },
    include: PERIOD_INCLUDES,
    orderBy: [
      { dayOfWeek: 'asc' },
      { startTime: 'asc' },
      { periodNumber: 'asc' }
    ]
  });
}

/**
 * Finds the school's period template (with ordered slots).
 */
export async function findTemplate(schoolId, tx = prisma) {
  return tx.timetableTemplate.findUnique({
    where: { schoolId },
    include: { slots: { orderBy: { slotOrder: 'asc' } } }
  });
}

/**
 * Returns { [slotId]: count } of timetable periods that use the given template slots.
 */
export async function countPeriodsBySlot(schoolId, slotIds, tx = prisma) {
  if (!slotIds || slotIds.length === 0) return {};
  const rows = await tx.timetablePeriod.groupBy({
    by: ['templateSlotId'],
    where: { schoolId, templateSlotId: { in: slotIds } },
    _count: { _all: true }
  });
  return Object.fromEntries(rows.map((r) => [r.templateSlotId, r._count._all]));
}

/**
 * Upserts the school template and syncs its slots.
 * - Slots with an id are updated, and the times of every linked period are updated too (Option A).
 * - Slots without an id are created.
 * - Existing slots missing from the payload are deleted (service has already verified they are unused).
 */
export async function saveTemplate(schoolId, { name, slots }, tx) {
  const template = await tx.timetableTemplate.upsert({
    where: { schoolId },
    update: name ? { name } : {},
    create: { schoolId, name: name || 'Default Schedule' }
  });

  const existing = await tx.timetableTemplateSlot.findMany({
    where: { schoolId, templateId: template.id },
    select: { id: true }
  });
  const keepIds = new Set(slots.filter((s) => s.id).map((s) => s.id));
  const removeIds = existing.map((e) => e.id).filter((id) => !keepIds.has(id));
  if (removeIds.length > 0) {
    await tx.timetableTemplateSlot.deleteMany({ where: { schoolId, id: { in: removeIds } } });
  }

  let periodCounter = 0;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (s.slotType === 'PERIOD') periodCounter += 1;
    const data = {
      slotOrder: i + 1,
      slotType: s.slotType,
      label: s.label,
      startTime: s.startTime,
      endTime: s.endTime
    };
    if (s.id) {
      await tx.timetableTemplateSlot.update({
        where: { schoolId_id: { schoolId, id: s.id } },
        data
      });
      // Option A: keep every linked period in sync with the template
      await tx.timetablePeriod.updateMany({
        where: { schoolId, templateSlotId: s.id },
        data: { startTime: s.startTime, endTime: s.endTime, periodNumber: periodCounter }
      });
    } else {
      await tx.timetableTemplateSlot.create({
        data: { schoolId, templateId: template.id, ...data }
      });
    }
  }

  return findTemplate(schoolId, tx);
}