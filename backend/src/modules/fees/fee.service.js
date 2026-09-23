import { prisma } from '../../database/prisma.client.js';
import * as feeRepository from './fee.repository.js';
import { createAuditLog } from '../audit/audit.repository.js';
import {
  NotFoundError,
  ConflictError,
  RelationshipConflictError
} from '../../utils/app-error.js';

/**
 * Fee Collection Periods & Fee Structures Domain Business Service
 */

// ============================================================
// FEE COLLECTION PERIOD SERVICE METHODS
// ============================================================

/**
 * Lists fee collection periods for a school tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} query - Query options (page, limit, order, search)
 * @returns {Promise<{ periods: Array, pagination: Object }>}
 */
export async function listCollectionPeriods(schoolId, query = {}) {
  const { periods, total } = await feeRepository.findPeriods(schoolId, query);
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
  const totalPages = Math.ceil(total / limit) || 1;

  return {
    periods,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1
    }
  };
}

/**
 * Retrieves a single fee collection period by ID.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - Period UUID
 * @returns {Promise<Object>}
 */
export async function getCollectionPeriodById(schoolId, id) {
  const period = await feeRepository.findPeriodById(schoolId, id);
  if (!period) {
    throw new NotFoundError('Fee collection period');
  }
  return period;
}

/**
 * Creates a new fee collection period and records an audit log.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} data - Period payload (name, dueDate, displayOrder)
 * @param {Object} actor - Authenticated user context
 * @returns {Promise<Object>}
 */
export async function createCollectionPeriod(schoolId, data, actor) {
  const created = await feeRepository.createPeriod(schoolId, data);

  // Post-commit audit dispatch
  await createAuditLog({
    schoolId,
    entityType: 'FeeCollectionPeriod',
    entityId: created.id,
    actionPerformed: 'CREATE_FEE_COLLECTION_PERIOD',
    userName: actor?.email || actor?.name || 'Administrator',
    userRole: actor?.systemRole || actor?.role || null,
    modifiedFields: {
      name: created.name,
      dueDate: created.dueDate,
      displayOrder: created.displayOrder
    }
  });

  return created;
}

/**
 * Updates an existing fee collection period with no-op detection and row-level locking.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - Period UUID
 * @param {Object} data - Update payload
 * @param {Object} actor - Authenticated user context
 * @returns {Promise<Object>}
 */
export async function updateCollectionPeriod(schoolId, id, data, actor) {
  let updatedPeriod = null;
  let modifiedFields = null;

  await prisma.$transaction(async (tx) => {
    const existing = await feeRepository.findPeriodByIdForUpdate(schoolId, id, tx);
    if (!existing) {
      throw new NotFoundError('Fee collection period');
    }

    const changes = {};
    if (data.name !== undefined && data.name !== existing.name) {
      changes.name = { old: existing.name, new: data.name };
    }
    if (data.dueDate !== undefined && data.dueDate !== existing.dueDate) {
      changes.dueDate = { old: existing.dueDate, new: data.dueDate };
    }
    if (data.displayOrder !== undefined && data.displayOrder !== existing.displayOrder) {
      changes.displayOrder = { old: existing.displayOrder, new: data.displayOrder };
    }

    // No-op detection: if nothing changed, do not mutate database
    if (Object.keys(changes).length === 0) {
      updatedPeriod = existing;
      return;
    }

    modifiedFields = changes;
    updatedPeriod = await feeRepository.updatePeriod(schoolId, id, data, tx);
  });

  // Post-commit audit dispatch only if actual changes occurred
  if (modifiedFields) {
    await createAuditLog({
      schoolId,
      entityType: 'FeeCollectionPeriod',
      entityId: id,
      actionPerformed: 'UPDATE_FEE_COLLECTION_PERIOD',
      userName: actor?.email || actor?.name || 'Administrator',
      userRole: actor?.systemRole || actor?.role || null,
      modifiedFields
    });
  }

  return updatedPeriod;
}

/**
 * Deletes a fee collection period safely, verifying no references exist.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - Period UUID
 * @param {Object} actor - Authenticated user context
 * @returns {Promise<{ id: string, deleted: boolean }>}
 */
