import React from 'react';
import { LuX as X, LuFileSpreadsheet as Sheet, LuFileText as Pdf } from 'react-icons/lu';

export const inputCls =
    'w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900 text-sm';
export const primaryBtn =
    'px-4 py-2.5 bg-primary-600 text-white rounded-xl font-semibold shadow-sm flex items-center justify-center gap-2 hover:bg-primary-700 transition-colors disabled:opacity-50';
export const ghostBtn =
    'px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800';
export const cardCls =
    'bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm';
export const thCls = 'py-4 px-4 text-left whitespace-nowrap';
export const tdCls = 'py-3 px-4 whitespace-nowrap';
export const theadRowCls =
    'border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-300 text-xs font-semibold uppercase tracking-wider';

export function Field({ label, required, children }) {
    return (
        <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
                {label}
                {required ? ' *' : ''}
            </label>
            {children}
        </div>
    );
}

export function Modal({ title, onClose, children, wide = false, xwide = false }) {
    return (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div
                className={`bg-white dark:bg-slate-900 rounded-3xl ${xwide ? 'max-w-5xl' : wide ? 'max-w-2xl' : 'max-w-lg'} w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8 shadow-2xl border border-slate-100 dark:border-slate-800`}
            >
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 text-slate-400 dark:text-slate-300 hover:text-slate-600 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}

export function ExportButtons({ onExcel, onPdf, disabled }) {
    const base =
        'p-2.5 rounded-xl border transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
    return (
        <div className="flex items-center gap-2">
            <button
                type="button" onClick={onExcel} disabled={disabled} title="Export to Excel"
                className={`${base} border-green-200 bg-green-50 text-green-600 hover:bg-green-100 hover:text-green-700 hover:border-green-300 dark:border-green-900 dark:bg-green-950/40 dark:text-green-400 dark:hover:bg-green-900/40`}
            >
                <Sheet size={18} />
            </button>
            <button
                type="button" onClick={onPdf} disabled={disabled} title="Export to PDF"
                className={`${base} border-red-200 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 hover:border-red-300 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-900/40`}
            >
                <Pdf size={18} />
            </button>
        </div>
    );
}

export function EmptyState({ icon: Icon, title, text }) {
    return (
        <div className="py-12 text-center text-slate-500 dark:text-slate-400">
            {Icon ? <Icon size={48} className="mx-auto mb-3 text-slate-300" /> : null}
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">{title}</h3>
            {text ? <p className="text-sm">{text}</p> : null}
        </div>
    );
}

// yyyy-mm-dd for today in local time
export const todayStr = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
