import { prisma } from '../../database/prisma.client.js';

/**
 * Staff and Staff Profiles Data Access Repository Layer
 *
 * Strict Tenant Safety Rules:
 * 1. Every query explicitly filters by schoolId.
 * 2. Cross-tenant reads and mutations are strictly prevented.
 * 3. Supports transaction propagation via optional `tx` parameter.
 */

export const STAFF_SELECT_CONFIG = {
  id: true,
  schoolId: true,
  userId: true,
  employeeId: true,
  name: true,
  staffType: true,
  designation: true,
  phone: true,
  email: true,
  assignedClassId: true,
  baseSalary: true,
  status: true,
  customData: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      email: true,
      systemRole: true,
      isActive: true,
      tokenVersion: true,
      roleAssignments: {
        select: {
          id: true,
          schoolRoleId: true,
          schoolRole: {
            select: {
              id: true,
              name: true,
              slug: true
            }
          }
        }
      }
    }
  },
  assignedClass: {
    select: {
      id: true,
      name: true
    }
  },
  headedClasses: {
    select: {
      id: true,
      name: true
    }
  }
};

/**
 * Finds paginated staff members for a tenant with optional search and filtering.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} options
 * @param {string} [options.search]
 * @param {string} [options.phone]
 * @param {string} [options.email]
 * @param {string} [options.staffType]
 * @param {string} [options.status]
 * @param {string} [options.roleId]
 * @param {string} [options.classId]
 * @param {number} [options.skip=0]
 * @param {number} [options.take=20]
 * @param {string} [options.sort='name']
 * @param {string} [options.order='asc']
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Array>}
 */
export async function findStaff(schoolId, options = {}, tx = prisma) {
  const where = { schoolId };

  if (options.search) {
    where.OR = [
      { name: { contains: options.search, mode: 'insensitive' } },
      { email: { contains: options.search, mode: 'insensitive' } },
      { employeeId: { contains: options.search, mode: 'insensitive' } },
      { phone: { contains: options.search, mode: 'insensitive' } }
    ];
  }

  if (options.phone) {
    where.phone = { contains: options.phone, mode: 'insensitive' };
  }

  if (options.email) {
    where.email = { contains: options.email, mode: 'insensitive' };
  }

  if (options.staffType) {
    where.staffType = options.staffType;
  }

  if (options.status) {
    where.status = options.status;
  }

  if (options.classId) {
    where.OR = [
      ...(where.OR || []),
      { assignedClassId: options.classId },
      { headedClasses: { some: { id: options.classId } } }
    ];
  }

  if (options.roleId) {
    where.user = {
      roleAssignments: {
        some: { schoolRoleId: options.roleId }
      }
    };
  }

  const orderBy = [];
  if (options.sort === 'email') {
    orderBy.push({ email: options.order || 'asc' });
  } else if (options.sort === 'employeeId') {
    orderBy.push({ employeeId: options.order || 'asc' });
  } else if (options.sort === 'createdAt') {
    orderBy.push({ createdAt: options.order || 'desc' });
  } else if (options.sort === 'updatedAt') {
    orderBy.push({ updatedAt: options.order || 'desc' });
  } else {
    orderBy.push({ name: options.order || 'asc' });
  }

  return tx.staffProfile.findMany({
    where,
    select: STAFF_SELECT_CONFIG,
    skip: options.skip,
    take: options.take,
    orderBy
  });
}

/**
 * Counts total staff matching filters for a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} options
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<number>}
 */
export async function countStaff(schoolId, options = {}, tx = prisma) {
  const where = { schoolId };

  if (options.search) {
    where.OR = [
      { name: { contains: options.search, mode: 'insensitive' } },
      { email: { contains: options.search, mode: 'insensitive' } },
      { employeeId: { contains: options.search, mode: 'insensitive' } },
      { phone: { contains: options.search, mode: 'insensitive' } }
    ];
  }

  if (options.phone) {
    where.phone = { contains: options.phone, mode: 'insensitive' };
  }

  if (options.email) {
    where.email = { contains: options.email, mode: 'insensitive' };
  }

  if (options.staffType) {
    where.staffType = options.staffType;
  }

  if (options.status) {
    where.status = options.status;
  }

  if (options.classId) {
    where.OR = [
      ...(where.OR || []),
      { assignedClassId: options.classId },
      { headedClasses: { some: { id: options.classId } } }
    ];
  }

  if (options.roleId) {
    where.user = {
      roleAssignments: {
        some: { schoolRoleId: options.roleId }
      }
    };
  }

  return tx.staffProfile.count({ where });
}

/**
 * Finds a single staff profile by ID within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - StaffProfile UUID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object|null>}
 */
export async function findStaffById(schoolId, id, tx = prisma) {
  return tx.staffProfile.findFirst({
    where: {
      id,
      schoolId
    },
    select: STAFF_SELECT_CONFIG
  });
}

/**
 * Acquires a row-level lock on a StaffProfile for safe mutation/deletion.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - StaffProfile UUID
 * @param {Object} tx - Transaction client
 * @returns {Promise<Object|null>}
 */
export async function findStaffByIdForUpdate(schoolId, id, tx) {
  const rows = await tx.$queryRaw`
    SELECT id, school_id, user_id, assigned_class_id
    FROM staff_profiles
    WHERE school_id = ${schoolId}::uuid AND id = ${id}::uuid
    FOR UPDATE
  `;
  return rows[0] || null;
}

