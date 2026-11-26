import React, { useEffect, useMemo, useState } from 'react';
import {
    LuFilter as FilterIcon,
    LuFileSpreadsheet as Sheet,
    LuPrinter as Printer,
    LuLoader as Loader,
    LuRotateCcw as Reset
} from 'react-icons/lu';
import {
    formatMoney, formatDate, toDateKey, todayKey, studentName, termName,
    byNatural, downloadCsv
} from '../shared/reportUtils';
import { getSchoolSettings } from '../../../../api/settings';

const inputClass =
    'w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40';

const PAGE_SIZES = [10, 20, 50, 100];

const cellValue = (col, row) => (col.get ? col.get(row) : row[col.key]);

function displayValue(col, row) {
    if (col.render) return col.render(row);
    const v = cellValue(col, row);
    if (col.type === 'money') return formatMoney(v);
    if (col.type === 'date') return formatDate(v);
    return v === null || v === undefined || v === '' ? '-' : v;
}

function exportValue(col, row) {
    const v = cellValue(col, row);
    if (col.type === 'date') return formatDate(v);
    return v === null || v === undefined ? '' : v;
}

function Field({ label, children, wide }) {
    return (
        <label className={`flex flex-col gap-1 ${wide ? 'sm:col-span-2' : ''}`}>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</span>
            {children}
        </label>
    );
}

const escapeHtml = (v) =>
    String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Printable page: school name (and address) centred at the top, the report title, the filters that were
 * applied, then the table (with its total row). The document title is the report name, so the browser's own
 * page header (when it is switched on) does not repeat the school name.
 */
