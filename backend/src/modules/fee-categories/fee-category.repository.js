import { prisma } from '../../database/prisma.client.js';

/**
 * Fee Category Data Access Repository
 * Multi-tenant, strictly scoped to schoolId with row-locking support.
 */

const SORTABLE = ['name', 'categoryType', 'paymentOrder', 'shortCode', 'createdAt'];

export async function findFeeCategories(schoolId, options = {}, tx = prisma) {
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 10));
  const skip = (page - 1) * limit;

  const where = { schoolId };

  if (options.categoryType) {
    where.categoryType = options.categoryType;
  }

  if (options.search && typeof options.search === 'string' && options.search.trim()) {
    const term = options.search.trim();
    where.OR = [
      { name: { contains: term, mode: 'insensitive' } },
      { shortCode: { contains: term, mode: 'insensitive' } }
    ];
  }

  const sortBy = SORTABLE.includes(options.sortBy) ? options.sortBy : 'createdAt';
  const direction = options.order === 'desc' ? 'desc' : 'asc';

  const [total, feeCategories] = await Promise.all([
    tx.feeCategory.count({ where }),
    tx.feeCategory.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ [sortBy]: direction }, { id: 'asc' }]
    })
  ]);

  return { feeCategories, total };
}

export async function findFeeCategoryById(schoolId, id, tx = prisma) {
  return tx.feeCategory.findFirst({ where: { schoolId, id } });
}

export async function findFeeCategoryByIdForUpdate(schoolId, id, tx = prisma) {
  const rows = await tx.$queryRaw`
    SELECT id, school_id AS "schoolId", name, category_type AS "categoryType",
           payment_order AS "paymentOrder", short_code AS "shortCode"
    FROM "fee_categories"
    WHERE "school_id" = ${schoolId}::uuid
      AND "id" = ${id}::uuid
    FOR UPDATE
  `;
  return rows[0] || null;
}

export async function findByNameInsensitive(schoolId, name, excludeId = null, tx = prisma) {
  return tx.feeCategory.findFirst({
    where: {
      schoolId,
      name: { equals: name, mode: 'insensitive' },
      ...(excludeId ? { id: { not: excludeId } } : {})
    },
    select: { id: true, name: true }
  });
}

export async function createFeeCategory(schoolId, data, tx = prisma) {
  return tx.feeCategory.create({
    data: {
      schoolId,
      name: data.name,
      categoryType: data.categoryType ?? 'Normal',
      paymentOrder: data.paymentOrder ?? 0,
      shortCode: data.shortCode ?? null
    }
  });
}

export async function updateFeeCategory(schoolId, id, data, tx = prisma) {
  return tx.feeCategory.update({
    where: { schoolId_id: { schoolId, id } },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.categoryType !== undefined && { categoryType: data.categoryType }),
      ...(data.paymentOrder !== undefined && { paymentOrder: data.paymentOrder }),
      ...(data.shortCode !== undefined && { shortCode: data.shortCode })
    }
  });
}

export async function deleteFeeCategory(schoolId, id, tx = prisma) {
  return tx.feeCategory.delete({ where: { schoolId_id: { schoolId, id } } });
}


export async function countFeeCategoryReferences(schoolId, id, tx = prisma) {
  const feeStructuresCount = await tx.feeStructure.count({
    where: { schoolId, feeCategoryId: id }
  });
  return { feeStructuresCount, total: feeStructuresCount };
}

export async function findDistinctCategoryTypes(schoolId, tx = prisma) {
  const rows = await tx.feeCategory.findMany({
    where: { schoolId },
    distinct: ['categoryType'],
    select: { categoryType: true },
    orderBy: { categoryType: 'asc' }
  });
  return rows.map((r) => r.categoryType);
}