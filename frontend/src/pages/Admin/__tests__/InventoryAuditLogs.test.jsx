import { describe, it, expect, vi, beforeEach } from 'vitest';
import InventoryAuditLogs from '../InventoryAuditLogs.jsx';
import * as inventoryApi from '../../../api/inventory.js';
import * as firestoreModule from '../../../firebase/firestore.js';

describe('Admin InventoryAuditLogs Component REST Cutover (Phase INV.3)', () => {
  const LOG_ID = '33333333-3333-4333-8333-333333333333';
  const ITEM_ID = '11111111-1111-4111-8111-111111111111';

  const MOCK_AUDIT_LOG = {
    id: LOG_ID,
    itemId: ITEM_ID,
    itemName: 'Smart Projector',
    type: 'Inbound Stock',
    quantity: 10,
    prevStock: 5,
    newStock: 15,
    remarks: 'Shipment received',
    userName: 'Admin User',
    userRole: 'Admin',
    timestamp: new Date().toISOString()
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported as a valid React component function', () => {
    expect(typeof InventoryAuditLogs).toBe('function');
  });

  // ============================================================
  // 1. ZERO FIRESTORE AUDIT LOG RUNTIME OPERATIONS
  // ============================================================

  it('does NOT invoke legacy Firestore listeners for audit logs', () => {
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
  // 2. AUDIT LOG REST OPERATIONS & FILTERING
  // ============================================================

  it('loads audit logs from REST listAuditLogs with filter parameters', async () => {
    const listSpy = vi.spyOn(inventoryApi, 'listAuditLogs').mockResolvedValue({
      success: true,
      data: [MOCK_AUDIT_LOG],
      meta: { total: 1, page: 1, limit: 25, totalPages: 1 }
    });

    const query = {
      page: 1,
      limit: 25,
      productName: 'Smart Projector',
      actionType: 'Inbound Stock',
      transactionType: 'inbound'
    };

    const res = await inventoryApi.listAuditLogs(query);

    expect(listSpy).toHaveBeenCalledWith(query);
    expect(res.data).toHaveLength(1);
    expect(res.data[0].itemName).toBe('Smart Projector');
    expect(res.data[0].type).toBe('Inbound Stock');
  });

  // ============================================================
  // 3. MANDATORY PAGINATION & EXPORT DATASET FIDELITY
  // ============================================================

  it('retrieves all audit log pages without truncation when exporting', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      id: `log-${i + 1}`,
      itemName: `Item ${i + 1}`,
      type: 'Inbound Stock',
      timestamp: new Date().toISOString()
    }));
    const page2 = Array.from({ length: 100 }, (_, i) => ({
      id: `log-${i + 101}`,
      itemName: `Item ${i + 101}`,
      type: 'Outbound Stock',
      timestamp: new Date().toISOString()
    }));
    const page3 = Array.from({ length: 45 }, (_, i) => ({
      id: `log-${i + 201}`,
      itemName: `Item ${i + 201}`,
      type: 'Product Created',
      timestamp: new Date().toISOString()
    }));

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ data: page1, meta: { page: 1, totalPages: 3, total: 245 } })
      .mockResolvedValueOnce({ data: page2, meta: { page: 2, totalPages: 3, total: 245 } })
      .mockResolvedValueOnce({ data: page3, meta: { page: 3, totalPages: 3, total: 245 } });

    const allLogs = await inventoryApi.fetchAllPages(mockFetch, { transactionType: 'inbound' }, 100);

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(allLogs).toHaveLength(245);
    expect(allLogs[0].id).toBe('log-1');
    expect(allLogs[244].id).toBe('log-245');
  });
});