export async function deleteCollectionPeriod(schoolId, id, actor) {
  let deletedSnapshot = null;

  await prisma.$transaction(async (tx) => {
    const existing = await feeRepository.findPeriodByIdForUpdate(schoolId, id, tx);
    if (!existing) {
      throw new NotFoundError('Fee collection period');
    }

    const refs = await feeRepository.countPeriodReferences(schoolId, id, tx);
    if (refs.total > 0) {
      throw new RelationshipConflictError(
        'Cannot delete fee collection period because it is referenced by existing fee structures or invoices',
        { feeStructuresCount: refs.feeStructuresCount, invoicesCount: refs.invoicesCount }
      );
    }

    deletedSnapshot = existing;
    await feeRepository.deletePeriod(schoolId, id, tx);
  });

  // Post-commit audit dispatch
  await createAuditLog({
    schoolId,
    entityType: 'FeeCollectionPeriod',
    entityId: id,
    actionPerformed: 'DELETE_FEE_COLLECTION_PERIOD',
    userName: actor?.email || actor?.name || 'Administrator',
    userRole: actor?.systemRole || actor?.role || null,
    modifiedFields: {
      deletedRecord: {
        name: deletedSnapshot.name,
        dueDate: deletedSnapshot.dueDate,
        displayOrder: deletedSnapshot.displayOrder
      }
    }
  });

  return { id, deleted: true };
}

// ============================================================
// FEE STRUCTURE & INVOICE GENERATION SERVICE METHODS
// ============================================================

/**
 * Lists fee structures for a school tenant with pagination and filters.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} query - Query parameters
 * @returns {Promise<{ feeStructures: Array, pagination: Object }>}
 */
export async function listFeeStructures(schoolId, query = {}) {
  const { feeStructures, total } = await feeRepository.findFeeStructures(schoolId, query);
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
  const totalPages = Math.ceil(total / limit) || 1;

  return {
    feeStructures,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1
    }
  };
}

/**
 * Retrieves a single fee structure by ID.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - Fee structure UUID
 * @returns {Promise<Object>}
 */
export async function getFeeStructureById(schoolId, id) {
  const feeStructure = await feeRepository.findFeeStructureById(schoolId, id);
  if (!feeStructure) {
    throw new NotFoundError('Fee structure');
  }
  return feeStructure;
}

/**
 * Creates a FeeStructure and atomically generates initial invoices for active students in the target class.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} data - FeeStructure payload
 * @param {Object} actor - Authenticated user context
 * @returns {Promise<Object>}
 */
export async function createFeeStructure(schoolId, data, actor) {
  let createdFeeStructure = null;
  let generatedInvoicesCount = 0;

  // 1. Verify Class belongs to tenant
  const targetClass = await feeRepository.findClassInTenant(schoolId, data.classId);
  if (!targetClass) {
    throw new RelationshipConflictError('Target class does not exist in this school tenant');
  }

  // 2. Verify CollectionPeriod belongs to tenant (if provided)
  if (data.collectionPeriodId) {
    const period = await feeRepository.findPeriodById(schoolId, data.collectionPeriodId);
    if (!period) {
      throw new RelationshipConflictError('Fee collection period does not exist in this school tenant');
    }
  }

  await prisma.$transaction(async (tx) => {
    // 3. Create FeeStructure
    createdFeeStructure = await feeRepository.createFeeStructure(schoolId, data, tx);

    // 4. Identify eligible active students in the class
    const activeStudents = await feeRepository.findActiveStudentsByClass(schoolId, data.classId, tx);

    // 5. Check existing non-cancelled invoices to avoid duplicate generation
    const existingStudentIds = await feeRepository.findExistingInvoiceStudentIds(schoolId, createdFeeStructure.id, tx);
    const eligibleStudents = activeStudents.filter(s => !existingStudentIds.has(s.id));

    // 6. Generate snapshot invoices for eligible active students
    if (eligibleStudents.length > 0) {
      const invoicesToCreate = eligibleStudents.map(student => ({
        schoolId,
        studentId: student.id,
        feeStructureId: createdFeeStructure.id,
        collectionPeriodId: createdFeeStructure.collectionPeriodId || null,
        feeName: createdFeeStructure.name,
        amount: createdFeeStructure.amount,
        dueDate: createdFeeStructure.dueDate,
        status: 'Pending',
        customData: createdFeeStructure.customData ?? null
      }));

      const batchResult = await feeRepository.createInvoicesBatch(invoicesToCreate, tx);
      generatedInvoicesCount = batchResult.count;
    }
  }, { maxWait: 15000, timeout: 30000 });

  // Post-commit aggregate audit log dispatch
  await createAuditLog({
    schoolId,
    entityType: 'FeeStructure',
    entityId: createdFeeStructure.id,
    actionPerformed: 'CREATE_FEE_STRUCTURE',
    userName: actor?.email || actor?.name || 'Administrator',
    userRole: actor?.systemRole || actor?.role || null,
    modifiedFields: {
      name: createdFeeStructure.name,
      amount: createdFeeStructure.amount,
      dueDate: createdFeeStructure.dueDate,
      classId: createdFeeStructure.classId,
      collectionPeriodId: createdFeeStructure.collectionPeriodId,
      invoicesGenerated: generatedInvoicesCount
    }
  });

  return {
    ...createdFeeStructure,
    invoicesGenerated: generatedInvoicesCount
  };
}

