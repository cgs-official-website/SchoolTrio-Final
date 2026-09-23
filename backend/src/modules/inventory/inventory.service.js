import * as inventoryRepo from './inventory.repository.js';
import { prisma } from './inventory.repository.js';
import {
  AppError,
  NotFoundError,
  ConflictError
} from '../../utils/app-error.js';

export class BadRequestError extends AppError {
  constructor(message = 'Bad Request', details = null) {
    super(message, 400, 'BAD_REQUEST', details);
  }
}

/**
 * Normalizes productId by trimming and mapping empty strings / whitespace to null.
 * @param {string|null|undefined} productId
 * @returns {string|null}
 */
export const normalizeProductId = (productId) => {
  if (productId === null || productId === undefined) return null;
  const trimmed = String(productId).trim();
  return trimmed.length > 0 ? trimmed : null;
};

// ==========================================
// 1. Categories Business Logic
// ==========================================

export const listCategories = async (schoolId) => {
  return inventoryRepo.findCategories(schoolId);
};

export const createCategory = async (schoolId, data) => {
  const existing = await inventoryRepo.findCategoryByName(schoolId, data.name);
  if (existing) {
    throw new ConflictError(`Category with name "${data.name}" already exists`);
  }

  try {
    return await inventoryRepo.createCategory(schoolId, {
      name: data.name.trim(),
      description: data.description ? data.description.trim() : null
    });
  } catch (err) {
    if (err.code === 'P2002') {
      throw new ConflictError(`Category with name "${data.name}" already exists`);
    }
    throw err;
  }
};

export const updateCategory = async (schoolId, id, data) => {
  const category = await inventoryRepo.findCategoryById(schoolId, id);
  if (!category) {
    throw new NotFoundError('Inventory category not found');
  }

  if (data.name && data.name.trim().toLowerCase() !== category.name.toLowerCase()) {
    const existing = await inventoryRepo.findCategoryByName(schoolId, data.name.trim());
    if (existing) {
      throw new ConflictError(`Category with name "${data.name}" already exists`);
    }
  }

  try {
    return await inventoryRepo.updateCategory(schoolId, id, {
      name: data.name ? data.name.trim() : undefined,
      description: data.description !== undefined ? (data.description ? data.description.trim() : null) : undefined
    });
  } catch (err) {
    if (err.code === 'P2002') {
      throw new ConflictError(`Category with name "${data.name}" already exists`);
    }
    throw err;
  }
};

export const deleteCategory = async (schoolId, id) => {
  return prisma.$transaction(async (tx) => {
    // 1. Lock category row for update
    const category = await inventoryRepo.lockCategoryForUpdate(schoolId, id, tx);
    if (!category) {
      throw new NotFoundError('Inventory category not found');
    }

    // 2. Check referencing items by categoryId and category name
    const referencedCount = await inventoryRepo.countItemsReferencingCategory(
      schoolId,
      id,
      category.name,
      tx
    );

    if (referencedCount > 0) {
      throw new BadRequestError(
        `Cannot delete category "${category.name}" because it is currently assigned to ${referencedCount} active product(s).`
      );
    }

    // 3. Delete category
    return inventoryRepo.deleteCategory(schoolId, id, tx);
  });
};

// ==========================================
// 2. Inventory Items Business Logic
// ==========================================

export const listItems = async (schoolId, query) => {
  return inventoryRepo.findItems(schoolId, query);
};

export const getItemById = async (schoolId, id) => {
  const item = await inventoryRepo.findItemById(schoolId, id);
  if (!item) {
    throw new NotFoundError('Inventory item not found');
  }
  return item;
};

