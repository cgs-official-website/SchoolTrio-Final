import React, { useMemo } from 'react';
import { LuFilter as FilterIcon } from 'react-icons/lu';
import { compareClassNames } from '../transport/transportReportShared';
import {
    rollup, sumRows, groupBy, pct, compactMoney, rupees, monthKey, monthLabel, isOverdue, todayString,
    classSectionOf
} from './analysisData';
import { AnalysisFilterPanel } from './reportKit';
import { COLORS, ChartCard, Legend, EmptyChart, DonutChart, ColumnChart, BarList, SplitBar } from './charts';

const shortMonth = (key) => {
    const [mon, year] = monthLabel(key).split(' ');
    return year ? `${mon} ${year.slice(2)}` : mon;
};

function KpiStrip({ items }) {
    return (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-px rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-200 dark:bg-slate-700 overflow-hidden mb-5">
            {items.map((k, i) => (
                <div
                    key={k.label}
                    className={`bg-white dark:bg-slate-900 px-5 py-4 min-w-0 ${i === items.length - 1 && items.length % 2 === 1 ? 'col-span-2 lg:col-span-1' : ''}`}
                >
                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{k.label}</p>
                    <p className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white mt-1 tabular-nums truncate" title={rupees(k.value)}>
                        <span style={k.color ? { color: k.color } : undefined}>{compactMoney(k.value)}</span>
                    </p>
                    {k.note && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{k.note}</p>}
                </div>
            ))}
        </div>
    );
}

