import { prisma } from '../../database/prisma.client.js';

/**
 * Fee Collection Periods & Fee Structures Data Access Repository
 * Multi-tenant, strictly scoped to schoolId with row-locking support.
 */

// ============================================================
// FEE COLLECTION PERIOD REPOSITORY METHODS
// ============================================================

/**
 * Lists fee collection periods within a tenant with pagination and optional search.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} options - Query options
 * @param {number} [options.page=1]
 * @param {number} [options.limit=50]
 * @param {string} [options.order='asc']
 * @param {string} [options.search]
 * @param {Object} [tx=prisma]
 * @returns {Promise<{ periods: Array, total: number }>}
 */
export async function findPeriods(schoolId, options = {}, tx = prisma) {
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 50));
  const skip = (page - 1) * limit;

  const where = {
    schoolId
  };

  if (options.search && typeof options.search === 'string' && options.search.trim()) {
    where.name = {
      contains: options.search.trim(),
      mode: 'insensitive'
    };
  }

  const [total, periods] = await Promise.all([
    tx.feeCollectionPeriod.count({ where }),
    tx.feeCollectionPeriod.findMany({
      where,
      skip,
      take: limit,
      orderBy: [
        { displayOrder: options.order === 'desc' ? 'desc' : 'asc' },
        { createdAt: 'asc' }
      ],
      include: {
        _count: {
          select: {
            feeStructures: true,
            invoices: true
          }
        }
      }
    })
  ]);

  return { periods, total };
}

/**
 * Finds a single fee collection period by ID within tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - Period UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object|null>}
 */
export async function findPeriodById(schoolId, id, tx = prisma) {
  return tx.feeCollectionPeriod.findFirst({
    where: {
      schoolId,
      id
    },
    include: {
      _count: {
        select: {
          feeStructures: true,
          invoices: true
        }
      }
    }
  });
}

/**
 * Locks a fee collection period row exclusively (FOR UPDATE) within tenant context.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - Period UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object|null>}
 */
export async function findPeriodByIdForUpdate(schoolId, id, tx = prisma) {
  const rows = await tx.$queryRaw`
    SELECT id, school_id AS "schoolId", name, due_date AS "dueDate", display_order AS "displayOrder"
    FROM "fee_collection_periods"
    WHERE "school_id" = ${schoolId}::uuid
      AND "id" = ${id}::uuid
    FOR UPDATE
  `;
  return rows[0] || null;
}

/**
 * Creates a new fee collection period.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} data
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object>}
 */
export async function createPeriod(schoolId, data, tx = prisma) {
  return tx.feeCollectionPeriod.create({
    data: {
      schoolId,
      name: data.name,
      dueDate: data.dueDate,
      displayOrder: data.displayOrder ?? 0
    }
  });
}

/**
 * Updates an existing fee collection period.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - Period UUID
 * @param {Object} data
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object>}
 */
export async function updatePeriod(schoolId, id, data, tx = prisma) {
  return tx.feeCollectionPeriod.update({
    where: {
      schoolId_id: {
        schoolId,
        id
      }
    },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.dueDate !== undefined && { dueDate: data.dueDate }),
      ...(data.displayOrder !== undefined && { displayOrder: data.displayOrder })
    }
  });
}

/**
 * Deletes a fee collection period.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - Period UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object>}
 */
export async function deletePeriod(schoolId, id, tx = prisma) {
  return tx.feeCollectionPeriod.delete({
    where: {
      schoolId_id: {
        schoolId,
        id
      }
    }
  });
}

/**
 * Counts references to a fee collection period in fee structures and invoices.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} periodId - Period UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<{ feeStructuresCount: number, invoicesCount: number, total: number }>}
 */
export async function countPeriodReferences(schoolId, periodId, tx = prisma) {
  const [feeStructuresCount, invoicesCount] = await Promise.all([
    tx.feeStructure.count({
      where: {
        schoolId,
        collectionPeriodId: periodId
      }
    }),
    tx.invoice.count({
      where: {
        schoolId,
        collectionPeriodId: periodId
      }
    })
  ]);

  return {
    feeStructuresCount,
    invoicesCount,
    total: feeStructuresCount + invoicesCount
  };
}

// ============================================================
// FEE STRUCTURE REPOSITORY METHODS
// ============================================================

/**
 * Lists fee structures within a tenant with pagination, filters, and related entity counts.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} options
 * @param {number} [options.page=1]
 * @param {number} [options.limit=50]
 * @param {string} [options.classId]
 * @param {string} [options.collectionPeriodId]
 * @param {string} [options.order='desc']
 * @param {string} [options.search]
 * @param {Object} [tx=prisma]
 * @returns {Promise<{ feeStructures: Array, total: number }>}
 */
export async function findFeeStructures(schoolId, options = {}, tx = prisma) {
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 50));
  const skip = (page - 1) * limit;

  const where = {
    schoolId
  };

  if (options.classId) {
    where.classId = options.classId;
  }

  if (options.collectionPeriodId) {
    where.collectionPeriodId = options.collectionPeriodId;
  }

  if (options.search && typeof options.search === 'string' && options.search.trim()) {
    where.name = {
      contains: options.search.trim(),
      mode: 'insensitive'
    };
  }

  const [total, feeStructures] = await Promise.all([
    tx.feeStructure.count({ where }),
    tx.feeStructure.findMany({
      where,
      skip,
      take: limit,
      orderBy: [
        { createdAt: options.order === 'asc' ? 'asc' : 'desc' },
        { id: 'asc' }
      ],
      include: {
        class: {
          select: {
            id: true,
            name: true
          }
        },
        collectionPeriod: {
          select: {
            id: true,
            name: true,
            dueDate: true,
            displayOrder: true
          }
        },
        _count: {
          select: {
            invoices: true
          }
        }
      }
    })
  ]);

  return { feeStructures, total };
}

