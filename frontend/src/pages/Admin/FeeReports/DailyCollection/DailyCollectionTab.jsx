import React from 'react';
import { useSearchParams } from 'react-router-dom';
import DayDashboardReport from './DayDashboardReport';
import LedgerReport from './LedgerReport';
import DailyCollectionReport from './DailyCollectionReport';

// Add new Daily Collection sub-tabs here: { key, label, Component }
const SUB_TABS = [
    { key: 'day-dashboard', label: 'Day Dashboard Report', Component: DayDashboardReport },
    { key: 'ledger', label: 'Ledger', Component: LedgerReport },
    { key: 'daily-collection', label: 'Daily Collection', Component: DailyCollectionReport }
];

export default function DailyCollectionTab() {
    const [searchParams, setSearchParams] = useSearchParams();
    const requested = searchParams.get('sub');
    const active = SUB_TABS.find((t) => t.key === requested) || SUB_TABS[0];
    const ActiveComponent = active.Component;

    const selectSub = (key) => {
        const next = new URLSearchParams(searchParams);
        next.set('sub', key);
        setSearchParams(next, { replace: true });
    };

    return (
        <div>
            <div className="flex flex-wrap gap-2 p-3 mb-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
                {SUB_TABS.map(({ key, label }) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => selectSub(key)}
                        aria-current={active.key === key ? 'page' : undefined}
                        className={`px-4 py-2 rounded-xl text-sm font-bold border transition-colors ${
                            active.key === key
                                ? 'bg-primary-600 border-primary-600 text-white shadow-sm'
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-primary-50 dark:hover:bg-slate-800'
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            <ActiveComponent key={active.key} />
        </div>
    );
}