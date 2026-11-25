import React, { useMemo, useState } from 'react';
import {
    useReportTable, useReportExports, ReportToolbar, FilterPanel, SelectField, DateField,
    TotalsStrip, ReportDataTable
} from '../transport/transportReportShared';
import { inr, rupees, sumRows } from './analysisData';

// ------------------------------------------------------------------
// Column helpers: raw number is exported, formatted text is shown
// ------------------------------------------------------------------

/** ₹ column: sorts / exports as a number, shows Indian grouping */
export const moneyCol = (key, label, get, extra = {}) => ({
    key, label, align: 'right', value: (r) => get(r), render: (r) => inr(get(r)), ...extra
});

export const countCol = (key, label, get, extra = {}) => ({ key, label, align: 'right', value: (r) => get(r), ...extra });

const STATUS_STYLE = {
    Paid: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900',
    Partial: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900',
    Unpaid: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900'
};

export const statusCol = (key, label, get) => ({
    key, label, value: (r) => get(r),
    render: (r) => (
        <span className={`inline-block px-2.5 py-0.5 rounded-full border text-xs font-bold ${STATUS_STYLE[get(r)] || ''}`}>{get(r)}</span>
    )
});

/** collection % with a small bar (exports the number) */
export const percentCol = (key, label, get) => ({
    key, label, align: 'right', value: (r) => get(r),
    render: (r) => {
        const v = Math.min(100, Math.max(0, get(r)));
        return (
            <span className="inline-flex items-center justify-end gap-2">
                <span className="hidden sm:inline-block w-16 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden" aria-hidden="true">
                    <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${v}%` }} />
                </span>
                <span className="tabular-nums">{get(r)}%</span>
            </span>
        );
    }
});

// ------------------------------------------------------------------
// Small controls reports can drop in above the table
// ------------------------------------------------------------------

/** segmented "A | B | C" switch (view / metric) */
export function ViewToggle({ label, value, onChange, options }) {
    return (
        <div className="flex items-center gap-2">
            {label && <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{label}</span>}
            <div role="group" aria-label={label} className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-0.5">
                {options.map((o) => (
                    <button
                        key={o.value}
                        type="button"
                        onClick={() => onChange(o.value)}
                        aria-pressed={value === o.value}
                        className={`px-3 py-1.5 rounded-[10px] text-xs font-bold transition-colors ${value === o.value
                            ? 'bg-primary-600 text-white shadow-sm'
                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    >
                        {o.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

export const METRIC_OPTIONS = [
    { value: 'amount', label: 'Total' },
    { value: 'paid', label: 'Paid' },
    { value: 'balance', label: 'Balance' }
];

export function ControlsRow({ children }) {
    return <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mb-4">{children}</div>;
}

// ------------------------------------------------------------------
// Shared filter panel (same filters on every report)
// ------------------------------------------------------------------

export function AnalysisFilterPanel({ ctx }) {
    const { filters, setFilter, setFilters, resetFilters, options, filterOpen } = ctx;
    return (
        <FilterPanel open={filterOpen} onReset={resetFilters}>
            <SelectField label="Fee Category" value={filters.category} onChange={setFilter('category')} options={options.categories} />
            <SelectField
                label="Class" value={filters.className} options={options.classes}
                onChange={(v) => setFilters((f) => ({ ...f, className: v, sectionName: '' }))}
            />
            <SelectField label="Section" value={filters.sectionName} onChange={setFilter('sectionName')} options={options.sections} />
            <SelectField label="Student Category" value={filters.studentCategory} onChange={setFilter('studentCategory')} options={options.studentCategories} />
            <SelectField label="Term" value={filters.term} onChange={setFilter('term')} options={options.terms} />
            <SelectField label="Student Status" value={filters.studentStatus} onChange={setFilter('studentStatus')} options={options.statuses} allLabel="All students" />
            <DateField label="Due Date From" value={filters.from} onChange={setFilter('from')} />
            <DateField label="Due Date To" value={filters.to} onChange={setFilter('to')} />
        </FilterPanel>
    );
}

// ------------------------------------------------------------------
// One report = toolbar + filters + totals + table + exports
// ------------------------------------------------------------------

export const defaultTotals = (rows) => {
    const t = sumRows(rows);
    return [
        { label: 'Total Amount', value: rupees(t.total) },
        { label: 'Paid', value: rupees(t.paid) },
        { label: 'Concession', value: rupees(t.concession) },
        { label: 'Total Balance', value: rupees(t.balance) }
    ];
};

/**
 * ctx   : shared state from FeeAnalysisTab (filtered rows, loading, filter handlers ...)
 * rows  : the rows THIS report shows (already grouped); each needs a unique `id`
 * columns must be memoised by the caller; give the component a `key` when its column set changes (e.g. a group-by toggle)
 */
export function AnalysisReport({
    ctx, title, fileBase, excelTitle, columns, rows, totals, controls, emptyText
}) {
    const [search, setSearch] = useState('');
    const table = useReportTable(rows, columns, search);
    const exports = useReportExports({
        fileBase, sheetName: title, excelTitle: excelTitle || title.toUpperCase(), pdfTitle: title,
        visibleColumns: table.visibleColumns, sorted: table.sorted
    });
    const strip = useMemo(() => totals || [], [totals]);

    return (
        <div>
            <ReportToolbar
                title={title}
                filterOpen={ctx.filterOpen} filterCount={ctx.filterCount} onToggleFilter={ctx.toggleFilter}
                disabled={ctx.loading || table.sorted.length === 0}
                onExcel={exports.onExcel} onPdf={exports.onPdf} onPrint={exports.onPrint}
                columns={columns} hidden={table.hidden} onToggleColumn={table.toggleColumn}
            />
            <AnalysisFilterPanel ctx={ctx} />
            {controls}
            {strip.length > 0 && <TotalsStrip items={strip} />}
            <ReportDataTable
                columns={table.visibleColumns} rows={table.sorted} loading={ctx.loading}
                search={search} onSearch={setSearch} sort={table.sort} onSort={table.toggleSort}
                emptyText={emptyText || 'No fee data for the selected filters'}
            />
        </div>
    );
}
