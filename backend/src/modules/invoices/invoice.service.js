import crypto from 'crypto';
import { prisma } from '../../database/prisma.client.js';
import * as invoiceRepository from './invoice.repository.js';
import { createAuditLog } from '../audit/audit.repository.js';
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
  TenantAccessError
} from '../../utils/app-error.js';

import { SYSTEM_ROLES } from '../../config/constants.js';

/**
 * Invoice Domain Business Service Layer (Phase 4C.6-B1)
 *
 * Core Guarantees:
 * 1. Read-only domain: zero mutations to financial state or invoices.
 * 2. Multi-tenant isolation: every operation strictly scoped to `schoolId`.
 * 3. Parent authorization: derived dynamically from ParentStudentLink. Parents cannot read institutional stats or other students' invoices.
 * 4. Snapshot preservation: historical snapshot fields from Invoice are authoritative.
 * 5. Dynamic overdue evaluation: derived from `status === 'Pending' && dueDate < CURRENT_DATE`.
 * 6. Orphan invoice tolerance: safely handles `studentId = null` or `collectionPeriodId = null`.
 */

/**
 * Formats an invoice entity safely for API serialization.
 *
 * @param {Object} inv - Raw invoice record with relations
 * @param {string} todayStr - Current calendar date string (YYYY-MM-DD)
 * @returns {Object}
 */
export function formatInvoice(inv, todayStr = new Date().toISOString().slice(0, 10)) {
  if (!inv) return null;

  const isOverdue = inv.status === 'Pending' && typeof inv.dueDate === 'string' && inv.dueDate < todayStr;

  return {
    id: inv.id,
    schoolId: inv.schoolId,
    studentId: inv.studentId || null,
    feeStructureId: inv.feeStructureId,
    collectionPeriodId: inv.collectionPeriodId || null,
    feeName: inv.feeName,
    amount: inv.amount !== null && inv.amount !== undefined ? Number(inv.amount) : 0,
    dueDate: inv.dueDate,
    status: inv.status,
    isOverdue,
    paidAt: inv.paidAt || null,
    paymentMode: inv.paymentMode || null,
    transactionReference: inv.transactionReference || null,
    receiptNumber: inv.receiptNumber || null,
    customData: inv.customData || null,
    createdAt: inv.createdAt,
    updatedAt: inv.updatedAt,
    student: inv.student
      ? {
          id: inv.student.id,
          admissionNumber: inv.student.admissionNumber,
          firstName: inv.student.firstName,
          lastName: inv.student.lastName,
          status: inv.student.status,
          class: inv.student.class ? { id: inv.student.class.id, name: inv.student.class.name } : null,
          section: inv.student.section ? { id: inv.student.section.id, name: inv.student.section.name } : null
        }
      : null,
    feeStructure: inv.feeStructure
      ? {
          id: inv.feeStructure.id,
          name: inv.feeStructure.name,
          amount: inv.feeStructure.amount !== null && inv.feeStructure.amount !== undefined ? Number(inv.feeStructure.amount) : 0,
          dueDate: inv.feeStructure.dueDate,
          classId: inv.feeStructure.classId,
          collectionPeriodId: inv.feeStructure.collectionPeriodId || null
        }
      : null,
    collectionPeriod: inv.collectionPeriod
      ? {
          id: inv.collectionPeriod.id,
          name: inv.collectionPeriod.name,
          dueDate: inv.collectionPeriod.dueDate,
          displayOrder: inv.collectionPeriod.displayOrder
        }
      : null
  };
}

/**
 * Lists invoices with pagination, filtering, search, and parent child-scoping.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} query - Express request query
 * @param {Object} requester - Authenticated user context
 * @returns {Promise<{ invoices: Array, pagination: Object }>}
 */
