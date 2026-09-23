import * as studentRepository from './student.repository.js';
import { createAuditLog } from '../audit/audit.repository.js';
import { prisma } from '../../database/prisma.client.js';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
  TenantAccessError
} from '../../utils/app-error.js';
import { parsePagination, buildPaginationMetadata } from '../../utils/pagination.js';

/**
 * Student Business Logic Service Layer
 *
 * Enforces:
 * - Strict multi-tenant boundaries
 * - Unique admissionNumber per institution
 * - Relational integrity for class and section assignments
 * - Concurrency-safe dependency guards (FOR UPDATE row locking + 11 dependency checks)
 * - Canonical non-blocking AuditLog generation for mutations
 */

/**
 * Lists students with pagination, searching, and filtering.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} query - Express request query
 * @returns {Promise<{ students: Array, pagination: Object }>}
 */
export async function listStudents(schoolId, query = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to list students');
  }

  const paginationParams = parsePagination(query, {
    defaultSort: 'name',
    defaultOrder: 'asc'
  });

  const options = {
    search: query.search ? query.search.trim() : undefined,
    admissionNumber: query.admissionNumber ? query.admissionNumber.trim() : undefined,
    classId: query.classId || undefined,
    sectionId: query.sectionId || undefined,
    status: query.status || undefined,
    gender: query.gender ? query.gender.trim() : undefined,
    bloodGroup: query.bloodGroup || undefined,
    skip: paginationParams.skip,
    take: paginationParams.take,
    sort: paginationParams.sort,
    order: paginationParams.order
  };

  const [students, total] = await Promise.all([
    studentRepository.findStudents(schoolId, options),
    studentRepository.countStudents(schoolId, options)
  ]);

  const pagination = buildPaginationMetadata(total, paginationParams.page, paginationParams.limit);

  return { students, pagination };
}

/**
 * Retrieves a single student by ID within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} studentId - Student UUID
 * @returns {Promise<Object>}
 */
export async function getStudentById(schoolId, studentId) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to retrieve student');
  }

  const student = await studentRepository.findStudentById(schoolId, studentId);
  if (!student) {
    throw new NotFoundError('Student');
  }

  return student;
}

/**
 * Creates a new student for a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} data - Creation payload
 * @param {Object} [actor] - Context of requesting user
 * @returns {Promise<Object>}
 */
export async function createStudent(schoolId, data, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to create student');
  }

  const admissionNumber = data.admissionNumber.trim();

  // 1. Prevent duplicate admission number within tenant (case-insensitive)
  const existingByAdm = await studentRepository.findStudentByAdmissionNumber(schoolId, admissionNumber);
  if (existingByAdm) {
    throw new ConflictError(`Admission number "${admissionNumber}" is already registered in this institution`);
  }

  // 2. Class validation if supplied
  if (data.classId) {
    const classEntity = await prisma.class.findFirst({
      where: {
        id: data.classId,
        schoolId
      }
    });
    if (!classEntity) {
      throw new ValidationError('Assigned class not found in this institution');
    }
  }

  // 3. Section validation if supplied
  if (data.sectionId) {
    if (!data.classId) {
      throw new ValidationError('Cannot assign a section without an assigned class');
    }
    const sectionEntity = await prisma.section.findFirst({
      where: {
        id: data.sectionId,
        classId: data.classId,
        schoolId
      }
    });
    if (!sectionEntity) {
      throw new ValidationError('Selected section does not belong to the assigned class in this institution');
    }
  }

  const created = await studentRepository.createStudent({
    schoolId,
    admissionNumber,
    firstName: data.firstName.trim(),
    lastName: data.lastName ? data.lastName.trim() : null,
    dob: data.dob || null,
    gender: data.gender ? data.gender.trim() : null,
    bloodGroup: data.bloodGroup || null,
    aadhaarNumber: data.aadhaarNumber ? data.aadhaarNumber.trim() : null,
    photoUrl: data.photoUrl ? data.photoUrl.trim() : null,
    rollNumber: data.rollNumber ? data.rollNumber.trim() : null,
    classId: data.classId || null,
    sectionId: data.sectionId || null,
    transportRouteId: data.transportRouteId || null,
    pickupStopId: data.pickupStopId || null,
    status: data.status || 'Active',
    customData: data.customData !== undefined ? data.customData : null
  });

  // 4. Canonical AuditLog integration (non-blocking, post-creation)
  await createAuditLog({
    schoolId,
    entityType: 'Student',
    entityId: created.id,
    actionPerformed: `CREATE_STUDENT: ${created.firstName}${created.lastName ? ' ' + created.lastName : ''}`,
    userName: actor?.email || actor?.userId || 'Administrator',
    userRole: actor?.systemRole || null,
    modifiedFields: {
      admissionNumber: created.admissionNumber,
      firstName: created.firstName,
      lastName: created.lastName,
      status: created.status,
      classId: created.classId,
      sectionId: created.sectionId
    }
  });

  return created;
}

