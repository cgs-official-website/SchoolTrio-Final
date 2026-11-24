import React from 'react';
import { LuFileSpreadsheet as FileSpreadsheet } from 'react-icons/lu';

export default function ExcelExportButton({ onClick, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Export to Excel"
      title="Export to Excel"
      className="p-2.5 rounded-xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
    >
      <FileSpreadsheet size={18} />
    </button>
  );
}