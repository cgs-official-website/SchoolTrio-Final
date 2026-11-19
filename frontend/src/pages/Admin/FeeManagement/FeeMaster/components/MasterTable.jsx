import React from 'react';
import {
  LuPencil as Pencil,
  LuTrash2 as Trash2,
  LuChevronUp as ChevronUp,
  LuChevronDown as ChevronDown,
  LuChevronsUpDown as ChevronsUpDown,
  LuInbox as Inbox
} from 'react-icons/lu';

/**
 * Generic table for the Fee Master sub-modules.
 *
 * columns: [{ key, label, sortable?, render?(row), className? }]
 * pagination: { page, limit, total, totalPages }
 */
export default function MasterTable({
  columns,
  rows,
  loading = false,
  sortBy,
  order = 'asc',
  onSort,
  pagination,
  onPageChange,
  onEdit,
  onDelete,
  canEdit = false,
  canDelete = false,
  emptyTitle = 'No records found',
  emptyMessage = ''
}) {
  const page = pagination?.page ?? 1;
  const limit = pagination?.limit ?? 10;
  const total = pagination?.total ?? 0;
  const totalPages = pagination?.totalPages ?? 1;

  const showActions = (canEdit && onEdit) || (canDelete && onDelete);
  const colSpan = columns.length + 1 + (showActions ? 1 : 0);

  const start = total === 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  let firstNum = Math.max(1, page - 2);
  const lastNum = Math.min(totalPages, firstNum + 4);
  firstNum = Math.max(1, lastNum - 4);
  const pageNumbers = [];
  for (let n = firstNum; n <= lastNum; n++) pageNumbers.push(n);

  const pageBtn =
    'px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent';

  const renderSortIcon = (col) => {
    if (!col.sortable) return null;
    if (sortBy !== col.key) return <ChevronsUpDown size={14} className="opacity-50" />;
    return order === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />;
  };

  const handleSort = (col) => {
    if (!col.sortable || !onSort) return;
    const nextOrder = sortBy === col.key && order === 'asc' ? 'desc' : 'asc';
    onSort(col.key, nextOrder);
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="overflow-x-auto w-full min-w-0">
        <table className="w-full text-left border-collapse min-w-max">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-semibold">
              <th className="p-4 pl-6 w-20">S.No</th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`p-4 ${col.className || ''}`}
                  aria-sort={
                    col.sortable && sortBy === col.key
                      ? order === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : undefined
                  }
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() => handleSort(col)}
                      className="inline-flex items-center gap-1.5 uppercase tracking-wider font-semibold hover:text-primary-600 dark:hover:text-primary-300 transition-colors"
                    >
                      {col.label}
                      {renderSortIcon(col)}
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
              {showActions && <th className="p-4 pr-6 text-right w-28">Action</th>}
            </tr>
          </thead>

          <tbody
            className={`divide-y divide-slate-100 dark:divide-slate-800 text-sm transition-opacity ${
              loading && rows.length > 0 ? 'opacity-50' : ''
            }`}
          >
            {rows.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="p-16 text-center text-slate-500 dark:text-slate-400">
                  {loading ? (
                    <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
                  ) : (
                    <>
                      <Inbox size={44} className="mx-auto mb-3 text-slate-300" />
                      <p className="font-bold text-slate-900 dark:text-white mb-1">{emptyTitle}</p>
                      {emptyMessage && <p>{emptyMessage}</p>}
                    </>
                  )}
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={row.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="p-4 pl-6 text-slate-500 dark:text-slate-400 font-medium">
                    {(page - 1) * limit + index + 1}
                  </td>
                  {columns.map((col) => (
                    <td key={col.key} className={`p-4 text-slate-800 dark:text-slate-200 ${col.className || ''}`}>
                      {col.render ? col.render(row) : row[col.key] ?? '—'}
                    </td>
                  ))}
                  {showActions && (
                    <td className="p-4 pr-6 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {canEdit && onEdit && (
                          <button
                            type="button"
                            onClick={() => onEdit(row)}
                            title="Edit"
                            aria-label="Edit"
                            className="p-2 rounded-lg text-primary-700 dark:text-primary-300 hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-colors"
                          >
                            <Pencil size={16} />
                          </button>
                        )}
                        {canDelete && onDelete && (
                          <button
                            type="button"
                            onClick={() => onDelete(row)}
                            title="Delete"
                            aria-label="Delete"
                            className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex flex-col sm:flex-row items-center justify-between gap-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {total === 0 ? 'Showing 0 entries' : `Showing ${start} to ${end} of ${total} entries`}
        </p>

        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className={pageBtn} disabled={page <= 1} onClick={() => onPageChange(1)}>
            First
          </button>
          <button type="button" className={pageBtn} disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            Previous
          </button>
          {pageNumbers.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onPageChange(n)}
              aria-current={n === page ? 'page' : undefined}
              className={
                n === page
                  ? 'px-3 py-1.5 rounded-lg text-xs font-bold border border-primary-600 bg-primary-600 text-white'
                  : pageBtn
              }
            >
              {n}
            </button>
          ))}
          <button type="button" className={pageBtn} disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
            Next
          </button>
          <button type="button" className={pageBtn} disabled={page >= totalPages} onClick={() => onPageChange(totalPages)}>
            Last
          </button>
        </div>
      </div>
    </div>
  );
}