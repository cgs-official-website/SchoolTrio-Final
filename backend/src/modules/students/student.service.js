import * as studentRepository from './student.repository.js';
import { createAuditLog } from '../audit/audit.repository.js';
import { prisma, basePrisma } from '../../database/prisma.client.js';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
  TenantAccessError
} from '../../utils/app-error.js';
import { parsePagination, buildPaginationMetadata } from '../../utils/pagination.js';
import { syncStudentClassFeeInvoices } from '../fees/fee.service.js';

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
    defaultOrder: 'asc',
    maxLimit: 1000
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

  // Automatically generate invoices for active fee structures in this class
  if (created.classId) {
    syncStudentClassFeeInvoices(schoolId, created.id, created.classId).catch(() => {});
  }

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

  // If class was updated, sync fee structures for the new class
  if (data.classId && data.classId !== existingStudent.classId) {
    syncStudentClassFeeInvoices(schoolId, studentId, data.classId).catch(() => {});
  }

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

/**
 * High-performance batch bulk import for students.
 * Processes an array of student payloads (up to 100 per call) in an atomic transaction.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Array<Object>} studentsPayload - List of student creation payloads
 * @param {Object} [actor] - Context of requesting user
 * @returns {Promise<Object>} Summary of created, updated, and failed students
 */
