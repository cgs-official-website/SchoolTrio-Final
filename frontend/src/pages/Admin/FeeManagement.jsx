import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { LuLayers as Layers, LuReceipt as Receipt } from 'react-icons/lu';
import FeeTransactionTabs from './FeeManagement/FeeTransactionTabs';
import FeeMaster from './FeeManagement/FeeMaster/FeeMaster';

const TABS = [
  { key: 'master', label: 'Fee Master', icon: Layers },
  { key: 'transaction', label: 'Fee Transaction', icon: Receipt }
];

export default function FeeManagement() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const activeTab = TABS.some((t) => t.key === requested) ? requested : 'master';

  const selectTab = (key) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', key);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto pb-24">
      <div className="mb-6 min-w-0">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white truncate">Fee Management</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Configure fee masters, track revenue, and manage student payments.</p>
      </div>

      {/* Top Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-700 mb-6 gap-6 overflow-x-auto">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => selectTab(key)}
            className={`pb-3 font-bold text-sm transition-all border-b-2 flex items-center gap-2 whitespace-nowrap ${
              activeTab === key
                ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
            }`}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </div>
      {activeTab === 'master' ? <FeeMaster /> : <FeeTransactionTabs />}
    </div>
  );
}