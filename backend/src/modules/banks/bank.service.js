import { prisma } from '../../database/prisma.client.js';
import * as repo from './bank.repository.js';
import { createAuditLog } from '../audit/audit.repository.js';
import { NotFoundError, ConflictError, RelationshipConflictError } from '../../utils/app-error.js';

const DUPLICATE_MESSAGE = 'A bank with this name already exists';
const RACE_MESSAGE = 'The bank could not be saved because of a conflicting change. Please try again';

const actorName = (actor) => actor?.email || actor?.name || 'Administrator';
const actorRole = (actor) => actor?.systemRole || actor?.role || null;


const toConflictIfUniqueViolation = (error) => {
  if (error?.code === 'P2002') {
    throw new ConflictError(RACE_MESSAGE);
  }
  throw error;
};

export async function listBanks(schoolId, query = {}) {
  const { banks, total } = await repo.findBanks(schoolId, query);
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
  const totalPages = Math.ceil(total / limit) || 1;

  return {
    banks,
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

export async function getBankById(schoolId, id) {
  const bank = await repo.findBankById(schoolId, id);
  if (!bank) throw new NotFoundError('Bank');
  return bank;
}

export async function createBank(schoolId, data, actor) {
  const duplicate = await repo.findByNameInsensitive(schoolId, data.name);
  if (duplicate) throw new ConflictError(DUPLICATE_MESSAGE);

  let created = null;
  try {
    await prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await repo.lockSchoolBanks(schoolId, tx);
        await repo.unsetOtherDefaults(schoolId, null, tx);
      }
      created = await repo.createBank(schoolId, data, tx);
    });
  } catch (error) {
    toConflictIfUniqueViolation(error);
  }

  await createAuditLog({
    schoolId,
    entityType: 'Bank',
    entityId: created.id,
    actionPerformed: 'CREATE_BANK',
    userName: actorName(actor),
    userRole: actorRole(actor),
    modifiedFields: {
      name: created.name,
      code: created.code,
      isDefault: created.isDefault
    }
  });

  return created;
}

export async function updateBank(schoolId, id, data, actor) {
  let updated = null;
  let modifiedFields = null;

  try {
    await prisma.$transaction(async (tx) => {
      if (data.isDefault === true) {
        await repo.lockSchoolBanks(schoolId, tx);
      }

      const existing = await repo.findBankByIdForUpdate(schoolId, id, tx);
      if (!existing) throw new NotFoundError('Bank');

      const changes = {};
      if (data.name !== undefined && data.name !== existing.name) {
        changes.name = { old: existing.name, new: data.name };
      }
      if (data.code !== undefined && data.code !== existing.code) {
        changes.code = { old: existing.code, new: data.code };
      }
      if (data.isDefault !== undefined && data.isDefault !== existing.isDefault) {
        changes.isDefault = { old: existing.isDefault, new: data.isDefault };
      }

      if (Object.keys(changes).length === 0) {
        updated = await repo.findBankById(schoolId, id, tx);
        return;
      }

      if (changes.name) {
        const duplicate = await repo.findByNameInsensitive(schoolId, data.name, id, tx);
        if (duplicate) throw new ConflictError(DUPLICATE_MESSAGE);
      }

      if (changes.isDefault && data.isDefault === true) {
        await repo.unsetOtherDefaults(schoolId, id, tx);
      }

      modifiedFields = changes;
      updated = await repo.updateBank(schoolId, id, data, tx);
    });
  } catch (error) {
    toConflictIfUniqueViolation(error);
  }

  if (modifiedFields) {
    await createAuditLog({
      schoolId,
      entityType: 'Bank',
      entityId: id,
      actionPerformed: 'UPDATE_BANK',
      userName: actorName(actor),
      userRole: actorRole(actor),
      modifiedFields
    });
  }

  return updated;
}

export async function deleteBank(schoolId, id, actor) {
  let snapshot = null;

  await prisma.$transaction(async (tx) => {
    const existing = await repo.findBankByIdForUpdate(schoolId, id, tx);
    if (!existing) throw new NotFoundError('Bank');

    const refs = await repo.countBankReferences(schoolId, id, tx);
    if (refs.total > 0) {
      throw new RelationshipConflictError('Cannot delete bank because it is in use', refs);
    }

    snapshot = existing;
    await repo.deleteBank(schoolId, id, tx);
  });

  await createAuditLog({
    schoolId,
    entityType: 'Bank',
    entityId: id,
    actionPerformed: 'DELETE_BANK',
    userName: actorName(actor),
    userRole: actorRole(actor),
    modifiedFields: {
      deletedRecord: {
        name: snapshot.name,
        code: snapshot.code,
        isDefault: snapshot.isDefault
      }
    }
  });

  return { id, deleted: true };
}