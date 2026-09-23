import { prisma } from '../../database/prisma.client.js';

/**
 * Student Data Access Repository Layer
 *
 * Strict Tenant Safety Rules:
 * 1. Every query must explicitly filter by schoolId.
 * 2. Cross-tenant reads and mutations are strictly prevented.
 * 3. Supports transaction propagation via optional `tx` parameter.
 */

const STUDENT_SELECT_CONFIG = {
  id: true,
  schoolId: true,
  admissionNumber: true,
  rollNumber: true,
  firstName: true,
  lastName: true,
  dob: true,
  gender: true,
  bloodGroup: true,
  aadhaarNumber: true,
  photoUrl: true,
  status: true,
  customData: true,
  classId: true,
  sectionId: true,
  transportRouteId: true,
  pickupStopId: true,
  createdAt: true,
  updatedAt: true,
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
  },
  _count: {
    select: {
      parents: true,
      attendanceRecords: true,
      invoices: true,
      assessmentGrades: true
    }
  }
};

/**
 * Finds paginated students for a tenant with optional search and filtering.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} options
 * @param {string} [options.search]
 * @param {string} [options.admissionNumber]
 * @param {string} [options.classId]
 * @param {string} [options.sectionId]
 * @param {string} [options.status]
 * @param {string} [options.gender]
 * @param {string} [options.bloodGroup]
 * @param {number} [options.skip=0]
 * @param {number} [options.take=20]
 * @param {string} [options.sort='name']
 * @param {string} [options.order='asc']
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Array>}
 */
export async function findStudents(schoolId, options = {}, tx = prisma) {
  const where = { schoolId };

  if (options.search) {
    where.OR = [
      { firstName: { contains: options.search, mode: 'insensitive' } },
      { lastName: { contains: options.search, mode: 'insensitive' } },
      { admissionNumber: { contains: options.search, mode: 'insensitive' } },
      { rollNumber: { contains: options.search, mode: 'insensitive' } }
    ];
  }

  if (options.admissionNumber) {
    where.admissionNumber = { equals: options.admissionNumber, mode: 'insensitive' };
  }

  if (options.classId) {
    where.classId = options.classId;
  }

  if (options.sectionId) {
    where.sectionId = options.sectionId;
  }

  if (options.status) {
    where.status = options.status;
  }

  if (options.gender) {
    where.gender = { equals: options.gender, mode: 'insensitive' };
  }

  if (options.bloodGroup) {
    where.bloodGroup = options.bloodGroup;
  }

  const orderBy = [];
  if (options.sort === 'admissionNumber') {
    orderBy.push({ admissionNumber: options.order || 'asc' });
  } else if (options.sort === 'rollNumber') {
    orderBy.push({ rollNumber: options.order || 'asc' });
  } else if (options.sort === 'status') {
    orderBy.push({ status: options.order || 'asc' });
    orderBy.push({ firstName: 'asc' });
  } else if (options.sort === 'createdAt') {
    orderBy.push({ createdAt: options.order || 'desc' });
  } else if (options.sort === 'updatedAt') {
    orderBy.push({ updatedAt: options.order || 'desc' });
  } else {
    // Default sorting by name
    orderBy.push({ firstName: options.order || 'asc' });
    orderBy.push({ lastName: options.order || 'asc' });
  }

  return tx.student.findMany({
    where,
    select: STUDENT_SELECT_CONFIG,
    skip: options.skip,
    take: options.take,
    orderBy
  });
}

/**
 * Counts total students matching filters for a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} options
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<number>}
 */
export async function countStudents(schoolId, options = {}, tx = prisma) {
  const where = { schoolId };

  if (options.search) {
    where.OR = [
      { firstName: { contains: options.search, mode: 'insensitive' } },
      { lastName: { contains: options.search, mode: 'insensitive' } },
      { admissionNumber: { contains: options.search, mode: 'insensitive' } },
      { rollNumber: { contains: options.search, mode: 'insensitive' } }
    ];
  }

  if (options.admissionNumber) {
    where.admissionNumber = { equals: options.admissionNumber, mode: 'insensitive' };
  }

  if (options.classId) {
    where.classId = options.classId;
  }

  if (options.sectionId) {
    where.sectionId = options.sectionId;
  }

  if (options.status) {
    where.status = options.status;
  }

  if (options.gender) {
    where.gender = { equals: options.gender, mode: 'insensitive' };
  }

  if (options.bloodGroup) {
    where.bloodGroup = options.bloodGroup;
  }

  return tx.student.count({ where });
}

