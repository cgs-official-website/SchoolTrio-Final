import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as clientModule from '../client.js';
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listItems,
  getItem,
  createItem,
  updateItem,
  deleteItem,
  bulkDeleteItems,
  adjustStock,
  bulkImportItems,
  listAuditLogs,
  fetchAllPages
} from '../inventory.js';

describe('Inventory API Client (src/api/inventory.js)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Categories API', () => {
    it('listCategories calls GET /api/v1/inventory/categories', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: [{ id: 'cat-1', name: 'Electronics' }]
      });

      const res = await listCategories();

      expect(spy).toHaveBeenCalledWith('/api/v1/inventory/categories', {
        method: 'GET'
      });
      expect(res.data).toHaveLength(1);
      expect(res.data[0].name).toBe('Electronics');
    });

    it('createCategory calls POST /api/v1/inventory/categories with body', async () => {
      const payload = { name: 'Stationery', description: 'Office supplies' };
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: 'cat-2', ...payload }
      });

      const res = await createCategory(payload);

      expect(spy).toHaveBeenCalledWith('/api/v1/inventory/categories', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      expect(res.data.name).toBe('Stationery');
    });

    it('updateCategory calls PUT /api/v1/inventory/categories/:id', async () => {
      const catId = 'cat-uuid-123';
      const payload = { name: 'Office Stationery', description: 'Updated' };
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: catId, ...payload }
      });

      const res = await updateCategory(catId, payload);

      expect(spy).toHaveBeenCalledWith(`/api/v1/inventory/categories/${catId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      expect(res.data.name).toBe('Office Stationery');
    });

    it('deleteCategory calls DELETE /api/v1/inventory/categories/:id', async () => {
      const catId = 'cat-uuid-123';
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        message: 'Category deleted'
      });

      const res = await deleteCategory(catId);

      expect(spy).toHaveBeenCalledWith(`/api/v1/inventory/categories/${catId}`, {
        method: 'DELETE'
      });
      expect(res.success).toBe(true);
    });
  });

  describe('Items API', () => {
    it('listItems builds query string with allowed parameters', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: [],
        meta: { total: 0, page: 1, limit: 50, totalPages: 0 }
      });

      await listItems({
        search: 'Whiteboard',
        category: 'Stationery',
        status: 'In Stock',
        page: 2,
        limit: 25,
        disallowedParam: 'injected'
      });

      expect(spy).toHaveBeenCalledWith(
        '/api/v1/inventory/items?search=Whiteboard&category=Stationery&status=In+Stock&page=2&limit=25',
        { method: 'GET' }
      );
    });

    it('getItem calls GET /api/v1/inventory/items/:id', async () => {
      const itemId = 'item-uuid-456';
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: itemId, name: 'Marker' }
      });

      const res = await getItem(itemId);

      expect(spy).toHaveBeenCalledWith(`/api/v1/inventory/items/${itemId}`, {
        method: 'GET'
      });
      expect(res.data.name).toBe('Marker');
    });

    it('createItem calls POST /api/v1/inventory/items with payload', async () => {
      const payload = {
        name: 'Projector',
        productId: 'PRD-001',
        category: 'Electronics',
        quantity: 5,
        unit: 'pcs'
      };
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: 'item-uuid-789', ...payload }
      });

      const res = await createItem(payload);

      expect(spy).toHaveBeenCalledWith('/api/v1/inventory/items', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      expect(res.data.name).toBe('Projector');
    });

    it('updateItem calls PUT /api/v1/inventory/items/:id with metadata payload', async () => {
      const itemId = 'item-uuid-789';
      const payload = {
        name: '4K Projector',
        productId: 'PRD-001-HD',
        category: 'Electronics'
      };
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: itemId, ...payload }
      });

      const res = await updateItem(itemId, payload);

      expect(spy).toHaveBeenCalledWith(`/api/v1/inventory/items/${itemId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      expect(res.data.name).toBe('4K Projector');
    });

    it('deleteItem calls DELETE /api/v1/inventory/items/:id', async () => {
      const itemId = 'item-uuid-789';
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        message: 'Item deleted'
      });

      const res = await deleteItem(itemId);

      expect(spy).toHaveBeenCalledWith(`/api/v1/inventory/items/${itemId}`, {
        method: 'DELETE'
      });
      expect(res.success).toBe(true);
    });

    it('bulkDeleteItems calls POST /api/v1/inventory/items/bulk-delete', async () => {
      const itemIds = ['id-1', 'id-2'];
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { requestedCount: 2, deletedCount: 2, blockedCount: 0, blockedItems: [] }
      });

      const res = await bulkDeleteItems(itemIds);

      expect(spy).toHaveBeenCalledWith('/api/v1/inventory/items/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ itemIds })
      });
      expect(res.data.deletedCount).toBe(2);
    });

    it('adjustStock calls POST /api/v1/inventory/items/:id/adjust', async () => {
      const itemId = 'item-uuid-789';
      const payload = { type: 'inbound', quantity: 10, remarks: 'Received batch' };
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: itemId, quantity: 15 }
      });

      const res = await adjustStock(itemId, payload);

      expect(spy).toHaveBeenCalledWith(`/api/v1/inventory/items/${itemId}/adjust`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      expect(res.data.quantity).toBe(15);
    });

    it('bulkImportItems calls POST /api/v1/inventory/items/bulk-import', async () => {
      const payload = {
        items: [
          { name: 'Book A', category: 'Library', quantity: 10 },
          { name: 'Book B', category: 'Library', quantity: 0 }
        ],
        autoCreateCategories: true,
        duplicateAction: 'update'
      };
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { totalRows: 2, successCount: 2, skippedCount: 0, failedCount: 0 }
      });

      const res = await bulkImportItems(payload);

      expect(spy).toHaveBeenCalledWith('/api/v1/inventory/items/bulk-import', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      expect(res.data.successCount).toBe(2);
    });
  });

  describe('Audit Logs API & Pagination Helpers', () => {
    it('listAuditLogs builds query string with allowed parameters', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: [],
        meta: { total: 0, page: 1, limit: 50, totalPages: 0 }
      });

      await listAuditLogs({
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        productName: 'Desk',
        userName: 'Admin User',
        transactionType: 'inbound',
        page: 1,
        limit: 25
      });

      expect(spy).toHaveBeenCalledWith(
        '/api/v1/inventory/audit-logs?startDate=2026-01-01&endDate=2026-01-31&productName=Desk&userName=Admin+User&transactionType=inbound&page=1&limit=25',
        { method: 'GET' }
      );
    });

    it('fetchAllPages collects records across multiple pages without truncation', async () => {
      const page1 = [{ id: '1' }, { id: '2' }];
      const page2 = [{ id: '3' }, { id: '4' }];
      const page3 = [{ id: '5' }];

      const mockFetch = vi.fn()
        .mockResolvedValueOnce({ data: page1, meta: { page: 1, totalPages: 3, total: 5 } })
        .mockResolvedValueOnce({ data: page2, meta: { page: 2, totalPages: 3, total: 5 } })
        .mockResolvedValueOnce({ data: page3, meta: { page: 3, totalPages: 3, total: 5 } });

      const allRecords = await fetchAllPages(mockFetch, { category: 'Electronics' }, 2);

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(mockFetch).toHaveBeenNthCalledWith(1, { category: 'Electronics', page: 1, limit: 2 });
      expect(mockFetch).toHaveBeenNthCalledWith(2, { category: 'Electronics', page: 2, limit: 2 });
      expect(mockFetch).toHaveBeenNthCalledWith(3, { category: 'Electronics', page: 3, limit: 2 });
      expect(allRecords).toHaveLength(5);
      expect(allRecords.map(r => r.id)).toEqual(['1', '2', '3', '4', '5']);
    });
  });
});
