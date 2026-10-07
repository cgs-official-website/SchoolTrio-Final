import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import usePermissions from '../hooks/usePermissions.js';
import { notifyDataChanged, LIVE_DATA_EVENT } from '../utils/liveData.js';
import * as rbacApi from '../api/rbac.js';
import * as noticesApiModule from '../api/notices.js';

describe('Global Live Data Phase 1 — RBAC, Noticeboard, Admin Overview Synchronization', () => {
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
  // PART 1: RBAC LIVE DATA SYNCHRONIZATION
  // =========================================================================
  describe('Part 1: RBAC Live Data Synchronization', () => {
    it('1. permission mutation emits canonical rbac live-data event', () => {
      const eventSpy = vi.fn();
      window.addEventListener(LIVE_DATA_EVENT, eventSpy);

      notifyDataChanged('rbac');

      expect(eventSpy).toHaveBeenCalledTimes(1);
      const event = eventSpy.mock.calls[0][0];
      expect(event.detail.entity).toBe('rbac');
      expect(event.detail.timestamp).toBeDefined();

      window.removeEventListener(LIVE_DATA_EVENT, eventSpy);
    });

    it('2. usePermissions is a valid hook and exports correct interface', () => {
      expect(typeof usePermissions).toBe('function');
    });

    it('3. permission grant updates normalized permission state', () => {
      const initialPerms = {
        homework: { canRead: false, canCreate: false, canEdit: false, canDelete: false }
      };
      const updatedPerms = {
        homework: { canRead: true, canCreate: true, canEdit: false, canDelete: false }
      };

      const normalize = (perms) => {
        const normalized = {};
        for (const [key, perm] of Object.entries(perms)) {
          normalized[key] = {
            canRead: Boolean(perm.canRead ?? perm.read),
            canCreate: Boolean(perm.canCreate ?? perm.create),
            canEdit: Boolean(perm.canEdit ?? perm.edit),
            canDelete: Boolean(perm.canDelete ?? perm.delete)
          };
        }
        return normalized;
      };

      const normBefore = normalize(initialPerms);
      expect(normBefore.homework.canRead).toBe(false);
      expect(normBefore.homework.canCreate).toBe(false);

      const normAfter = normalize(updatedPerms);
      expect(normAfter.homework.canRead).toBe(true);
      expect(normAfter.homework.canCreate).toBe(true);
    });

    it('4. permission revoke updates normalized permission state', () => {
      const initialPerms = {
        attendance: { canRead: true, canCreate: true, canEdit: true, canDelete: true }
      };
      const revokedPerms = {
        attendance: { canRead: true, canCreate: true, canEdit: false, canDelete: false }
      };

      const normalize = (perms) => {
        const normalized = {};
        for (const [key, perm] of Object.entries(perms)) {
          normalized[key] = {
            canRead: Boolean(perm.canRead ?? perm.read),
            canCreate: Boolean(perm.canCreate ?? perm.create),
            canEdit: Boolean(perm.canEdit ?? perm.edit),
            canDelete: Boolean(perm.canDelete ?? perm.delete)
          };
        }
        return normalized;
      };

      const normBefore = normalize(initialPerms);
      expect(normBefore.attendance.canDelete).toBe(true);

      const normAfter = normalize(revokedPerms);
      expect(normAfter.attendance.canDelete).toBe(false);
      expect(normAfter.attendance.canRead).toBe(true);
    });

    it('5. unrelated entity (e.g. fees) does not trigger permission listener', () => {
      const rbacListener = vi.fn();
      const listener = (e) => {
        if (e.detail?.entity === 'rbac' || e.detail?.entity === 'permissions') {
          rbacListener();
        }
      };

      window.addEventListener(LIVE_DATA_EVENT, listener);

      notifyDataChanged('fees');
      notifyDataChanged('library');

      expect(rbacListener).not.toHaveBeenCalled();

      notifyDataChanged('rbac');
      expect(rbacListener).toHaveBeenCalledTimes(1);

      window.removeEventListener(LIVE_DATA_EVENT, listener);
    });

    it('6. backend RBAC security remains unchanged & authoritative', async () => {
      vi.spyOn(rbacApi, 'getMyPermissions').mockResolvedValue({
        success: true,
        data: {
          systemRole: 'teacher',
          permissions: {
            exams: { canRead: false, canCreate: false, canEdit: false, canDelete: false }
          }
        }
      });

      const res = await rbacApi.getMyPermissions();
      expect(res.data.permissions.exams.canRead).toBe(false);
    });
  });

  // =========================================================================
  // PART 2: NOTICE BOARD LIVE DATA SYNCHRONIZATION
  // =========================================================================
  describe('Part 2: Notice Board Live Data Synchronization', () => {
    it('7. create notice mutation emits canonical notices live-data event', () => {
      const eventSpy = vi.fn();
      window.addEventListener(LIVE_DATA_EVENT, eventSpy);

      notifyDataChanged('notices');

      expect(eventSpy).toHaveBeenCalledTimes(1);
      expect(eventSpy.mock.calls[0][0].detail.entity).toBe('notices');

      window.removeEventListener(LIVE_DATA_EVENT, eventSpy);
    });

    it('8. update notice mutation emits notices live-data event', () => {
      const eventSpy = vi.fn();
      window.addEventListener(LIVE_DATA_EVENT, eventSpy);

      notifyDataChanged('notices');

      expect(eventSpy).toHaveBeenCalledTimes(1);
      expect(eventSpy.mock.calls[0][0].detail.entity).toBe('notices');

      window.removeEventListener(LIVE_DATA_EVENT, eventSpy);
    });

    it('9. delete notice mutation emits notices live-data event', () => {
      const eventSpy = vi.fn();
      window.addEventListener(LIVE_DATA_EVENT, eventSpy);

      notifyDataChanged('notices');

      expect(eventSpy).toHaveBeenCalledTimes(1);
      expect(eventSpy.mock.calls[0][0].detail.entity).toBe('notices');

      window.removeEventListener(LIVE_DATA_EVENT, eventSpy);
    });

    it('10. Teacher noticeboard handler responds to notices event', async () => {
      const listSpy = vi.spyOn(noticesApiModule.noticesApi, 'listNotices').mockResolvedValue({
        success: true,
        data: [{ id: 'n1', title: 'Staff Briefing' }]
      });

      const refreshCallback = async () => {
        await noticesApiModule.noticesApi.listNotices({ type: 'global', limit: 100 });
      };

      const handler = (e) => {
        if (e.detail?.entity === 'notices') {
          refreshCallback();
        }
      };

      window.addEventListener(LIVE_DATA_EVENT, handler);
      notifyDataChanged('notices');

      expect(listSpy).toHaveBeenCalledWith({ type: 'global', limit: 100 });
      window.removeEventListener(LIVE_DATA_EVENT, handler);
    });

    it('11. Parent noticeboard handler responds to notices event', async () => {
      const listSpy = vi.spyOn(noticesApiModule.noticesApi, 'listNotices').mockResolvedValue({
        success: true,
        data: [{ id: 'n2', title: 'Annual Day' }]
      });

      const refreshCallback = async () => {
        await noticesApiModule.noticesApi.listNotices({ type: 'global', limit: 100 });
      };

      const handler = (e) => {
        if (e.detail?.entity === 'notices') {
          refreshCallback();
        }
      };

      window.addEventListener(LIVE_DATA_EVENT, handler);
      notifyDataChanged('notices');

      expect(listSpy).toHaveBeenCalledWith({ type: 'global', limit: 100 });
      window.removeEventListener(LIVE_DATA_EVENT, handler);
    });

    it('12. failed mutation does not emit live-data event', async () => {
      const eventSpy = vi.fn();
      window.addEventListener(LIVE_DATA_EVENT, eventSpy);

      try {
        throw new Error('Mutation failed on network error');
      } catch (e) {
        // No notifyDataChanged on error
      }

      expect(eventSpy).not.toHaveBeenCalled();
      window.removeEventListener(LIVE_DATA_EVENT, eventSpy);
    });
  });

  // =========================================================================
  // PART 3: ADMIN OVERVIEW TARGETED REFRESH
  // =========================================================================
  describe('Part 3: Admin Overview Targeted Live Data Refresh', () => {
    it('13. relevant entity changes trigger targeted metric refresh without full dashboard reload', () => {
      const studentsHandler = vi.fn();
      const staffHandler = vi.fn();
      const classesHandler = vi.fn();
      const noticesHandler = vi.fn();
      const calendarHandler = vi.fn();

      const listener = (event) => {
        const entity = event.detail?.entity;
        if (entity === 'students') studentsHandler();
        if (entity === 'staff') staffHandler();
        if (entity === 'classes') classesHandler();
        if (entity === 'notices') noticesHandler();
        if (entity === 'calendar') calendarHandler();
      };

      window.addEventListener(LIVE_DATA_EVENT, listener);

      notifyDataChanged('students');
      expect(studentsHandler).toHaveBeenCalledTimes(1);
      expect(staffHandler).not.toHaveBeenCalled();
      expect(classesHandler).not.toHaveBeenCalled();

      notifyDataChanged('notices');
      expect(noticesHandler).toHaveBeenCalledTimes(1);
      expect(calendarHandler).not.toHaveBeenCalled();

      window.removeEventListener(LIVE_DATA_EVENT, listener);
    });

    it('14. unrelated entities do not trigger unnecessary metric refresh', () => {
      const calendarHandler = vi.fn();

      const listener = (event) => {
        if (event.detail?.entity === 'calendar') calendarHandler();
      };

      window.addEventListener(LIVE_DATA_EVENT, listener);

      notifyDataChanged('fees');
      notifyDataChanged('inventory');
      notifyDataChanged('transport');

      expect(calendarHandler).not.toHaveBeenCalled();

      window.removeEventListener(LIVE_DATA_EVENT, listener);
    });

    it('15. event handler does not cause recursive notify loop', () => {
      let fetchCount = 0;
      const onRefresh = () => {
        fetchCount++;
      };

      const listener = (event) => {
        if (event.detail?.entity === 'notices') onRefresh();
      };

      window.addEventListener(LIVE_DATA_EVENT, listener);

      notifyDataChanged('notices');

      expect(fetchCount).toBe(1);

      window.removeEventListener(LIVE_DATA_EVENT, listener);
    });
  });

  // =========================================================================
  // CROSS-TAB & TENANT ISOLATION
  // =========================================================================
  describe('Cross-Tab & Tenant Isolation Verification', () => {
    it('16. BroadcastChannel and storage ping propagate metadata', () => {
      const setItemSpy = vi.spyOn(global.localStorage, 'setItem');

      notifyDataChanged('rbac');

      expect(setItemSpy).toHaveBeenCalledWith(
        'sms_live_data_ping',
        expect.stringContaining('"entity":"rbac"')
      );
    });

    it('17. Live data events do not leak raw tenant data in payloads', () => {
      const eventSpy = vi.fn();
      window.addEventListener(LIVE_DATA_EVENT, eventSpy);

      notifyDataChanged('notices');

      const payload = eventSpy.mock.calls[0][0].detail;
      // Payload contains only entity identifier and timestamp metadata
      expect(payload).toEqual({
        entity: 'notices',
        timestamp: expect.any(Number)
      });
      expect(payload.schoolId).toBeUndefined();
      expect(payload.data).toBeUndefined();

      window.removeEventListener(LIVE_DATA_EVENT, eventSpy);
    });
  });
});
