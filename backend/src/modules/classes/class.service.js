import * as classRepository from './class.repository.js';
import { createAuditLog } from '../audit/audit.repository.js';
import { prisma } from '../../database/prisma.client.js';
import {
  NotFoundError,
  ConflictError,
  RelationshipConflictError,
  TenantAccessError
} from '../../utils/app-error.js';
import { parsePagination, buildPaginationMetadata } from '../../utils/pagination.js';

/**
 * Class and Section Business Logic Service Layer
 *
 * Enforces:
 * - Strict tenant boundaries
 * - Unique naming constraints
 * - Relational integrity verification (Category, StaffProfile)
 * - Safe atomic transactions for Class + Section creation
 * - Safe dependency guards for Class and Section deletion
 * - Bi-directional atomic Class Teacher synchronization
 * - Non-blocking canonical AuditLog generation for mutations
 */

/**
 * Lists classes with pagination, searching, and filtering.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} query - Express request query
 * @returns {Promise<{ classes: Array, pagination: Object }>}
 */
export async function listClasses(schoolId, query = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to list classes');
  }

  const paginationParams = parsePagination(query, {
    defaultSort: 'name',
    defaultOrder: 'asc'
  });

  const options = {
    search: query.search ? query.search.trim() : undefined,
    categoryId: query.categoryId ? query.categoryId.trim() : undefined,
    hasTeacher: query.hasTeacher !== undefined ? query.hasTeacher === 'true' : undefined,
    skip: paginationParams.skip,
    take: paginationParams.take,
    sort: paginationParams.sort,
    order: paginationParams.order
  };

  const [classes, total] = await Promise.all([
    classRepository.findClasses(schoolId, options),
    classRepository.countClasses(schoolId, options)
  ]);

  const pagination = buildPaginationMetadata(total, paginationParams.page, paginationParams.limit);

  return { classes, pagination };
}

/**
 * Retrieves a single class by ID within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} classId - Class UUID
 * @returns {Promise<Object>}
 */
export async function getClassById(schoolId, classId) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to retrieve class');
  }

  const classRecord = await classRepository.findClassById(schoolId, classId);
  if (!classRecord) {
    throw new NotFoundError('Class');
  }

  return classRecord;
}

/**
 * Creates a new class with optional default section and class teacher assignment.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} data - Class creation payload
 * @param {Object} [actor] - Context of requesting user
 * @returns {Promise<Object>}
 */
export async function createClass(schoolId, data, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to create class');
  }

  const className = data.name.trim();

  // 1. Verify Category ownership if provided
  if (data.categoryId) {
    const category = await classRepository.findCategoryById(schoolId, data.categoryId);
    if (!category) {
      throw new RelationshipConflictError('Referenced class category does not exist in this institution');
    }
  }

  // 2. Verify StaffProfile ownership & active status if provided
  if (data.classTeacherId) {
    const staff = await classRepository.findStaffProfileById(schoolId, data.classTeacherId);
    if (!staff) {
      throw new RelationshipConflictError('Referenced staff profile does not exist in this institution');
    }
    if (staff.status && staff.status.toLowerCase() !== 'active') {
      throw new ConflictError('Cannot assign an inactive staff member as class teacher');
    }
  }

  // 3. Prevent duplicate class name within tenant
  const existingClass = await classRepository.findClassByName(schoolId, className);
  if (existingClass) {
    throw new ConflictError(`Class "${className}" already exists in this institution`);
  }

  // 4. Atomic creation with optional default section and class teacher sync
  const created = await prisma.$transaction(async (tx) => {
    // If a class teacher is assigned, clear any prior class assignment
    if (data.classTeacherId) {
      const staff = await classRepository.findStaffProfileById(schoolId, data.classTeacherId, tx);
      if (staff?.assignedClassId) {
        await classRepository.clearClassTeacherOnClass(schoolId, staff.assignedClassId, tx);
      }

      const prevClass = await classRepository.findClassByClassTeacherId(schoolId, data.classTeacherId, tx);
      if (prevClass) {
        await classRepository.clearClassTeacherOnClass(schoolId, prevClass.id, tx);
      }
    }

    const createdClass = await classRepository.createClass(
      {
        schoolId,
        name: className,
        categoryId: data.categoryId || null,
        gradeLevel: data.gradeLevel !== undefined ? data.gradeLevel : null,
        classTeacherId: data.classTeacherId || null
      },
      tx
    );

    if (data.defaultSection && data.defaultSection.trim()) {
      const normalizedSection = data.defaultSection.trim().toUpperCase();
      await classRepository.createSection(
        {
          schoolId,
          classId: createdClass.id,
          name: normalizedSection
        },
        tx
      );
    }

    if (data.classTeacherId) {
      await classRepository.updateStaffAssignedClass(schoolId, data.classTeacherId, createdClass.id, tx);
    }

    return classRepository.findClassById(schoolId, createdClass.id, tx);
  });

  // 5. Canonical AuditLog integration (non-blocking, post-transaction)
  await createAuditLog({
    schoolId,
    entityType: 'Class',
    entityId: created.id,
    actionPerformed: `CREATE_CLASS: ${created.name}`,
    userName: actor?.email || actor?.userId || 'Administrator',
    userRole: actor?.systemRole || null,
    modifiedFields: {
      name: created.name,
      categoryId: created.categoryId || null,
      gradeLevel: created.gradeLevel !== null && created.gradeLevel !== undefined ? created.gradeLevel : null,
      classTeacherId: created.classTeacherId || null,
      defaultSection: data.defaultSection ? data.defaultSection.trim().toUpperCase() : null
    }
  });

  return created;
}