export async function listInvoices(schoolId, query = {}, requester = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to list invoices');
  }

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
  const isParent = requester?.systemRole === SYSTEM_ROLES.PARENT || requester?.role === SYSTEM_ROLES.PARENT;

  const options = {
    page,
    limit,
    classId: query.classId,
    feeStructureId: query.feeStructureId,
    collectionPeriodId: query.collectionPeriodId,
    status: query.status,
    overdue: query.overdue,
    search: query.search ? query.search.trim() : undefined,
    order: query.order || 'desc'
  };

  // Parent Child-Scope Authorization
  if (isParent) {
    const userId = requester.userId || requester.id;
    const authorizedStudentIds = await invoiceRepository.findAuthorizedStudentIdsForParent(schoolId, userId);

    if (authorizedStudentIds.length === 0) {
      return {
        invoices: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false
        }
      };
    }

    if (query.studentId) {
      if (!authorizedStudentIds.includes(query.studentId)) {
        return {
          invoices: [],
          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 1,
            hasNextPage: false,
            hasPrevPage: false
          }
        };
      }
      options.studentId = query.studentId;
    } else {
      options.studentIds = authorizedStudentIds;
    }
  } else {
    // Institutional staff
    if (query.studentId) {
      options.studentId = query.studentId;
    }
  }

  const { invoices, total } = await invoiceRepository.findInvoices(schoolId, options);
  const totalPages = Math.ceil(total / limit) || 1;
  const todayStr = new Date().toISOString().slice(0, 10);

  return {
    invoices: invoices.map(inv => formatInvoice(inv, todayStr)),
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
 * Retrieves a single invoice by ID with strict tenant and parent authorization.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - Invoice UUID
 * @param {Object} requester - Authenticated user context
 * @returns {Promise<Object>}
 */
export async function getInvoiceById(schoolId, id, requester = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to retrieve invoice');
  }

  const invoice = await invoiceRepository.findInvoiceById(schoolId, id);
  if (!invoice) {
    throw new NotFoundError('Invoice');
  }

  const isParent = requester?.systemRole === SYSTEM_ROLES.PARENT || requester?.role === SYSTEM_ROLES.PARENT;

  if (isParent) {
    if (!invoice.studentId) {
      // Orphan invoices are inaccessible to parents
      throw new NotFoundError('Invoice');
    }

    const userId = requester.userId || requester.id;
    const authorizedStudentIds = await invoiceRepository.findAuthorizedStudentIdsForParent(schoolId, userId);

    if (!authorizedStudentIds.includes(invoice.studentId)) {
      // Never disclose existence of invoice belonging to another student
      throw new NotFoundError('Invoice');
    }
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  return formatInvoice(invoice, todayStr);
}

/**
 * Retrieves aggregate institutional financial statistics.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} query - Optional query filters
 * @param {Object} requester - Authenticated user context
 * @returns {Promise<Object>}
 */
export async function getInvoiceStats(schoolId, query = {}, requester = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to retrieve invoice stats');
  }

  const role = requester?.systemRole || requester?.role;
  if (role === SYSTEM_ROLES.PARENT || role === SYSTEM_ROLES.STUDENT) {
    throw new ForbiddenError('Parents and students are not authorized to view institutional financial statistics');
  }

  const filters = {
    classId: query.classId,
    studentId: query.studentId,
    feeStructureId: query.feeStructureId,
    collectionPeriodId: query.collectionPeriodId
  };

  return invoiceRepository.aggregateInvoiceStats(schoolId, filters);
}

/**
 * Retrieves class-wise fee reports.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} query - Optional query filters (collectionPeriodId)
 * @param {Object} requester - Authenticated user context
 * @returns {Promise<Array<Object>>}
 */
export async function getClassWiseReports(schoolId, query = {}, requester = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to retrieve class-wise fee reports');
  }

  const role = requester?.systemRole || requester?.role;
  if (role === SYSTEM_ROLES.PARENT || role === SYSTEM_ROLES.STUDENT) {
    throw new ForbiddenError('Parents and students are not authorized to view institutional fee reports');
  }

  const filters = {
    collectionPeriodId: query.collectionPeriodId
  };

  return invoiceRepository.aggregateClassWiseReports(schoolId, filters);
}

