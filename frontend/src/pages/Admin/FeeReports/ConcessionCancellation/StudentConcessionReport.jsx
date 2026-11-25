import React from 'react';
import FilteredReport from '../shared/FilteredReport';
import { feeReportsApi } from '../../../../api/feeReports';
import { formatMoney } from '../shared/reportUtils';

const COLUMNS = [
    { key: 'admissionNumber', label: 'Adm. No', sortable: true, className: 'font-mono' },
    { key: 'studentName', label: 'Student Name', sortable: true, className: 'font-semibold' },
    { key: 'className', label: 'Class Name', sortable: true },
    { key: 'sectionName', label: 'Section Name', sortable: true },
    { key: 'feeCategories', label: 'Category Name', sortable: false, render: (row) => row.feeCategories || '-' },
    {
        key: 'concessionCategories',
        label: 'Concession Category',
        sortable: false,
        render: (row) => row.concessionCategories || '-'
    },
    {
        key: 'amount',
        label: 'Amount',
        sortable: false,
        render: (row) => <span className="font-mono font-bold whitespace-nowrap">{formatMoney(row.amount)}</span>
    }
];

const EXPORT_COLUMNS = [
    { key: 'admissionNumber', label: 'Adm. No', value: (r) => r.admissionNumber },
    { key: 'studentName', label: 'Student Name', value: (r) => r.studentName },
    { key: 'className', label: 'Class Name', value: (r) => r.className },
    { key: 'sectionName', label: 'Section Name', value: (r) => r.sectionName },
    { key: 'feeCategories', label: 'Category Name', value: (r) => r.feeCategories },
    { key: 'concessionCategories', label: 'Concession Category', value: (r) => r.concessionCategories },
    { key: 'amount', label: 'Amount', value: (r) => r.amount }
];

export default function StudentConcessionReport() {
    return (
        <FilteredReport
            title="Student Concession Report"
            searchPlaceholder="Search Student Name, Adm. No."
            listApi={feeReportsApi.getStudentConcessionReport}
            summaryApi={feeReportsApi.getStudentConcessionSummary}
            filters={['student', 'feeCategory', 'concessionCategory', 'dateRange']}
            dateLabel="Concession Date"
            columns={COLUMNS}
            exportColumns={EXPORT_COLUMNS}
            exportFileName="Student_Concession_Report"
            sheetName="Student Concession"
            summaryCards={(s) => [
                { label: 'Total Amount', value: formatMoney(s.amount) },
                { label: 'Students', value: s.count.toLocaleString('en-IN'), hint: 'With a concession' }
            ]}
            defaultSortBy="admissionNumber"
            defaultOrder="asc"
            emptyMessage="Students with a concession will appear here."
        />
    );
}