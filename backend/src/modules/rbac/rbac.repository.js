import { prisma, basePrisma } from '../../database/prisma.client.js';

/**
 * RBAC Data Access Repository Layer
 * 
 * Strict Tenant Safety Rules:
 * 1. Every tenant-scoped query MUST explicitly filter by schoolId.
 * 2. Cross-tenant reads and mutations are strictly prevented.
 * 3. Supports transaction propagation via optional `tx` parameter.
 */

/**
 * Finds all school roles for a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Array>}
 */
export async function findRolesBySchoolId(schoolId, tx = prisma) {
  return tx.schoolRole.findMany({
    where: { schoolId },
    include: {
      permissions: {
        orderBy: { moduleKey: 'asc' }
      },
      _count: {
        select: { userAssignments: true }
      }
    },
    orderBy: { name: 'asc' }
  });
}

/**
 * Finds a specific school role by ID within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} roleId - Role UUID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object|null>}
 */
export async function findRoleById(schoolId, roleId, tx = prisma) {
  return tx.schoolRole.findFirst({
    where: {
      id: roleId,
      schoolId
    },
    include: {
      permissions: {
        orderBy: { moduleKey: 'asc' }
      },
      _count: {
        select: { userAssignments: true }
      }
    }
  });
}

/**
 * Finds a school role by deterministic slug within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} slug - Role slug
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object|null>}
 */
export async function findRoleBySlug(schoolId, slug, tx = prisma) {
  return tx.schoolRole.findFirst({
    where: {
      schoolId,
      slug
    },
    include: {
      permissions: {
        orderBy: { moduleKey: 'asc' }
      }
    }
  });
}

/**
 * Finds a school role by exact display name (case-insensitive) within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} name - Role display name
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object|null>}
 */
export async function findRoleByName(schoolId, name, tx = prisma) {
  return tx.schoolRole.findFirst({
    where: {
      schoolId,
      name: { equals: name, mode: 'insensitive' }
    },
    include: {
      permissions: {
        orderBy: { moduleKey: 'asc' }
      }
    }
  });
}

/**
 * Creates a new school role and optionally its associated permissions within a transaction.
 *
 * @param {Object} data
 * @param {string} data.schoolId - Tenant UUID
 * @param {string} data.name - Role display name
 * @param {string} data.slug - Role slug
 * @param {string} [data.loginPanel='admin'] - Target login panel
 * @param {boolean} [data.isSystemDefault=false] - Whether this is a system default role
 * @param {Array<{ moduleKey: string, canRead: boolean, canCreate: boolean, canEdit: boolean, canDelete: boolean }>} [data.permissions=[]]
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object>}
 */
export async function createRoleWithPermissions(data, tx = prisma) {
  const { schoolId, name, slug, loginPanel = 'admin', isSystemDefault = false, permissions = [] } = data;

  const execute = async (client) => {
    const createdRole = await client.schoolRole.create({
      data: {
        schoolId,
        name,
        slug,
        loginPanel,
        isSystemDefault
      }
    });

    if (Array.isArray(permissions) && permissions.length > 0) {
      await client.rolePermission.createMany({
        data: permissions.map(p => ({
          schoolRoleId: createdRole.id,
          moduleKey: p.moduleKey,
          canRead: Boolean(p.canRead),
          canCreate: Boolean(p.canCreate),
          canEdit: Boolean(p.canEdit),
          canDelete: Boolean(p.canDelete)
        }))
      });
    }

    return client.schoolRole.findFirst({
      where: {
        id: createdRole.id,
        schoolId
      },
      include: {
        permissions: {
          orderBy: { moduleKey: 'asc' }
        }
      }
    });
  };

  // If already in a transaction context, execute directly; otherwise use $transaction on basePrisma
  if (tx !== prisma) {
    return execute(tx);
  }

  return basePrisma.$transaction(async (trx) => {
    return execute(trx);
  });
}

/**
 * Updates a school role's details within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} roleId - Role UUID
 * @param {Object} data - Update payload
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object>}
 */
export async function updateRole(schoolId, roleId, data, tx = prisma) {
  return tx.schoolRole.update({
    where: {
      schoolId_id: {
        schoolId,
        id: roleId
      }
    },
    data: {
      ...(data.name && { name: data.name }),
      ...(data.slug && { slug: data.slug }),
      ...(data.loginPanel && { loginPanel: data.loginPanel })
    },
    include: {
      permissions: {
        orderBy: { moduleKey: 'asc' }
      }
    }
  });
}

/**
 * Deletes a school role within a tenant.
 * Cascades to RolePermission and UserRoleAssignment via PostgreSQL foreign keys.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} roleId - Role UUID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object>}
 */
export async function deleteRole(schoolId, roleId, tx = prisma) {
  return tx.schoolRole.delete({
    where: {
      schoolId_id: {
        schoolId,
        id: roleId
      }
    }
  });
}

