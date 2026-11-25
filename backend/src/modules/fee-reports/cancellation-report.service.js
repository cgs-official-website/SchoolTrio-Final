import * as repo from './cancellation-report.repository.js';
import { getSchoolTimezone, dayWindow } from './fee-report.service.js';

// Money maths is done in whole paise to avoid floating point drift.
const toPaise = (v) => Math.round(Number(v) * 100);
const fromPaise = (p) => p / 100;

const dateKey = (date, timeZone) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

function resolveRange(timeZone, query) {
  return {
    start: query.fromDate ? dayWindow(query.fromDate, timeZone).start : null,
    end: query.toDate ? dayWindow(query.toDate, timeZone).end : null
  };
}

function paging(query, total) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
    hasNextPage: page * limit < total,
    hasPrevPage: page > 1
  };
}

const fullName = (s) => (s ? `${s.firstName}${s.lastName ? ` ${s.lastName}` : ''}` : 'Unknown Student');
const classSection = (s) => [s?.class?.name, s?.section?.name].filter(Boolean).join(' - ');

// ---------- Category Cancellation: one row per cancelled fee ----------

function formatCategoryRow(c) {
  return {
    id: c.id,
    admissionNumber: c.student?.admissionNumber ?? null,
    studentName: fullName(c.student),
    classSection: classSection(c.student),
    receiptNumber: c.receiptNumber ?? '',
    paidAt: c.paidAt,
    cancelDate: c.createdAt,
    feeCategory: c.invoice?.feeStructure?.feeCategory?.name ?? c.feeName,
    amount: Number(c.amount),
    description: c.description ?? '',
    cancelledBy: c.cancelledByName ?? ''
  };
}

export async function getCategoryCancellationReport(schoolId, query = {}) {
  const timeZone = await getSchoolTimezone(schoolId);
  const range = resolveRange(timeZone, query);
  const { cancellations, total } = await repo.findCancellationPage(schoolId, range, query);
  return { rows: cancellations.map(formatCategoryRow), pagination: paging(query, total) };
}

export async function getCategoryCancellationSummary(schoolId, query = {}) {
  const timeZone = await getSchoolTimezone(schoolId);
  return repo.findCancellationTotals(schoolId, resolveRange(timeZone, query), query);
}

// ---------- Invoice Cancellation: one row per cancelled receipt ----------

/**
 * Fees of one receipt cancelled on the same day become one row, with their amounts added.
 * A cancelled fee that has no receipt number stays a row of its own.
 */
async function loadReceiptRows(schoolId, query) {
  const timeZone = await getSchoolTimezone(schoolId);
  const all = await repo.findAllCancellations(schoolId, resolveRange(timeZone, query), query);

  const groups = new Map();
  for (const c of all) {
    const key = [c.receiptNumber || c.id, c.studentId, dateKey(c.createdAt, timeZone)].join('|');
    const mode = String(c.paymentMode || '').trim();
    const reason = String(c.description || '').trim();

    const g = groups.get(key);
    if (g) {
      g.paise += toPaise(c.amount);
      if (mode) g.modes.add(mode);
      if (reason) g.reasons.add(reason);
      if (c.cancelledByName) g.by.add(c.cancelledByName);
      if (c.paidAt && (!g.paidAt || c.paidAt < g.paidAt)) g.paidAt = c.paidAt;
      if (c.createdAt < g.cancelDate) g.cancelDate = c.createdAt;
    } else {
      groups.set(key, {
        id: c.id,
        student: c.student,
        receiptNumber: c.receiptNumber || '',
        modes: new Set(mode ? [mode] : []),
        reasons: new Set(reason ? [reason] : []),
        by: new Set(c.cancelledByName ? [c.cancelledByName] : []),
        paidAt: c.paidAt,
        cancelDate: c.createdAt,
        paise: toPaise(c.amount)
      });
    }
  }

  return [...groups.values()].map((g) => ({
    id: g.id,
    admissionNumber: g.student?.admissionNumber ?? null,
    studentName: fullName(g.student),
    classSection: classSection(g.student),
    receiptNumber: g.receiptNumber,
    paymentMode: [...g.modes].join(', '),
    paidAt: g.paidAt,
    cancelDate: g.cancelDate,
    description: [...g.reasons].join('; '),
    cancelledBy: [...g.by].join(', '),
    amount: fromPaise(g.paise)
  }));
}

const text = (a, b) =>
  String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true, sensitivity: 'base' });
const time = (a, b) => (a ? new Date(a).getTime() : 0) - (b ? new Date(b).getTime() : 0);

const SORTS = {
  admissionNumber: (a, b) => text(a.admissionNumber, b.admissionNumber),
  studentName: (a, b) => text(a.studentName, b.studentName),
  className: (a, b) => text(a.classSection, b.classSection),
  receiptNumber: (a, b) => text(a.receiptNumber, b.receiptNumber),
  paymentMode: (a, b) => text(a.paymentMode, b.paymentMode),
  cancelDate: (a, b) => time(a.cancelDate, b.cancelDate),
  paidAt: (a, b) => time(a.paidAt, b.paidAt),
  amount: (a, b) => a.amount - b.amount
};

export async function getInvoiceCancellationReport(schoolId, query = {}) {
  const rows = await loadReceiptRows(schoolId, query);

  const direction = query.order === 'asc' ? 1 : -1;
  const compare = SORTS[query.sortBy] || SORTS.cancelDate;
  rows.sort((a, b) => compare(a, b) * direction || text(a.id, b.id));

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
  return { rows: rows.slice((page - 1) * limit, page * limit), pagination: paging(query, rows.length) };
}

export async function getInvoiceCancellationSummary(schoolId, query = {}) {
  const [rows, modes] = await Promise.all([
    loadReceiptRows(schoolId, query),
    repo.findCancellationPaymentModes(schoolId)
  ]);

  let totalPaise = 0;
  for (const r of rows) totalPaise += toPaise(r.amount);

  const seen = new Set();
  const paymentModes = [];
  for (const mode of modes) {
    const name = String(mode || '').trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    paymentModes.push(name);
  }
  paymentModes.sort((a, b) => a.localeCompare(b));

  return { count: rows.length, amount: fromPaise(totalPaise), paymentModes };
}