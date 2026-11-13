import { prisma } from '../../database/prisma.client.js';

/**
 * Academic Resource Repository Layer
 *
 * Strict Multi-Tenant Rules:
 * 1. Every query strictly filters by schoolId.
 * 2. Cross-tenant reads and mutations are rejected.
 * 3. Supports transaction propagation via optional `tx` parameter.
 */

const RESOURCE_INCLUDE = {
  class: { select: { id: true, name: true } },
  section: { select: { id: true, name: true } },
  subject: { select: { id: true, name: true, code: true } }
};

/**
 * Student ids a parent user is linked to (tenant scoped).
 */
export async function findAuthorizedStudentIdsForParent(schoolId, userId, tx = prisma) {
  const profile = await tx.parentProfile.findFirst({
    where: { userId, schoolId },
    select: { id: true, user: { select: { isActive: true } } }
  });
  if (!profile || profile.user?.isActive === false) return [];
  const links = await tx.parentStudentLink.findMany({
    where: { parentProfileId: profile.id, schoolId },
    select: { studentId: true }
  });
  return links.map(l => l.studentId);
}

/**
 * Class + section of a student (tenant scoped).
 */
export async function findStudentPlacement(schoolId, studentId, tx = prisma) {
  return tx.student.findFirst({
    where: { id: studentId, schoolId },
    select: { id: true, classId: true, sectionId: true }
  });
}

/**
 * Verifies that a Section exists within the tenant and belongs to the given class.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} sectionId - Section UUID
 * @param {Object} [tx=prisma] - Transaction client
 * @returns {Promise<Object|null>}
 */
export async function findSectionInTenant(schoolId, sectionId, tx = prisma) {
  if (!sectionId) return null;
  return tx.section.findFirst({
    where: { id: sectionId, schoolId },
    select: { id: true, name: true, classId: true }
  });
}

/**
 * Counts sections of a class.
 */
export async function countSectionsOfClass(schoolId, classId, tx = prisma) {
  return tx.section.count({ where: { schoolId, classId } });
}

/**
 * Verifies that a Class exists within the tenant.
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
      schoolId: true
    }
  });
}

/**
 * Verifies that a Subject exists within the tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} subjectId - Subject UUID
 * @param {Object} [tx=prisma] - Transaction client
 * @returns {Promise<Object|null>}
 */
export async function findSubjectInTenant(schoolId, subjectId, tx = prisma) {
  if (!subjectId) return null;
  return tx.subject.findFirst({
    where: {
      id: subjectId,
      schoolId
    },
    select: {
      id: true,
      name: true,
      code: true,
      schoolId: true
    }
  });
}

/**
 * Retrieves a single academic resource by ID within tenant context.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - AcademicResource UUID
 * @param {Object} [tx=prisma] - Transaction client
 * @returns {Promise<Object|null>}
 */
export async function findAcademicResourceById(schoolId, id, tx = prisma) {
  return tx.academicResource.findFirst({
    where: {
      id,
      schoolId
    },
    include: RESOURCE_INCLUDE
  });
}

/**
 * Acquires a row-level lock (FOR UPDATE) on an academic resource for concurrency safety.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - AcademicResource UUID
 * @param {Object} tx - Active interactive transaction client
 * @returns {Promise<Object|null>}
 */
export async function findAcademicResourceWithLock(schoolId, id, tx) {
  const rows = await tx.$queryRaw`
    SELECT id, school_id AS "schoolId", uploader_id AS "uploaderId", class_id AS "classId", section_id AS "sectionId", subject_id AS "subjectId", title, file_url AS "fileUrl", file_type AS "fileType", description, created_at AS "createdAt", updated_at AS "updatedAt"
    FROM academic_resources
    WHERE id = ${id}::uuid AND school_id = ${schoolId}::uuid
    FOR UPDATE
  `;
  return rows[0] || null;
}

/**
 * Builds where condition for academic resources list query.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} [filters={}] - Filter criteria
 * @returns {Object} Prisma where input
 */
function buildWhereClause(schoolId, filters = {}) {
  const where = {
    schoolId
  };

  if (filters.classId) {
    where.classId = filters.classId;
  }

  if (filters.sectionId) {
    where.sectionId = filters.sectionId;
  }

  if (filters.subjectId) {
    where.subjectId = filters.subjectId;
  }

  if (filters.type) {
    where.fileType = filters.type.toLowerCase();
  }

  if (filters.uploaderId) {
    where.uploaderId = filters.uploaderId;
  }

  // Teacher visibility: list of OR clauses built by the service (class teacher / subject teacher / own uploads)
  if (Array.isArray(filters.visibilityOr)) {
    where.AND = [...(where.AND || []), { OR: filters.visibilityOr }];
  }

  // Student / parent view: only resources shared with students, for the student's class + section
  if (filters.studentTarget) {
    const { classId, sectionId } = filters.studentTarget;
    where.audience = 'teachers_students';
    where.classId = classId;
    where.AND = [
      ...(where.AND || []),
      { OR: sectionId ? [{ sectionId }, { sectionId: null }] : [{ sectionId: null }] }
    ];
  }

  if (filters.search && filters.search.trim()) {
    const term = filters.search.trim();
    where.OR = [
      { title: { contains: term, mode: 'insensitive' } },
      { description: { contains: term, mode: 'insensitive' } },
      { subject: { name: { contains: term, mode: 'insensitive' } } },
      { class: { name: { contains: term, mode: 'insensitive' } } },
      { section: { name: { contains: term, mode: 'insensitive' } } }
    ];
  }

  return where;
}