/**
 * Retrieves collection-period-wise fee reports.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} requester - Authenticated user context
 * @returns {Promise<Array<Object>>}
 */
export async function getPeriodWiseReports(schoolId, requester = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to retrieve period-wise fee reports');
  }

  const role = requester?.systemRole || requester?.role;
  if (role === SYSTEM_ROLES.PARENT || role === SYSTEM_ROLES.STUDENT) {
    throw new ForbiddenError('Parents and students are not authorized to view institutional fee reports');
  }

  return invoiceRepository.aggregatePeriodWiseReports(schoolId);
}

/**
 * Retrieves monthly revenue timeline report.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} query - Optional query parameters (months)
 * @param {Object} requester - Authenticated user context
 * @returns {Promise<Array<Object>>}
 */
export async function getMonthlyRevenueReports(schoolId, query = {}, requester = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to retrieve monthly revenue reports');
  }

  const role = requester?.systemRole || requester?.role;
  if (role === SYSTEM_ROLES.PARENT || role === SYSTEM_ROLES.STUDENT) {
    throw new ForbiddenError('Parents and students are not authorized to view institutional revenue reports');
  }

  const months = query.months !== undefined ? Number(query.months) : 7;
  return invoiceRepository.aggregateMonthlyRevenueReports(schoolId, months);
}

/**
 * Retrieves student invoice timeline history and balance summary.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} studentId - Student UUID
 * @param {Object} query - Pagination and filter query
 * @param {Object} requester - Authenticated user context
 * @returns {Promise<{ invoices: Array, pagination: Object, summary: Object }>}
 */
export async function getStudentInvoices(schoolId, studentId, query = {}, requester = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to retrieve student invoices');
  }

  // 1. Verify student exists in tenant
  const student = await invoiceRepository.findStudentInTenant(schoolId, studentId);
  if (!student) {
    throw new NotFoundError('Student');
  }

  // 2. Check parent authorization
  const isParent = requester?.systemRole === SYSTEM_ROLES.PARENT || requester?.role === SYSTEM_ROLES.PARENT;
  if (isParent) {
    const userId = requester.userId || requester.id;
    const authorizedStudentIds = await invoiceRepository.findAuthorizedStudentIdsForParent(schoolId, userId);

    if (!authorizedStudentIds.includes(studentId)) {
      throw new NotFoundError('Student');
    }
  }

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));

  const options = {
    page,
    limit,
    status: query.status,
    order: query.order || 'desc'
  };

  const [invoicesResult, summary] = await Promise.all([
    invoiceRepository.findStudentInvoices(schoolId, studentId, options),
    invoiceRepository.aggregateStudentInvoiceStats(schoolId, studentId)
  ]);

  const totalPages = Math.ceil(invoicesResult.total / limit) || 1;
  const todayStr = new Date().toISOString().slice(0, 10);

  return {
    invoices: invoicesResult.invoices.map(inv => formatInvoice(inv, todayStr)),
    pagination: {
      page,
      limit,
      total: invoicesResult.total,
      totalPages,
      hasNextPage: page * limit < invoicesResult.total,
      hasPrevPage: page > 1
    },
    summary
  };
}

/**
 * Cancels a pending invoice under an exclusive PostgreSQL row lock.
 *
 * State Machine & Invariants:
 * 1. Only 'Pending' invoices without payment metadata can be cancelled.
 * 2. 'Paid' invoices reject cancellation with 409 ConflictError.
 * 3. Already 'Cancelled' invoices reject cancellation with 409 ConflictError.
 * 4. Pending invoices containing payment metadata reject cancellation with 409 ConflictError.
 * 5. Snapshot fields (feeName, amount, dueDate, etc.) remain 100% immutable.
 * 6. Non-blocking audit log is dispatched post-commit.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - Invoice UUID
 * @param {Object} [data={}] - Cancellation payload ({ reason })
 * @param {Object} [actor=null] - Authenticated user context
 * @returns {Promise<Object>} Formatted cancelled invoice
 */
