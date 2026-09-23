import { prisma } from '../../database/prisma.client.js';

/**
 * Report Card Repository
 * Tenant-scoped data access operations for student ReportCard records.
 *
 * Strict Tenant Safety Rules:
 * 1. Every query must explicitly filter by schoolId.
 * 2. Cross-tenant reads and mutations are strictly prevented.
 * 3. Supports transaction propagation via optional `tx` parameter.
 */

const REPORT_CARD_INCLUDE = {
  student: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      admissionNumber: true,
      rollNumber: true,
      classId: true,
      sectionId: true,
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
      }
    }
  }
};

/**
 * Finds a report card by internal UUID within tenant scope.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} id - ReportCard UUID
 * @param {Object} [tx=prisma] - Optional Prisma transaction client
 * @returns {Promise<Object|null>}
 */
export async function findReportCardById(schoolId, id, tx = prisma) {
  return tx.reportCard.findFirst({
    where: {
      id,
      schoolId
    },
    include: REPORT_CARD_INCLUDE
  });
}

/**
 * Finds a formal exam report card by student ID and exam ID within tenant scope.
 * Identity: (schoolId, studentId, examId)
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} studentId - Student UUID
 * @param {string} examId - Examination UUID
 * @param {Object} [tx=prisma] - Optional Prisma transaction client
 * @returns {Promise<Object|null>}
 */
export async function findFormalReportCard(schoolId, studentId, examId, tx = prisma) {
  return tx.reportCard.findFirst({
    where: {
      schoolId,
      studentId,
      examId
    },
    include: REPORT_CARD_INCLUDE
  });
}

/**
 * Finds a continuous assessment report card by student ID and class ID within tenant scope.
 * Identity: (schoolId, studentId, classId) with examId = null.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} studentId - Student UUID
 * @param {string} classId - Class UUID
 * @param {Object} [tx=prisma] - Optional Prisma transaction client
 * @returns {Promise<Object|null>}
 */
export async function findContinuousReportCard(schoolId, studentId, classId, tx = prisma) {
  // Query all continuous report cards for this student (examId is null)
  const candidateCards = await tx.reportCard.findMany({
    where: {
      schoolId,
      studentId,
      examId: null
    },
    include: REPORT_CARD_INCLUDE,
    orderBy: {
      publishedAt: 'desc'
    }
  });

  // Match by classId stored in marksData snapshot
  const matched = candidateCards.find(rc => {
    if (!rc.marksData || typeof rc.marksData !== 'object') return false;
    return rc.marksData.classId === classId;
  });

  return matched || null;
}

/**
 * Lists report cards for a specific student with optional exam filtering and pagination.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} studentId - Student UUID
 * @param {Object} [filterOptions={}] - Filtering options (examId)
 * @param {Object} [paginationOptions={}] - Pagination options (page, limit, skip, sort, order)
 * @param {Object} [tx=prisma] - Optional Prisma transaction client
 * @returns {Promise<{ items: Array<Object>, total: number }>}
 */
export async function findReportCardsByStudent(schoolId, studentId, filterOptions = {}, paginationOptions = {}, tx = prisma) {
  const where = {
    schoolId,
    studentId
  };

  if (filterOptions.examId !== undefined) {
    where.examId = filterOptions.examId;
  }

  const orderBy = {};
  const sortField = paginationOptions.sort || 'publishedAt';
  const sortOrder = paginationOptions.order || 'desc';
  orderBy[sortField] = sortOrder;

  const [items, total] = await Promise.all([
    tx.reportCard.findMany({
      where,
      include: REPORT_CARD_INCLUDE,
      orderBy,
      skip: paginationOptions.skip || 0,
      take: paginationOptions.limit || 20
    }),
    tx.reportCard.count({ where })
  ]);

  return { items, total };
}

/**
 * Lists report cards for a class (formal or continuous) with pagination.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} classId - Class UUID
 * @param {Object} [filterOptions={}] - Filtering options (examId)
 * @param {Object} [paginationOptions={}] - Pagination options (page, limit, skip, sort, order)
 * @param {Object} [tx=prisma] - Optional Prisma transaction client
 * @returns {Promise<{ items: Array<Object>, total: number }>}
 */
