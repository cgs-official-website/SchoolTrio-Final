import React from 'react';
import {
  LuSearch as Search,
  LuPlus as Plus,
  LuFilter as Filter,
  LuFileSpreadsheet as FileSpreadsheet
} from 'react-icons/lu';

const secondaryBtn =
  'relative px-4 py-2.5 rounded-xl border text-sm font-bold flex items-center justify-center gap-2 transition-colors shrink-0';

/**
 * Section title with search box, optional Filter and Export buttons, and "Add" button.
 * Filter shows only when onFilter is passed; Export only when onExport is passed.
 */
export default function MasterHeader({
  title,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search...',
  addLabel,
  onAdd,
  canAdd = true,
  addDisabled = false,
  onFilter,
  filterOpen = false,
  filterActive = false,
  onExport
}) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
      <h3 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h3>

      <div className="flex flex-col sm:flex-row sm:flex-wrap lg:flex-nowrap gap-3 w-full lg:w-auto">
        <div className="relative w-full sm:flex-1 sm:min-w-[260px] sm:max-w-sm lg:flex-none lg:w-80">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-300"
            size={16}
          />
          <input
            type="text"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            title={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm bg-white dark:bg-slate-900 truncate"
          />
        </div>

        {onFilter && (
          <button
            type="button"
            onClick={onFilter}
            aria-expanded={filterOpen}
            className={`${secondaryBtn} ${
              filterOpen
                ? 'bg-primary-600 border-primary-600 text-white'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Filter size={16} /> Filter
            {filterActive && !filterOpen && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-white dark:border-slate-900" />
            )}
          </button>
        )}

        {onExport && (
          <button
            type="button"
            onClick={onExport}
            className={`${secondaryBtn} bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800`}
          >
            <FileSpreadsheet size={16} /> Export
          </button>
        )}

        {canAdd && (
          <button
            type="button"
            onClick={onAdd}
            disabled={addDisabled}
            className="px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
          >
            <Plus size={16} /> {addLabel}
          </button>
        )}
      </div>
    </div>
  );
}