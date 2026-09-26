import * as subjectRepository from './subject.repository.js';
import { createAuditLog } from '../audit/audit.repository.js';
import { prisma } from '../../database/prisma.client.js';
import {
  NotFoundError,
  ConflictError,
  TenantAccessError
} from '../../utils/app-error.js';
import { parsePagination, buildPaginationMetadata } from '../../utils/pagination.js';

/**
 * Subject Business Logic Service Layer
 *
 * Enforces:
 * - Strict tenant boundaries
 * - Unique subject name and code constraints
 * - Concurrency-safe dependency guards against cascading data loss
 * - Canonical non-blocking AuditLog generation for mutations
 */

/**
 * Lists subjects with pagination, searching, and filtering.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} query - Express request query
 * @returns {Promise<{ subjects: Array, pagination: Object }>}
 */
export async function listSubjects(schoolId, query = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to list subjects');
  }

  const paginationParams = parsePagination(query, {
    defaultSort: 'name',
    defaultOrder: 'asc'
  });

  const options = {
    search: query.search ? query.search.trim() : undefined,
    code: query.code ? query.code.trim() : undefined,
    skip: paginationParams.skip,
    take: paginationParams.take,
    sort: paginationParams.sort,
    order: paginationParams.order
  };

  const [subjects, total] = await Promise.all([
    subjectRepository.findSubjects(schoolId, options),
    subjectRepository.countSubjects(schoolId, options)
  ]);

  const pagination = buildPaginationMetadata(total, paginationParams.page, paginationParams.limit);

  return { subjects, pagination };
}

/**
 * Retrieves a single subject by ID within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} subjectId - Subject UUID
 * @returns {Promise<Object>}
 */
export async function getSubjectById(schoolId, subjectId) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to retrieve subject');
  }

  const subject = await subjectRepository.findSubjectById(schoolId, subjectId);
  if (!subject) {
    throw new NotFoundError('Subject');
  }

  return subject;
}

/**
 * Creates a new subject for a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} data - Creation payload
 * @param {Object} [actor] - Context of requesting user
 * @returns {Promise<Object>}
 */
export async function createSubject(schoolId, data, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to create subject');
  }

  const subjectName = data.name.trim();

  // 1. Prevent duplicate subject name within tenant (case-insensitive)
  const existingByName = await subjectRepository.findSubjectByName(schoolId, subjectName);
  if (existingByName) {
    throw new ConflictError(`Subject "${subjectName}" already exists in this institution`);
  }

  // 2. Prevent duplicate subject code within tenant if code provided
  const subjectCode = data.code ? data.code.trim() : null;
  if (subjectCode) {
    const existingByCode = await subjectRepository.findSubjectByCode(schoolId, subjectCode);
    if (existingByCode) {
      throw new ConflictError(`Subject code "${subjectCode}" is already in use in this institution`);
    }
  }

  const created = await subjectRepository.createSubject({
    schoolId,
    name: subjectName,
    code: subjectCode,
    credits: data.credits !== undefined ? data.credits : null
  });

  // 3. Canonical AuditLog integration (non-blocking, post-creation)
  await createAuditLog({
    schoolId,
    entityType: 'Subject',
    entityId: created.id,
    actionPerformed: `CREATE_SUBJECT: ${created.name}`,
    userName: actor?.email || actor?.userId || 'Administrator',
    userRole: actor?.systemRole || null,
    modifiedFields: {
      name: created.name,
      code: created.code,
      credits: created.credits !== null && created.credits !== undefined ? Number(created.credits) : null
    }
  });

  return created;
}

/**
 * Updates a subject within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} subjectId - Subject UUID
 * @param {Object} data - Update payload
 * @param {Object} [actor] - Context of requesting user
 * @returns {Promise<Object>}
 */
