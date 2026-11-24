import { prisma } from '../../database/prisma.client.js';
import * as repo from './fee-entry.repository.js';
import { generateInvoicesForStructure } from './fee-entry.matcher.js';
import { createAuditLog } from '../audit/audit.repository.js';
import { getAuthoritativeTodayString } from '../fees/fee.schemas.js';
import {
  NotFoundError,
  ConflictError,
  RelationshipConflictError,
  ValidationError
} from '../../utils/app-error.js';

const actorName = (actor) => actor?.email || actor?.name || 'Administrator';
const actorRole = (actor) => actor?.systemRole || actor?.role || null;

const TARGET_LABEL = { CLASS: 'classes', SECTION: 'class sections', STUDENT: 'students' };

async function getSchoolTimezone(schoolId) {
  try {
    const school = await prisma.school.findFirst({ where: { id: schoolId }, select: { timezone: true } });
    return school?.timezone || 'Asia/Kolkata';
  } catch {
    return 'Asia/Kolkata';
  }
}

function assertNotPast(dueDate, timeZone) {
  if (dueDate < getAuthoritativeTodayString(timeZone)) {
    throw new ValidationError('Due date cannot be in the past');
  }
}

/**
 * Edit and delete are allowed only while the invoice is Pending and has no payment recorded.
 */
function assertModifiable(invoice, action) {
  if (invoice.status === 'Cancelled') throw new NotFoundError('Fee entry');
  if (invoice.status !== 'Pending') {
    throw new ConflictError(`Cannot ${action} this fee because it has already been paid`);
  }
  if (invoice.paidAt || invoice.paymentMode || invoice.transactionReference || invoice.receiptNumber) {
    throw new ConflictError(`Cannot ${action} this fee because a payment is recorded against it`);
  }
}

/**
 * Shapes one invoice row for the Fee Entry table.
 */
export function formatFeeEntry(inv) {
  const student = inv.student;
  const amountPaise = Math.round(Number(inv.amount) * 100);
  const concessionPaise = (inv.concessions || []).reduce(
    (sum, c) => sum + Math.round(Number(c.amount) * 100),
    0
  );
  return {
    id: inv.id,
    studentId: inv.studentId,
    studentName: student
      ? `${student.firstName}${student.lastName ? ` ${student.lastName}` : ''}`
      : 'Unknown Student',
    admissionNumber: student?.admissionNumber ?? null,
    className: student?.class?.name ?? null,
    sectionName: student?.section?.name ?? null,
    gender: student?.gender ?? null,
    amount: Number(inv.amount),
    concessionAmount: concessionPaise / 100,
    balance: (amountPaise - concessionPaise) / 100,
    dueDate: inv.dueDate,
    status: inv.status,
    feeCategory: inv.feeStructure?.feeCategory?.name ?? inv.feeName,
    feeType: inv.feeStructure?.targetType ?? 'CLASS',
    feeStructureId: inv.feeStructureId,
    locked: inv.status !== 'Pending'
  };
}

export async function listFeeEntries(schoolId, query = {}) {
  const { entries, total } = await repo.findFeeEntries(schoolId, query);
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
  const totalPages = Math.ceil(total / limit) || 1;

  return {
    entries: entries.map(formatFeeEntry),
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
 * Creates the fee rule and one Pending invoice per matching active student.
 *
 * @returns {Promise<{ feeStructureId: string, matched: number, generated: number, skipped: number }>}
 */
export async function createFeeEntry(schoolId, data, actor) {
  assertNotPast(data.dueDate, await getSchoolTimezone(schoolId));

  const category = await repo.findFeeCategoryInTenant(schoolId, data.feeCategoryId);
  if (!category) {
    throw new RelationshipConflictError('Fee category does not exist in this school');
  }

  if (data.feeType !== 'ALL_STUDENT') {
    const found = await repo.countTargetsInTenant(schoolId, data.feeType, data.targetIds);
    if (found !== data.targetIds.length) {
      throw new RelationshipConflictError(
        `One or more selected ${TARGET_LABEL[data.feeType]} do not exist in this school`
      );
    }
  }

  let structure = null;
  let result = null;

  await prisma.$transaction(
    async (tx) => {
      structure = await repo.createFeeEntryStructure(
        schoolId,
        {
          name: category.name,
          amount: data.amount,
          dueDate: data.dueDate,
          // A single-class fee keeps its classId so class-based stats and screens stay accurate
          classId: data.feeType === 'CLASS' && data.targetIds.length === 1 ? data.targetIds[0] : null,
          feeCategoryId: category.id,
          targetType: data.feeType,
          targetIds: data.targetIds,
          gender: data.gender
        },
        tx
      );
      result = await generateInvoicesForStructure(schoolId, structure, tx);
    },
    { maxWait: 15000, timeout: 60000 }
  );

  await createAuditLog({
    schoolId,
    entityType: 'FeeStructure',
    entityId: structure.id,
    actionPerformed: 'CREATE_FEE_ENTRY',
    userName: actorName(actor),
    userRole: actorRole(actor),
    modifiedFields: {
      feeCategory: category.name,
      feeType: data.feeType,
      targetCount: data.targetIds.length,
      gender: data.gender,
      amount: data.amount,
      dueDate: data.dueDate,
      studentsMatched: result.matched,
      invoicesGenerated: result.generated,
      skipped: result.skipped
    }
  });

  return { feeStructureId: structure.id, ...result };
}

/**
 * Changes the amount and/or due date of one student's pending fee.
 */
export async function updateFeeEntry(schoolId, id, data, actor) {
  const timeZone = data.dueDate !== undefined ? await getSchoolTimezone(schoolId) : null;
  let changes = null;

  await prisma.$transaction(async (tx) => {
    const existing = await repo.findInvoiceForUpdate(schoolId, id, tx);
    if (!existing) throw new NotFoundError('Fee entry');
    assertModifiable(existing, 'edit');

    const diff = {};
    if (data.amount !== undefined && Number(data.amount) !== Number(existing.amount)) {
      diff.amount = { old: Number(existing.amount), new: Number(data.amount) };

      const given = await tx.feeConcession.aggregate({
        where: { schoolId, invoiceId: id, status: 'Active' },
        _sum: { amount: true }
      });
      const givenTotal = Number(given._sum.amount ?? 0);
      if (Number(data.amount) < givenTotal) {
        throw new ConflictError(
          `Amount cannot be less than the concession already given (₹${givenTotal.toLocaleString('en-IN')})`
        );
      }
    }
    
    if (data.dueDate !== undefined && data.dueDate !== existing.dueDate) {
      assertNotPast(data.dueDate, timeZone);
      diff.dueDate = { old: existing.dueDate, new: data.dueDate };
    }

    // No-op detection
    if (Object.keys(diff).length === 0) return;

    changes = { ...diff, studentId: existing.studentId, feeName: existing.feeName };
    await repo.updateInvoice(schoolId, id, data, tx);
  });

  if (changes) {
    await createAuditLog({
      schoolId,
      entityType: 'Invoice',
      entityId: id,
      actionPerformed: 'UPDATE_FEE_ENTRY',
      userName: actorName(actor),
      userRole: actorRole(actor),
      modifiedFields: changes
    });
  }

  const row = await repo.findFeeEntryById(schoolId, id);
  if (!row) throw new NotFoundError('Fee entry');
  return formatFeeEntry(row);
}
