import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.client.js';

/**
 * Invoice Data Access Repository Layer (Phase 4C.6-B1)
 *
 * Strict Multi-Tenant Rules:
 * 1. Every query is filtered explicitly by schoolId.
 * 2. Cross-tenant access is strictly prevented.
 * 3. PostgreSQL Decimal aggregations are calculated directly in database.
 * 4. Supports transaction propagation via optional `tx` client.
 */

export const INVOICE_SELECT_CONFIG = {
  id: true,
  schoolId: true,
  studentId: true,
  feeStructureId: true,
  collectionPeriodId: true,
  feeName: true,
  amount: true,
  dueDate: true,
  status: true,
  paidAt: true,
  paymentMode: true,
  transactionReference: true,
  receiptNumber: true,
  customData: true,
  createdAt: true,
  updatedAt: true,
  student: {
    select: {
      id: true,
      admissionNumber: true,
      firstName: true,
      lastName: true,
      status: true,
      class: {
        select: {
          id: true,
          name: true
        }
      },
      section: {
        select: {
          id: true,
          name: true
        }
      }
    }
  },
  feeStructure: {
    select: {
      id: true,
      name: true,
      amount: true,
      dueDate: true,
      classId: true,
      collectionPeriodId: true
    }
  },
  collectionPeriod: {
    select: {
      id: true,
      name: true,
      dueDate: true,
      displayOrder: true
    }
  }
};

/**
 * Lists invoices with pagination, filtering, search, and relations.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} options - Query filters and pagination
 * @param {Object} [tx=prisma]
 * @returns {Promise<{ invoices: Array, total: number }>}
 */
export async function findInvoices(schoolId, options = {}, tx = prisma) {
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 50));
  const skip = (page - 1) * limit;

  const where = {
    schoolId
  };

  // Student filter (single or array for parent child-scoping)
  if (options.studentIds && Array.isArray(options.studentIds)) {
    where.studentId = { in: options.studentIds };
  } else if (options.studentId) {
    where.studentId = options.studentId;
  }

  // Class filter (matches either student's class or feeStructure's class)
  if (options.classId) {
    where.feeStructure = {
      classId: options.classId
    };
  }

  // Fee structure filter
  if (options.feeStructureId) {
    where.feeStructureId = options.feeStructureId;
  }

  // Collection period filter
  if (options.collectionPeriodId) {
    where.collectionPeriodId = options.collectionPeriodId;
  }

  // Status filter
  if (options.status) {
    where.status = options.status;
  }

  // Overdue filter
  const todayStr = options.currentDate || new Date().toISOString().slice(0, 10);
  if (options.overdue === true) {
    where.status = 'Pending';
    where.dueDate = { lt: todayStr };
  } else if (options.overdue === false) {
    where.OR = [
      { status: { not: 'Pending' } },
      { dueDate: { gte: todayStr } }
    ];
  }

  // Search filter across feeName, student firstName, lastName, admissionNumber
  if (options.search && typeof options.search === 'string' && options.search.trim()) {
    const term = options.search.trim();
    const searchConditions = [
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
    ];

    if (where.OR) {
      where.AND = [
        { OR: where.OR },
        { OR: searchConditions }
      ];
      delete where.OR;
    } else {
      where.OR = searchConditions;
    }
  }

  const sortOrder = options.order === 'asc' ? 'asc' : 'desc';

  const [total, invoices] = await Promise.all([
    tx.invoice.count({ where }),
    tx.invoice.findMany({
      where,
      skip,
      take: limit,
      orderBy: [
        { createdAt: sortOrder },
        { id: 'asc' }
      ],
      select: INVOICE_SELECT_CONFIG
    })
  ]);

  return { invoices, total };
}

/**
 * Finds a single invoice by ID within tenant context.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - Invoice UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object|null>}
 */
export async function findInvoiceById(schoolId, id, tx = prisma) {
  return tx.invoice.findFirst({
    where: {
      schoolId,
      id
    },
    select: INVOICE_SELECT_CONFIG
  });
}

/**
 * Locks an invoice row exclusively (FOR UPDATE) within tenant context.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - Invoice UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object|null>}
 */