export async function findReportCardsByClass(schoolId, classId, filterOptions = {}, paginationOptions = {}, tx = prisma) {
  const where = {
    schoolId,
    student: {
      classId
    }
  };

  if (filterOptions.examId !== undefined) {
    where.examId = filterOptions.examId;
  }

  const orderBy = {};
  const sortField = paginationOptions.sort || 'publishedAt';
  const sortOrder = paginationOptions.order || 'desc';
  orderBy[sortField] = sortOrder;

  const [items, total] = await Promise.all([
    tx.reportCard.findMany({
      where,
      include: REPORT_CARD_INCLUDE,
      orderBy,
      skip: paginationOptions.skip || 0,
      take: paginationOptions.limit || 20
    }),
    tx.reportCard.count({ where })
  ]);

  return { items, total };
}

/**
 * Creates a new ReportCard record.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {Object} data - ReportCard fields
 * @param {Object} [tx=prisma] - Optional Prisma transaction client
 * @returns {Promise<Object>}
 */
export async function createReportCard(schoolId, data, tx = prisma) {
  return tx.reportCard.create({
    data: {
      schoolId,
      studentId: data.studentId,
      title: data.title,
      term: data.term || null,
      examId: data.examId || null,
      marksData: data.marksData,
      grades: data.grades || null,
      attendanceSummary: data.attendanceSummary || null,
      publishedAt: data.publishedAt || new Date()
    },
    include: REPORT_CARD_INCLUDE
  });
}

/**
 * Updates an existing ReportCard record within tenant scope.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} id - ReportCard UUID
 * @param {Object} data - Update data fields
 * @param {Object} [tx=prisma] - Optional Prisma transaction client
 * @returns {Promise<Object>}
 */
export async function updateReportCard(schoolId, id, data, tx = prisma) {
  return tx.reportCard.update({
    where: {
      schoolId_id: {
        schoolId,
        id
      }
    },
    data: {
      title: data.title,
      term: data.term !== undefined ? data.term : undefined,
      examId: data.examId !== undefined ? data.examId : undefined,
      marksData: data.marksData,
      grades: data.grades !== undefined ? data.grades : undefined,
      attendanceSummary: data.attendanceSummary !== undefined ? data.attendanceSummary : undefined,
      publishedAt: data.publishedAt || new Date()
    },
    include: REPORT_CARD_INCLUDE
  });
}

/**
 * Atomically upserts a formal exam report card for a student.
 * Identity: (schoolId, studentId, examId)
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} studentId - Student UUID
 * @param {string} examId - Examination UUID
 * @param {Object} data - Snapshot data payload
 * @param {Object} [tx=prisma] - Optional Prisma transaction client
 * @returns {Promise<Object>}
 */
export async function upsertFormalReportCard(schoolId, studentId, examId, data, tx = prisma) {
  const existing = await findFormalReportCard(schoolId, studentId, examId, tx);

  if (existing) {
    return updateReportCard(schoolId, existing.id, {
      ...data,
      studentId,
      examId
    }, tx);
  }

  return createReportCard(schoolId, {
    ...data,
    studentId,
    examId
  }, tx);
}

/**
 * Atomically upserts a continuous assessment report card for a student and class.
 * Identity: (schoolId, studentId, classId) with examId = null.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} studentId - Student UUID
 * @param {string} classId - Class UUID
 * @param {Object} data - Snapshot data payload
 * @param {Object} [tx=prisma] - Optional Prisma transaction client
 * @returns {Promise<Object>}
 */
export async function upsertContinuousReportCard(schoolId, studentId, classId, data, tx = prisma) {
  const existing = await findContinuousReportCard(schoolId, studentId, classId, tx);

  if (existing) {
    return updateReportCard(schoolId, existing.id, {
      ...data,
      studentId,
      examId: null
    }, tx);
  }

  return createReportCard(schoolId, {
    ...data,
    studentId,
    examId: null
  }, tx);
}
