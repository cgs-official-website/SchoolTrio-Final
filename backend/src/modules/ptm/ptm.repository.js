import { prisma } from '../../database/prisma.client.js';

/**
 * PTM Data Access Repository Layer
 *
 * Strict Architectural Invariants:
 * 1. schoolId is mandatory for every query/mutation to enforce tenant isolation.
 * 2. Cross-tenant reads and mutations are strictly prevented.
 * 3. Supports transaction propagation via optional `tx` parameter.
 */

/**
 * Retrieves a single PTM appointment by ID within tenant context.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - Appointment UUID
 * @param {Object} [tx=prisma] - Transaction client
 * @returns {Promise<Object|null>}
 */
export async function findAppointmentById(schoolId, id, tx = prisma) {
  return tx.ptmAppointment.findFirst({
    where: {
      id,
      schoolId
    },
    include: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          admissionNumber: true,
          rollNumber: true,
          classId: true,
          sectionId: true,
          parents: {
            include: {
              parent: {
                select: {
                  id: true,
                  name: true,
                  phone: true,
                  email: true
                }
              }
            }
          }
        }
      },
      teacher: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          designation: true,
          assignedClassId: true
        }
      },
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
 * Finds a StaffProfile by User ID within tenant context.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} userId - User UUID
 * @param {Object} [tx=prisma]
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
          isActive: true
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
    }
  });
}

/**
 * Finds a StaffProfile by its ID within tenant context.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} staffProfileId - StaffProfile UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object|null>}
 */
export async function findStaffProfileById(schoolId, staffProfileId, tx = prisma) {
  return tx.staffProfile.findFirst({
    where: {
      id: staffProfileId,
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
      },
      headedClasses: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });
}

/**
 * Finds a Student by ID within tenant context.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} studentId - Student UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object|null>}
 */
export async function findStudentById(schoolId, studentId, tx = prisma) {
  return tx.student.findFirst({
    where: {
      id: studentId,
      schoolId
    },
    include: {
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
      parents: {
        include: {
          parent: {
            select: {
              id: true,
              userId: true,
              name: true,
              phone: true,
              email: true
            }
          }
        }
      }
    }
  });
}

/**
 * Finds a ParentProfile by User ID within tenant context.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} userId - Parent User UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object|null>}
 */
export async function findParentProfileByUserId(schoolId, userId, tx = prisma) {
  return tx.parentProfile.findFirst({
    where: {
      schoolId,
      userId
    },
    include: {
      user: {
        select: {
          isActive: true
        }
      },
      children: {
        select: {
          studentId: true
        }
      }
    }
  });
}

/**
 * Derives authorized student IDs for an authenticated parent user within tenant context.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} userId - Parent User UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<Array<string>>}
 */
export async function findAuthorizedStudentIdsForParent(schoolId, userId, tx = prisma) {
  const profile = await findParentProfileByUserId(schoolId, userId, tx);
  if (!profile || profile.user?.isActive === false) {
    return [];
  }
  return profile.children.map((c) => c.studentId);
}

/**
 * Acquires row-level exclusive locks (FOR UPDATE) on Teacher and Student records
 * to serialize concurrent booking operations within a transaction.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} teacherId - Teacher StaffProfile UUID
 * @param {string} studentId - Student UUID
 * @param {Object} tx - Transaction client
 */
export async function lockTeacherAndStudentForBooking(schoolId, teacherId, studentId, tx = prisma) {
  if (!tx || typeof tx.$queryRaw !== 'function') return;

  // 1. Lock Teacher StaffProfile
  if (teacherId) {
    await tx.$queryRaw`
      SELECT id FROM staff_profiles
      WHERE school_id = ${schoolId}::uuid AND id = ${teacherId}::uuid
      FOR UPDATE
    `;
  }

  // 2. Lock Student
  if (studentId) {
    await tx.$queryRaw`
      SELECT id FROM students
      WHERE school_id = ${schoolId}::uuid AND id = ${studentId}::uuid
      FOR UPDATE
    `;
  }
}

/**
 * Checks for conflicting active appointments for a teacher or student on the same date/timeSlot.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} params
 * @param {string} params.teacherId - Teacher StaffProfile UUID
 * @param {string} params.studentId - Student UUID
 * @param {string} params.date - Date YYYY-MM-DD
 * @param {string} params.timeSlot - Time slot string
 * @param {string} [params.excludeId] - Optional appointment ID to exclude (for updates)
 * @param {Object} [tx=prisma]
 * @returns {Promise<{ teacherConflict: boolean, studentConflict: boolean }>}
 */
export async function checkAppointmentConflicts(schoolId, params, tx = prisma) {
  const { teacherId, studentId, date, timeSlot, excludeId } = params;

  const baseWhere = {
    schoolId,
    date,
    timeSlot,
    status: {
      not: 'Cancelled'
    }
  };

  if (excludeId) {
    baseWhere.id = { not: excludeId };
  }

  const [teacherExisting, studentExisting] = await Promise.all([
    teacherId
      ? tx.ptmAppointment.findFirst({
          where: {
            ...baseWhere,
            teacherId
          },
          select: { id: true }
        })
      : null,
    studentId
      ? tx.ptmAppointment.findFirst({
          where: {
            ...baseWhere,
            studentId
          },
          select: { id: true }
        })
      : null
  ]);

  return {
    teacherConflict: Boolean(teacherExisting),
    studentConflict: Boolean(studentExisting)
  };
}

