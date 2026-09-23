import { prisma } from '../../database/prisma.client.js';

/**
 * Parent and Parent-Student Link Data Access Repository Layer
 *
 * Strict Tenant Safety Rules:
 * 1. Every query explicitly filters by schoolId.
 * 2. Cross-tenant reads and mutations are strictly prevented.
 * 3. Supports transaction propagation via optional `tx` parameter.
 */

export const PARENT_SELECT_CONFIG = {
  id: true,
  schoolId: true,
  userId: true,
  name: true,
  phone: true,
  email: true,
  address: true,
  emergencyContact: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      email: true,
      systemRole: true,
      isActive: true,
      tokenVersion: true
    }
  },
  children: {
    select: {
      id: true,
      relationship: true,
      createdAt: true,
      studentId: true,
      student: {
        select: {
          id: true,
          admissionNumber: true,
          firstName: true,
          lastName: true,
          status: true,
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
          }
        }
      }
    }
  },
  _count: {
    select: {
      children: true
    }
  }
};

/**
 * Finds paginated parents for a tenant with optional search and filtering.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} options
 * @param {string} [options.search]
 * @param {string} [options.phone]
 * @param {string} [options.email]
 * @param {number} [options.skip=0]
 * @param {number} [options.take=20]
 * @param {string} [options.sort='name']
 * @param {string} [options.order='asc']
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Array>}
 */
export async function findParents(schoolId, options = {}, tx = prisma) {
  const where = { schoolId };

  if (options.search) {
    where.OR = [
      { name: { contains: options.search, mode: 'insensitive' } },
      { phone: { contains: options.search, mode: 'insensitive' } },
      { email: { contains: options.search, mode: 'insensitive' } }
    ];
  }

  if (options.phone) {
    where.phone = { contains: options.phone, mode: 'insensitive' };
  }

  if (options.email) {
    where.email = { contains: options.email, mode: 'insensitive' };
  }

  const orderBy = [];
  if (options.sort === 'email') {
    orderBy.push({ email: options.order || 'asc' });
  } else if (options.sort === 'phone') {
    orderBy.push({ phone: options.order || 'asc' });
  } else if (options.sort === 'createdAt') {
    orderBy.push({ createdAt: options.order || 'desc' });
  } else if (options.sort === 'updatedAt') {
    orderBy.push({ updatedAt: options.order || 'desc' });
  } else {
    orderBy.push({ name: options.order || 'asc' });
  }

  return tx.parentProfile.findMany({
    where,
    select: PARENT_SELECT_CONFIG,
    skip: options.skip,
    take: options.take,
    orderBy
  });
}

/**
 * Counts total parents matching filters for a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} options
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<number>}
 */
export async function countParents(schoolId, options = {}, tx = prisma) {
  const where = { schoolId };

  if (options.search) {
    where.OR = [
      { name: { contains: options.search, mode: 'insensitive' } },
      { phone: { contains: options.search, mode: 'insensitive' } },
      { email: { contains: options.search, mode: 'insensitive' } }
    ];
  }

  if (options.phone) {
    where.phone = { contains: options.phone, mode: 'insensitive' };
  }

  if (options.email) {
    where.email = { contains: options.email, mode: 'insensitive' };
  }

  return tx.parentProfile.count({ where });
}

/**
 * Finds a single parent by ID within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} parentId - ParentProfile UUID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object|null>}
 */
export async function findParentById(schoolId, parentId, tx = prisma) {
  return tx.parentProfile.findFirst({
    where: {
      id: parentId,
      schoolId
    },
    select: PARENT_SELECT_CONFIG
  });
}

/**
 * Finds a parent profile by associated User ID.
 *
 * @param {string} userId - User UUID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object|null>}
 */
export async function findParentByUserId(userId, tx = prisma) {
  return tx.parentProfile.findUnique({
    where: { userId },
    select: PARENT_SELECT_CONFIG
  });
}

/**
 * Finds a parent by email within a tenant (case-insensitive).
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} email - Email address
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object|null>}
 */
export async function findParentByEmail(schoolId, email, tx = prisma) {
  return tx.parentProfile.findFirst({
    where: {
      schoolId,
      email: { equals: email, mode: 'insensitive' }
    },
    select: PARENT_SELECT_CONFIG
  });
}

/**
 * Finds a parent by phone within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} phone - Phone number
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object|null>}
 */
export async function findParentByPhone(schoolId, phone, tx = prisma) {
  return tx.parentProfile.findFirst({
    where: {
      schoolId,
      phone
    },
    select: PARENT_SELECT_CONFIG
  });
}

/**
 * Updates a parent profile within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} parentId - ParentProfile UUID
 * @param {Object} data - Update payload
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object>}
 */
