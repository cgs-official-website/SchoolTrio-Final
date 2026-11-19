import { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import useDebouncedValue from './useDebouncedValue';

/**
 * Shared list state for the Fee Master tabs (server-side paging, search, sorting).
 * `fetcher` must be a stable function, e.g. feeCategoriesApi.listFeeCategories.
 */
export default function useMasterList({
  fetcher,
  defaultSortBy = 'createdAt',
  defaultOrder = 'asc',
  limit = 10,
  errorMessage = 'Failed to load data.'
}) {
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearchValue] = useState('');
  const [sortBy, setSortBy] = useState(defaultSortBy);
  const [order, setOrder] = useState(defaultOrder);

  const debouncedSearch = useDebouncedValue(search);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    try {
      const res = await fetcher({ page, limit, search: debouncedSearch, sortBy, order });
      if (requestId !== requestRef.current) return;

      const data = res?.data || [];
      const pag = res?.pagination || { page, limit, total: data.length, totalPages: 1 };

      // Last row of the last page was deleted: step back one page
      if (data.length === 0 && pag.total > 0 && page > 1) {
        setPage(Math.max(1, pag.totalPages));
        return;
      }

      setRows(data);
      setPagination(pag);
    } catch (error) {
      if (requestId === requestRef.current) {
        console.error(errorMessage, error);
        toast.error(error.message || errorMessage);
      }
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [fetcher, page, limit, debouncedSearch, sortBy, order, errorMessage]);

  useEffect(() => {
    load();
  }, [load]);

  const setSearch = (value) => {
    setSearchValue(value);
    setPage(1);
  };

  const handleSort = (key, nextOrder) => {
    setSortBy(key);
    setOrder(nextOrder);
    setPage(1);
  };

  return { rows, pagination, loading, search, setSearch, sortBy, order, handleSort, setPage, reload: load };
}