export const createItem = async (schoolId, data, user = {}) => {
  const normalizedId = normalizeProductId(data.productId);
  const userName = user.name || user.email || 'Admin';
  const userRole = user.role || 'Staff';

  // 1. Resolve category before transaction
  let categoryId = data.categoryId || null;
  let categoryName = data.category ? data.category.trim() : null;

  if (categoryId) {
    const cat = await inventoryRepo.findCategoryById(schoolId, categoryId);
    if (!cat) {
      throw new NotFoundError('Specified category not found');
    }
    categoryName = cat.name;
  } else if (categoryName) {
    let cat = await inventoryRepo.findCategoryByName(schoolId, categoryName);
    if (!cat) {
      try {
        cat = await inventoryRepo.createCategory(schoolId, {
          name: categoryName,
          description: 'Auto-created during item creation'
        });
      } catch (catErr) {
        if (catErr.code === 'P2002') {
          cat = await inventoryRepo.findCategoryByName(schoolId, categoryName);
        } else {
          throw catErr;
        }
      }
    }
    categoryId = cat ? cat.id : null;
    categoryName = cat ? cat.name : categoryName;
  }

  const quantity = data.quantity !== undefined ? Math.max(0, data.quantity) : 0;
  const minimumStock = data.minimumStock !== undefined ? Math.max(0, data.minimumStock) : 5;
  const status = quantity === 0 ? 'Out of Stock' : quantity <= minimumStock ? 'Low Stock' : 'In Stock';

  return prisma.$transaction(async (tx) => {
    // 2. Check productId uniqueness within tenant
    if (normalizedId) {
      const existingProduct = await inventoryRepo.findItemByProductId(schoolId, normalizedId, tx);
      if (existingProduct) {
        throw new ConflictError(`Product ID "${normalizedId}" already exists in this school`);
      }
    }

    // 3. Create Item
    let item;
    try {
      item = await inventoryRepo.createItem(
        schoolId,
        {
          name: data.name.trim(),
          productId: normalizedId,
          categoryId,
          category: categoryName || 'Uncategorized',
          quantity,
          unit: data.unit ? data.unit.trim() : 'pcs',
          minimumStock,
          unitPrice: data.unitPrice,
          status,
          customData: data.customData
        },
        tx
      );
    } catch (err) {
      if (err.code === 'P2002') {
        throw new ConflictError(`Product ID "${normalizedId}" already exists in this school`);
      }
      throw err;
    }

    // 4. Create Audit Log in same transaction
    await inventoryRepo.createAuditLog(
      schoolId,
      {
        itemId: item.id,
        itemName: item.name,
        type: 'Product Created',
        quantity: quantity,
        remarks: 'Manual creation',
        userName,
        userRole,
        prevStock: 0,
        newStock: quantity
      },
      tx
    );

    return item;
  }, { timeout: 15000 });
};

export const updateItem = async (schoolId, id, data, user = {}) => {
  const userName = user.name || user.email || 'Admin';
  const userRole = user.role || 'Staff';

  return prisma.$transaction(async (tx) => {
    const existingItem = await inventoryRepo.findItemById(schoolId, id, tx);
    if (!existingItem) {
      throw new NotFoundError('Inventory item not found');
    }

    const normalizedId = data.productId !== undefined ? normalizeProductId(data.productId) : undefined;
    if (normalizedId && normalizedId !== existingItem.productId) {
      const duplicate = await inventoryRepo.findItemByProductId(schoolId, normalizedId, tx);
      if (duplicate && duplicate.id !== id) {
        throw new ConflictError(`Product ID "${normalizedId}" already exists in this school`);
      }
    }

    let categoryId = data.categoryId !== undefined ? data.categoryId : existingItem.categoryId;
    let categoryName = data.category !== undefined ? (data.category ? data.category.trim() : null) : existingItem.category;

    if (data.categoryId) {
      const cat = await inventoryRepo.findCategoryById(schoolId, data.categoryId, tx);
      if (!cat) {
        throw new NotFoundError('Specified category not found');
      }
      categoryName = cat.name;
    } else if (data.category && data.category.trim() !== existingItem.category) {
      let cat = await inventoryRepo.findCategoryByName(schoolId, data.category.trim(), tx);
      if (!cat) {
        cat = await inventoryRepo.createCategory(
          schoolId,
          {
            name: data.category.trim(),
            description: 'Auto-created during item update'
          },
          tx
        );
      }
      categoryId = cat.id;
      categoryName = cat.name;
    }

    let updatedItem;
    try {
      updatedItem = await inventoryRepo.updateItemMetadata(
        schoolId,
        id,
        {
          name: data.name ? data.name.trim() : undefined,
          productId: normalizedId,
          categoryId,
          category: categoryName,
          unit: data.unit ? data.unit.trim() : undefined,
          minimumStock: data.minimumStock,
          unitPrice: data.unitPrice,
          customData: data.customData
        },
        tx
      );
    } catch (err) {
      if (err.code === 'P2002') {
        throw new ConflictError(`Product ID "${normalizedId}" already exists in this school`);
      }
      throw err;
    }

    // Record audit log for metadata update
    await inventoryRepo.createAuditLog(
      schoolId,
      {
        itemId: id,
        itemName: updatedItem.name,
        type: 'Product Updated',
        quantity: 0,
        remarks: 'Manual update',
        userName,
        userRole,
        prevStock: existingItem.quantity,
        newStock: existingItem.quantity
      },
      tx
    );

    return updatedItem;
  });
};