function buildPrintHtml({ schoolName, schoolAddress, title, summary, headers, rightCols, rows, totalRow }) {
    const cell = (tag, v, i) => `<${tag}${rightCols[i] ? ' class="r"' : ''}>${escapeHtml(v)}</${tag}>`;
    const head = `<tr>${headers.map((h, i) => cell('th', h, i)).join('')}</tr>`;
    const body = rows.map((r) => `<tr>${r.map((v, i) => cell('td', v, i)).join('')}</tr>`).join('');
    const foot = totalRow ? `<tr class="total">${totalRow.map((v, i) => cell('td', v, i)).join('')}</tr>` : '';
    return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
@page{size:A4 landscape;margin:12mm}
body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;font-size:12px}
.top{text-align:center;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:10px}
.school{font-size:20px;font-weight:700;margin:0}
.addr{font-size:11px;color:#333;margin:3px 0 0}
.title{font-size:15px;font-weight:700;margin:8px 0 0}
.summary{margin:0 0 10px;font-size:11px;color:#333}
table{width:100%;border-collapse:collapse}
th,td{border:1px solid #999;padding:5px 7px;text-align:left;vertical-align:top}
th{background:#eef1f5;font-size:11px}
thead{display:table-header-group}tr{page-break-inside:avoid}
.r{text-align:right}.total td{font-weight:700;background:#f6f6f6}
</style></head><body>
<div class="top">${schoolName ? `<p class="school">${escapeHtml(schoolName)}</p>` : ''}${schoolAddress ? `<p class="addr">${escapeHtml(schoolAddress)}</p>` : ''}<p class="title">${escapeHtml(title)}</p></div>
${summary ? `<p class="summary">${escapeHtml(summary)}</p>` : ''}
<table><thead>${head}</thead><tbody>${body}${foot}</tbody></table>
<script>window.onload=function(){window.focus();window.print();}</script>
</body></html>`;
}

/** Applies the shared filters; each report adds its own baseFilter on top. */
function applyFilters(invoices, f, def) {
    const q = (f.search || '').trim().toLowerCase();
    return invoices.filter((inv) => {
        if (inv.status === 'Cancelled') return false;
        const s = inv.student;
        if (f.classId && s?.class?.id !== f.classId) return false;
        if (f.sectionId && s?.section?.id !== f.sectionId) return false;
        if (f.classes?.length && !f.classes.includes(s?.class?.id)) return false;
        if (f.category && inv.feeName !== f.category) return false;
        if (f.term && termName(inv) !== f.term) return false;
        if (f.status && inv.status !== f.status) return false;
        if (f.mode && inv.paymentMode !== f.mode) return false;
        if (def.dateField && (f.from || f.to)) {
            const d = toDateKey(inv[def.dateField]);
            if (!d || (f.from && d < f.from) || (f.to && d > f.to)) return false;
        }
        if (q) {
            const hay = `${studentName(s)} ${s?.admissionNumber || ''} ${inv.receiptNumber || ''} ${inv.feeName || ''} ${inv.transactionReference || ''}`.toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return def.baseFilter ? def.baseFilter(inv, f) : true;
    });
}

export default function ReportView({ def, invoices, loading, classOptions, sectionOptions }) {
    const [filters, setFilters] = useState(() => ({ ...(def.defaults ? def.defaults() : {}) }));
    const [showFilters, setShowFilters] = useState(true);
    const [sort, setSort] = useState({ key: null, dir: 'asc' });
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [schoolName, setSchoolName] = useState('');
    const [schoolAddress, setSchoolAddress] = useState('');

    useEffect(() => {
        let alive = true;
        getSchoolSettings()
            .then((res) => {
                const d = res?.data || res;
                if (!alive) return;
                setSchoolName(d?.name || d?.schoolName || '');
                setSchoolAddress(d?.address || d?.location || '');
            })
            .catch(() => { });
        return () => { alive = false; };
    }, []);

    const setFilter = (patch) => {
        setFilters((prev) => ({ ...prev, ...patch }));
        setPage(1);
    };

    // option lists come from the loaded data
    const options = useMemo(() => {
        const cats = new Set();
        const terms = new Map();
        const modes = new Set();
        invoices.forEach((i) => {
            if (i.status === 'Cancelled') return;
            cats.add(i.feeName);
            terms.set(termName(i), i.collectionPeriod?.displayOrder ?? 9999);
            if (i.paymentMode) modes.add(i.paymentMode);
        });
        return {
            categories: [...cats].sort(byNatural),
            terms: [...terms.entries()].sort((a, b) => a[1] - b[1] || byNatural(a[0], b[0])).map(([n]) => n),
            modes: [...modes].sort(byNatural)
        };
    }, [invoices]);

    // Fees not created under a collection period show as "No Term"; offer the Term filter only when real terms exist
    const hasRealTerms = useMemo(() => invoices.some((i) => i.collectionPeriod), [invoices]);

    const filtered = useMemo(() => applyFilters(invoices, filters, def), [invoices, filters, def]);
    const built = useMemo(() => (def.build ? def.build(filtered, filters) : null), [def, filtered, filters]);

    const columns = built?.columns || [];
    const sortedRows = useMemo(() => {
        const rows = built?.rows || [];
        if (!sort.key) return rows;
        const col = columns.find((c) => c.key === sort.key);
        if (!col) return rows;
        const dir = sort.dir === 'asc' ? 1 : -1;
        return [...rows].sort((a, b) => {
            const x = cellValue(col, a);
            const y = cellValue(col, b);
            if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
            return byNatural(x ?? '', y ?? '') * dir;
        });
    }, [built, columns, sort]);

    const total = sortedRows.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    const pageRows = sortedRows.slice(start, start + pageSize);

    const toggleSort = (key) =>
        setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

    const slug = def.label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const exportCsv = () =>
        downloadCsv(`${slug}.csv`, columns.map((c) => ({ label: c.label, value: (r) => exportValue(c, r) })), sortedRows);
    const printValue = (c, v) => (c.type === 'money' ? formatMoney(v) : v);
    const print = () => {
        const win = window.open('', '_blank', 'width=1100,height=800');
        if (!win) return;
        const totals = built?.totals;
        const html = buildPrintHtml({
            schoolName,
            schoolAddress,
            title: def.label,
            summary: summaryText,
            headers: ['S.No', ...columns.map((c) => c.label)],
            rightCols: [false, ...columns.map((c) => c.type === 'money' || c.align === 'right')],
            rows: sortedRows.map((r, i) => [i + 1, ...columns.map((c) => printValue(c, exportValue(c, r)))]),
            totalRow: totals && sortedRows.length
                ? ['Total', ...columns.map((c) => (totals[c.key] !== undefined ? printValue(c, totals[c.key]) : ''))]
                : null
        });
        win.document.open();
        win.document.write(html);
        win.document.close();
    };

    const has = (k) => def.filters.includes(k);
    // Sections only make sense inside a class (A of class 5 is not A of class 6), so none are listed until a class is chosen
    const sectionsForClass = filters.classId ? sectionOptions.filter((s) => s.classId === filters.classId) : [];

    // "Class: IV | Section: A | Paid Date: 01 Nov 2026 to 25 Nov 2026" - shown on screen and on the printout
    const summaryText = useMemo(() => {
        const parts = [];
        const label = (list, v) => list.find((o) => o.value === v)?.label;
        if (filters.classId) parts.push(`Class: ${label(classOptions, filters.classId) || ''}`);
        if (filters.classes?.length) parts.push(`Classes: ${filters.classes.map((id) => label(classOptions, id)).filter(Boolean).join(', ')}`);
        if (filters.sectionId) parts.push(`Section: ${label(sectionOptions, filters.sectionId) || ''}`);
        if (filters.category) parts.push(`Fee Category: ${filters.category}`);
        if (filters.term) parts.push(`Term: ${filters.term}`);
        if (filters.status) parts.push(`Status: ${filters.status}`);
        if (filters.mode) parts.push(`Payment Mode: ${filters.mode}`);
        if (def.dateField && (def.filters.includes('from') || def.filters.includes('to'))) {
            const name = def.dateLabel ? def.dateLabel.replace(/\s*From$/i, ' Date') : 'Date';
            parts.push(filters.from || filters.to
                ? `${name}: ${filters.from ? formatDate(filters.from) : 'Beginning'} to ${filters.to ? formatDate(filters.to) : 'Today'}`
                : `${name}: All dates`);
        }
        if (def.filters.includes('asOn') && filters.asOn) parts.push(`As on: ${formatDate(filters.asOn)}`);
        if (filters.search?.trim()) parts.push(`Search: ${filters.search.trim()}`);
        return parts.join('  |  ');
    }, [filters, def, classOptions, sectionOptions]);

    const reset = () => {
        setFilters({ ...(def.defaults ? def.defaults() : {}) });
        setPage(1);
    };

    const activeCount = Object.entries(filters).filter(([k, v]) =>
        (Array.isArray(v) ? v.length : v) && !(def.defaults && def.defaults()[k] === v)).length;

    return (
        <div>
            {/* Title + actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">{def.label}</h2>
                    {summaryText && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{summaryText}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setShowFilters((v) => !v)}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-primary-600 text-white hover:bg-primary-700 transition-colors">
                        <FilterIcon size={15} /> Filter{activeCount ? ` (${activeCount})` : ''}
                    </button>
                    {!def.dashboard && (
                        <>
                            <button type="button" onClick={exportCsv} disabled={!sortedRows.length}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-primary-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors">
                                <Sheet size={15} className="text-emerald-600" /> Export
                            </button>
                            <button type="button" onClick={print} disabled={!sortedRows.length}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-primary-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors">
                                <Printer size={15} /> Print PDF
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Filters */}
            {showFilters && (
                <div className="p-4 mb-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        {has('class') && (
                            <Field label="Class">
                                <select className={inputClass} value={filters.classId || ''} onChange={(e) => setFilter({ classId: e.target.value, sectionId: '' })}>
                                    <option value="">All Classes</option>
                                    {classOptions.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                                </select>
                            </Field>
                        )}
                        {has('section') && (
                            <Field label="Section">
                                <select className={`${inputClass} disabled:opacity-60 disabled:cursor-not-allowed`} value={filters.sectionId || ''} disabled={!filters.classId}
                                    title={filters.classId ? undefined : 'Select a class first'} onChange={(e) => setFilter({ sectionId: e.target.value })}>
                                    <option value="">{filters.classId ? 'All Sections' : 'Select class first'}</option>
                                    {sectionsForClass.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                                </select>
                            </Field>
                        )}
                        {has('category') && (
                            <Field label="Fee Category">
                                <select className={inputClass} value={filters.category || ''} onChange={(e) => setFilter({ category: e.target.value })}>
                                    <option value="">All Categories</option>
                                    {options.categories.map((c) => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </Field>
                        )}
                        {has('term') && hasRealTerms && (
                            <Field label="Term">
                                <select className={inputClass} value={filters.term || ''} onChange={(e) => setFilter({ term: e.target.value })}>
                                    <option value="">All Terms</option>
                                    {options.terms.map((t) => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </Field>
                        )}
                        {has('status') && (
                            <Field label="Status">
                                <select className={inputClass} value={filters.status || ''} onChange={(e) => setFilter({ status: e.target.value })}>
                                    <option value="">All</option>
                                    <option value="Paid">Paid</option>
                                    <option value="Pending">Pending</option>
                                </select>
                            </Field>
                        )}
                        {has('mode') && (
                            <Field label="Payment Mode">
                                <select className={inputClass} value={filters.mode || ''} onChange={(e) => setFilter({ mode: e.target.value })}>
                                    <option value="">All Modes</option>
                                    {options.modes.map((m) => <option key={m} value={m}>{m}</option>)}
                                </select>
                            </Field>
                        )}
                        {has('from') && (
                            <Field label={def.dateLabel || 'From Date'}>
                                <input type="date" className={inputClass} value={filters.from || ''} max={filters.to || undefined} onChange={(e) => setFilter({ from: e.target.value })} />
                            </Field>
                        )}
                        {has('to') && (
                            <Field label="To Date">
                                <input type="date" className={inputClass} value={filters.to || ''} min={filters.from || undefined} onChange={(e) => setFilter({ to: e.target.value })} />
                            </Field>
                        )}
                        {has('asOn') && (
                            <Field label="As On Date">
                                <input type="date" className={inputClass} value={filters.asOn || ''} onChange={(e) => setFilter({ asOn: e.target.value || todayKey() })} />
                            </Field>
                        )}
                        {has('search') && (
                            <Field label="Search">
                                <input className={inputClass} placeholder="Name, adm no, receipt..." value={filters.search || ''} onChange={(e) => setFilter({ search: e.target.value })} />
                            </Field>
                        )}
                        {has('classes') && (
                            <Field label="Classes" wide>
                                <div className="flex flex-wrap gap-2">
                                    {classOptions.map((c) => {
                                        const on = (filters.classes || []).includes(c.value);
                                        return (
                                            <button key={c.value} type="button"
                                                onClick={() => setFilter({ classes: on ? filters.classes.filter((x) => x !== c.value) : [...(filters.classes || []), c.value] })}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${on
                                                    ? 'bg-primary-600 border-primary-600 text-white'
                                                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-primary-50'}`}>
                                                {c.label}
                                            </button>
                                        );
                                    })}
                                    {!classOptions.length && <span className="text-xs text-slate-400">No classes</span>}
                                </div>
                            </Field>
                        )}
                    </div>
                    <div className="mt-3 flex justify-end">
                        <button type="button" onClick={reset} className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white">
                            <Reset size={14} /> Reset filters
                        </button>
                    </div>
                </div>
            )}

            {loading ? (
                <div className="py-16 text-center text-slate-400"><Loader className="animate-spin inline mr-2" size={18} /> Loading...</div>
            ) : def.dashboard ? (
                def.render(filtered)
            ) : (
                <>
                    {built?.total && (
                        <div className="inline-flex items-center gap-3 px-4 py-3 mb-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">
                            <span className="font-semibold text-slate-500">{built.total.label} :</span>
                            <span className="font-bold text-emerald-600">{formatMoney(built.total.value)}</span>
                        </div>
                    )}

                    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 dark:bg-slate-800/60">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">S.No</th>
                                        {columns.map((c) => (
                                            <th key={c.key} onClick={() => toggleSort(c.key)}
                                                className={`px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap cursor-pointer select-none hover:text-slate-800 ${c.align === 'right' || c.type === 'money' ? 'text-right' : 'text-left'}`}>
                                                {c.label}
                                                <span className="ml-1 text-[10px]">{sort.key === c.key ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {pageRows.length === 0 ? (
                                        <tr><td colSpan={columns.length + 1} className="px-4 py-10 text-center text-slate-400">No data available in table</td></tr>
                                    ) : pageRows.map((row, i) => (
                                        <tr key={row.id ?? i} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                                            <td className="px-4 py-3 text-slate-500">{start + i + 1}</td>
                                            {columns.map((c) => (
                                                <td key={c.key} className={`px-4 py-3 text-slate-700 dark:text-slate-200 whitespace-nowrap ${c.align === 'right' || c.type === 'money' ? 'text-right' : ''}`}>
                                                    {displayValue(c, row)}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                                {built?.totals && pageRows.length > 0 && (
                                    <tfoot>
                                        <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 font-bold text-slate-900 dark:text-white">
                                            <td className="px-4 py-3" colSpan={1}>Total</td>
                                            {columns.map((c) => (
                                                <td key={c.key} className={`px-4 py-3 whitespace-nowrap ${c.type === 'money' || c.align === 'right' ? 'text-right' : ''}`}>
                                                    {built.totals[c.key] !== undefined ? (c.type === 'money' ? formatMoney(built.totals[c.key]) : built.totals[c.key]) : ''}
                                                </td>
                                            ))}
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 dark:border-slate-800 text-sm text-slate-500">
                            <div className="flex items-center gap-3">
                                <span>Showing {total ? start + 1 : 0} to {Math.min(start + pageSize, total)} of {total} entries</span>
                                <select className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                                    value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
                                    {PAGE_SIZES.map((n) => <option key={n} value={n}>{n} / page</option>)}
                                </select>
                            </div>
                            <div className="flex gap-1">
                                {[['First', () => setPage(1), safePage === 1],
                                ['Previous', () => setPage(safePage - 1), safePage === 1],
                                ['Next', () => setPage(safePage + 1), safePage === totalPages],
                                ['Last', () => setPage(totalPages), safePage === totalPages]].map(([label, fn, disabled]) => (
                                    <button key={label} type="button" onClick={fn} disabled={disabled}
                                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold hover:bg-primary-50 disabled:opacity-40 disabled:cursor-not-allowed">
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
