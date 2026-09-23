import { prisma } from '../../database/prisma.client.js';

/**
 * Class and Section Data Access Repository Layer
 *
 * Strict Tenant Safety Rules:
 * 1. Every query must explicitly filter by schoolId.
 * 2. Cross-tenant reads and mutations are strictly prevented.
 * 3. Supports transaction propagation via optional `tx` parameter.
 */

const CLASS_INCLUDE_CONFIG = {
  category: {
    select: {
      id: true,
      name: true,
      displayOrder: true
    }
  },
  classTeacher: {
    select: {
      id: true,
      name: true,
      employeeId: true,
      designation: true,
      staffType: true,
      email: true,
      phone: true
    }
  },
  sections: {
    select: {
      id: true,
      name: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          students: true
        }
      }
    },
    orderBy: {
      name: 'asc'
    }
  },
  _count: {
    select: {
      students: true,
      sections: true
    }
  }
};

/**
 * Finds paginated classes for a tenant with optional filtering.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} options
 * @param {string} [options.search]
 * @param {string} [options.categoryId]
 * @param {boolean} [options.hasTeacher]
 * @param {number} [options.skip=0]
 * @param {number} [options.take=20]
 * @param {string} [options.sort='name']
 * @param {string} [options.order='asc']
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Array>}
 */
export async function findClasses(schoolId, options = {}, tx = prisma) {
  const where = { schoolId };

  if (options.categoryId) {
    where.categoryId = options.categoryId;
  }

  if (options.search) {
    where.name = { contains: options.search, mode: 'insensitive' };
  }

  if (options.hasTeacher === true) {
    where.classTeacherId = { not: null };
  } else if (options.hasTeacher === false) {
    where.classTeacherId = null;
  }

  const orderBy = [];
  if (options.sort === 'gradeLevel') {
    orderBy.push({ gradeLevel: options.order || 'asc' });
    orderBy.push({ name: 'asc' });
  } else if (options.sort === 'createdAt') {
    orderBy.push({ createdAt: options.order || 'desc' });
  } else {
    orderBy.push({ name: options.order || 'asc' });
  }

  return tx.class.findMany({
    where,
    include: CLASS_INCLUDE_CONFIG,
    skip: options.skip,
    take: options.take,
    orderBy
  });
}

/**
 * Counts total classes matching filters for a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} options
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<number>}
 */
export async function countClasses(schoolId, options = {}, tx = prisma) {
  const where = { schoolId };

  if (options.categoryId) {
    where.categoryId = options.categoryId;
  }

  if (options.search) {
    where.name = { contains: options.search, mode: 'insensitive' };
  }

  if (options.hasTeacher === true) {
    where.classTeacherId = { not: null };
  } else if (options.hasTeacher === false) {
    where.classTeacherId = null;
  }

  return tx.class.count({ where });
}

/**
 * Finds a single class by ID within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} classId - Class UUID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object|null>}
 */
export async function findClassById(schoolId, classId, tx = prisma) {
  return tx.class.findFirst({
    where: {
      id: classId,
      schoolId
    },
    include: CLASS_INCLUDE_CONFIG
  });
}

/**
 * Finds a class by name (case-insensitive) within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} name - Class name
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object|null>}
 */
export async function findClassByName(schoolId, name, tx = prisma) {
  return tx.class.findFirst({
    where: {
      schoolId,
      name: { equals: name, mode: 'insensitive' }
    },
    include: CLASS_INCLUDE_CONFIG
  });
}

/**
 * Creates a new class for a tenant.
 *
 * @param {Object} data
 * @param {string} data.schoolId - Tenant UUID
 * @param {string} data.name - Class name
 * @param {string|null} [data.categoryId]
 * @param {number|null} [data.gradeLevel]
 * @param {string|null} [data.classTeacherId]
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object>}
 */
export async function createClass(data, tx = prisma) {
  return tx.class.create({
    data: {
      schoolId: data.schoolId,
      name: data.name,
      categoryId: data.categoryId || null,
      gradeLevel: data.gradeLevel !== undefined ? data.gradeLevel : null,
      classTeacherId: data.classTeacherId || null
    },
    include: CLASS_INCLUDE_CONFIG
  });
}

/**
 * Updates a class within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} classId - Class UUID
 * @param {Object} data - Update data
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object>}
 */
export async function updateClass(schoolId, classId, data, tx = prisma) {
  return tx.class.update({
    where: {
      schoolId_id: {
        schoolId,
        id: classId
      }
    },
    data,
    include: CLASS_INCLUDE_CONFIG
  });
}

/**
 * Deletes a class within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} classId - Class UUID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object>}
 */
export async function deleteClass(schoolId, classId, tx = prisma) {
  return tx.class.delete({
    where: {
      schoolId_id: {
        schoolId,
        id: classId
      }
    }
  });
}

/**
 * Finds all sections for a class within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} classId - Class UUID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Array>}
 */
export async function findSectionsByClassId(schoolId, classId, tx = prisma) {
  return tx.section.findMany({
    where: {
      schoolId,
      classId
    },
    select: {
      id: true,
      classId: true,
      name: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          students: true
        }
      }
    },
    orderBy: {
      name: 'asc'
    }
  });
}

/**
 * Finds a specific section by ID within a class and tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} classId - Class UUID
 * @param {string} sectionId - Section UUID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object|null>}
 */