/**
 * Updates a class within a tenant and synchronizes class teacher assignments.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} classId - Class UUID
 * @param {Object} data - Update payload
 * @param {Object} [actor] - Context of requesting user
 * @returns {Promise<Object>}
 */
export async function updateClass(schoolId, classId, data, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to update class');
  }

  const existingClass = await classRepository.findClassById(schoolId, classId);
  if (!existingClass) {
    throw new NotFoundError('Class');
  }

  const updatePayload = {};
  const modifiedFields = {};

  // 1. Name validation & duplicate check
  if (data.name !== undefined) {
    const newName = data.name.trim();
    if (newName.toLowerCase() !== existingClass.name.toLowerCase()) {
      const duplicate = await classRepository.findClassByName(schoolId, newName);
      if (duplicate && duplicate.id !== classId) {
        throw new ConflictError(`Class "${newName}" already exists in this institution`);
      }
      modifiedFields.name = { old: existingClass.name, new: newName };
    }
    updatePayload.name = newName;
  }

  // 2. Category validation
  if (data.categoryId !== undefined) {
    if (data.categoryId !== null) {
      const category = await classRepository.findCategoryById(schoolId, data.categoryId);
      if (!category) {
        throw new RelationshipConflictError('Referenced class category does not exist in this institution');
      }
      if (data.categoryId !== existingClass.categoryId) {
        modifiedFields.categoryId = { old: existingClass.categoryId, new: data.categoryId };
      }
      updatePayload.categoryId = data.categoryId;
    } else {
      if (existingClass.categoryId !== null) {
        modifiedFields.categoryId = { old: existingClass.categoryId, new: null };
      }
      updatePayload.categoryId = null;
    }
  }

  // 3. Grade Level
  if (data.gradeLevel !== undefined) {
    if (data.gradeLevel !== existingClass.gradeLevel) {
      modifiedFields.gradeLevel = { old: existingClass.gradeLevel, new: data.gradeLevel };
    }
    updatePayload.gradeLevel = data.gradeLevel;
  }

  // 4. Class Teacher validation
  if (data.classTeacherId !== undefined) {
    if (data.classTeacherId !== null) {
      const staff = await classRepository.findStaffProfileById(schoolId, data.classTeacherId);
      if (!staff) {
        throw new RelationshipConflictError('Referenced staff profile does not exist in this institution');
      }
      if (staff.status && staff.status.toLowerCase() !== 'active') {
        throw new ConflictError('Cannot assign an inactive staff member as class teacher');
      }
      updatePayload.classTeacherId = data.classTeacherId;
    } else {
      updatePayload.classTeacherId = null;
    }

    // Determine teacher audit diff
    const oldTeacherId = existingClass.classTeacherId;
    const newTeacherId = data.classTeacherId;
    if (newTeacherId && !oldTeacherId) {
      modifiedFields.classTeacherId = { old: null, new: newTeacherId };
      modifiedFields.teacherAction = 'ASSIGNED';
    } else if (!newTeacherId && oldTeacherId) {
      modifiedFields.classTeacherId = { old: oldTeacherId, new: null };
      modifiedFields.teacherAction = 'REMOVED';
    } else if (newTeacherId && oldTeacherId && newTeacherId !== oldTeacherId) {
      modifiedFields.classTeacherId = { old: oldTeacherId, new: newTeacherId };
      modifiedFields.teacherAction = 'REASSIGNED';
    }
  }

  // 5. Execute transactional update with teacher synchronization
  const updated = await prisma.$transaction(async (tx) => {
    if (data.classTeacherId !== undefined) {
      const oldTeacherId = existingClass.classTeacherId;
      const newTeacherId = data.classTeacherId;

      if (newTeacherId && newTeacherId !== oldTeacherId) {
        // 1. Fetch current staff state inside transaction (with lock)
        const staff = await classRepository.findStaffProfileById(schoolId, newTeacherId, tx);

        // 2. If staff was assigned to another class (via assignedClassId), clear that class
        if (staff?.assignedClassId && staff.assignedClassId !== classId) {
          await classRepository.clearClassTeacherOnClass(schoolId, staff.assignedClassId, tx);
        }

        // 3. Clear any other class that had this new teacher assigned via classTeacherId
        const prevClassForNewTeacher = await classRepository.findClassByClassTeacherId(schoolId, newTeacherId, tx);
        if (prevClassForNewTeacher && prevClassForNewTeacher.id !== classId) {
          await classRepository.clearClassTeacherOnClass(schoolId, prevClassForNewTeacher.id, tx);
        }

        // 4. Clear previous teacher's assignedClassId if exists
        if (oldTeacherId) {
          await classRepository.updateStaffAssignedClass(schoolId, oldTeacherId, null, tx);
        }

        // 5. Assign new teacher
        await classRepository.updateStaffAssignedClass(schoolId, newTeacherId, classId, tx);
      } else if (newTeacherId === null && oldTeacherId) {
        // Teacher unassignment
        await classRepository.updateStaffAssignedClass(schoolId, oldTeacherId, null, tx);
      }
    }

    await classRepository.updateClass(schoolId, classId, updatePayload, tx);

    return classRepository.findClassById(schoolId, classId, tx);
  });

  // 6. Canonical AuditLog integration (non-blocking, post-transaction)
  if (Object.keys(modifiedFields).length > 0) {
    await createAuditLog({
      schoolId,
      entityType: 'Class',
      entityId: classId,
      actionPerformed: `UPDATE_CLASS: ${updated.name}`,
      userName: actor?.email || actor?.userId || 'Administrator',
      userRole: actor?.systemRole || null,
      modifiedFields
    });
  }

  return updated;
}

