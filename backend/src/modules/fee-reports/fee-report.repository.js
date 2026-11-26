import { prisma } from '../../database/prisma.client.js';

const PAID_STATUSES = ['Paid', 'paid', 'PAID'];

/** Paid fees whose payment time falls inside [from, to). The caller narrows this to the exact day. */
export async function findPaidInvoicesBetween(schoolId, from, to, tx = prisma) {
  return tx.invoice.findMany({
    where: {
      schoolId,
      status: { in: PAID_STATUSES },
      paidAt: { gte: from, lt: to }
    },
    select: {
      id: true,
      amount: true,
      feeName: true,
      paidAt: true,
      paymentMode: true,
      feeStructure: { select: { feeCategory: { select: { id: true, name: true } } } },
      student: { select: { class: { select: { id: true, name: true, gradeLevel: true } } } },
      concessions: { where: { status: 'Active' }, select: { amount: true } }
    }
  });
}

// ---------- Student ledger ----------

export async function findSchoolForLedger(schoolId, tx = prisma) {
  return tx.school.findFirst({
    where: { id: schoolId },
    select: { name: true, address: true, phone: true }
  });
}

export async function findStudentForLedger(schoolId, studentId, tx = prisma) {
  return tx.student.findFirst({
    where: { schoolId, id: studentId },
    select: {
      id: true,
      admissionNumber: true,
      firstName: true,
      lastName: true,
      customData: true,
      class: { select: { id: true, name: true } },
      section: { select: { id: true, name: true } },
      parents: {
        select: {
          relationship: true,
          parent: { select: { name: true, phone: true } }
        }
      }
    }
  });
}

/** Every fee of the student that is not deleted, with the active concessions on it. */
export async function findInvoicesForLedger(schoolId, studentId, tx = prisma) {
  return tx.invoice.findMany({
    where: { schoolId, studentId, status: { not: 'Cancelled' } },
    orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      feeName: true,
      amount: true,
      dueDate: true,
      status: true,
      paidAt: true,
      paymentMode: true,
      transactionReference: true,
      receiptNumber: true,
      feeStructure: {
        select: { feeCategory: { select: { id: true, name: true, paymentOrder: true } } }
      },
      concessions: { where: { status: 'Active' }, select: { amount: true, createdAt: true } }
    }
  });
}

// ---------- Daily collection ----------

const DAILY_SELECT = {
  id: true,
  amount: true,
  feeName: true,
  dueDate: true,
  paidAt: true,
  paymentMode: true,
  receiptNumber: true,
  feeStructure: { select: { feeCategory: { select: { id: true, name: true } } } },
  student: {
    select: {
      admissionNumber: true,
      firstName: true,
      lastName: true,
      class: { select: { id: true, name: true } },
      section: { select: { id: true, name: true } }
    }
  },
  concessions: { where: { status: 'Active' }, select: { amount: true } }
};

const DAILY_SORTERS = {
  admissionNumber: (d) => [{ student: { admissionNumber: d } }],
  studentName: (d) => [{ student: { firstName: d } }, { student: { lastName: d } }],
  className: (d) => [{ student: { class: { name: d } } }],
  sectionName: (d) => [{ student: { section: { name: d } } }],
  feeCategory: (d) => [{ feeName: d }],
  receiptNumber: (d) => [{ receiptNumber: d }],
  paymentMode: (d) => [{ paymentMode: d }],
  feeMonth: (d) => [{ dueDate: d }],
  dueDate: (d) => [{ dueDate: d }],
  feeAmount: (d) => [{ amount: d }],
  paidAt: (d) => [{ paidAt: d }]
};


function paymentModeVariants(mode) {
  const spaced = String(mode).trim().replace(/[\s_-]+/g, ' ');
  return [...new Set([spaced, spaced.replace(/ /g, '_'), spaced.replace(/ /g, '-'), spaced.replace(/ /g, '')])];
}

function dailyWhere(schoolId, start, end, options = {}) {
  const and = [{ schoolId, status: { in: PAID_STATUSES }, paidAt: { gte: start, lt: end } }];

  const studentFilter = {};
  if (options.classId) studentFilter.classId = options.classId;
  if (options.sectionId) studentFilter.sectionId = options.sectionId;
  if (Object.keys(studentFilter).length > 0) and.push({ student: studentFilter });

  if (options.studentId) and.push({ studentId: options.studentId });
  if (options.feeCategoryId) and.push({ feeStructure: { feeCategoryId: options.feeCategoryId } });
  if (options.paymentMode) {
    and.push({
      OR: paymentModeVariants(options.paymentMode).map((m) => ({
        paymentMode: { equals: m, mode: 'insensitive' }
      }))
    });
  }

  if (options.search && typeof options.search === 'string' && options.search.trim()) {
    const term = options.search.trim();
    and.push({
      OR: [
        { receiptNumber: { contains: term, mode: 'insensitive' } },
        { feeName: { contains: term, mode: 'insensitive' } },
        {
          student: {
            OR: [
              { firstName: { contains: term, mode: 'insensitive' } },
              { lastName: { contains: term, mode: 'insensitive' } },
              { admissionNumber: { contains: term, mode: 'insensitive' } }
            ]
          }
        }
      ]
    });
  }

  return { AND: and };
}

/** One page of fees paid inside [start, end) that match the filters. */
export async function findDailyCollection(schoolId, start, end, options = {}, tx = prisma) {
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 50));
  const where = dailyWhere(schoolId, start, end, options);
  const direction = options.order === 'asc' ? 'asc' : 'desc';
  const sorter = DAILY_SORTERS[options.sortBy] || DAILY_SORTERS.paidAt;

  const [total, invoices] = await Promise.all([
    tx.invoice.count({ where }),
    tx.invoice.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [...sorter(direction), { id: 'asc' }],
      select: DAILY_SELECT
    })
  ]);

  return { invoices, total };
}

/** Totals for every matching fee (not only one page): count, fee amount and concession given. */
export async function findDailyTotals(schoolId, start, end, options = {}, tx = prisma) {
  const where = dailyWhere(schoolId, start, end, options);

  const [count, fee, concession] = await Promise.all([
    tx.invoice.count({ where }),
    tx.invoice.aggregate({ where, _sum: { amount: true } }),
    tx.feeConcession.aggregate({
      where: { schoolId, status: 'Active', invoice: where },
      _sum: { amount: true }
    })
  ]);

  return {
    count,
    fee: Number(fee._sum.amount ?? 0),
    concession: Number(concession._sum.amount ?? 0)
  };
}

/** Payment modes used on that day, for the Pay Mode filter. */
export async function findDailyPaymentModes(schoolId, start, end, tx = prisma) {
  const rows = await tx.invoice.findMany({
    where: { schoolId, status: { in: PAID_STATUSES }, paidAt: { gte: start, lt: end } },
    distinct: ['paymentMode'],
    select: { paymentMode: true }
  });
  return rows.map((r) => r.paymentMode);
}