export const deleteItem = async (schoolId, id) => {
  return prisma.$transaction(async (tx) => {
    const item = await inventoryRepo.lockItemForUpdate(schoolId, id, tx);
    if (!item) {
      throw new NotFoundError('Inventory item not found');
    }

    // Check audit history and active stock while holding row lock
    const auditCount = await inventoryRepo.countAuditLogsForItem(schoolId, id, tx);
    if (auditCount > 0 || item.quantity > 0) {
      throw new BadRequestError(
        'Cannot delete product with existing audit history or active stock. Maintain product record for audit compliance.'
      );
    }

    return inventoryRepo.deleteItem(schoolId, id, tx);
  });
};

export const bulkDeleteItems = async (schoolId, itemIds) => {
  return prisma.$transaction(async (tx) => {
    let deletedCount = 0;
    const blockedItems = [];

    for (const id of itemIds) {
      const item = await inventoryRepo.lockItemForUpdate(schoolId, id, tx);
      if (!item) continue;

      const auditCount = await inventoryRepo.countAuditLogsForItem(schoolId, id, tx);
      if (auditCount > 0 || item.quantity > 0) {
        blockedItems.push({ id, name: item.name, reason: 'Has audit history or active stock' });
      } else {
        await inventoryRepo.deleteItem(schoolId, id, tx);
        deletedCount++;
      }
    }

    return {
      deletedCount,
      blockedCount: blockedItems.length,
      blockedItems
    };
  });
};

// ==========================================
// 3. Stock Adjustment Business Logic (Atomic)
// ==========================================

