import * as repo from './concession-student.repository.js';
import { getSchoolTimezone, dayWindow, fromCustomData, PARENT_KEYS } from './fee-report.service.js';

// Money maths is done in whole paise to avoid floating point drift.
const toPaise = (v) => Math.round(Number(v) * 100);
const fromPaise = (p) => p / 100;

async function resolveRange(schoolId, query) {
  if (!query.fromDate && !query.toDate) return { start: null, end: null };
  const timeZone = await getSchoolTimezone(schoolId);
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

const fullName = (s) => `${s.firstName}${s.lastName ? ` ${s.lastName}` : ''}`;

/** Students with a matching active concession, and the concession total of each (in paise). */
async function loadGroups(schoolId, query) {
  const range = await resolveRange(schoolId, query);
  const groups = await repo.findConcessionGroups(schoolId, range, query);
  const paise = new Map(groups.map((g) => [g.studentId, toPaise(g._sum.amount ?? 0)]));
  return { range, ids: groups.map((g) => g.studentId), paise };
}

/** Student count and total concession for everything that matches (both reports use this). */
export async function getStudentConcessionSummary(schoolId, query = {}) {
  const { paise } = await loadGroups(schoolId, query);
  let total = 0;
  for (const p of paise.values()) total += p;
  return { count: paise.size, amount: fromPaise(total) };
}

export async function getStudentConcessionReport(schoolId, query = {}) {
  const { range, ids, paise } = await loadGroups(schoolId, query);
  const students = await repo.findStudentsPage(schoolId, ids, query);
  const concessions =
    students.length > 0
      ? await repo.findConcessionsForStudents(schoolId, students.map((s) => s.id), range, query)
      : [];

  const names = new Map();
  for (const c of concessions) {
    const entry = names.get(c.studentId) || { fees: new Set(), kinds: new Set() };
    const fee = c.invoice?.feeStructure?.feeCategory?.name ?? c.invoice?.feeName;
    if (fee) entry.fees.add(fee);
    if (c.concessionCategory?.name) entry.kinds.add(c.concessionCategory.name);
    names.set(c.studentId, entry);
  }
  const join = (set) => [...(set || [])].sort((a, b) => a.localeCompare(b)).join(', ');

  const rows = students.map((s) => ({
    id: s.id,
    admissionNumber: s.admissionNumber,
    studentName: fullName(s),
    className: s.class?.name ?? null,
    sectionName: s.section?.name ?? null,
    feeCategories: join(names.get(s.id)?.fees),
    concessionCategories: join(names.get(s.id)?.kinds),
    amount: fromPaise(paise.get(s.id) || 0)
  }));

  return { rows, pagination: paging(query, ids.length) };
}

/**
 * One row per student: every fee by category (the student's full fees, not only the concessioned
 * ones), then the total fee, the concession given and what is left to pay.
 */
export async function getConsolidatedConcessionReport(schoolId, query = {}) {
  const { ids, paise } = await loadGroups(schoolId, query);
  const students = await repo.findStudentsPage(schoolId, ids, query);
  const invoices =
    students.length > 0 ? await repo.findInvoicesForStudents(schoolId, students.map((s) => s.id)) : [];

  const feesByStudent = new Map();
  for (const inv of invoices) {
    const bucket = feesByStudent.get(inv.studentId) || new Map();
    const key = inv.feeStructure?.feeCategoryId || 'other';
    bucket.set(key, (bucket.get(key) || 0) + toPaise(inv.amount));
    feesByStudent.set(inv.studentId, bucket);
  }

  const rows = students.map((s) => {
    const fees = {};
    let totalPaise = 0;
    for (const [key, p] of feesByStudent.get(s.id) || []) {
      fees[key] = fromPaise(p);
      totalPaise += p;
    }
    const concessionPaise = paise.get(s.id) || 0;
    const parents = s.parents || [];

    return {
      id: s.id,
      admissionNumber: s.admissionNumber,
      studentName: fullName(s),
      className: s.class?.name ?? null,
      sectionName: s.section?.name ?? null,
      parentName: fromCustomData(s.customData, PARENT_KEYS) ?? parents[0]?.parent?.name ?? '',
      fees,
      totalFee: fromPaise(totalPaise),
      concessionAmount: fromPaise(concessionPaise),
      concessionPercent: totalPaise > 0 ? Math.round((concessionPaise / totalPaise) * 10000) / 100 : 0,
      netAmount: fromPaise(totalPaise - concessionPaise)
    };
  });

  return { rows, pagination: paging(query, ids.length) };
}