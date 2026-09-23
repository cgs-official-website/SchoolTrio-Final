import { prisma } from '../../database/prisma.client.js';

/**
 * Leave Application Repository Layer
 *
 * Strict Tenant Safety Rules:
 * 1. Every query explicitly filters by schoolId.
 * 2. Cross-tenant reads and mutations are strictly prevented.
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

  return links.map(l => l.studentId);
}

/**
 * Retrieves paginated leave applications for a specific student in a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} studentId - Student UUID
 * @param {Object} [options={}] - Query options
 * @param {number} [options.page=1]
 * @param {number} [options.limit=50]
 * @param {string} [options.status]
 * @param {string} [options.order='desc']
 * @param {Object} [tx=prisma]
 * @returns {Promise<{ leaves: Array, total: number }>}
 */
export async function findStudentLeaves(schoolId, studentId, options = {}, tx = prisma) {
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(500, Math.max(1, Number(options.limit) || 50));
  const skip = (page - 1) * limit;

  const where = {
    schoolId,
    applicantId: studentId
  };

  if (options.status) {
    where.status = options.status;
  }

  const orderBy = {
    createdAt: options.order === 'asc' ? 'asc' : 'desc'
  };

  const [total, leaves] = await Promise.all([
    tx.leaveApplication.count({ where }),
    tx.leaveApplication.findMany({
      where,
      skip,
      take: limit,
      orderBy
    })
  ]);

  return { leaves, total };
}

/**
 * Creates a new student leave application.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} studentId - Student UUID
 * @param {Object} data - Leave details
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object>}
 */
export async function createLeave(schoolId, studentId, data, tx = prisma) {
  const customData = {
    applicantRole: 'student',
    ...(data.supportingDoc ? { supportingDoc: data.supportingDoc } : {})
  };

  return tx.leaveApplication.create({
    data: {
      schoolId,
      applicantId: studentId,
      leaveType: data.leaveType,
      startDate: data.startDate,
      endDate: data.endDate,
      reason: data.reason,
      status: 'Pending',
      customData
    }
  });
}

/**
 * Retrieves a single leave application by tenant and ID.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - LeaveApplication UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object|null>}
 */
export async function findLeaveById(schoolId, id, tx = prisma) {
  return tx.leaveApplication.findFirst({
    where: {
      id,
      schoolId
    }
  });
}

/**
 * Counts pending leave applications within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} [tx=prisma] - Transaction client
 * @returns {Promise<number>} Count of pending leave applications
 */
export async function countPendingLeaves(schoolId, tx = prisma) {
  return tx.leaveApplication.count({
    where: {
      schoolId,
      status: 'Pending'
    }
  });
}

/**
 * Retrieves paginated leave applications across a tenant with optional filtering.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} [options={}] - Query options (page, limit, status, applicantRole, search, order)
 * @param {Object} [tx=prisma]
 * @returns {Promise<{ leaves: Array, total: number }>}
 */
export async function findTenantLeaves(schoolId, options = {}, tx = prisma) {
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(500, Math.max(1, Number(options.limit) || 50));
  const skip = (page - 1) * limit;

  const where = { schoolId };

  if (options.status && options.status !== 'all') {
    where.status = options.status;
  }

  if (options.search && typeof options.search === 'string' && options.search.trim()) {
    where.OR = [
      { leaveType: { contains: options.search.trim(), mode: 'insensitive' } },
      { reason: { contains: options.search.trim(), mode: 'insensitive' } }
    ];
  }

  const orderBy = {
    createdAt: options.order === 'asc' ? 'asc' : 'desc'
  };

  const [total, leaves] = await Promise.all([
    tx.leaveApplication.count({ where }),
    tx.leaveApplication.findMany({
      where,
      skip,
      take: limit,
      orderBy
    })
  ]);

  return { leaves, total };
}

