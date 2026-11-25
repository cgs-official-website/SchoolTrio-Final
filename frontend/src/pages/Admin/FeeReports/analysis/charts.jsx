import React from 'react';
import { compactMoney } from './analysisData';

/** Chart colours. Each one is always paired with a text label / value, never colour alone. */
export const COLORS = {
    paid: '#10b981',
    pending: '#f59e0b',
    overdue: '#f43f5e',
    due: '#94a3b8',
    concession: '#8b5cf6',
    unpaid: '#f43f5e',
    partial: '#f59e0b'
};

export function ChartCard({ title, subtitle, children, className = '' }) {
    return (
        <section className={`rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 min-w-0 ${className}`}>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 mb-4">{subtitle}</p>}
            {!subtitle && <div className="mb-4" />}
            {children}
        </section>
    );
}

export function Legend({ items }) {
    return (
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
            {items.map((i) => (
                <li key={i.label} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: i.color }} aria-hidden="true" />
                    <span>{i.label}</span>
                    {i.value !== undefined && <span className="font-bold text-slate-900 dark:text-white tabular-nums">{i.value}</span>}
                </li>
            ))}
        </ul>
    );
}

export function EmptyChart({ text = 'No data for the selected filters' }) {
    return <p className="py-10 text-center text-sm text-slate-400">{text}</p>;
}

// ------------------------------------------------------------------
// Donut
// ------------------------------------------------------------------

export function DonutChart({ segments, centerValue, centerLabel, ariaLabel }) {
    const r = 70;
    const c = 2 * Math.PI * r;
    const total = segments.reduce((t, s) => t + s.value, 0);
    let offset = 0;
    return (
        <svg viewBox="0 0 180 180" role="img" aria-label={ariaLabel} className="w-full max-w-[220px] mx-auto block">
            <circle cx="90" cy="90" r={r} fill="none" strokeWidth="22" className="stroke-slate-100 dark:stroke-slate-800" />
            {total > 0 && segments.map((s) => {
                const len = (s.value / total) * c;
                const el = (
                    <circle
                        key={s.label} cx="90" cy="90" r={r} fill="none" strokeWidth="22" stroke={s.color}
                        strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} transform="rotate(-90 90 90)"
                    >
                        <title>{`${s.label}: ${compactMoney(s.value)}`}</title>
                    </circle>
                );
                offset += len;
                return el;
            })}
            <text x="90" y="88" textAnchor="middle" className="fill-slate-900 dark:fill-white" style={{ fontSize: 28, fontWeight: 800 }}>{centerValue}</text>
            <text x="90" y="108" textAnchor="middle" className="fill-slate-500 dark:fill-slate-400" style={{ fontSize: 11, fontWeight: 600 }}>{centerLabel}</text>
        </svg>
    );
}

// ------------------------------------------------------------------
// Grouped columns (e.g. due vs collected per month)
// ------------------------------------------------------------------

const niceMax = (v) => {
    if (!(v > 0)) return 1;
    const p = 10 ** Math.floor(Math.log10(v));
    const n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
};

export function ColumnChart({ labels, series, ariaLabel }) {
    const H = 230, padL = 54, padR = 8, padT = 12, padB = 30;
    // a minimum canvas width keeps the chart's proportions when there are only a few months; many months widen it
    const W = Math.max(560, padL + padR + labels.length * 64);
    const band = (W - padL - padR) / Math.max(1, labels.length);
    const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
    const y = (v) => padT + (H - padT - padB) * (1 - v / max);
    const barW = Math.min(28, (band - 16) / series.length);
    const ticks = [0, 1, 2, 3, 4].map((i) => (max / 4) * i);

    return (
        <div className="overflow-x-auto">
            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} style={{ width: '100%', minWidth: 460 }}>
                {ticks.map((t) => (
                    <g key={t}>
                        <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} className="stroke-slate-200 dark:stroke-slate-700" strokeWidth="1" />
                        <text x={padL - 8} y={y(t) + 4} textAnchor="end" className="fill-slate-500 dark:fill-slate-400" style={{ fontSize: 10 }}>{compactMoney(t)}</text>
                    </g>
                ))}
                {labels.map((label, i) => {
                    const gx = padL + i * band + (band - barW * series.length) / 2;
                    return (
                        <g key={label}>
                            {series.map((s, j) => (
                                <rect key={s.name} x={gx + j * barW} y={y(s.values[i])} width={barW - 2} height={Math.max(0, H - padB - y(s.values[i]))} rx="3" fill={s.color}>
                                    <title>{`${label} - ${s.name}: ${compactMoney(s.values[i])}`}</title>
                                </rect>
                            ))}
                            <text x={padL + i * band + band / 2} y={H - 10} textAnchor="middle" className="fill-slate-500 dark:fill-slate-400" style={{ fontSize: 10 }}>{label}</text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}

// ------------------------------------------------------------------
// Horizontal stacked bars with a label on the left and a value on the right
// ------------------------------------------------------------------

/** items: [{ key, label, sub?, segments: [{ value, color, label }], right }] */
export function BarList({ items, maxHeightClass = '', normalize = false }) {
    // normalize: every bar is 100% wide and split by its own parts (collected vs balance).
    // default: bar length is relative to the largest item (shares / rankings).
    const max = Math.max(1, ...items.map((i) => i.segments.reduce((t, s) => t + s.value, 0)));
    return (
        <ul className={`space-y-3 ${maxHeightClass}`}>
            {items.map((item) => (
                <li key={item.key}>
                    <div className="flex items-baseline justify-between gap-3 mb-1">
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate" title={item.label}>
                            {item.label}
                            {item.sub && <span className="ml-2 text-xs font-medium text-slate-400">{item.sub}</span>}
                        </span>
                        <span className="text-xs font-bold text-slate-900 dark:text-white tabular-nums whitespace-nowrap">{item.right}</span>
                    </div>
                    <div className="flex h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        {item.segments.map((s) => (
                            <span
                                key={s.label}
                                title={`${s.label}: ${compactMoney(s.value)}`}
                                style={{ width: `${(s.value / (normalize ? Math.max(1, item.segments.reduce((t, x) => t + x.value, 0)) : max)) * 100}%`, background: s.color }}
                            />
                        ))}
                    </div>
                </li>
            ))}
        </ul>
    );
}

/** One full-width bar split into parts, e.g. students paid / partial / unpaid */
export function SplitBar({ parts, ariaLabel }) {
    const total = parts.reduce((t, p) => t + p.value, 0);
    return (
        <div role="img" aria-label={ariaLabel} className="flex h-4 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            {total > 0 && parts.map((p) => (
                <span key={p.label} title={`${p.label}: ${p.value}`} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
            ))}
        </div>
    );
}