export async function findInvoiceByIdForUpdate(schoolId, id, tx = prisma) {
  const rows = await tx.$queryRaw`
    SELECT id, school_id AS "schoolId", student_id AS "studentId",
           fee_structure_id AS "feeStructureId", collection_period_id AS "collectionPeriodId",
           fee_name AS "feeName", amount, due_date AS "dueDate", status,
           paid_at AS "paidAt", payment_mode AS "paymentMode",
           transaction_reference AS "transactionReference", receipt_number AS "receiptNumber",
           custom_data AS "customData", created_at AS "createdAt", updated_at AS "updatedAt"
    FROM "invoices"
    WHERE "school_id" = ${schoolId}::uuid
      AND "id" = ${id}::uuid
    FOR UPDATE
  `;
  return rows[0] || null;
}

/**
 * Atomically updates an invoice status to Cancelled within tenant context.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - Invoice UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object>}
 */
export async function cancelInvoice(schoolId, id, tx = prisma) {
  return tx.invoice.update({
    where: {
      schoolId_id: {
        schoolId,
        id
      }
    },
    data: {
      status: 'Cancelled'
    },
    select: INVOICE_SELECT_CONFIG
  });
}

/**
 * Atomically settles an invoice payment within tenant context.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - Invoice UUID
 * @param {Object} paymentData - Settlement metadata ({ paidAt, paymentMode, transactionReference, receiptNumber })
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object>}
 */
export async function settleInvoicePayment(schoolId, id, paymentData, tx = prisma) {
  return tx.invoice.update({
    where: {
      schoolId_id: {
        schoolId,
        id
      }
    },
    data: {
      status: 'Paid',
      paidAt: paymentData.paidAt,
      paymentMode: paymentData.paymentMode,
      transactionReference: paymentData.transactionReference || null,
      receiptNumber: paymentData.receiptNumber || null
    },
    select: INVOICE_SELECT_CONFIG
  });
}


/**
 * Finds invoices for a specific student ordered deterministically by due date.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} studentId - Student UUID
 * @param {Object} options - Pagination and status options
 * @param {Object} [tx=prisma]
 * @returns {Promise<{ invoices: Array, total: number }>}
 */
export async function findStudentInvoices(schoolId, studentId, options = {}, tx = prisma) {
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 50));
  const skip = (page - 1) * limit;

  const where = {
    schoolId,
    studentId
  };

  if (options.status) {
    where.status = options.status;
  }

  const sortOrder = options.order === 'asc' ? 'asc' : 'desc';

  const [total, invoices] = await Promise.all([
    tx.invoice.count({ where }),
    tx.invoice.findMany({
      where,
      skip,
      take: limit,
      orderBy: [
        { dueDate: sortOrder },
        { id: 'asc' }
      ],
      select: INVOICE_SELECT_CONFIG
    })
  ]);

  return { invoices, total };
}

/**
 * Aggregates institutional invoice financial statistics in PostgreSQL NUMERIC/Decimal precision.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} [filters={}] - Optional filters (classId, studentId, feeStructureId, collectionPeriodId)
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object>}
 */
