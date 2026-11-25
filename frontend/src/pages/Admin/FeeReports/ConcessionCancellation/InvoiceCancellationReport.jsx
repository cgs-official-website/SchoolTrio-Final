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
    { key: 'paymentMode', label: 'Pay Mode', sortable: true, render: (row) => row.paymentMode || '-' },
    { key: 'cancelDate', label: 'Cancel Date', sortable: true, render: (row) => date(row.cancelDate) },
    { key: 'paidAt', label: 'Paid Date', sortable: true, render: (row) => date(row.paidAt) },
    {
        key: 'description',
        label: 'Description',
        sortable: false,
        render: (row) => <div className="min-w-[200px] max-w-xs whitespace-normal break-words">{row.description || '-'}</div>
    },
    { key: 'cancelledBy', label: 'Cancelled By', sortable: false, render: (row) => row.cancelledBy || '-' },
    {
        key: 'amount',
        label: 'Pay Amount',
        sortable: true,
        render: (row) => <span className="font-mono font-bold whitespace-nowrap">{formatMoney(row.amount)}</span>
    }
];

const oneLine = (text) => String(text || '').replace(/\s+/g, ' ').trim();

const EXPORT_COLUMNS = [
    { key: 'admissionNumber', label: 'Adm. No', value: (r) => r.admissionNumber },
    { key: 'studentName', label: 'Student Name', value: (r) => r.studentName },
    { key: 'classSection', label: 'Class - Section', value: (r) => r.classSection },
    { key: 'receiptNumber', label: 'Receipt No', value: (r) => r.receiptNumber },
    { key: 'paymentMode', label: 'Pay Mode', value: (r) => r.paymentMode },
    { key: 'cancelDate', label: 'Cancel Date', value: (r) => formatExportDate(r.cancelDate) },
    { key: 'paidAt', label: 'Paid Date', value: (r) => formatExportDate(r.paidAt) },
    { key: 'description', label: 'Description', value: (r) => oneLine(r.description) },
    { key: 'cancelledBy', label: 'Cancelled By', value: (r) => r.cancelledBy },
    { key: 'amount', label: 'Pay Amount', value: (r) => r.amount }
];

export default function InvoiceCancellationReport() {
    return (
        <FilteredReport
            title="Invoice Cancellation"
            searchPlaceholder="Search Student Name, Adm. No., Receipt No."
            listApi={feeReportsApi.getInvoiceCancellationReport}
            summaryApi={feeReportsApi.getInvoiceCancellationSummary}
            filters={['student', 'payMode', 'dateRange']}
            dateLabel="Cancel Date"
            columns={COLUMNS}
            exportColumns={EXPORT_COLUMNS}
            exportFileName="Invoice_Cancellation"
            sheetName="Invoice Cancellation"
            summaryCards={(s) => [
                { label: 'Total Amount', value: formatMoney(s.amount) },
                { label: 'Receipts', value: s.count.toLocaleString('en-IN'), hint: 'Cancelled' }
            ]}
            defaultSortBy="cancelDate"
            defaultOrder="desc"
            emptyMessage="Payments cancelled in Fee Transaction will appear here."
        />
    );
}