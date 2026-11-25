import { useState } from 'react';
import toast from 'react-hot-toast';
import { downloadExcel } from '../utils/excelExport';

const EXPORT_PAGE_SIZE = 100;
const MAX_ROWS = 10000;

/**
 * columns:     [{ key, label, value }]
 * fetcher:     the same function the list uses: (params) => api.list({ ...params, ...filters })
 * getQuery:    () => ({ search, sortBy, order }) of the list right now
 */
export default function useExcelExport({ columns, fetcher, getQuery, defaultFileName, sheetName }) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  // Only the unticked columns are stored, so columns that appear later start ticked
  const [unticked, setUnticked] = useState({});

  const availableFields = columns.map(({ key, label }) => ({ key, label }));
  const selected = Object.fromEntries(columns.map((c) => [c.key, !unticked[c.key]]));

  const toggleField = (key) => setUnticked((prev) => ({ ...prev, [key]: !prev[key] }));

  const selectAll = (checked) =>
    setUnticked(checked ? {} : Object.fromEntries(columns.map((c) => [c.key, true])));

  const exportNow = async (fileName) => {
    const picked = columns.filter((c) => selected[c.key]);
    if (picked.length === 0) return;

    setExporting(true);
    try {
      const rows = [];
      let page = 1;
      let totalPages = 1;

      // Load every page that matches the current search and filters
      do {
        const res = await fetcher({ ...getQuery(), page, limit: EXPORT_PAGE_SIZE });
        const data = res?.data || [];
        rows.push(...data);

        if (rows.length > MAX_ROWS) {
          toast.error(`Too many rows to export (more than ${MAX_ROWS.toLocaleString('en-IN')}). Narrow the filters and try again.`);
          return;
        }

        totalPages =
          res?.pagination?.totalPages || (data.length === EXPORT_PAGE_SIZE ? page + 1 : page);
        if (data.length === 0) break;
        page += 1;
      } while (page <= totalPages);

      if (rows.length === 0) {
        toast('Nothing to export for the current search and filters.');
        return;
      }

      downloadExcel({ fileName: fileName || defaultFileName, sheetName, columns: picked, rows });
      toast.success(`Exported ${rows.length.toLocaleString('en-IN')} row${rows.length === 1 ? '' : 's'}.`);
      setOpen(false);
    } catch (error) {
      toast.error(error.message || 'Failed to export.');
    } finally {
      setExporting(false);
    }
  };

  return {
    open,
    openModal: () => setOpen(true),
    closeModal: () => {
      if (!exporting) setOpen(false);
    },
    exporting,
    selected,
    availableFields,
    toggleField,
    selectAll,
    exportNow
  };
}