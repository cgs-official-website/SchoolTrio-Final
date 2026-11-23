import { prisma } from '../../database/prisma.client.js';
import * as repo from './fee-cancellation.repository.js';
import { findInvoiceForUpdate } from '../fee-entries/fee-entry.repository.js';
import { createAuditLog } from '../audit/audit.repository.js';
import { NotFoundError, ConflictError } from '../../utils/app-error.js';

const actorName = (actor) => actor?.email || actor?.name || 'Administrator';
const actorRole = (actor) => actor?.systemRole || actor?.role || null;

export function formatFeeCancellation(c) {
  const s = c.student;
  return {
    id: c.id,
    invoiceId: c.invoiceId,
    studentId: c.studentId,
    studentName: s ? `${s.firstName}${s.lastName ? ` ${s.lastName}` : ''}` : 'Unknown Student',
    admissionNumber: s?.admissionNumber ?? null,
    className: s?.class?.name ?? null,
    sectionName: s?.section?.name ?? null,
    feeCategory: c.feeName,
    amount: Number(c.amount),
    receiptNumber: c.receiptNumber ?? null,
    paymentMode: c.paymentMode ?? null,
    paidAt: c.paidAt ?? null,
    description: c.description,
    cancelledBy: c.cancelledByName,
    createdAt: c.createdAt
  };
}

export async function listFeeCancellations(schoolId, query = {}) {
  const { cancellations, total } = await repo.findFeeCancellations(schoolId, query);
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));

  return {
    cancellations: cancellations.map(formatFeeCancellation),
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

/** Paid fees the Add Fee Cancellation table shows for one student. */
export async function getStudentPayments(schoolId, studentId) {
  const invoices = await repo.findPaidInvoicesForStudent(schoolId, studentId);
  return invoices.map((inv) => ({
    id: inv.id,
    feeCategory: inv.feeStructure?.feeCategory?.name ?? inv.feeName,
    amount: Number(inv.amount),
    paidAt: inv.paidAt,
    paymentMode: inv.paymentMode,
    receiptNumber: inv.receiptNumber
  }));
}

/**
 * Cancels the payment on one paid fee: the payment details are saved in the cancellation
 * record, then the fee goes back to Pending with no payment on it.
 */
export async function createFeeCancellation(schoolId, data, actor) {
  let snapshot = null;

  await prisma.$transaction(
    async (tx) => {
      // Lock the fee so a second cancellation (or a new payment) cannot run at the same time
      const invoice = await findInvoiceForUpdate(schoolId, data.invoiceId, tx);
      if (!invoice) throw new NotFoundError('Payment');

      if (String(invoice.status).toLowerCase() !== 'paid') {
        throw new ConflictError('Only a paid fee can be cancelled');
      }

      snapshot = invoice;

      await repo.createCancellationRecord(
        {
          schoolId,
          invoiceId: invoice.id,
          studentId: invoice.studentId,
          feeName: invoice.feeName,
          amount: Number(invoice.amount),
          receiptNumber: invoice.receiptNumber ?? null,
          paymentMode: invoice.paymentMode ?? null,
          transactionReference: invoice.transactionReference ?? null,
          paidAt: invoice.paidAt ?? null,
          description: data.description,
          cancelledByName: actorName(actor)
        },
        tx
      );

      await repo.resetInvoiceToPending(schoolId, invoice.id, tx);
    },
    { maxWait: 15000, timeout: 30000 }
  );

  await createAuditLog({
    schoolId,
    entityType: 'Invoice',
    entityId: data.invoiceId,
    actionPerformed: 'CANCEL_FEE_PAYMENT',
    userName: actorName(actor),
    userRole: actorRole(actor),
    modifiedFields: {
      status: { old: 'Paid', new: 'Pending' },
      studentId: snapshot.studentId,
      feeName: snapshot.feeName,
      amount: Number(snapshot.amount),
      receiptNumber: snapshot.receiptNumber ?? null,
      paymentMode: snapshot.paymentMode ?? null,
      reason: data.description
    }
  });

  return { invoiceId: data.invoiceId, cancelled: true };
}