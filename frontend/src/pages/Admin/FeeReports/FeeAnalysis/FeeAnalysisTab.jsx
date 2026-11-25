import React, { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    LuLayoutDashboard as DashboardIcon,
    LuLayers as ConsolidatedIcon,
    LuTags as CategoryIcon,
    LuHandCoins as CollectionIcon
} from 'react-icons/lu';
import {
    useFeeAnalysisRows, useFilterOptions, applyFilters, countActiveFilters, DEFAULT_FILTERS
} from '../analysis/analysisData';
import FeeDashboard from '../analysis/FeeDashboard';
import {
    CategoryConsolidated, ClassConsolidated, StudentConsolidated, CollectionStatus,
    StudentCategoryWise, ClassWiseCategory, MonthWiseCategory, TermWiseStudent,
    ReceiptWise, SpecificDateCollection, MonthWiseCollection, StudentDefaulters
} from '../analysis/reports';

/**
 * Fee Reports -> Fee Analysis.
 *
 * The 15 loose buttons of the old screen are grouped into 4 sections. The section shows its reports
 * as a second, quieter row, so there are never more than 4 + 4 choices on screen:
 *
 *   Dashboard            charts + key numbers
 *   Consolidated         Category | Class | Student | Collection Status
 *   Category Wise        Student Category | Class Wise | Month Wise | Term Wise
 *   Collection & Defaulters   Receipts | Specific Date | Month Wise | Defaulters
 *
 * The URL keeps the chosen report in `?sub=` (same as the Transport tab) so a report can be bookmarked.
 */
const GROUPS = [
    {
        key: 'dashboard', label: 'Dashboard', icon: DashboardIcon,
        reports: [{ key: 'dashboard', label: 'Dashboard', Component: FeeDashboard }]
    },
    {
        key: 'consolidated', label: 'Consolidated', icon: ConsolidatedIcon,
        reports: [
            { key: 'category', label: 'Category', Component: CategoryConsolidated },
            { key: 'class', label: 'Class & Section', Component: ClassConsolidated },
            { key: 'student', label: 'Student', Component: StudentConsolidated },
            { key: 'status', label: 'Collection Status', Component: CollectionStatus }
        ]
    },
    {
        key: 'category-wise', label: 'Category Wise', icon: CategoryIcon,
        reports: [
            { key: 'student-category', label: 'Student Category', Component: StudentCategoryWise },
            { key: 'class-category', label: 'Class Wise', Component: ClassWiseCategory },
            { key: 'month-category', label: 'Month Wise', Component: MonthWiseCategory },
            { key: 'term-student', label: 'Term Wise (Student)', Component: TermWiseStudent }
        ]
    },
    {
        key: 'collection', label: 'Collection & Defaulters', icon: CollectionIcon,
        reports: [
            { key: 'receipts', label: 'Receipt Wise', Component: ReceiptWise },
            { key: 'specific-date', label: 'Specific Date', Component: SpecificDateCollection },
            { key: 'month-collection', label: 'Month Wise', Component: MonthWiseCollection },
            { key: 'defaulters', label: 'Student Defaulters', Component: StudentDefaulters }
        ]
    }
];

const ALL_REPORTS = GROUPS.flatMap((g) => g.reports.map((r) => ({ ...r, group: g })));

export default function FeeAnalysisTab() {
    const [searchParams, setSearchParams] = useSearchParams();
    // an unknown / leftover `sub` (e.g. "route-wise" from the Transport tab) opens the dashboard
    const active = ALL_REPORTS.find((r) => r.key === searchParams.get('sub')) || ALL_REPORTS[0];
    const group = active.group;

    const select = (key) => {
        const next = new URLSearchParams(searchParams);
        next.set('sub', key);
        setSearchParams(next, { replace: true });
    };

    // one data load + one set of filters shared by every report
    const { rows: allRows, loading } = useFeeAnalysisRows();
    const [filters, setFilters] = useState(DEFAULT_FILTERS);
    const [filterOpen, setFilterOpen] = useState(false);

    const rows = useMemo(() => applyFilters(allRows, filters), [allRows, filters]);
    const options = useFilterOptions(allRows, filters);
    const setFilter = useCallback((key) => (value) => setFilters((f) => ({ ...f, [key]: value })), []);
    const resetFilters = useCallback(() => setFilters(DEFAULT_FILTERS), []);
    const toggleFilter = useCallback(() => setFilterOpen((v) => !v), []);

    const ctx = useMemo(() => ({
        rows, allRows, loading, filters, setFilters, setFilter, resetFilters, options,
        filterOpen, toggleFilter, filterCount: countActiveFilters(filters)
    }), [rows, allRows, loading, filters, setFilter, resetFilters, options, filterOpen, toggleFilter]);

    const ActiveReport = active.Component;

    return (
        <div>
            <nav aria-label="Fee analysis reports" className="mb-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
                <div className="flex flex-wrap gap-2 p-3">
                    {GROUPS.map(({ key, label, icon: Icon, reports }) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => select(reports[0].key)}
                            aria-current={group.key === key ? 'page' : undefined}
                            className={`px-4 py-2 rounded-xl text-sm font-bold border transition-colors inline-flex items-center gap-2 ${group.key === key
                                ? 'bg-primary-600 border-primary-600 text-white shadow-sm'
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-primary-50 dark:hover:bg-slate-800'
                                }`}
                        >
                            <Icon size={16} />
                            {label}
                        </button>
                    ))}
                </div>

                {group.reports.length > 1 && (
                    <div className="flex flex-wrap gap-1 px-3 pb-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                        {group.reports.map(({ key, label }) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => select(key)}
                                aria-current={active.key === key ? 'page' : undefined}
                                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${active.key === key
                                    ? 'bg-primary-100 text-primary-800 dark:bg-primary-900/50 dark:text-primary-200'
                                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                                    }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                )}
            </nav>

            <ActiveReport key={active.key} ctx={ctx} />
        </div>
    );
}