/**
 * Inserts a new PtmAppointment record within tenant context.
 *
 * @param {Object} data
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object>}
 */
export async function createAppointment(data, tx = prisma) {
  return tx.ptmAppointment.create({
    data: {
      schoolId: data.schoolId,
      studentId: data.studentId,
      teacherId: data.teacherId,
      classId: data.classId || null,
      date: data.date,
      timeSlot: data.timeSlot,
      type: data.type || 'In-person',
      status: data.status || 'Confirmed',
      notes: data.notes || null
    },
    include: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          admissionNumber: true,
          parents: {
            include: {
              parent: {
                select: {
                  id: true,
                  name: true,
                  phone: true,
                  email: true
                }
              }
            }
          }
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
      },
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
 * Updates an existing PtmAppointment within tenant context.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - Appointment UUID
 * @param {Object} data - Update fields
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object>}
 */
export async function updateAppointment(schoolId, id, data, tx = prisma) {
  return tx.ptmAppointment.update({
    where: {
      schoolId_id: {
        schoolId,
        id
      }
    },
    data: {
      ...(data.status !== undefined && { status: data.status }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.date !== undefined && { date: data.date }),
      ...(data.timeSlot !== undefined && { timeSlot: data.timeSlot }),
      ...(data.type !== undefined && { type: data.type })
    },
    include: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          admissionNumber: true,
          parents: {
            include: {
              parent: {
                select: {
                  id: true,
                  name: true,
                  phone: true,
                  email: true
                }
              }
            }
          }
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
      },
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
 * Builds where filter for teacher appointment listing.
 */
function buildTeacherWhereClause(schoolId, filters) {
  const { teacherId, classId, date, tab, status, todayStr } = filters;
  const where = { schoolId };

  if (teacherId) {
    where.teacherId = teacherId;
  }

  if (classId) {
    where.classId = classId;
  }

  if (date) {
    where.date = date;
  }

  if (status) {
    where.status = status;
  }

  if (tab === 'upcoming' && todayStr) {
    where.date = { gte: todayStr };
  } else if (tab === 'past' && todayStr) {
    where.date = { lt: todayStr };
  }

  return where;
}

/**
 * Finds paginated PTM appointments for a teacher/class within tenant context.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} filters
 * @param {Object} [tx=prisma]
 * @returns {Promise<Array<Object>>}
 */
export async function findTeacherAppointments(schoolId, filters, tx = prisma) {
  const where = buildTeacherWhereClause(schoolId, filters);
  const { skip = 0, limit = 50, sort = 'date', order = 'asc' } = filters;

  return tx.ptmAppointment.findMany({
    where,
    skip,
    take: limit,
    orderBy: [
      { [sort]: order },
      { timeSlot: order }
    ],
    include: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          admissionNumber: true,
          rollNumber: true,
          parents: {
            include: {
              parent: {
                select: {
                  id: true,
                  name: true,
                  phone: true,
                  email: true
                }
              }
            }
          }
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
      },
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
 * Counts PTM appointments for a teacher/class within tenant context.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} filters
 * @param {Object} [tx=prisma]
 * @returns {Promise<number>}
 */
export async function countTeacherAppointments(schoolId, filters, tx = prisma) {
  const where = buildTeacherWhereClause(schoolId, filters);
  return tx.ptmAppointment.count({ where });
}

/**
 * Builds where filter for student appointment listing.
 */
function buildStudentWhereClause(schoolId, filters) {
  const { studentId, tab, status, todayStr } = filters;
  const where = {
    schoolId,
    studentId
  };

  if (status) {
    where.status = status;
  }

  if (tab === 'upcoming' && todayStr) {
    where.date = { gte: todayStr };
  } else if (tab === 'past' && todayStr) {
    where.date = { lt: todayStr };
  }

  return where;
}

/**
 * Finds paginated PTM appointments for a student within tenant context.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} filters
 * @param {Object} [tx=prisma]
 * @returns {Promise<Array<Object>>}
 */
export async function findStudentAppointments(schoolId, filters, tx = prisma) {
  const where = buildStudentWhereClause(schoolId, filters);
  const { skip = 0, limit = 50, sort = 'date', order = 'asc' } = filters;

  return tx.ptmAppointment.findMany({
    where,
    skip,
    take: limit,
    orderBy: [
      { [sort]: order },
      { timeSlot: order }
    ],
    include: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          admissionNumber: true
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
      },
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
 * Counts PTM appointments for a student within tenant context.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} filters
 * @param {Object} [tx=prisma]
 * @returns {Promise<number>}
 */
export async function countStudentAppointments(schoolId, filters, tx = prisma) {
  const where = buildStudentWhereClause(schoolId, filters);
  return tx.ptmAppointment.count({ where });
}