export async function findSectionById(schoolId, classId, sectionId, tx = prisma) {
  return tx.section.findFirst({
    where: {
      id: sectionId,
      classId,
      schoolId
    },
    select: {
      id: true,
      classId: true,
      name: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          students: true
        }
      }
    }
  });
}

/**
 * Finds a section by name within a class and tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} classId - Class UUID
 * @param {string} name - Section name
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object|null>}
 */
export async function findSectionByName(schoolId, classId, name, tx = prisma) {
  return tx.section.findFirst({
    where: {
      schoolId,
      classId,
      name: { equals: name, mode: 'insensitive' }
    }
  });
}

/**
 * Creates a section within a class for a tenant.
 *
 * @param {Object} data
 * @param {string} data.schoolId - Tenant UUID
 * @param {string} data.classId - Class UUID
 * @param {string} data.name - Section name
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object>}
 */
export async function createSection(data, tx = prisma) {
  return tx.section.create({
    data: {
      schoolId: data.schoolId,
      classId: data.classId,
      name: data.name
    },
    select: {
      id: true,
      classId: true,
      name: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          students: true
        }
      }
    }
  });
}

/**
 * Updates a section within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} sectionId - Section UUID
 * @param {Object} data - Update payload
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object>}
 */
export async function updateSection(schoolId, sectionId, data, tx = prisma) {
  return tx.section.update({
    where: {
      schoolId_id: {
        schoolId,
        id: sectionId
      }
    },
    data,
    select: {
      id: true,
      classId: true,
      name: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          students: true
        }
      }
    }
  });
}

/**
 * Deletes a section within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} sectionId - Section UUID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object>}
 */
export async function deleteSection(schoolId, sectionId, tx = prisma) {
  return tx.section.delete({
    where: {
      schoolId_id: {
        schoolId,
        id: sectionId
      }
    }
  });
}

/**
 * Deletes all sections belonging to a class within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} classId - Class UUID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object>}
 */
export async function deleteSectionsByClassId(schoolId, classId, tx = prisma) {
  return tx.section.deleteMany({
    where: {
      schoolId,
      classId
    }
  });
}

/**
 * Finds a ClassCategory by ID within a tenant to verify ownership.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} categoryId - Category UUID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object|null>}
 */
export async function findCategoryById(schoolId, categoryId, tx = prisma) {
  return tx.classCategory.findFirst({
    where: {
      id: categoryId,
      schoolId
    }
  });
}

/**
 * Finds a StaffProfile by ID within a tenant to verify ownership.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} staffId - StaffProfile UUID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object|null>}
 */
export async function findStaffProfileById(schoolId, staffId, tx = prisma) {
  return tx.staffProfile.findFirst({
    where: {
      id: staffId,
      schoolId
    }
  });
}

/**
 * Finds any class in tenant that currently has the specified staff member assigned as class teacher.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} staffId - StaffProfile UUID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object|null>}
 */
export async function findClassByClassTeacherId(schoolId, staffId, tx = prisma) {
  return tx.class.findFirst({
    where: {
      schoolId,
      classTeacherId: staffId
    }
  });
}

/**
 * Clears the class teacher field on a specific class.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} classId - Class UUID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object>}
 */
export async function clearClassTeacherOnClass(schoolId, classId, tx = prisma) {
  return tx.class.update({
    where: {
      schoolId_id: {
        schoolId,
        id: classId
      }
    },
    data: {
      classTeacherId: null
    }
  });
}

/**
 * Sets assignedClassId on a StaffProfile.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} staffId - StaffProfile UUID
 * @param {string|null} classId - Class UUID or null
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object>}
 */
export async function updateStaffAssignedClass(schoolId, staffId, classId, tx = prisma) {
  return tx.staffProfile.update({
    where: {
      schoolId_id: {
        schoolId,
        id: staffId
      }
    },
    data: {
      assignedClassId: classId
    }
  });
}

/**
 * Checks all blocking dependencies for a Class within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} classId - Class UUID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<{ students: number, attendanceSessions: number, timetablePeriods: number, feeStructures: number, assessments: number, homeworkAssignments: number }>}
 */
export async function countClassDependencies(schoolId, classId, tx = prisma) {
  const [
    students,
    attendanceSessions,
    timetablePeriods,
    feeStructures,
    assessments,
    homeworkAssignments
  ] = await Promise.all([
    tx.student.count({ where: { schoolId, classId } }),
    tx.attendanceSession.count({ where: { schoolId, classId } }),
    tx.timetablePeriod.count({ where: { schoolId, classId } }),
    tx.feeStructure.count({ where: { schoolId, classId } }),
    tx.assessment.count({ where: { schoolId, classId } }),
    tx.homeworkAssignment.count({ where: { schoolId, classId } })
  ]);

  return {
    students,
    attendanceSessions,
    timetablePeriods,
    feeStructures,
    assessments,
    homeworkAssignments
  };
}

/**
 * Checks all blocking dependencies for a Section within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} sectionId - Section UUID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<{ students: number, attendanceSessions: number, timetablePeriods: number }>}
 */
export async function countSectionDependencies(schoolId, sectionId, tx = prisma) {
  const [
    students,
    attendanceSessions,
    timetablePeriods
  ] = await Promise.all([
    tx.student.count({ where: { schoolId, sectionId } }),
    tx.attendanceSession.count({ where: { schoolId, sectionId } }),
    tx.timetablePeriod.count({ where: { schoolId, sectionId } })
  ]);

  return {
    students,
    attendanceSessions,
    timetablePeriods
  };
}