export async function aggregateInvoiceStats(schoolId, filters = {}, tx = prisma) {
  const conditions = [Prisma.sql`"school_id" = ${schoolId}::uuid`];

  if (filters.studentId) {
    conditions.push(Prisma.sql`"student_id" = ${filters.studentId}::uuid`);
  }

  if (filters.feeStructureId) {
    conditions.push(Prisma.sql`"fee_structure_id" = ${filters.feeStructureId}::uuid`);
  }

  if (filters.collectionPeriodId) {
    conditions.push(Prisma.sql`"collection_period_id" = ${filters.collectionPeriodId}::uuid`);
  }

  if (filters.classId) {
    conditions.push(Prisma.sql`"fee_structure_id" IN (SELECT id FROM "fee_structures" WHERE "school_id" = ${schoolId}::uuid AND "class_id" = ${filters.classId}::uuid)`);
  }

  const whereClause = Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;

  const rows = await tx.$queryRaw`
    SELECT
      COALESCE(SUM(CASE WHEN status != 'Cancelled' THEN amount ELSE 0 END), 0)::text AS "totalExpected",
      COALESCE(SUM(CASE WHEN status = 'Paid' THEN amount ELSE 0 END), 0)::text AS "collectedAmount",
      COALESCE(SUM(CASE WHEN status = 'Pending' THEN amount ELSE 0 END), 0)::text AS "outstandingAmount",
      COALESCE(SUM(CASE WHEN status = 'Pending' AND due_date < TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD') THEN amount ELSE 0 END), 0)::text AS "overdueAmount",
      COUNT(CASE WHEN status = 'Paid' THEN 1 END)::int AS "paidCount",
      COUNT(CASE WHEN status = 'Pending' THEN 1 END)::int AS "unpaidCount",
      COUNT(CASE WHEN status = 'Pending' AND due_date < TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD') THEN 1 END)::int AS "overdueCount",
      COUNT(CASE WHEN status = 'Cancelled' THEN 1 END)::int AS "cancelledCount",
      COUNT(DISTINCT CASE WHEN status = 'Pending' AND student_id IS NOT NULL THEN student_id END)::int AS "unpaidStudentsCount",
      COUNT(DISTINCT CASE WHEN status = 'Pending' AND due_date < TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD') AND student_id IS NOT NULL THEN student_id END)::int AS "overdueStudentsCount"
    FROM "invoices"
    ${whereClause}
  `;

  const stats = rows[0] || {};
  const totalExpected = Number(stats.totalExpected || 0);
  const collectedAmount = Number(stats.collectedAmount || 0);
  const collectionPercentage = totalExpected > 0 ? Number(((collectedAmount / totalExpected) * 100).toFixed(2)) : 0.0;

  return {
    totalExpected,
    collectedAmount,
    outstandingAmount: Number(stats.outstandingAmount || 0),
    overdueAmount: Number(stats.overdueAmount || 0),
    collectionPercentage,
    paidCount: Number(stats.paidCount || 0),
    unpaidCount: Number(stats.unpaidCount || 0),
    overdueCount: Number(stats.overdueCount || 0),
    cancelledCount: Number(stats.cancelledCount || 0),
    unpaidStudentsCount: Number(stats.unpaidStudentsCount || 0),
    overdueStudentsCount: Number(stats.overdueStudentsCount || 0)
  };
}

/**
 * Aggregates class-wise fee reports inside PostgreSQL.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} [filters={}] - Optional filters (collectionPeriodId)
 * @param {Object} [tx=prisma]
 * @returns {Promise<Array<Object>>}
 */
export async function aggregateClassWiseReports(schoolId, filters = {}, tx = prisma) {
  const periodCondition = filters.collectionPeriodId
    ? Prisma.sql`AND inv.collection_period_id = ${filters.collectionPeriodId}::uuid`
    : Prisma.empty;

  const rows = await tx.$queryRaw`
    SELECT
      COALESCE(c.id::text, 'unassigned') AS "classId",
      COALESCE(c.name, 'Unassigned Class') AS "className",
      COUNT(inv.id)::int AS "invoiceCount",
      COUNT(DISTINCT inv.student_id)::int AS "studentCount",
      COALESCE(SUM(CASE WHEN inv.status != 'Cancelled' THEN inv.amount ELSE 0 END), 0)::text AS "totalAmount",
      COALESCE(SUM(CASE WHEN inv.status = 'Paid' THEN inv.amount ELSE 0 END), 0)::text AS "collectedAmount",
      COALESCE(SUM(CASE WHEN inv.status = 'Pending' THEN inv.amount ELSE 0 END), 0)::text AS "outstandingAmount",
      COALESCE(SUM(CASE WHEN inv.status = 'Pending' AND inv.due_date < TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD') THEN inv.amount ELSE 0 END), 0)::text AS "overdueAmount",
      COUNT(CASE WHEN inv.status = 'Paid' THEN 1 END)::int AS "paidCount",
      COUNT(CASE WHEN inv.status = 'Pending' THEN 1 END)::int AS "pendingCount",
      COUNT(CASE WHEN inv.status = 'Pending' AND inv.due_date < TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD') THEN 1 END)::int AS "overdueCount",
      COUNT(CASE WHEN inv.status = 'Cancelled' THEN 1 END)::int AS "cancelledCount"
    FROM "invoices" inv
    LEFT JOIN "fee_structures" fs ON (inv.fee_structure_id = fs.id AND fs.school_id = ${schoolId}::uuid)
    LEFT JOIN "classes" c ON (fs.class_id = c.id AND c.school_id = ${schoolId}::uuid)
    WHERE inv.school_id = ${schoolId}::uuid
      ${periodCondition}
    GROUP BY c.id, c.name
    ORDER BY c.name ASC NULLS LAST
  `;

  return rows.map(row => {
    const totalAmount = Number(row.totalAmount || 0);
    const collectedAmount = Number(row.collectedAmount || 0);
    const collectionPercentage = totalAmount > 0 ? Number(((collectedAmount / totalAmount) * 100).toFixed(2)) : 0.0;

    return {
      classId: row.classId,
      className: row.className,
      invoiceCount: Number(row.invoiceCount || 0),
      studentCount: Number(row.studentCount || 0),
      totalAmount,
      collectedAmount,
      outstandingAmount: Number(row.outstandingAmount || 0),
      overdueAmount: Number(row.overdueAmount || 0),
      collectionPercentage,
      paidCount: Number(row.paidCount || 0),
      pendingCount: Number(row.pendingCount || 0),
      overdueCount: Number(row.overdueCount || 0),
      cancelledCount: Number(row.cancelledCount || 0)
    };
  });
}

