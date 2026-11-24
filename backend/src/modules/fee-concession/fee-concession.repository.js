import { prisma } from '../../database/prisma.client.js';

const CONCESSION_SELECT = {
  id: true,
  invoiceId: true,
  studentId: true,
  concessionType: true,
  valueType: true,
  value: true,
  amount: true,
  description: true,
  createdAt: true,
  student: {
    select: {
      id: true,
      admissionNumber: true,
      firstName: true,
      lastName: true,
      class: { select: { id: true, name: true } },
      section: { select: { id: true, name: true } }
    }
  },
  concessionCategory: { select: { id: true, name: true } },
    invoice: {
    select: {
      id: true,
      status: true,
      feeName: true,
      amount: true,
      feeStructure: { select: { feeCategory: { select: { id: true, name: true } } } },
      concessions: { where: { status: 'Active' }, select: { amount: true } }
    }
  }
};

const SORTERS = {
  admissionNumber: (d) => [{ student: { admissionNumber: d } }],
  studentName: (d) => [{ student: { firstName: d } }, { student: { lastName: d } }],
  className: (d) => [{ student: { class: { name: d } } }],
  sectionName: (d) => [{ student: { section: { name: d } } }],
  feeCategory: (d) => [{ invoice: { feeName: d } }],
  amount: (d) => [{ invoice: { amount: d } }],
  concessionAmount: (d) => [{ amount: d }],
  concessionType: (d) => [{ concessionType: d }],
  concessionCategory: (d) => [{ concessionCategory: { name: d } }],
  createdAt: (d) => [{ createdAt: d }]
};

export async function findFeeConcessions(schoolId, options = {}, tx = prisma) {
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 50));
  const skip = (page - 1) * limit;

  // Deleted concessions (Cancelled) and concessions on cancelled fees are never listed
  const and = [{ schoolId, status: 'Active', invoice: { status: { not: 'Cancelled' } } }];

  const studentFilter = {};
  if (options.classId) studentFilter.classId = options.classId;
  if (options.sectionId) studentFilter.sectionId = options.sectionId;
  if (Object.keys(studentFilter).length > 0) and.push({ student: studentFilter });

  if (options.studentId) and.push({ studentId: options.studentId });
  if (options.feeCategoryId) {
    and.push({ invoice: { feeStructure: { feeCategoryId: options.feeCategoryId } } });
  }
  if (options.concessionCategoryId) and.push({ concessionCategoryId: options.concessionCategoryId });

  if (options.search && typeof options.search === 'string' && options.search.trim()) {
    const term = options.search.trim();
    and.push({
      student: {
        OR: [
          { firstName: { contains: term, mode: 'insensitive' } },
          { lastName: { contains: term, mode: 'insensitive' } },
          { admissionNumber: { contains: term, mode: 'insensitive' } }
        ]
      }
    });
  }

  const where = { AND: and };
  const direction = options.order === 'asc' ? 'asc' : 'desc';
  const sorter = SORTERS[options.sortBy] || SORTERS.createdAt;

  const [total, concessions] = await Promise.all([
    tx.feeConcession.count({ where }),
    tx.feeConcession.findMany({
      where,
      skip,
      take: limit,
      orderBy: [...sorter(direction), { id: 'asc' }],
      select: CONCESSION_SELECT
    })
  ]);

  return { concessions, total };
}

/** Pending fees of one student with the concessions already given on each. */
export async function findPendingInvoicesForStudent(schoolId, studentId, tx = prisma) {
  return tx.invoice.findMany({
    where: { schoolId, studentId, status: 'Pending' },
    orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      feeName: true,
      amount: true,
      dueDate: true,
      feeStructure: { select: { feeCategory: { select: { id: true, name: true } } } },
      concessions: { where: { status: 'Active' }, select: { amount: true } }
    }
  });
}

export async function sumActiveConcessions(schoolId, invoiceId, tx = prisma) {
  const res = await tx.feeConcession.aggregate({
    where: { schoolId, invoiceId, status: 'Active' },
    _sum: { amount: true }
  });
  return Number(res._sum.amount ?? 0);
}

export async function createConcessions(rows, tx = prisma) {
  return tx.feeConcession.createMany({ data: rows });
}

export async function findActiveConcession(schoolId, id, tx = prisma) {
  return tx.feeConcession.findFirst({
    where: { schoolId, id, status: 'Active' },
    select: { id: true, invoiceId: true, studentId: true, amount: true, valueType: true, value: true }
  });
}

export async function cancelConcession(schoolId, id, tx = prisma) {
  return tx.feeConcession.update({
    where: { schoolId_id: { schoolId, id } },
    data: { status: 'Cancelled' }
  });
}

export async function findConcessionCategoryInTenant(schoolId, id, tx = prisma) {
  return tx.concessionCategory.findFirst({ where: { schoolId, id }, select: { id: true, name: true } });
}

export async function findStudentInTenant(schoolId, id, tx = prisma) {
  return tx.student.findFirst({ where: { schoolId, id }, select: { id: true } });
}