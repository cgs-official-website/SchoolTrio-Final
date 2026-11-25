import { prisma } from '../../database/prisma.client.js';
import * as repo from './fee-report.repository.js';
import { getAuthoritativeTodayString } from '../fees/fee.schemas.js';
import { NotFoundError } from '../../utils/app-error.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Money maths is done in whole paise to avoid floating point drift.
const toPaise = (v) => Math.round(Number(v) * 100);
const fromPaise = (p) => p / 100;

export async function getSchoolTimezone(schoolId) {
  try {
    const school = await prisma.school.findFirst({ where: { id: schoolId }, select: { timezone: true } });
    return school?.timezone || 'Asia/Kolkata';
  } catch {
    return 'Asia/Kolkata';
  }
}

/** YYYY-MM-DD of a moment as seen in the given timezone. */
const dateKeyInZone = (date, timeZone) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);

function addTo(map, key, name, paise, sortKey = null) {
  const existing = map.get(key);
  if (existing) {
    existing.paise += paise;
    existing.count += 1;
  } else {
    map.set(key, { name, paise, count: 1, sortKey });
  }
}

const toRows = (map) =>
  [...map.values()].map((g) => ({ name: g.name, amount: fromPaise(g.paise), payments: g.count }));

/**
 * Day dashboard: what was collected on one day, grouped by payment mode, fee category and class.
 * All three groupings come from the same payments, so their totals are always equal.
 */
export async function getDayReport(schoolId, query = {}) {
  const timeZone = await getSchoolTimezone(schoolId);
  const date = query.date || getAuthoritativeTodayString(timeZone);

  // A wide window around the day, then an exact check in the school's timezone
  const base = Date.parse(`${date}T00:00:00Z`);
  const invoices = await repo.findPaidInvoicesBetween(
    schoolId,
    new Date(base - DAY_MS),
    new Date(base + 2 * DAY_MS)
  );

  const modes = new Map();
  const categories = new Map();
  const classes = new Map();
  let totalPaise = 0;
  let count = 0;

  for (const inv of invoices) {
    if (!inv.paidAt || dateKeyInZone(inv.paidAt, timeZone) !== date) continue;

    const concessionPaise = inv.concessions.reduce((sum, c) => sum + toPaise(c.amount), 0);
    const paise = Math.max(0, toPaise(inv.amount) - concessionPaise);

    const modeName = String(inv.paymentMode || '').trim() || 'Unknown';
    addTo(modes, modeName.toLowerCase(), modeName, paise);

    const categoryName = inv.feeStructure?.feeCategory?.name ?? inv.feeName ?? 'Other';
    addTo(categories, categoryName.toLowerCase(), categoryName, paise);

    const cls = inv.student?.class;
    addTo(classes, cls?.id ?? 'none', cls?.name ?? 'No Class', paise, cls?.gradeLevel ?? null);

    totalPaise += paise;
    count += 1;
  }

  const byAmount = (a, b) => b.amount - a.amount || a.name.localeCompare(b.name);

  const classRows = [...classes.values()]
    .sort((a, b) => {
      const ga = a.sortKey ?? Number.MAX_SAFE_INTEGER;
      const gb = b.sortKey ?? Number.MAX_SAFE_INTEGER;
      return ga - gb || a.name.localeCompare(b.name, undefined, { numeric: true });
    })
    .map((g) => ({ name: g.name, amount: fromPaise(g.paise), payments: g.count }));

  return {
    date,
    total: fromPaise(totalPaise),
    paymentCount: count,
    paymentModes: toRows(modes).sort(byAmount),
    categories: toRows(categories).sort(byAmount),
    classes: classRows
  };
}

// ---------- Daily collection (fee-wise list for one day) ----------

/** Offset of a timezone from UTC, in ms, at a given moment. */
function tzOffsetMs(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).formatToParts(date);
  const n = (type) => Number(parts.find((p) => p.type === type).value);
  const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'));
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** The exact moment a calendar day begins in the given timezone. */
function startOfDayUtc(dateKey, timeZone) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const wallClock = Date.UTC(y, m - 1, d);
  let guess = wallClock;
  for (let i = 0; i < 2; i += 1) {
    guess = wallClock - tzOffsetMs(new Date(guess), timeZone);
  }
  return new Date(guess);
}

