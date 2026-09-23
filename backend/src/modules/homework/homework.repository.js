import { prisma } from '../../database/prisma.client.js';

/**
 * Homework Repository Layer
 *
 * Strict Multi-Tenant Rules:
 * 1. Every query filters strictly by schoolId.
 * 2. Cross-tenant reads and mutations are rejected.
 * 3. Supports transaction propagation via optional `tx` parameter.
 */

/**
 * Verifies that a student exists within the specified tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} studentId - Student UUID
 * @param {Object} [tx=prisma] - Transaction client
 * @returns {Promise<Object|null>}
 */
export async function findStudentInTenant(schoolId, studentId, tx = prisma) {
  return tx.student.findFirst({
    where: {
      id: studentId,
      schoolId
    },
    select: {
      id: true,
      schoolId: true,
      classId: true,
      firstName: true,
      lastName: true,
      admissionNumber: true,
      status: true
    }
  });
}

/**
 * Derives authorized student IDs for an authenticated parent user within tenant context.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} userId - Parent User UUID
 * @param {Object} [tx=prisma] - Transaction client
 * @returns {Promise<Array<string>>}
 */
export async function findAuthorizedStudentIdsForParent(schoolId, userId, tx = prisma) {
  const profile = await tx.parentProfile.findFirst({
    where: {
      userId,
      schoolId
    },
    select: {
      id: true,
      user: {
        select: {
          isActive: true
        }
      }
    }
  });

  if (!profile || profile.user?.isActive === false) {
    return [];
  }

  const links = await tx.parentStudentLink.findMany({
    where: {
      parentProfileId: profile.id,
      schoolId
    },
    select: {
      studentId: true
    }
  });

  return links.map((l) => l.studentId);
}

/**
 * Finds staff profile by user ID for tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} userId - User UUID
 * @param {Object} [tx=prisma] - Transaction client
 * @returns {Promise<Object|null>}
 */
export async function findStaffProfileByUserId(schoolId, userId, tx = prisma) {
  return tx.staffProfile.findFirst({
    where: {
      schoolId,
      userId
    },
    select: {
      id: true,
      schoolId: true,
      assignedClassId: true,
      headedClasses: {
        select: {
          id: true
        }
      }
    }
  });
}

/**
 * Verifies that a class exists in tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} classId - Class UUID
 * @param {Object} [tx=prisma] - Transaction client
 * @returns {Promise<Object|null>}
 */
export async function findClassById(schoolId, classId, tx = prisma) {
  return tx.class.findFirst({
    where: {
      id: classId,
      schoolId
    },
    select: {
      id: true,
      schoolId: true,
      name: true,
      classTeacherId: true
    }
  });
}

/**
 * Verifies that a subject exists in tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} subjectId - Subject UUID
 * @param {Object} [tx=prisma] - Transaction client
 * @returns {Promise<Object|null>}
 */
export async function findSubjectById(schoolId, subjectId, tx = prisma) {
  return tx.subject.findFirst({
    where: {
      id: subjectId,
      schoolId
    },
    select: {
      id: true,
      schoolId: true,
      name: true,
      code: true
    }
  });
}

/**
 * Retrieves paginated homework assignments list for staff/admin with aggregate counts.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} options - Query & pagination options
 * @param {Object} [tx=prisma] - Transaction client
 * @returns {Promise<{ homeworks: Array, total: number }>}
 */
export async function findHomeworkList(schoolId, options = {}, tx = prisma) {
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 20));
  const skip = (page - 1) * limit;

  const where = {
    schoolId
  };

  if (options.classId) {
    where.classId = options.classId;
  }
  if (options.subjectId) {
    where.subjectId = options.subjectId;
  }
  if (options.startDate || options.endDate) {
    where.dueDate = {};
    if (options.startDate) where.dueDate.gte = options.startDate;
    if (options.endDate) where.dueDate.lte = options.endDate;
  }
  if (options.search) {
    where.OR = [
      { title: { contains: options.search, mode: 'insensitive' } },
      { description: { contains: options.search, mode: 'insensitive' } }
    ];
  }

  const sortField = options.sort === 'dueDate' ? 'dueDate' : options.sort === 'title' ? 'title' : 'createdAt';
  const sortOrder = options.order === 'asc' ? 'asc' : 'desc';

  const [total, homeworks] = await Promise.all([
    tx.homeworkAssignment.count({ where }),
    tx.homeworkAssignment.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortField]: sortOrder },
      include: {
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
        },
        submissions: {
          select: {
            id: true,
            status: true,
            grade: true
          }
        }
      }
    })
  ]);

  return { homeworks, total };
}