export async function updateSubject(schoolId, subjectId, data, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to update subject');
  }

  const existingSubject = await subjectRepository.findSubjectById(schoolId, subjectId);
  if (!existingSubject) {
    throw new NotFoundError('Subject');
  }

  const updatePayload = {};
  const modifiedFields = {};

  // 1. Name validation & duplicate check
  if (data.name !== undefined) {
    const newName = data.name.trim();
    if (newName.toLowerCase() !== existingSubject.name.toLowerCase()) {
      const duplicate = await subjectRepository.findSubjectByName(schoolId, newName);
      if (duplicate && duplicate.id !== subjectId) {
        throw new ConflictError(`Subject "${newName}" already exists in this institution`);
      }
      modifiedFields.name = { old: existingSubject.name, new: newName };
    }
    updatePayload.name = newName;
  }

  // 2. Code validation & duplicate check
  if (data.code !== undefined) {
    const newCode = data.code ? data.code.trim() : null;
    if (newCode !== existingSubject.code) {
      if (newCode) {
        const duplicate = await subjectRepository.findSubjectByCode(schoolId, newCode);
        if (duplicate && duplicate.id !== subjectId) {
          throw new ConflictError(`Subject code "${newCode}" is already in use in this institution`);
        }
      }
      modifiedFields.code = { old: existingSubject.code, new: newCode };
    }
    updatePayload.code = newCode;
  }

  // 3. Credits validation
  if (data.credits !== undefined) {
    const existingCreditsNum = existingSubject.credits !== null && existingSubject.credits !== undefined
      ? Number(existingSubject.credits)
      : null;
    const newCreditsNum = data.credits !== null && data.credits !== undefined
      ? Number(data.credits)
      : null;

    if (existingCreditsNum !== newCreditsNum) {
      modifiedFields.credits = { old: existingCreditsNum, new: newCreditsNum };
    }
    updatePayload.credits = data.credits;
  }

  const updated = await subjectRepository.updateSubject(schoolId, subjectId, updatePayload);

  // 4. Canonical AuditLog integration (non-blocking, post-update)
  if (Object.keys(modifiedFields).length > 0) {
    await createAuditLog({
      schoolId,
      entityType: 'Subject',
      entityId: subjectId,
      actionPerformed: `UPDATE_SUBJECT: ${updated.name}`,
      userName: actor?.email || actor?.userId || 'Administrator',
      userRole: actor?.systemRole || null,
      modifiedFields
    });
  }

  return updated;
}

/**
 * Deletes a subject within a tenant with PostgreSQL transactional concurrency protection.
 *
 * Concurrency & Serialization Model:
 * 1. Executes inside an interactive PostgreSQL transaction (prisma.$transaction).
 * 2. Acquires an exclusive row-level lock on the parent Subject row using `SELECT ... FOR UPDATE` (tenant-scoped).
 *    - In PostgreSQL, `FOR UPDATE` is mutually exclusive with `FOR KEY SHARE` locks acquired
 *      during concurrent child record inserts (Assessment, HomeworkAssignment, LessonPlan, etc.).
 * 3. Authoritatively verifies subject existence inside the lock. Throws NotFoundError if missing.
 * 4. Evaluates all 5 protected relational dependencies while holding the exclusive lock.
 * 5. If any dependency exists, transaction aborts immediately with ConflictError, rolling back
 *    and ensuring no accidental cascade deletion occurs.
 * 6. Only when 0 dependencies exist does the Subject delete execute.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} subjectId - Subject UUID
 * @param {Object} [actor] - Context of requesting user
 * @returns {Promise<void>}
 */