export const adjustStock = async (schoolId, id, { type, quantity, remarks }, user = {}) => {
  const userName = user.name || user.email || 'Admin';
  const userRole = user.role || 'Staff';
  const qtyVal = parseInt(quantity, 10);

  if (isNaN(qtyVal) || qtyVal <= 0) {
    throw new BadRequestError('Adjustment quantity must be greater than 0');
  }

  try {
    return await prisma.$transaction(async (tx) => {
      // 1. Fetch current item state inside transaction with row lock
      const currentItem = await inventoryRepo.lockItemForUpdate(schoolId, id, tx);

      if (!currentItem) {
        throw new NotFoundError('Inventory item not found');
      }

      const prevStock = currentItem.quantity;
      let actionType;

      if (type === 'inbound') {
        actionType = 'Inbound Stock';

        await tx.$executeRaw`
          UPDATE "inventory_items"
          SET 
            "quantity" = "quantity" + ${qtyVal}::integer,
            "status" = CASE 
              WHEN ("quantity" + ${qtyVal}::integer) = 0 THEN 'Out of Stock'
              WHEN ("quantity" + ${qtyVal}::integer) <= "minimum_stock" THEN 'Low Stock'
              ELSE 'In Stock'
            END,
            "updated_at" = NOW()
          WHERE "school_id" = ${schoolId}::uuid
            AND "id" = ${id}::uuid;
        `;
      } else if (type === 'outbound') {
        if (prevStock < qtyVal) {
          throw new ConflictError('Insufficient stock for outbound adjustment');
        }

        actionType = 'Outbound Stock';

        const updatedCount = await tx.$executeRaw`
          UPDATE "inventory_items"
          SET 
            "quantity" = "quantity" - ${qtyVal}::integer,
            "status" = CASE 
              WHEN ("quantity" - ${qtyVal}::integer) = 0 THEN 'Out of Stock'
              WHEN ("quantity" - ${qtyVal}::integer) <= "minimum_stock" THEN 'Low Stock'
              ELSE 'In Stock'
            END,
            "updated_at" = NOW()
          WHERE "school_id" = ${schoolId}::uuid
            AND "id" = ${id}::uuid
            AND "quantity" >= ${qtyVal}::integer;
        `;

        if (updatedCount === 0) {
          throw new ConflictError('Insufficient stock for outbound adjustment');
        }
      } else {
        throw new BadRequestError('Invalid adjustment type');
      }

      // 2. Fetch updated item
      const updatedItem = await tx.inventoryItem.findFirst({
        where: { schoolId, id },
        include: {
          inventoryCategory: {
            select: { id: true, name: true }
          }
        }
      });

      // 3. Create Audit Log inside same transaction
      const auditLog = await inventoryRepo.createAuditLog(
        schoolId,
        {
          itemId: id,
          itemName: currentItem.name,
          type: actionType,
          quantity: type === 'inbound' ? qtyVal : -qtyVal,
          remarks: remarks ? remarks.trim() : null,
          userName,
          userRole,
          prevStock,
          newStock: updatedItem.quantity
        },
        tx
      );

      return { item: updatedItem, auditLog };
    }, { timeout: 15000 });
  } catch (err) {
    if (err.code === 'P2034' || err.code === 'P2002' || err.code === 'P2028' || (err.message && err.message.includes('Transaction'))) {
      throw new ConflictError('Concurrent transaction conflict, please retry');
    }
    throw err;
  }
};

// ==========================================
// 4. Bulk Import Business Logic (Transactional & Deterministic)
// ==========================================