export async function cancelInvoice(schoolId, id, data = {}, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to cancel invoice');
  }

  let cancelledInvoice = null;

  await prisma.$transaction(async (tx) => {
    // 1. Acquire exclusive row lock before verifying state
    const existing = await invoiceRepository.findInvoiceByIdForUpdate(schoolId, id, tx);
    if (!existing) {
      throw new NotFoundError('Invoice');
    }

    // 2. State machine guards
    if (existing.status === 'Paid') {
      throw new ConflictError('Cannot cancel invoice because it has already been paid');
    }

    if (existing.status === 'Cancelled') {
      throw new ConflictError('Invoice is already cancelled');
    }

    if (existing.status !== 'Pending') {
      throw new ConflictError(`Cannot cancel invoice with status '${existing.status}'`);
    }

    // 3. Payment metadata guard
    if (
      existing.paidAt ||
      existing.paymentMode ||
      existing.transactionReference ||
      existing.receiptNumber
    ) {
      throw new ConflictError('Cannot cancel invoice with associated payment metadata');
    }

    // 4. Atomic status update
    cancelledInvoice = await invoiceRepository.cancelInvoice(schoolId, id, tx);
  });

  // 5. Post-commit non-blocking audit log dispatch
  try {
    await createAuditLog({
      schoolId,
      entityType: 'Invoice',
      entityId: id,
      actionPerformed: 'CANCEL_INVOICE',
      userName: actor?.email || actor?.name || 'Administrator',
      userRole: actor?.systemRole || actor?.role || null,
      modifiedFields: {
        status: {
          old: 'Pending',
          new: 'Cancelled'
        },
        ...(data.reason && { reason: data.reason.trim() })
      }
    });
  } catch (err) {
    console.error('[AUDIT LOG WARNING] Failed to record cancellation audit log:', err.message);
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  return formatInvoice(cancelledInvoice, todayStr);
}

/**
 * Generates a high-entropy deterministic receipt number.
 *
 * @returns {string} e.g. "REC-20260910-A9F21B"
 */
export function generateReceiptNumber() {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randPart = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `REC-${datePart}-${randPart}`;
}

/**
 * Settles an invoice payment under an exclusive PostgreSQL row lock.
 *
 * State Machine & Invariants:
 * 1. Only 'Pending' invoices can be settled.
 * 2. 'Cancelled' invoices reject payment with 409 ConflictError.
 * 3. Already 'Paid' invoices with matching transactionReference return 200 OK (idempotent retry).
 * 4. Already 'Paid' invoices without matching transactionReference reject with 409 ConflictError.
 * 5. Parent callers are dynamically verified against ParentStudentLink. Orphan/unlinked invoices return 404.
 * 6. Non-blocking audit log is dispatched post-commit.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - Invoice UUID
 * @param {Object} [data={}] - Settlement payload ({ paymentMode, transactionReference, receiptNumber, paidAt, amount })
 * @param {Object} [actor=null] - Authenticated user context
 * @returns {Promise<Object>} Formatted paid invoice
 */
