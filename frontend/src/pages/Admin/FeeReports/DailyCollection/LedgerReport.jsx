import React, { useState, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { LuFileText as FileText, LuLoader as Loader } from 'react-icons/lu';
import { studentsApi } from '../../../../api/students';
import { feeReportsApi } from '../../../../api/feeReports';
import { downloadLedgerPdf } from '../../../../utils/ledgerPdf';
import {
    MasterHeader,
    FormField,
    inputClass,
    MasterTable,
    useMasterList
} from '../../FeeManagement/FeeMaster/components';
import StudentSelect from '../../FeeManagement/FeeConcession/StudentSelect';
import useClassSectionOptions from '../../FeeManagement/FeeConcession/useClassSectionOptions';
import { todayKey } from '../shared/reportUtils';

const PAGE_SIZE = 20;
const EMPTY_FILTERS = { classId: '', sectionId: '', student: null };

const SINGLE_PAGE = { page: 1, limit: 1, total: 1, totalPages: 1, hasNextPage: false, hasPrevPage: false };

export default function LedgerReport() {
    const { classOptions, sectionOptions } = useClassSectionOptions();

    const [showFilters, setShowFilters] = useState(false);
    const [filters, setFilters] = useState(EMPTY_FILTERS);
    const [asOn, setAsOn] = useState(todayKey());
    const [downloadingId, setDownloadingId] = useState(null);

    const hasActiveFilter = Boolean(filters.classId || filters.sectionId || filters.student);

    const filterSections = useMemo(
        () => sectionOptions.filter((s) => s.classId === filters.classId),
        [sectionOptions, filters.classId]
    );

    const fetcher = useCallback(
        (params) => {
            // A chosen student shows just that one row
            if (filters.student?.raw) {
                return Promise.resolve({ data: [filters.student.raw], pagination: SINGLE_PAGE });
            }
            const query = { ...params };
            if (filters.classId) query.classId = filters.classId;
            if (filters.sectionId) query.sectionId = filters.sectionId;
            return studentsApi.listStudents(query);
        },
        [filters]
    );

    const list = useMasterList({
        fetcher,
        defaultSortBy: 'firstName',
        defaultOrder: 'asc',
        limit: PAGE_SIZE,
        errorMessage: 'Failed to load students.'
    });

    const updateFilter = (patch) => {
        setFilters((prev) => ({ ...prev, ...patch }));
        list.setPage(1);
    };

    const clearFilters = () => {
        setFilters(EMPTY_FILTERS);
        list.setPage(1);
    };

    const handleDownload = async (row) => {
        setDownloadingId(row.id);
        try {
            const res = await feeReportsApi.getStudentLedger(row.id, asOn);
            if (!res?.data) throw new Error('No ledger data returned.');
            downloadLedgerPdf(res.data);
        } catch (error) {
            toast.error(error?.message || 'Failed to generate the ledger.');
        } finally {
            setDownloadingId(null);
        }
    };

    const columns = [
        {
            key: 'studentName',
            label: 'Student Name',
            sortable: false,
            className: 'font-semibold',
            render: (row) => [row.firstName, row.lastName].filter(Boolean).join(' ') || '-'
        },
        { key: 'admissionNumber', label: 'Admission No', sortable: false, className: 'font-mono' },
        {
            key: 'className',
            label: 'Class',
            sortable: false,
            render: (row) => row.class?.name || row.className || '-'
        },
        {
            key: 'sectionName',
            label: 'Section',
            sortable: false,
            render: (row) => row.section?.name || row.sectionName || '-'
        },
        {
            key: 'actions',
            label: 'Action',
            sortable: false,
            render: (row) => (
                <button
                    type="button"
                    onClick={() => handleDownload(row)}
                    disabled={downloadingId === row.id}
                    title="Download ledger PDF"
                    aria-label="Download ledger PDF"
                    className="p-2 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-50 transition-colors"
                >
                    {downloadingId === row.id ? <Loader size={18} className="animate-spin" /> : <FileText size={18} />}
                </button>
            )
        }
    ];

    return (
        <div>
            <MasterHeader
                title="Ledger Collection Details"
                searchValue={list.search}
                onSearchChange={list.setSearch}
                searchPlaceholder="Search Student Name, Admission No."
                canAdd={false}
                onFilter={() => setShowFilters((v) => !v)}
                filterOpen={showFilters}
                filterActive={hasActiveFilter}
            />

            {showFilters && (
                <div className="mb-4 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
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

                        <FormField label="As On Date">
                            <input
                                type="date"
                                value={asOn}
                                max={todayKey()}
                                onChange={(e) => setAsOn(e.target.value || todayKey())}
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
                emptyTitle={list.search || hasActiveFilter ? 'No matching students' : 'No students found'}
                emptyMessage="Try a different search or clear the filters."
            />
        </div>
    );
}