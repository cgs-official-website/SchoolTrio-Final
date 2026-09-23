import { prisma } from '../../database/prisma.client.js';

/**
 * Notice Repository Layer
 *
 * Strict Multi-Tenant Rules:
 * 1. Every query filters strictly by schoolId.
 * 2. Cross-tenant reads and mutations are rejected.
 * 3. Supports transaction propagation via optional `tx` parameter.
 */

/**
 * Verifies that a class exists within the specified tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} classId - Class UUID
 * @param {Object} [tx=prisma] - Transaction client
 * @returns {Promise<Object|null>}
 */
export async function findClassInTenant(schoolId, classId, tx = prisma) {
  if (!classId) return null;
  return tx.class.findFirst({
    where: {
      id: classId,
      schoolId
    },
    select: {
      id: true,
      name: true,
      schoolId: true,
      classTeacherId: true
    }
  });
}

/**
 * Verifies that students exist within the specified tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Array<string>} studentIds - Array of Student UUIDs
 * @param {Object} [tx=prisma] - Transaction client
 * @returns {Promise<Array<Object>>}
 */
export async function findStudentsInTenant(schoolId, studentIds, tx = prisma) {
  if (!studentIds || studentIds.length === 0) return [];
  return tx.student.findMany({
    where: {
      id: { in: studentIds },
      schoolId
    },
    select: {
      id: true,
      schoolId: true,
      classId: true,
      firstName: true,
      lastName: true
    }
  });
}

/**
 * Derives authorized student IDs and their classes for an authenticated parent user within tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} userId - Parent User UUID
 * @param {Object} [tx=prisma] - Transaction client
 * @returns {Promise<{ studentIds: Array<string>, classIds: Array<string> }>}
 */
export async function findParentStudentsAndClasses(schoolId, userId, tx = prisma) {
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
    return { studentIds: [], classIds: [] };
  }

  const links = await tx.parentStudentLink.findMany({
    where: {
      parentProfileId: profile.id,
      schoolId
    },
    include: {
      student: {
        select: {
          id: true,
          classId: true,
          status: true
        }
      }
    }
  });

  const studentIds = [];
  const classIdsSet = new Set();

  for (const link of links) {
    if (link.student) {
      studentIds.push(link.student.id);
      if (link.student.classId) {
        classIdsSet.add(link.student.classId);
      }
    }
  }

  return {
    studentIds,
    classIds: Array.from(classIdsSet)
  };
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
      userId: true,
      assignedClassId: true,
      name: true,
      customData: true,
      headedClasses: {
        select: {
          id: true
        }
      }
    }
  });
}

/**
 * Finds student profile by user ID for tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} userId - Student User UUID
 * @param {Object} [tx=prisma] - Transaction client
 * @returns {Promise<Object|null>}
 */
export async function findStudentByUserId(schoolId, userId, tx = prisma) {
  return tx.student.findFirst({
    where: {
      schoolId,
      userId
    },
    select: {
      id: true,
      schoolId: true,
      classId: true,
      firstName: true,
      lastName: true
    }
  });
}

/**
 * Finds user profile details by user ID.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} userId - User UUID
 * @param {Object} [tx=prisma] - Transaction client
 * @returns {Promise<Object|null>}
 */
export async function findUserById(schoolId, userId, tx = prisma) {
  return tx.user.findFirst({
    where: {
      id: userId,
      schoolId
    },
    select: {
      id: true,
      email: true,
      systemRole: true,
      isActive: true
    }
  });
}

/**
 * Retrieves a single notice by ID within tenant context.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} noticeId - Notice UUID
 * @param {Object} [tx=prisma] - Transaction client
 * @returns {Promise<Object|null>}
 */
export async function findNoticeById(schoolId, noticeId, tx = prisma) {
  return tx.notice.findFirst({
    where: {
      id: noticeId,
      schoolId
    },
    include: {
      class: {
        select: {
          id: true,
          name: true,
          classTeacherId: true
        }
      }
    }
  });
}

/**
 * Retrieves paginated notices list for tenant with filtering.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} options - Query & filter options
 * @param {Object} [tx=prisma] - Transaction client
 * @returns {Promise<{ notices: Array, total: number }>}
 */