/**
 * Updates a FeeStructure with no-op detection and strict financial snapshot preservation.
 * Existing issued invoices are NEVER mutated when a FeeStructure is updated.
 * Changing classId is rejected if invoices already exist.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - FeeStructure UUID
 * @param {Object} data - Update payload
 * @param {Object} actor - Authenticated user context
 * @returns {Promise<Object>}
 */
export async function updateFeeStructure(schoolId, id, data, actor) {
  let updatedFeeStructure = null;
  let modifiedFields = null;

  await prisma.$transaction(async (tx) => {
    // 1. Lock FeeStructure row
    const existing = await feeRepository.findFeeStructureByIdForUpdate(schoolId, id, tx);
    if (!existing) {
      throw new NotFoundError('Fee structure');
    }

    // 2. Class change safety check
    if (data.classId !== undefined && data.classId !== existing.classId) {
      const invoiceCount = await feeRepository.countFeeStructureInvoices(schoolId, id, tx);
      if (invoiceCount > 0) {
        throw new ConflictError('Cannot change class for fee structure with existing issued invoices');
      }

      const newClass = await feeRepository.findClassInTenant(schoolId, data.classId, tx);
      if (!newClass) {
        throw new RelationshipConflictError('Target class does not exist in this school tenant');
      }
    }

    // 3. Collection period verification
    if (data.collectionPeriodId !== undefined && data.collectionPeriodId !== existing.collectionPeriodId) {
      if (data.collectionPeriodId !== null) {
        const period = await feeRepository.findPeriodById(schoolId, data.collectionPeriodId, tx);
        if (!period) {
          throw new RelationshipConflictError('Fee collection period does not exist in this school tenant');
        }
      }
    }

    // 4. Detect changes for no-op evaluation
    const changes = {};
    if (data.name !== undefined && data.name !== existing.name) {
      changes.name = { old: existing.name, new: data.name };
    }
    if (data.amount !== undefined && Number(data.amount) !== Number(existing.amount)) {
      changes.amount = { old: Number(existing.amount), new: Number(data.amount) };
    }
    if (data.dueDate !== undefined && data.dueDate !== existing.dueDate) {
      changes.dueDate = { old: existing.dueDate, new: data.dueDate };
    }
    if (data.classId !== undefined && data.classId !== existing.classId) {
      changes.classId = { old: existing.classId, new: data.classId };
    }
    if (data.collectionPeriodId !== undefined && data.collectionPeriodId !== existing.collectionPeriodId) {
      changes.collectionPeriodId = { old: existing.collectionPeriodId, new: data.collectionPeriodId };
    }
    if (data.customData !== undefined && JSON.stringify(data.customData) !== JSON.stringify(existing.customData)) {
      changes.customData = { old: existing.customData, new: data.customData };
    }

    // No-op detection: if nothing changed, return without DB update
    if (Object.keys(changes).length === 0) {
      updatedFeeStructure = existing;
      return;
    }

    modifiedFields = changes;
    updatedFeeStructure = await feeRepository.updateFeeStructure(schoolId, id, data, tx);
  });

  // Post-commit audit dispatch only if actual changes occurred
  if (modifiedFields) {
    await createAuditLog({
      schoolId,
      entityType: 'FeeStructure',
      entityId: id,
      actionPerformed: 'UPDATE_FEE_STRUCTURE',
      userName: actor?.email || actor?.name || 'Administrator',
      userRole: actor?.systemRole || actor?.role || null,
      modifiedFields
    });
  }

  return updatedFeeStructure;
}

/**
 * Deletes a fee structure safely, verifying no invoices reference it.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - FeeStructure UUID
 * @param {Object} actor - Authenticated user context
 * @returns {Promise<{ id: string, deleted: boolean }>}
 */
