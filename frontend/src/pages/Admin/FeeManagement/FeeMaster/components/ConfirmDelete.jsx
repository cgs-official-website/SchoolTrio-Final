import React, { useEffect } from 'react';
import { LuTriangleAlert as AlertTriangle } from 'react-icons/lu';

/**
 * Delete confirmation dialog. Closes on Escape or backdrop click (unless deleting).
 */
export default function ConfirmDelete({
  open,
  title = 'Delete record?',
  message,
  confirmLabel = 'Delete',
  deleting = false,
  onConfirm,
  onCancel
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !deleting) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, deleting, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 backdrop-blur-sm p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !deleting) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-delete-title"
        className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full border border-slate-100 dark:border-slate-800 shadow-2xl animate-fade-in-up"
      >
        <div className="flex items-start gap-4">
          <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-600 rounded-2xl shrink-0">
            <AlertTriangle size={22} />
          </div>
          <div className="min-w-0">
            <h3 id="confirm-delete-title" className="text-lg font-bold text-slate-900 dark:text-white">
              {title}
            </h3>
            {message && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{message}</p>}
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-sm transition-colors disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-sm transition-colors disabled:opacity-60"
          >
            {deleting ? 'Deleting...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}