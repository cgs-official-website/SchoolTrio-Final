import { prisma } from '../../database/prisma.client.js';

/**
 * Counts the pending canteen meal requests for a school.
 *
 * @param {string} schoolId - School UUID
 * @param {Object} [tx=prisma] - Optional Prisma client or transaction
 * @returns {Promise<number>} Count of pending canteen requests
 */
export const countPendingCanteenRequests = async (schoolId, tx = prisma) => {
  return tx.canteenRequest.count({
    where: {
      schoolId,
      status: 'Pending'
    }
  });
};

/**
 * Finds canteen requests matching filter options with student and class relations.
 *
 * @param {string} schoolId - School UUID
 * @param {Object} [filters={}] - Filter criteria (status, date, mealType, search, studentId, studentIds, classId, limit, skip)
 * @param {Object} [tx=prisma] - Optional Prisma client or transaction
 * @returns {Promise<Array<Object>>}
 */
export async function findCanteenRequests(schoolId, filters = {}, tx = prisma) {
  const where = { schoolId };

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.studentId) {
    where.studentId = filters.studentId;
  } else if (filters.studentIds && Array.isArray(filters.studentIds)) {
    where.studentId = { in: filters.studentIds };
  }

  if (filters.classId) {
    where.student = { ...where.student, classId: filters.classId };
  }

  if (filters.search) {
    const q = filters.search.trim();
    where.student = {
      ...where.student,
      OR: [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { admissionNumber: { contains: q, mode: 'insensitive' } }
      ]
    };
  }

  const queryOptions = {
    where,
    include: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          admissionNumber: true,
          classId: true,
          sectionId: true,
          class: { select: { id: true, name: true } },
          section: { select: { id: true, name: true } }
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  };

  if (filters.limit) {
    queryOptions.take = filters.limit;
  }
  if (filters.skip) {
    queryOptions.skip = filters.skip;
  }

  const records = await tx.canteenRequest.findMany(queryOptions);

  // In-memory filter for JSONB itemDetails (mealType, date) to ensure robust cross-platform matching
  return records.filter((r) => {
    const details = r.itemDetails || {};
    if (filters.mealType && details.mealType !== filters.mealType) {
      return false;
    }
    if (filters.date) {
      const itemDate = details.date || (r.createdAt ? new Date(r.createdAt).toISOString().split('T')[0] : '');
      if (itemDate !== filters.date) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Finds a single canteen request by ID in a tenant.
 *
 * @param {string} schoolId - School UUID
 * @param {string} id - CanteenRequest UUID
 * @param {Object} [tx=prisma] - Optional Prisma client or transaction
 * @returns {Promise<Object|null>}
 */
export async function findCanteenRequestById(schoolId, id, tx = prisma) {
  return tx.canteenRequest.findFirst({
    where: { schoolId, id },
    include: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          admissionNumber: true,
          classId: true,
          sectionId: true,
          class: { select: { id: true, name: true } },
          section: { select: { id: true, name: true } }
        }
      }
    }
  });
}

/**
 * Locks a student row FOR UPDATE inside a transaction.
 *
 * @param {string} schoolId - School UUID
 * @param {string} studentId - Student UUID
 * @param {Object} tx - Active Prisma transaction client
 * @returns {Promise<Object|null>}
 */
export async function lockStudentForUpdate(schoolId, studentId, tx) {
  const rows = await tx.$queryRaw`
    SELECT id, school_id AS "schoolId"
    FROM students
    WHERE school_id = ${schoolId}::uuid AND id = ${studentId}::uuid
    FOR UPDATE
  `;
  return rows[0] || null;
}

/**
 * Acquires a PostgreSQL transaction-scoped advisory lock for a student/date/meal combination.
 *
 * @param {string} schoolId - School UUID
 * @param {string} studentId - Student UUID
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {string} mealType - 'Breakfast' | 'Lunch'
 * @param {Object} tx - Active Prisma transaction client
 */
