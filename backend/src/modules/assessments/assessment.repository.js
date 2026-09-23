import { prisma } from '../../database/prisma.client.js';

/**
 * Assessment Repository
 * Multi-tenant data access operations for formative, continuous, and exam-linked assessments.
 */

/**
 * Retrieves a paginated list of assessments for a school tenant.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {Object} query - Filtering parameters (classId, examId, subjectId, search, date)
 * @param {Object} pagination - Pagination parameters (page, limit, skip, sort, order)
 * @returns {Promise<{ items: Array<Object>, total: number, page: number, limit: number, totalPages: number }>}
 */
export async function findAssessments(schoolId, query = {}, pagination = {}) {
  const where = {
    schoolId
  };

  if (query.classId) {
    where.classId = query.classId;
  }

  if (query.examId) {
    where.examId = query.examId;
  }

  if (query.subjectId) {
    where.subjectId = query.subjectId;
  }

  if (query.search) {
    where.title = {
      contains: query.search,
      mode: 'insensitive'
    };
  }

  if (query.date) {
    where.date = query.date;
  }

  const page = Math.max(1, parseInt(pagination.page, 10) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(pagination.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const validSortFields = ['createdAt', 'date', 'title', 'totalMarks'];
  const sortBy = validSortFields.includes(pagination.sort) ? pagination.sort : 'createdAt';
  const sortOrder = pagination.order === 'asc' ? 'asc' : 'desc';

  const [items, total] = await Promise.all([
    prisma.assessment.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
      include: {
        class: {
          select: { id: true, name: true, gradeLevel: true }
        },
        subject: {
          select: { id: true, name: true, code: true }
        },
        exam: {
          select: { id: true, name: true, term: true, academicYear: true }
        },
        _count: {
          select: { assessmentGrades: true }
        }
      }
    }),
    prisma.assessment.count({ where })
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
 * Retrieves a single assessment record by tenant and ID.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} id - Assessment UUID
 * @param {Object} [tx] - Optional Prisma transaction client
 * @returns {Promise<Object|null>}
 */
export async function findAssessmentById(schoolId, id, tx = prisma) {
  return tx.assessment.findFirst({
    where: {
      id,
      schoolId
    },
    include: {
      class: {
        select: { id: true, name: true, gradeLevel: true }
      },
      subject: {
        select: { id: true, name: true, code: true }
      },
      exam: {
        select: { id: true, name: true, term: true, academicYear: true }
      },
      _count: {
        select: { assessmentGrades: true }
      }
    }
  });
}

/**
 * Creates a new assessment record.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {Object} data - Assessment attributes
 * @param {Object} [tx] - Optional Prisma transaction client
 * @returns {Promise<Object>}
 */
export async function createAssessment(schoolId, data, tx = prisma) {
  return tx.assessment.create({
    data: {
      schoolId,
      title: data.title,
      classId: data.classId,
      subjectId: data.subjectId || null,
      examId: data.examId || null,
      totalMarks: data.totalMarks,
      passingMarks: data.passingMarks !== undefined ? data.passingMarks : null,
      date: data.date || null
    },
    include: {
      class: {
        select: { id: true, name: true, gradeLevel: true }
      },
      subject: {
        select: { id: true, name: true, code: true }
      },
      exam: {
        select: { id: true, name: true, term: true, academicYear: true }
      }
    }
  });
}

/**
 * Updates an existing assessment record.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} id - Assessment UUID
 * @param {Object} data - Partial assessment attributes to update
 * @param {Object} [tx] - Optional Prisma transaction client
 * @returns {Promise<Object>}
 */
export async function updateAssessment(schoolId, id, data, tx = prisma) {
  return tx.assessment.update({
    where: {
      id,
      schoolId
    },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.totalMarks !== undefined && { totalMarks: data.totalMarks }),
      ...(data.passingMarks !== undefined && { passingMarks: data.passingMarks }),
      ...(data.date !== undefined && { date: data.date }),
      ...(data.examId !== undefined && { examId: data.examId }),
      ...(data.subjectId !== undefined && { subjectId: data.subjectId })
    },
    include: {
      class: {
        select: { id: true, name: true, gradeLevel: true }
      },
      subject: {
        select: { id: true, name: true, code: true }
      },
      exam: {
        select: { id: true, name: true, term: true, academicYear: true }
      }
    }
  });
}

/**
 * Deletes an assessment record.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} id - Assessment UUID
 * @param {Object} [tx] - Optional Prisma transaction client
 * @returns {Promise<Object>}
 */
export async function deleteAssessment(schoolId, id, tx = prisma) {
  return tx.assessment.delete({
    where: {
      id,
      schoolId
    }
  });
}

/**
 * Counts recorded student grades for an assessment.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} assessmentId - Assessment UUID
 * @param {Object} [tx] - Optional Prisma transaction client
 * @returns {Promise<number>}
 */
export async function countAssessmentGrades(schoolId, assessmentId, tx = prisma) {
  return tx.assessmentGrade.count({
    where: {
      schoolId,
      assessmentId
    }
  });
}

/**
 * Verifies that a Class belongs to the tenant.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} classId - Class UUID
 * @param {Object} [tx] - Optional Prisma transaction client
 * @returns {Promise<Object|null>}
 */
export async function verifyClassExists(schoolId, classId, tx = prisma) {
  return tx.class.findFirst({
    where: {
      id: classId,
      schoolId
    },
    select: { id: true, name: true }
  });
}

/**
 * Verifies that an Examination belongs to the tenant.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} examId - Examination UUID
 * @param {Object} [tx] - Optional Prisma transaction client
 * @returns {Promise<Object|null>}
 */
export async function verifyExamExists(schoolId, examId, tx = prisma) {
  return tx.examination.findFirst({
    where: {
      id: examId,
      schoolId
    },
    select: { id: true, name: true }
  });
}

/**
 * Verifies that a Subject belongs to the tenant.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} subjectId - Subject UUID
 * @param {Object} [tx] - Optional Prisma transaction client
 * @returns {Promise<Object|null>}
 */
export async function verifySubjectExists(schoolId, subjectId, tx = prisma) {
  return tx.subject.findFirst({
    where: {
      id: subjectId,
      schoolId
    },
    select: { id: true, name: true }
  });
}

/**
 * Retrieves the staff profile assigned class for a user.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} userId - User UUID
 * @param {Object} [tx] - Optional Prisma transaction client
 * @returns {Promise<Object|null>}
 */
export async function findStaffProfileByUserId(schoolId, userId, tx = prisma) {
  return tx.staffProfile.findFirst({
    where: {
      schoolId,
      userId
    },
    select: { id: true, assignedClassId: true }
  });
}
