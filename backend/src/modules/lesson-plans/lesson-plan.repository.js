import { prisma } from '../../database/prisma.client.js';

const LESSON_PLAN_INCLUDES = {
  teacher: {
    select: {
      id: true,
      name: true,
      email: true,
      userId: true,
      status: true
    }
  },
  class: {
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
  }
};

/**
 * Builds standard Prisma where clause for LessonPlan queries with tenant isolation.
 *
 * @param {string} schoolId
 * @param {Object} filters
 * @returns {Object} Prisma where object
 */
export function buildWhereClause(schoolId, { classId, subjectId, teacherId, status, startDate, endDate, search } = {}) {
  const where = { schoolId };

  if (classId) {
    where.classId = classId;
  }

  if (subjectId) {
    where.subjectId = subjectId;
  }

  if (teacherId) {
    where.teacherId = teacherId;
  }

  if (status) {
    const lowerStatus = status.toLowerCase();
    const titleStatus = lowerStatus.charAt(0).toUpperCase() + lowerStatus.slice(1);
    where.status = {
      in: [lowerStatus, titleStatus]
    };
  }

  if (startDate || endDate) {
    const dateCondition = {};
    if (startDate) dateCondition.gte = startDate;
    if (endDate) dateCondition.lte = endDate;
    where.customData = {
      path: ['date'],
      ...dateCondition
    };
  }

  if (search) {
    where.OR = [
      {
        topics: {
          contains: search,
          mode: 'insensitive'
        }
      },
      {
        subject: {
          name: {
            contains: search,
            mode: 'insensitive'
          }
        }
      }
    ];
  }

  return where;
}

/**
 * Finds a StaffProfile by User ID within a specific school tenant.
 *
 * @param {string} schoolId - School UUID
 * @param {string} userId - User UUID
 * @param {Object} [tx=prisma] - Optional transaction client
 * @returns {Promise<Object|null>}
 */
export async function findStaffProfileByUserId(schoolId, userId, tx = prisma) {
  return tx.staffProfile.findFirst({
    where: {
      schoolId,
      userId
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          isActive: true
        }
      }
    }
  });
}

/**
 * Finds a StaffProfile by StaffProfile ID within a specific school tenant.
 *
 * @param {string} schoolId - School UUID
 * @param {string} id - StaffProfile UUID
 * @param {Object} [tx=prisma] - Optional transaction client
 * @returns {Promise<Object|null>}
 */
export async function findStaffProfileById(schoolId, id, tx = prisma) {
  return tx.staffProfile.findFirst({
    where: {
      schoolId,
      id
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          isActive: true
        }
      }
    }
  });
}

/**
 * Finds a Class by ID within a specific school tenant.
 *
 * @param {string} schoolId - School UUID
 * @param {string} id - Class UUID
 * @param {Object} [tx=prisma] - Optional transaction client
 * @returns {Promise<Object|null>}
 */
export async function findClassById(schoolId, id, tx = prisma) {
  return tx.class.findFirst({
    where: {
      schoolId,
      id
    }
  });
}

/**
 * Finds a Subject by ID within a specific school tenant.
 *
 * @param {string} schoolId - School UUID
 * @param {string} id - Subject UUID
 * @param {Object} [tx=prisma] - Optional transaction client
 * @returns {Promise<Object|null>}
 */
export async function findSubjectById(schoolId, id, tx = prisma) {
  return tx.subject.findFirst({
    where: {
      schoolId,
      id
    }
  });
}

/**
 * Creates a new LessonPlan record.
 *
 * @param {string} schoolId - School UUID
 * @param {Object} data - Lesson plan payload
 * @param {Object} [tx=prisma] - Optional transaction client
 * @returns {Promise<Object>}
 */
export async function createLessonPlan(schoolId, data, tx = prisma) {
  return tx.lessonPlan.create({
    data: {
      schoolId,
      teacherId: data.teacherId,
      classId: data.classId,
      subjectId: data.subjectId,
      weekNumber: data.weekNumber,
      status: data.status || 'Draft',
      topics: data.topic || data.topics || null,
      objectives: data.objectives || null,
      customData: data.customData || null
    },
    include: LESSON_PLAN_INCLUDES
  });
}