/**
 * Deletes a class within a tenant after verifying all blocking dependencies.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} classId - Class UUID
 * @param {Object} [actor] - Context of requesting user
 * @returns {Promise<void>}
 */
export async function deleteClass(schoolId, classId, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to delete class');
  }

  const existingClass = await classRepository.findClassById(schoolId, classId);
  if (!existingClass) {
    throw new NotFoundError('Class');
  }

  // Check all blocking dependencies
  const deps = await classRepository.countClassDependencies(schoolId, classId);

  if (deps.students > 0) {
    throw new ConflictError('Cannot delete class with assigned students');
  }
  if (deps.attendanceSessions > 0) {
    throw new ConflictError('Cannot delete class with historical attendance records');
  }
  if (deps.timetablePeriods > 0) {
    throw new ConflictError('Cannot delete class with active timetable schedules');
  }
  if (deps.feeStructures > 0) {
    throw new ConflictError('Cannot delete class with associated fee structures');
  }
  if (deps.assessments > 0) {
    throw new ConflictError('Cannot delete class with examination assessments');
  }
  if (deps.homeworkAssignments > 0) {
    throw new ConflictError('Cannot delete class with active homework assignments');
  }

  // Safe transactional deletion
  try {
    await prisma.$transaction(async (tx) => {
      // Clear class teacher link on StaffProfile if one was assigned
      if (existingClass.classTeacherId) {
        await classRepository.updateStaffAssignedClass(schoolId, existingClass.classTeacherId, null, tx);
      }

      // Delete child sections
      await classRepository.deleteSectionsByClassId(schoolId, classId, tx);

      // Delete the class
      await classRepository.deleteClass(schoolId, classId, tx);
    });
  } catch (error) {
    if (error.code === 'P2003') {
      throw new ConflictError('Cannot delete class because related records depend on it');
    }
    throw error;
  }

  // Canonical AuditLog integration (non-blocking, post-transaction)
  await createAuditLog({
    schoolId,
    entityType: 'Class',
    entityId: classId,
    actionPerformed: `DELETE_CLASS: ${existingClass.name}`,
    userName: actor?.email || actor?.userId || 'Administrator',
    userRole: actor?.systemRole || null,
    modifiedFields: {
      deletedClass: {
        id: existingClass.id,
        name: existingClass.name,
        gradeLevel: existingClass.gradeLevel,
        categoryId: existingClass.categoryId
      },
      deletedSectionsCount: existingClass.sections ? existingClass.sections.length : 0,
      unlinkedTeacherId: existingClass.classTeacherId || null
    }
  });
}

/**
 * Lists all sections for a class.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} classId - Class UUID
 * @returns {Promise<Array>}
 */
export async function listSections(schoolId, classId) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to list sections');
  }

  const classRecord = await classRepository.findClassById(schoolId, classId);
  if (!classRecord) {
    throw new NotFoundError('Class');
  }

  return classRepository.findSectionsByClassId(schoolId, classId);
}