export async function bulkImportStudents(schoolId, studentsPayload = [], actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required for bulk import');
  }

  if (!Array.isArray(studentsPayload) || studentsPayload.length === 0) {
    throw new ValidationError('Bulk import payload must contain at least one student object');
  }

  // 1. Capacity limit check
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { plan: true, seatLimit: true }
  });

  const planStr = typeof school?.plan === 'string' ? school.plan : (school?.plan?.name || '');
  const effectiveSeatLimit = school?.seatLimit || (
    planStr.toLowerCase() === 'enterprise' ? 2000 :
    planStr.toLowerCase() === 'basic' ? 100 : 500
  );


  const currentCount = await prisma.student.count({
    where: { schoolId }
  });

  if (currentCount >= effectiveSeatLimit) {
    throw new ValidationError(`School student capacity limit of ${effectiveSeatLimit} seats reached`);
  }

  // Preload unique class IDs and matching fee structures for batch
  const uniqueClassIds = Array.from(new Set(studentsPayload.map(s => s.classId).filter(Boolean)));
  const admissionNumbers = studentsPayload.map(s => s.admissionNumber).filter(Boolean);

  const [existingStudents, feeStructures] = await Promise.all([
    prisma.student.findMany({
      where: {
        schoolId,
        admissionNumber: { in: admissionNumbers, mode: 'insensitive' }
      }
    }),
    uniqueClassIds.length > 0
      ? prisma.feeStructure.findMany({
          where: { schoolId, classId: { in: uniqueClassIds } }
        })
      : Promise.resolve([])
  ]);

  const existingMap = new Map(existingStudents.map(s => [s.admissionNumber.toLowerCase(), s]));

  // In-memory fee structure map: classId -> FeeStructure[]
  const feeStructureMap = new Map();
  for (const fs of feeStructures) {
    if (!feeStructureMap.has(fs.classId)) {
      feeStructureMap.set(fs.classId, []);
    }
    feeStructureMap.get(fs.classId).push(fs);
  }

  const resultStudents = [];
  const newlyCreatedStudents = [];
  const toCreatePayloads = [];
  const toUpdateItems = [];
  let createdCount = 0;
  let updatedCount = 0;
  const errors = [];

  // 2. Perform atomic batch transaction with 30s timeout option
  await basePrisma.$transaction(async (tx) => {
    for (let i = 0; i < studentsPayload.length; i++) {
      const data = studentsPayload[i];
      const admissionNumber = data.admissionNumber?.trim();
      if (!admissionNumber || !data.firstName?.trim()) {
        errors.push({ index: i, admissionNumber, message: 'Missing required admission number or first name' });
        continue;
      }

      const lowerAdm = admissionNumber.toLowerCase();
      const existing = existingMap.get(lowerAdm);

      const studentData = {
        schoolId,
        admissionNumber,
        firstName: data.firstName.trim(),
        lastName: data.lastName ? data.lastName.trim() : (existing?.lastName || null),
        dob: data.dob || (existing?.dob || null),
        gender: data.gender ? data.gender.trim() : (existing?.gender || null),
        bloodGroup: data.bloodGroup || (existing?.bloodGroup || null),
        aadhaarNumber: data.aadhaarNumber ? data.aadhaarNumber.trim() : (existing?.aadhaarNumber || null),
        photoUrl: data.photoUrl ? data.photoUrl.trim() : (existing?.photoUrl || null),
        rollNumber: data.rollNumber ? data.rollNumber.trim() : (existing?.rollNumber || null),
        classId: data.classId || (existing?.classId || null),
        sectionId: data.sectionId || (existing?.sectionId || null),
        transportRouteId: data.transportRouteId || (existing?.transportRouteId || null),
        pickupStopId: data.pickupStopId || (existing?.pickupStopId || null),
        status: data.status || (existing?.status || 'Active'),
        customData: data.customData ? { ...(existing?.customData || {}), ...data.customData } : (existing?.customData || {})
      };

      if (existing) {
        const updateData = {};
        const newFirstName = data.firstName.trim();
        if (newFirstName !== existing.firstName) updateData.firstName = newFirstName;

        const newLastName = data.lastName ? data.lastName.trim() : null;
        if (newLastName !== (existing.lastName || null)) updateData.lastName = newLastName;

        const existingDobStr = existing.dob ? new Date(existing.dob).toISOString().split('T')[0] : null;
        const newDobStr = data.dob ? new Date(data.dob).toISOString().split('T')[0] : null;
        if (newDobStr !== existingDobStr) updateData.dob = data.dob ? new Date(data.dob) : null;

        const newGender = data.gender ? data.gender.trim() : null;
        if (newGender !== (existing.gender || null)) updateData.gender = newGender;

        const newBloodGroup = data.bloodGroup || null;
        if (newBloodGroup !== (existing.bloodGroup || null)) updateData.bloodGroup = newBloodGroup;

        const newAadhaar = data.aadhaarNumber ? data.aadhaarNumber.trim() : null;
        if (newAadhaar !== (existing.aadhaarNumber || null)) updateData.aadhaarNumber = newAadhaar;

        const newPhotoUrl = data.photoUrl ? data.photoUrl.trim() : null;
        if (newPhotoUrl !== (existing.photoUrl || null)) updateData.photoUrl = newPhotoUrl;

        const newRollNumber = data.rollNumber ? data.rollNumber.trim() : null;
        if (newRollNumber !== (existing.rollNumber || null)) updateData.rollNumber = newRollNumber;

        const newClassId = data.classId || null;
        if (newClassId !== (existing.classId || null)) updateData.classId = newClassId;

        const newSectionId = data.sectionId || null;
        if (newSectionId !== (existing.sectionId || null)) updateData.sectionId = newSectionId;

        const newTransportRouteId = data.transportRouteId || null;
        if (newTransportRouteId !== (existing.transportRouteId || null)) updateData.transportRouteId = newTransportRouteId;

        const newPickupStopId = data.pickupStopId || null;
        if (newPickupStopId !== (existing.pickupStopId || null)) updateData.pickupStopId = newPickupStopId;

        const newStatus = data.status || 'Active';
        if (newStatus !== (existing.status || 'Active')) updateData.status = newStatus;

        if (data.customData) {
          const mergedCustomData = { ...(existing.customData || {}), ...data.customData };
          if (JSON.stringify(mergedCustomData) !== JSON.stringify(existing.customData || {})) {
            updateData.customData = mergedCustomData;
          }
        }

        if (Object.keys(updateData).length > 0) {
          toUpdateItems.push({ id: existing.id, data: updateData });
        } else {
          resultStudents.push(existing);
          updatedCount++;
        }
      } else {
        if ((currentCount + createdCount) >= effectiveSeatLimit) {
          errors.push({ index: i, admissionNumber, message: 'Capacity limit reached' });
          continue;
        }
        toCreatePayloads.push(studentData);
        createdCount++;
      }
    }

    if (toUpdateItems.length > 0) {
      const updatedList = await Promise.all(
        toUpdateItems.map(item => studentRepository.updateStudentForBulk(schoolId, item.id, item.data, tx))
      );
      for (const updated of updatedList) {
        resultStudents.push(updated);
      }
      updatedCount += updatedList.length;
    }

    if (toCreatePayloads.length > 0) {
      const createdList = await studentRepository.createStudentsInBulk(toCreatePayloads, tx);
      for (const created of createdList) {
        resultStudents.push(created);
        newlyCreatedStudents.push(created);
      }
    }

    // Batch Invoice Synchronization for newly created students
    if (newlyCreatedStudents.length > 0 && feeStructureMap.size > 0) {
      const invoicePayloads = [];
      for (const st of newlyCreatedStudents) {
        if (!st.classId) continue;
        const matchingStructures = feeStructureMap.get(st.classId) || [];
        for (const fs of matchingStructures) {
          invoicePayloads.push({
            schoolId,
            studentId: st.id,
            feeStructureId: fs.id,
            collectionPeriodId: fs.collectionPeriodId || null,
            feeName: fs.name,
            amount: fs.amount,
            dueDate: fs.dueDate,
            status: 'Pending',
            customData: fs.customData ?? null
          });
        }
      }

      if (invoicePayloads.length > 0) {
        await tx.invoice.createMany({
          data: invoicePayloads,
          skipDuplicates: true
        });
      }
    }
  }, { timeout: 30000, maxWait: 10000 });

  // Canonical non-blocking AuditLog
  createAuditLog({
    schoolId,
    entityType: 'Student',
    entityId: schoolId,
    actionPerformed: `BULK_IMPORT_STUDENTS: ${createdCount} created, ${updatedCount} updated`,
    userName: actor?.email || actor?.userId || 'Administrator',
    userRole: actor?.systemRole || null,
    modifiedFields: {
      createdCount,
      updatedCount,
      failedCount: errors.length
    }
  }).catch(() => {});

  return {
    success: true,
    totalProcessed: resultStudents.length,
    createdCount,
    updatedCount,
    failedCount: errors.length,
    students: resultStudents,
    errors
  };
}


