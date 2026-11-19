import { prisma } from '../../database/prisma.client.js';
import * as repo from './fee-category.repository.js';
import { createAuditLog } from '../audit/audit.repository.js';
import { NotFoundError, ConflictError, RelationshipConflictError } from '../../utils/app-error.js';

const DUPLICATE_MESSAGE = 'A fee category with this name already exists';

const actorName = (actor) => actor?.email || actor?.name || 'Administrator';
const actorRole = (actor) => actor?.systemRole || actor?.role || null;

const toConflictIfDuplicate = (error) => {
  if (error?.code === 'P2002') {
    throw new ConflictError(DUPLICATE_MESSAGE);
  }
  throw error;
};

const DEFAULT_TYPES = ['Normal', 'Late', 'Bus'];

export async function listCategoryTypes(schoolId) {
  const used = await repo.findDistinctCategoryTypes(schoolId);
  const merged = [...DEFAULT_TYPES];
  for (const type of used) {
    if (!merged.some((m) => m.toLowerCase() === type.toLowerCase())) merged.push(type);
  }
  return merged;
}

async function canonicalType(schoolId, type) {
  const known = await listCategoryTypes(schoolId);
  return known.find((k) => k.toLowerCase() === type.toLowerCase()) || type;
}

export async function listFeeCategories(schoolId, query = {}) {
  const { feeCategories, total } = await repo.findFeeCategories(schoolId, query);
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
  const totalPages = Math.ceil(total / limit) || 1;

  return {
    feeCategories,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1
    }
  };
}

export async function getFeeCategoryById(schoolId, id) {
  const category = await repo.findFeeCategoryById(schoolId, id);
  if (!category) throw new NotFoundError('Fee category');
  return category;
}

export async function createFeeCategory(schoolId, data, actor) {
  data = { ...data, categoryType: await canonicalType(schoolId, data.categoryType) };
  const duplicate = await repo.findByNameInsensitive(schoolId, data.name);
  if (duplicate) throw new ConflictError(DUPLICATE_MESSAGE);

  let created;
  try {
    created = await repo.createFeeCategory(schoolId, data);
  } catch (error) {
    toConflictIfDuplicate(error);
  }

  await createAuditLog({
    schoolId,
    entityType: 'FeeCategory',
    entityId: created.id,
    actionPerformed: 'CREATE_FEE_CATEGORY',
    userName: actorName(actor),
    userRole: actorRole(actor),
    modifiedFields: {
      name: created.name,
      categoryType: created.categoryType,
      paymentOrder: created.paymentOrder,
      shortCode: created.shortCode
    }
  });

  return created;
}

export async function updateFeeCategory(schoolId, id, data, actor) {
  if (data.categoryType !== undefined) {
    data = { ...data, categoryType: await canonicalType(schoolId, data.categoryType) };
  }
  let updated = null;
  let modifiedFields = null;

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await repo.findFeeCategoryByIdForUpdate(schoolId, id, tx);
      if (!existing) throw new NotFoundError('Fee category');

      const changes = {};
      if (data.name !== undefined && data.name !== existing.name) {
        changes.name = { old: existing.name, new: data.name };
      }
      if (data.categoryType !== undefined && data.categoryType !== existing.categoryType) {
        changes.categoryType = { old: existing.categoryType, new: data.categoryType };
      }
      if (data.paymentOrder !== undefined && data.paymentOrder !== existing.paymentOrder) {
        changes.paymentOrder = { old: existing.paymentOrder, new: data.paymentOrder };
      }
      if (data.shortCode !== undefined && data.shortCode !== existing.shortCode) {
        changes.shortCode = { old: existing.shortCode, new: data.shortCode };
      }

      if (Object.keys(changes).length === 0) {
        updated = await repo.findFeeCategoryById(schoolId, id, tx);
        return;
      }

      if (changes.name) {
        const duplicate = await repo.findByNameInsensitive(schoolId, data.name, id, tx);
        if (duplicate) throw new ConflictError(DUPLICATE_MESSAGE);
      }

      modifiedFields = changes;
      updated = await repo.updateFeeCategory(schoolId, id, data, tx);
    });
  } catch (error) {
    toConflictIfDuplicate(error);
  }

  if (modifiedFields) {
    await createAuditLog({
      schoolId,
      entityType: 'FeeCategory',
      entityId: id,
      actionPerformed: 'UPDATE_FEE_CATEGORY',
      userName: actorName(actor),
      userRole: actorRole(actor),
      modifiedFields
    });
  }

  return updated;
}

export async function deleteFeeCategory(schoolId, id, actor) {
  let snapshot = null;

  await prisma.$transaction(async (tx) => {
    const existing = await repo.findFeeCategoryByIdForUpdate(schoolId, id, tx);
    if (!existing) throw new NotFoundError('Fee category');

    const refs = await repo.countFeeCategoryReferences(schoolId, id, tx);
    if (refs.total > 0) {
      throw new RelationshipConflictError(
        'Cannot delete fee category because it is in use',
        refs
      );
    }

    snapshot = existing;
    await repo.deleteFeeCategory(schoolId, id, tx);
  });

  await createAuditLog({
    schoolId,
    entityType: 'FeeCategory',
    entityId: id,
    actionPerformed: 'DELETE_FEE_CATEGORY',
    userName: actorName(actor),
    userRole: actorRole(actor),
    modifiedFields: {
      deletedRecord: {
        name: snapshot.name,
        categoryType: snapshot.categoryType,
        paymentOrder: snapshot.paymentOrder,
        shortCode: snapshot.shortCode
      }
    }
  });

  return { id, deleted: true };
}