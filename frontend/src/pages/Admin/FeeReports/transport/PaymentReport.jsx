import React, { useMemo, useState } from 'react';
import {
    useTransportPayments, useReportTable, useReportExports, ReportToolbar, FilterPanel, SelectField, DateField,
    TotalsStrip, ReportDataTable, classSection, unique, natural, compareClassNames, formatMoney, formatDate
} from './transportReportShared';

const num = (v) => Number(v || 0);
const dateSort = (r) => r.paidAt || '';

/**
 * Shared by "Bus Fee Collection" and "Route Wise Collection Report": both list the paid transport fees,
 * they only differ in columns and titles.
 */
export const COLLECTION_COLUMNS = [
    { key: 'adm', label: 'Admission Number', value: (r) => r.admissionNumber },
    { key: 'name', label: 'Student Name', value: (r) => r.studentName },
    { key: 'class', label: 'Class Name', value: (r) => r.className },
    { key: 'section', label: 'Section Name', value: (r) => r.sectionName },
    { key: 'route', label: 'Route Name', value: (r) => r.routeName },
    { key: 'stop', label: 'Stop Name', value: (r) => r.stopName },
    { key: 'date', label: 'Date', value: (r) => formatDate(r.paidAt), sortValue: dateSort },
    { key: 'amount', label: 'Amount', value: (r) => num(r.amount), align: 'right' },
    { key: 'mode', label: 'Pay Mode', value: (r) => r.payMode }
];

export const ROUTE_WISE_COLUMNS = [
    { key: 'adm', label: 'Adm. No.', value: (r) => r.admissionNumber },
    { key: 'name', label: 'Student Name', value: (r) => r.studentName },
    { key: 'class', label: 'Class', value: (r) => classSection(r) },
    { key: 'category', label: 'Category Name', value: (r) => r.category },
    { key: 'route', label: 'Route Name', value: (r) => r.routeName },
    { key: 'stop', label: 'Stop Name', value: (r) => r.stopName },
    { key: 'slab', label: 'Slab Name', value: (r) => r.slabName },
    { key: 'mode', label: 'Pay mode', value: (r) => r.payMode },
    { key: 'month', label: 'Fee Month', value: (r) => r.feeMonth },
    { key: 'date', label: 'Paid Date', value: (r) => formatDate(r.paidAt), sortValue: dateSort },
    { key: 'invoice', label: 'Invoice Ref.', value: (r) => r.invoiceRef },
    { key: 'amount', label: 'Amount', value: (r) => num(r.amount), align: 'right' },
    { key: 'ref', label: 'Ref. No.', value: (r) => r.referenceNo },
    { key: 'bank', label: 'Bank', value: (r) => r.bank },
    { key: 'remarks', label: 'Remarks', value: (r) => r.feeName }
];

const EMPTY = { from: '', to: '', className: '', sectionName: '', routeName: '', stopName: '', payMode: '', category: '' };

export default function PaymentReport({ title, columns, fileBase, excelTitle, showCategory = false }) {
    const [filters, setFilters] = useState(EMPTY);
    const [filterOpen, setFilterOpen] = useState(false);
    const [search, setSearch] = useState('');
    const set = (k) => (v) => setFilters((f) => ({ ...f, [k]: v }));

    // the date range is applied by the server so only the needed payments are loaded
    const range = useMemo(() => ({ from: filters.from, to: filters.to }), [filters.from, filters.to]);
    const { rows, loading } = useTransportPayments(range);

    const filtered = useMemo(
        () => rows.filter((r) =>
            (!filters.className || r.className === filters.className) &&
            (!filters.sectionName || r.sectionName === filters.sectionName) &&
            (!filters.routeName || r.routeName === filters.routeName) &&
            (!filters.stopName || r.stopName === filters.stopName) &&
            (!filters.payMode || r.payMode === filters.payMode) &&
            (!filters.category || r.category === filters.category)
        ),
        [rows, filters]
    );

    const total = useMemo(() => filtered.reduce((t, r) => t + num(r.amount), 0), [filtered]);

    const table = useReportTable(filtered, columns, search);
    const exports = useReportExports({
        fileBase, sheetName: title, excelTitle, pdfTitle: title,
        visibleColumns: table.visibleColumns, sorted: table.sorted
    });

    const classes = useMemo(() => unique(rows, (r) => r.className).sort(compareClassNames), [rows]);
    const sections = useMemo(
        () => unique(rows.filter((r) => !filters.className || r.className === filters.className), (r) => r.sectionName).sort(natural),
        [rows, filters.className]
    );
    const filterCount = Object.values(filters).filter(Boolean).length;
    const hasPrint = columns === ROUTE_WISE_COLUMNS; // reference shows "Print PDF" + "Settings" only on the Route Wise report

    return (
        <div>
            <ReportToolbar
                title={title}
                filterOpen={filterOpen} filterCount={filterCount} onToggleFilter={() => setFilterOpen((v) => !v)}
                disabled={loading || table.sorted.length === 0}
                onExcel={exports.onExcel} onPdf={exports.onPdf} onPrint={hasPrint ? exports.onPrint : undefined}
                columns={hasPrint ? columns : undefined} hidden={table.hidden} onToggleColumn={table.toggleColumn}
            />
            <FilterPanel open={filterOpen} onReset={() => setFilters(EMPTY)}>
                <DateField label="From Date" value={filters.from} onChange={set('from')} />
                <DateField label="To Date" value={filters.to} onChange={set('to')} />
                <SelectField label="Class" value={filters.className} onChange={(v) => setFilters((f) => ({ ...f, className: v, sectionName: '' }))} options={classes} />
                <SelectField label="Section" value={filters.sectionName} onChange={set('sectionName')} options={sections} />
                <SelectField label="Route" value={filters.routeName} onChange={set('routeName')} options={unique(rows, (r) => r.routeName).sort(natural)} />
                <SelectField label="Stop" value={filters.stopName} onChange={set('stopName')} options={unique(rows, (r) => r.stopName).sort(natural)} />
                <SelectField label="Pay Mode" value={filters.payMode} onChange={set('payMode')} options={unique(rows, (r) => r.payMode).sort(natural)} />
                {showCategory && (
                    <SelectField label="Student Category" value={filters.category} onChange={set('category')} options={unique(rows, (r) => r.category).sort(natural)} />
                )}
            </FilterPanel>

            <TotalsStrip items={[{ label: 'Total Amount', value: formatMoney(total) }]} />

            <ReportDataTable
                columns={table.visibleColumns} rows={table.sorted} loading={loading}
                search={search} onSearch={setSearch} sort={table.sort} onSort={table.toggleSort}
            />
        </div>
    );
}