/**
 * Finds a single student by ID within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} studentId - Student UUID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object|null>}
 */
export async function findStudentById(schoolId, studentId, tx = prisma) {
  return tx.student.findFirst({
    where: {
      id: studentId,
      schoolId
    },
    select: STUDENT_SELECT_CONFIG
  });
}

/**
 * Finds a student by admission number (case-insensitive) within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} admissionNumber - Student admission number
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object|null>}
 */
export async function findStudentByAdmissionNumber(schoolId, admissionNumber, tx = prisma) {
  return tx.student.findFirst({
    where: {
      schoolId,
      admissionNumber: { equals: admissionNumber, mode: 'insensitive' }
    },
    select: STUDENT_SELECT_CONFIG
  });
}

/**
 * Locks a single student by ID exclusively (FOR UPDATE) within tenant context.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} studentId - Student UUID
 * @param {Object} [tx] - Transaction client
 * @returns {Promise<Object|null>}
 */
export async function findStudentByIdForUpdate(schoolId, studentId, tx = prisma) {
  const rows = await tx.$queryRaw`
    SELECT id, school_id AS "schoolId", first_name AS "firstName", last_name AS "lastName",
           admission_number AS "admissionNumber", status, class_id AS "classId", section_id AS "sectionId"
    FROM "students"
    WHERE "school_id" = ${schoolId}::uuid
      AND "id" = ${studentId}::uuid
    FOR UPDATE
  `;
  return rows[0] || null;
}

/**
 * Creates a new student for a tenant.
 *
 * @param {Object} data
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object>}
 */
export async function createStudent(data, tx = prisma) {
  return tx.student.create({
    data: {
      schoolId: data.schoolId,
      admissionNumber: data.admissionNumber,
      firstName: data.firstName,
      lastName: data.lastName || null,
      dob: data.dob || null,
      gender: data.gender || null,
      bloodGroup: data.bloodGroup || null,
      aadhaarNumber: data.aadhaarNumber || null,
      photoUrl: data.photoUrl || null,
      rollNumber: data.rollNumber || null,
      classId: data.classId || null,
      sectionId: data.sectionId || null,
      transportRouteId: data.transportRouteId || null,
      pickupStopId: data.pickupStopId || null,
      status: data.status || 'Active',
      customData: data.customData !== undefined ? data.customData : null
    },
    select: STUDENT_SELECT_CONFIG
  });
}

/**
 * Updates a student within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} studentId - Student UUID
 * @param {Object} data - Update data
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object>}
 */
export async function updateStudent(schoolId, studentId, data, tx = prisma) {
  return tx.student.update({
    where: {
      schoolId_id: {
        schoolId,
        id: studentId
      }
    },
    data,
    select: STUDENT_SELECT_CONFIG
  });
}

/**
 * Deletes a student within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} studentId - Student UUID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object>}
 */
export async function deleteStudent(schoolId, studentId, tx = prisma) {
  return tx.student.delete({
    where: {
      schoolId_id: {
        schoolId,
        id: studentId
      }
    }
  });
}

/**
 * Checks all 11 blocking business dependencies for a Student within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} studentId - Student UUID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object>}
 */
export async function countStudentDependencies(schoolId, studentId, tx = prisma) {
  const [
    invoices,
    attendanceRecords,
    attendanceStats,
    absenteeFlags,
    assessmentGrades,
    reportCards,
    homeworkSubmissions,
    bookIssues,
    chatRooms,
    ptmAppointments,
    canteenRequests
  ] = await Promise.all([
    tx.invoice.count({ where: { schoolId, studentId } }),
    tx.attendanceRecord.count({ where: { schoolId, studentId } }),
    tx.attendanceStat.count({ where: { schoolId, studentId } }),
    tx.absenteeFlag.count({ where: { schoolId, studentId } }),
    tx.assessmentGrade.count({ where: { schoolId, studentId } }),
    tx.reportCard.count({ where: { schoolId, studentId } }),
    tx.homeworkSubmission.count({ where: { schoolId, studentId } }),
    tx.libraryBookIssue.count({ where: { schoolId, studentId } }),
    tx.chatRoom.count({ where: { schoolId, studentId } }),
    tx.ptmAppointment.count({ where: { schoolId, studentId } }),
    tx.canteenRequest.count({ where: { schoolId, studentId } })
  ]);

  return {
    invoices,
    attendanceRecords,
    attendanceStats,
    absenteeFlags,
    assessmentGrades,
    reportCards,
    homeworkSubmissions,
    bookIssues,
    chatRooms,
    ptmAppointments,
    canteenRequests
  };
}
