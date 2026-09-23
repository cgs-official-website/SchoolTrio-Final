import { prisma } from '../../database/prisma.client.js';

/**
 * Assessment Grade Repository
 * Multi-tenant data access operations for student assessment marks.
 */

/**
 * Finds parent assessment for validation and authorization.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} assessmentId - Assessment UUID
 * @param {Object} [tx=prisma] - Optional Prisma transaction client
 * @returns {Promise<Object|null>}
 */
export async function findAssessmentForGradeOperation(schoolId, assessmentId, tx = prisma) {
  return tx.assessment.findFirst({
    where: {
      id: assessmentId,
      schoolId
    },
    select: {
      id: true,
      schoolId: true,
      classId: true,
      title: true,
      totalMarks: true,
      passingMarks: true,
      examId: true,
      subjectId: true
    }
  });
}

/**
 * Finds student for membership and enrollment validation.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} studentId - Student UUID
 * @param {Object} [tx=prisma] - Optional Prisma transaction client
 * @returns {Promise<Object|null>}
 */
export async function findStudentForGradeOperation(schoolId, studentId, tx = prisma) {
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
 * Finds multiple students by IDs for efficient bulk validation.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {Array<string>} studentIds - Array of Student UUIDs
 * @param {Object} [tx=prisma] - Optional Prisma transaction client
 * @returns {Promise<Array<Object>>}
 */
export async function findStudentsByIdsForGradeOperation(schoolId, studentIds, tx = prisma) {
  return tx.student.findMany({
    where: {
      schoolId,
      id: { in: studentIds }
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
 * Finds a single recorded grade record.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} assessmentId - Assessment UUID
 * @param {string} studentId - Student UUID
 * @param {Object} [tx=prisma] - Optional Prisma transaction client
 * @returns {Promise<Object|null>}
 */
export async function findGrade(schoolId, assessmentId, studentId, tx = prisma) {
  return tx.assessmentGrade.findFirst({
    where: {
      schoolId,
      assessmentId,
      studentId
    },
    include: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          admissionNumber: true,
          rollNumber: true
        }
      }
    }
  });
}

/**
 * Lists all recorded marks for a given assessment with student info.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} assessmentId - Assessment UUID
 * @param {Object} [options={}] - Filter and pagination options
 * @param {Object} [tx=prisma] - Optional Prisma transaction client
 * @returns {Promise<{ items: Array<Object>, total: number }>}
 */
export async function findGradesByAssessment(schoolId, assessmentId, options = {}, tx = prisma) {
  const where = {
    schoolId,
    assessmentId
  };

  if (options.search) {
    where.student = {
      OR: [
        { firstName: { contains: options.search, mode: 'insensitive' } },
        { lastName: { contains: options.search, mode: 'insensitive' } },
        { admissionNumber: { contains: options.search, mode: 'insensitive' } }
      ]
    };
  }

  const [total, items] = await Promise.all([
    tx.assessmentGrade.count({ where }),
    tx.assessmentGrade.findMany({
      where,
      skip: options.skip || 0,
      take: options.limit || 100,
      orderBy: options.sort
        ? { [options.sort]: options.order || 'asc' }
        : { student: { firstName: 'asc' } },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            admissionNumber: true,
            rollNumber: true
          }
        }
      }
    })
  ]);

  return { items, total };
}

/**
 * Atomically creates or updates an assessment grade.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} assessmentId - Assessment UUID
 * @param {string} studentId - Student UUID
 * @param {Object} data - Grade attributes ({ marksObtained, remarks })
 * @param {Object} [tx=prisma] - Optional Prisma transaction client
 * @returns {Promise<Object>}
 */
export async function upsertGrade(schoolId, assessmentId, studentId, data, tx = prisma) {
  return tx.assessmentGrade.upsert({
    where: {
      schoolId_assessmentId_studentId: {
        schoolId,
        assessmentId,
        studentId
      }
    },
    update: {
      marksObtained: data.marksObtained,
      remarks: data.remarks !== undefined ? data.remarks : undefined
    },
    create: {
      schoolId,
      assessmentId,
      studentId,
      marksObtained: data.marksObtained,
      remarks: data.remarks || null,
      grade: null
    },
    include: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          admissionNumber: true,
          rollNumber: true
        }
      }
    }
  });
}

/**
 * Deletes an existing assessment grade record.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} assessmentId - Assessment UUID
 * @param {string} studentId - Student UUID
 * @param {Object} [tx=prisma] - Optional Prisma transaction client
 * @returns {Promise<Object>}
 */
export async function deleteGrade(schoolId, assessmentId, studentId, tx = prisma) {
  return tx.assessmentGrade.delete({
    where: {
      schoolId_assessmentId_studentId: {
        schoolId,
        assessmentId,
        studentId
      }
    }
  });
}

/**
 * Resolves teacher StaffProfile by User ID for class-based authorization.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} userId - User UUID
 * @param {Object} [tx=prisma] - Optional Prisma transaction client
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
      assignedClassId: true,
      name: true
    }
  });
}

/**
 * Executes operations inside a Prisma interactive transaction.
 *
 * @param {Function} callback - Async function receiving the transaction client
 * @returns {Promise<any>}
 */
export async function executeInTransaction(callback) {
  return prisma.$transaction(async (tx) => {
    return callback(tx);
  });
}
