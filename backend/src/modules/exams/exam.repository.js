import { prisma } from '../../database/prisma.client.js';

/**
 * Examination Repository
 * Multi-tenant data access operations for formal examinations.
 */

/**
 * Retrieves a paginated list of examinations for a school tenant.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {Object} query - Filtering parameters (search, term, academicYear, startDate, endDate)
 * @param {Object} pagination - Pagination parameters (page, limit, skip, sort, order)
 * @returns {Promise<{ items: Array<Object>, total: number, page: number, limit: number, totalPages: number }>}
 */
export async function findExams(schoolId, query = {}, pagination = {}) {
  const where = {
    schoolId
  };

  if (query.search) {
    where.name = {
      contains: query.search,
      mode: 'insensitive'
    };
  }

  if (query.term) {
    where.term = {
      equals: query.term,
      mode: 'insensitive'
    };
  }

  if (query.academicYear) {
    where.academicYear = query.academicYear;
  }

  if (query.startDate) {
    where.startDate = {
      gte: query.startDate
    };
  }

  if (query.endDate) {
    where.endDate = {
      lte: query.endDate
    };
  }

  const page = Math.max(1, parseInt(pagination.page, 10) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(pagination.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const validSortFields = ['createdAt', 'startDate', 'endDate', 'name', 'term', 'academicYear'];
  const sortBy = validSortFields.includes(pagination.sort) ? pagination.sort : 'createdAt';
  const sortOrder = pagination.order === 'asc' ? 'asc' : 'desc';

  const [items, total] = await Promise.all([
    prisma.examination.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
      include: {
        _count: {
          select: { assessments: true }
        }
      }
    }),
    prisma.examination.count({ where })
  ]);

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  };
}

/**
 * Retrieves a single examination record by tenant and ID.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} id - Examination UUID
 * @param {Object} [tx] - Optional Prisma transaction client
 * @returns {Promise<Object|null>}
 */
export async function findExamById(schoolId, id, tx = prisma) {
  return tx.examination.findFirst({
    where: {
      id,
      schoolId
    },
    include: {
      _count: {
        select: { assessments: true }
      }
    }
  });
}

/**
 * Creates a new examination record for a school tenant.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {Object} data - Examination attributes (name, term, academicYear, startDate, endDate)
 * @param {Object} [tx] - Optional Prisma transaction client
 * @returns {Promise<Object>}
 */
export async function createExam(schoolId, data, tx = prisma) {
  return tx.examination.create({
    data: {
      schoolId,
      name: data.name,
      term: data.term,
      academicYear: data.academicYear,
      startDate: data.startDate || null,
      endDate: data.endDate || null
    }
  });
}

/**
 * Updates an existing examination record.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} id - Examination UUID
 * @param {Object} data - Partial examination attributes to update
 * @param {Object} [tx] - Optional Prisma transaction client
 * @returns {Promise<Object>}
 */
export async function updateExam(schoolId, id, data, tx = prisma) {
  return tx.examination.update({
    where: {
      id,
      schoolId
    },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.term !== undefined && { term: data.term }),
      ...(data.academicYear !== undefined && { academicYear: data.academicYear }),
      ...(data.startDate !== undefined && { startDate: data.startDate }),
      ...(data.endDate !== undefined && { endDate: data.endDate })
    }
  });
}

/**
 * Deletes an examination record.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} id - Examination UUID
 * @param {Object} [tx] - Optional Prisma transaction client
 * @returns {Promise<Object>}
 */
export async function deleteExam(schoolId, id, tx = prisma) {
  return tx.examination.delete({
    where: {
      id,
      schoolId
    }
  });
}

/**
 * Counts dependent assessments linked to an examination.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} examId - Examination UUID
 * @param {Object} [tx] - Optional Prisma transaction client
 * @returns {Promise<number>}
 */
export async function countDependentAssessments(schoolId, examId, tx = prisma) {
  return tx.assessment.count({
    where: {
      schoolId,
      examId
    }
  });
}
