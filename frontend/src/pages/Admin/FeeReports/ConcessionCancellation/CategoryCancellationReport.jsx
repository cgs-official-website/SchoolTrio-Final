import React from 'react';
import FilteredReport from '../shared/FilteredReport';
import { feeReportsApi } from '../../../../api/feeReports';
import { formatExportDate } from '../../../../utils/excelExport';
import { formatMoney } from '../shared/reportUtils';

const date = (value) => <span className="whitespace-nowrap">{formatExportDate(value) || '-'}</span>;

const COLUMNS = [
    { key: 'admissionNumber', label: 'Adm. No', sortable: true, className: 'font-mono' },
    { key: 'studentName', label: 'Student Name', sortable: true, className: 'font-semibold' },
    // The key is className so the column sorts on the class
    { key: 'className', label: 'Class - Section', sortable: true, render: (row) => row.classSection || '-' },
    { key: 'receiptNumber', label: 'Receipt No', sortable: true, render: (row) => row.receiptNumber || '-' },
    { key: 'paidAt', label: 'Paid Date', sortable: true, render: (row) => date(row.paidAt) },
    { key: 'cancelDate', label: 'Cancel Date', sortable: true, render: (row) => date(row.cancelDate) },
    { key: 'feeCategory', label: 'Category Name', sortable: true, className: 'font-semibold' },
    {
        key: 'amount',
        label: 'Pay Amount',
        sortable: true,
        render: (row) => <span className="font-mono font-bold whitespace-nowrap">{formatMoney(row.amount)}</span>
    },
    {
        key: 'description',
        label: 'Description',
        sortable: false,
        render: (row) => <div className="min-w-[200px] max-w-xs whitespace-normal break-words">{row.description || '-'}</div>
    },
    { key: 'cancelledBy', label: 'Cancelled By', sortable: false, render: (row) => row.cancelledBy || '-' }
];

const oneLine = (text) => String(text || '').replace(/\s+/g, ' ').trim();

const EXPORT_COLUMNS = [
    { key: 'admissionNumber', label: 'Adm. No', value: (r) => r.admissionNumber },
    { key: 'studentName', label: 'Student Name', value: (r) => r.studentName },
    { key: 'classSection', label: 'Class - Section', value: (r) => r.classSection },
    { key: 'receiptNumber', label: 'Receipt No', value: (r) => r.receiptNumber },
    { key: 'paidAt', label: 'Paid Date', value: (r) => formatExportDate(r.paidAt) },
    { key: 'cancelDate', label: 'Cancel Date', value: (r) => formatExportDate(r.cancelDate) },
    { key: 'feeCategory', label: 'Category Name', value: (r) => r.feeCategory },
    { key: 'amount', label: 'Pay Amount', value: (r) => r.amount },
    { key: 'description', label: 'Description', value: (r) => oneLine(r.description) },
    { key: 'cancelledBy', label: 'Cancelled By', value: (r) => r.cancelledBy }
];

export default function CategoryCancellationReport() {
    return (
        <FilteredReport
            title="Category Cancellation Report"
            searchPlaceholder="Search Student Name, Adm. No., Receipt No."
            listApi={feeReportsApi.getCategoryCancellationReport}
            summaryApi={feeReportsApi.getCategoryCancellationSummary}
            filters={['student', 'feeCategory', 'dateRange']}
            dateLabel="Cancel Date"
            columns={COLUMNS}
            exportColumns={EXPORT_COLUMNS}
            exportFileName="Category_Cancellation_Report"
            sheetName="Category Cancellation"
            summaryCards={(s) => [
                { label: 'Total Amount', value: formatMoney(s.amount) },
                { label: 'Cancelled Fees', value: s.count.toLocaleString('en-IN'), hint: 'One row per fee' }
            ]}
            defaultSortBy="cancelDate"
            defaultOrder="desc"
            emptyMessage="Fees whose payment was cancelled will appear here."
        />
    );
}