/**
 * Lists LessonPlans with filters, pagination, and relation hydration.
 *
 * @param {string} schoolId - School UUID
 * @param {Object} filters - Filter options
 * @param {Object} [tx=prisma] - Optional transaction client
 * @returns {Promise<{ data: Array<Object>, total: number }>}
 */
export async function findLessonPlans(schoolId, filters = {}, tx = prisma) {
  const where = buildWhereClause(schoolId, filters);
  const page = Number(filters.page) || 1;
  const limit = Number(filters.limit) || 20;
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    tx.lessonPlan.findMany({
      where,
      skip,
      take: limit,
      orderBy: {
        createdAt: 'desc'
      },
      include: LESSON_PLAN_INCLUDES
    }),
    tx.lessonPlan.count({ where })
  ]);

  return { data, total };
}

/**
 * Finds a single LessonPlan by ID within a school tenant.
 *
 * @param {string} schoolId - School UUID
 * @param {string} id - LessonPlan UUID
 * @param {Object} [tx=prisma] - Optional transaction client
 * @returns {Promise<Object|null>}
 */
export async function findLessonPlanById(schoolId, id, tx = prisma) {
  return tx.lessonPlan.findFirst({
    where: {
      schoolId,
      id
    },
    include: LESSON_PLAN_INCLUDES
  });
}

/**
 * Finds a single LessonPlan by ID with a PostgreSQL row-level lock (FOR UPDATE).
 *
 * @param {string} schoolId - School UUID
 * @param {string} id - LessonPlan UUID
 * @param {Object} tx - Active Prisma transaction client
 * @returns {Promise<Object|null>}
 */
export async function findLessonPlanByIdForUpdate(schoolId, id, tx) {
  const rows = await tx.$queryRaw`
    SELECT
      id,
      school_id AS "schoolId",
      teacher_id AS "teacherId",
      class_id AS "classId",
      subject_id AS "subjectId",
      week_number AS "weekNumber",
      status,
      topics,
      objectives,
      custom_data AS "customData",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM lesson_plans
    WHERE id = ${id}::uuid AND school_id = ${schoolId}::uuid
    FOR UPDATE;
  `;
  return rows[0] || null;
}

/**
 * Updates an existing LessonPlan record.
 *
 * @param {string} schoolId - School UUID
 * @param {string} id - LessonPlan UUID
 * @param {Object} data - Fields to update
 * @param {Object} [tx=prisma] - Optional transaction client
 * @returns {Promise<Object>}
 */
export async function updateLessonPlan(schoolId, id, data, tx = prisma) {
  const updateData = {};

  if (data.teacherId !== undefined) updateData.teacherId = data.teacherId;
  if (data.classId !== undefined) updateData.classId = data.classId;
  if (data.subjectId !== undefined) updateData.subjectId = data.subjectId;
  if (data.weekNumber !== undefined) updateData.weekNumber = data.weekNumber;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.topic !== undefined) updateData.topics = data.topic;
  if (data.topics !== undefined) updateData.topics = data.topics;
  if (data.objectives !== undefined) updateData.objectives = data.objectives;
  if (data.customData !== undefined) updateData.customData = data.customData;

  return tx.lessonPlan.update({
    where: {
      schoolId_id: {
        schoolId,
        id
      }
    },
    data: updateData,
    include: LESSON_PLAN_INCLUDES
  });
}

/**
 * Deletes a LessonPlan record within a school tenant.
 *
 * @param {string} schoolId - School UUID
 * @param {string} id - LessonPlan UUID
 * @param {Object} [tx=prisma] - Optional transaction client
 * @returns {Promise<Object>}
 */
export async function deleteLessonPlan(schoolId, id, tx = prisma) {
  return tx.lessonPlan.delete({
    where: {
      schoolId_id: {
        schoolId,
        id
      }
    }
  });
}