export async function acquireAdvisoryLock(schoolId, studentId, date, mealType, tx) {
  const lockKey = `${schoolId}:${studentId}:${date}:${mealType}`;
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtext(${lockKey}))
  `;
}

/**
 * Checks for an existing active canteen request for student on date and mealType.
 *
 * @param {string} schoolId - School UUID
 * @param {string} studentId - Student UUID
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {string} mealType - 'Breakfast' | 'Lunch'
 * @param {Object} [tx=prisma] - Active Prisma client or transaction
 * @returns {Promise<Object|null>}
 */
export async function findActiveCanteenRequest(schoolId, studentId, date, mealType, tx = prisma) {
  const existingRecords = await tx.canteenRequest.findMany({
    where: {
      schoolId,
      studentId,
      status: { in: ['Pending', 'Approved', 'Delivered'] }
    }
  });

  return (
    existingRecords.find((r) => {
      const details = r.itemDetails || {};
      const reqDate = details.date || (r.createdAt ? new Date(r.createdAt).toISOString().split('T')[0] : '');
      return reqDate === date && details.mealType === mealType;
    }) || null
  );
}

/**
 * Creates a new CanteenRequest row.
 *
 * @param {string} schoolId - School UUID
 * @param {Object} data - Request payload ({ studentId, mealType, date })
 * @param {Object} [tx=prisma] - Active Prisma client or transaction
 * @returns {Promise<Object>}
 */
export async function createCanteenRequest(schoolId, data, tx = prisma) {
  return tx.canteenRequest.create({
    data: {
      schoolId,
      studentId: data.studentId,
      itemDetails: {
        mealType: data.mealType,
        date: data.date
      },
      status: 'Pending',
      totalAmount: 0
    },
    include: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          admissionNumber: true,
          classId: true,
          sectionId: true,
          class: { select: { id: true, name: true } },
          section: { select: { id: true, name: true } }
        }
      }
    }
  });
}

/**
 * Locks a CanteenRequest row FOR UPDATE inside a transaction.
 *
 * @param {string} schoolId - School UUID
 * @param {string} id - CanteenRequest UUID
 * @param {Object} tx - Active Prisma transaction client
 * @returns {Promise<Object|null>}
 */
export async function lockCanteenRequestForUpdate(schoolId, id, tx) {
  const rows = await tx.$queryRaw`
    SELECT id, school_id AS "schoolId", student_id AS "studentId", status, item_details AS "itemDetails"
    FROM canteen_requests
    WHERE school_id = ${schoolId}::uuid AND id = ${id}::uuid
    FOR UPDATE
  `;
  return rows[0] || null;
}

/**
 * Updates status and itemDetails of a CanteenRequest.
 *
 * @param {string} schoolId - School UUID
 * @param {string} id - CanteenRequest UUID
 * @param {string} status - New status ('Approved' | 'Delivered' | 'Cancelled')
 * @param {Object} itemDetails - Merged itemDetails object
 * @param {Object} [tx=prisma] - Active Prisma client or transaction
 * @returns {Promise<Object>}
 */
export async function updateCanteenRequestStatus(schoolId, id, status, itemDetails, tx = prisma) {
  return tx.canteenRequest.update({
    where: { schoolId_id: { schoolId, id } },
    data: {
      status,
      itemDetails
    },
    include: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          admissionNumber: true,
          classId: true,
          sectionId: true,
          class: { select: { id: true, name: true } },
          section: { select: { id: true, name: true } }
        }
      }
    }
  });
}

/**
 * Finds authorized student IDs for a parent user in a school.
 *
 * @param {string} schoolId - School UUID
 * @param {string} parentUserId - User UUID of parent
 * @param {Object} [tx=prisma] - Active Prisma client or transaction
 * @returns {Promise<Array<string>>} List of student UUIDs
 */
export async function findAuthorizedStudentIdsForParent(schoolId, parentUserId, tx = prisma) {
  const links = await tx.parentStudentLink.findMany({
    where: {
      schoolId,
      parent: {
        userId: parentUserId
      }
    },
    select: { studentId: true }
  });

  return links.map((l) => l.studentId);
}

/**
 * Finds a student by tenant and ID.
 *
 * @param {string} schoolId - School UUID
 * @param {string} studentId - Student UUID
 * @param {Object} [tx=prisma] - Active Prisma client or transaction
 * @returns {Promise<Object|null>}
 */
export async function findStudentInTenant(schoolId, studentId, tx = prisma) {
  return tx.student.findFirst({
    where: { schoolId, id: studentId }
  });
}

/**
 * Resolves staff profile for authenticated user ID.
 *
 * @param {string} schoolId - School UUID
 * @param {string} userId - User UUID
 * @param {Object} [tx=prisma] - Active Prisma client or transaction
 * @returns {Promise<Object|null>}
 */
export async function findStaffProfileByUserId(schoolId, userId, tx = prisma) {
  return tx.staffProfile.findFirst({
    where: { schoolId, userId },
    include: {
      user: { select: { id: true, isActive: true } },
      assignedClass: { select: { id: true, name: true } }
    }
  });
}

/**
 * Runs a transactional callback.
 *
 * @param {Function} callback - Async transaction function
 * @returns {Promise<*>}
 */
export async function runTransaction(callback) {
  return prisma.$transaction(callback, { isolationLevel: 'ReadCommitted' });
}

export const canteenRepository = {
  countPendingCanteenRequests,
  findCanteenRequests,
  findCanteenRequestById,
  lockStudentForUpdate,
  acquireAdvisoryLock,
  findActiveCanteenRequest,
  createCanteenRequest,
  lockCanteenRequestForUpdate,
  updateCanteenRequestStatus,
  findAuthorizedStudentIdsForParent,
  findStudentInTenant,
  findStaffProfileByUserId,
  runTransaction
};

export default canteenRepository;