/**
 * Finds a single fee structure by ID within tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - Fee Structure UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object|null>}
 */
export async function findFeeStructureById(schoolId, id, tx = prisma) {
  return tx.feeStructure.findFirst({
    where: {
      schoolId,
      id
    },
    include: {
      class: {
        select: {
          id: true,
          name: true
        }
      },
      collectionPeriod: {
        select: {
          id: true,
          name: true,
          dueDate: true,
          displayOrder: true
        }
      },
      _count: {
        select: {
          invoices: true
        }
      }
    }
  });
}

/**
 * Locks a fee structure row exclusively (FOR UPDATE) within tenant context.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - Fee Structure UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object|null>}
 */
export async function findFeeStructureByIdForUpdate(schoolId, id, tx = prisma) {
  const rows = await tx.$queryRaw`
    SELECT id, school_id AS "schoolId", name, amount, due_date AS "dueDate",
           class_id AS "classId", collection_period_id AS "collectionPeriodId",
           custom_data AS "customData"
    FROM "fee_structures"
    WHERE "school_id" = ${schoolId}::uuid
      AND "id" = ${id}::uuid
    FOR UPDATE
  `;
  return rows[0] || null;
}

/**
 * Creates a new fee structure.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} data
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object>}
 */
export async function createFeeStructure(schoolId, data, tx = prisma) {
  return tx.feeStructure.create({
    data: {
      schoolId,
      name: data.name,
      amount: data.amount,
      dueDate: data.dueDate,
      classId: data.classId,
      collectionPeriodId: data.collectionPeriodId || null,
      customData: data.customData ?? null
    },
    include: {
      class: {
        select: {
          id: true,
          name: true
        }
      },
      collectionPeriod: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });
}

/**
 * Updates a fee structure row.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - Fee Structure UUID
 * @param {Object} data
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object>}
 */
export async function updateFeeStructure(schoolId, id, data, tx = prisma) {
  return tx.feeStructure.update({
    where: {
      schoolId_id: {
        schoolId,
        id
      }
    },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.amount !== undefined && { amount: data.amount }),
      ...(data.dueDate !== undefined && { dueDate: data.dueDate }),
      ...(data.classId !== undefined && { classId: data.classId }),
      ...(data.collectionPeriodId !== undefined && { collectionPeriodId: data.collectionPeriodId }),
      ...(data.customData !== undefined && { customData: data.customData })
    },
    include: {
      class: {
        select: {
          id: true,
          name: true
        }
      },
      collectionPeriod: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });
}

/**
 * Deletes a fee structure.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - Fee Structure UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object>}
 */
export async function deleteFeeStructure(schoolId, id, tx = prisma) {
  return tx.feeStructure.delete({
    where: {
      schoolId_id: {
        schoolId,
        id
      }
    }
  });
}

/**
 * Counts invoices referencing a fee structure.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} feeStructureId - Fee Structure UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<number>}
 */
export async function countFeeStructureInvoices(schoolId, feeStructureId, tx = prisma) {
  return tx.invoice.count({
    where: {
      schoolId,
      feeStructureId
    }
  });
}

// ============================================================
// INVOICE & STUDENT LOOKUP REPOSITORY METHODS
// ============================================================

/**
 * Finds all active students belonging to a specific class within tenant, ordered deterministically.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} classId - Class UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<Array>}
 */
export async function findActiveStudentsByClass(schoolId, classId, tx = prisma) {
  return tx.student.findMany({
    where: {
      schoolId,
      classId,
      status: 'Active'
    },
    orderBy: {
      id: 'asc'
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      admissionNumber: true,
      status: true
    }
  });
}

/**
 * Finds existing non-cancelled invoice student IDs for a fee structure within tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} feeStructureId - Fee Structure UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<Set<string>>}
 */
export async function findExistingInvoiceStudentIds(schoolId, feeStructureId, tx = prisma) {
  const existingInvoices = await tx.invoice.findMany({
    where: {
      schoolId,
      feeStructureId,
      status: {
        not: 'Cancelled'
      },
      studentId: {
        not: null
      }
    },
    select: {
      studentId: true
    }
  });

  return new Set(existingInvoices.map(inv => inv.studentId));
}

/**
 * Inserts batch invoice records.
 *
 * @param {Array<Object>} invoicesData - List of invoice records
 * @param {Object} [tx=prisma]
 * @returns {Promise<{ count: number }>}
 */
export async function createInvoicesBatch(invoicesData, tx = prisma) {
  if (!invoicesData || invoicesData.length === 0) {
    return { count: 0 };
  }
  return tx.invoice.createMany({
    data: invoicesData
  });
}

/**
 * Finds a class within tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} classId - Class UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object|null>}
 */
export async function findClassInTenant(schoolId, classId, tx = prisma) {
  return tx.class.findFirst({
    where: {
      schoolId,
      id: classId
    }
  });
}
