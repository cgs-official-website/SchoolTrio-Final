import { prisma } from '../../database/prisma.client.js';

const PAID_STATUSES = ['Paid', 'paid', 'PAID'];

const CANCELLATION_SELECT = {
  id: true,
  invoiceId: true,
  studentId: true,
  feeName: true,
  amount: true,
  receiptNumber: true,
  paymentMode: true,
  transactionReference: true,
  paidAt: true,
  description: true,
  cancelledByName: true,
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
  receiptNumber: (d) => [{ receiptNumber: d }],
  paymentMode: (d) => [{ paymentMode: d }],
  amount: (d) => [{ amount: d }],
  createdAt: (d) => [{ createdAt: d }]
};

export async function findFeeCancellations(schoolId, options = {}, tx = prisma) {
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
        { receiptNumber: { contains: term, mode: 'insensitive' } },
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

  const [total, cancellations] = await Promise.all([
    tx.feeCancellation.count({ where }),
    tx.feeCancellation.findMany({
      where,
      skip,
      take: limit,
      orderBy: [...sorter(direction), { id: 'asc' }],
      select: CANCELLATION_SELECT
    })
  ]);

  return { cancellations, total };
}

/** Paid fees of one student: the payments that can be cancelled. */
export async function findPaidInvoicesForStudent(schoolId, studentId, tx = prisma) {
  return tx.invoice.findMany({
    where: { schoolId, studentId, status: { in: PAID_STATUSES } },
    orderBy: [{ paidAt: 'desc' }, { id: 'asc' }],
    select: {
      id: true,
      feeName: true,
      amount: true,
      paidAt: true,
      paymentMode: true,
      receiptNumber: true,
      feeStructure: { select: { feeCategory: { select: { id: true, name: true } } } }
    }
  });
}

export async function createCancellationRecord(data, tx = prisma) {
  return tx.feeCancellation.create({ data });
}

/** Puts the fee back to Pending and clears every payment detail. */
export async function resetInvoiceToPending(schoolId, id, tx = prisma) {
  return tx.invoice.update({
    where: { schoolId_id: { schoolId, id } },
    data: {
      status: 'Pending',
      paidAt: null,
      paymentMode: null,
      transactionReference: null,
      receiptNumber: null
    }
  });
}