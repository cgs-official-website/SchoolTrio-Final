import { prisma } from '../../database/prisma.client.js';

const SELECT = {
  id: true,
  amount: true,
  valueType: true,
  value: true,
  description: true,
  createdAt: true,
  concessionCategory: { select: { id: true, name: true } },
  invoice: {
    select: {
      id: true,
      amount: true,
      dueDate: true,
      feeName: true,
      feeStructure: { select: { feeCategory: { select: { id: true, name: true } } } }
    }
  },
  student: {
    select: {
      admissionNumber: true,
      firstName: true,
      lastName: true,
      customData: true,
      class: { select: { id: true, name: true } },
      section: { select: { id: true, name: true } },
      parents: { select: { relationship: true, parent: { select: { name: true } } } }
    }
  }
};

const SORTERS = {
  admissionNumber: (d) => [{ student: { admissionNumber: d } }],
  studentName: (d) => [{ student: { firstName: d } }, { student: { lastName: d } }],
  className: (d) => [{ student: { class: { name: d } } }],
  sectionName: (d) => [{ student: { section: { name: d } } }],
  feeCategory: (d) => [{ invoice: { feeName: d } }],
  concessionCategory: (d) => [{ concessionCategory: { name: d } }],
  concessionDate: (d) => [{ createdAt: d }],
  dueDate: (d) => [{ invoice: { dueDate: d } }],
  feeAmount: (d) => [{ invoice: { amount: d } }],
  amount: (d) => [{ amount: d }]
};

/**
 * Active concessions only, on fees that are not deleted.
 * range: { start, end } - the concession date window (either can be null).
 */
export function buildWhere(schoolId, range, options = {}) {
  const and = [{ schoolId, status: 'Active', invoice: { status: { not: 'Cancelled' } } }];

  const studentFilter = {};
  if (options.classId) studentFilter.classId = options.classId;
  if (options.sectionId) studentFilter.sectionId = options.sectionId;
  if (Object.keys(studentFilter).length > 0) and.push({ student: studentFilter });

  if (options.studentId) and.push({ studentId: options.studentId });
  if (options.concessionCategoryId) and.push({ concessionCategoryId: options.concessionCategoryId });
  if (options.feeCategoryId) and.push({ invoice: { feeStructure: { feeCategoryId: options.feeCategoryId } } });

  const created = {};
  if (range.start) created.gte = range.start;
  if (range.end) created.lt = range.end;
  if (Object.keys(created).length > 0) and.push({ createdAt: created });

  const due = {};
  if (options.dueFrom) due.gte = options.dueFrom;
  if (options.dueTo) due.lte = options.dueTo;
  if (Object.keys(due).length > 0) and.push({ invoice: { dueDate: due } });

  if (options.search && typeof options.search === 'string' && options.search.trim()) {
    const term = options.search.trim();
    and.push({
      OR: [
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

export async function findConcessionReport(schoolId, range, options = {}, tx = prisma) {
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 50));
  const where = buildWhere(schoolId, range, options);
  const direction = options.order === 'asc' ? 'asc' : 'desc';
  const sorter = SORTERS[options.sortBy] || SORTERS.concessionDate;

  const [total, concessions] = await Promise.all([
    tx.feeConcession.count({ where }),
    tx.feeConcession.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [...sorter(direction), { id: 'asc' }],
      select: SELECT
    })
  ]);

  return { concessions, total };
}

/** Count and total amount of every matching concession (not only one page). */
export async function findConcessionTotals(schoolId, range, options = {}, tx = prisma) {
  const where = buildWhere(schoolId, range, options);
  const res = await tx.feeConcession.aggregate({
    where,
    _sum: { amount: true },
    _count: { _all: true }
  });
  return { count: res._count._all, amount: Number(res._sum.amount ?? 0) };
}