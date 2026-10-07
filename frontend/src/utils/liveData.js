/**
 * Event-driven Live Data Refresh System
 * Enables website-wide real-time UI updates after backend mutations without page reloads.
 * Supports same-window CustomEvent, cross-tab BroadcastChannel, and cross-session storage events.
 */

export const LIVE_DATA_EVENT = 'app:data-updated';
export const LIVE_DATA_CHANNEL = 'sms_live_data_channel';
export const LIVE_DATA_STORAGE_KEY = 'sms_live_data_ping';

/**
 * Trigger a live data refresh notification across all active views/components and browser tabs.
 * @param {string} [entity] - Optional entity name ('students', 'classes', 'staff', 'notices', 'calendar', 'fees', etc.)
 */
export const notifyDataChanged = (entity = 'all') => {
  if (typeof window !== 'undefined') {
    const timestamp = Date.now();
    const payload = { entity, timestamp };

    // 1. Same-window local event dispatch
    try {
      window.dispatchEvent(
        new CustomEvent(LIVE_DATA_EVENT, {
          detail: payload
        })
      );
    } catch {}

    // 2. Cross-tab BroadcastChannel propagation
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const bc = new BroadcastChannel(LIVE_DATA_CHANNEL);
        bc.postMessage(payload);
        bc.close();
      } catch {}
    }

    // 3. Cross-tab/window storage event fallback
    try {
      localStorage.setItem(LIVE_DATA_STORAGE_KEY, JSON.stringify(payload));
    } catch {}
  }
};