export default function FeeDashboard({ ctx }) {
    const { rows, loading } = ctx;

    const d = useMemo(() => {
        const today = todayString();
        const all = rollup(rows, today);

        const months = [...groupBy(rows, (r) => monthKey(r.dueDate))]
            .map(([k, list]) => { const t = sumRows(list, today); return { key: k, due: t.paid + t.balance, paid: t.paid }; })
            .sort((a, b) => a.key.localeCompare(b.key));

        const categories = [...groupBy(rows, (r) => r.feeCategory)]
            .map(([name, list]) => ({ name, ...sumRows(list, today) }))
            .sort((a, b) => (b.paid + b.balance) - (a.paid + a.balance))
            .slice(0, 8);

        const classes = [...groupBy(rows, (r) => r.className || 'No class')]
            .map(([name, list]) => ({ name, ...sumRows(list, today) }))
            .sort((a, b) => compareClassNames(a.name, b.name));

        const modes = [...groupBy(rows.filter((r) => r.paid > 0), (r) => r.payMode || 'Other')]
            .map(([name, list]) => ({ name, paid: list.reduce((t, r) => t + r.paid, 0) }))
            .sort((a, b) => b.paid - a.paid);

        const topDefaulters = [...groupBy(rows.filter((r) => isOverdue(r, today)), (r) => r.studentId).values()]
            .map((list) => ({
                id: list[0].studentId,
                name: list[0].studentName,
                cls: classSectionOf(list[0]),
                amount: list.reduce((t, r) => t + r.balance, 0),
                oldest: list.reduce((m, r) => (r.dueDate < m ? r.dueDate : m), list[0].dueDate)
            }))
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 6);

        return { all, months, categories, classes, modes, topDefaulters };
    }, [rows]);

    const { all } = d;
    const pendingNotDue = Math.max(0, all.balance - all.overdue);
    const net = all.paid + all.balance;

    return (
        <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">Fee Dashboard</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">A quick read of collection, dues and defaulters. Filters apply to every chart.</p>
                </div>
                <button
                    type="button" onClick={ctx.toggleFilter} aria-expanded={ctx.filterOpen}
                    className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-bold border transition-colors ${ctx.filterOpen || ctx.filterCount
                        ? 'bg-primary-600 border-primary-600 text-white hover:bg-primary-700'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                >
                    <FilterIcon size={15} /> Filter{ctx.filterCount ? ` (${ctx.filterCount})` : ''}
                </button>
            </div>

            <AnalysisFilterPanel ctx={ctx} />

            {loading ? (
                <p className="py-20 text-center text-slate-400">Loading...</p>
            ) : rows.length === 0 ? (
                <EmptyChart text="No fee data for the selected filters" />
            ) : (
                <>
                    <KpiStrip items={[
                        { label: 'Total Fees', value: all.total, note: `${all.students} students` },
                        { label: 'Collected', value: all.paid, color: COLORS.paid, note: `${all.collectionPct}% of payable` },
                        { label: 'Concession', value: all.concession, color: COLORS.concession, note: `${pct(all.concession, all.total)}% of total fees` },
                        { label: 'Balance', value: all.balance, color: COLORS.pending, note: 'Still to be collected' },
                        { label: 'Over Due', value: all.overdue, color: COLORS.overdue, note: 'Due date already passed' }
                    ]} />

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
                        <ChartCard title="Collection rate" subtitle="Of the amount payable after concession">
                            <DonutChart
                                ariaLabel={`Collection rate ${all.collectionPct} percent`}
                                centerValue={`${all.collectionPct}%`} centerLabel="collected"
                                segments={[
                                    { label: 'Collected', value: all.paid, color: COLORS.paid },
                                    { label: 'Pending (not yet due)', value: pendingNotDue, color: COLORS.pending },
                                    { label: 'Over due', value: all.overdue, color: COLORS.overdue }
                                ]}
                            />
                            <div className="mt-4">
                                <Legend items={[
                                    { label: 'Collected', value: compactMoney(all.paid), color: COLORS.paid },
                                    { label: 'Pending', value: compactMoney(pendingNotDue), color: COLORS.pending },
                                    { label: 'Over due', value: compactMoney(all.overdue), color: COLORS.overdue }
                                ]} />
                            </div>
                        </ChartCard>

                        <ChartCard title="Month wise: due vs collected" subtitle="By fee due month" className="lg:col-span-2">
                            <ColumnChart
                                ariaLabel="Amount due and collected for each month"
                                labels={d.months.map((m) => shortMonth(m.key))}
                                series={[
                                    { name: 'Due', color: COLORS.due, values: d.months.map((m) => m.due) },
                                    { name: 'Collected', color: COLORS.paid, values: d.months.map((m) => m.paid) }
                                ]}
                            />
                            <div className="mt-3"><Legend items={[{ label: 'Due', color: COLORS.due }, { label: 'Collected', color: COLORS.paid }]} /></div>
                        </ChartCard>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
                        <ChartCard title="Fee category wise" subtitle="Collected and still to collect, largest categories first">
                            <BarList normalize items={d.categories.map((c) => ({
                                key: c.name, label: c.name,
                                right: `${compactMoney(c.paid)} of ${compactMoney(c.paid + c.balance)} · ${pct(c.paid, c.paid + c.balance)}%`,
                                segments: [
                                    { label: 'Collected', value: c.paid, color: COLORS.paid },
                                    { label: 'Balance', value: c.balance, color: COLORS.pending }
                                ]
                            }))} />
                            <div className="mt-4"><Legend items={[{ label: 'Collected', color: COLORS.paid }, { label: 'Balance', color: COLORS.pending }]} /></div>
                        </ChartCard>

                        <ChartCard title="Class wise collection" subtitle="Collected and balance for every class">
                            <BarList
                                normalize
                                maxHeightClass="max-h-[22rem] overflow-y-auto pr-1"
                                items={d.classes.map((c) => ({
                                    key: c.name, label: c.name,
                                    right: `${pct(c.paid, c.paid + c.balance)}% · ${compactMoney(c.balance)} due`,
                                    segments: [
                                        { label: 'Collected', value: c.paid, color: COLORS.paid },
                                        { label: 'Balance', value: c.balance, color: COLORS.pending }
                                    ]
                                }))}
                            />
                        </ChartCard>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                        <ChartCard title="Student payment status" subtitle={`${all.students} students with fees`}>
                            <SplitBar
                                ariaLabel="Students fully paid, partly paid and unpaid"
                                parts={[
                                    { label: 'Paid', value: all.paidStudents, color: COLORS.paid },
                                    { label: 'Partial', value: all.partialStudents, color: COLORS.partial },
                                    { label: 'Unpaid', value: all.unpaidStudents, color: COLORS.unpaid }
                                ]}
                            />
                            <ul className="mt-4 space-y-2">
                                {[
                                    ['Paid', all.paidStudents, COLORS.paid],
                                    ['Partial', all.partialStudents, COLORS.partial],
                                    ['Unpaid', all.unpaidStudents, COLORS.unpaid]
                                ].map(([label, value, color]) => (
                                    <li key={label} className="flex items-center justify-between text-sm">
                                        <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                                            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} aria-hidden="true" />{label}
                                        </span>
                                        <span className="font-bold text-slate-900 dark:text-white tabular-nums">{value} <span className="text-xs font-medium text-slate-400">({pct(value, all.students)}%)</span></span>
                                    </li>
                                ))}
                            </ul>
                        </ChartCard>

                        <ChartCard title="Payment modes" subtitle="Share of the amount collected">
                            {d.modes.length === 0 ? <EmptyChart text="No payments yet" /> : (
                                <BarList items={d.modes.map((m) => ({
                                    key: m.name, label: m.name,
                                    right: `${compactMoney(m.paid)} · ${pct(m.paid, all.paid)}%`,
                                    segments: [{ label: m.name, value: m.paid, color: COLORS.concession }]
                                }))} />
                            )}
                        </ChartCard>

                        <ChartCard title="Top defaulters" subtitle="Highest overdue balance">
                            {d.topDefaulters.length === 0 ? <EmptyChart text="No overdue fees" /> : (
                                <ol className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {d.topDefaulters.map((s) => (
                                        <li key={s.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                                            <span className="min-w-0">
                                                <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{s.name}</span>
                                                <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">{s.cls}</span>
                                            </span>
                                            <span className="text-sm font-bold tabular-nums whitespace-nowrap" style={{ color: COLORS.overdue }}>{compactMoney(s.amount)}</span>
                                        </li>
                                    ))}
                                </ol>
                            )}
                        </ChartCard>
                    </div>
                </>
            )}
        </div>
    );
}