/**
 * Creates a section within a class.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} classId - Class UUID
 * @param {Object} data - Section creation payload
 * @param {Object} [actor] - Context of requesting user
 * @returns {Promise<Object>}
 */
export async function createSection(schoolId, classId, data, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to create section');
  }

  const classRecord = await classRepository.findClassById(schoolId, classId);
  if (!classRecord) {
    throw new NotFoundError('Class');
  }

  const sectionName = data.name.trim().toUpperCase();

  const existingSection = await classRepository.findSectionByName(schoolId, classId, sectionName);
  if (existingSection) {
    throw new ConflictError(`Section "${sectionName}" already exists in this class`);
  }

  const createdSection = await classRepository.createSection({
    schoolId,
    classId,
    name: sectionName
  });

  // Canonical AuditLog integration (non-blocking, post-mutation)
  await createAuditLog({
    schoolId,
    entityType: 'Section',
    entityId: createdSection.id,
    actionPerformed: `CREATE_SECTION: ${classRecord.name} - Section ${createdSection.name}`,
    userName: actor?.email || actor?.userId || 'Administrator',
    userRole: actor?.systemRole || null,
    modifiedFields: {
      classId,
      className: classRecord.name,
      name: createdSection.name
    }
  });

  return createdSection;
}

/**
 * Updates a section within a class.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} classId - Class UUID
 * @param {string} sectionId - Section UUID
 * @param {Object} data - Update payload
 * @param {Object} [actor] - Context of requesting user
 * @returns {Promise<Object>}
 */
export async function updateSection(schoolId, classId, sectionId, data, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to update section');
  }

  const classRecord = await classRepository.findClassById(schoolId, classId);
  if (!classRecord) {
    throw new NotFoundError('Class');
  }

  const section = await classRepository.findSectionById(schoolId, classId, sectionId);
  if (!section) {
    throw new NotFoundError('Section');
  }

  const newName = data.name.trim().toUpperCase();
  let nameChanged = false;
  if (newName !== section.name) {
    const duplicate = await classRepository.findSectionByName(schoolId, classId, newName);
    if (duplicate && duplicate.id !== sectionId) {
      throw new ConflictError(`Section "${newName}" already exists in this class`);
    }
    nameChanged = true;
  }

  const updatedSection = await classRepository.updateSection(schoolId, sectionId, { name: newName });

  if (nameChanged) {
    await createAuditLog({
      schoolId,
      entityType: 'Section',
      entityId: sectionId,
      actionPerformed: `UPDATE_SECTION: ${classRecord.name} - Section ${newName}`,
      userName: actor?.email || actor?.userId || 'Administrator',
      userRole: actor?.systemRole || null,
      modifiedFields: {
        classId,
        className: classRecord.name,
        name: {
          old: section.name,
          new: newName
        }
      }
    });
  }

  return updatedSection;
}

/**
 * Deletes a section within a class after verifying all blocking dependencies.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} classId - Class UUID
 * @param {string} sectionId - Section UUID
 * @param {Object} [actor] - Context of requesting user
 * @returns {Promise<void>}
 */
export async function deleteSection(schoolId, classId, sectionId, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to delete section');
  }

  const classRecord = await classRepository.findClassById(schoolId, classId);
  if (!classRecord) {
    throw new NotFoundError('Class');
  }

  const section = await classRepository.findSectionById(schoolId, classId, sectionId);
  if (!section) {
    throw new NotFoundError('Section');
  }

  // Check all blocking dependencies for section
  const deps = await classRepository.countSectionDependencies(schoolId, sectionId);

  if (deps.students > 0) {
    throw new ConflictError('Cannot delete section with assigned students');
  }
  if (deps.attendanceSessions > 0) {
    throw new ConflictError('Cannot delete section with historical attendance records');
  }
  if (deps.timetablePeriods > 0) {
    throw new ConflictError('Cannot delete section with active timetable schedules');
  }

  try {
    await classRepository.deleteSection(schoolId, sectionId);
  } catch (error) {
    if (error.code === 'P2003') {
      throw new ConflictError('Cannot delete section because related records depend on it');
    }
    throw error;
  }

  // Canonical AuditLog integration (non-blocking, post-mutation)
  await createAuditLog({
    schoolId,
    entityType: 'Section',
    entityId: sectionId,
    actionPerformed: `DELETE_SECTION: ${classRecord.name} - Section ${section.name}`,
    userName: actor?.email || actor?.userId || 'Administrator',
    userRole: actor?.systemRole || null,
    modifiedFields: {
      deletedSection: {
        id: section.id,
        classId: classRecord.id,
        name: section.name
      }
    }
  });
}