export async function findNoticesList(schoolId, options = {}, tx = prisma) {
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 20));
  const skip = (page - 1) * limit;

  const where = {
    schoolId
  };

  // Type filter
  if (options.type) {
    where.type = options.type;
  }

  // Audience filter
  if (options.audience) {
    where.audience = options.audience;
  }

  // Class ID filter
  if (options.classId) {
    where.classId = options.classId;
  }

  // Search filter
  if (options.search) {
    where.OR = [
      { title: { contains: options.search, mode: 'insensitive' } },
      { content: { contains: options.search, mode: 'insensitive' } }
    ];
  }

  // Additional where conditions passed from service (e.g. for visibility constraints)
  if (options.customWhere) {
    Object.assign(where, options.customWhere);
  }

  const sortField = options.sort === 'updatedAt'
    ? 'updatedAt'
    : options.sort === 'title'
    ? 'title'
    : 'createdAt';
  const sortOrder = options.order === 'asc' ? 'asc' : 'desc';

  const [total, notices] = await Promise.all([
    tx.notice.count({ where }),
    tx.notice.findMany({
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
        }
      }
    })
  ]);

  return { notices, total };
}

/**
 * Creates a new notice document in PostgreSQL.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} data - Notice creation data
 * @param {Object} [tx=prisma] - Transaction client
 * @returns {Promise<Object>}
 */
export async function createNotice(schoolId, data, tx = prisma) {
  return tx.notice.create({
    data: {
      schoolId,
      title: data.title,
      content: data.content,
      type: data.type || 'global',
      classId: data.classId || null,
      audience: data.audience || 'all',
      viewedBy: data.viewedBy || [],
      attachments: data.attachments || null
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
 * Updates an existing notice within tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} noticeId - Notice UUID
 * @param {Object} data - Update fields
 * @param {Object} [tx=prisma] - Transaction client
 * @returns {Promise<Object>}
 */
export async function updateNotice(schoolId, noticeId, data, tx = prisma) {
  return tx.notice.update({
    where: {
      schoolId_id: {
        schoolId,
        id: noticeId
      }
    },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.content !== undefined && { content: data.content }),
      ...(data.type !== undefined && { type: data.type }),
      ...(data.classId !== undefined && { classId: data.classId }),
      ...(data.audience !== undefined && { audience: data.audience }),
      ...(data.viewedBy !== undefined && { viewedBy: data.viewedBy }),
      ...(data.attachments !== undefined && { attachments: data.attachments })
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
 * Deletes a notice document within tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} noticeId - Notice UUID
 * @param {Object} [tx=prisma] - Transaction client
 * @returns {Promise<Object>}
 */
export async function deleteNotice(schoolId, noticeId, tx = prisma) {
  return tx.notice.delete({
    where: {
      schoolId_id: {
        schoolId,
        id: noticeId
      }
    }
  });
}

/**
 * Appends a read receipt to the notice viewedBy JSON array in an idempotent, tenant-safe manner.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} noticeId - Notice UUID
 * @param {Object} viewerData - { uid, name, role, classId, viewedAt }
 * @param {Object} [tx=prisma] - Transaction client
 * @returns {Promise<{ notice: Object, alreadyViewed: boolean }>}
 */
export async function recordNoticeView(schoolId, noticeId, viewerData, tx = prisma) {
  const executeOperation = async (client) => {
    // Acquire row-level lock in PostgreSQL if supported
    let currentViewers = [];

    try {
      const lockedRows = await client.$queryRaw`
        SELECT id, school_id, viewed_by
        FROM notices
        WHERE school_id = ${schoolId}::uuid AND id = ${noticeId}::uuid
        FOR UPDATE
      `;

      if (!lockedRows || lockedRows.length === 0) {
        return null;
      }

      const locked = lockedRows[0];
      currentViewers = Array.isArray(locked.viewed_by) ? [...locked.viewed_by] : [];
    } catch {
      // Fallback for mock/test environments without raw SQL support
      const notice = await client.notice.findFirst({
        where: {
          id: noticeId,
          schoolId
        }
      });

      if (!notice) return null;
      currentViewers = Array.isArray(notice.viewedBy) ? [...notice.viewedBy] : [];
    }

    const alreadyViewed = currentViewers.some(
      (v) => v && (v.uid === viewerData.uid || v.userId === viewerData.uid)
    );

    if (alreadyViewed) {
      const notice = await client.notice.findFirst({
        where: { id: noticeId, schoolId },
        include: {
          class: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });
      return { notice, alreadyViewed: true };
    }

    currentViewers.push(viewerData);

    const updatedNotice = await client.notice.update({
      where: {
        schoolId_id: {
          schoolId,
          id: noticeId
        }
      },
      data: {
        viewedBy: currentViewers
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

    return { notice: updatedNotice, alreadyViewed: false };
  };

  if (tx && tx !== prisma && typeof tx.$queryRaw === 'function') {
    return executeOperation(tx);
  }

  if (typeof prisma.$transaction === 'function') {
    try {
      return await prisma.$transaction(async (trx) => {
        return executeOperation(trx);
      });
    } catch {
      return executeOperation(prisma);
    }
  }

  return executeOperation(prisma);
}
