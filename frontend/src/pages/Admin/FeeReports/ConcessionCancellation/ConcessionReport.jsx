import React, { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { feeReportsApi } from '../../../../api/feeReports';
import { feeCategoriesApi } from '../../../../api/feeCategories';
import { concessionCategoriesApi } from '../../../../api/concessionCategories';
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
const EMPTY_FILTERS = {
    classId: '',
    sectionId: '',
    student: null,
    feeCategoryId: '',
    concessionCategoryId: '',
    fromDate: '',
    toDate: '',
    dueFrom: '',
    dueTo: ''
};
const EMPTY_SUMMARY = { count: 0, amount: 0 };

const oneLine = (text) => String(text || '').replace(/\s+/g, ' ').trim();

const EXPORT_COLUMNS = [
    { key: 'admissionNumber', label: 'Adm. No', value: (r) => r.admissionNumber },
    { key: 'studentName', label: 'Student Name', value: (r) => r.studentName },
    { key: 'className', label: 'Class', value: (r) => r.className },
    { key: 'sectionName', label: 'Section', value: (r) => r.sectionName },
    { key: 'parentName', label: 'Parent Name', value: (r) => r.parentName },
    { key: 'feeCategory', label: 'Category Name', value: (r) => r.feeCategory },
    { key: 'concessionCategory', label: 'Concession Category', value: (r) => r.concessionCategory },
    { key: 'concessionDate', label: 'Concession Date', value: (r) => formatExportDate(r.concessionDate) },
    { key: 'description', label: 'Description', value: (r) => oneLine(r.description) },
    { key: 'dueDate', label: 'Due Date', value: (r) => formatExportDate(r.dueDate) },
    { key: 'feeAmount', label: 'Fee Amount', value: (r) => r.feeAmount },
    { key: 'percentage', label: 'Percentage', value: (r) => (r.percentage === null ? '' : r.percentage) },
    { key: 'amount', label: 'Concession Amount', value: (r) => r.amount }
];

export default function ConcessionReport() {
    const { classOptions, sectionOptions } = useClassSectionOptions();

    const [showFilters, setShowFilters] = useState(false);
    const [filters, setFilters] = useState(EMPTY_FILTERS);
    const [feeCategories, setFeeCategories] = useState([]);
    const [concessionCategories, setConcessionCategories] = useState([]);
    const [summary, setSummary] = useState(EMPTY_SUMMARY);

    useEffect(() => {
        let cancelled = false;
        Promise.all([
            feeCategoriesApi.listFeeCategories({ limit: 100, sortBy: 'name', order: 'asc' }),
            concessionCategoriesApi.listConcessionCategories({ limit: 100, sortBy: 'name', order: 'asc' })
        ])
            .then(([feeRes, concRes]) => {
                if (cancelled) return;
                setFeeCategories(feeRes?.data || []);
                setConcessionCategories(concRes?.data || []);
            })
            .catch((error) => {
                if (!cancelled) toast.error(error?.message || 'Failed to load categories.');
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
        if (filters.concessionCategoryId) params.concessionCategoryId = filters.concessionCategoryId;
        if (filters.fromDate) params.fromDate = filters.fromDate;
        if (filters.toDate) params.toDate = filters.toDate;
        if (filters.dueFrom) params.dueFrom = filters.dueFrom;
        if (filters.dueTo) params.dueTo = filters.dueTo;
        return params;
    }, [filters]);

    const hasActiveFilter = Object.keys(filterParams).length > 0;

    const filterSections = useMemo(
        () => sectionOptions.filter((s) => s.classId === filters.classId),
        [sectionOptions, filters.classId]
    );

    const fetcher = useCallback(
        (params) => feeReportsApi.getConcessionReport({ ...params, ...filterParams }),
        [filterParams]
    );

    const list = useMasterList({
        fetcher,
        defaultSortBy: 'concessionDate',
        defaultOrder: 'desc',
        limit: PAGE_SIZE,
        errorMessage: 'Failed to load the concession report.'
    });

    const exporter = useExcelExport({
        columns: EXPORT_COLUMNS,
        fetcher,
        getQuery: () => ({ search: list.search, sortBy: list.sortBy, order: list.order }),
        defaultFileName: 'Concession_Report',
        sheetName: 'Concession Report'
    });

    // Totals cover every matching concession under the current search and filters, not just this page
    const debouncedSearch = useDebouncedValue(list.search, 350);

    useEffect(() => {
        let cancelled = false;
        feeReportsApi
            .getConcessionReportSummary({ search: debouncedSearch || undefined, ...filterParams })
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
    }, [filterParams, debouncedSearch]);

    const updateFilter = (patch) => {
        setFilters((prev) => ({ ...prev, ...patch }));
        list.setPage(1);
    };

    const clearFilters = () => {
        setFilters(EMPTY_FILTERS);
        list.setPage(1);
    };

    const columns = [
        { key: 'admissionNumber', label: 'Adm. No', sortable: true, className: 'font-mono' },
        { key: 'studentName', label: 'Student Name', sortable: true, className: 'font-semibold' },
        { key: 'className', label: 'Class', sortable: true },
        { key: 'sectionName', label: 'Section', sortable: true },
        { key: 'parentName', label: 'Parent Name', sortable: false, render: (row) => row.parentName || '-' },
        { key: 'feeCategory', label: 'Category Name', sortable: true, className: 'font-semibold' },
        { key: 'concessionCategory', label: 'Concession Category', sortable: true },
        {
            key: 'concessionDate',
            label: 'Concession Date',
            sortable: true,
            render: (row) => <span className="whitespace-nowrap">{formatExportDate(row.concessionDate) || '-'}</span>
        },
        {
            key: 'description',
            label: 'Description',
            sortable: false,
            render: (row) => (
                <div className="min-w-[200px] max-w-xs whitespace-normal break-words">{row.description || '-'}</div>
            )
        },
        {
            key: 'dueDate',
            label: 'Due Date',
            sortable: true,
            render: (row) => <span className="whitespace-nowrap">{formatExportDate(row.dueDate) || '-'}</span>
        },
        {
            key: 'feeAmount',
            label: 'Fee Amount',
            sortable: true,
            render: (row) => <span className="font-mono whitespace-nowrap">{formatMoney(row.feeAmount)}</span>
        },
        {
            key: 'amount',
            label: 'Concession Amount',
            sortable: true,
            render: (row) => (
                <div className="whitespace-nowrap">
                    <div className="font-mono font-bold">{formatMoney(row.amount)}</div>
                    {row.percentage !== null && (
                        <div className="text-xs text-slate-500 dark:text-slate-400">{row.percentage}%</div>
                    )}
                </div>
            )
        }
    ];

    return (
        <div>
            <MasterHeader
                title="Concession Report"
                searchValue={list.search}
                onSearchChange={list.setSearch}
                searchPlaceholder="Search Student or Description"
                canAdd={false}
                onFilter={() => setShowFilters((v) => !v)}
                filterOpen={showFilters}
                filterActive={hasActiveFilter}
                onExport={exporter.openModal}
            />

            {showFilters && (
                <div className="mb-4 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
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

                        <FormField label="Category Name">
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

                        <FormField label="Concession Category">
                            <select
                                value={filters.concessionCategoryId}
                                onChange={(e) => updateFilter({ concessionCategoryId: e.target.value })}
                                className={inputClass}
                            >
                                <option value="">All concession categories</option>
                                {concessionCategories.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.name}
                                    </option>
                                ))}
                            </select>
                        </FormField>

                        <div className="hidden md:block" />

                        <FormField label="Concession Date From">
                            <input
                                type="date"
                                value={filters.fromDate}
                                max={filters.toDate || todayKey()}
                                onChange={(e) => updateFilter({ fromDate: e.target.value })}
                                className={inputClass}
                            />
                        </FormField>

                        <FormField label="Concession Date To">
                            <input
                                type="date"
                                value={filters.toDate}
                                min={filters.fromDate || undefined}
                                max={todayKey()}
                                onChange={(e) => updateFilter({ toDate: e.target.value })}
                                className={inputClass}
                            />
                        </FormField>

                        <div className="hidden md:block" />

                        <FormField label="Due Date From">
                            <input
                                type="date"
                                value={filters.dueFrom}
                                max={filters.dueTo || undefined}
                                onChange={(e) => updateFilter({ dueFrom: e.target.value })}
                                className={inputClass}
                            />
                        </FormField>

                        <FormField label="Due Date To">
                            <input
                                type="date"
                                value={filters.dueTo}
                                min={filters.dueFrom || undefined}
                                onChange={(e) => updateFilter({ dueTo: e.target.value })}
                                className={inputClass}
                            />
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
                    { label: 'Total Concession Amount', value: formatMoney(summary.amount) },
                    {
                        label: 'Concessions',
                        value: summary.count.toLocaleString('en-IN'),
                        hint: 'Matching the search and filters'
                    }
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
                emptyTitle={list.search || hasActiveFilter ? 'No matching concessions' : 'No concessions yet'}
                emptyMessage={
                    list.search || hasActiveFilter
                        ? 'Try a different search or clear the filters.'
                        : 'Concessions given in Fee Transaction will appear here.'
                }
            />

            <ExportModal
                isOpen={exporter.open}
                onClose={exporter.closeModal}
                title="Export Concession Report"
                subtitle="Customize file settings and select columns to export."
                defaultFileName="Concession_Report"
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