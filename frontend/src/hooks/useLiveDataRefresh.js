import { useEffect, useRef } from 'react';
import { LIVE_DATA_EVENT, LIVE_DATA_CHANNEL, LIVE_DATA_STORAGE_KEY } from '../utils/liveData';

/**
 * Custom React hook to subscribe a component's data fetcher to live mutation events.
 * Executes silently in background whenever backend mutations occur anywhere in the app or other tabs.
 * 
 * @param {Function} fetcherFn - The async data refresh function for the component
 * @param {Array} [deps=[]] - Optional dependencies
 * @param {string|Array<string>} [entityFilter] - Optional entity filter ('students', 'calendar', ['classes', 'students'], etc.)
 */
export function useLiveDataRefresh(fetcherFn, deps = [], entityFilter = null) {
  const fetcherRef = useRef(fetcherFn);
  fetcherRef.current = fetcherFn;

  useEffect(() => {
    const shouldTrigger = (updatedEntity) => {
      if (!entityFilter || updatedEntity === 'all') {
        return true;
      }
      const filters = Array.isArray(entityFilter) ? entityFilter : [entityFilter];
      return filters.includes(updatedEntity);
    };

    // 1. Same-window local event listener
    const handleDataUpdate = (event) => {
      const updatedEntity = event.detail?.entity || 'all';
      if (shouldTrigger(updatedEntity)) {
        fetcherRef.current?.();
      }
    };
    window.addEventListener(LIVE_DATA_EVENT, handleDataUpdate);

    // 2. Cross-tab BroadcastChannel listener
    let bc = null;
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        bc = new BroadcastChannel(LIVE_DATA_CHANNEL);
        bc.onmessage = (msgEvent) => {
          const updatedEntity = msgEvent.data?.entity || 'all';
          if (shouldTrigger(updatedEntity)) {
            fetcherRef.current?.();
          }
        };
      } catch {}
    }

    // 3. Storage event listener (fallback for cross-tab notifications)
    const handleStorage = (storageEvent) => {
      if (storageEvent.key === LIVE_DATA_STORAGE_KEY && storageEvent.newValue) {
        try {
          const data = JSON.parse(storageEvent.newValue);
          const updatedEntity = data?.entity || 'all';
          if (shouldTrigger(updatedEntity)) {
            fetcherRef.current?.();
          }
        } catch {}
      }
    };
    window.addEventListener('storage', handleStorage);

    // 4. Tab visibility and focus listener: refresh automatically when user refocuses the portal
    const handleFocus = () => {
      if (document.visibilityState === 'visible') {
        fetcherRef.current?.();
      }
    };
    window.addEventListener('visibilitychange', handleFocus);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener(LIVE_DATA_EVENT, handleDataUpdate);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('visibilitychange', handleFocus);
      window.removeEventListener('focus', handleFocus);
      if (bc) {
        try {
          bc.close();
        } catch {}
      }
    };
  }, deps);
}