/**
 * Finds all permission records for a specific role within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} roleId - SchoolRole UUID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Array>}
 */
export async function findRolePermissions(schoolId, roleId, tx = prisma) {
  const role = await tx.schoolRole.findFirst({
    where: { id: roleId, schoolId }
  });
  if (!role) return [];

  return tx.rolePermission.findMany({
    where: { schoolRoleId: roleId },
    orderBy: { moduleKey: 'asc' }
  });
}

/**
 * Transactionally replaces/upserts permissions for a role within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} roleId - SchoolRole UUID
 * @param {Array<{ moduleKey: string, canRead: boolean, canCreate: boolean, canEdit: boolean, canDelete: boolean }>} normalizedPermissions
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Array>}
 */
export async function upsertRolePermissions(schoolId, roleId, normalizedPermissions, tx = prisma) {
  const role = await tx.schoolRole.findFirst({
    where: { id: roleId, schoolId }
  });
  if (!role) {
    throw new Error(`Role ${roleId} not found for school ${schoolId}`);
  }

  const execute = async (client) => {
    for (const perm of normalizedPermissions) {
      await client.rolePermission.upsert({
        where: {
          schoolRoleId_moduleKey: {
            schoolRoleId: roleId,
            moduleKey: perm.moduleKey
          }
        },
        update: {
          canRead: perm.canRead,
          canCreate: perm.canCreate,
          canEdit: perm.canEdit,
          canDelete: perm.canDelete
        },
        create: {
          schoolRoleId: roleId,
          moduleKey: perm.moduleKey,
          canRead: perm.canRead,
          canCreate: perm.canCreate,
          canEdit: perm.canEdit,
          canDelete: perm.canDelete
        }
      });
    }

    return client.rolePermission.findMany({
      where: { schoolRoleId: roleId },
      orderBy: { moduleKey: 'asc' }
    });
  };

  if (tx !== prisma) {
    return execute(tx);
  }

  return basePrisma.$transaction(async (trx) => {
    return execute(trx);
  });
}

/**
 * Finds all user role assignments for a user within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} userId - User UUID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Array>}
 */
export async function findUserRoleAssignments(schoolId, userId, tx = prisma) {
  return tx.userRoleAssignment.findMany({
    where: {
      schoolId,
      userId
    },
    include: {
      schoolRole: {
        include: {
          permissions: {
            orderBy: { moduleKey: 'asc' }
          }
        }
      }
    },
    orderBy: { assignedAt: 'asc' }
  });
}

/**
 * Finds a specific user role assignment by schoolId, userId, and schoolRoleId.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} userId - User UUID
 * @param {string} schoolRoleId - SchoolRole UUID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object|null>}
 */
export async function findUserRoleAssignment(schoolId, userId, schoolRoleId, tx = prisma) {
  return tx.userRoleAssignment.findFirst({
    where: {
      schoolId,
      userId,
      schoolRoleId
    },
    include: {
      schoolRole: {
        include: {
          permissions: {
            orderBy: { moduleKey: 'asc' }
          }
        }
      }
    }
  });
}

/**
 * Assigns a role to a user within a tenant idempotently.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} userId - User UUID
 * @param {string} schoolRoleId - SchoolRole UUID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object>}
 */
export async function assignRoleToUser(schoolId, userId, schoolRoleId, tx = prisma) {
  return tx.userRoleAssignment.upsert({
    where: {
      userId_schoolRoleId: {
        userId,
        schoolRoleId
      }
    },
    update: {},
    create: {
      schoolId,
      userId,
      schoolRoleId
    },
    include: {
      schoolRole: {
        include: {
          permissions: {
            orderBy: { moduleKey: 'asc' }
          }
        }
      }
    }
  });
}

/**
 * Removes a role from a user within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} userId - User UUID
 * @param {string} schoolRoleId - SchoolRole UUID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<{ count: number }>}
 */
export async function removeRoleFromUser(schoolId, userId, schoolRoleId, tx = prisma) {
  return tx.userRoleAssignment.deleteMany({
    where: {
      schoolId,
      userId,
      schoolRoleId
    }
  });
}

/**
 * Finds a user by ID within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} userId - User UUID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object|null>}
 */
export async function findUserById(schoolId, userId, tx = prisma) {
  return tx.user.findFirst({
    where: {
      id: userId,
      schoolId
    }
  });
}

/**
 * Finds a user by legacy Firebase UID within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} legacyFirestoreId - Firebase UID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object|null>}
 */
export async function findUserByLegacyFirestoreId(schoolId, legacyFirestoreId, tx = prisma) {
  return tx.user.findFirst({
    where: {
      schoolId,
      legacyFirestoreId
    }
  });
}

export { createAuditLog } from '../audit/audit.repository.js';
