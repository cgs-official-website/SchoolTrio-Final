import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import {
    LuFilter as FilterIcon,
    LuFileSpreadsheet as SheetIcon,
    LuPrinter as PrintIcon,
    LuSettings as SettingsIcon,
    LuLoader as Loader,
    LuInbox as Inbox,
    LuChevronUp as SortUp,
    LuChevronDown as SortDown,
    LuChevronsUpDown as SortBoth,
    LuSearch as SearchIcon
} from 'react-icons/lu';
import { getTransportReportStudents, getTransportReportPayments } from '../../../../api/transport';
import { useLiveDataRefresh } from '../../../../hooks/useLiveDataRefresh';
import { exportRowsToExcel, printRowsPdf } from '../../../../utils/transportExport';

export const filterInputClass =
    'w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40';

export const formatMoney = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;

/** any date / ISO string -> dd-mm-yyyy */
export const formatDate = (value) => {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
};

export const natural = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true, sensitivity: 'base' });

const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12 };

/** Pre-KG / Nursery < LKG < UKG < 1..12 (digits or roman numerals) < anything else. */
export const classRank = (name) => {
    const n = String(name || '').trim().toUpperCase().replace(/^(CLASS|GRADE|STD|STANDARD)\s*/, '');
    if (/^(PRE[\s-]?KG|PRE[\s-]?K|NURSERY|PLAY)/.test(n)) return 0;
    if (n === 'LKG') return 1;
    if (n === 'UKG') return 2;
    if (ROMAN[n]) return 2 + ROMAN[n];
    const d = /^(\d+)/.exec(n);
    if (d) return 2 + Number(d[1]);
    return 100;
};
export const compareClassNames = (a, b) => classRank(a) - classRank(b) || natural(a, b);

export const classSection = (r) => [r.className, r.sectionName].filter(Boolean).join(' - ');

export const unique = (rows, pick) => [...new Set(rows.map(pick).filter(Boolean))];

const rupees = (v) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
export const money = rupees;

// ------------------------------------------------------------------
// Data hooks
// ------------------------------------------------------------------

function useReportData(fetcher, params) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const key = JSON.stringify(params || {});
    const seq = useRef(0);

    const load = useCallback(async () => {
        const mine = ++seq.current;
        setLoading(true);
        try {
            const res = await fetcher(JSON.parse(key));
            if (mine === seq.current) setRows(Array.isArray(res?.data) ? res.data : []);
        } catch (err) {
            if (mine === seq.current) {
                setRows([]);
                toast.error(err?.message || 'Failed to load transport report.');
            }
        } finally {
            if (mine === seq.current) setLoading(false);
        }
    }, [fetcher, key]);

    useEffect(() => { load(); }, [load]);
    useLiveDataRefresh(load, [load], ['transport', 'fees', 'students']);
    return { rows, loading };
}

export const useTransportStudents = () => useReportData(getTransportReportStudents, {});
export const useTransportPayments = (range) => useReportData(getTransportReportPayments, range);

// ------------------------------------------------------------------
// Toolbar: Filter / Export Excel / Print PDF / Settings
// ------------------------------------------------------------------

const btnBase = 'inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-bold border transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const btnPrimary = `${btnBase} bg-primary-600 border-primary-600 text-white hover:bg-primary-700`;
const btnGhost = `${btnBase} bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800`;

