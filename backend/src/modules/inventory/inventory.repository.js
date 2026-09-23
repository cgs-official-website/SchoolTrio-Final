import { basePrisma as prisma } from '../../database/prisma.client.js';

// ==========================================
// 1. Category Repository Operations
// ==========================================

export const findCategories = async (schoolId) => {
  return prisma.inventoryCategory.findMany({
    where: { schoolId },
    include: {
      _count: {
        select: { items: true }
      }
    },
    orderBy: { name: 'asc' }
  });
};

export const findCategoryById = async (schoolId, id, tx = prisma) => {
  return tx.inventoryCategory.findFirst({
    where: { schoolId, id }
  });
};

export const findCategoryByName = async (schoolId, name, tx = prisma) => {
  return tx.inventoryCategory.findFirst({
    where: {
      schoolId,
      name: { equals: name, mode: 'insensitive' }
    }
  });
};

export const lockCategoryForUpdate = async (schoolId, id, tx = prisma) => {
  const rows = await tx.$queryRaw`
    SELECT "id", "name", "school_id"
    FROM "inventory_categories"
    WHERE "school_id" = ${schoolId}::uuid AND "id" = ${id}::uuid
    FOR UPDATE;
  `;
  return rows[0] || null;
};

export const countItemsReferencingCategory = async (schoolId, categoryId, categoryName, tx = prisma) => {
  const whereClauses = [];
  if (categoryId) {
    whereClauses.push({ categoryId });
  }
  if (categoryName) {
    whereClauses.push({ category: { equals: categoryName, mode: 'insensitive' } });
  }

  if (whereClauses.length === 0) return 0;

  return tx.inventoryItem.count({
    where: {
      schoolId,
      OR: whereClauses
    }
  });
};

export const createCategory = async (schoolId, data, tx = prisma) => {
  return tx.inventoryCategory.create({
    data: {
      schoolId,
      name: data.name,
      description: data.description || null
    }
  });
};

export const updateCategory = async (schoolId, id, data, tx = prisma) => {
  return tx.inventoryCategory.update({
    where: { schoolId_id: { schoolId, id } },
    data: {
      name: data.name,
      description: data.description !== undefined ? data.description : undefined
    }
  });
};

export const deleteCategory = async (schoolId, id, tx = prisma) => {
  return tx.inventoryCategory.delete({
    where: { schoolId_id: { schoolId, id } }
  });
};

// ==========================================
// 2. Inventory Item Repository Operations
// ==========================================

export const findItems = async (schoolId, { page = 1, limit = 50, category, status, search }) => {
  const skip = (page - 1) * limit;
  const where = { schoolId };

  if (category && category !== 'All') {
    where.category = { equals: category, mode: 'insensitive' };
  }

  if (status && status !== 'All') {
    where.status = status;
  }

  if (search && search.trim()) {
    const term = search.trim();
    where.OR = [
      { name: { contains: term, mode: 'insensitive' } },
      { productId: { contains: term, mode: 'insensitive' } },
      { category: { contains: term, mode: 'insensitive' } }
    ];
  }

  const [items, total] = await Promise.all([
    prisma.inventoryItem.findMany({
      where,
      include: {
        inventoryCategory: {
          select: { id: true, name: true }
        }
      },
      skip,
      take: limit,
      orderBy: { name: 'asc' }
    }),
    prisma.inventoryItem.count({ where })
  ]);

  return { items, total };
};

export const findItemById = async (schoolId, id, tx = prisma) => {
  return tx.inventoryItem.findFirst({
    where: { schoolId, id },
    include: {
      inventoryCategory: {
        select: { id: true, name: true }
      }
    }
  });
};

export const findItemByProductId = async (schoolId, productId, tx = prisma) => {
  if (!productId) return null;
  return tx.inventoryItem.findFirst({
    where: {
      schoolId,
      productId: { equals: productId, mode: 'insensitive' }
    }
  });
};

export const findItemByName = async (schoolId, name, tx = prisma) => {
  if (!name) return null;
  return tx.inventoryItem.findFirst({
    where: {
      schoolId,
      name: { equals: name, mode: 'insensitive' }
    }
  });
};