/**
 * Updates a student within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} studentId - Student UUID
 * @param {Object} data - Update payload
 * @param {Object} [actor] - Context of requesting user
 * @returns {Promise<Object>}
 */
export async function updateStudent(schoolId, studentId, data, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to update student');
  }

  const existingStudent = await studentRepository.findStudentById(schoolId, studentId);
  if (!existingStudent) {
    throw new NotFoundError('Student');
  }

  const updatePayload = {};
  const modifiedFields = {};

  // 1. Admission number validation & duplicate check
  if (data.admissionNumber !== undefined) {
    const newAdm = data.admissionNumber.trim();
    if (newAdm.toLowerCase() !== existingStudent.admissionNumber.toLowerCase()) {
      const duplicate = await studentRepository.findStudentByAdmissionNumber(schoolId, newAdm);
      if (duplicate && duplicate.id !== studentId) {
        throw new ConflictError(`Admission number "${newAdm}" is already registered in this institution`);
      }
      modifiedFields.admissionNumber = { old: existingStudent.admissionNumber, new: newAdm };
    }
    updatePayload.admissionNumber = newAdm;
  }

  // 2. Class & Section reassignment validation
  const effectiveClassId = data.classId !== undefined ? data.classId : existingStudent.classId;
  const effectiveSectionId = data.sectionId !== undefined ? data.sectionId : existingStudent.sectionId;

  if (data.classId !== undefined) {
    if (data.classId !== existingStudent.classId) {
      if (data.classId !== null) {
        const classEntity = await prisma.class.findFirst({
          where: {
            id: data.classId,
            schoolId
          }
        });
        if (!classEntity) {
          throw new ValidationError('Assigned class not found in this institution');
        }
      }
      modifiedFields.classId = { old: existingStudent.classId, new: data.classId };
    }
    updatePayload.classId = data.classId;
  }

  if (data.sectionId !== undefined) {
    if (data.sectionId !== existingStudent.sectionId) {
      modifiedFields.sectionId = { old: existingStudent.sectionId, new: data.sectionId };
    }
    updatePayload.sectionId = data.sectionId;
  }

  if (effectiveSectionId !== null) {
    if (!effectiveClassId) {
      throw new ValidationError('Cannot assign a section without an assigned class');
    }
    const sectionEntity = await prisma.section.findFirst({
      where: {
        id: effectiveSectionId,
        classId: effectiveClassId,
        schoolId
      }
    });
    if (!sectionEntity) {
      throw new ValidationError('Selected section does not belong to the assigned class in this institution');
    }
  }

  // 3. Name fields
  if (data.firstName !== undefined) {
    const newFirst = data.firstName.trim();
    if (newFirst !== existingStudent.firstName) {
      modifiedFields.firstName = { old: existingStudent.firstName, new: newFirst };
    }
    updatePayload.firstName = newFirst;
  }

  if (data.lastName !== undefined) {
    const newLast = data.lastName ? data.lastName.trim() : null;
    if (newLast !== existingStudent.lastName) {
      modifiedFields.lastName = { old: existingStudent.lastName, new: newLast };
    }
    updatePayload.lastName = newLast;
  }

  // 4. Demographic fields
  if (data.dob !== undefined) {
    const newDob = data.dob || null;
    if (newDob !== existingStudent.dob) {
      modifiedFields.dob = { old: existingStudent.dob, new: newDob };
    }
    updatePayload.dob = newDob;
  }

  if (data.gender !== undefined) {
    const newGender = data.gender ? data.gender.trim() : null;
    if (newGender !== existingStudent.gender) {
      modifiedFields.gender = { old: existingStudent.gender, new: newGender };
    }
    updatePayload.gender = newGender;
  }

  if (data.bloodGroup !== undefined) {
    const newBlood = data.bloodGroup || null;
    if (newBlood !== existingStudent.bloodGroup) {
      modifiedFields.bloodGroup = { old: existingStudent.bloodGroup, new: newBlood };
    }
    updatePayload.bloodGroup = newBlood;
  }

  if (data.aadhaarNumber !== undefined) {
    const newAadhaar = data.aadhaarNumber ? data.aadhaarNumber.trim() : null;
    if (newAadhaar !== existingStudent.aadhaarNumber) {
      modifiedFields.aadhaarNumber = { old: existingStudent.aadhaarNumber, new: newAadhaar };
    }
    updatePayload.aadhaarNumber = newAadhaar;
  }

  if (data.photoUrl !== undefined) {
    const newPhoto = data.photoUrl ? data.photoUrl.trim() : null;
    if (newPhoto !== existingStudent.photoUrl) {
      modifiedFields.photoUrl = { old: existingStudent.photoUrl, new: newPhoto };
    }
    updatePayload.photoUrl = newPhoto;
  }

  if (data.rollNumber !== undefined) {
    const newRoll = data.rollNumber ? data.rollNumber.trim() : null;
    if (newRoll !== existingStudent.rollNumber) {
      modifiedFields.rollNumber = { old: existingStudent.rollNumber, new: newRoll };
    }
    updatePayload.rollNumber = newRoll;
  }

  if (data.status !== undefined) {
    if (data.status !== existingStudent.status) {
      modifiedFields.status = { old: existingStudent.status, new: data.status };
    }
    updatePayload.status = data.status;
  }

  if (data.transportRouteId !== undefined) {
    if (data.transportRouteId !== existingStudent.transportRouteId) {
      modifiedFields.transportRouteId = { old: existingStudent.transportRouteId, new: data.transportRouteId || null };
    }
    updatePayload.transportRouteId = data.transportRouteId || null;
  }

  if (data.pickupStopId !== undefined) {
    if (data.pickupStopId !== existingStudent.pickupStopId) {
      modifiedFields.pickupStopId = { old: existingStudent.pickupStopId, new: data.pickupStopId || null };
    }
    updatePayload.pickupStopId = data.pickupStopId || null;
  }

  if (data.customData !== undefined) {
    const oldJson = JSON.stringify(existingStudent.customData);
    const newJson = JSON.stringify(data.customData);
    if (oldJson !== newJson) {
      modifiedFields.customData = { old: existingStudent.customData, new: data.customData };
    }
    updatePayload.customData = data.customData;
  }

  // 5. No-op check: if no actual field values modified, return current record without DB write or audit log
  if (Object.keys(modifiedFields).length === 0) {
    return existingStudent;
  }

  const updated = await studentRepository.updateStudent(schoolId, studentId, updatePayload);

  // 6. Canonical AuditLog integration (non-blocking, post-update)
  await createAuditLog({
    schoolId,
    entityType: 'Student',
    entityId: studentId,
    actionPerformed: `UPDATE_STUDENT: ${updated.firstName}${updated.lastName ? ' ' + updated.lastName : ''}`,
    userName: actor?.email || actor?.userId || 'Administrator',
    userRole: actor?.systemRole || null,
    modifiedFields
  });

  return updated;
}