/**
 * Aggregates collection-period-wise fee reports inside PostgreSQL.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<Array<Object>>}
 */
export async function aggregatePeriodWiseReports(schoolId, tx = prisma) {
  const rows = await tx.$queryRaw`
    SELECT
      COALESCE(fcp.id::text, 'null_period') AS "periodId",
      COALESCE(fcp.name, 'General (No Period)') AS "periodName",
      fcp.due_date AS "dueDate",
      COUNT(inv.id)::int AS "invoiceCount",
      COALESCE(SUM(CASE WHEN inv.status != 'Cancelled' THEN inv.amount ELSE 0 END), 0)::text AS "totalAmount",
      COALESCE(SUM(CASE WHEN inv.status = 'Paid' THEN inv.amount ELSE 0 END), 0)::text AS "collectedAmount",
      COALESCE(SUM(CASE WHEN inv.status = 'Pending' THEN inv.amount ELSE 0 END), 0)::text AS "outstandingAmount",
      COALESCE(SUM(CASE WHEN inv.status = 'Pending' AND inv.due_date < TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD') THEN inv.amount ELSE 0 END), 0)::text AS "overdueAmount",
      COUNT(CASE WHEN inv.status = 'Paid' THEN 1 END)::int AS "paidCount",
      COUNT(CASE WHEN inv.status = 'Pending' THEN 1 END)::int AS "pendingCount",
      COUNT(CASE WHEN inv.status = 'Pending' AND inv.due_date < TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD') THEN 1 END)::int AS "overdueCount"
    FROM "invoices" inv
    LEFT JOIN "fee_collection_periods" fcp ON (inv.collection_period_id = fcp.id AND fcp.school_id = ${schoolId}::uuid)
    WHERE inv.school_id = ${schoolId}::uuid
    GROUP BY fcp.id, fcp.name, fcp.due_date, fcp.display_order
    ORDER BY COALESCE(fcp.display_order, 999999) ASC, fcp.name ASC NULLS LAST
  `;

  return rows.map(row => {
    const totalAmount = Number(row.totalAmount || 0);
    const collectedAmount = Number(row.collectedAmount || 0);
    const collectionPercentage = totalAmount > 0 ? Number(((collectedAmount / totalAmount) * 100).toFixed(2)) : 0.0;

    return {
      periodId: row.periodId,
      periodName: row.periodName,
      dueDate: row.dueDate || null,
      invoiceCount: Number(row.invoiceCount || 0),
      totalAmount,
      collectedAmount,
      outstandingAmount: Number(row.outstandingAmount || 0),
      overdueAmount: Number(row.overdueAmount || 0),
      collectionPercentage,
      paidCount: Number(row.paidCount || 0),
      pendingCount: Number(row.pendingCount || 0),
      overdueCount: Number(row.overdueCount || 0)
    };
  });
}

/**
 * Aggregates monthly revenue timeline inside PostgreSQL.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {number} [months=7] - Trailing window in months (1-24)
 * @param {Object} [tx=prisma]
 * @returns {Promise<Array<Object>>}
 */
