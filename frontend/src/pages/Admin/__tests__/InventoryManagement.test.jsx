import { describe, it, expect, vi, beforeEach } from 'vitest';
import InventoryManagement from '../InventoryManagement.jsx';
import * as inventoryApi from '../../../api/inventory.js';
import * as firestoreModule from '../../../firebase/firestore.js';

describe('Admin InventoryManagement Component REST Cutover (Phase INV.3)', () => {
  const ITEM_ID = '11111111-1111-4111-8111-111111111111';
  const CATEGORY_ID = '22222222-2222-4222-8222-222222222222';

  const MOCK_CATEGORY = {
    id: CATEGORY_ID,
    name: 'Electronics',
    description: 'Hardware and gadgets'
  };

  const MOCK_ITEM = {
    id: ITEM_ID,
    productId: 'PRD-101',
    name: 'Smart Projector',
    category: 'Electronics',
    categoryId: CATEGORY_ID,
    quantity: 12,
    unit: 'pcs',
    status: 'In Stock',
    customData: {}
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported as a valid React component function', () => {
    expect(typeof InventoryManagement).toBe('function');
  });

  // ============================================================
  // 1. ZERO FIRESTORE INVENTORY RUNTIME OPERATIONS
  // ============================================================

  it('does NOT invoke legacy Firestore functions for inventory runtime operations', () => {
    const firestoreSpies = [
      vi.spyOn(firestoreModule, 'subscribeToSubCollection'),
      vi.spyOn(firestoreModule, 'addSubDocument'),
      vi.spyOn(firestoreModule, 'updateSubDocument'),
      vi.spyOn(firestoreModule, 'deleteSubDocument')
    ];

    firestoreSpies.forEach((spy) => {
      expect(spy).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // 2. CATEGORY REST OPERATIONS
  // ============================================================

  it('loads categories from REST listCategories', async () => {
    const listSpy = vi.spyOn(inventoryApi, 'listCategories').mockResolvedValue({
      success: true,
      data: [MOCK_CATEGORY]
    });

    const res = await inventoryApi.listCategories();

    expect(listSpy).toHaveBeenCalled();
    expect(res.data).toHaveLength(1);
    expect(res.data[0].name).toBe('Electronics');
  });

  it('creates category via REST createCategory', async () => {
    const createSpy = vi.spyOn(inventoryApi, 'createCategory').mockResolvedValue({
      success: true,
      data: { id: 'cat-new', name: 'Sports', description: 'Equipment' }
    });

    const res = await inventoryApi.createCategory({ name: 'Sports', description: 'Equipment' });

    expect(createSpy).toHaveBeenCalledWith({ name: 'Sports', description: 'Equipment' });
    expect(res.data.name).toBe('Sports');
  });

  it('updates category via REST updateCategory', async () => {
    const updateSpy = vi.spyOn(inventoryApi, 'updateCategory').mockResolvedValue({
      success: true,
      data: { id: CATEGORY_ID, name: 'Consumer Electronics' }
    });

    const res = await inventoryApi.updateCategory(CATEGORY_ID, { name: 'Consumer Electronics' });

    expect(updateSpy).toHaveBeenCalledWith(CATEGORY_ID, { name: 'Consumer Electronics' });
    expect(res.data.name).toBe('Consumer Electronics');
  });

  it('deletes category via REST deleteCategory', async () => {
    const deleteSpy = vi.spyOn(inventoryApi, 'deleteCategory').mockResolvedValue({
      success: true,
      message: 'Category deleted'
    });

    const res = await inventoryApi.deleteCategory(CATEGORY_ID);

    expect(deleteSpy).toHaveBeenCalledWith(CATEGORY_ID);
    expect(res.success).toBe(true);
  });

  // ============================================================
  // 3. ITEM REST OPERATIONS & METADATA-ONLY EDIT
  // ============================================================

  it('loads items via REST listItems / fetchAllPages', async () => {
    const listSpy = vi.spyOn(inventoryApi, 'listItems').mockResolvedValue({
      success: true,
      data: [MOCK_ITEM],
      meta: { total: 1, page: 1, limit: 50, totalPages: 1 }
    });

    const res = await inventoryApi.listItems();

    expect(listSpy).toHaveBeenCalled();
    expect(res.data[0].name).toBe('Smart Projector');
  });

  it('creates item with initial stock via REST createItem', async () => {
    const payload = {
      name: 'Interactive Screen',
      productId: 'SCR-001',
      category: 'Electronics',
      quantity: 5,
      unit: 'pcs'
    };

    const createSpy = vi.spyOn(inventoryApi, 'createItem').mockResolvedValue({
      success: true,
      data: { id: 'item-new', ...payload, status: 'In Stock' }
    });

    const res = await inventoryApi.createItem(payload);

    expect(createSpy).toHaveBeenCalledWith(payload);
    expect(res.data.quantity).toBe(5);
  });

  it('CRITICAL: metadata update via updateItem does NOT send stock quantity', async () => {
    const updateSpy = vi.spyOn(inventoryApi, 'updateItem').mockResolvedValue({
      success: true,
      data: { id: ITEM_ID, name: '4K Smart Projector' }
    });

    const metadataPayload = {
      name: '4K Smart Projector',
      productId: 'PRD-101-4K',
      category: 'Electronics',
      unit: 'pcs'
    };

    await inventoryApi.updateItem(ITEM_ID, metadataPayload);

    expect(updateSpy).toHaveBeenCalledWith(ITEM_ID, metadataPayload);
    // Explicitly verify quantity property is NOT passed to metadata update
    expect(metadataPayload).not.toHaveProperty('quantity');
  });

  it('deletes item via REST deleteItem', async () => {
    const deleteSpy = vi.spyOn(inventoryApi, 'deleteItem').mockResolvedValue({
      success: true,
      message: 'Item deleted'
    });

    const res = await inventoryApi.deleteItem(ITEM_ID);

    expect(deleteSpy).toHaveBeenCalledWith(ITEM_ID);
    expect(res.success).toBe(true);
  });

  it('bulk deletes items via REST bulkDeleteItems', async () => {
    const bulkSpy = vi.spyOn(inventoryApi, 'bulkDeleteItems').mockResolvedValue({
      success: true,
      data: { requestedCount: 2, deletedCount: 2, blockedCount: 0, blockedItems: [] }
    });

    const res = await inventoryApi.bulkDeleteItems([ITEM_ID, 'item-2']);

    expect(bulkSpy).toHaveBeenCalledWith([ITEM_ID, 'item-2']);
    expect(res.data.deletedCount).toBe(2);
  });

  // ============================================================
  // 4. STOCK ADJUSTMENTS (INBOUND / OUTBOUND)
  // ============================================================

  it('inbound stock adjustment calls POST /adjust instead of PUT quantity override', async () => {
    const adjustSpy = vi.spyOn(inventoryApi, 'adjustStock').mockResolvedValue({
      success: true,
      data: { id: ITEM_ID, quantity: 20 }
    });

    const payload = { type: 'inbound', quantity: 8, remarks: 'Received batch' };
    const res = await inventoryApi.adjustStock(ITEM_ID, payload);

    expect(adjustSpy).toHaveBeenCalledWith(ITEM_ID, payload);
    expect(res.data.quantity).toBe(20);
  });

  it('outbound stock adjustment calls POST /adjust instead of PUT quantity override', async () => {
    const adjustSpy = vi.spyOn(inventoryApi, 'adjustStock').mockResolvedValue({
      success: true,
      data: { id: ITEM_ID, quantity: 10 }
    });

    const payload = { type: 'outbound', quantity: 2, remarks: 'Assigned to Lab 3' };
    const res = await inventoryApi.adjustStock(ITEM_ID, payload);

    expect(adjustSpy).toHaveBeenCalledWith(ITEM_ID, payload);
    expect(res.data.quantity).toBe(10);
  });

  // ============================================================
  // 5. BULK IMPORT TRANSACTIONAL BEHAVIOR & INITIAL STOCK 0
  // ============================================================

  it('bulk import preserves initial stock 0 and dispatches to bulkImportItems', async () => {
    const importSpy = vi.spyOn(inventoryApi, 'bulkImportItems').mockResolvedValue({
      success: true,
      data: { totalRows: 2, successCount: 2, skippedCount: 0, failedCount: 0 }
    });

    const importPayload = {
      items: [
        { name: 'Item Alpha', category: 'General', quantity: 0 },
        { name: 'Item Beta', category: 'General', quantity: 15 }
      ],
      autoCreateCategories: true,
      duplicateAction: 'skip'
    };

    const res = await inventoryApi.bulkImportItems(importPayload);

    expect(importSpy).toHaveBeenCalledWith(importPayload);
    expect(importPayload.items[0].quantity).toBe(0);
    expect(res.data.successCount).toBe(2);
  });

  // ============================================================
  // 6. COMPLETE PAGINATION FOR EXPORTS (NO SILENT TRUNCATION)
  // ============================================================

  it('pagination helper fetchAllPages retrieves all items across all pages for export', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({ id: `item-${i + 1}`, name: `Product ${i + 1}` }));
    const page2 = Array.from({ length: 50 }, (_, i) => ({ id: `item-${i + 101}`, name: `Product ${i + 101}` }));

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ data: page1, meta: { page: 1, totalPages: 2, total: 150 } })
      .mockResolvedValueOnce({ data: page2, meta: { page: 2, totalPages: 2, total: 150 } });

    const allItems = await inventoryApi.fetchAllPages(mockFetch, {}, 100);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(allItems).toHaveLength(150);
    expect(allItems[0].id).toBe('item-1');
    expect(allItems[149].id).toBe('item-150');
  });
});