/**
 * Finds a single homework assignment by ID with class and subject details.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} homeworkId - Homework UUID
 * @param {Object} [tx=prisma] - Transaction client
 * @returns {Promise<Object|null>}
 */
export async function findHomeworkById(schoolId, homeworkId, tx = prisma) {
  return tx.homeworkAssignment.findFirst({
    where: {
      id: homeworkId,
      schoolId
    },
    include: {
      class: {
        select: {
          id: true,
          name: true,
          classTeacherId: true
        }
      },
      subject: {
        select: {
          id: true,
          name: true,
          code: true
        }
      }
    }
  });
}

/**
 * Finds a single homework assignment with full student roster and submissions.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} homeworkId - Homework UUID
 * @param {Object} [tx=prisma] - Transaction client
 * @returns {Promise<Object|null>}
 */
export async function findHomeworkWithRoster(schoolId, homeworkId, tx = prisma) {
  const assignment = await tx.homeworkAssignment.findFirst({
    where: {
      id: homeworkId,
      schoolId
    },
    include: {
      class: {
        select: {
          id: true,
          name: true,
          students: {
            where: {
              status: 'active'
            },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              admissionNumber: true,
              rollNumber: true
            },
            orderBy: [
              { rollNumber: 'asc' },
              { firstName: 'asc' }
            ]
          }
        }
      },
      subject: {
        select: {
          id: true,
          name: true,
          code: true
        }
      },
      submissions: {
        select: {
          id: true,
          studentId: true,
          status: true,
          grade: true,
          feedback: true,
          submittedAt: true,
          attachments: true,
          updatedAt: true
        }
      }
    }
  });

  return assignment;
}

/**
 * Creates a new homework assignment.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} data - Assignment payload
 * @param {Object} [tx=prisma] - Transaction client
 * @returns {Promise<Object>}
 */
export async function createHomework(schoolId, data, tx = prisma) {
  return tx.homeworkAssignment.create({
    data: {
      schoolId,
      title: data.title,
      description: data.description || null,
      classId: data.classId,
      subjectId: data.subjectId,
      dueDate: data.dueDate,
      attachments: data.attachments || null
    },
    include: {
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
    }
  });
}

/**
 * Updates an existing homework assignment.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} homeworkId - Homework UUID
 * @param {Object} data - Update payload
 * @param {Object} [tx=prisma] - Transaction client
 * @returns {Promise<Object>}
 */
export async function updateHomework(schoolId, homeworkId, data, tx = prisma) {
  return tx.homeworkAssignment.update({
    where: {
      id: homeworkId,
      schoolId
    },
    data,
    include: {
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
    }
  });
}

/**
 * Deletes a homework assignment.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} homeworkId - Homework UUID
 * @param {Object} [tx=prisma] - Transaction client
 * @returns {Promise<Object>}
 */
export async function deleteHomework(schoolId, homeworkId, tx = prisma) {
  return tx.homeworkAssignment.delete({
    where: {
      id: homeworkId,
      schoolId
    }
  });
}

/**
 * Counts submissions for a given homework assignment.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} homeworkId - Homework UUID
 * @param {Object} [tx=prisma] - Transaction client
 * @returns {Promise<number>}
 */
export async function countSubmissionsByHomeworkId(schoolId, homeworkId, tx = prisma) {
  return tx.homeworkSubmission.count({
    where: {
      schoolId,
      homeworkId
    }
  });
}

/**
 * Finds a single submission by homework ID and student ID.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} homeworkId - Homework UUID
 * @param {string} studentId - Student UUID
 * @param {Object} [tx=prisma] - Transaction client
 * @returns {Promise<Object|null>}
 */
