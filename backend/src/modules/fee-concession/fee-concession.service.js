import { prisma } from '../../database/prisma.client.js';
import * as repo from './fee-concession.repository.js';
import { findInvoiceForUpdate } from '../fee-entries/fee-entry.repository.js';
import { createAuditLog } from '../audit/audit.repository.js';
import {
  NotFoundError,
  ConflictError,
  RelationshipConflictError,
  ValidationError
} from '../../utils/app-error.js';

const actorName = (actor) => actor?.email || actor?.name || 'Administrator';
const actorRole = (actor) => actor?.systemRole || actor?.role || null;

// All money maths is done in whole paise to avoid floating point drift.
const toPaise = (v) => Math.round(Number(v) * 100);
const fromPaise = (p) => p / 100;
const rupees = (p) => `₹${fromPaise(p).toLocaleString('en-IN')}`;

function isPending(invoice) {
  return (
    invoice.status === 'Pending' &&
    !invoice.paidAt &&
    !invoice.paymentMode &&
    !invoice.transactionReference &&
    !invoice.receiptNumber
  );
}

export function formatFeeConcession(c) {
  const s = c.student;
  return {
    id: c.id,
    invoiceId: c.invoiceId,
    studentId: c.studentId,
    studentName: s ? `${s.firstName}${s.lastName ? ` ${s.lastName}` : ''}` : 'Unknown Student',
    admissionNumber: s?.admissionNumber ?? null,
    className: s?.class?.name ?? null,
    sectionName: s?.section?.name ?? null,
    feeCategory: c.invoice?.feeStructure?.feeCategory?.name ?? c.invoice?.feeName ?? null,
    amount: Number(c.amount),
    valueType: c.valueType,
    value: Number(c.value),
    concessionType: c.concessionType,
    concessionCategory: c.concessionCategory?.name ?? null,
    description: c.description ?? null,
    createdAt: c.createdAt,
    locked: c.invoice?.status !== 'Pending'
  };
}

export async function listFeeConcessions(schoolId, query = {}) {
  const { concessions, total } = await repo.findFeeConcessions(schoolId, query);
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));

  return {
    concessions: concessions.map(formatFeeConcession),
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

/** Pending fees the Add Fee Concession table shows for one student. */
export async function getStudentFees(schoolId, studentId) {
  const invoices = await repo.findPendingInvoicesForStudent(schoolId, studentId);
  return invoices.map((inv) => {
    const grossPaise = toPaise(inv.amount);
    const givenPaise = inv.concessions.reduce((sum, c) => sum + toPaise(c.amount), 0);
    return {
      id: inv.id,
      feeCategory: inv.feeStructure?.feeCategory?.name ?? inv.feeName,
      dueDate: inv.dueDate,
      amount: fromPaise(grossPaise),
      concession: fromPaise(givenPaise),
      balance: fromPaise(grossPaise - givenPaise)
    };
  });
}

/**
 * Gives the same concession (percentage of each fee, or a fixed rupee amount per fee)
 * on every selected pending fee. All-or-nothing: if one fee fails, none are saved.
 */
export async function createFeeConcession(schoolId, data, actor) {
  const category = await repo.findConcessionCategoryInTenant(schoolId, data.concessionCategoryId);
  if (!category) throw new RelationshipConflictError('Concession category does not exist in this school');

  const student = await repo.findStudentInTenant(schoolId, data.studentId);
  if (!student) throw new RelationshipConflictError('Student does not exist in this school');

  const value = Number(data.value);
  let rows = [];

  await prisma.$transaction(
    async (tx) => {
      // Lock in a fixed order so two concurrent requests cannot deadlock
      for (const invoiceId of [...data.invoiceIds].sort()) {
        const invoice = await findInvoiceForUpdate(schoolId, invoiceId, tx);
        if (!invoice || invoice.studentId !== data.studentId) throw new NotFoundError('Fee');

        if (!isPending(invoice)) {
          throw new ConflictError(`Cannot add a concession because "${invoice.feeName}" is already paid`);
        }

        const grossPaise = toPaise(invoice.amount);
        const givenPaise = toPaise(await repo.sumActiveConcessions(schoolId, invoiceId, tx));
        const balancePaise = grossPaise - givenPaise;

        const concessionPaise =
          data.valueType === 'PERCENTAGE' ? Math.round((grossPaise * value) / 100) : toPaise(value);

        if (concessionPaise <= 0) {
          throw new ValidationError(`Concession on "${invoice.feeName}" works out to zero`);
        }
        if (concessionPaise > balancePaise) {
          throw new ConflictError(
            `Concession of ${rupees(concessionPaise)} on "${invoice.feeName}" is more than its balance of ${rupees(balancePaise)}`
          );
        }

        rows.push({
          schoolId,
          invoiceId,
          studentId: data.studentId,
          concessionCategoryId: category.id,
          concessionType: 'Normal',
          valueType: data.valueType,
          value: data.value,
          amount: fromPaise(concessionPaise),
          description: data.description,
          status: 'Active'
        });
      }

      await repo.createConcessions(rows, tx);
    },
    { maxWait: 15000, timeout: 30000 }
  );

  const totalAmount = rows.reduce((sum, r) => sum + r.amount, 0);

  await createAuditLog({
    schoolId,
    entityType: 'Student',
    entityId: data.studentId,
    actionPerformed: 'CREATE_FEE_CONCESSION',
    userName: actorName(actor),
    userRole: actorRole(actor),
    modifiedFields: {
      concessionCategory: category.name,
      valueType: data.valueType,
      value,
      feesCount: rows.length,
      totalConcession: totalAmount,
      invoiceIds: rows.map((r) => r.invoiceId)
    }
  });

  return { created: rows.length, totalAmount };
}

/**
 * Deleting marks the concession Cancelled (audit trail kept). Allowed only while the fee is pending.
 */
export async function deleteFeeConcession(schoolId, id, actor) {
  let snapshot = null;

  await prisma.$transaction(async (tx) => {
    const found = await repo.findActiveConcession(schoolId, id, tx);
    if (!found) throw new NotFoundError('Concession');

    // Lock the fee first, then re-check, so a payment cannot slip in between
    const invoice = await findInvoiceForUpdate(schoolId, found.invoiceId, tx);
    if (!invoice) throw new NotFoundError('Concession');

    const current = await repo.findActiveConcession(schoolId, id, tx);
    if (!current) throw new NotFoundError('Concession');

    if (!isPending(invoice)) {
      throw new ConflictError('Cannot delete this concession because the fee is already paid');
    }

    snapshot = { ...current, feeName: invoice.feeName };
    await repo.cancelConcession(schoolId, id, tx);
  });

  await createAuditLog({
    schoolId,
    entityType: 'Student',
    entityId: snapshot.studentId,
    actionPerformed: 'DELETE_FEE_CONCESSION',
    userName: actorName(actor),
    userRole: actorRole(actor),
    modifiedFields: {
      concessionId: id,
      feeName: snapshot.feeName,
      amount: Number(snapshot.amount),
      status: { old: 'Active', new: 'Cancelled' }
    }
  });

  return { id, deleted: true };
}