export const createItem = async (schoolId, data, tx = prisma) => {
  return tx.inventoryItem.create({
    data: {
      schoolId,
      name: data.name,
      productId: data.productId || null,
      categoryId: data.categoryId || null,
      category: data.category || null,
      quantity: data.quantity ?? 0,
      unit: data.unit || 'pcs',
      minimumStock: data.minimumStock ?? 5,
      unitPrice: data.unitPrice !== undefined && data.unitPrice !== null ? data.unitPrice : null,
      status: data.status || 'In Stock',
      customData: data.customData || undefined
    },
    include: {
      inventoryCategory: {
        select: { id: true, name: true }
      }
    }
  });
};

export const updateItemMetadata = async (schoolId, id, data, tx = prisma) => {
  return tx.inventoryItem.update({
    where: { schoolId_id: { schoolId, id } },
    data: {
      name: data.name,
      productId: data.productId !== undefined ? data.productId : undefined,
      categoryId: data.categoryId !== undefined ? data.categoryId : undefined,
      category: data.category !== undefined ? data.category : undefined,
      unit: data.unit,
      minimumStock: data.minimumStock,
      unitPrice: data.unitPrice !== undefined ? data.unitPrice : undefined,
      customData: data.customData !== undefined ? data.customData : undefined
    },
    include: {
      inventoryCategory: {
        select: { id: true, name: true }
      }
    }
  });
};

export const lockItemForUpdate = async (schoolId, id, tx = prisma) => {
  const rows = await tx.$queryRaw`
    SELECT "id", "name", "school_id", "quantity"
    FROM "inventory_items"
    WHERE "school_id" = ${schoolId}::uuid AND "id" = ${id}::uuid
    FOR UPDATE;
  `;
  return rows[0] || null;
};

export const deleteItem = async (schoolId, id, tx = prisma) => {
  return tx.inventoryItem.delete({
    where: { schoolId_id: { schoolId, id } }
  });
};

export const countAuditLogsForItem = async (schoolId, itemId, tx = prisma) => {
  return tx.inventoryAuditLog.count({
    where: { schoolId, itemId }
  });
};

// ==========================================
// 3. Audit Log Repository Operations
// ==========================================

export const createAuditLog = async (schoolId, data, tx = prisma) => {
  return tx.inventoryAuditLog.create({
    data: {
      schoolId,
      itemId: data.itemId,
      itemName: data.itemName || null,
      type: data.type,
      quantity: data.quantity,
      remarks: data.remarks || null,
      userName: data.userName,
      userRole: data.userRole || null,
      prevStock: data.prevStock !== undefined ? data.prevStock : null,
      newStock: data.newStock !== undefined ? data.newStock : null
    }
  });
};

export const findAuditLogs = async (schoolId, {
  page = 1,
  limit = 50,
  startDate,
  endDate,
  productName,
  productId: _productId,
  category: _category,
  userName,
  actionType,
  transactionType,
  search
}) => {
  const skip = (page - 1) * limit;
  const where = { schoolId };

  if (startDate || endDate) {
    where.timestamp = {};
    if (startDate) {
      where.timestamp.gte = new Date(startDate);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      where.timestamp.lte = end;
    }
  }

  if (productName && productName !== 'All') {
    where.itemName = { equals: productName, mode: 'insensitive' };
  }

  if (userName && userName !== 'All') {
    where.userName = { equals: userName, mode: 'insensitive' };
  }

  if (actionType && actionType !== 'All') {
    where.type = { equals: actionType, mode: 'insensitive' };
  }

  if (transactionType && transactionType !== 'All') {
    if (transactionType === 'inbound') {
      where.type = { in: ['Inbound Stock', 'inbound stock', 'Product Created'] };
    } else if (transactionType === 'outbound') {
      where.type = { in: ['Outbound Stock', 'outbound stock'] };
    }
  }

  if (search && search.trim()) {
    const term = search.trim();
    where.OR = [
      { itemName: { contains: term, mode: 'insensitive' } },
      { userName: { contains: term, mode: 'insensitive' } },
      { remarks: { contains: term, mode: 'insensitive' } }
    ];
  }

  const [logs, total] = await Promise.all([
    prisma.inventoryAuditLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { timestamp: 'desc' }
    }),
    prisma.inventoryAuditLog.count({ where })
  ]);

  return { logs, total };
};

export { prisma };
