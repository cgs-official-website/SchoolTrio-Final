import * as repo from './concession-report.repository.js';
import { getSchoolTimezone, dayWindow, fromCustomData, PARENT_KEYS } from './fee-report.service.js';

/** Concession date range as exact moments in the school's timezone (either side can be open). */
async function resolveRange(schoolId, query) {
  if (!query.fromDate && !query.toDate) return { start: null, end: null };
  const timeZone = await getSchoolTimezone(schoolId);
  return {
    start: query.fromDate ? dayWindow(query.fromDate, timeZone).start : null,
    end: query.toDate ? dayWindow(query.toDate, timeZone).end : null
  };
}

function formatRow(c) {
  const s = c.student;
  const parents = s?.parents || [];
  return {
    id: c.id,
    admissionNumber: s?.admissionNumber ?? null,
    studentName: s ? `${s.firstName}${s.lastName ? ` ${s.lastName}` : ''}` : 'Unknown Student',
    className: s?.class?.name ?? null,
    sectionName: s?.section?.name ?? null,
    parentName: fromCustomData(s?.customData, PARENT_KEYS) ?? parents[0]?.parent?.name ?? '',
    feeCategory: c.invoice?.feeStructure?.feeCategory?.name ?? c.invoice?.feeName ?? null,
    concessionCategory: c.concessionCategory?.name ?? null,
    concessionDate: c.createdAt,
    description: c.description ?? '',
    feeAmount: Number(c.invoice?.amount ?? 0),
    percentage: c.valueType === 'PERCENTAGE' ? Number(c.value) : null,
    amount: Number(c.amount),
    dueDate: c.invoice?.dueDate ?? null
  };
}

export async function getConcessionReport(schoolId, query = {}) {
  const range = await resolveRange(schoolId, query);
  const { concessions, total } = await repo.findConcessionReport(schoolId, range, query);

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));

  return {
    rows: concessions.map(formatRow),
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

export async function getConcessionReportSummary(schoolId, query = {}) {
  const range = await resolveRange(schoolId, query);
  return repo.findConcessionTotals(schoolId, range, query);
}