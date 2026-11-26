
import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import {
    LuChevronLeft as ChevronLeft,
    LuChevronRight as ChevronRight,
    LuFileSpreadsheet as FileSpreadsheet
} from 'react-icons/lu';
import { getDayReport } from '../../../../api/feeReports';
import { downloadWorkbook } from '../../../../utils/excelExport';
import { Field, filterInputClass } from '../shared/ReportParts';
import { formatMoney, todayKey } from '../shared/reportUtils';

const TONES = {
    violet: { band: 'bg-violet-600 text-white' },
    emerald: { band: 'bg-emerald-600 text-white' },
    cyan: { band: 'bg-cyan-600 text-white' }
};

const addDays = (key, n) => {
    const d = new Date(`${key}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
};

const showDate = (key) => key.split('-').reverse().join('-');

const sharePercent = (amount, total) =>
    total > 0 ? Math.round((amount / total) * 1000) / 10 : 0;

const sheetOf = (name, rows, total, count) => ({
    name,
    header: ['S.No', 'Name', 'Payments', 'Amount', 'Share %'],
    rows: [
        ...rows.map((r, i) => [
            i + 1,
            r.name,
            r.payments,
            r.amount,
            sharePercent(r.amount, total)
        ]),
        ['', 'Total', count, total, total > 0 ? 100 : 0]
    ]
});

function StatCard({ label, value, hint }) {
    return (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                {label}
            </p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                {value}
            </p>
            {hint && (
                <p className="text-xs text-slate-400 mt-1">{hint}</p>
            )}
        </div>
    );
}

function GroupCard({ title, tone, rows, total, loading }) {
    return (
        <div className="flex flex-col h-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">

            <div className={`px-4 py-3 text-sm font-bold ${tone.band}`}>
                {title}
            </div>

            <div className="flex-1 max-h-96 overflow-y-auto">
                {loading ? (
                    <p className="px-4 py-10 text-center text-sm text-slate-400">
                        Loading...
                    </p>
                ) : rows.length === 0 ? (
                    <p className="px-4 py-10 text-center text-sm text-slate-400">
                        No payments on this date.
                    </p>
                ) : (
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                        {rows.map((row, i) => (
                            <li key={row.name} className="px-4 py-4">
                                <div className="flex items-center justify-between gap-3">
                                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                                        {i + 1}. {row.name}
                                    </p>

                                    <p className="text-sm font-mono font-bold text-slate-900 dark:text-white shrink-0">
                                        {formatMoney(row.amount)}
                                    </p>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {!loading && rows.length > 0 && (
                <p className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800">
                    Total {formatMoney(total)}
                </p>
            )}
        </div>
    );
}

const pillClass = (active) =>
    `px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
        active
            ? 'bg-primary-600 border-primary-600 text-white'
            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
    }`;

const arrowClass =
    'p-2.5 rounded-xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors';

export default function DayDashboardReport() {
    const [date, setDate] = useState(todayKey());
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const requestRef = useRef(0);

    const today = todayKey();
    const yesterday = addDays(today, -1);

    useEffect(() => {
        if (!date) return;

        const requestId = ++requestRef.current;

        setLoading(true);

        getDayReport(date)
            .then((res) => {
                if (requestId !== requestRef.current) return;
                setReport(res?.data || null);
            })
            .catch((error) => {
                if (requestId !== requestRef.current) return;
                setReport(null);
                toast.error(error?.message || 'Failed to load day report.');
            })
            .finally(() => {
                if (requestId === requestRef.current) {
                    setLoading(false);
                }
            });

    }, [date]);

    const total = report?.total ?? 0;
    const count = report?.paymentCount ?? 0;

    const groups = [
        {
            title: 'Payment Mode Wise Collection',
            sheet: 'Payment Mode Wise',
            tone: TONES.violet,
            rows: report?.paymentModes || []
        },
        {
            title: 'Category Wise Collection',
            sheet: 'Category Wise',
            tone: TONES.emerald,
            rows: report?.categories || []
        },
        {
            title: 'Class Wise Collection',
            sheet: 'Class Wise',
            tone: TONES.cyan,
            rows: report?.classes || []
        }
    ];

    const handleExport = () => {
        downloadWorkbook({
            fileName: `Day_Report_${date}`,
            sheets: groups.map((g) =>
                sheetOf(g.sheet, g.rows, total, count)
            )
        });

        toast.success('Day report exported.');
    };

    return (
        <div>
            <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
                <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                        Day Report
                    </h2>

                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        Collections for {showDate(date)}
                    </p>
                </div>

                <div className="flex flex-wrap items-end gap-2">
                    <button
                        type="button"
                        onClick={() => setDate(yesterday)}
                        className={pillClass(date === yesterday)}
                    >
                        Yesterday
                    </button>

                    <button
                        type="button"
                        onClick={() => setDate(today)}
                        className={pillClass(date === today)}
                    >
                        Today
                    </button>

                    <button
                        type="button"
                        onClick={() => setDate(addDays(date, -1))}
                        aria-label="Previous day"
                        title="Previous day"
                        className={arrowClass}
                    >
                        <ChevronLeft size={18} />
                    </button>

                    <Field label="Date" className="min-w-[170px]">
                        <input
                            type="date"
                            value={date}
                            max={today}
                            onChange={(e) =>
                                e.target.value && setDate(e.target.value)
                            }
                            className={filterInputClass}
                        />
                    </Field>

                    <button
                        type="button"
                        onClick={() => setDate(addDays(date, 1))}
                        disabled={date >= today}
                        aria-label="Next day"
                        title="Next day"
                        className={arrowClass}
                    >
                        <ChevronRight size={18} />
                    </button>

                    <button
                        type="button"
                        onClick={handleExport}
                        disabled={loading || !report || count === 0}
                        className="px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <FileSpreadsheet size={16} />
                        Export
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <StatCard
                    label="Total Collected"
                    value={formatMoney(total)}
                    hint="Fee amount minus concession"
                />

                <StatCard
                    label="Payments"
                    value={count.toLocaleString('en-IN')}
                    hint="Fees paid on this date"
                />
            </div>

            {/* Collection Breakdown */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-stretch">
                {groups.map((g) => (
                    <GroupCard
                        key={g.title}
                        title={g.title}
                        tone={g.tone}
                        rows={g.rows}
                        total={total}
                        loading={loading}
                    />
                ))}
            </div>
        </div>
    );
}