export async function findSubmission(schoolId, homeworkId, studentId, tx = prisma) {
  return tx.homeworkSubmission.findFirst({
    where: {
      schoolId,
      homeworkId,
      studentId
    }
  });
}

/**
 * Upserts a homework submission row atomically.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} homeworkId - Homework UUID
 * @param {string} studentId - Student UUID
 * @param {Object} data - Submission fields ({ status, grade, feedback, submittedAt, attachments })
 * @param {Object} [tx=prisma] - Transaction client
 * @returns {Promise<Object>}
 */
export async function upsertSubmission(schoolId, homeworkId, studentId, data, tx = prisma) {
  const updateData = {};
  if (data.status !== undefined) updateData.status = data.status;
  if (data.grade !== undefined) updateData.grade = data.grade;
  if (data.feedback !== undefined) updateData.feedback = data.feedback;
  if (data.submittedAt !== undefined) updateData.submittedAt = data.submittedAt;
  if (data.attachments !== undefined) updateData.attachments = data.attachments;

  const createData = {
    schoolId,
    homeworkId,
    studentId,
    status: data.status || 'Not Started',
    grade: data.grade || null,
    feedback: data.feedback || null,
    attachments: data.attachments || null
  };
  if (data.submittedAt !== undefined) {
    createData.submittedAt = data.submittedAt;
  }

  return tx.homeworkSubmission.upsert({
    where: {
      schoolId_homeworkId_studentId: {
        schoolId,
        homeworkId,
        studentId
      }
    },
    update: updateData,
    create: createData
  });
}

/**
 * Retrieves student-scoped homework assignments for student's class with merged submission.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} classId - Class UUID of the student
 * @param {string} studentId - Student UUID
 * @param {Object} options - Query & pagination options
 * @param {Object} [tx=prisma] - Transaction client
 * @returns {Promise<{ homeworks: Array, total: number }>}
 */
export async function findStudentHomeworkList(schoolId, classId, studentId, options = {}, tx = prisma) {
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 50));
  const skip = (page - 1) * limit;

  const where = {
    schoolId,
    classId
  };

  if (options.subjectId) {
    where.subjectId = options.subjectId;
  }
  if (options.search) {
    where.OR = [
      { title: { contains: options.search, mode: 'insensitive' } },
      { description: { contains: options.search, mode: 'insensitive' } }
    ];
  }

  const sortField = options.sort === 'createdAt' ? 'createdAt' : 'dueDate';
  const sortOrder = options.order === 'desc' ? 'desc' : 'asc';

  const [total, homeworks] = await Promise.all([
    tx.homeworkAssignment.count({ where }),
    tx.homeworkAssignment.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortField]: sortOrder },
      include: {
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
        },
        submissions: {
          where: {
            studentId
          },
          select: {
            id: true,
            status: true,
            grade: true,
            feedback: true,
            submittedAt: true,
            attachments: true,
            updatedAt: true
          }
        }
      }
    })
  ]);

  return { homeworks, total };
}

/**
 * Counts homework assignments created since a given date with optional class filtering.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} [options={}] - Query filters ({ classIds, sinceDate })
 * @param {Object} [tx=prisma] - Transaction client
 * @returns {Promise<number>} Count of matching homework assignments
 */
export async function countHomeworkSince(schoolId, options = {}, tx = prisma) {
  const where = {
    schoolId
  };

  if (options.classIds && options.classIds.length > 0) {
    where.classId = { in: options.classIds };
  }

  if (options.sinceDate) {
    where.createdAt = {
      gt: options.sinceDate
    };
  }

  return tx.homeworkAssignment.count({ where });
}

/**
 * Finds class IDs for a list of student IDs in tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Array<string>} studentIds - Array of Student UUIDs
 * @param {Object} [tx=prisma] - Transaction client
 * @returns {Promise<Array<{ id: string, classId: string }>>}
 */
export async function findStudentsClasses(schoolId, studentIds, tx = prisma) {
  return tx.student.findMany({
    where: {
      schoolId,
      id: { in: studentIds }
    },
    select: {
      id: true,
      classId: true
    }
  });
}