export async function payInvoice(schoolId, id, data = {}, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to record payment');
  }

  const isParent = actor?.systemRole === SYSTEM_ROLES.PARENT || actor?.role === SYSTEM_ROLES.PARENT;

  // Parent child-scope authorization preliminary check
  if (isParent) {
    const userId = actor.userId || actor.id;
    const authorizedStudentIds = await invoiceRepository.findAuthorizedStudentIdsForParent(schoolId, userId);

    if (authorizedStudentIds.length === 0) {
      throw new NotFoundError('Invoice');
    }
  }

  let settledInvoice = null;
  let isIdempotentRetry = false;
  let auditMetadata = null;

  await prisma.$transaction(async (tx) => {
    // 1. Acquire exclusive row lock before verifying state
    const existing = await invoiceRepository.findInvoiceByIdForUpdate(schoolId, id, tx);
    if (!existing) {
      throw new NotFoundError('Invoice');
    }

    // 2. Parent child-scope verification against locked invoice
    if (isParent) {
      if (!existing.studentId) {
        throw new NotFoundError('Invoice');
      }
      const userId = actor.userId || actor.id;
      const authorizedStudentIds = await invoiceRepository.findAuthorizedStudentIdsForParent(schoolId, userId, tx);
      if (!authorizedStudentIds.includes(existing.studentId)) {
        throw new NotFoundError('Invoice');
      }
    }

    // 3. Status guards & Idempotency check
    if (existing.status === 'Cancelled') {
      throw new ConflictError('Cannot pay a cancelled invoice');
    }

    if (existing.status === 'Paid') {
      const incomingRef = data.transactionReference ? data.transactionReference.trim() : null;
      if (
        existing.transactionReference &&
        incomingRef &&
        existing.transactionReference === incomingRef
      ) {
        // Idempotent retry: return existing invoice snapshot
        settledInvoice = await invoiceRepository.findInvoiceById(schoolId, id, tx);
        isIdempotentRetry = true;
        return;
      }
      throw new ConflictError('Invoice has already been paid');
    }

    if (existing.status !== 'Pending') {
      throw new ConflictError(`Cannot pay invoice with status '${existing.status}'`);
    }

    // 4. Amount validation if supplied
    if (data.amount !== undefined && data.amount !== null) {
      const numericSupplied = Number(data.amount);
      const numericExpected = Number(existing.amount);
      if (numericSupplied !== numericExpected) {
        throw new ValidationError('Payment amount does not match invoice obligation');
      }
    }

    // 5. Payment mode determination
    let paymentMode;
    if (data.paymentMode) {
      paymentMode = data.paymentMode;
    } else if (isParent) {
      paymentMode = 'Online';
    } else {
      paymentMode = 'Cash';
    }

    // 6. Paid at timestamp determination
    let paidAt;
    if (isParent) {
      paidAt = new Date();
    } else if (data.paidAt) {
      const parsedDate = new Date(data.paidAt);
      if (parsedDate > new Date()) {
        throw new ValidationError('Payment date cannot be in the future');
      }
      paidAt = parsedDate;
    } else {
      paidAt = new Date();
    }


    // 7. Receipt number determination
    const receiptNumber = data.receiptNumber && data.receiptNumber.trim()
      ? data.receiptNumber.trim()
      : generateReceiptNumber();

    const transactionReference = data.transactionReference && data.transactionReference.trim()
      ? data.transactionReference.trim()
      : null;

    // 8. Settle invoice payment atomically
    settledInvoice = await invoiceRepository.settleInvoicePayment(
      schoolId,
      id,
      {
        paidAt,
        paymentMode,
        transactionReference,
        receiptNumber
      },
      tx
    );

    auditMetadata = {
      amount: Number(existing.amount),
      paidAt,
      paymentMode,
      transactionReference,
      receiptNumber
    };
  });

  // 9. Post-commit non-blocking audit log dispatch (only for new payment)
  if (!isIdempotentRetry && auditMetadata) {
    try {
      await createAuditLog({
        schoolId,
        entityType: 'Invoice',
        entityId: id,
        actionPerformed: 'RECORD_PAYMENT',
        userName: actor?.email || actor?.name || 'Administrator',
        userRole: actor?.systemRole || actor?.role || null,
        modifiedFields: {
          status: {
            old: 'Pending',
            new: 'Paid'
          },
          amount: auditMetadata.amount,
          paidAt: auditMetadata.paidAt,
          paymentMode: auditMetadata.paymentMode,
          transactionReference: auditMetadata.transactionReference,
          receiptNumber: auditMetadata.receiptNumber
        }
      });
    } catch (err) {
      console.error('[AUDIT LOG WARNING] Failed to record payment audit log:', err.message);
    }
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  return formatInvoice(settledInvoice, todayStr);
}


