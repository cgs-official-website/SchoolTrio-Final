import React from 'react';
import { useSearchParams } from 'react-router-dom';
import ReportView from './ReportView';
import { REPORTS } from './studentCategoryReports';
import { useAllInvoices } from '../shared/reportUtils';
import useClassSectionOptions from '../../FeeManagement/FeeConcession/useClassSectionOptions';

export default function StudentCategoryWiseTab() {
    const [searchParams, setSearchParams] = useSearchParams();
    const active = REPORTS.find((r) => r.key === searchParams.get('sub')) || REPORTS[0];

    // loaded once and shared by every sub report, so switching between them is instant
    const { invoices, loading } = useAllInvoices({});
    const { classOptions, sectionOptions } = useClassSectionOptions();

    const selectSub = (key) => {
        const next = new URLSearchParams(searchParams);
        next.set('sub', key);
        setSearchParams(next, { replace: true });
    };

    return (
        <div>
            {/* One dropdown instead of a wall of buttons; the options come straight from REPORTS */}
            <div className="mb-6 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
                <label htmlFor="sub-report" className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5">
                    Select report
                </label>
                <select
                    id="sub-report"
                    value={active.key}
                    onChange={(e) => selectSub(e.target.value)}
                    className="w-full sm:max-w-md px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                >
                    {REPORTS.map(({ key, label }) => (
                        <option key={key} value={key}>{label}</option>
                    ))}
                </select>
            </div>

            <ReportView
                key={active.key}
                def={active}
                invoices={invoices}
                loading={loading}
                classOptions={classOptions}
                sectionOptions={sectionOptions}
            />
        </div>
    );
}