/**
 * Lists academic resources within tenant matching filter and pagination criteria.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} [filters={}] - Filter options
 * @param {Object} [pagination={}] - { page, limit }
 * @param {Object} [tx=prisma] - Transaction client
 * @returns {Promise<Array<Object>>}
 */
export async function listAcademicResources(schoolId, filters = {}, pagination = {}, tx = prisma) {
  const where = buildWhereClause(schoolId, filters);
  const page = Math.max(1, Number(pagination.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(pagination.limit) || 20));
  const skip = (page - 1) * limit;

  return tx.academicResource.findMany({
    where,
    include: RESOURCE_INCLUDE,
    orderBy: {
      createdAt: 'desc'
    },
    skip,
    take: limit
  });
}

/**
 * Counts total academic resources matching filter criteria within tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} [filters={}] - Filter options
 * @param {Object} [tx=prisma] - Transaction client
 * @returns {Promise<number>}
 */
export async function countAcademicResources(schoolId, filters = {}, tx = prisma) {
  const where = buildWhereClause(schoolId, filters);
  return tx.academicResource.count({ where });
}

/**
 * Creates a new academic resource within tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} data - Academic resource data
 * @param {Object} [tx=prisma] - Transaction client
 * @returns {Promise<Object>}
 */
export async function createAcademicResource(schoolId, data, tx = prisma) {
  return tx.academicResource.create({
    data: {
      schoolId,
      title: data.title,
      classId: data.classId,
      sectionId: data.sectionId || null,
      subjectId: data.subjectId || null,
      uploaderId: data.uploaderId,
      fileUrl: data.fileUrl || null,
      fileType: data.type ? data.type.toLowerCase() : 'document',
      audience: data.audience || 'teachers',
      description: data.description || null
    },
    include: RESOURCE_INCLUDE
  });
}

/**
 * Updates an existing academic resource within tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - AcademicResource UUID
 * @param {Object} data - Partial update payload
 * @param {Object} [tx=prisma] - Transaction client
 * @returns {Promise<Object>}
 */
export async function updateAcademicResource(schoolId, id, data, tx = prisma) {
  const updateData = {};

  if (data.title !== undefined) updateData.title = data.title;
  if (data.classId !== undefined) updateData.classId = data.classId;
  if (data.sectionId !== undefined) updateData.sectionId = data.sectionId;
  if (data.subjectId !== undefined) updateData.subjectId = data.subjectId;
  if (data.fileUrl !== undefined) updateData.fileUrl = data.fileUrl;
  if (data.type !== undefined) updateData.fileType = data.type ? data.type.toLowerCase() : null;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.audience !== undefined) updateData.audience = data.audience;

  return tx.academicResource.update({
    where: {
      id,
      schoolId
    },
    data: updateData,
    include: RESOURCE_INCLUDE
  });
}

/**
 * Deletes an academic resource within tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - AcademicResource UUID
 * @param {Object} [tx=prisma] - Transaction client
 * @returns {Promise<Object>}
 */
export async function deleteAcademicResource(schoolId, id, tx = prisma) {
  return tx.academicResource.delete({
    where: {
      id,
      schoolId
    }
  });
}

/**
 * Finds user and staff profile information for a list of user IDs within tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Array<string>} userIds - Array of User UUIDs
 * @param {Object} [tx=prisma] - Transaction client
 * @returns {Promise<Array<Object>>}
 */
export async function findStaffProfilesByUserIds(schoolId, userIds, tx = prisma) {
  if (!userIds || userIds.length === 0) return [];
  const uniqueIds = [...new Set(userIds.filter(Boolean))];

  return tx.staffProfile.findMany({
    where: {
      schoolId,
      userId: { in: uniqueIds }
    },
    select: {
      id: true,
      userId: true,
      name: true,
      user: {
        select: {
          id: true,
          email: true
        }
      }
    }
  });
}

/**
 * Finds users by IDs directly within tenant context.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Array<string>} userIds - Array of User UUIDs
 * @param {Object} [tx=prisma] - Transaction client
 * @returns {Promise<Array<Object>>}
 */
export async function findUsersByIds(schoolId, userIds, tx = prisma) {
  if (!userIds || userIds.length === 0) return [];
  const uniqueIds = [...new Set(userIds.filter(Boolean))];

  return tx.user.findMany({
    where: {
      schoolId,
      id: { in: uniqueIds }
    },
    select: {
      id: true,
      email: true
    }
  });
}
