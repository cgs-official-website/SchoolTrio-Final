import React, { useMemo, useState } from 'react';
import {
    useTransportStudents, useReportTable, useReportExports, ReportToolbar, FilterPanel, SelectField,
    TotalsStrip, ReportDataTable, classSection, unique, natural, compareClassNames, formatMoney
} from './transportReportShared';

const num = (v) => Number(v || 0);

// Column order follows the reference "Bus Fee Report"; the fee amounts can be switched on from Settings.
const COLUMNS = [
    { key: 'adm', label: 'Adm. No.', value: (r) => r.admissionNumber },
    { key: 'name', label: 'Student Name', value: (r) => r.studentName },
    { key: 'category', label: 'Student Category', value: (r) => r.category },
    { key: 'class', label: 'Class Section', value: (r) => classSection(r) },
    { key: 'blood', label: 'Blood Group', value: (r) => r.bloodGroup },
    { key: 'father', label: 'Father Name', value: (r) => r.fatherName },
    { key: 'fatherPhone', label: 'Mobile Number', value: (r) => r.fatherPhone },
    { key: 'mother', label: 'Mother Name', value: (r) => r.motherName },
    { key: 'motherPhone', label: 'Mother Mobile', value: (r) => r.motherPhone },
    { key: 'address', label: 'Address', value: (r) => r.address, wrap: true },
    { key: 'route', label: 'Route Name', value: (r) => r.routeName },
    { key: 'stop', label: 'Stop Name', value: (r) => r.stopName },
    { key: 'total', label: 'Total Amount', value: (r) => num(r.totalAmount), align: 'right', defaultHidden: true },
    { key: 'concession', label: 'Concession', value: (r) => num(r.concession), align: 'right', defaultHidden: true },
    { key: 'paid', label: 'Paid', value: (r) => num(r.paid), align: 'right', defaultHidden: true },
    { key: 'due', label: 'Due', value: (r) => num(r.due), align: 'right', defaultHidden: true }
];

const EMPTY = { className: '', sectionName: '', routeName: '', stopName: '', category: '', status: '' };

export default function BusFeeReport() {
    const { rows, loading } = useTransportStudents();
    const [filters, setFilters] = useState(EMPTY);
    const [filterOpen, setFilterOpen] = useState(false);
    const [search, setSearch] = useState('');
    const set = (k) => (v) => setFilters((f) => ({ ...f, [k]: v }));

    const filtered = useMemo(
        () => rows.filter((r) =>
            (!filters.className || r.className === filters.className) &&
            (!filters.sectionName || r.sectionName === filters.sectionName) &&
            (!filters.routeName || r.routeName === filters.routeName) &&
            (!filters.stopName || r.stopName === filters.stopName) &&
            (!filters.category || r.category === filters.category) &&
            (!filters.status || r.transportStatus === filters.status)
        ),
        [rows, filters]
    );

    const totals = useMemo(() => ({
        total: filtered.reduce((t, r) => t + num(r.totalAmount), 0),
        paid: filtered.reduce((t, r) => t + num(r.paid), 0),
        due: filtered.reduce((t, r) => t + num(r.due), 0),
        concession: filtered.reduce((t, r) => t + num(r.concession), 0)
    }), [filtered]);

    const table = useReportTable(filtered, COLUMNS, search);
    const exports = useReportExports({
        fileBase: 'Bus_Fee_Report', sheetName: 'Bus Fee Report', excelTitle: 'BUS FEE REPORT', pdfTitle: 'Bus Fee Report',
        visibleColumns: table.visibleColumns, sorted: table.sorted
    });

    const classes = useMemo(() => unique(rows, (r) => r.className).sort(compareClassNames), [rows]);
    const sections = useMemo(
        () => unique(rows.filter((r) => !filters.className || r.className === filters.className), (r) => r.sectionName).sort(natural),
        [rows, filters.className]
    );
    const filterCount = Object.values(filters).filter(Boolean).length;

    return (
        <div>
            <ReportToolbar
                title="Bus Fee Report"
                filterOpen={filterOpen} filterCount={filterCount} onToggleFilter={() => setFilterOpen((v) => !v)}
                disabled={loading || table.sorted.length === 0} {...exports}
                columns={COLUMNS} hidden={table.hidden} onToggleColumn={table.toggleColumn}
            />
            <FilterPanel open={filterOpen} onReset={() => setFilters(EMPTY)}>
                <SelectField label="Class" value={filters.className} onChange={(v) => setFilters((f) => ({ ...f, className: v, sectionName: '' }))} options={classes} />
                <SelectField label="Section" value={filters.sectionName} onChange={set('sectionName')} options={sections} />
                <SelectField label="Route" value={filters.routeName} onChange={set('routeName')} options={unique(rows, (r) => r.routeName).sort(natural)} />
                <SelectField label="Stop" value={filters.stopName} onChange={set('stopName')} options={unique(rows, (r) => r.stopName).sort(natural)} />
                <SelectField label="Student Category" value={filters.category} onChange={set('category')} options={unique(rows, (r) => r.category).sort(natural)} />
                <SelectField label="Transport Status" value={filters.status} onChange={set('status')} options={['Active', 'Withdraw']} />
            </FilterPanel>

            <TotalsStrip items={[
                { label: 'Total Amount', value: formatMoney(totals.total) },
                { label: 'Paid', value: formatMoney(totals.paid) },
                { label: 'Due', value: formatMoney(totals.due) },
                { label: 'Concession', value: formatMoney(totals.concession) }
            ]} />

            <ReportDataTable
                columns={table.visibleColumns} rows={table.sorted} loading={loading}
                search={search} onSearch={setSearch} sort={table.sort} onSort={table.toggleSort}
            />
        </div>
    );
}
