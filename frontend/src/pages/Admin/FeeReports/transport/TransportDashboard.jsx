import React, { useMemo, useState } from 'react';
import {
    useTransportStudents, useTransportPayments, SelectField
} from './transportReportShared';
import { COLORS, ChartCard, Legend, EmptyChart, DonutChart, ColumnChart, BarList, SplitBar } from '../analysis/charts';
import { compactMoney, rupees, pct, groupBy, dateKey, monthLabel } from '../analysis/analysisData';

const num = (v) => Number(v || 0);
const sum = (list, pick) => list.reduce((t, r) => t + num(pick(r)), 0);
const NO_ROUTE = 'No route';

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
                    <p className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white mt-1 tabular-nums truncate" title={k.exact}>
                        <span style={k.color ? { color: k.color } : undefined}>{k.value}</span>
                    </p>
                    {k.note && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{k.note}</p>}
                </div>
            ))}
        </div>
    );
}

export default function TransportDashboard() {
    const { rows: students, loading: loadingStudents } = useTransportStudents();
    const { rows: payments, loading: loadingPayments } = useTransportPayments({});
    const [status, setStatus] = useState('');
    const loading = loadingStudents || loadingPayments;

    const d = useMemo(() => {
        const st = students.filter((r) => !status || r.transportStatus === status);
        // payments carry no transport status, so only the student based figures follow the status filter
        const pay = payments;

        const total = sum(st, (r) => r.totalAmount);
        const concession = sum(st, (r) => r.concession);
        const paid = sum(st, (r) => r.paid);
        const due = sum(st, (r) => r.due);
        const payable = total - concession;

        const counts = { Paid: 0, Partial: 0, Unpaid: 0 };
        st.forEach((r) => {
            if (num(r.totalAmount) <= 0) return;
            if (num(r.due) <= 0) counts.Paid += 1;
            else if (num(r.paid) > 0) counts.Partial += 1;
            else counts.Unpaid += 1;
        });

        // Bus Fee Report -> per route
        const routes = [...groupBy(st, (r) => r.routeName || NO_ROUTE)]
            .map(([name, list]) => ({
                name,
                students: list.length,
                total: sum(list, (r) => r.totalAmount),
                paid: sum(list, (r) => r.paid),
                due: sum(list, (r) => r.due)
            }))
            .sort((a, b) => b.total - a.total);

        const stops = [...groupBy(st, (r) => r.stopName || 'No stop')]
            .map(([name, list]) => ({ name, students: list.length, due: sum(list, (r) => r.due) }))
            .sort((a, b) => b.students - a.students)
            .slice(0, 8);

        const defaulters = st
            .filter((r) => num(r.due) > 0)
            .sort((a, b) => num(b.due) - num(a.due))
            .slice(0, 6);

        // Bus Fee Collection -> by paid month and pay mode
        const collected = sum(pay, (r) => r.amount);
        const months = [...groupBy(pay.filter((r) => r.paidAt), (r) => dateKey(r.paidAt).slice(0, 7))]
            .map(([key, list]) => ({ key, amount: sum(list, (r) => r.amount) }))
            .sort((a, b) => a.key.localeCompare(b.key));

        const modes = [...groupBy(pay, (r) => r.payMode || 'Other')]
            .map(([name, list]) => ({ name, amount: sum(list, (r) => r.amount), count: list.length }))
            .sort((a, b) => b.amount - a.amount);

        // Route Wise Collection -> amount actually received per route
        const routeCollection = [...groupBy(pay, (r) => r.routeName || NO_ROUTE)]
            .map(([name, list]) => ({ name, amount: sum(list, (r) => r.amount), receipts: list.length }))
            .sort((a, b) => b.amount - a.amount);

        return {
            total, concession, paid, due, payable, counts, routes, stops, defaulters,
            collected, months, modes, routeCollection,
            studentCount: st.length, collectionPct: pct(paid, payable)
        };
    }, [students, payments, status]);

    const hasData = students.length > 0 || payments.length > 0;

    return (
        <div>
            <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
                <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">Transport Dashboard</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Live figures from Bus Fee Report, Bus Fee Collection and Route Wise Collection.
                    </p>
                </div>
                <div className="w-full sm:w-52">
                    <SelectField label="Transport Status" value={status} onChange={setStatus} options={['Active', 'Withdraw']} />
                </div>
            </div>

            {loading ? (
                <p className="py-20 text-center text-slate-400">Loading...</p>
            ) : !hasData ? (
                <EmptyChart text="No transport data yet" />
            ) : (
                <>
                    <KpiStrip items={[
                        { label: 'Total Bus Fees', value: compactMoney(d.total), exact: rupees(d.total), note: `${d.studentCount} transport students` },
                        { label: 'Collected', value: compactMoney(d.paid), exact: rupees(d.paid), color: COLORS.paid, note: `${d.collectionPct}% of payable` },
                        { label: 'Concession', value: compactMoney(d.concession), exact: rupees(d.concession), color: COLORS.concession, note: `${pct(d.concession, d.total)}% of total fees` },
                        { label: 'Due', value: compactMoney(d.due), exact: rupees(d.due), color: COLORS.overdue, note: 'Still to be collected' },
                        { label: 'Receipts Total', value: compactMoney(d.collected), exact: rupees(d.collected), note: `${payments.length} payments received` }
                    ]} />

                    {/* Bus Fee Report */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
                        <ChartCard title="Collection rate" subtitle="Bus Fee Report: paid vs payable after concession">
                            <DonutChart
                                ariaLabel={`Bus fee collection rate ${d.collectionPct} percent`}
                                centerValue={`${d.collectionPct}%`} centerLabel="collected"
                                segments={[
                                    { label: 'Collected', value: d.paid, color: COLORS.paid },
                                    { label: 'Due', value: d.due, color: COLORS.overdue }
                                ]}
                            />
                            <div className="mt-4">
                                <Legend items={[
                                    { label: 'Collected', value: compactMoney(d.paid), color: COLORS.paid },
                                    { label: 'Due', value: compactMoney(d.due), color: COLORS.overdue }
                                ]} />
                            </div>
                        </ChartCard>

                        <ChartCard title="Bus fee collected by month" subtitle="Bus Fee Collection: amount received per month (by paid date)" className="lg:col-span-2">
                            {d.months.length === 0 ? <EmptyChart text="No payments yet" /> : (
                                <>
                                    <ColumnChart
                                        ariaLabel="Bus fee amount collected in each month"
                                        labels={d.months.map((m) => shortMonth(m.key))}
                                        series={[{ name: 'Collected', color: COLORS.paid, values: d.months.map((m) => m.amount) }]}
                                    />
                                    <div className="mt-3"><Legend items={[{ label: 'Collected', color: COLORS.paid }]} /></div>
                                </>
                            )}
                        </ChartCard>
                    </div>

                    {/* Route Wise */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
                        <ChartCard title="Route wise fee status" subtitle="Collected and due for every route (Bus Fee Report)">
                            {d.routes.length === 0 ? <EmptyChart /> : (
                                <>
                                    <BarList
                                        normalize
                                        maxHeightClass="max-h-[22rem] overflow-y-auto pr-1"
                                        items={d.routes.map((r) => ({
                                            key: r.name, label: r.name, sub: `${r.students} students`,
                                            right: `${compactMoney(r.paid)} of ${compactMoney(r.paid + r.due)} · ${pct(r.paid, r.paid + r.due)}%`,
                                            segments: [
                                                { label: 'Collected', value: r.paid, color: COLORS.paid },
                                                { label: 'Due', value: r.due, color: COLORS.overdue }
                                            ]
                                        }))}
                                    />
                                    <div className="mt-4"><Legend items={[{ label: 'Collected', color: COLORS.paid }, { label: 'Due', color: COLORS.overdue }]} /></div>
                                </>
                            )}
                        </ChartCard>

                        <ChartCard title="Route wise collection" subtitle="Amount received per route (Route Wise Collection Report)">
                            {d.routeCollection.length === 0 ? <EmptyChart text="No payments yet" /> : (
                                <BarList
                                    maxHeightClass="max-h-[22rem] overflow-y-auto pr-1"
                                    items={d.routeCollection.map((r) => ({
                                        key: r.name, label: r.name, sub: `${r.receipts} receipts`,
                                        right: `${compactMoney(r.amount)} · ${pct(r.amount, d.collected)}%`,
                                        segments: [{ label: 'Collected', value: r.amount, color: COLORS.paid }]
                                    }))}
                                />
                            )}
                        </ChartCard>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                        <ChartCard title="Student payment status" subtitle={`${d.counts.Paid + d.counts.Partial + d.counts.Unpaid} students with bus fees`}>
                            <SplitBar
                                ariaLabel="Students fully paid, partly paid and unpaid"
                                parts={[
                                    { label: 'Paid', value: d.counts.Paid, color: COLORS.paid },
                                    { label: 'Partial', value: d.counts.Partial, color: COLORS.partial },
                                    { label: 'Unpaid', value: d.counts.Unpaid, color: COLORS.unpaid }
                                ]}
                            />
                            <ul className="mt-4 space-y-2">
                                {[['Paid', d.counts.Paid, COLORS.paid], ['Partial', d.counts.Partial, COLORS.partial], ['Unpaid', d.counts.Unpaid, COLORS.unpaid]].map(([label, value, color]) => (
                                    <li key={label} className="flex items-center justify-between text-sm">
                                        <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                                            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} aria-hidden="true" />{label}
                                        </span>
                                        <span className="font-bold text-slate-900 dark:text-white tabular-nums">
                                            {value} <span className="text-xs font-medium text-slate-400">({pct(value, d.counts.Paid + d.counts.Partial + d.counts.Unpaid)}%)</span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </ChartCard>

                        <ChartCard title="Payment modes" subtitle="Share of the amount collected">
                            {d.modes.length === 0 ? <EmptyChart text="No payments yet" /> : (
                                <BarList items={d.modes.map((m) => ({
                                    key: m.name, label: m.name, sub: `${m.count} payments`,
                                    right: `${compactMoney(m.amount)} · ${pct(m.amount, d.collected)}%`,
                                    segments: [{ label: m.name, value: m.amount, color: COLORS.paid }]
                                }))} />
                            )}
                        </ChartCard>

                        <ChartCard title="Top defaulters" subtitle="Highest bus fee due">
                            {d.defaulters.length === 0 ? <EmptyChart text="No dues" /> : (
                                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {d.defaulters.map((r) => (
                                        <li key={r.id || r.admissionNumber} className="flex items-center justify-between gap-3 py-2">
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{r.studentName}</p>
                                                <p className="text-xs text-slate-400 truncate">
                                                    {[r.className, r.sectionName].filter(Boolean).join(' - ')}{r.routeName ? ` · ${r.routeName}` : ''}
                                                </p>
                                            </div>
                                            <span className="text-sm font-bold tabular-nums whitespace-nowrap" style={{ color: COLORS.overdue }}>{rupees(r.due)}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </ChartCard>
                    </div>
                </>
            )}
        </div>
    );
}
