import { prisma } from '../../database/prisma.client.js';
import * as repo from './fee-deletion.repository.js';
import { findInvoiceForUpdate } from '../fee-entries/fee-entry.repository.js';
import { createAuditLog } from '../audit/audit.repository.js';
import { NotFoundError, ConflictError, RelationshipConflictError } from '../../utils/app-error.js';

const actorName = (actor) => actor?.email || actor?.name || 'Administrator';
const actorRole = (actor) => actor?.systemRole || actor?.role || null;

// Money maths is done in whole paise to avoid floating point drift.
const toPaise = (v) => Math.round(Number(v) * 100);
const fromPaise = (p) => p / 100;

/** A fee can be deleted only while it is Pending with no payment on it. */
function isPending(invoice) {
  return (
    invoice.status === 'Pending' &&
    !invoice.paidAt &&
    !invoice.paymentMode &&
    !invoice.transactionReference &&
    !invoice.receiptNumber
  );
}

export function formatFeeDeletion(d) {
  const s = d.student;
  return {
    id: d.id,
    invoiceId: d.invoiceId,
    studentId: d.studentId,
    studentName: s ? `${s.firstName}${s.lastName ? ` ${s.lastName}` : ''}` : 'Unknown Student',
    admissionNumber: s?.admissionNumber ?? null,
    className: s?.class?.name ?? null,
    sectionName: s?.section?.name ?? null,
    feeCategory: d.feeName,
    dueDate: d.dueDate,
    amount: Number(d.amount),
    concessionAmount: Number(d.concessionAmount),
    reason: d.reason,
    deletedBy: d.deletedByName,
    createdAt: d.createdAt
  };
}

export async function listFeeDeletions(schoolId, query = {}) {
  const { deletions, total } = await repo.findFeeDeletions(schoolId, query);
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));

  return {
    deletions: deletions.map(formatFeeDeletion),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1
    }
  };
}

/**
 * All fees of one student for the Add form.
 * A paid fee shows paid = amount - concession and balance 0; a pending fee shows paid 0.
 */
export async function getStudentFees(schoolId, studentId) {
  const invoices = await repo.findInvoicesForStudent(schoolId, studentId);
  return invoices.map((inv) => {
    const grossPaise = toPaise(inv.amount);
    const concessionPaise = inv.concessions.reduce((sum, c) => sum + toPaise(c.amount), 0);
    const paid = String(inv.status).toLowerCase() === 'paid';
    const netPaise = grossPaise - concessionPaise;

    return {
      id: inv.id,
      feeCategory: inv.feeStructure?.feeCategory?.name ?? inv.feeName,
      dueDate: inv.dueDate,
      amount: fromPaise(grossPaise),
      paidAmount: fromPaise(paid ? netPaise : 0),
      concessionAmount: fromPaise(concessionPaise),
      balance: fromPaise(paid ? 0 : netPaise),
      status: inv.status,
      deletable: isPending(inv)
    };
  });
}

/**
 * Deletes the selected pending fees of one student. Each fee is marked Cancelled (never removed),
 * its active concessions are cancelled with it, and the reason is saved. All or nothing.
 */
export async function createFeeDeletion(schoolId, data, actor) {
  const student = await repo.findStudentInTenant(schoolId, data.studentId);
  if (!student) throw new RelationshipConflictError('Student does not exist in this school');

  const name = actorName(actor);
  const rows = [];

  await prisma.$transaction(
    async (tx) => {
      // Lock in a fixed order so two concurrent requests cannot deadlock
      for (const invoiceId of [...data.invoiceIds].sort()) {
        const invoice = await findInvoiceForUpdate(schoolId, invoiceId, tx);
        if (!invoice || invoice.studentId !== data.studentId || invoice.status === 'Cancelled') {
          throw new NotFoundError('Fee');
        }
        if (!isPending(invoice)) {
          throw new ConflictError(
            `Cannot delete "${invoice.feeName}" because it is already paid. Cancel the payment first.`
          );
        }

        const concessionAmount = await repo.sumActiveConcessions(schoolId, invoiceId, tx);
        await repo.cancelActiveConcessions(schoolId, invoiceId, tx);
        await repo.cancelInvoice(schoolId, invoiceId, tx);

        rows.push({
          schoolId,
          invoiceId,
          studentId: data.studentId,
          feeName: invoice.feeName,
          amount: Number(invoice.amount),
          concessionAmount,
          dueDate: invoice.dueDate,
          reason: data.reason,
          deletedByName: name
        });
      }

      await repo.createDeletionRecords(rows, tx);
    },
    { maxWait: 15000, timeout: 30000 }
  );

  await createAuditLog({
    schoolId,
    entityType: 'Student',
    entityId: data.studentId,
    actionPerformed: 'DELETE_STUDENT_FEE',
    userName: name,
    userRole: actorRole(actor),
    modifiedFields: {
      reason: data.reason,
      feesDeleted: rows.length,
      fees: rows.map((r) => ({ invoiceId: r.invoiceId, feeName: r.feeName, amount: r.amount })),
      status: { old: 'Pending', new: 'Cancelled' }
    }
  });

  return { deleted: rows.length };
}