export async function deleteFeeStructure(schoolId, id, actor) {
  let deletedSnapshot = null;

  await prisma.$transaction(async (tx) => {
    const existing = await feeRepository.findFeeStructureByIdForUpdate(schoolId, id, tx);
    if (!existing) {
      throw new NotFoundError('Fee structure');
    }

    const invoiceCount = await feeRepository.countFeeStructureInvoices(schoolId, id, tx);
    if (invoiceCount > 0) {
      throw new RelationshipConflictError(
        'Cannot delete fee structure because invoices have been issued for it',
        { invoiceCount }
      );
    }

    deletedSnapshot = existing;
    await feeRepository.deleteFeeStructure(schoolId, id, tx);
  });

  // Post-commit audit dispatch
  await createAuditLog({
    schoolId,
    entityType: 'FeeStructure',
    entityId: id,
    actionPerformed: 'DELETE_FEE_STRUCTURE',
    userName: actor?.email || actor?.name || 'Administrator',
    userRole: actor?.systemRole || actor?.role || null,
    modifiedFields: {
      deletedRecord: {
        name: deletedSnapshot.name,
        amount: Number(deletedSnapshot.amount),
        dueDate: deletedSnapshot.dueDate,
        classId: deletedSnapshot.classId,
        collectionPeriodId: deletedSnapshot.collectionPeriodId
      }
    }
  });

  return { id, deleted: true };
}

/**
 * Synchronizes a fee structure with active students in its assigned class, generating any missing invoices.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - FeeStructure UUID
 * @param {Object} actor - Authenticated user context
 * @returns {Promise<{ feeStructureId: string, invoicesGenerated: number, totalStudentsInClass: number }>}
 */
export async function syncFeeStructureInvoices(schoolId, id, actor = null) {
  let createdFeeStructure = null;
  let generatedInvoicesCount = 0;
  let totalActive = 0;

  await prisma.$transaction(async (tx) => {
    createdFeeStructure = await feeRepository.findFeeStructureById(schoolId, id, tx);
    if (!createdFeeStructure) {
      throw new NotFoundError('Fee structure');
    }

    const activeStudents = await feeRepository.findActiveStudentsByClass(schoolId, createdFeeStructure.classId, tx);
    totalActive = activeStudents.length;

    const existingStudentIds = await feeRepository.findExistingInvoiceStudentIds(schoolId, createdFeeStructure.id, tx);
    const eligibleStudents = activeStudents.filter(s => !existingStudentIds.has(s.id));

    if (eligibleStudents.length > 0) {
      const invoicesToCreate = eligibleStudents.map(student => ({
        schoolId,
        studentId: student.id,
        feeStructureId: createdFeeStructure.id,
        collectionPeriodId: createdFeeStructure.collectionPeriodId || null,
        feeName: createdFeeStructure.name,
        amount: createdFeeStructure.amount,
        dueDate: createdFeeStructure.dueDate,
        status: 'Pending',
        customData: createdFeeStructure.customData ?? null
      }));

      const batchResult = await feeRepository.createInvoicesBatch(invoicesToCreate, tx);
      generatedInvoicesCount = batchResult.count;
    }
  }, { maxWait: 15000, timeout: 30000 });

  if (generatedInvoicesCount > 0) {
    await createAuditLog({
      schoolId,
      entityType: 'FeeStructure',
      entityId: id,
      actionPerformed: 'SYNC_FEE_STRUCTURE_INVOICES',
      userName: actor?.email || actor?.name || 'Administrator',
      userRole: actor?.systemRole || actor?.role || null,
      modifiedFields: {
        invoicesGenerated: generatedInvoicesCount,
        totalActiveStudents: totalActive
      }
    });
  }

  return {
    feeStructureId: id,
    invoicesGenerated: generatedInvoicesCount,
    totalStudentsInClass: totalActive
  };
}

/**
 * Synchronizes all active fee structures for a class to a specific student.
 * Automatically called when a student is created or enrolled in a class.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} studentId - Student UUID
 * @param {string} classId - Class UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<number>} Number of invoices generated
 */
export async function syncStudentClassFeeInvoices(schoolId, studentId, classId, tx = prisma) {
  if (!schoolId || !studentId || !classId) return 0;
  const feeStructures = await tx.feeStructure.findMany({
    where: { schoolId, classId }
  });
  if (!feeStructures || feeStructures.length === 0) return 0;

  let createdCount = 0;
  for (const fs of feeStructures) {
    const existing = await tx.invoice.findFirst({
      where: {
        schoolId,
        studentId,
        feeStructureId: fs.id,
        status: { not: 'Cancelled' }
      }
    });
    if (!existing) {
      await tx.invoice.create({
        data: {
          schoolId,
          studentId,
          feeStructureId: fs.id,
          collectionPeriodId: fs.collectionPeriodId || null,
          feeName: fs.name,
          amount: fs.amount,
          dueDate: fs.dueDate,
          status: 'Pending',
          customData: fs.customData ?? null
        }
      });
      createdCount++;
    }
  }
  return createdCount;
}
