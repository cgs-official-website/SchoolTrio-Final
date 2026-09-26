/**
 * Event-driven Live Data Refresh System
 * Enables website-wide real-time UI updates after backend mutations without page reloads.
 */

export const LIVE_DATA_EVENT = 'app:data-updated';

/**
 * Trigger a live data refresh notification across all active views/components.
 * @param {string} [entity] - Optional entity name ('students', 'classes', 'staff', 'notices', 'fees', etc.)
 */
export const notifyDataChanged = (entity = 'all') => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(LIVE_DATA_EVENT, {
        detail: { entity, timestamp: Date.now() }
      })
    );
  }
};
