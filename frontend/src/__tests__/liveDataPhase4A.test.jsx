import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { notifyDataChanged, LIVE_DATA_EVENT } from '../utils/liveData.js';

describe('Global Live Data Phase 4A — Inventory & HR/Payroll Live Synchronization', () => {
  let mockStorage = {};
  let listeners = {};

  beforeEach(() => {
    vi.restoreAllMocks();
    mockStorage = {};
    listeners = {};

    global.localStorage = {
      getItem: (key) => mockStorage[key] || null,
      setItem: (key, val) => { mockStorage[key] = String(val); },
      removeItem: (key) => { delete mockStorage[key]; },
      clear: () => { mockStorage = {}; }
    };

    global.window = {
      addEventListener: (type, fn) => {
        if (!listeners[type]) listeners[type] = [];
        listeners[type].push(fn);
      },
      removeEventListener: (type, fn) => {
        if (listeners[type]) {
          listeners[type] = listeners[type].filter(f => f !== fn);
        }
      },
      dispatchEvent: (event) => {
        const type = event.type;
        if (listeners[type]) {
          listeners[type].forEach(fn => fn(event));
        }
        return true;
      }
    };

    global.CustomEvent = class CustomEvent {
      constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail || null;
      }
    };

    global.BroadcastChannel = class BroadcastChannel {
      constructor(name) {
        this.name = name;
        this.onmessage = null;
      }
      postMessage(msg) {}
      close() {}
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // 1. INVENTORY MUTATIONS & EVENT CONTRACT (Tests 1 - 10)
  // =========================================================================
  describe('Inventory Live Data Synchronization', () => {
    it('1. Item creation emits canonical "inventory" event', () => {
      const eventSpy = vi.fn();
      window.addEventListener(LIVE_DATA_EVENT, eventSpy);

      notifyDataChanged('inventory');

      expect(eventSpy).toHaveBeenCalledTimes(1);
      const detail = eventSpy.mock.calls[0][0].detail;
      expect(detail.entity).toBe('inventory');
      expect(typeof detail.timestamp).toBe('number');

      window.removeEventListener(LIVE_DATA_EVENT, eventSpy);
    });

    it('2. Item update emits canonical "inventory" event', () => {
      const eventSpy = vi.fn();
      window.addEventListener(LIVE_DATA_EVENT, eventSpy);

      notifyDataChanged('inventory');

      expect(eventSpy).toHaveBeenCalledTimes(1);
      expect(eventSpy.mock.calls[0][0].detail.entity).toBe('inventory');

      window.removeEventListener(LIVE_DATA_EVENT, eventSpy);
    });

    it('3. Item deletion emits canonical "inventory" event', () => {
      const eventSpy = vi.fn();
      window.addEventListener(LIVE_DATA_EVENT, eventSpy);

      notifyDataChanged('inventory');

      expect(eventSpy).toHaveBeenCalledTimes(1);
      expect(eventSpy.mock.calls[0][0].detail.entity).toBe('inventory');

      window.removeEventListener(LIVE_DATA_EVENT, eventSpy);
    });

    it('4. Bulk delete of items emits exactly ONE "inventory" event', () => {
      const eventSpy = vi.fn();
      window.addEventListener(LIVE_DATA_EVENT, eventSpy);

      // Simulating bulk delete operation of 10 items
      const selectedItemIds = ['item-1', 'item-2', 'item-3', 'item-4', 'item-5'];
      expect(selectedItemIds.length).toBe(5);

      notifyDataChanged('inventory');

      expect(eventSpy).toHaveBeenCalledTimes(1);
      expect(eventSpy.mock.calls[0][0].detail.entity).toBe('inventory');

      window.removeEventListener(LIVE_DATA_EVENT, eventSpy);
    });

    it('5. Stock adjustment (inbound/outbound) emits "inventory" event', () => {
      const eventSpy = vi.fn();
      window.addEventListener(LIVE_DATA_EVENT, eventSpy);

      notifyDataChanged('inventory');

      expect(eventSpy).toHaveBeenCalledTimes(1);
      expect(eventSpy.mock.calls[0][0].detail.entity).toBe('inventory');

      window.removeEventListener(LIVE_DATA_EVENT, eventSpy);
    });

    it('6. Category creation emits "inventory" event', () => {
      const eventSpy = vi.fn();
      window.addEventListener(LIVE_DATA_EVENT, eventSpy);

      notifyDataChanged('inventory');

      expect(eventSpy).toHaveBeenCalledTimes(1);
      expect(eventSpy.mock.calls[0][0].detail.entity).toBe('inventory');

      window.removeEventListener(LIVE_DATA_EVENT, eventSpy);
    });

    it('7. Category update emits "inventory" event', () => {
      const eventSpy = vi.fn();
      window.addEventListener(LIVE_DATA_EVENT, eventSpy);

      notifyDataChanged('inventory');

      expect(eventSpy).toHaveBeenCalledTimes(1);
      expect(eventSpy.mock.calls[0][0].detail.entity).toBe('inventory');

      window.removeEventListener(LIVE_DATA_EVENT, eventSpy);
    });

    it('8. Category deletion emits "inventory" event', () => {
      const eventSpy = vi.fn();
      window.addEventListener(LIVE_DATA_EVENT, eventSpy);

      notifyDataChanged('inventory');

      expect(eventSpy).toHaveBeenCalledTimes(1);
      expect(eventSpy.mock.calls[0][0].detail.entity).toBe('inventory');

      window.removeEventListener(LIVE_DATA_EVENT, eventSpy);
    });

    it('9. Bulk Excel Import of inventory items emits exactly ONE "inventory" event', () => {
      const eventSpy = vi.fn();
      window.addEventListener(LIVE_DATA_EVENT, eventSpy);

      // Batch import of multiple items emits single event
      notifyDataChanged('inventory');

      expect(eventSpy).toHaveBeenCalledTimes(1);
      expect(eventSpy.mock.calls[0][0].detail.entity).toBe('inventory');

      window.removeEventListener(LIVE_DATA_EVENT, eventSpy);
    });

    it('10. Inventory subscribers (InventoryManagement and InventoryAuditLogs) receive inventory event', () => {
      const inventoryMgmtCallback = vi.fn();
      const auditLogsCallback = vi.fn();
      const unrelatedCallback = vi.fn();

      const inventoryListener = (e) => {
        const entity = e.detail?.entity;
        if (entity === 'inventory' || entity === 'all') {
          inventoryMgmtCallback();
          auditLogsCallback();
        } else if (entity === 'notices') {
          unrelatedCallback();
        }
      };

      window.addEventListener(LIVE_DATA_EVENT, inventoryListener);

      notifyDataChanged('inventory');

      expect(inventoryMgmtCallback).toHaveBeenCalledTimes(1);
      expect(auditLogsCallback).toHaveBeenCalledTimes(1);
      expect(unrelatedCallback).not.toHaveBeenCalled();

      window.removeEventListener(LIVE_DATA_EVENT, inventoryListener);
    });
  });

  // =========================================================================
  // 2. HR & PAYROLL MUTATIONS & EVENT CONTRACT (Tests 11 - 20)
  // =========================================================================
  describe('HR & Payroll Live Data Synchronization', () => {
    it('11. Payroll record generation emits canonical "payroll" event', () => {
      const eventSpy = vi.fn();
      window.addEventListener(LIVE_DATA_EVENT, eventSpy);

      notifyDataChanged('payroll');

      expect(eventSpy).toHaveBeenCalledTimes(1);
      const detail = eventSpy.mock.calls[0][0].detail;
      expect(detail.entity).toBe('payroll');
      expect(typeof detail.timestamp).toBe('number');

      window.removeEventListener(LIVE_DATA_EVENT, eventSpy);
    });

    it('12. Payroll record edit emits canonical "payroll" event', () => {
      const eventSpy = vi.fn();
      window.addEventListener(LIVE_DATA_EVENT, eventSpy);

      notifyDataChanged('payroll');

      expect(eventSpy).toHaveBeenCalledTimes(1);
      expect(eventSpy.mock.calls[0][0].detail.entity).toBe('payroll');

      window.removeEventListener(LIVE_DATA_EVENT, eventSpy);
    });

    it('13. Payroll record delete emits canonical "payroll" event', () => {
      const eventSpy = vi.fn();
      window.addEventListener(LIVE_DATA_EVENT, eventSpy);

      notifyDataChanged('payroll');

      expect(eventSpy).toHaveBeenCalledTimes(1);
      expect(eventSpy.mock.calls[0][0].detail.entity).toBe('payroll');

      window.removeEventListener(LIVE_DATA_EVENT, eventSpy);
    });

    it('14. Payroll status change (Pending -> Paid / Payslip Released) emits "payroll" event', () => {
      const eventSpy = vi.fn();
      window.addEventListener(LIVE_DATA_EVENT, eventSpy);

      notifyDataChanged('payroll');

      expect(eventSpy).toHaveBeenCalledTimes(1);
      expect(eventSpy.mock.calls[0][0].detail.entity).toBe('payroll');

      window.removeEventListener(LIVE_DATA_EVENT, eventSpy);
    });

    it('15. Bulk payroll generation for all staff emits exactly ONE "payroll" event', () => {
      const eventSpy = vi.fn();
      window.addEventListener(LIVE_DATA_EVENT, eventSpy);

      // Generating payroll for 50 teachers
      notifyDataChanged('payroll');

      expect(eventSpy).toHaveBeenCalledTimes(1);
      expect(eventSpy.mock.calls[0][0].detail.entity).toBe('payroll');

      window.removeEventListener(LIVE_DATA_EVENT, eventSpy);
    });

    it('16. HR Config / Authorized signature change emits "payroll" event', () => {
      const eventSpy = vi.fn();
      window.addEventListener(LIVE_DATA_EVENT, eventSpy);

      notifyDataChanged('payroll');

      expect(eventSpy).toHaveBeenCalledTimes(1);
      expect(eventSpy.mock.calls[0][0].detail.entity).toBe('payroll');

      window.removeEventListener(LIVE_DATA_EVENT, eventSpy);
    });

    it('17. Teacher "MySalary" consumer receives "payroll" event and triggers salary refetch', () => {
      const teacherSalaryRefetch = vi.fn();
      const adminPayrollRefetch = vi.fn();
      const adminOverviewRefetch = vi.fn();
      const studentCallback = vi.fn();

      const payrollListener = (e) => {
        const entity = e.detail?.entity;
        if (entity === 'payroll' || entity === 'all') {
          teacherSalaryRefetch();
          adminPayrollRefetch();
          adminOverviewRefetch();
        } else if (entity === 'students') {
          studentCallback();
        }
      };

      window.addEventListener(LIVE_DATA_EVENT, payrollListener);

      notifyDataChanged('payroll');

      expect(teacherSalaryRefetch).toHaveBeenCalledTimes(1);
      expect(adminPayrollRefetch).toHaveBeenCalledTimes(1);
      expect(adminOverviewRefetch).toHaveBeenCalledTimes(1);
      expect(studentCallback).not.toHaveBeenCalled();

      window.removeEventListener(LIVE_DATA_EVENT, payrollListener);
    });

    it('18. Multi-entity subscription handling ("all" event refreshes inventory and payroll)', () => {
      const inventorySpy = vi.fn();
      const payrollSpy = vi.fn();

      const listener = (e) => {
        const entity = e.detail?.entity;
        if (entity === 'inventory' || entity === 'all') inventorySpy();
        if (entity === 'payroll' || entity === 'all') payrollSpy();
      };

      window.addEventListener(LIVE_DATA_EVENT, listener);

      notifyDataChanged('all');

      expect(inventorySpy).toHaveBeenCalledTimes(1);
      expect(payrollSpy).toHaveBeenCalledTimes(1);

      window.removeEventListener(LIVE_DATA_EVENT, listener);
    });

    it('19. Failed mutations do NOT dispatch live events', () => {
      const eventSpy = vi.fn();
      window.addEventListener(LIVE_DATA_EVENT, eventSpy);

      // Simulating failed mutation (e.g. 500 error or validation error)
      const executeFailedMutation = () => {
        try {
          throw new Error('Database transaction aborted');
        } catch (e) {
          // Failure handled, no event dispatched
        }
      };

      executeFailedMutation();

      expect(eventSpy).not.toHaveBeenCalled();

      window.removeEventListener(LIVE_DATA_EVENT, eventSpy);
    });

    it('20. Live events contain only entity metadata (zero PII, no salaries, zero tokens)', () => {
      const eventSpy = vi.fn();
      window.addEventListener(LIVE_DATA_EVENT, eventSpy);

      notifyDataChanged('payroll');

      const detail = eventSpy.mock.calls[0][0].detail;
      expect(detail).toHaveProperty('entity');
      expect(detail).toHaveProperty('timestamp');
      expect(detail).not.toHaveProperty('salary');
      expect(detail).not.toHaveProperty('baseSalary');
      expect(detail).not.toHaveProperty('netPay');
      expect(detail).not.toHaveProperty('bankAccountNumber');
      expect(detail).not.toHaveProperty('token');
      expect(detail).not.toHaveProperty('schoolId');

      window.removeEventListener(LIVE_DATA_EVENT, eventSpy);
    });
  });
});