/**
 * Deletes a student within a tenant with PostgreSQL transactional concurrency protection.
 *
 * Concurrency & Serialization Model:
 * 1. Executes inside an interactive PostgreSQL transaction (prisma.$transaction).
 * 2. Acquires an exclusive row-level lock on the parent Student row using `SELECT ... FOR UPDATE` (tenant-scoped).
 *    - In PostgreSQL, `FOR UPDATE` is mutually exclusive with `FOR KEY SHARE` locks acquired
 *      during concurrent child record inserts across all relational tables.
 * 3. Authoritatively verifies student existence inside the lock. Throws NotFoundError if missing.
 * 4. Evaluates all 11 protected relational dependencies while holding the exclusive lock.
 * 5. If any dependency exists, transaction aborts immediately with ConflictError, rolling back
 *    and ensuring no accidental cascade deletion occurs.
 * 6. Only when 0 dependencies exist does the Student delete execute.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} studentId - Student UUID
 * @param {Object} [actor] - Context of requesting user
 * @returns {Promise<void>}
 */
export async function deleteStudent(schoolId, studentId, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to delete student');
  }

  // Pre-transaction check (fast-path rejection)
  const existingStudent = await studentRepository.findStudentById(schoolId, studentId);
  if (!existingStudent) {
    throw new NotFoundError('Student');
  }

  // Execute safe transactional deletion with explicit row-level locking
  const deletedSnapshot = await prisma.$transaction(async (tx) => {
    // 1. Authoritatively lock the student row exclusively within tenant context
    const lockedStudent = await studentRepository.findStudentByIdForUpdate(schoolId, studentId, tx);
    if (!lockedStudent) {
      throw new NotFoundError('Student');
    }

    // 2. Count dependencies while holding the exclusive lock
    const deps = await studentRepository.countStudentDependencies(schoolId, studentId, tx);

    if (deps.invoices > 0) {
      throw new ConflictError('Cannot delete student with associated billing invoices');
    }
    if (deps.attendanceRecords > 0) {
      throw new ConflictError('Cannot delete student with recorded attendance records');
    }
    if (deps.attendanceStats > 0) {
      throw new ConflictError('Cannot delete student with attendance statistics');
    }
    if (deps.absenteeFlags > 0) {
      throw new ConflictError('Cannot delete student with absentee flags');
    }
    if (deps.assessmentGrades > 0) {
      throw new ConflictError('Cannot delete student with examination assessment grades');
    }
    if (deps.reportCards > 0) {
      throw new ConflictError('Cannot delete student with generated report cards');
    }
    if (deps.homeworkSubmissions > 0) {
      throw new ConflictError('Cannot delete student with submitted homework');
    }
    if (deps.bookIssues > 0) {
      throw new ConflictError('Cannot delete student with library book issue records');
    }
    if (deps.chatRooms > 0) {
      throw new ConflictError('Cannot delete student with active chat rooms');
    }
    if (deps.ptmAppointments > 0) {
      throw new ConflictError('Cannot delete student with parent-teacher meeting appointments');
    }
    if (deps.canteenRequests > 0) {
      throw new ConflictError('Cannot delete student with canteen requests');
    }

    // 3. Delete the student row inside transaction
    await studentRepository.deleteStudent(schoolId, studentId, tx);

    return lockedStudent;
  });

  // Canonical AuditLog integration (non-blocking, post-transaction)
  await createAuditLog({
    schoolId,
    entityType: 'Student',
    entityId: studentId,
    actionPerformed: `DELETE_STUDENT: ${deletedSnapshot.firstName}${deletedSnapshot.lastName ? ' ' + deletedSnapshot.lastName : ''}`,
    userName: actor?.email || actor?.userId || 'Administrator',
    userRole: actor?.systemRole || null,
    modifiedFields: {
      deletedStudent: {
        id: deletedSnapshot.id,
        admissionNumber: deletedSnapshot.admissionNumber,
        firstName: deletedSnapshot.firstName,
        lastName: deletedSnapshot.lastName,
        status: deletedSnapshot.status
      }
    }
  });
}
