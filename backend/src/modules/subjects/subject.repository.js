import { prisma } from '../../database/prisma.client.js';

/**
 * Subject Data Access Repository Layer
 *
 * Strict Tenant Safety Rules:
 * 1. Every query must explicitly filter by schoolId.
 * 2. Cross-tenant reads and mutations are strictly prevented.
 * 3. Supports transaction propagation via optional `tx` parameter.
 */

const SUBJECT_SELECT_CONFIG = {
  id: true,
  schoolId: true,
  name: true,
  code: true,
  credits: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      timetablePeriods: true,
      lessonPlans: true,
      academicResources: true,
      assessments: true,
      homeworkAssignments: true
    }
  }
};

/**
 * Finds paginated subjects for a tenant with optional search and filtering.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} options
 * @param {string} [options.search]
 * @param {string} [options.code]
 * @param {number} [options.skip=0]
 * @param {number} [options.take=20]
 * @param {string} [options.sort='name']
 * @param {string} [options.order='asc']
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Array>}
 */
export async function findSubjects(schoolId, options = {}, tx = prisma) {
  const where = { schoolId };

  if (options.search) {
    where.OR = [
      { name: { contains: options.search, mode: 'insensitive' } },
      { code: { contains: options.search, mode: 'insensitive' } }
    ];
  }

  if (options.code) {
    where.code = { equals: options.code, mode: 'insensitive' };
  }

  const orderBy = [];
  if (options.sort === 'code') {
    orderBy.push({ code: options.order || 'asc' });
    orderBy.push({ name: 'asc' });
  } else if (options.sort === 'credits') {
    orderBy.push({ credits: options.order || 'asc' });
    orderBy.push({ name: 'asc' });
  } else if (options.sort === 'createdAt') {
    orderBy.push({ createdAt: options.order || 'desc' });
  } else {
    orderBy.push({ name: options.order || 'asc' });
  }

  return tx.subject.findMany({
    where,
    select: SUBJECT_SELECT_CONFIG,
    skip: options.skip,
    take: options.take,
    orderBy
  });
}

/**
 * Counts total subjects matching filters for a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} options
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<number>}
 */
export async function countSubjects(schoolId, options = {}, tx = prisma) {
  const where = { schoolId };

  if (options.search) {
    where.OR = [
      { name: { contains: options.search, mode: 'insensitive' } },
      { code: { contains: options.search, mode: 'insensitive' } }
    ];
  }

  if (options.code) {
    where.code = { equals: options.code, mode: 'insensitive' };
  }

  return tx.subject.count({ where });
}

/**
 * Finds a single subject by ID within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} subjectId - Subject UUID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object|null>}
 */
export async function findSubjectById(schoolId, subjectId, tx = prisma) {
  return tx.subject.findFirst({
    where: {
      id: subjectId,
      schoolId
    },
    select: SUBJECT_SELECT_CONFIG
  });
}

/**
 * Locks a single subject by ID exclusively (FOR UPDATE) within tenant context.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} subjectId - Subject UUID
 * @param {Object} [tx] - Transaction client
 * @returns {Promise<Object|null>}
 */
export async function findSubjectByIdForUpdate(schoolId, subjectId, tx = prisma) {
  const rows = await tx.$queryRaw`
    SELECT id, school_id AS "schoolId", name, code, credits
    FROM "subjects"
    WHERE "school_id" = ${schoolId}::uuid
      AND "id" = ${subjectId}::uuid
    FOR UPDATE
  `;
  return rows[0] || null;
}

/**
 * Finds a subject by name (case-insensitive) within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} name - Subject name
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object|null>}
 */
export async function findSubjectByName(schoolId, name, tx = prisma) {
  return tx.subject.findFirst({
    where: {
      schoolId,
      name: { equals: name, mode: 'insensitive' }
    },
    select: SUBJECT_SELECT_CONFIG
  });
}

/**
 * Finds a subject by code (case-insensitive) within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} code - Subject code
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object|null>}
 */
export async function findSubjectByCode(schoolId, code, tx = prisma) {
  return tx.subject.findFirst({
    where: {
      schoolId,
      code: { equals: code, mode: 'insensitive' }
    },
    select: SUBJECT_SELECT_CONFIG
  });
}

/**
 * Creates a new subject for a tenant.
 *
 * @param {Object} data
 * @param {string} data.schoolId - Tenant UUID
 * @param {string} data.name - Subject name
 * @param {string|null} [data.code] - Subject code
 * @param {number|null} [data.credits] - Subject credits
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object>}
 */
export async function createSubject(data, tx = prisma) {
  return tx.subject.create({
    data: {
      schoolId: data.schoolId,
      name: data.name,
      code: data.code || null,
      credits: data.credits !== undefined ? data.credits : null
    },
    select: SUBJECT_SELECT_CONFIG
  });
}

/**
 * Updates a subject within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} subjectId - Subject UUID
 * @param {Object} data - Update data
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object>}
 */
export async function updateSubject(schoolId, subjectId, data, tx = prisma) {
  return tx.subject.update({
    where: {
      schoolId_id: {
        schoolId,
        id: subjectId
      }
    },
    data,
    select: SUBJECT_SELECT_CONFIG
  });
}

/**
 * Deletes a subject within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} subjectId - Subject UUID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object>}
 */
export async function deleteSubject(schoolId, subjectId, tx = prisma) {
  return tx.subject.delete({
    where: {
      schoolId_id: {
        schoolId,
        id: subjectId
      }
    }
  });
}

/**
 * Checks all blocking dependencies for a Subject within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} subjectId - Subject UUID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<{ assessments: number, homeworkAssignments: number, lessonPlans: number, timetablePeriods: number, academicResources: number }>}
 */
export async function countSubjectDependencies(schoolId, subjectId, tx = prisma) {
  const [
    assessments,
    homeworkAssignments,
    lessonPlans,
    timetablePeriods,
    academicResources
  ] = await Promise.all([
    tx.assessment.count({ where: { schoolId, subjectId } }),
    tx.homeworkAssignment.count({ where: { schoolId, subjectId } }),
    tx.lessonPlan.count({ where: { schoolId, subjectId } }),
    tx.timetablePeriod.count({ where: { schoolId, subjectId } }),
    tx.academicResource.count({ where: { schoolId, subjectId } })
  ]);

  return {
    assessments,
    homeworkAssignments,
    lessonPlans,
    timetablePeriods,
    academicResources
  };
}
