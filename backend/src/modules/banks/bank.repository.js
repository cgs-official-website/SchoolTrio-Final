import { prisma } from '../../database/prisma.client.js';

/**
 * Bank Data Access Repository
 * Multi-tenant, strictly scoped to schoolId with row-locking support.
 */

const SORTABLE = ['name', 'code', 'isDefault', 'createdAt'];

export async function findBanks(schoolId, options = {}, tx = prisma) {
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 10));
  const skip = (page - 1) * limit;

  const where = { schoolId };

  if (options.search && typeof options.search === 'string' && options.search.trim()) {
    const term = options.search.trim();
    where.OR = [
      { name: { contains: term, mode: 'insensitive' } },
      { code: { contains: term, mode: 'insensitive' } }
    ];
  }

  const sortBy = SORTABLE.includes(options.sortBy) ? options.sortBy : 'createdAt';
  const direction = options.order === 'desc' ? 'desc' : 'asc';

  const [total, banks] = await Promise.all([
    tx.bank.count({ where }),
    tx.bank.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ [sortBy]: direction }, { id: 'asc' }]
    })
  ]);

  return { banks, total };
}

export async function findBankById(schoolId, id, tx = prisma) {
  return tx.bank.findFirst({ where: { schoolId, id } });
}

export async function findBankByIdForUpdate(schoolId, id, tx = prisma) {
  const rows = await tx.$queryRaw`
    SELECT id, school_id AS "schoolId", name, code, is_default AS "isDefault"
    FROM "banks"
    WHERE "school_id" = ${schoolId}::uuid
      AND "id" = ${id}::uuid
    FOR UPDATE
  `;
  return rows[0] || null;
}

/**
 * Locks every bank row of the tenant so default switching is serialized.
 */
export async function lockSchoolBanks(schoolId, tx = prisma) {
  await tx.$queryRaw`
    SELECT id FROM "banks"
    WHERE "school_id" = ${schoolId}::uuid
    FOR UPDATE
  `;
}

export async function findByNameInsensitive(schoolId, name, excludeId = null, tx = prisma) {
  return tx.bank.findFirst({
    where: {
      schoolId,
      name: { equals: name, mode: 'insensitive' },
      ...(excludeId ? { id: { not: excludeId } } : {})
    },
    select: { id: true, name: true }
  });
}

/**
 * Clears the default flag on every other bank in the tenant.
 */
export async function unsetOtherDefaults(schoolId, exceptId = null, tx = prisma) {
  return tx.bank.updateMany({
    where: {
      schoolId,
      isDefault: true,
      ...(exceptId ? { id: { not: exceptId } } : {})
    },
    data: { isDefault: false }
  });
}

export async function createBank(schoolId, data, tx = prisma) {
  return tx.bank.create({
    data: {
      schoolId,
      name: data.name,
      code: data.code ?? null,
      isDefault: data.isDefault ?? false
    }
  });
}

export async function updateBank(schoolId, id, data, tx = prisma) {
  return tx.bank.update({
    where: { schoolId_id: { schoolId, id } },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.code !== undefined && { code: data.code }),
      ...(data.isDefault !== undefined && { isDefault: data.isDefault })
    }
  });
}

export async function deleteBank(schoolId, id, tx = prisma) {
  return tx.bank.delete({ where: { schoolId_id: { schoolId, id } } });
}

/**
 * Nothing references banks yet. When Fee Transaction starts linking to banks,
 * add the counts here and the delete guard in the service works automatically.
 */
export async function countBankReferences(_schoolId, _id, _tx = prisma) {
  return { total: 0 };
}