import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { basePrisma as prisma } from '../../../src/database/prisma.client.js';
import * as inventoryService from '../../../src/modules/inventory/inventory.service.js';

describe('Real PostgreSQL Inventory Concurrency, Rollback & Invariant Tests', () => {
  let testSchool;
  const user = { name: 'Concurrency Test Agent', email: 'test@school.com', role: 'Staff' };

  beforeAll(async () => {
    testSchool = await prisma.school.findFirst({
      where: { code: 'SCH_INV_TEST' }
    });

    if (!testSchool) {
      testSchool = await prisma.school.create({
        data: {
          name: 'Inventory Concurrency Test School',
          code: 'SCH_INV_TEST',
          status: 'active'
        }
      });
    }
  });

  afterAll(async () => {
    if (testSchool) {
      await prisma.inventoryAuditLog.deleteMany({ where: { schoolId: testSchool.id } });
      await prisma.inventoryItem.deleteMany({ where: { schoolId: testSchool.id } });
      await prisma.inventoryCategory.deleteMany({ where: { schoolId: testSchool.id } });
      await prisma.school.delete({ where: { id: testSchool.id } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  // ==========================================
  // 1. Real PostgreSQL Concurrency Tests
  // ==========================================

  it('1. Outbound + Outbound: Two concurrent requests for 4 units with initial stock = 5', async () => {
    const item = await inventoryService.createItem(
      testSchool.id,
      {
        name: 'Concurrent Paper Stack',
        productId: `TEST-OUT-${Date.now()}`,
        category: 'Test Category',
        quantity: 5
      },
      user
    );

    const [res1, res2] = await Promise.allSettled([
      inventoryService.adjustStock(testSchool.id, item.id, { type: 'outbound', quantity: 4 }, user),
      inventoryService.adjustStock(testSchool.id, item.id, { type: 'outbound', quantity: 4 }, user)
    ]);

    const successes = [res1, res2].filter(r => r.status === 'fulfilled');
    const failures = [res1, res2].filter(r => r.status === 'rejected');

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0].reason.statusCode).toBe(409);

    const finalItem = await prisma.inventoryItem.findUnique({ where: { id: item.id } });
    expect(finalItem.quantity).toBe(1);
    expect(finalItem.status).toBe('Low Stock');
  });

  it('2. Inbound + Inbound: Two concurrent inbound requests without lost updates', async () => {
    const item = await inventoryService.createItem(
      testSchool.id,
      {
        name: 'Concurrent Pen Box',
        productId: `TEST-IN-${Date.now()}`,
        category: 'Test Category',
        quantity: 10
      },
      user
    );

    const [res1, res2] = await Promise.allSettled([
      inventoryService.adjustStock(testSchool.id, item.id, { type: 'inbound', quantity: 5 }, user),
      inventoryService.adjustStock(testSchool.id, item.id, { type: 'inbound', quantity: 7 }, user)
    ]);

    expect(res1.status).toBe('fulfilled');
    expect(res2.status).toBe('fulfilled');

    const finalItem = await prisma.inventoryItem.findUnique({ where: { id: item.id } });
    expect(finalItem.quantity).toBe(22);
  });

  it('3. Mixed Inbound + Outbound: Concurrent adjustments maintain serializability', async () => {
    const item = await inventoryService.createItem(
      testSchool.id,
      {
        name: 'Concurrent Notebooks',
        productId: `TEST-MIX-${Date.now()}`,
        category: 'Test Category',
        quantity: 20
      },
      user
    );

    const [res1, res2] = await Promise.allSettled([
      inventoryService.adjustStock(testSchool.id, item.id, { type: 'inbound', quantity: 10 }, user),
      inventoryService.adjustStock(testSchool.id, item.id, { type: 'outbound', quantity: 5 }, user)
    ]);

    expect(res1.status).toBe('fulfilled');
    expect(res2.status).toBe('fulfilled');

    const finalItem = await prisma.inventoryItem.findUnique({ where: { id: item.id } });
    expect(finalItem.quantity).toBe(25);
  });

  it('4. Product ID Race: Two concurrent creations with same non-null productId in same school', async () => {
    const sharedProductId = `CONC-SKU-${Date.now()}`;
    const category = await inventoryService.createCategory(testSchool.id, {
      name: `Category For SKU Race ${Date.now()}`
    });

    const [res1, res2] = await Promise.allSettled([
      inventoryService.createItem(
        testSchool.id,
        { name: 'Product Alpha', productId: sharedProductId, categoryId: category.id, quantity: 1 },
        user
      ),
      inventoryService.createItem(
        testSchool.id,
        { name: 'Product Beta', productId: sharedProductId, categoryId: category.id, quantity: 1 },
        user
      )
    ]);

    const successes = [res1, res2].filter(r => r.status === 'fulfilled');
    const failures = [res1, res2].filter(r => r.status === 'rejected');

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0].reason.statusCode).toBe(409);

    const items = await prisma.inventoryItem.findMany({
      where: { schoolId: testSchool.id, productId: sharedProductId }
    });
    expect(items).toHaveLength(1);
  });

  it('5. Category Delete + Reference Race: Category delete races with item creation referencing it', async () => {
    const category = await inventoryService.createCategory(testSchool.id, {
      name: `Race Category ${Date.now()}`
    });

    // Run deleteCategory and createItem simultaneously
    const [delRes, createRes] = await Promise.allSettled([
      inventoryService.deleteCategory(testSchool.id, category.id),
      inventoryService.createItem(
        testSchool.id,
        { name: `Race Item ${Date.now()}`, categoryId: category.id, quantity: 1 },
        user
      )
    ]);

    // Either:
    // Case 1: createItem committed first -> deleteCategory must fail (400 Bad Request)
    // Case 2: deleteCategory committed first -> createItem must fail (404 Category not found)
    const delSuccess = delRes.status === 'fulfilled';
    const createSuccess = createRes.status === 'fulfilled';

    // Both cannot succeed simultaneously leaving a dangling state
    expect(delSuccess && createSuccess).toBe(false);

    if (createSuccess) {
      expect(delRes.status).toBe('rejected');
      expect(delRes.reason.statusCode).toBe(400);
    } else {
      expect(delRes.status).toBe('fulfilled');
      expect(createRes.status).toBe('rejected');
    }
  });

  it('6. Item Delete vs Adjustment Race: Adjustment on item with audit history prevents deletion', async () => {
    const item = await inventoryService.createItem(
      testSchool.id,
      { name: 'Race Adjust Item', category: 'General', quantity: 5 },
      user
    );

    // Concurrently trigger deleteItem and adjustStock
    const [delRes, adjRes] = await Promise.allSettled([
      inventoryService.deleteItem(testSchool.id, item.id),
      inventoryService.adjustStock(testSchool.id, item.id, { type: 'inbound', quantity: 3 }, user)
    ]);

    // Item had audit logs and stock=5 from creation, so deleteItem must be rejected with 400
    expect(delRes.status).toBe('rejected');
    expect(delRes.reason.statusCode).toBe(400);
    expect(adjRes.status).toBe('fulfilled');

    // Final item must exist with stock = 8 and audit log intact
    const finalItem = await prisma.inventoryItem.findUnique({ where: { id: item.id } });
    expect(finalItem).not.toBeNull();
    expect(finalItem.quantity).toBe(8);
  });

  it('7. Item Delete vs Audit Creation Race: Audit logs are never orphaned or silently lost', async () => {
    // Create clean item
    const cleanItem = await inventoryService.createItem(
      testSchool.id,
      { name: 'Clean Item', category: 'General', quantity: 0 },
      user
    );

    // Delete audit log created during creation to simulate a pristine un-audited item with quantity 0
    await prisma.inventoryAuditLog.deleteMany({ where: { itemId: cleanItem.id } });

    // Now race deleteItem with a stock adjustment that writes an audit log
    const [delRes, adjRes] = await Promise.allSettled([
      inventoryService.deleteItem(testSchool.id, cleanItem.id),
      inventoryService.adjustStock(testSchool.id, cleanItem.id, { type: 'inbound', quantity: 2 }, user)
    ]);

    const delSuccess = delRes.status === 'fulfilled';
    const adjSuccess = adjRes.status === 'fulfilled';

    // Both cannot succeed simultaneously leaving a corrupted cascade
    expect(delSuccess && adjSuccess).toBe(false);

    if (adjSuccess) {
      expect(delRes.status).toBe('rejected');
      expect(delRes.reason.statusCode).toBe(400);
      const itemInDb = await prisma.inventoryItem.findUnique({ where: { id: cleanItem.id } });
      expect(itemInDb).not.toBeNull();
      expect(itemInDb.quantity).toBe(2);
    } else {
      expect(delRes.status).toBe('fulfilled');
      expect(adjRes.status).toBe('rejected');
      const orphanLogs = await prisma.inventoryAuditLog.findMany({ where: { itemId: cleanItem.id } });
      expect(orphanLogs).toHaveLength(0);
    }
  });

  // ==========================================
  // 2. Transaction Rollback Verification
  // ==========================================

  it('8. Stock + Audit Rollback: Stock mutation rolls back if audit record creation fails', async () => {
    const item = await inventoryService.createItem(
      testSchool.id,
      { name: 'Rollback Test Item', category: 'General', quantity: 10 },
      user
    );

    // Attempt an adjustment in a transaction where audit creation throws an error
    await expect(
      prisma.$transaction(async (tx) => {
        // 1. Mutate stock
        await tx.$executeRaw`
          UPDATE "inventory_items"
          SET "quantity" = "quantity" + 5, "updated_at" = NOW()
          WHERE "school_id" = ${testSchool.id}::uuid AND "id" = ${item.id}::uuid;
        `;

        // 2. Force audit creation failure with an invalid foreign key
        await tx.inventoryAuditLog.create({
          data: {
            schoolId: testSchool.id,
            itemId: '00000000-0000-0000-0000-000000000000', // Non-existent item ID -> FK error
            type: 'Inbound Stock',
            quantity: 5,
            userName: 'Test'
          }
        });
      })
    ).rejects.toThrow();

    // Verify stock did NOT increment in PostgreSQL (rolled back to 10)
    const finalItem = await prisma.inventoryItem.findUnique({ where: { id: item.id } });
    expect(finalItem.quantity).toBe(10);
  });

  // ==========================================
  // 3. Bulk Import Ambiguity & Duplicate Tests
  // ==========================================

  it('9A. Bulk Import: Rejects duplicate productId within the same payload', async () => {
    const payload = {
      items: [
        { productId: 'DUP-SKU-1', name: 'Ruler A', category: 'General', quantity: 5 },
        { productId: 'DUP-SKU-1', name: 'Ruler B', category: 'General', quantity: 10 }
      ],
      duplicateAction: 'skip'
    };

    try {
      await inventoryService.bulkImportItems(testSchool.id, payload, user);
      expect.fail('Should have thrown ValidationError');
    } catch (err) {
      expect(err.statusCode).toBe(400);
      expect(err.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ message: expect.stringContaining('Duplicate Product ID') })
        ])
      );
    }
  });

  it('9B. Bulk Import: Rejects duplicate normalized product name within the same payload', async () => {
    const payload = {
      items: [
        { name: 'Whiteboard Marker', category: 'General', quantity: 5 },
        { name: '  whiteboard marker  ', category: 'General', quantity: 10 }
      ],
      duplicateAction: 'skip'
    };

    try {
      await inventoryService.bulkImportItems(testSchool.id, payload, user);
      expect.fail('Should have thrown ValidationError');
    } catch (err) {
      expect(err.statusCode).toBe(400);
      expect(err.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ message: expect.stringContaining('Duplicate Product Name') })
        ])
      );
    }
  });

  it('9C. Bulk Import: Rejects ambiguous cross-match (productId matches Item A, name matches Item B)', async () => {
    const itemA = await inventoryService.createItem(
      testSchool.id,
      { name: 'Notebook A', productId: `AMB-SKU-${Date.now()}`, category: 'General', quantity: 5 },
      user
    );
    const itemB = await inventoryService.createItem(
      testSchool.id,
      { name: 'Notebook B', productId: `OTHER-SKU-${Date.now()}`, category: 'General', quantity: 5 },
      user
    );

    // Payload has Item A's productId, but Item B's name
    const payload = {
      items: [
        { productId: itemA.productId, name: itemB.name, category: 'General', quantity: 10 }
      ],
      duplicateAction: 'update'
    };

    await expect(inventoryService.bulkImportItems(testSchool.id, payload, user)).rejects.toThrow(
      /Ambiguous conflict/
    );
  });

  it('9D & 9E. Product ID Normalization: Whitespace trimmed, empty string normalized to NULL', async () => {
    const itemWithSpaces = await inventoryService.createItem(
      testSchool.id,
      { name: 'Item Spaced ID', productId: '  TRIMMED-SKU  ', category: 'General', quantity: 1 },
      user
    );
    expect(itemWithSpaces.productId).toBe('TRIMMED-SKU');

    const itemEmptyString = await inventoryService.createItem(
      testSchool.id,
      { name: 'Item Empty ID', productId: '   ', category: 'General', quantity: 1 },
      user
    );
    expect(itemEmptyString.productId).toBeNull();
  });

  // ==========================================
  // 4. Audit Record Consistency Verification
  // ==========================================

  it('10A. Audit Record Consistency: Verifies creation and inbound stock audit attributes', async () => {
    // 1. Create with initial stock
    const item = await inventoryService.createItem(
      testSchool.id,
      { name: 'Audit Verify Item A', productId: `AUDIT-A-${Date.now()}`, category: 'Stationery', quantity: 12 },
      user
    );

    let logs = await prisma.inventoryAuditLog.findMany({
      where: { schoolId: testSchool.id, itemId: item.id },
      orderBy: { timestamp: 'desc' }
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].type).toBe('Product Created');
    expect(logs[0].prevStock).toBe(0);
    expect(logs[0].newStock).toBe(12);
    expect(logs[0].quantity).toBe(12);
    expect(logs[0].userName).toBe(user.name);
    expect(logs[0].userRole).toBe(user.role);

    // 2. Inbound Stock
    await inventoryService.adjustStock(testSchool.id, item.id, { type: 'inbound', quantity: 8, remarks: 'Restock' }, user);
    logs = await prisma.inventoryAuditLog.findMany({
      where: { schoolId: testSchool.id, itemId: item.id },
      orderBy: { timestamp: 'desc' }
    });
    expect(logs).toHaveLength(2);
    expect(logs[0].type).toBe('Inbound Stock');
    expect(logs[0].prevStock).toBe(12);
    expect(logs[0].newStock).toBe(20);
    expect(logs[0].quantity).toBe(8);
    expect(logs[0].remarks).toBe('Restock');
  }, 30000);

  it('10B. Audit Record Consistency: Verifies outbound stock audit attributes', async () => {
    const item = await inventoryService.createItem(
      testSchool.id,
      { name: 'Audit Verify Item B', productId: `AUDIT-B-${Date.now()}`, category: 'Stationery', quantity: 20 },
      user
    );

    // Outbound Stock
    await inventoryService.adjustStock(testSchool.id, item.id, { type: 'outbound', quantity: 5, remarks: 'Issued to Class 10' }, user);
    const logs = await prisma.inventoryAuditLog.findMany({
      where: { schoolId: testSchool.id, itemId: item.id },
      orderBy: { timestamp: 'desc' }
    });
    expect(logs).toHaveLength(2);
    expect(logs[0].type).toBe('Outbound Stock');
    expect(logs[0].prevStock).toBe(20);
    expect(logs[0].newStock).toBe(15);
    expect(logs[0].quantity).toBe(-5);
    expect(logs[0].remarks).toBe('Issued to Class 10');
  }, 30000);

  it('10C. Audit Record Consistency: Verifies bulk import update audit attributes', async () => {
    const item = await inventoryService.createItem(
      testSchool.id,
      { name: 'Audit Verify Item C', productId: `AUDIT-C-${Date.now()}`, category: 'Stationery', quantity: 15 },
      user
    );

    // Bulk Import Update
    await inventoryService.bulkImportItems(
      testSchool.id,
      {
        items: [{ productId: item.productId, name: item.name, category: 'Stationery', quantity: 10 }],
        duplicateAction: 'update'
      },
      user
    );
    const logs = await prisma.inventoryAuditLog.findMany({
      where: { schoolId: testSchool.id, itemId: item.id },
      orderBy: { timestamp: 'desc' }
    });
    expect(logs).toHaveLength(2);
    expect(logs[0].type).toBe('Product Updated');
    expect(logs[0].prevStock).toBe(15);
    expect(logs[0].newStock).toBe(25);
    expect(logs[0].quantity).toBe(10);
    expect(logs[0].remarks).toBe('Updated via bulk import');
  }, 30000);
});
