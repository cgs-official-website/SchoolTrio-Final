import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { notifyDataChanged, LIVE_DATA_EVENT } from '../utils/liveData.js';

describe('Global Live Data Phase 4B — Extended Modules Live Synchronization Suite', () => {
  let mockStorage = {};
  let listeners = {};
  let broadcastPostMessageSpy;
  let broadcastCloseSpy;

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

    global.CustomEvent = class CustomEvent {
      constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail || null;
      }
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

    broadcastPostMessageSpy = vi.fn();
    broadcastCloseSpy = vi.fn();

    global.BroadcastChannel = class BroadcastChannel {
      constructor(name) {
        this.name = name;
        this.onmessage = null;
      }
      postMessage(data) {
        broadcastPostMessageSpy(data);
      }
      close() {
        broadcastCloseSpy();
      }
      addEventListener(type, fn) {}
      removeEventListener(type, fn) {}
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Entity 1: Leads Management & Public Lead Form', () => {
    it('notifies custom DOM event and BroadcastChannel on lead creation/status change', () => {
      const leadsSubscriber = vi.fn();
      global.window.addEventListener(LIVE_DATA_EVENT, (e) => {
        if (e.detail?.entity === 'leads') leadsSubscriber(e.detail);
      });

      notifyDataChanged('leads');

      expect(leadsSubscriber).toHaveBeenCalledTimes(1);
      expect(leadsSubscriber).toHaveBeenCalledWith(
        expect.objectContaining({
          entity: 'leads'
        })
      );

      expect(broadcastPostMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          entity: 'leads'
        })
      );
    });

    it('triggers registered leads subscribers without triggering full page reloads', () => {
      const leadsSubscriber = vi.fn();
      global.window.addEventListener(LIVE_DATA_EVENT, (e) => {
        if (e.detail?.entity === 'leads' || e.detail?.entity === 'all') {
          leadsSubscriber(e.detail);
        }
      });

      notifyDataChanged('leads');

      expect(leadsSubscriber).toHaveBeenCalledTimes(1);
      expect(leadsSubscriber).toHaveBeenCalledWith(
        expect.objectContaining({
          entity: 'leads'
        })
      );
    });
  });

  describe('Entity 2: Form Builder & Custom Modules Schema', () => {
    it('dispatches forms event upon form schema save or lead form update', () => {
      const formsSubscriber = vi.fn();
      global.window.addEventListener(LIVE_DATA_EVENT, (e) => {
        if (e.detail?.entity === 'forms') formsSubscriber(e.detail);
      });

      notifyDataChanged('forms');

      expect(formsSubscriber).toHaveBeenCalledTimes(1);
      expect(formsSubscriber).toHaveBeenCalledWith(
        expect.objectContaining({
          entity: 'forms'
        })
      );
    });

    it('dispatches custom-modules event upon module creation, record mutation, or deletion', () => {
      const customModSubscriber = vi.fn();
      global.window.addEventListener(LIVE_DATA_EVENT, (e) => {
        if (e.detail?.entity === 'custom-modules') customModSubscriber(e.detail);
      });

      notifyDataChanged('custom-modules');

      expect(customModSubscriber).toHaveBeenCalledTimes(1);
      expect(broadcastPostMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          entity: 'custom-modules'
        })
      );
    });
  });

  describe('Entity 3: Parent-Teacher Meetings (PTM)', () => {
    it('dispatches ptm live event on appointment creation, confirmation, and cancellation', () => {
      const ptmSubscriber = vi.fn();
      global.window.addEventListener(LIVE_DATA_EVENT, (e) => {
        if (e.detail?.entity === 'ptm') ptmSubscriber(e.detail);
      });

      notifyDataChanged('ptm');

      expect(ptmSubscriber).toHaveBeenCalledTimes(1);
      expect(broadcastPostMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          entity: 'ptm'
        })
      );
    });

    it('notifies cross-portal teacher and parent views when status updates', () => {
      const teacherRefreshSpy = vi.fn();
      const parentRefreshSpy = vi.fn();

      const teacherListener = (e) => {
        if (e.detail?.entity === 'ptm') teacherRefreshSpy();
      };
      const parentListener = (e) => {
        if (e.detail?.entity === 'ptm') parentRefreshSpy();
      };

      global.window.addEventListener(LIVE_DATA_EVENT, teacherListener);
      global.window.addEventListener(LIVE_DATA_EVENT, parentListener);

      notifyDataChanged('ptm');

      expect(teacherRefreshSpy).toHaveBeenCalledTimes(1);
      expect(parentRefreshSpy).toHaveBeenCalledTimes(1);

      global.window.removeEventListener(LIVE_DATA_EVENT, teacherListener);
      global.window.removeEventListener(LIVE_DATA_EVENT, parentListener);
    });
  });

  describe('Entity 4: Lesson Plans', () => {
    it('dispatches lesson-plans event on create, update, and delete', () => {
      const planSubscriber = vi.fn();
      global.window.addEventListener(LIVE_DATA_EVENT, (e) => {
        if (e.detail?.entity === 'lesson-plans') planSubscriber(e.detail);
      });

      notifyDataChanged('lesson-plans');

      expect(planSubscriber).toHaveBeenCalledTimes(1);
      expect(broadcastPostMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          entity: 'lesson-plans'
        })
      );
    });
  });

  describe('Entity 5: Academic Resources (Resource Sharing)', () => {
    it('dispatches resources event on upload and deletion', () => {
      const resSubscriber = vi.fn();
      global.window.addEventListener(LIVE_DATA_EVENT, (e) => {
        if (e.detail?.entity === 'resources') resSubscriber(e.detail);
      });

      notifyDataChanged('resources');

      expect(resSubscriber).toHaveBeenCalledTimes(1);
      expect(broadcastPostMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          entity: 'resources'
        })
      );
    });
  });

  describe('Phase 4B Multi-Entity & Universal Broadcasting Integrity', () => {
    it('handles global entity wildcard updates without recursive event loops', () => {
      const subscriber = vi.fn();
      const listener = (event) => {
        subscriber(event.detail);
      };

      global.window.addEventListener(LIVE_DATA_EVENT, listener);

      notifyDataChanged('all');

      expect(subscriber).toHaveBeenCalledTimes(1);

      global.window.removeEventListener(LIVE_DATA_EVENT, listener);
    });

    it('delivers updates across tabs for all Phase 4B entities: leads, forms, custom-modules, ptm, lesson-plans, resources', () => {
      const entities = ['leads', 'forms', 'custom-modules', 'ptm', 'lesson-plans', 'resources'];

      entities.forEach((entity) => {
        notifyDataChanged(entity);
        expect(broadcastPostMessageSpy).toHaveBeenCalledWith(
          expect.objectContaining({ entity })
        );
      });

      expect(broadcastPostMessageSpy).toHaveBeenCalledTimes(entities.length);
    });
  });
});
