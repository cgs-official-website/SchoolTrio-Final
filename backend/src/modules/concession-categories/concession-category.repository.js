import { prisma } from '../../database/prisma.client.js';

/**
 * Concession Category Data Access Repository
 * Multi-tenant, strictly scoped to schoolId with row-locking support.
 */

const SORTABLE = ['name', 'createdAt'];

export async function findConcessionCategories(schoolId, options = {}, tx = prisma) {
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 10));
  const skip = (page - 1) * limit;

  const where = { schoolId };

  if (options.search && typeof options.search === 'string' && options.search.trim()) {
    where.name = { contains: options.search.trim(), mode: 'insensitive' };
  }

  const sortBy = SORTABLE.includes(options.sortBy) ? options.sortBy : 'createdAt';
  const direction = options.order === 'desc' ? 'desc' : 'asc';

  const [total, concessionCategories] = await Promise.all([
    tx.concessionCategory.count({ where }),
    tx.concessionCategory.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ [sortBy]: direction }, { id: 'asc' }]
    })
  ]);

  return { concessionCategories, total };
}

export async function findConcessionCategoryById(schoolId, id, tx = prisma) {
  return tx.concessionCategory.findFirst({ where: { schoolId, id } });
}

export async function findConcessionCategoryByIdForUpdate(schoolId, id, tx = prisma) {
  const rows = await tx.$queryRaw`
    SELECT id, school_id AS "schoolId", name
    FROM "concession_categories"
    WHERE "school_id" = ${schoolId}::uuid
      AND "id" = ${id}::uuid
    FOR UPDATE
  `;
  return rows[0] || null;
}

export async function findByNameInsensitive(schoolId, name, excludeId = null, tx = prisma) {
  return tx.concessionCategory.findFirst({
    where: {
      schoolId,
      name: { equals: name, mode: 'insensitive' },
      ...(excludeId ? { id: { not: excludeId } } : {})
    },
    select: { id: true, name: true }
  });
}

export async function createConcessionCategory(schoolId, data, tx = prisma) {
  return tx.concessionCategory.create({
    data: { schoolId, name: data.name }
  });
}

export async function updateConcessionCategory(schoolId, id, data, tx = prisma) {
  return tx.concessionCategory.update({
    where: { schoolId_id: { schoolId, id } },
    data: {
      ...(data.name !== undefined && { name: data.name })
    }
  });
}

export async function deleteConcessionCategory(schoolId, id, tx = prisma) {
  return tx.concessionCategory.delete({ where: { schoolId_id: { schoolId, id } } });
}

export async function countConcessionCategoryReferences(_schoolId, _id, _tx = prisma) {
  return { total: 0 };
}