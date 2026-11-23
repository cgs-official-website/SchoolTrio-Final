import { prisma } from '../../database/prisma.client.js';

/**
 * Fee Entry Data Access Repository
 * A "fee entry" row in the UI is one student's invoice. Everything is scoped to schoolId.
 */

const ENTRY_SELECT = {
  id: true,
  studentId: true,
  feeStructureId: true,
  feeName: true,
  amount: true,
  dueDate: true,
  status: true,
  createdAt: true,
  student: {
    select: {
      id: true,
      admissionNumber: true,
      firstName: true,
      lastName: true,
      gender: true,
      class: { select: { id: true, name: true } },
      section: { select: { id: true, name: true } }
    }
  },
  feeStructure: {
    select: {
      id: true,
      targetType: true,
      feeCategoryId: true,
      feeCategory: { select: { id: true, name: true } }
    }
  },
  concessions: {
    where: { 
      status: 'Active' 
    },
    select: { 
      amount: true 
    } 
  }
};

const SORTERS = {
  studentName: (d) => [{ student: { firstName: d } }, { student: { lastName: d } }],
  className: (d) => [{ student: { class: { name: d } } }],
  sectionName: (d) => [{ student: { section: { name: d } } }],
  gender: (d) => [{ student: { gender: d } }],
  amount: (d) => [{ amount: d }],
  feeCategory: (d) => [{ feeName: d }],
  feeType: (d) => [{ feeStructure: { targetType: d } }],
  dueDate: (d) => [{ dueDate: d }],
  createdAt: (d) => [{ createdAt: d }]
};

export async function findFeeEntries(schoolId, options = {}, tx = prisma) {
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 50));
  const skip = (page - 1) * limit;

  // Deleted fees are stored as Cancelled and never listed
  const and = [{ schoolId, status: { not: 'Cancelled' } }];

  const studentFilter = {};
  if (options.classId) studentFilter.classId = options.classId;
  if (options.sectionId) studentFilter.sectionId = options.sectionId;
  if (options.gender) studentFilter.gender = { equals: options.gender, mode: 'insensitive' };
  if (Object.keys(studentFilter).length > 0) and.push({ student: studentFilter });

  if (options.feeType) and.push({ feeStructure: { targetType: options.feeType } });
  if (options.studentId) and.push({ studentId: options.studentId });
  if (options.feeCategoryId) and.push({ feeStructure: { feeCategoryId: options.feeCategoryId } });

  if (options.search && typeof options.search === 'string' && options.search.trim()) {
    const term = options.search.trim();
    and.push({
      OR: [
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

  const where = { AND: and };
  const direction = options.order === 'asc' ? 'asc' : 'desc';
  const sorter = SORTERS[options.sortBy] || SORTERS.createdAt;

  const [total, entries] = await Promise.all([
    tx.invoice.count({ where }),
    tx.invoice.findMany({
      where,
      skip,
      take: limit,
      orderBy: [...sorter(direction), { id: 'asc' }],
      select: ENTRY_SELECT
    })
  ]);

  return { entries, total };
}

export async function findFeeEntryById(schoolId, id, tx = prisma) {
  return tx.invoice.findFirst({ where: { schoolId, id }, select: ENTRY_SELECT });
}

export async function findInvoiceForUpdate(schoolId, id, tx = prisma) {
  const rows = await tx.$queryRaw`
    SELECT id, student_id AS "studentId", fee_structure_id AS "feeStructureId",
           fee_name AS "feeName", amount, due_date AS "dueDate", status,
           paid_at AS "paidAt", payment_mode AS "paymentMode",
           transaction_reference AS "transactionReference", receipt_number AS "receiptNumber"
    FROM "invoices"
    WHERE "school_id" = ${schoolId}::uuid
      AND "id" = ${id}::uuid
    FOR UPDATE
  `;
  return rows[0] || null;
}

export async function updateInvoice(schoolId, id, data, tx = prisma) {
  return tx.invoice.update({
    where: { schoolId_id: { schoolId, id } },
    data: {
      ...(data.amount !== undefined && { amount: data.amount }),
      ...(data.dueDate !== undefined && { dueDate: data.dueDate })
    }
  });
}

export async function cancelInvoice(schoolId, id, tx = prisma) {
  return tx.invoice.update({
    where: { schoolId_id: { schoolId, id } },
    data: { status: 'Cancelled' }
  });
}

export async function createFeeEntryStructure(schoolId, data, tx = prisma) {
  return tx.feeStructure.create({
    data: {
      schoolId,
      name: data.name,
      amount: data.amount,
      dueDate: data.dueDate,
      classId: data.classId ?? null,
      feeCategoryId: data.feeCategoryId,
      targetType: data.targetType,
      targetIds: data.targetIds,
      gender: data.gender ?? null,
      customData: null
    }
  });
}

export async function findFeeCategoryInTenant(schoolId, id, tx = prisma) {
  return tx.feeCategory.findFirst({ where: { schoolId, id }, select: { id: true, name: true } });
}

/**
 * Counts how many of the given ids exist in this tenant, so targets from another school
 * (or deleted ones) are rejected.
 */
export async function countTargetsInTenant(schoolId, targetType, ids, tx = prisma) {
  const where = { schoolId, id: { in: ids } };
  if (targetType === 'CLASS') return tx.class.count({ where });
  if (targetType === 'SECTION') return tx.section.count({ where });
  if (targetType === 'STUDENT') return tx.student.count({ where });
  return 0;
}