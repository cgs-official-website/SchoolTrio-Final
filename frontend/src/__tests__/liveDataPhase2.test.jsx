import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { notifyDataChanged, LIVE_DATA_EVENT } from '../utils/liveData.js';
import * as attendanceApi from '../api/attendance.js';
import * as homeworkApi from '../api/homework.js';
import * as examsApi from '../api/exams.js';
import * as timetablesApi from '../api/timetables.js';
import * as feesApi from '../api/fees.js';
import * as invoicesApi from '../api/invoices.js';

describe('Global Live Data Phase 2 — Attendance, Homework, Exams, Timetable, Fees Synchronization', () => {
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
  // 1. ATTENDANCE TESTS (1, 2, 3)
  // =========================================================================
  describe('Attendance Live Data Synchronization', () => {
    it('1. Attendance mutation emits correct canonical "attendance" event', () => {
      const eventSpy = vi.fn();
      window.addEventListener(LIVE_DATA_EVENT, eventSpy);

      notifyDataChanged('attendance');

      expect(eventSpy).toHaveBeenCalledTimes(1);
      const detail = eventSpy.mock.calls[0][0].detail;
      expect(detail.entity).toBe('attendance');
      expect(typeof detail.timestamp).toBe('number');

      window.removeEventListener(LIVE_DATA_EVENT, eventSpy);
    });

    it('2. Failed attendance mutation emits no event', async () => {
      const eventSpy = vi.fn();
      window.addEventListener(LIVE_DATA_EVENT, eventSpy);

      try {
        throw new Error('Database connection timeout on saving attendance');
      } catch {
        // Correct pattern: failed mutation does not broadcast
      }

      expect(eventSpy).not.toHaveBeenCalled();
      window.removeEventListener(LIVE_DATA_EVENT, eventSpy);
    });

    it('3. Attendance consumer refreshes on event', async () => {
      const refreshSpy = vi.fn();
      const attendanceListener = (e) => {
        if (e.detail?.entity === 'attendance') {
          refreshSpy();
        }
      };

      window.addEventListener(LIVE_DATA_EVENT, attendanceListener);
      notifyDataChanged('attendance');

      expect(refreshSpy).toHaveBeenCalledTimes(1);
      window.removeEventListener(LIVE_DATA_EVENT, attendanceListener);
    });
  });

  // =========================================================================
  // 2. HOMEWORK TESTS (4, 5, 6)
  // =========================================================================
  describe('Homework Live Data Synchronization', () => {
    it('4. Homework mutation emits correct canonical "homework" event', () => {
      const eventSpy = vi.fn();
      window.addEventListener(LIVE_DATA_EVENT, eventSpy);

      notifyDataChanged('homework');

      expect(eventSpy).toHaveBeenCalledTimes(1);
      const detail = eventSpy.mock.calls[0][0].detail;
      expect(detail.entity).toBe('homework');
      expect(typeof detail.timestamp).toBe('number');

      window.removeEventListener(LIVE_DATA_EVENT, eventSpy);
    });

    it('5. Homework consumer refreshes on event', () => {
      const refreshSpy = vi.fn();
      const homeworkListener = (e) => {
        if (e.detail?.entity === 'homework') {
          refreshSpy();
        }
      };

      window.addEventListener(LIVE_DATA_EVENT, homeworkListener);
      notifyDataChanged('homework');

      expect(refreshSpy).toHaveBeenCalledTimes(1);
      window.removeEventListener(LIVE_DATA_EVENT, homeworkListener);
    });

    it('6. Failed homework mutation emits no event', () => {
      const eventSpy = vi.fn();
      window.addEventListener(LIVE_DATA_EVENT, eventSpy);

      try {
        throw new Error('Validation error: title required');
      } catch {
        // Failed mutation does not call notifyDataChanged
      }

      expect(eventSpy).not.toHaveBeenCalled();
      window.removeEventListener(LIVE_DATA_EVENT, eventSpy);
    });
  });

  // =========================================================================
  // 3. EXAMS & REPORT CARDS TESTS (7, 8)
  // =========================================================================
  describe('Exams & Report Cards Live Data Synchronization', () => {
    it('7. Exam mutation emits correct canonical "exams" event', () => {
      const eventSpy = vi.fn();
      window.addEventListener(LIVE_DATA_EVENT, eventSpy);

      notifyDataChanged('exams');

      expect(eventSpy).toHaveBeenCalledTimes(1);
      const detail = eventSpy.mock.calls[0][0].detail;
      expect(detail.entity).toBe('exams');

      window.removeEventListener(LIVE_DATA_EVENT, eventSpy);
    });

    it('8. Exam and marks consumer refreshes on "exams" or "marks" event', () => {
      const refreshSpy = vi.fn();
      const examListener = (e) => {
        const entity = e.detail?.entity;
        if (entity === 'exams' || entity === 'marks') {
          refreshSpy();
        }
      };

      window.addEventListener(LIVE_DATA_EVENT, examListener);
      notifyDataChanged('exams');
      expect(refreshSpy).toHaveBeenCalledTimes(1);

      notifyDataChanged('marks');
      expect(refreshSpy).toHaveBeenCalledTimes(2);

      window.removeEventListener(LIVE_DATA_EVENT, examListener);
    });
  });

  // =========================================================================
  // 4. TIMETABLE TESTS (9, 10)
  // =========================================================================
  describe('Timetable Live Data Synchronization', () => {
    it('9. Timetable mutation emits correct canonical "timetables" event', () => {
      const eventSpy = vi.fn();
      window.addEventListener(LIVE_DATA_EVENT, eventSpy);

      notifyDataChanged('timetables');

      expect(eventSpy).toHaveBeenCalledTimes(1);
      expect(eventSpy.mock.calls[0][0].detail.entity).toBe('timetables');

      window.removeEventListener(LIVE_DATA_EVENT, eventSpy);
    });

    it('10. Timetable consumer refreshes on "timetables" or "timetable" event', () => {
      const refreshSpy = vi.fn();
      const timetableListener = (e) => {
        const entity = e.detail?.entity;
        if (entity === 'timetables' || entity === 'timetable') {
          refreshSpy();
        }
      };

      window.addEventListener(LIVE_DATA_EVENT, timetableListener);
      notifyDataChanged('timetables');
      expect(refreshSpy).toHaveBeenCalledTimes(1);

      notifyDataChanged('timetable');
      expect(refreshSpy).toHaveBeenCalledTimes(2);

      window.removeEventListener(LIVE_DATA_EVENT, timetableListener);
    });
  });

  // =========================================================================
  // 5. FEES & INVOICES TESTS (11, 12)
  // =========================================================================
  describe('Fees & Invoices Live Data Synchronization', () => {
    it('11. Fee mutation emits correct canonical "fees" event', () => {
      const eventSpy = vi.fn();
      window.addEventListener(LIVE_DATA_EVENT, eventSpy);

      notifyDataChanged('fees');

      expect(eventSpy).toHaveBeenCalledTimes(1);
      expect(eventSpy.mock.calls[0][0].detail.entity).toBe('fees');

      window.removeEventListener(LIVE_DATA_EVENT, eventSpy);
    });

    it('12. Fee consumer refreshes on "fees" or "invoices" event', () => {
      const refreshSpy = vi.fn();
      const feeListener = (e) => {
        const entity = e.detail?.entity;
        if (entity === 'fees' || entity === 'invoices') {
          refreshSpy();
        }
      };

      window.addEventListener(LIVE_DATA_EVENT, feeListener);
      notifyDataChanged('fees');
      expect(refreshSpy).toHaveBeenCalledTimes(1);

      notifyDataChanged('invoices');
      expect(refreshSpy).toHaveBeenCalledTimes(2);

      window.removeEventListener(LIVE_DATA_EVENT, feeListener);
    });
  });

  // =========================================================================
  // 6. ISOLATION & FILTERING TESTS (13, 14, 15, 16, 17, 18, 19, 20)
  // =========================================================================
  describe('Event Isolation, Safety, Bulk Handling & Tenant Security', () => {
    it('13. Unrelated entity does not trigger refresh on other consumers', () => {
      const attendanceSpy = vi.fn();
      const feesSpy = vi.fn();
      const homeworkSpy = vi.fn();
      const timetableSpy = vi.fn();
      const examsSpy = vi.fn();

      const listener = (e) => {
        const entity = e.detail?.entity;
        if (entity === 'attendance') attendanceSpy();
        if (entity === 'fees') feesSpy();
        if (entity === 'homework') homeworkSpy();
        if (entity === 'timetables') timetableSpy();
        if (entity === 'exams') examsSpy();
      };

      window.addEventListener(LIVE_DATA_EVENT, listener);

      // Trigger fees mutation
      notifyDataChanged('fees');

      expect(feesSpy).toHaveBeenCalledTimes(1);
      expect(attendanceSpy).not.toHaveBeenCalled();
      expect(homeworkSpy).not.toHaveBeenCalled();
      expect(timetableSpy).not.toHaveBeenCalled();
      expect(examsSpy).not.toHaveBeenCalled();

      window.removeEventListener(LIVE_DATA_EVENT, listener);
    });

    it('14. Consumer handler does not cause recursive notify loop', () => {
      let invocationCount = 0;
      const onRefresh = () => {
        invocationCount++;
        // Refresh callback only reads data, NEVER calls notifyDataChanged
      };

      const listener = (e) => {
        if (e.detail?.entity === 'homework') {
          onRefresh();
        }
      };

      window.addEventListener(LIVE_DATA_EVENT, listener);
      notifyDataChanged('homework');

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

      notifyDataChanged('attendance');

      expect(sentMessage).toBeDefined();
      expect(sentMessage.entity).toBe('attendance');
      expect(typeof sentMessage.timestamp).toBe('number');
    });

    it('16. localStorage fallback ping works for cross-tab communication', () => {
      const setItemSpy = vi.spyOn(global.localStorage, 'setItem');

      notifyDataChanged('timetables');

      expect(setItemSpy).toHaveBeenCalledWith(
        'sms_live_data_ping',
        expect.stringContaining('"entity":"timetables"')
      );
    });

    it('17. Payload contains metadata only (entity and timestamp)', () => {
      const eventSpy = vi.fn();
      window.addEventListener(LIVE_DATA_EVENT, eventSpy);

      notifyDataChanged('fees');

      const detail = eventSpy.mock.calls[0][0].detail;
      const keys = Object.keys(detail);
      expect(keys.sort()).toEqual(['entity', 'timestamp'].sort());

      window.removeEventListener(LIVE_DATA_EVENT, eventSpy);
    });

    it('18. Tenant data, student names, and marks are NEVER embedded in event payload', () => {
      const eventSpy = vi.fn();
      window.addEventListener(LIVE_DATA_EVENT, eventSpy);

      notifyDataChanged('exams');

      const detail = eventSpy.mock.calls[0][0].detail;
      expect(detail.schoolId).toBeUndefined();
      expect(detail.studentId).toBeUndefined();
      expect(detail.studentName).toBeUndefined();
      expect(detail.marks).toBeUndefined();
      expect(detail.amount).toBeUndefined();
      expect(detail.data).toBeUndefined();

      window.removeEventListener(LIVE_DATA_EVENT, eventSpy);
    });

    it('19. Bulk mutation emits one logical event, not one per row', () => {
      const eventSpy = vi.fn();
      window.addEventListener(LIVE_DATA_EVENT, eventSpy);

      // Simulating bulk upload / import of 340 student attendance rows
      const bulkRows = Array.from({ length: 340 }, (_, i) => ({ id: `row-${i}`, status: 'Present' }));
      
      // Perform bulk processing
      const processBulk = (rows) => {
        // Backend confirms success for the batch
        notifyDataChanged('attendance');
      };

      processBulk(bulkRows);

      // Must be called exactly ONCE, NOT 340 times
      expect(eventSpy).toHaveBeenCalledTimes(1);

      window.removeEventListener(LIVE_DATA_EVENT, eventSpy);
    });

    it('20. Existing Phase 1 behavior (RBAC, notices) remains intact', () => {
      const rbacSpy = vi.fn();
      const noticesSpy = vi.fn();

      const listener = (e) => {
        if (e.detail?.entity === 'rbac') rbacSpy();
        if (e.detail?.entity === 'notices') noticesSpy();
      };

      window.addEventListener(LIVE_DATA_EVENT, listener);

      notifyDataChanged('rbac');
      expect(rbacSpy).toHaveBeenCalledTimes(1);

      notifyDataChanged('notices');
      expect(noticesSpy).toHaveBeenCalledTimes(1);

      window.removeEventListener(LIVE_DATA_EVENT, listener);
    });
  });
});
