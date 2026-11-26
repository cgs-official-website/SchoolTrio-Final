import React from 'react';
import { LuDownload as Download, LuLoader as Loader, LuInbox as Inbox } from 'react-icons/lu';

export const filterInputClass =
    'w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40';

/** Rounded filter strip, same look as the sub-tab strip in Fee Transaction. */
export function FilterBar({ children, onExport, exportDisabled }) {
    return (
        <div className="flex flex-wrap items-end gap-3 p-3 mb-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
            {children}
            {onExport && (
                <button
                    type="button"
                    onClick={onExport}
                    disabled={exportDisabled}
                    className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    <Download size={16} /> Export CSV
                </button>
            )}
        </div>
    );
}

export function Field({ label, children, className = '' }) {
    return (
        <label className={`flex flex-col gap-1 min-w-[150px] ${className}`}>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</span>
            {children}
        </label>
    );
}

export function SummaryCards({ items }) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {items.map(({ label, value, hint }) => (
                <div key={label} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{value}</p>
                    {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
                </div>
            ))}
        </div>
    );
}

/** columns: [{ key, label, render?, align? }] */
export function ReportTable({ title, columns, rows, loading, footer, emptyText = 'No records found.' }) {
    return (
        <div>
            {title && <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">{title}</h2>}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-800/60">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">S.No</th>
                                {columns.map((c) => (
                                    <th
                                        key={c.key}
                                        className={`px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                                    >
                                        {c.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={columns.length + 1} className="px-4 py-12 text-center text-slate-400">
                                        <Loader className="animate-spin inline mr-2" size={18} /> Loading...
                                    </td>
                                </tr>
                            ) : rows.length === 0 ? (
                                <tr>
                                    <td colSpan={columns.length + 1} className="px-4 py-12 text-center text-slate-400">
                                        <Inbox className="inline mr-2" size={18} /> {emptyText}
                                    </td>
                                </tr>
                            ) : (
                                rows.map((row, i) => (
                                    <tr key={row.id || i} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                                        <td className="px-4 py-3 text-slate-500">{i + 1}</td>
                                        {columns.map((c) => (
                                            <td
                                                key={c.key}
                                                className={`px-4 py-3 text-slate-700 dark:text-slate-200 whitespace-nowrap ${c.align === 'right' ? 'text-right' : ''}`}
                                            >
                                                {c.render ? c.render(row) : row[c.key] ?? '-'}
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            )}
                        </tbody>
                        {footer && !loading && rows.length > 0 && <tfoot>{footer}</tfoot>}
                    </table>
                </div>
            </div>
        </div>
    );
}

export const TotalRow = ({ colSpan, label = 'Total', cells }) => (
    <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 font-bold text-slate-900 dark:text-white">
        <td className="px-4 py-3" colSpan={colSpan}>{label}</td>
        {cells}
    </tr>
);
