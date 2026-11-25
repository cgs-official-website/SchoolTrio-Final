import React, { useMemo, useState } from 'react';
import {
    useTransportStudents, useReportTable, useReportExports, ReportToolbar, ReportDataTable,
    natural, compareClassNames, filterInputClass
} from './transportReportShared';

const OPTIONS = {
    grade: { label: 'Grade', header: 'Grade', pick: (r) => r.className, sort: compareClassNames },
    route: { label: 'Route', header: 'Route', pick: (r) => r.routeName, sort: natural },
    stop: { label: 'Stop', header: 'Stop', pick: (r) => r.stopName, sort: natural },
    section: { label: 'Class & Section', header: 'Class & Section', pick: (r) => [r.className, r.sectionName].filter(Boolean).join(' - '), sort: (a, b) => compareClassNames(a.split(' - ')[0], b.split(' - ')[0]) || natural(a, b) }
};

const STATUS = [
    { value: '', label: 'Active/Withdraw' },
    { value: 'Active', label: 'Active' },
    { value: 'Withdraw', label: 'Withdraw' }
];

export default function BusSummary() {
    const { rows, loading } = useTransportStudents();
    const [option, setOption] = useState('grade');
    const [status, setStatus] = useState('');
    const [search, setSearch] = useState('');
    const cfg = OPTIONS[option];

    const students = useMemo(() => rows.filter((r) => !status || r.transportStatus === status), [rows, status]);

    // one row per grade / route / stop with the number of transport students in it
    const groups = useMemo(() => {
        const map = new Map();
        students.forEach((r) => {
            const key = cfg.pick(r) || 'Not Assigned';
            map.set(key, (map.get(key) || 0) + 1);
        });
        return [...map.entries()]
            .sort((a, b) => (a[0] === 'Not Assigned') - (b[0] === 'Not Assigned') || cfg.sort(a[0], b[0]))
            .map(([label, count]) => ({ id: label, label, count }));
    }, [students, cfg]);

    const columns = useMemo(() => [
        { key: 'label', label: cfg.header, value: (r) => r.label },
        { key: 'count', label: 'Count', value: (r) => r.count, align: 'right' }
    ], [cfg]);

    const table = useReportTable(groups, columns, search);
    const exports = useReportExports({
        fileBase: 'Bus_Summary', sheetName: 'Bus Summary', excelTitle: 'BUS STUDENT SUMMARY', pdfTitle: 'Bus Student Summary',
        visibleColumns: table.visibleColumns, sorted: table.sorted
    });

    return (
        <div>
            <ReportToolbar
                title="Bus Student Summary"
                disabled={loading || table.sorted.length === 0}
                onExcel={exports.onExcel} onPdf={exports.onPdf}
            />

            <div className="flex flex-wrap items-end gap-3 mb-5">
                <label className="flex flex-col gap-1 min-w-[200px]">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Select Option</span>
                    <select value={option} onChange={(e) => setOption(e.target.value)} className={filterInputClass}>
                        {Object.entries(OPTIONS).map(([k, o]) => <option key={k} value={k}>{o.label}</option>)}
                    </select>
                </label>
                <label className="flex flex-col gap-1 min-w-[200px]">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Transport Status</span>
                    <select value={status} onChange={(e) => setStatus(e.target.value)} className={filterInputClass}>
                        {STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                </label>
                <div className="flex items-baseline gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Total Count :</span>
                    <span className="text-base font-bold text-slate-900 dark:text-white">{students.length}</span>
                </div>
            </div>

            <ReportDataTable
                columns={table.visibleColumns} rows={table.sorted} loading={loading}
                search={search} onSearch={setSearch} sort={table.sort} onSort={table.toggleSort}
            />
        </div>
    );
}