export async function updateParentProfile(schoolId, parentId, data, tx = prisma) {
  return tx.parentProfile.update({
    where: {
      schoolId_id: {
        schoolId,
        id: parentId
      }
    },
    data,
    select: PARENT_SELECT_CONFIG
  });
}

/**
 * Updates a user entity.
 *
 * @param {string} userId - User UUID
 * @param {Object} data - Update payload
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
 * Finds all parent links for a given student within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} studentId - Student UUID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Array>}
 */
export async function findStudentParents(schoolId, studentId, tx = prisma) {
  return tx.parentStudentLink.findMany({
    where: {
      schoolId,
      studentId
    },
    select: {
      id: true,
      relationship: true,
      createdAt: true,
      parentProfileId: true,
      parent: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          address: true,
          emergencyContact: true,
          user: {
            select: {
              id: true,
              email: true,
              systemRole: true,
              isActive: true
            }
          }
        }
      }
    },
    orderBy: {
      createdAt: 'asc'
    }
  });
}

/**
 * Finds a specific parent-student link within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} studentId - Student UUID
 * @param {string} parentProfileId - ParentProfile UUID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object|null>}
 */
export async function findParentStudentLink(schoolId, studentId, parentProfileId, tx = prisma) {
  return tx.parentStudentLink.findFirst({
    where: {
      schoolId,
      studentId,
      parentProfileId
    },
    select: {
      id: true,
      schoolId: true,
      studentId: true,
      parentProfileId: true,
      relationship: true,
      createdAt: true,
      parent: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          emergencyContact: true,
          user: {
            select: {
              id: true,
              email: true,
              isActive: true,
              systemRole: true
            }
          }
        }
      },
      student: {
        select: {
          id: true,
          admissionNumber: true,
          firstName: true,
          lastName: true,
          status: true,
          class: { select: { id: true, name: true } },
          section: { select: { id: true, name: true } }
        }
      }
    }
  });
}

/**
 * Creates a parent-student link.
 *
 * @param {Object} data
 * @param {string} data.schoolId
 * @param {string} data.studentId
 * @param {string} data.parentProfileId
 * @param {string} data.relationship
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object>}
 */
export async function createParentStudentLink(data, tx = prisma) {
  return tx.parentStudentLink.create({
    data: {
      schoolId: data.schoolId,
      studentId: data.studentId,
      parentProfileId: data.parentProfileId,
      relationship: data.relationship
    },
    select: {
      id: true,
      schoolId: true,
      studentId: true,
      parentProfileId: true,
      relationship: true,
      createdAt: true,
      parent: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          user: {
            select: {
              id: true,
              email: true,
              isActive: true
            }
          }
        }
      }
    }
  });
}

/**
 * Deletes a parent-student link within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} studentId - Student UUID
 * @param {string} parentProfileId - ParentProfile UUID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object>}
 */
export async function deleteParentStudentLink(schoolId, studentId, parentProfileId, tx = prisma) {
  return tx.parentStudentLink.delete({
    where: {
      parentProfileId_studentId: {
        parentProfileId,
        studentId
      }
    }
  });
}

/**
 * Finds all children linked to an authenticated parent user within a tenant.
 *
 * @param {string} userId - Authenticated Parent User UUID
 * @param {string} schoolId - Tenant UUID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Array>}
 */
export async function findChildrenByParentUserId(userId, schoolId, tx = prisma) {
  const profile = await tx.parentProfile.findUnique({
    where: { userId },
    select: { id: true }
  });

  if (!profile) {
    return [];
  }

  return tx.parentStudentLink.findMany({
    where: {
      parentProfileId: profile.id,
      schoolId
    },
    select: {
      id: true,
      relationship: true,
      createdAt: true,
      student: {
        select: {
          id: true,
          admissionNumber: true,
          rollNumber: true,
          firstName: true,
          lastName: true,
          dob: true,
          gender: true,
          bloodGroup: true,
          photoUrl: true,
          status: true,
          classId: true,
          sectionId: true,
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
          }
        }
      }
    },
    orderBy: {
      createdAt: 'asc'
    }
  });
}

/**
 * Finds a student by admission number and date of birth within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} admissionNumber - Admission number
 * @param {string} dob - Date of birth (YYYY-MM-DD)
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object|null>}
 */
export async function findStudentByAdmissionAndDob(schoolId, admissionNumber, dob, tx = prisma) {
  return tx.student.findFirst({
    where: {
      schoolId,
      admissionNumber: { equals: admissionNumber, mode: 'insensitive' },
      dob
    },
    select: {
      id: true,
      schoolId: true,
      admissionNumber: true,
      rollNumber: true,
      firstName: true,
      lastName: true,
      dob: true,
      gender: true,
      bloodGroup: true,
      photoUrl: true,
      status: true,
      classId: true,
      sectionId: true,
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
      }
    }
  });
}