export async function aggregateMonthlyRevenueReports(schoolId, months = 7, tx = prisma) {
  const boundedMonths = Math.min(24, Math.max(1, Number(months) || 7));
  const intervalStr = `${boundedMonths - 1} months`;

  const rows = await tx.$queryRaw`
    SELECT
      TO_CHAR(COALESCE(paid_at, created_at), 'YYYY-MM') AS "month",
      TO_CHAR(COALESCE(paid_at, created_at), 'Mon YYYY') AS "monthName",
      COALESCE(SUM(amount), 0)::text AS "collectedAmount",
      COUNT(id)::int AS "paidCount"
    FROM "invoices"
    WHERE "school_id" = ${schoolId}::uuid
      AND "status" = 'Paid'
      AND COALESCE(paid_at, created_at) >= (DATE_TRUNC('month', CURRENT_DATE) - (${intervalStr})::interval)
    GROUP BY TO_CHAR(COALESCE(paid_at, created_at), 'YYYY-MM'), TO_CHAR(COALESCE(paid_at, created_at), 'Mon YYYY')
    ORDER BY "month" ASC
  `;

  return rows.map(row => ({
    month: row.month,
    monthName: row.monthName,
    collectedAmount: Number(row.collectedAmount || 0),
    paidCount: Number(row.paidCount || 0)
  }));
}

/**
 * Aggregates student invoice balance summary in PostgreSQL NUMERIC/Decimal precision.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} studentId - Student UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object>}
 */
export async function aggregateStudentInvoiceStats(schoolId, studentId, tx = prisma) {
  const rows = await tx.$queryRaw`
    SELECT
      COALESCE(SUM(CASE WHEN status != 'Cancelled' THEN amount ELSE 0 END), 0)::text AS "totalInvoiced",
      COALESCE(SUM(CASE WHEN status = 'Paid' THEN amount ELSE 0 END), 0)::text AS "paidAmount",
      COALESCE(SUM(CASE WHEN status = 'Pending' THEN amount ELSE 0 END), 0)::text AS "outstandingAmount",
      COALESCE(SUM(CASE WHEN status = 'Pending' AND due_date < TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD') THEN amount ELSE 0 END), 0)::text AS "overdueAmount",
      COUNT(CASE WHEN status = 'Pending' AND due_date < TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD') THEN 1 END)::int AS "overdueCount",
      COUNT(CASE WHEN status = 'Pending' THEN 1 END)::int AS "unpaidCount"
    FROM "invoices"
    WHERE "school_id" = ${schoolId}::uuid
      AND "student_id" = ${studentId}::uuid
  `;

  const summary = rows[0] || {};

  return {
    totalInvoiced: Number(summary.totalInvoiced || 0),
    paidAmount: Number(summary.paidAmount || 0),
    outstandingAmount: Number(summary.outstandingAmount || 0),
    overdueAmount: Number(summary.overdueAmount || 0),
    overdueCount: Number(summary.overdueCount || 0),
    unpaidCount: Number(summary.unpaidCount || 0)
  };
}

/**
 * Derives authorized student IDs for an authenticated parent user within tenant context.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} userId - Parent User UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<Array<string>>}
 */
export async function findAuthorizedStudentIdsForParent(schoolId, userId, tx = prisma) {
  const profile = await tx.parentProfile.findFirst({
    where: {
      userId,
      schoolId
    },
    select: {
      id: true,
      user: {
        select: {
          isActive: true
        }
      }
    }
  });

  if (!profile || profile.user?.isActive === false) {
    return [];
  }

  const links = await tx.parentStudentLink.findMany({
    where: {
      parentProfileId: profile.id,
      schoolId
    },
    select: {
      studentId: true
    }
  });

  return links.map(l => l.studentId);
}

/**
 * Verifies that a student exists within the specified tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} studentId - Student UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object|null>}
 */
export async function findStudentInTenant(schoolId, studentId, tx = prisma) {
  return tx.student.findFirst({
    where: {
      id: studentId,
      schoolId
    },
    select: {
      id: true,
      admissionNumber: true,
      firstName: true,
      lastName: true,
      status: true,
      classId: true,
      sectionId: true,
      class: { select: { id: true, name: true } },
      section: { select: { id: true, name: true } }
    }
  });
}