export const bulkImportItems = async (
  schoolId,
  { items, autoCreateCategories = false, duplicateAction = 'skip' },
  user = {}
) => {
  const userName = user.name || user.email || 'Admin';
  const userRole = user.role || 'Staff';

  // Phase 1: In-memory Payload Validation
  const seenProductIds = new Set();
  const seenProductNames = new Set();
  const validationErrors = [];

  for (let i = 0; i < items.length; i++) {
    const row = items[i];
    const rowNum = i + 1;
    const normId = normalizeProductId(row.productId);
    const normName = row.name ? row.name.trim().toLowerCase() : '';

    if (!normName) {
      validationErrors.push({ row: rowNum, message: 'Product Name is mandatory' });
    }

    if (row.quantity !== undefined && (isNaN(row.quantity) || row.quantity < 0)) {
      validationErrors.push({ row: rowNum, message: 'Initial Stock must be a non-negative integer' });
    }

    if (normId) {
      const lowerId = normId.toLowerCase();
      if (seenProductIds.has(lowerId)) {
        validationErrors.push({ row: rowNum, message: `Duplicate Product ID "${normId}" found within import file` });
      } else {
        seenProductIds.add(lowerId);
      }
    }

    if (normName) {
      if (seenProductNames.has(normName)) {
        validationErrors.push({ row: rowNum, message: `Duplicate Product Name "${row.name.trim()}" found within import file` });
      } else {
        seenProductNames.add(normName);
      }
    }
  }

  if (validationErrors.length > 0) {
    throw new BadRequestError('Validation errors found in import payload', validationErrors);
  }

  // Phase 2: Transactional Execution
  return prisma.$transaction(async (tx) => {
    let successCount = 0;
    let skippedCount = 0;
    let updatedCount = 0;
    const affectedItems = [];

    for (let i = 0; i < items.length; i++) {
      const row = items[i];
      const rowNum = i + 1;
      const normId = normalizeProductId(row.productId);
      const rawName = row.name.trim();
      const rawCategory = row.category.trim();
      const rowQty = Math.max(0, parseInt(row.quantity, 10) || 0);

      // Check DB matches
      let matchById = null;
      let matchByName = null;

      if (normId) {
        matchById = await tx.inventoryItem.findFirst({
          where: { schoolId, productId: { equals: normId, mode: 'insensitive' } }
        });
      }

      matchByName = await tx.inventoryItem.findFirst({
        where: { schoolId, name: { equals: rawName, mode: 'insensitive' } }
      });

      // Check for ambiguous cross-match collision
      if (matchById && matchByName && matchById.id !== matchByName.id) {
        throw new ConflictError(
          `Row ${rowNum}: Ambiguous conflict. Product ID "${normId}" matches product "${matchById.name}" while Product Name "${rawName}" matches a different product.`
        );
      }

      const existingItem = matchById || matchByName;

      if (existingItem) {
        if (duplicateAction === 'skip' || duplicateAction === 'create-new') {
          skippedCount++;
          continue;
        } else if (duplicateAction === 'update') {
          // Update existing item: increment stock and update category
          const prevStock = existingItem.quantity;
          const newQty = prevStock + rowQty;
          const status = newQty === 0 ? 'Out of Stock' : newQty <= existingItem.minimumStock ? 'Low Stock' : 'In Stock';

          // Resolve category if needed
          let cat = await inventoryRepo.findCategoryByName(schoolId, rawCategory, tx);
          if (!cat && autoCreateCategories) {
            cat = await inventoryRepo.createCategory(
              schoolId,
              { name: rawCategory, description: 'Auto-created during bulk import' },
              tx
            );
          }

          const updated = await tx.inventoryItem.update({
            where: { schoolId_id: { schoolId, id: existingItem.id } },
            data: {
              quantity: newQty,
              status,
              categoryId: cat ? cat.id : existingItem.categoryId,
              category: rawCategory
            }
          });

          // Create per-item audit log with valid itemId
          await inventoryRepo.createAuditLog(
            schoolId,
            {
              itemId: existingItem.id,
              itemName: existingItem.name,
              type: 'Product Updated',
              quantity: rowQty,
              remarks: 'Updated via bulk import',
              userName,
              userRole,
              prevStock,
              newStock: newQty
            },
            tx
          );

          updatedCount++;
          successCount++;
          affectedItems.push(updated);
        }
      } else {
        // Create new item
        let cat = await inventoryRepo.findCategoryByName(schoolId, rawCategory, tx);
        if (!cat) {
          if (!autoCreateCategories) {
            throw new BadRequestError(
              `Row ${rowNum}: Category "${rawCategory}" does not exist, and auto-creation is disabled`
            );
          }
          cat = await inventoryRepo.createCategory(
            schoolId,
            { name: rawCategory, description: 'Auto-created during bulk import' },
            tx
          );
        }

        const minimumStock = 5;
        const status = rowQty === 0 ? 'Out of Stock' : rowQty <= minimumStock ? 'Low Stock' : 'In Stock';

        const created = await inventoryRepo.createItem(
          schoolId,
          {
            name: rawName,
            productId: normId,
            categoryId: cat ? cat.id : null,
            category: rawCategory,
            quantity: rowQty,
            unit: 'pcs',
            minimumStock,
            status
          },
          tx
        );

        // Create per-item audit log with valid itemId
        await inventoryRepo.createAuditLog(
          schoolId,
          {
            itemId: created.id,
            itemName: created.name,
            type: 'Product Created',
            quantity: rowQty,
            remarks: 'Created via bulk import',
            userName,
            userRole,
            prevStock: 0,
            newStock: rowQty
          },
          tx
        );

        successCount++;
        affectedItems.push(created);
      }
    }

    return {
      totalRows: items.length,
      successCount,
      updatedCount,
      skippedCount,
      items: affectedItems
    };
  }, { timeout: 15000 });
};

// ==========================================
// 5. Audit Logs Business Logic
// ==========================================

export const listAuditLogs = async (schoolId, query) => {
  return inventoryRepo.findAuditLogs(schoolId, query);
};
