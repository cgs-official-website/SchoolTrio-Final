import React from 'react';
import FilteredReport from '../shared/FilteredReport';
import { feeReportsApi } from '../../../../api/feeReports';
import { formatMoney } from '../shared/reportUtils';

const money = (value) => (value ? formatMoney(value) : '-');
const percent = (value) => (value ? `${value}%` : '-');

// The fee columns come from the fee categories, so the columns are built once they load
const columns = ({ feeCategories }) => [
    { key: 'admissionNumber', label: 'Adm. No', sortable: true, className: 'font-mono' },
    { key: 'studentName', label: 'Student Name', sortable: true, className: 'font-semibold' },
    { key: 'className', label: 'Class', sortable: true },
    { key: 'sectionName', label: 'Section', sortable: true },
    { key: 'parentName', label: 'Parent Name', sortable: false, render: (row) => row.parentName || '-' },
    ...feeCategories.map((c) => ({
        key: `fee-${c.id}`,
        label: c.name,
        sortable: false,
        render: (row) => <span className="font-mono whitespace-nowrap">{money(row.fees?.[c.id])}</span>
    })),
    {
        key: 'totalFee',
        label: 'Total Fee',
        sortable: false,
        render: (row) => <span className="font-mono font-bold whitespace-nowrap">{formatMoney(row.totalFee)}</span>
    },
    ...feeCategories.map((c) => ({
        key: `pct-${c.id}`,
        label: `Conc. % in ${c.name}`,
        sortable: false,
        render: (row) => <span className="whitespace-nowrap">{percent(row.percents?.[c.id])}</span>
    })),
    {
        key: 'concessionAmount',
        label: 'Concession Amount',
        sortable: false,
        render: (row) => <span className="font-mono whitespace-nowrap">{formatMoney(row.concessionAmount)}</span>
    },
    {
        key: 'concessionPercent',
        label: 'Concession %',
        sortable: false,
        render: (row) => percent(row.concessionPercent)
    },
    {
        key: 'netAmount',
        label: 'Net Amount',
        sortable: false,
        render: (row) => <span className="font-mono font-bold whitespace-nowrap">{formatMoney(row.netAmount)}</span>
    }
];

const exportColumns = ({ feeCategories }) => [
    { key: 'admissionNumber', label: 'Adm. No', value: (r) => r.admissionNumber },
    { key: 'studentName', label: 'Student Name', value: (r) => r.studentName },
    { key: 'className', label: 'Class', value: (r) => r.className },
    { key: 'sectionName', label: 'Section', value: (r) => r.sectionName },
    { key: 'parentName', label: 'Parent Name', value: (r) => r.parentName },
    ...feeCategories.map((c) => ({
        key: `fee-${c.id}`,
        label: c.name,
        value: (r) => r.fees?.[c.id] ?? 0
    })),
    { key: 'totalFee', label: 'Total Fee', value: (r) => r.totalFee },
    ...feeCategories.map((c) => ({
        key: `pct-${c.id}`,
        label: `Conc. % in ${c.name}`,
        value: (r) => r.percents?.[c.id] ?? 0
    })),
    { key: 'concessionAmount', label: 'Concession Amount', value: (r) => r.concessionAmount },
    { key: 'concessionPercent', label: 'Concession %', value: (r) => r.concessionPercent },
    { key: 'netAmount', label: 'Net Amount', value: (r) => r.netAmount }
];

export default function ConsolidatedConcessionReport() {
    return (
        <FilteredReport
            title="Consolidated Concession Report"
            searchPlaceholder="Search Student Name, Adm. No."
            listApi={feeReportsApi.getConsolidatedConcessionReport}
            summaryApi={feeReportsApi.getConsolidatedConcessionSummary}
            filters={['student', 'feeCategory', 'concessionCategory', 'dateRange']}
            dateLabel="Concession Date"
            columns={columns}
            exportColumns={exportColumns}
            exportFileName="Consolidated_Concession_Report"
            sheetName="Consolidated Concession"
            summaryCards={(s) => [
                { label: 'Total Concession Amount', value: formatMoney(s.amount) },
                { label: 'Students', value: s.count.toLocaleString('en-IN'), hint: 'With a concession' }
            ]}
            defaultSortBy="admissionNumber"
            defaultOrder="asc"
            emptyMessage="Students with a concession will appear here."
        />
    );
}