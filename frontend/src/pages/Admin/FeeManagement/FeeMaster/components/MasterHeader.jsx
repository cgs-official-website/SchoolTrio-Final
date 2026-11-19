import React from 'react';
import { LuSearch as Search, LuPlus as Plus } from 'react-icons/lu';

/**
 * Section title with search box and "Add" button.
 */
export default function MasterHeader({
  title,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search...',
  addLabel,
  onAdd,
  canAdd = true,
  addDisabled = false
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
      <h3 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h3>

      <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
        <div className="relative w-full sm:w-72">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-300"
            size={16}
          />
          <input
            type="text"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm bg-white dark:bg-slate-900"
          />
        </div>

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
