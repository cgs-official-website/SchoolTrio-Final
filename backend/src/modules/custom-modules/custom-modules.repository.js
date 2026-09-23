import { prisma } from '../../database/prisma.client.js';

/**
 * Custom Modules Repository Layer
 * Encapsulates all PostgreSQL / Prisma interactions for CustomModule, CustomFormSchema, and CustomModuleRecord.
 */

// ===========================================================================
// Custom Modules CRUD
// ===========================================================================

export async function findModules(schoolId, tx = prisma) {
  return tx.customModule.findMany({
    where: { schoolId },
    orderBy: [
      { order: 'asc' },
      { createdAt: 'asc' }
    ]
  });
}

export async function countModules(schoolId, tx = prisma) {
  return tx.customModule.count({
    where: { schoolId }
  });
}

export async function findModuleById(schoolId, id, tx = prisma) {
  return tx.customModule.findUnique({
    where: {
      schoolId_id: {
        schoolId,
        id
      }
    }
  });
}

export async function findModuleByName(schoolId, name, tx = prisma) {
  return tx.customModule.findUnique({
    where: {
      schoolId_name: {
        schoolId,
        name
      }
    }
  });
}

export async function createModule(schoolId, data, tx = prisma) {
  return tx.customModule.create({
    data: {
      schoolId,
      name: data.name,
      icon: data.icon || 'Folder',
      order: data.order ?? 0,
      isActive: data.isActive ?? true
    }
  });
}

export async function updateModule(schoolId, id, data, tx = prisma) {
  return tx.customModule.update({
    where: {
      schoolId_id: {
        schoolId,
        id
      }
    },
    data
  });
}

export async function deleteModule(schoolId, id, tx = prisma) {
  return tx.customModule.delete({
    where: {
      schoolId_id: {
        schoolId,
        id
      }
    }
  });
}

// ===========================================================================
// Custom Form Schemas CRUD
// ===========================================================================

export async function findSchemaByModuleKey(schoolId, moduleKey, tx = prisma) {
  return tx.customFormSchema.findUnique({
    where: {
      schoolId_moduleKey: {
        schoolId,
        moduleKey
      }
    }
  });
}

export async function upsertSchema(schoolId, moduleKey, sections, tx = prisma) {
  return tx.customFormSchema.upsert({
    where: {
      schoolId_moduleKey: {
        schoolId,
        moduleKey
      }
    },
    update: {
      sections
    },
    create: {
      schoolId,
      moduleKey,
      sections
    }
  });
}

export async function deleteSchema(schoolId, moduleKey, tx = prisma) {
  return tx.customFormSchema.deleteMany({
    where: {
      schoolId,
      moduleKey
    }
  });
}

// ===========================================================================
// Dynamic Module Records CRUD
// ===========================================================================

export async function findRecords(schoolId, customModuleId, options = {}, tx = prisma) {
  const { skip = 0, take = 50 } = options;

  const [records, total] = await Promise.all([
    tx.customModuleRecord.findMany({
      where: {
        schoolId,
        customModuleId
      },
      skip,
      take,
      orderBy: { createdAt: 'desc' }
    }),
    tx.customModuleRecord.count({
      where: {
        schoolId,
        customModuleId
      }
    })
  ]);

  return { records, total };
}

export async function findRecordById(schoolId, customModuleId, recordId, tx = prisma) {
  return tx.customModuleRecord.findFirst({
    where: {
      id: recordId,
      schoolId,
      customModuleId
    }
  });
}

export async function createRecord(schoolId, customModuleId, data, createdByUserId = null, tx = prisma) {
  return tx.customModuleRecord.create({
    data: {
      schoolId,
      customModuleId,
      data,
      createdByUserId
    }
  });
}

export async function updateRecord(schoolId, customModuleId, recordId, data, tx = prisma) {
  return tx.customModuleRecord.update({
    where: {
      schoolId_id: {
        schoolId,
        id: recordId
      }
    },
    data: {
      data
    }
  });
}

export async function deleteRecord(schoolId, customModuleId, recordId, tx = prisma) {
  return tx.customModuleRecord.delete({
    where: {
      schoolId_id: {
        schoolId,
        id: recordId
      }
    }
  });
}

export async function deleteRecordsByModule(schoolId, customModuleId, tx = prisma) {
  return tx.customModuleRecord.deleteMany({
    where: {
      schoolId,
      customModuleId
    }
  });
}

// ===========================================================================
// Transaction Helper
// ===========================================================================

export async function executeTransaction(callback) {
  return prisma.$transaction(async (tx) => {
    return callback(tx);
  });
}
