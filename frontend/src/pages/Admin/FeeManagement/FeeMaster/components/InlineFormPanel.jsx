import React from 'react';

export const inputClass =
  'w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900 text-sm';

/**
 * Label + control wrapper used inside the form panel.
 */
export function FormField({ label, required = false, hint, children }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

/**
 * Inline add/edit panel shown above the table.
 * Children are the fields; they are laid out in a responsive grid.
 */
export default function InlineFormPanel({
  title,
  icon: Icon,
  onSubmit,
  onCancel,
  saving = false,
  submitLabel = 'Save',
  columns = 3,
  children
}) {
  const gridCols =
    columns === 1 ? 'md:grid-cols-1' : columns === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3';

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm mb-6 overflow-hidden animate-fade-in-up">
      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 text-center">
        <h4 className="text-sm font-black uppercase tracking-wider text-primary-700 dark:text-primary-300">
          {title}
        </h4>
      </div>

      <form onSubmit={onSubmit} noValidate>
        <div className="p-6 flex flex-col md:flex-row gap-6 items-center">
          {Icon && (
            <div className="hidden md:flex w-32 h-32 shrink-0 rounded-3xl bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-300 items-center justify-center">
              <Icon size={56} />
            </div>
          )}
          <div className={`flex-1 w-full grid grid-cols-1 ${gridCols} gap-4`}>{children}</div>
        </div>

        <div className="px-6 pb-6 flex justify-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-bold shadow-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : submitLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="px-6 py-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-bold transition-colors disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}