export async function deleteSubject(schoolId, subjectId, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to delete subject');
  }

  // Pre-transaction check (fast-path rejection)
  const existingSubject = await subjectRepository.findSubjectById(schoolId, subjectId);
  if (!existingSubject) {
    throw new NotFoundError('Subject');
  }

  // Execute safe transactional deletion with explicit row-level locking
  const deletedSnapshot = await prisma.$transaction(async (tx) => {
    // 1. Authoritatively lock the subject row exclusively within tenant context
    const lockedSubject = await subjectRepository.findSubjectByIdForUpdate(schoolId, subjectId, tx);
    if (!lockedSubject) {
      throw new NotFoundError('Subject');
    }

    // 2. Count dependencies while holding the exclusive lock
    const deps = await subjectRepository.countSubjectDependencies(schoolId, subjectId, tx);

    if (deps.assessments > 0) {
      throw new ConflictError('Cannot delete subject with existing examination assessments');
    }
    if (deps.homeworkAssignments > 0) {
      throw new ConflictError('Cannot delete subject with active homework assignments');
    }
    if (deps.lessonPlans > 0) {
      throw new ConflictError('Cannot delete subject with associated lesson plans');
    }
    if (deps.timetablePeriods > 0) {
      throw new ConflictError('Cannot delete subject with active timetable periods');
    }
    if (deps.academicResources > 0) {
      throw new ConflictError('Cannot delete subject with linked academic resources');
    }

    // 3. Delete the subject row inside transaction
    await subjectRepository.deleteSubject(schoolId, subjectId, tx);

    return lockedSubject;
  });

  // Canonical AuditLog integration (non-blocking, post-transaction)
  await createAuditLog({
    schoolId,
    entityType: 'Subject',
    entityId: subjectId,
    actionPerformed: `DELETE_SUBJECT: ${deletedSnapshot.name}`,
    userName: actor?.email || actor?.userId || 'Administrator',
    userRole: actor?.systemRole || null,
    modifiedFields: {
      deletedSubject: {
        id: deletedSnapshot.id,
        name: deletedSnapshot.name,
        code: deletedSnapshot.code,
        credits: deletedSnapshot.credits !== null && deletedSnapshot.credits !== undefined ? Number(deletedSnapshot.credits) : null
      }
    }
  });
}

/**
 * High-performance bulk import for subjects.
 * Executes lookups and creations inside a single database transaction.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Array<{ name: string, code?: string }>} rows
 * @param {Object} [actor] - Context of requesting user
 * @returns {Promise<{ addedCount: number, skippedCount: number, totalRows: number }>}
 */
export async function bulkImportSubjects(schoolId, rows = [], actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required for bulk import');
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return { addedCount: 0, skippedCount: 0, totalRows: 0 };
  }

  let addedCount = 0;
  let skippedCount = 0;

  await prisma.$transaction(async (tx) => {
    const existingSubjects = await tx.subject.findMany({
      where: { schoolId },
      select: { name: true, code: true }
    });

    const existingNames = new Set(
      existingSubjects
        .filter(s => s.name)
        .map(s => String(s.name).trim().toLowerCase())
    );

    const existingCodes = new Set(
      existingSubjects
        .filter(s => s.code && String(s.code).trim().length > 0)
        .map(s => String(s.code).trim().toLowerCase())
    );

    const newSubjectRecords = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      let name = String(row?.name || '').trim();
      let codeRaw = row?.code !== undefined && row?.code !== null ? String(row.code).trim() : '';
      let code = codeRaw.length > 0 ? codeRaw : null;

      if (!name) {
        skippedCount++;
        continue;
      }

      if (name.length > 100) {
        name = name.slice(0, 100).trim();
      }
      if (code && code.length > 50) {
        code = code.slice(0, 50).trim();
      }

      const nameLower = name.toLowerCase();
      const codeLower = code ? code.toLowerCase() : null;

      if (existingNames.has(nameLower) || (codeLower && existingCodes.has(codeLower))) {
        skippedCount++;
        continue;
      }

      newSubjectRecords.push({
        schoolId,
        name,
        code
      });

      existingNames.add(nameLower);
      if (codeLower) {
        existingCodes.add(codeLower);
      }
      addedCount++;
    }

    if (newSubjectRecords.length > 0) {
      await tx.subject.createMany({
        data: newSubjectRecords
      });
    }
  }, {
    timeout: 30000,
    maxWait: 10000
  });

  await createAuditLog({
    schoolId,
    entityType: 'Subject',
    entityId: schoolId,
    actionPerformed: `BULK_IMPORT_SUBJECTS: Imported ${addedCount} subjects`,
    userName: actor?.email || actor?.userId || 'Administrator',
    userRole: actor?.systemRole || null,
    modifiedFields: {
      addedCount,
      skippedCount,
      totalRows: rows.length
    }
  }).catch(err => console.warn('AuditLog failed during subject bulk import:', err));

  return {
    addedCount,
    skippedCount,
    totalRows: rows.length
  };
}