/** [start, end) of one calendar day in the school's timezone. */
export function dayWindow(dateKey, timeZone) {
  const next = new Date(Date.parse(`${dateKey}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
  return { start: startOfDayUtc(dateKey, timeZone), end: startOfDayUtc(next, timeZone) };
}

/** "2026-11-15" becomes "Nov 2026". */
function feeMonth(dueDate) {
  const m = /^(\d{4})-(\d{2})/.exec(dueDate || '');
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : '';
}

function formatDailyRow(inv) {
  const s = inv.student;
  const feePaise = toPaise(inv.amount);
  const concessionPaise = inv.concessions.reduce((sum, c) => sum + toPaise(c.amount), 0);
  return {
    id: inv.id,
    admissionNumber: s?.admissionNumber ?? null,
    studentName: s ? `${s.firstName}${s.lastName ? ` ${s.lastName}` : ''}` : 'Unknown Student',
    className: s?.class?.name ?? null,
    sectionName: s?.section?.name ?? null,
    feeCategory: inv.feeStructure?.feeCategory?.name ?? inv.feeName,
    receiptNumber: inv.receiptNumber ?? null,
    paymentMode: inv.paymentMode ?? null,
    feeMonth: feeMonth(inv.dueDate),
    dueDate: inv.dueDate,
    feeAmount: fromPaise(feePaise),
    concessionAmount: fromPaise(concessionPaise),
    netAmount: fromPaise(feePaise - concessionPaise)
  };
}

async function resolveDay(schoolId, query) {
  const timeZone = await getSchoolTimezone(schoolId);
  const date = query.date || getAuthoritativeTodayString(timeZone);
  return { date, ...dayWindow(date, timeZone) };
}

/** One page of the fees paid on the chosen day (default today). */
export async function getDailyCollection(schoolId, query = {}) {
  const { start, end } = await resolveDay(schoolId, query);
  const { invoices, total } = await repo.findDailyCollection(schoolId, start, end, query);

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));

  return {
    rows: invoices.map(formatDailyRow),
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

/** Totals for the whole day under the current filters, plus the payment modes used that day. */
export async function getDailyCollectionSummary(schoolId, query = {}) {
  const { date, start, end } = await resolveDay(schoolId, query);

  const [totals, modes] = await Promise.all([
    repo.findDailyTotals(schoolId, start, end, query),
    repo.findDailyPaymentModes(schoolId, start, end)
  ]);

  const feePaise = toPaise(totals.fee);
  const concessionPaise = toPaise(totals.concession);

  const seen = new Set();
  const paymentModes = [];
  for (const mode of modes) {
    const name = String(mode || '').trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    paymentModes.push(name);
  }
  paymentModes.sort((a, b) => a.localeCompare(b));

  return {
    date,
    count: totals.count,
    feeAmount: fromPaise(feePaise),
    concessionAmount: fromPaise(concessionPaise),
    netAmount: fromPaise(feePaise - concessionPaise),
    paymentModes
  };
}

// ---------- Student ledger ----------

const normKey = (k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');

export const PARENT_KEYS = [
  'parentname',
  'parentsname',
  'guardianname',
  'guardiansname',
  'fathername',
  'fathersname',
  'mothername',
  'mothersname',
  'father',
  'mother',
  'parent',
  'guardian'
];
const MOBILE_KEYS = [
  'mobile',
  'mobileno',
  'mobilenumber',
  'phone',
  'phoneno',
  'phonenumber',
  'fathermobile',
  'parentmobile',
  'parentphone',
  'contactnumber'
];

/** Looks for the first non-empty value in customData whose key (ignoring case and punctuation) is in `wanted`. */
export function fromCustomData(data, wanted) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;

  const byKey = new Map();
  for (const [key, value] of Object.entries(data)) {
    if (typeof value !== 'string' && typeof value !== 'number') continue;
    const text = String(value).trim();
    if (text) byKey.set(normKey(key), text);
  }

  for (const w of wanted) {
    if (byKey.has(w)) return byKey.get(w);
  }
  return null;
}

const ddmmyyyy = (key) => (key ? key.split('-').reverse().join('-') : '');

/**
 * Everything the ledger PDF needs for one student, as on a given date (default today):
 *   dues     - every fee with its due date, amount, concession and net amount
 *   received - payments made up to that date, one row per receipt
 *   totals   - due, concession, netDue (due - concession), received and balance (netDue - received)
 */
export async function getStudentLedger(schoolId, studentId, query = {}) {
  const timeZone = await getSchoolTimezone(schoolId);
  const asOn = query.asOn || getAuthoritativeTodayString(timeZone);

  const [student, school, invoices] = await Promise.all([
    repo.findStudentForLedger(schoolId, studentId),
    repo.findSchoolForLedger(schoolId),
    repo.findInvoicesForLedger(schoolId, studentId)
  ]);
  if (!student) throw new NotFoundError('Student');

  const dueRows = [];
  const receipts = new Map();
  let duePaise = 0;
  let concessionPaise = 0;
  let receivedPaise = 0;

  for (const inv of invoices) {
    const grossPaise = toPaise(inv.amount);
    const invConcessionPaise = inv.concessions
      .filter((c) => dateKeyInZone(c.createdAt, timeZone) <= asOn)
      .reduce((sum, c) => sum + toPaise(c.amount), 0);

    duePaise += grossPaise;
    concessionPaise += invConcessionPaise;

    const category = inv.feeStructure?.feeCategory;
    dueRows.push({
      order: category?.paymentOrder ?? 0,
      dueDate: inv.dueDate || '',
      particulars: category?.name ?? inv.feeName,
      grossPaise,
      concessionPaise: invConcessionPaise
    });

    const isPaid = String(inv.status).toLowerCase() === 'paid';
    if (!isPaid || !inv.paidAt) continue;

    const paidKey = dateKeyInZone(inv.paidAt, timeZone);
    if (paidKey > asOn) continue;

    const netPaise = Math.max(0, grossPaise - invConcessionPaise);
    receivedPaise += netPaise;

    // One row per receipt: fees paid together on one receipt show as one line
    const mode = String(inv.paymentMode || '').trim() || 'Unknown';
    const groupKey = [inv.receiptNumber || inv.id, mode.toLowerCase(), paidKey].join('|');
    const existing = receipts.get(groupKey);
    if (existing) {
      existing.paise += netPaise;
      if (inv.transactionReference) existing.cheques.add(inv.transactionReference);
    } else {
      receipts.set(groupKey, {
        receiptNumber: inv.receiptNumber || '',
        paymentType: mode,
        dateKey: paidKey,
        cheques: new Set(inv.transactionReference ? [inv.transactionReference] : []),
        paise: netPaise
      });
    }
  }

  const dues = dueRows
    .sort(
      (a, b) =>
        a.order - b.order ||
        a.dueDate.localeCompare(b.dueDate) ||
        a.particulars.localeCompare(b.particulars, undefined, { numeric: true })
    )
    .map((r) => ({
      particulars: r.particulars,
      dueDate: ddmmyyyy(r.dueDate),
      amount: fromPaise(r.grossPaise),
      concession: fromPaise(r.concessionPaise),
      netAmount: fromPaise(r.grossPaise - r.concessionPaise)
    }));

  const received = [...receipts.values()]
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.paymentType.localeCompare(b.paymentType))
    .map((r) => ({
      receiptNumber: r.receiptNumber,
      paymentType: r.paymentType,
      chequeNo: [...r.cheques].join(', '),
      date: ddmmyyyy(r.dateKey),
      amount: fromPaise(r.paise)
    }));

  const links = student.parents || [];
  const netDuePaise = duePaise - concessionPaise;

  return {
    asOn,
    generatedAt: new Date().toISOString(),
    school: {
      name: school?.name ?? '',
      address: school?.address ?? '',
      phone: school?.phone ?? ''
    },
    student: {
      id: student.id,
      name: `${student.firstName}${student.lastName ? ` ${student.lastName}` : ''}`,
      admissionNumber: student.admissionNumber,
      className: student.class?.name ?? '',
      sectionName: student.section?.name ?? '',
      parentName: fromCustomData(student.customData, PARENT_KEYS) ?? links[0]?.parent?.name ?? '',
      mobile: fromCustomData(student.customData, MOBILE_KEYS) ?? links[0]?.parent?.phone ?? ''
    },
    dues,
    received,
    totals: {
      due: fromPaise(duePaise),
      concession: fromPaise(concessionPaise),
      netDue: fromPaise(netDuePaise),
      received: fromPaise(receivedPaise),
      balance: fromPaise(netDuePaise - receivedPaise)
    }
  };
}