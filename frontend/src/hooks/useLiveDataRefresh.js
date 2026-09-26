import { useEffect, useRef } from 'react';
import { LIVE_DATA_EVENT } from '../utils/liveData';

/**
 * Custom React hook to subscribe a component's data fetcher to live mutation events.
 * Executes silently in background whenever backend mutations occur anywhere in the app.
 * 
 * @param {Function} fetcherFn - The async data refresh function for the component
 * @param {Array} [deps=[]] - Optional dependencies
 * @param {string|Array<string>} [entityFilter] - Optional entity filter ('students', ['classes', 'students'], etc.)
 */
export function useLiveDataRefresh(fetcherFn, deps = [], entityFilter = null) {
  const fetcherRef = useRef(fetcherFn);
  fetcherRef.current = fetcherFn;

  useEffect(() => {
    const handleDataUpdate = (event) => {
      const updatedEntity = event.detail?.entity || 'all';

      if (!entityFilter || updatedEntity === 'all') {
        fetcherRef.current?.();
        return;
      }

      const filters = Array.isArray(entityFilter) ? entityFilter : [entityFilter];
      if (filters.includes(updatedEntity)) {
        fetcherRef.current?.();
      }
    };

    window.addEventListener(LIVE_DATA_EVENT, handleDataUpdate);
    return () => {
      window.removeEventListener(LIVE_DATA_EVENT, handleDataUpdate);
    };
  }, deps);
}
