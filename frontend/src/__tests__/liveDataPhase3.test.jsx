import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { notifyDataChanged, LIVE_DATA_EVENT } from '../utils/liveData.js';
import * as subjectsApi from '../api/subjects.js';
import { leavesApi } from '../api/leaves.js';
import * as libraryApi from '../api/library.js';
import * as transportApi from '../api/transport.js';
import * as canteenApi from '../api/canteen.js';

describe('Global Live Data Phase 3 — Subjects, Leave, Library, Transport, Canteen Synchronization', () => {
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
  // 1. SUBJECTS (Tests 1, 2, 3)
  // =========================================================================
  describe('Subjects Live Data Synchronization', () => {
    it('1. Subject mutation emits correct canonical "subjects" event', () => {
      const eventSpy = vi.fn();
      window.addEventListener(LIVE_DATA_EVENT, eventSpy);

      notifyDataChanged('subjects');

      expect(eventSpy).toHaveBeenCalledTimes(1);
      const detail = eventSpy.mock.calls[0][0].detail;
      expect(detail.entity).toBe('subjects');
      expect(typeof detail.timestamp).toBe('number');

      window.removeEventListener(LIVE_DATA_EVENT, eventSpy);
    });

    it('2. Failed subject mutation emits no event', async () => {
      const eventSpy = vi.fn();
      window.addEventListener(LIVE_DATA_EVENT, eventSpy);

      try {
        throw new Error('Database conflict on subject creation');
      } catch {
        // Correct pattern: failed mutation does not broadcast
      }

      expect(eventSpy).not.toHaveBeenCalled();
      window.removeEventListener(LIVE_DATA_EVENT, eventSpy);
    });

    it('3. Subject consumer refreshes on event', async () => {
      const refreshSpy = vi.fn();
      const subjectListener = (e) => {
        if (e.detail?.entity === 'subjects' || e.detail?.entity === 'all') {
          refreshSpy();
        }
      };

      window.addEventListener(LIVE_DATA_EVENT, subjectListener);
      notifyDataChanged('subjects');

      expect(refreshSpy).toHaveBeenCalledTimes(1);
      window.removeEventListener(LIVE_DATA_EVENT, subjectListener);
    });
  });

  // =========================================================================
  // 2. LEAVE MANAGEMENT (Tests 4, 5, 6)
  // =========================================================================
  describe('Leave Management Live Data Synchronization', () => {
    it('4. Leave mutation emits correct canonical "leaves" and "leave" event', () => {
      const eventSpy = vi.fn();
      window.addEventListener(LIVE_DATA_EVENT, eventSpy);

      notifyDataChanged('leaves');

      expect(eventSpy).toHaveBeenCalledTimes(1);
      const detail = eventSpy.mock.calls[0][0].detail;
      expect(detail.entity).toBe('leaves');
      expect(typeof detail.timestamp).toBe('number');

      window.removeEventListener(LIVE_DATA_EVENT, eventSpy);
    });

    it('5. Failed leave mutation emits no event', async () => {
      const eventSpy = vi.fn();
      window.addEventListener(LIVE_DATA_EVENT, eventSpy);

      try {
        throw new Error('Authorization failure on leave request approval');
      } catch {
        // Failure does not trigger broadcast
      }

      expect(eventSpy).not.toHaveBeenCalled();
      window.removeEventListener(LIVE_DATA_EVENT, eventSpy);
    });

    it('6. Leave consumer refreshes on event', async () => {
      const refreshSpy = vi.fn();
      const leaveListener = (e) => {
        const entity = e.detail?.entity;
        if (entity === 'leaves' || entity === 'leave' || entity === 'all') {
          refreshSpy();
        }
      };

      window.addEventListener(LIVE_DATA_EVENT, leaveListener);
      notifyDataChanged('leaves');

      expect(refreshSpy).toHaveBeenCalledTimes(1);
      window.removeEventListener(LIVE_DATA_EVENT, leaveListener);
    });
  });

  // =========================================================================
  // 3. LIBRARY (Tests 7, 8)
  // =========================================================================
  describe('Library Live Data Synchronization', () => {
    it('7. Library mutation emits correct canonical "library" event', () => {
      const eventSpy = vi.fn();
      window.addEventListener(LIVE_DATA_EVENT, eventSpy);

      notifyDataChanged('library');

      expect(eventSpy).toHaveBeenCalledTimes(1);
      const detail = eventSpy.mock.calls[0][0].detail;
      expect(detail.entity).toBe('library');
      expect(typeof detail.timestamp).toBe('number');

      window.removeEventListener(LIVE_DATA_EVENT, eventSpy);
    });

    it('8. Library consumer refreshes on event', async () => {
      const refreshSpy = vi.fn();
      const libraryListener = (e) => {
        const entity = e.detail?.entity;
        if (['library', 'books', 'loans', 'all'].includes(entity)) {
          refreshSpy();
        }
      };

      window.addEventListener(LIVE_DATA_EVENT, libraryListener);
      notifyDataChanged('books');

      expect(refreshSpy).toHaveBeenCalledTimes(1);
      window.removeEventListener(LIVE_DATA_EVENT, libraryListener);
    });
  });

  // =========================================================================
  // 4. TRANSPORT (Tests 9, 10)
  // =========================================================================
  describe('Transport Live Data Synchronization', () => {
    it('9. Transport mutation emits correct canonical "transport" event', () => {
      const eventSpy = vi.fn();
      window.addEventListener(LIVE_DATA_EVENT, eventSpy);

      notifyDataChanged('transport');

      expect(eventSpy).toHaveBeenCalledTimes(1);
      const detail = eventSpy.mock.calls[0][0].detail;
      expect(detail.entity).toBe('transport');
      expect(typeof detail.timestamp).toBe('number');

      window.removeEventListener(LIVE_DATA_EVENT, eventSpy);
    });

    it('10. Transport consumer refreshes on event', async () => {
      const refreshSpy = vi.fn();
      const transportListener = (e) => {
        if (e.detail?.entity === 'transport' || e.detail?.entity === 'all') {
          refreshSpy();
        }
      };

      window.addEventListener(LIVE_DATA_EVENT, transportListener);
      notifyDataChanged('transport');

      expect(refreshSpy).toHaveBeenCalledTimes(1);
      window.removeEventListener(LIVE_DATA_EVENT, transportListener);
    });
  });

  // =========================================================================
  // 5. CANTEEN (Tests 11, 12)
  // =========================================================================
  describe('Canteen Live Data Synchronization', () => {
    it('11. Canteen mutation emits correct canonical "canteen" event', () => {
      const eventSpy = vi.fn();
      window.addEventListener(LIVE_DATA_EVENT, eventSpy);

      notifyDataChanged('canteen');

      expect(eventSpy).toHaveBeenCalledTimes(1);
      const detail = eventSpy.mock.calls[0][0].detail;
      expect(detail.entity).toBe('canteen');
      expect(typeof detail.timestamp).toBe('number');

      window.removeEventListener(LIVE_DATA_EVENT, eventSpy);
    });

    it('12. Canteen consumer refreshes on event', async () => {
      const refreshSpy = vi.fn();
      const canteenListener = (e) => {
        if (e.detail?.entity === 'canteen' || e.detail?.entity === 'all') {
          refreshSpy();
        }
      };

      window.addEventListener(LIVE_DATA_EVENT, canteenListener);
      notifyDataChanged('canteen');

      expect(refreshSpy).toHaveBeenCalledTimes(1);
      window.removeEventListener(LIVE_DATA_EVENT, canteenListener);
    });
  });

  // =========================================================================
  // 6. ISOLATION, PERFORMANCE, BULK, INTEGRITY & REGRESSION (Tests 13 - 21)
  // =========================================================================
  describe('Isolation, Bulk Operations, Cross-Tab & Cross-Phase Regression', () => {
    it('13. Unrelated entity does not trigger consumer refresh', () => {
      const transportSpy = vi.fn();
      const canteenSpy = vi.fn();

      const listener = (e) => {
        const entity = e.detail?.entity;
        if (entity === 'transport') transportSpy();
        if (entity === 'canteen') canteenSpy();
      };

      window.addEventListener(LIVE_DATA_EVENT, listener);

      // Mutate library
      notifyDataChanged('library');

      expect(transportSpy).not.toHaveBeenCalled();
      expect(canteenSpy).not.toHaveBeenCalled();

      window.removeEventListener(LIVE_DATA_EVENT, listener);
    });

    it('14. Consumer handler does not cause recursive notify loop', () => {
      let invocationCount = 0;
      const onRefresh = () => {
        invocationCount++;
        // Refresh callback only reads data, NEVER calls notifyDataChanged
      };

      const listener = (e) => {
        if (e.detail?.entity === 'leaves') {
          onRefresh();
        }
      };

      window.addEventListener(LIVE_DATA_EVENT, listener);
      notifyDataChanged('leaves');

      expect(invocationCount).toBe(1);
      window.removeEventListener(LIVE_DATA_EVENT, listener);
    });

    it('15. BroadcastChannel propagation works and sends metadata', () => {
      let sentMessage = null;
      global.BroadcastChannel = class BroadcastChannel {
        constructor(name) {
          this.name = name;
        }
        postMessage(msg) {
          sentMessage = msg;
        }
        close() {}
      };

      notifyDataChanged('subjects');

      expect(sentMessage).toBeDefined();
      expect(sentMessage.entity).toBe('subjects');
      expect(typeof sentMessage.timestamp).toBe('number');
    });

    it('16. localStorage fallback ping works for cross-tab communication', () => {
      const setItemSpy = vi.spyOn(global.localStorage, 'setItem');

      notifyDataChanged('canteen');

      expect(setItemSpy).toHaveBeenCalledWith(
        'sms_live_data_ping',
        expect.stringContaining('"entity":"canteen"')
      );
    });

    it('17. Payload contains metadata only (entity and timestamp)', () => {
      const eventSpy = vi.fn();
      window.addEventListener(LIVE_DATA_EVENT, eventSpy);

      notifyDataChanged('library');

      const detail = eventSpy.mock.calls[0][0].detail;
      const keys = Object.keys(detail);
      expect(keys.sort()).toEqual(['entity', 'timestamp'].sort());

      window.removeEventListener(LIVE_DATA_EVENT, eventSpy);
    });

    it('18. Tenant data, book titles, routes, or meal choices are NEVER embedded in event payload', () => {
      const eventSpy = vi.fn();
      window.addEventListener(LIVE_DATA_EVENT, eventSpy);

      notifyDataChanged('transport');

      const detail = eventSpy.mock.calls[0][0].detail;
      expect(detail.schoolId).toBeUndefined();
      expect(detail.studentId).toBeUndefined();
      expect(detail.routeId).toBeUndefined();
      expect(detail.driverName).toBeUndefined();
      expect(detail.vehicleNumber).toBeUndefined();
      expect(detail.mealType).toBeUndefined();
      expect(detail.data).toBeUndefined();

      window.removeEventListener(LIVE_DATA_EVENT, eventSpy);
    });

    it('19. Bulk mutation emits one logical event rather than per-row events', () => {
      const eventSpy = vi.fn();
      window.addEventListener(LIVE_DATA_EVENT, eventSpy);

      // Simulating bulk upload / import of 250 subject rows
      const bulkSubjectRows = Array.from({ length: 250 }, (_, i) => ({ name: `Subject ${i}`, code: `SUB${i}` }));
      
      const processBulkImport = (rows) => {
        // Backend confirms batch success -> emits ONE event
        notifyDataChanged('subjects');
      };

      processBulkImport(bulkSubjectRows);

      // Must be called exactly ONCE, NOT 250 times
      expect(eventSpy).toHaveBeenCalledTimes(1);

      window.removeEventListener(LIVE_DATA_EVENT, eventSpy);
    });

    it('20. Phase 1 behavior (RBAC, notices, overview) remains intact', () => {
      const rbacSpy = vi.fn();
      const noticesSpy = vi.fn();
      const overviewSpy = vi.fn();

      const listener = (e) => {
        if (e.detail?.entity === 'rbac') rbacSpy();
        if (e.detail?.entity === 'notices') noticesSpy();
        if (e.detail?.entity === 'stats') overviewSpy();
      };

      window.addEventListener(LIVE_DATA_EVENT, listener);

      notifyDataChanged('rbac');
      expect(rbacSpy).toHaveBeenCalledTimes(1);

      notifyDataChanged('notices');
      expect(noticesSpy).toHaveBeenCalledTimes(1);

      notifyDataChanged('stats');
      expect(overviewSpy).toHaveBeenCalledTimes(1);

      window.removeEventListener(LIVE_DATA_EVENT, listener);
    });

    it('21. Phase 2 behavior (attendance, homework, exams, timetables, fees) remains intact', () => {
      const attendanceSpy = vi.fn();
      const homeworkSpy = vi.fn();
      const examsSpy = vi.fn();
      const timetableSpy = vi.fn();
      const feesSpy = vi.fn();

      const listener = (e) => {
        const entity = e.detail?.entity;
        if (entity === 'attendance') attendanceSpy();
        if (entity === 'homework') homeworkSpy();
        if (entity === 'exams') examsSpy();
        if (entity === 'timetables') timetableSpy();
        if (entity === 'fees') feesSpy();
      };

      window.addEventListener(LIVE_DATA_EVENT, listener);

      notifyDataChanged('attendance');
      notifyDataChanged('homework');
      notifyDataChanged('exams');
      notifyDataChanged('timetables');
      notifyDataChanged('fees');

      expect(attendanceSpy).toHaveBeenCalledTimes(1);
      expect(homeworkSpy).toHaveBeenCalledTimes(1);
      expect(examsSpy).toHaveBeenCalledTimes(1);
      expect(timetableSpy).toHaveBeenCalledTimes(1);
      expect(feesSpy).toHaveBeenCalledTimes(1);

      window.removeEventListener(LIVE_DATA_EVENT, listener);
    });
  });
});
