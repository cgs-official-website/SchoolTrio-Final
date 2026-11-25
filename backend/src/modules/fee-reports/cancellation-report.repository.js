import { prisma } from '../../database/prisma.client.js';

// The invoice report groups in memory, so it reads at most this many cancellations
const MAX_ROWS = 20000;

const SELECT = {
  id: true,
  studentId: true,
  feeName: true,
  amount: true,
  receiptNumber: true,
  paymentMode: true,
  paidAt: true,
  description: true,
  cancelledByName: true,
  createdAt: true,
  student: {
    select: {
      admissionNumber: true,
      firstName: true,
      lastName: true,
      class: { select: { name: true } },
      section: { select: { name: true } }
    }
  },
  invoice: {
    select: { feeStructure: { select: { feeCategory: { select: { id: true, name: true } } } } }
  }
};

const SORTERS = {
  admissionNumber: (d) => [{ student: { admissionNumber: d } }],
  studentName: (d) => [{ student: { firstName: d } }, { student: { lastName: d } }],
  className: (d) => [{ student: { class: { name: d } } }],
  receiptNumber: (d) => [{ receiptNumber: d }],
  paymentMode: (d) => [{ paymentMode: d }],
  cancelDate: (d) => [{ createdAt: d }],
  paidAt: (d) => [{ paidAt: d }],
  feeCategory: (d) => [{ feeName: d }],
  amount: (d) => [{ amount: d }]
};

/** range: { start, end } - the cancel date window (either side can be null). */
function buildWhere(schoolId, range, options = {}) {
  const and = [{ schoolId }];

  const studentFilter = {};
  if (options.classId) studentFilter.classId = options.classId;
  if (options.sectionId) studentFilter.sectionId = options.sectionId;
  if (Object.keys(studentFilter).length > 0) and.push({ student: studentFilter });

  if (options.studentId) and.push({ studentId: options.studentId });
  if (options.feeCategoryId) and.push({ invoice: { feeStructure: { feeCategoryId: options.feeCategoryId } } });
  if (options.paymentMode) and.push({ paymentMode: { equals: options.paymentMode, mode: 'insensitive' } });

  const created = {};
  if (range.start) created.gte = range.start;
  if (range.end) created.lt = range.end;
  if (Object.keys(created).length > 0) and.push({ createdAt: created });

  if (options.search && typeof options.search === 'string' && options.search.trim()) {
    const term = options.search.trim();
    and.push({
      OR: [
        { receiptNumber: { contains: term, mode: 'insensitive' } },
        { feeName: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
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

/** One page, sorted and paged in the database (Category Cancellation: one row per cancelled fee). */
export async function findCancellationPage(schoolId, range, options = {}, tx = prisma) {
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 50));
  const where = buildWhere(schoolId, range, options);
  const direction = options.order === 'asc' ? 'asc' : 'desc';
  const sorter = SORTERS[options.sortBy] || SORTERS.cancelDate;

  const [total, cancellations] = await Promise.all([
    tx.feeCancellation.count({ where }),
    tx.feeCancellation.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [...sorter(direction), { id: 'asc' }],
      select: SELECT
    })
  ]);

  return { cancellations, total };
}

export async function findCancellationTotals(schoolId, range, options = {}, tx = prisma) {
  const res = await tx.feeCancellation.aggregate({
    where: buildWhere(schoolId, range, options),
    _sum: { amount: true },
    _count: { _all: true }
  });
  return { count: res._count._all, amount: Number(res._sum.amount ?? 0) };
}

/** Every matching cancellation (Invoice Cancellation groups them by receipt in memory). */
export async function findAllCancellations(schoolId, range, options = {}, tx = prisma) {
  return tx.feeCancellation.findMany({
    where: buildWhere(schoolId, range, options),
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    take: MAX_ROWS,
    select: SELECT
  });
}

/** Payment modes that appear on any cancellation, for the Pay Mode filter. */
export async function findCancellationPaymentModes(schoolId, tx = prisma) {
  const rows = await tx.feeCancellation.findMany({
    where: { schoolId },
    distinct: ['paymentMode'],
    select: { paymentMode: true }
  });
  return rows.map((r) => r.paymentMode);
}