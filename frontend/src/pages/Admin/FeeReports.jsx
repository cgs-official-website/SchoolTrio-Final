import React from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    LuCalendarDays as CalendarDays,
    LuUsers as Users,
    LuTicketPercent as Concession,
    LuBus as Bus,
    LuChartColumn as Analysis
} from 'react-icons/lu';
import DailyCollectionTab from './FeeReports/DailyCollectionTab';
import StudentCategoryWiseTab from './FeeReports/StudentCategoryWiseTab';
import ConcessionCancellationTab from './FeeReports/ConcessionCancellationTab';
import TransportReportTab from './FeeReports/TransportReportTab';
import FeeAnalysisTab from './FeeReports/FeeAnalysisTab';

const TABS = [
    { key: 'daily', label: 'Daily Collection', icon: CalendarDays, Component: DailyCollectionTab },
    { key: 'student', label: 'Student & Category Wise', icon: Users, Component: StudentCategoryWiseTab },
    { key: 'concession', label: 'Concession & Cancellation', icon: Concession, Component: ConcessionCancellationTab },
    { key: 'transport', label: 'Transport Report', icon: Bus, Component: TransportReportTab },
    { key: 'analysis', label: 'Fee Analysis', icon: Analysis, Component: FeeAnalysisTab }
];

export default function FeeReports() {
    const [searchParams, setSearchParams] = useSearchParams();
    const active = TABS.find((t) => t.key === searchParams.get('tab')) || TABS[0];
    const ActiveComponent = active.Component;

    const selectTab = (key) => {
        const next = new URLSearchParams(searchParams);
        next.set('tab', key);
        setSearchParams(next, { replace: true });
    };

    return (
        <div className="p-4 sm:p-8 max-w-7xl mx-auto pb-24">
            <div className="mb-6 min-w-0">
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white truncate">Fee Reports</h1>
                <p className="text-slate-500 dark:text-slate-400 mt-1">Collection, concession, transport and analysis reports for fees.</p>
            </div>

            <div className="flex border-b border-slate-200 dark:border-slate-700 mb-6 gap-6 overflow-x-auto">
                {TABS.map(({ key, label, icon: Icon }) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => selectTab(key)}
                        className={`pb-3 font-bold text-sm transition-all border-b-2 flex items-center gap-2 whitespace-nowrap ${active.key === key
                                ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
                            }`}
                    >
                        <Icon size={18} />
                        {label}
                    </button>
                ))}
            </div>

            <ActiveComponent key={active.key} />
        </div>
    );
}
