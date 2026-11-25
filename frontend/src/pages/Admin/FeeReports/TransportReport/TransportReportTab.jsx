import React from 'react';
import { useSearchParams } from 'react-router-dom';
import TransportDashboard from '../transport/TransportDashboard';
import BusFeeReport from '../transport/BusFeeReport';
import BusFeeCollection from '../transport/BusFeeCollection';
import BusSummary from '../transport/BusSummary';
import RouteWiseCollection from '../transport/RouteWiseCollection';

// Sub-tabs of Fee Reports -> Transport Report (same strip style as Fee Transaction).
const SUB_TABS = [
    { key: 'dashboard', label: 'Dashboard', Component: TransportDashboard },
    { key: 'bus-fee-report', label: 'Bus Fee Report', Component: BusFeeReport },
    { key: 'bus-fee-collection', label: 'Bus Fee Collection', Component: BusFeeCollection },
    { key: 'bus-summary', label: 'Bus Summary', Component: BusSummary },
    { key: 'route-wise', label: 'Route Wise Collection Report', Component: RouteWiseCollection }
];

export default function TransportReportTab() {
    const [searchParams, setSearchParams] = useSearchParams();
    const active = SUB_TABS.find((t) => t.key === searchParams.get('sub')) || SUB_TABS[0];
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
                        className={`px-4 py-2 rounded-xl text-sm font-bold border transition-colors ${active.key === key
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