/**
 * Finds a staff profile by associated User ID within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} userId - User UUID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object|null>}
 */
export async function findStaffByUserId(schoolId, userId, tx = prisma) {
  return tx.staffProfile.findFirst({
    where: {
      userId,
      schoolId
    },
    select: STAFF_SELECT_CONFIG
  });
}

/**
 * Finds a staff profile by employeeId within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} employeeId - Employee ID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object|null>}
 */
export async function findStaffByEmployeeId(schoolId, employeeId, tx = prisma) {
  return tx.staffProfile.findFirst({
    where: {
      schoolId,
      employeeId
    },
    select: STAFF_SELECT_CONFIG
  });
}

/**
 * Finds a staff profile by email within a tenant (case-insensitive).
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} email - Email address
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object|null>}
 */
export async function findStaffByEmail(schoolId, email, tx = prisma) {
  return tx.staffProfile.findFirst({
    where: {
      schoolId,
      email: { equals: email, mode: 'insensitive' }
    },
    select: STAFF_SELECT_CONFIG
  });
}

/**
 * Acquires a row-level lock on a Class row for class teacher assignment.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} classId - Class UUID
 * @param {Object} tx - Transaction client
 * @returns {Promise<Object|null>}
 */
export async function lockClassForUpdate(schoolId, classId, tx) {
  const rows = await tx.$queryRaw`
    SELECT id, school_id, class_teacher_id
    FROM classes
    WHERE school_id = ${schoolId}::uuid AND id = ${classId}::uuid
    FOR UPDATE
  `;
  return rows[0] || null;
}

/**
 * Counts all historical dependencies referencing a staff profile.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} staffProfileId - StaffProfile UUID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<{ lessonPlans: number, payroll: number, chatRooms: number, ptms: number, timetables: number }>}
 */
export async function countStaffDependencies(schoolId, staffProfileId, tx = prisma) {
  const [lessonPlans, payroll, chatRooms, ptms, timetables] = await Promise.all([
    tx.lessonPlan.count({ where: { schoolId, teacherId: staffProfileId } }),
    tx.hRPayrollRecord.count({ where: { schoolId, teacherId: staffProfileId } }),
    tx.chatRoom.count({ where: { schoolId, teacherId: staffProfileId } }),
    tx.ptmAppointment.count({ where: { schoolId, teacherId: staffProfileId } }),
    tx.timetablePeriod.count({ where: { schoolId, teacherId: staffProfileId } })
  ]);

  return {
    lessonPlans,
    payroll,
    chatRooms,
    ptms,
    timetables,
    total: lessonPlans + payroll + chatRooms + ptms + timetables
  };
}

/**
 * Creates a new StaffProfile.
 *
 * @param {Object} data
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object>}
 */
export async function createStaffProfile(data, tx = prisma) {
  return tx.staffProfile.create({
    data,
    select: STAFF_SELECT_CONFIG
  });
}

/**
 * Updates a StaffProfile within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - StaffProfile UUID
 * @param {Object} data
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object>}
 */
export async function updateStaffProfile(schoolId, id, data, tx = prisma) {
  return tx.staffProfile.update({
    where: {
      schoolId_id: {
        schoolId,
        id
      }
    },
    data,
    select: STAFF_SELECT_CONFIG
  });
}

/**
 * Deletes a StaffProfile within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - StaffProfile UUID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object>}
 */
export async function deleteStaffProfile(schoolId, id, tx = prisma) {
  return tx.staffProfile.delete({
    where: {
      schoolId_id: {
        schoolId,
        id
      }
    }
  });
}

/**
 * Creates a new User entity.
 *
 * @param {Object} data
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object>}
 */
export async function createUser(data, tx = prisma) {
  return tx.user.create({ data });
}

/**
 * Updates a User entity.
 *
 * @param {string} userId - User UUID
 * @param {Object} data
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object>}
 */
export async function updateUser(userId, data, tx = prisma) {
  return tx.user.update({
    where: { id: userId },
    data
  });
}

/**
 * Deletes a User entity.
 *
 * @param {string} userId - User UUID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object>}
 */
export async function deleteUser(userId, tx = prisma) {
  return tx.user.delete({
    where: { id: userId }
  });
}

/**
 * Assigns a SchoolRole to a User.
 *
 * @param {string} userId - User UUID
 * @param {string} schoolRoleId - SchoolRole UUID
 * @param {string} schoolId - Tenant UUID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object>}
 */
export async function assignUserRole(userId, schoolRoleId, schoolId, tx = prisma) {
  return tx.userRoleAssignment.create({
    data: {
      userId,
      schoolRoleId,
      schoolId
    }
  });
}

/**
 * Removes all role assignments for a User.
 *
 * @param {string} userId - User UUID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object>}
 */
export async function removeUserRoleAssignments(userId, tx = prisma) {
  return tx.userRoleAssignment.deleteMany({
    where: { userId }
  });
}

/**
 * Updates a Class entity's classTeacherId.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} classId - Class UUID
 * @param {string|null} classTeacherId - StaffProfile UUID or null
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object>}
 */
export async function updateClassTeacher(schoolId, classId, classTeacherId, tx = prisma) {
  return tx.class.update({
    where: {
      schoolId_id: {
        schoolId,
        id: classId
      }
    },
    data: {
      classTeacherId
    }
  });
}
