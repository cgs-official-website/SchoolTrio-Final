import React, { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { feeReportsApi } from '../../../../api/feeReports';
import { feeCategoriesApi } from '../../../../api/feeCategories';
import { formatExportDate } from '../../../../utils/excelExport';
import useExcelExport from '../../../../hooks/useExcelExport';
import ExportModal from '../../../../components/ExportModal';
import {
    MasterHeader,
    FormField,
    inputClass,
    MasterTable,
    useMasterList,
    useDebouncedValue
} from '../../FeeManagement/FeeMaster/components';
import StudentSelect from '../../FeeManagement/FeeConcession/StudentSelect';
import useClassSectionOptions from '../../FeeManagement/FeeConcession/useClassSectionOptions';
import { SummaryCards } from '../shared/ReportParts';
import { formatMoney, todayKey } from '../shared/reportUtils';

const PAGE_SIZE = 20;
const EMPTY_FILTERS = { classId: '', sectionId: '', student: null, feeCategoryId: '', paymentMode: '' };
const EMPTY_SUMMARY = { count: 0, feeAmount: 0, concessionAmount: 0, netAmount: 0, paymentModes: [] };

const EXPORT_COLUMNS = [
    { key: 'admissionNumber', label: 'Adm. No', value: (r) => r.admissionNumber },
    { key: 'studentName', label: 'Student Name', value: (r) => r.studentName },
    { key: 'className', label: 'Class', value: (r) => r.className },
    { key: 'sectionName', label: 'Section', value: (r) => r.sectionName },
    { key: 'feeCategory', label: 'Category Name', value: (r) => r.feeCategory },
    { key: 'receiptNumber', label: 'Receipt No', value: (r) => r.receiptNumber },
    { key: 'paymentMode', label: 'Pay Mode', value: (r) => r.paymentMode },
    { key: 'feeMonth', label: 'Fee Month', value: (r) => r.feeMonth },
    { key: 'dueDate', label: 'Due Date', value: (r) => formatExportDate(r.dueDate) },
    { key: 'feeAmount', label: 'Fee Amount', value: (r) => r.feeAmount },
    { key: 'concessionAmount', label: 'Concession Amount', value: (r) => r.concessionAmount },
    { key: 'netAmount', label: 'Net Amount', value: (r) => r.netAmount }
];

const money = (value) => <span className="font-mono whitespace-nowrap">{formatMoney(value)}</span>;

export default function DailyCollectionReport() {
    const { classOptions, sectionOptions } = useClassSectionOptions();

    const [date, setDate] = useState(todayKey());
    const [showFilters, setShowFilters] = useState(false);
    const [filters, setFilters] = useState(EMPTY_FILTERS);
    const [feeCategories, setFeeCategories] = useState([]);
    const [summary, setSummary] = useState(EMPTY_SUMMARY);

    useEffect(() => {
        let cancelled = false;
        feeCategoriesApi
            .listFeeCategories({ limit: 100, sortBy: 'name', order: 'asc' })
            .then((res) => {
                if (!cancelled) setFeeCategories(res?.data || []);
            })
            .catch((error) => {
                if (!cancelled) toast.error(error?.message || 'Failed to load fee categories.');
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const filterParams = useMemo(() => {
        const params = {};
        if (filters.classId) params.classId = filters.classId;
        if (filters.sectionId) params.sectionId = filters.sectionId;
        if (filters.student) params.studentId = filters.student.value;
        if (filters.feeCategoryId) params.feeCategoryId = filters.feeCategoryId;
        if (filters.paymentMode) params.paymentMode = filters.paymentMode;
        return params;
    }, [filters]);

    const hasActiveFilter = Object.keys(filterParams).length > 0 || date !== todayKey();

    const filterSections = useMemo(
        () => sectionOptions.filter((s) => s.classId === filters.classId),
        [sectionOptions, filters.classId]
    );

    const fetcher = useCallback(
        (params) => feeReportsApi.getDailyCollection({ ...params, date, ...filterParams }),
        [date, filterParams]
    );

    const list = useMasterList({
        fetcher,
        defaultSortBy: 'paidAt',
        defaultOrder: 'desc',
        limit: PAGE_SIZE,
        errorMessage: 'Failed to load daily collection.'
    });

    const exporter = useExcelExport({
        columns: EXPORT_COLUMNS,
        fetcher,
        getQuery: () => ({ search: list.search, sortBy: list.sortBy, order: list.order }),
        defaultFileName: `Daily_Collection_${date}`,
        sheetName: 'Daily Collection'
    });

    // Totals cover the whole day under the current search and filters, not just this page
    const debouncedSearch = useDebouncedValue(list.search, 350);

    useEffect(() => {
        let cancelled = false;
        feeReportsApi
            .getDailyCollectionSummary({ date, search: debouncedSearch || undefined, ...filterParams })
            .then((res) => {
                if (!cancelled) setSummary(res?.data || EMPTY_SUMMARY);
            })
            .catch((error) => {
                if (!cancelled) {
                    setSummary(EMPTY_SUMMARY);
                    toast.error(error?.message || 'Failed to load totals.');
                }
            });
        return () => {
            cancelled = true;
        };
    }, [date, filterParams, debouncedSearch]);

    const updateFilter = (patch) => {
        setFilters((prev) => ({ ...prev, ...patch }));
        list.setPage(1);
    };

    const changeDate = (value) => {
        setDate(value || todayKey());
        list.setPage(1);
    };

    const clearFilters = () => {
        setFilters(EMPTY_FILTERS);
        setDate(todayKey());
        list.setPage(1);
    };

    const columns = [
        { key: 'admissionNumber', label: 'Adm. No', sortable: true, className: 'font-mono' },
        { key: 'studentName', label: 'Student Name', sortable: true, className: 'font-semibold' },
        { key: 'className', label: 'Class', sortable: true },
        { key: 'sectionName', label: 'Section', sortable: true },
        { key: 'feeCategory', label: 'Category Name', sortable: true, className: 'font-semibold' },
        { key: 'receiptNumber', label: 'Receipt No', sortable: true, render: (row) => row.receiptNumber || '-' },
        { key: 'paymentMode', label: 'Pay Mode', sortable: true, render: (row) => row.paymentMode || '-' },
        { key: 'feeMonth', label: 'Fee Month', sortable: true, render: (row) => row.feeMonth || '-' },
        {
            key: 'dueDate',
            label: 'Due Date',
            sortable: true,
            render: (row) => <span className="whitespace-nowrap">{formatExportDate(row.dueDate) || '-'}</span>
        },
        { key: 'feeAmount', label: 'Fee Amount', sortable: true, render: (row) => money(row.feeAmount) },
        {
            key: 'concessionAmount',
            label: 'Concession Amount',
            sortable: false,
            render: (row) => money(row.concessionAmount)
        },
        {
            key: 'netAmount',
            label: 'Net Amount',
            sortable: false,
            render: (row) => <span className="font-mono font-bold whitespace-nowrap">{formatMoney(row.netAmount)}</span>
        }
    ];

    return (
        <div>
            <MasterHeader
                title="Daily Collection Details"
                searchValue={list.search}
                onSearchChange={list.setSearch}
                searchPlaceholder="Search Student Name, Adm. No., Receipt No."
                canAdd={false}
                onFilter={() => setShowFilters((v) => !v)}
                filterOpen={showFilters}
                filterActive={hasActiveFilter}
                onExport={exporter.openModal}
            />

            {showFilters && (
                <div className="mb-4 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                        <FormField label="Date">
                            <input
                                type="date"
                                value={date}
                                max={todayKey()}
                                onChange={(e) => changeDate(e.target.value)}
                                className={inputClass}
                            />
                        </FormField>

                        <FormField label="Class">
                            <select
                                value={filters.classId}
                                onChange={(e) => updateFilter({ classId: e.target.value, sectionId: '', student: null })}
                                className={inputClass}
                            >
                                <option value="">All classes</option>
                                {classOptions.map((c) => (
                                    <option key={c.value} value={c.value}>
                                        {c.label}
                                    </option>
                                ))}
                            </select>
                        </FormField>

                        <FormField label="Section">
                            <select
                                value={filters.sectionId}
                                onChange={(e) => updateFilter({ sectionId: e.target.value, student: null })}
                                disabled={!filters.classId}
                                className={`${inputClass} disabled:opacity-60`}
                            >
                                <option value="">{filters.classId ? 'All sections' : 'Select a class first'}</option>
                                {filterSections.map((s) => (
                                    <option key={s.value} value={s.value}>
                                        {s.label}
                                    </option>
                                ))}
                            </select>
                        </FormField>

                        <FormField label="Student Name">
                            <StudentSelect
                                key={`${filters.classId}-${filters.sectionId}`}
                                value={filters.student}
                                onChange={(student) => updateFilter({ student })}
                                classId={filters.classId}
                                sectionId={filters.sectionId}
                            />
                        </FormField>

                        <FormField label="Fee Category">
                            <select
                                value={filters.feeCategoryId}
                                onChange={(e) => updateFilter({ feeCategoryId: e.target.value })}
                                className={inputClass}
                            >
                                <option value="">All fee categories</option>
                                {feeCategories.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.name}
                                    </option>
                                ))}
                            </select>
                        </FormField>

                        <FormField label="Pay Mode">
                            <select
                                value={filters.paymentMode}
                                onChange={(e) => updateFilter({ paymentMode: e.target.value })}
                                className={inputClass}
                            >
                                <option value="">All pay modes</option>
                                {summary.paymentModes.map((mode) => (
                                    <option key={mode} value={mode}>
                                        {mode}
                                    </option>
                                ))}
                            </select>
                        </FormField>
                    </div>

                    {hasActiveFilter && (
                        <div className="mt-4 flex justify-end">
                            <button
                                type="button"
                                onClick={clearFilters}
                                className="px-4 py-2.5 rounded-xl text-sm font-bold bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 transition-colors"
                            >
                                Clear filters
                            </button>
                        </div>
                    )}
                </div>
            )}

            <SummaryCards
                items={[
                    { label: 'Payments', value: summary.count.toLocaleString('en-IN'), hint: `Paid on ${formatExportDate(date)}` },
                    { label: 'Fee Amount', value: formatMoney(summary.feeAmount) },
                    { label: 'Concession', value: formatMoney(summary.concessionAmount) },
                    { label: 'Total Collected', value: formatMoney(summary.netAmount), hint: 'Fee amount minus concession' }
                ]}
            />

            <MasterTable
                columns={columns}
                rows={list.rows}
                loading={list.loading}
                sortBy={list.sortBy}
                order={list.order}
                onSort={list.handleSort}
                pagination={list.pagination}
                onPageChange={list.setPage}
                canEdit={false}
                canDelete={false}
                emptyTitle={list.search || hasActiveFilter ? 'No matching payments' : 'No payments today'}
                emptyMessage={
                    list.search || hasActiveFilter
                        ? 'Try a different search, date or filter.'
                        : 'Fees paid on this date will appear here.'
                }
            />

            <ExportModal
                isOpen={exporter.open}
                onClose={exporter.closeModal}
                title="Export Daily Collection"
                subtitle="Customize file settings and select columns to export."
                defaultFileName={`Daily_Collection_${date}`}
                availableFields={exporter.availableFields}
                selectedFields={exporter.selected}
                onToggleField={exporter.toggleField}
                onSelectAll={exporter.selectAll}
                onExport={exporter.exportNow}
                exporting={exporter.exporting}
                exportButtonText="Generate Excel"
            />
        </div>
    );
}