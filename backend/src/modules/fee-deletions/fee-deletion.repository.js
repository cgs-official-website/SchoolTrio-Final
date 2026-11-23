import { prisma } from '../../database/prisma.client.js';

const DELETION_SELECT = {
  id: true,
  invoiceId: true,
  studentId: true,
  feeName: true,
  amount: true,
  concessionAmount: true,
  dueDate: true,
  reason: true,
  deletedByName: true,
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
  }
};

const SORTERS = {
  admissionNumber: (d) => [{ student: { admissionNumber: d } }],
  studentName: (d) => [{ student: { firstName: d } }, { student: { lastName: d } }],
  className: (d) => [{ student: { class: { name: d } } }],
  sectionName: (d) => [{ student: { section: { name: d } } }],
  feeCategory: (d) => [{ feeName: d }],
  dueDate: (d) => [{ dueDate: d }],
  amount: (d) => [{ amount: d }],
  createdAt: (d) => [{ createdAt: d }]
};

export async function findFeeDeletions(schoolId, options = {}, tx = prisma) {
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 50));
  const skip = (page - 1) * limit;

  const and = [{ schoolId }];

  const studentFilter = {};
  if (options.classId) studentFilter.classId = options.classId;
  if (options.sectionId) studentFilter.sectionId = options.sectionId;
  if (Object.keys(studentFilter).length > 0) and.push({ student: studentFilter });

  if (options.studentId) and.push({ studentId: options.studentId });

  if (options.search && typeof options.search === 'string' && options.search.trim()) {
    const term = options.search.trim();
    and.push({
      OR: [
        { feeName: { contains: term, mode: 'insensitive' } },
        { reason: { contains: term, mode: 'insensitive' } },
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

  const where = { AND: and };
  const direction = options.order === 'asc' ? 'asc' : 'desc';
  const sorter = SORTERS[options.sortBy] || SORTERS.createdAt;

  const [total, deletions] = await Promise.all([
    tx.feeDeletion.count({ where }),
    tx.feeDeletion.findMany({
      where,
      skip,
      take: limit,
      orderBy: [...sorter(direction), { id: 'asc' }],
      select: DELETION_SELECT
    })
  ]);

  return { deletions, total };
}

/** Every fee of one student that is not already deleted, with the concessions given on it. */
export async function findInvoicesForStudent(schoolId, studentId, tx = prisma) {
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

export async function cancelActiveConcessions(schoolId, invoiceId, tx = prisma) {
  return tx.feeConcession.updateMany({
    where: { schoolId, invoiceId, status: 'Active' },
    data: { status: 'Cancelled' }
  });
}

export async function cancelInvoice(schoolId, id, tx = prisma) {
  return tx.invoice.update({
    where: { schoolId_id: { schoolId, id } },
    data: { status: 'Cancelled' }
  });
}

export async function createDeletionRecords(rows, tx = prisma) {
  return tx.feeDeletion.createMany({ data: rows });
}

export async function findStudentInTenant(schoolId, id, tx = prisma) {
  return tx.student.findFirst({ where: { schoolId, id }, select: { id: true } });
}