/**
 * Batch resolves applicant profiles (students and staff) for a list of leave applications.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Array<Object>} leaves - Array of raw LeaveApplication records
 * @param {Object} [tx=prisma]
 * @returns {Promise<Map<string, { applicantName: string, applicantRole: string }>>}
 */
export async function resolveApplicantMap(schoolId, leaves, tx = prisma) {
  const applicantMap = new Map();
  if (!Array.isArray(leaves) || leaves.length === 0) return applicantMap;

  const applicantIds = [...new Set(leaves.map(l => l.applicantId).filter(Boolean))];
  if (applicantIds.length === 0) return applicantMap;

  const [students, staffProfiles] = await Promise.all([
    tx.student.findMany({
      where: {
        schoolId,
        id: { in: applicantIds }
      },
      select: {
        id: true,
        firstName: true,
        lastName: true
      }
    }),
    tx.staffProfile.findMany({
      where: {
        schoolId,
        id: { in: applicantIds }
      },
      select: {
        id: true,
        name: true,
        staffType: true
      }
    })
  ]);

  students.forEach(s => {
    const fullName = [s.firstName, s.lastName].filter(Boolean).join(' ') || 'Student';
    applicantMap.set(s.id, {
      applicantName: fullName,
      applicantRole: 'student'
    });
  });

  staffProfiles.forEach(sp => {
    applicantMap.set(sp.id, {
      applicantName: sp.name || 'Staff Member',
      applicantRole: sp.staffType === 'teaching' ? 'teacher' : 'staff'
    });
  });

  return applicantMap;
}

/**
 * Performs an atomic conditional status update on a pending leave request.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} leaveId - LeaveApplication UUID
 * @param {string} newStatus - 'Approved' | 'Rejected'
 * @param {string} reviewerId - User UUID of the reviewer
 * @param {Object} [tx=prisma]
 * @returns {Promise<number>} Count of updated rows (1 if successful, 0 if conflict or not found)
 */
export async function updateLeaveStatus(schoolId, leaveId, newStatus, reviewerId, tx = prisma) {
  const result = await tx.leaveApplication.updateMany({
    where: {
      id: leaveId,
      schoolId,
      status: 'Pending'
    },
    data: {
      status: newStatus,
      reviewedBy: reviewerId
    }
  });

  return result.count;
}

/**
 * Deletes a leave application within tenant context.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} leaveId - LeaveApplication UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<number>} Count of deleted records
 */
export async function deleteLeave(schoolId, leaveId, tx = prisma) {
  const result = await tx.leaveApplication.deleteMany({
    where: {
      id: leaveId,
      schoolId
    }
  });

  return result.count;
}

/**
 * Resolves a StaffProfile for an authenticated user within tenant context.
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
    }
  });
}

/**
 * Retrieves paginated leave applications for a specific staff profile.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} staffProfileId - StaffProfile UUID
 * @param {Object} [options={}]
 * @param {Object} [tx=prisma]
 * @returns {Promise<{ leaves: Array, total: number }>}
 */
export async function findStaffLeaves(schoolId, staffProfileId, options = {}, tx = prisma) {
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(500, Math.max(1, Number(options.limit) || 50));
  const skip = (page - 1) * limit;

  const where = {
    schoolId,
    applicantId: staffProfileId
  };

  if (options.status && options.status !== 'all') {
    where.status = options.status;
  }

  const orderBy = {
    createdAt: options.order === 'asc' ? 'asc' : 'desc'
  };

  const [total, leaves] = await Promise.all([
    tx.leaveApplication.count({ where }),
    tx.leaveApplication.findMany({
      where,
      skip,
      take: limit,
      orderBy
    })
  ]);

  return { leaves, total };
}

/**
 * Creates a staff leave application.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} staffProfileId - StaffProfile UUID
 * @param {Object} data - Validated staff leave details
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object>}
 */
