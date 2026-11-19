import { prisma } from '../../database/prisma.client.js';
import * as repo from './concession-category.repository.js';
import { createAuditLog } from '../audit/audit.repository.js';
import { NotFoundError, ConflictError, RelationshipConflictError } from '../../utils/app-error.js';

const DUPLICATE_MESSAGE = 'A concession category with this name already exists';

const actorName = (actor) => actor?.email || actor?.name || 'Administrator';
const actorRole = (actor) => actor?.systemRole || actor?.role || null;

const toConflictIfDuplicate = (error) => {
  if (error?.code === 'P2002') {
    throw new ConflictError(DUPLICATE_MESSAGE);
  }
  throw error;
};

export async function listConcessionCategories(schoolId, query = {}) {
  const { concessionCategories, total } = await repo.findConcessionCategories(schoolId, query);
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
  const totalPages = Math.ceil(total / limit) || 1;

  return {
    concessionCategories,
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

export async function getConcessionCategoryById(schoolId, id) {
  const category = await repo.findConcessionCategoryById(schoolId, id);
  if (!category) throw new NotFoundError('Concession category');
  return category;
}

export async function createConcessionCategory(schoolId, data, actor) {
  const duplicate = await repo.findByNameInsensitive(schoolId, data.name);
  if (duplicate) throw new ConflictError(DUPLICATE_MESSAGE);

  let created;
  try {
    created = await repo.createConcessionCategory(schoolId, data);
  } catch (error) {
    toConflictIfDuplicate(error);
  }

  await createAuditLog({
    schoolId,
    entityType: 'ConcessionCategory',
    entityId: created.id,
    actionPerformed: 'CREATE_CONCESSION_CATEGORY',
    userName: actorName(actor),
    userRole: actorRole(actor),
    modifiedFields: { name: created.name }
  });

  return created;
}

export async function updateConcessionCategory(schoolId, id, data, actor) {
  let updated = null;
  let modifiedFields = null;

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await repo.findConcessionCategoryByIdForUpdate(schoolId, id, tx);
      if (!existing) throw new NotFoundError('Concession category');

      const changes = {};
      if (data.name !== undefined && data.name !== existing.name) {
        changes.name = { old: existing.name, new: data.name };
      }

      if (Object.keys(changes).length === 0) {
        updated = await repo.findConcessionCategoryById(schoolId, id, tx);
        return;
      }

      const duplicate = await repo.findByNameInsensitive(schoolId, data.name, id, tx);
      if (duplicate) throw new ConflictError(DUPLICATE_MESSAGE);

      modifiedFields = changes;
      updated = await repo.updateConcessionCategory(schoolId, id, data, tx);
    });
  } catch (error) {
    toConflictIfDuplicate(error);
  }

  if (modifiedFields) {
    await createAuditLog({
      schoolId,
      entityType: 'ConcessionCategory',
      entityId: id,
      actionPerformed: 'UPDATE_CONCESSION_CATEGORY',
      userName: actorName(actor),
      userRole: actorRole(actor),
      modifiedFields
    });
  }

  return updated;
}

export async function deleteConcessionCategory(schoolId, id, actor) {
  let snapshot = null;

  await prisma.$transaction(async (tx) => {
    const existing = await repo.findConcessionCategoryByIdForUpdate(schoolId, id, tx);
    if (!existing) throw new NotFoundError('Concession category');

    const refs = await repo.countConcessionCategoryReferences(schoolId, id, tx);
    if (refs.total > 0) {
      throw new RelationshipConflictError('Cannot delete concession category because it is in use', refs);
    }

    snapshot = existing;
    await repo.deleteConcessionCategory(schoolId, id, tx);
  });

  await createAuditLog({
    schoolId,
    entityType: 'ConcessionCategory',
    entityId: id,
    actionPerformed: 'DELETE_CONCESSION_CATEGORY',
    userName: actorName(actor),
    userRole: actorRole(actor),
    modifiedFields: { deletedRecord: { name: snapshot.name } }
  });

  return { id, deleted: true };
}