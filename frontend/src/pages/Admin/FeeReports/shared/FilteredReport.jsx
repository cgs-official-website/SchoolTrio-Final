import React, { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { feeCategoriesApi } from '../../../../api/feeCategories';
import { concessionCategoriesApi } from '../../../../api/concessionCategories';
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
import { SummaryCards } from './ReportParts';
import { todayKey } from './reportUtils';

const PAGE_SIZE = 20;
const EMPTY_FILTERS = {
    classId: '',
    sectionId: '',
    student: null,
    feeCategoryId: '',
    concessionCategoryId: '',
    paymentMode: '',
    fromDate: '',
    toDate: ''
};
const EMPTY_SUMMARY = { count: 0, amount: 0, paymentModes: [] };

const byOrder = (a, b) =>
    (a.paymentOrder ?? 0) - (b.paymentOrder ?? 0) || String(a.name).localeCompare(String(b.name));

/**
 * One report screen: header line (search, filter, export), filter panel, summary cards, table and Excel export.
 *
 * filters:        any of 'student' (class + section + student), 'feeCategory', 'concessionCategory',
 *                 'payMode' and 'dateRange'
 * columns:        table columns, or a function ({ feeCategories, concessionCategories }) => columns
 * exportColumns:  [{ key, label, value }], or a function like columns
 * summaryCards:   (summary) => [{ label, value, hint? }]
 */
export default function FilteredReport({
    title,
    searchPlaceholder = 'Search',
    listApi,
    summaryApi,
    filters: filterKeys = [],
    dateLabel = 'Date',
    columns,
    exportColumns,
    exportFileName,
    exportTitle,
    sheetName = 'Report',
    summaryCards,
    defaultSortBy,
    defaultOrder = 'desc',
    emptyMessage = 'Nothing to show yet.',
    paymentModes
}) {
    const { classOptions, sectionOptions } = useClassSectionOptions();
    const has = (key) => filterKeys.includes(key);
    const needsConcessionCategories = has('concessionCategory');

    const [showFilters, setShowFilters] = useState(false);
    const [filters, setFilters] = useState(EMPTY_FILTERS);
    const [feeCategories, setFeeCategories] = useState([]);
    const [concessionCategories, setConcessionCategories] = useState([]);
    const [summary, setSummary] = useState(EMPTY_SUMMARY);

    useEffect(() => {
        let cancelled = false;
        feeCategoriesApi
            .listFeeCategories({ limit: 100, sortBy: 'name', order: 'asc' })
            .then((res) => {
                if (!cancelled) setFeeCategories([...(res?.data || [])].sort(byOrder));
            })
            .catch((error) => {
                if (!cancelled) toast.error(error?.message || 'Failed to load fee categories.');
            });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!needsConcessionCategories) return undefined;
        let cancelled = false;
        concessionCategoriesApi
            .listConcessionCategories({ limit: 100, sortBy: 'name', order: 'asc' })
            .then((res) => {
                if (!cancelled) setConcessionCategories(res?.data || []);
            })
            .catch((error) => {
                if (!cancelled) toast.error(error?.message || 'Failed to load concession categories.');
            });
        return () => {
            cancelled = true;
        };
    }, [needsConcessionCategories]);

    const filterParams = useMemo(() => {
        const params = {};
        if (filters.classId) params.classId = filters.classId;
        if (filters.sectionId) params.sectionId = filters.sectionId;
        if (filters.student) params.studentId = filters.student.value;
        if (filters.feeCategoryId) params.feeCategoryId = filters.feeCategoryId;
        if (filters.concessionCategoryId) params.concessionCategoryId = filters.concessionCategoryId;
        if (filters.paymentMode) params.paymentMode = filters.paymentMode;
        if (filters.fromDate) params.fromDate = filters.fromDate;
        if (filters.toDate) params.toDate = filters.toDate;
        return params;
    }, [filters]);

    const hasActiveFilter = Object.keys(filterParams).length > 0;

    const filterSections = useMemo(
        () => sectionOptions.filter((s) => s.classId === filters.classId),
        [sectionOptions, filters.classId]
    );

    const fetcher = useCallback((params) => listApi({ ...params, ...filterParams }), [listApi, filterParams]);

    const list = useMasterList({
        fetcher,
        defaultSortBy,
        defaultOrder,
        limit: PAGE_SIZE,
        errorMessage: `Failed to load ${title}.`
    });

    const ctx = { feeCategories, concessionCategories };
    const tableColumns = typeof columns === 'function' ? columns(ctx) : columns;
    const exportCols = typeof exportColumns === 'function' ? exportColumns(ctx) : exportColumns;

    const exporter = useExcelExport({
        columns: exportCols,
        fetcher,
        getQuery: () => ({ search: list.search, sortBy: list.sortBy, order: list.order }),
        defaultFileName: exportFileName,
        sheetName
    });

    // Totals cover everything that matches the search and filters, not just this page
    const debouncedSearch = useDebouncedValue(list.search, 350);

    useEffect(() => {
        let cancelled = false;
        summaryApi({ search: debouncedSearch || undefined, ...filterParams })
            .then((res) => {
                if (!cancelled) setSummary({ ...EMPTY_SUMMARY, ...(res?.data || {}) });
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
    }, [summaryApi, filterParams, debouncedSearch]);

    const updateFilter = (patch) => {
        setFilters((prev) => ({ ...prev, ...patch }));
        list.setPage(1);
    };

    const clearFilters = () => {
        setFilters(EMPTY_FILTERS);
        list.setPage(1);
    };

    return (
        <div>
            <MasterHeader
                title={title}
                searchValue={list.search}
                onSearchChange={list.setSearch}
                searchPlaceholder={searchPlaceholder}
                canAdd={false}
                onFilter={() => setShowFilters((v) => !v)}
                filterOpen={showFilters}
                filterActive={hasActiveFilter}
                onExport={exporter.openModal}
            />

            {showFilters && (
                <div className="mb-4 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                        {has('student') && (
                            <>
                                <FormField label="Class">
                                    <select
                                        value={filters.classId}
                                        onChange={(e) =>
                                            updateFilter({ classId: e.target.value, sectionId: '', student: null })
                                        }
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
                                        <option value="">
                                            {filters.classId ? 'All sections' : 'Select a class first'}
                                        </option>
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
                            </>
                        )}

                        {has('feeCategory') && (
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
                        )}

                        {has('concessionCategory') && (
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
                        )}

                        {has('payMode') && (
                            <FormField label="Pay Mode">
                                <select
                                    value={filters.paymentMode}
                                    onChange={(e) => updateFilter({ paymentMode: e.target.value })}
                                    className={inputClass}
                                >
                                    <option value="">All pay modes</option>
                                        {(paymentModes || summary.paymentModes).map((mode) => (
                                        <option key={mode} value={mode}>
                                            {mode}
                                        </option>
                                    ))}
                                </select>
                            </FormField>
                        )}

                        {has('dateRange') && (
                            <>
                                <FormField label={`${dateLabel} From`}>
                                    <input
                                        type="date"
                                        value={filters.fromDate}
                                        max={filters.toDate || todayKey()}
                                        onChange={(e) => updateFilter({ fromDate: e.target.value })}
                                        className={inputClass}
                                    />
                                </FormField>

                                <FormField label={`${dateLabel} To`}>
                                    <input
                                        type="date"
                                        value={filters.toDate}
                                        min={filters.fromDate || undefined}
                                        max={todayKey()}
                                        onChange={(e) => updateFilter({ toDate: e.target.value })}
                                        className={inputClass}
                                    />
                                </FormField>
                            </>
                        )}
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

            {summaryCards && <SummaryCards items={summaryCards(summary)} />}

            <MasterTable
                columns={tableColumns}
                rows={list.rows}
                loading={list.loading}
                sortBy={list.sortBy}
                order={list.order}
                onSort={list.handleSort}
                pagination={list.pagination}
                onPageChange={list.setPage}
                canEdit={false}
                canDelete={false}
                emptyTitle={list.search || hasActiveFilter ? 'No matching records' : 'No records yet'}
                emptyMessage={
                    list.search || hasActiveFilter ? 'Try a different search or clear the filters.' : emptyMessage
                }
            />

            <ExportModal
                isOpen={exporter.open}
                onClose={exporter.closeModal}
                title={exportTitle || `Export ${title}`}
                subtitle="Customize file settings and select columns to export."
                defaultFileName={exportFileName}
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