export async function createStaffLeave(schoolId, staffProfileId, data, tx = prisma) {
  const customData = {
    applicantRole: data.applicantRole || 'teacher',
    applicantName: data.applicantName || 'Staff Member',
    ...(data.supportingDoc ? { supportingDoc: data.supportingDoc } : {})
  };

  return tx.leaveApplication.create({
    data: {
      schoolId,
      applicantId: staffProfileId,
      leaveType: data.leaveType,
      startDate: data.startDate,
      endDate: data.endDate,
      reason: data.reason,
      status: 'Pending',
      customData
    }
  });
}

// ============================================================
// LEAVE APPROVAL RULES REPOSITORY METHODS
// ============================================================

/**
 * Retrieves all leave approval rules for a tenant, ordered by order ASC, minDays ASC.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} [tx=prisma] - Transaction client
 * @returns {Promise<Array>}
 */
export async function findLeaveApprovalRules(schoolId, tx = prisma) {
  return tx.leaveApprovalRule.findMany({
    where: { schoolId },
    include: {
      role: {
        select: {
          id: true,
          name: true,
          slug: true
        }
      }
    },
    orderBy: [
      { order: 'asc' },
      { minDays: 'asc' }
    ]
  });
}

/**
 * Retrieves a single leave approval rule by ID within tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} ruleId - Rule UUID
 * @param {Object} [tx=prisma] - Transaction client
 * @returns {Promise<Object|null>}
 */
export async function findLeaveApprovalRuleById(schoolId, ruleId, tx = prisma) {
  return tx.leaveApprovalRule.findFirst({
    where: {
      id: ruleId,
      schoolId
    },
    include: {
      role: {
        select: {
          id: true,
          name: true,
          slug: true
        }
      }
    }
  });
}

/**
 * Verifies that a SchoolRole exists within the specified tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} roleId - Role UUID
 * @param {Object} [tx=prisma] - Transaction client
 * @returns {Promise<Object|null>}
 */
export async function findSchoolRoleInTenant(schoolId, roleId, tx = prisma) {
  return tx.schoolRole.findFirst({
    where: {
      id: roleId,
      schoolId
    },
    select: {
      id: true,
      name: true,
      slug: true
    }
  });
}

/**
 * Creates a new leave approval rule.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} data - Rule attributes
 * @param {Object} [tx=prisma] - Transaction client
 * @returns {Promise<Object>}
 */
export async function createLeaveApprovalRule(schoolId, data, tx = prisma) {
  return tx.leaveApprovalRule.create({
    data: {
      schoolId,
      roleId: data.roleId,
      minDays: data.minDays,
      maxDays: data.maxDays !== undefined ? data.maxDays : null,
      order: data.order !== undefined ? data.order : 1
    },
    include: {
      role: {
        select: {
          id: true,
          name: true,
          slug: true
        }
      }
    }
  });
}

/**
 * Updates an existing leave approval rule.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} ruleId - Rule UUID
 * @param {Object} data - Updated rule attributes
 * @param {Object} [tx=prisma] - Transaction client
 * @returns {Promise<Object>}
 */
export async function updateLeaveApprovalRule(schoolId, ruleId, data, tx = prisma) {
  const updateData = {};
  if (data.roleId !== undefined) updateData.roleId = data.roleId;
  if (data.minDays !== undefined) updateData.minDays = data.minDays;
  if (data.maxDays !== undefined) updateData.maxDays = data.maxDays;
  if (data.order !== undefined) updateData.order = data.order;

  return tx.leaveApprovalRule.update({
    where: {
      schoolId_id: {
        schoolId,
        id: ruleId
      }
    },
    data: updateData,
    include: {
      role: {
        select: {
          id: true,
          name: true,
          slug: true
        }
      }
    }
  });
}

/**
 * Deletes a leave approval rule by ID within tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} ruleId - Rule UUID
 * @param {Object} [tx=prisma] - Transaction client
 * @returns {Promise<Object>}
 */
export async function deleteLeaveApprovalRule(schoolId, ruleId, tx = prisma) {
  return tx.leaveApprovalRule.delete({
    where: {
      schoolId_id: {
        schoolId,
        id: ruleId
      }
    }
  });
}