export function ReportToolbar({
    title, filterCount = 0, onToggleFilter, filterOpen,
    onExcel, onPrint, disabled,
    columns, hidden, onToggleColumn
}) {
    const [settingsOpen, setSettingsOpen] = useState(false);
    const popRef = useRef(null);

    useEffect(() => {
        if (!settingsOpen) return undefined;
        const close = (e) => { if (popRef.current && !popRef.current.contains(e.target)) setSettingsOpen(false); };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [settingsOpen]);

    return (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
            <div className="flex flex-wrap items-center gap-2">
                {onToggleFilter && (
                    <button type="button" onClick={onToggleFilter} className={filterOpen || filterCount ? btnPrimary : btnGhost} aria-expanded={filterOpen}>
                        <FilterIcon size={15} /> Filter{filterCount ? ` (${filterCount})` : ''}
                    </button>
                )}
                <button type="button" onClick={onExcel} disabled={disabled} className={`${btnBase} border-green-200 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-900 dark:bg-green-950/40 dark:text-green-400`}>
                    <SheetIcon size={15} /> Export Excel
                </button>
                {onPrint && (
                    <button type="button" onClick={onPrint} disabled={disabled} className={btnPrimary}>
                        <PrintIcon size={15} /> Print PDF
                    </button>
                )}
                {columns && (
                    <div className="relative" ref={popRef}>
                        <button type="button" onClick={() => setSettingsOpen((v) => !v)} className={btnPrimary} aria-expanded={settingsOpen}>
                            <SettingsIcon size={15} /> Settings
                        </button>
                        {settingsOpen && (
                            <div className="absolute right-0 z-20 mt-2 w-64 max-h-80 overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-3">
                                <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Show / hide columns</p>
                                {columns.map((c) => (
                                    <label key={c.key} className="flex items-center gap-2 py-1.5 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={!hidden.has(c.key)}
                                            onChange={() => onToggleColumn(c.key)}
                                            className="rounded border-slate-300"
                                        />
                                        {c.label}
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// ------------------------------------------------------------------
// Filter panel + totals strip
// ------------------------------------------------------------------

export function FilterPanel({ open, onReset, children }) {
    if (!open) return null;
    return (
        <div className="mb-5 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">{children}</div>
            <div className="flex justify-end mt-3">
                <button type="button" onClick={onReset} className={btnGhost}>Reset filters</button>
            </div>
        </div>
    );
}

export function SelectField({ label, value, onChange, options, allLabel = 'All' }) {
    return (
        <label className="flex flex-col gap-1 min-w-0">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</span>
            <select value={value} onChange={(e) => onChange(e.target.value)} className={filterInputClass}>
                <option value="">{allLabel}</option>
                {options.map((o) => {
                    const opt = typeof o === 'string' ? { value: o, label: o } : o;
                    return <option key={opt.value} value={opt.value}>{opt.label}</option>;
                })}
            </select>
        </label>
    );
}

export function DateField({ label, value, onChange }) {
    return (
        <label className="flex flex-col gap-1 min-w-0">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</span>
            <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className={filterInputClass} />
        </label>
    );
}

/** "Total Amount : 16,64,919" style strip of the report */
export function TotalsStrip({ items }) {
    return (
        <div className="flex flex-wrap gap-3 mb-5">
            {items.map(({ label, value }) => (
                <div key={label} className="flex items-baseline gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label} :</span>
                    <span className="text-base font-bold text-slate-900 dark:text-white">{value}</span>
                </div>
            ))}
        </div>
    );
}

// ------------------------------------------------------------------
// Data table: search, sortable headers, pagination, column visibility
// ------------------------------------------------------------------

const PAGE_SIZES = [10, 25, 50, 100];

/**
 * columns: [{ key, label, value(row) -> text/number shown (and exported), render?(row) -> JSX shown instead of value, align?, sortValue?(row), defaultHidden? }]
 * Returns the visible columns and the rows in the current order so exports match the screen.
 */
export function useReportTable(rows, columns, searchText) {
    const [hidden, setHidden] = useState(() => new Set(columns.filter((c) => c.defaultHidden).map((c) => c.key)));
    const [sort, setSort] = useState({ key: null, dir: 'asc' });

    const visibleColumns = useMemo(() => columns.filter((c) => !hidden.has(c.key)), [columns, hidden]);

    const sorted = useMemo(() => {
        const q = String(searchText || '').trim().toLowerCase();
        let list = rows;
        if (q) {
            list = rows.filter((r) => columns.some((c) => String(c.value(r) ?? '').toLowerCase().includes(q)));
        }
        const col = columns.find((c) => c.key === sort.key);
        if (!col) return list;
        const get = col.sortValue || col.value;
        const factor = sort.dir === 'asc' ? 1 : -1;
        return [...list].sort((a, b) => {
            const x = get(a);
            const y = get(b);
            if (typeof x === 'number' && typeof y === 'number') return (x - y) * factor;
            return natural(x, y) * factor;
        });
    }, [rows, columns, searchText, sort]);

    const toggleColumn = (key) =>
        setHidden((prev) => {
            const next = new Set(prev);
            if (next.has(key)) {
                if (columns.length - next.size <= 1) return prev; // keep at least one column
                next.delete(key);
            } else next.add(key);
            return next;
        });

    const toggleSort = (key) =>
        setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

    return { hidden, toggleColumn, visibleColumns, sorted, sort, toggleSort };
}

/** Builds export headers + rows from what is on screen (visible columns, current order, with S.No). */
export function buildExport(visibleColumns, sortedRows) {
    return {
        headers: ['S.No', ...visibleColumns.map((c) => c.label)],
        rows: sortedRows.map((r, i) => [i + 1, ...visibleColumns.map((c) => c.value(r) ?? '')])
    };
}

/** Wires the three export buttons of a report to the existing transport Excel / PDF layouts. */
export function useReportExports({ fileBase, sheetName, excelTitle, pdfTitle, visibleColumns, sorted }) {
    const exportData = () => {
        if (!sorted.length) {
            toast.error('There is no data to export.');
            return null;
        }
        return buildExport(visibleColumns, sorted);
    };
    const pdfOpts = visibleColumns.length > 10 ? { fontSize: 6.5, cellPadding: 3 } : undefined;

    return {
        onExcel: async () => {
            const d = exportData();
            if (d) await exportRowsToExcel(fileBase, d.headers, d.rows, sheetName, excelTitle);
        },
        onPrint: () => {
            const d = exportData();
            if (d) printRowsPdf(pdfTitle, d.headers, d.rows, pdfOpts);
        }
    };
}

export function ReportDataTable({ columns, rows, loading, search, onSearch, sort, onSort, emptyText = 'No data available in table' }) {
    const [pageSize, setPageSize] = useState(10);
    const [page, setPage] = useState(1);

    useEffect(() => { setPage(1); }, [rows.length, pageSize, search]);

    const pages = Math.max(1, Math.ceil(rows.length / pageSize));
    const current = Math.min(page, pages);
    const start = (current - 1) * pageSize;
    const slice = rows.slice(start, start + pageSize);

    return (
        <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    Show
                    <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className={`${filterInputClass} !w-20`}>
                        {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                    entries
                </label>
                <div className="relative">
                    <SearchIcon size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="search"
                        value={search}
                        onChange={(e) => onSearch(e.target.value)}
                        placeholder="Search..."
                        className={`${filterInputClass} !w-64 pl-9`}
                    />
                </div>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-800/60">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap">S.No</th>
                                {columns.map((c) => {
                                    const active = sort.key === c.key;
                                    const Icon = !active ? SortBoth : sort.dir === 'asc' ? SortUp : SortDown;
                                    return (
                                        <th
                                            key={c.key}
                                            onClick={() => onSort(c.key)}
                                            className={`px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap cursor-pointer select-none ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                                            aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                                        >
                                            <span className="inline-flex items-center gap-1">
                                                {c.label}
                                                <Icon size={12} className={active ? 'text-primary-600' : 'text-slate-300'} />
                                            </span>
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={columns.length + 1} className="px-4 py-12 text-center text-slate-400">
                                        <Loader className="animate-spin inline mr-2" size={18} /> Loading...
                                    </td>
                                </tr>
                            ) : slice.length === 0 ? (
                                <tr>
                                    <td colSpan={columns.length + 1} className="px-4 py-12 text-center text-slate-400">
                                        <Inbox className="inline mr-2" size={18} /> {emptyText}
                                    </td>
                                </tr>
                            ) : (
                                slice.map((row, i) => (
                                    <tr key={row.id || start + i} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                                        <td className="px-4 py-3 text-slate-500">{start + i + 1}</td>
                                        {columns.map((c) => (
                                            <td
                                                key={c.key}
                                                className={`px-4 py-3 text-slate-700 dark:text-slate-200 ${c.wrap ? 'min-w-[200px]' : 'whitespace-nowrap'} ${c.align === 'right' ? 'text-right' : ''}`}
                                            >
                                                {c.render
                                                    ? c.render(row)
                                                    : c.value(row) === '' || c.value(row) === null || c.value(row) === undefined ? '-' : c.value(row)}
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 mt-3 text-sm text-slate-500 dark:text-slate-400">
                <span>
                    Showing {rows.length === 0 ? 0 : start + 1} to {Math.min(start + pageSize, rows.length)} of {rows.length} entries
                </span>
                <div className="flex items-center gap-1">
                    <button type="button" disabled={current === 1} onClick={() => setPage(1)} className={`${btnGhost} !py-1.5`}>First</button>
                    <button type="button" disabled={current === 1} onClick={() => setPage(current - 1)} className={`${btnGhost} !py-1.5`}>Previous</button>
                    <span className="px-3 font-semibold text-slate-700 dark:text-slate-200">{current} / {pages}</span>
                    <button type="button" disabled={current === pages} onClick={() => setPage(current + 1)} className={`${btnGhost} !py-1.5`}>Next</button>
                    <button type="button" disabled={current === pages} onClick={() => setPage(pages)} className={`${btnGhost} !py-1.5`}>Last</button>
                </div>
            </div>
        </div>
    );
}
