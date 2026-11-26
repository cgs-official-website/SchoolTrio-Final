import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import { getFeeAnalysisRows } from '../../../../api/feeReports';
import { useLiveDataRefresh } from '../../../../hooks/useLiveDataRefresh';
import { natural, compareClassNames, unique } from '../transport/transportReportShared';

// ------------------------------------------------------------------
// Small helpers
// ------------------------------------------------------------------

export const num = (v) => Number(v || 0);
export const round2 = (n) => Math.round(n * 100) / 100;
export const inr = (v) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
export const rupees = (v) => `₹${inr(v)}`;

/** 1,25,000 -> ₹1.25L, 3,20,00,000 -> ₹3.2Cr (axis labels / KPI cards) */
export const compactMoney = (v) => {
    const n = Number(v || 0);
    const a = Math.abs(n);
    const trim = (x) => String(Math.round(x * 100) / 100);
    if (a >= 1e7) return `₹${trim(n / 1e7)}Cr`;
    if (a >= 1e5) return `₹${trim(n / 1e5)}L`;
    if (a >= 1e3) return `₹${trim(n / 1e3)}K`;
    return `₹${trim(n)}`;
};

export const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

/** local yyyy-mm-dd (invoice due dates are plain yyyy-mm-dd strings, so compare as strings) */
export const todayString = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** ISO timestamp -> local yyyy-mm-dd */
export const dateKey = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-04-10" -> "2026-04" (sortable) */
export const monthKey = (dueDate) => String(dueDate || '').slice(0, 7);
/** "2026-04" -> "Apr 2026" */
export const monthLabel = (key) => {
    const m = /^(\d{4})-(\d{2})$/.exec(key || '');
    return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : key || '-';
};

export const formatDmy = (value) => {
    const k = String(value || '').length > 10 ? dateKey(value) : String(value || '');
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(k);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : '-';
};

export const isOverdue = (r, today = todayString()) => r.balance > 0 && r.dueDate && r.dueDate < today;

export const classSectionOf = (r) => [r.className, r.sectionName].filter(Boolean).join(' - ');

export const PAYMENT_STATUS_LABEL = { Paid: 'Paid', Partial: 'Partial', Unpaid: 'Unpaid' };

/** A student is Paid when nothing is left to pay, Partial when something is paid and something is left, else Unpaid. */
export const paymentStatus = ({ paid, balance }) => (balance <= 0 ? 'Paid' : paid > 0 ? 'Partial' : 'Unpaid');

// ------------------------------------------------------------------
// Aggregation
// ------------------------------------------------------------------

export function groupBy(rows, keyFn) {
    const map = new Map();
    for (const r of rows) {
        const k = keyFn(r);
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(r);
    }
    return map;
}

/** totals of a list of invoice rows */
export function sumRows(rows, today = todayString()) {
    const t = { total: 0, concession: 0, paid: 0, balance: 0, overdue: 0 };
    for (const r of rows) {
        t.total += r.amount;
        t.concession += r.concession;
        t.paid += r.paid;
        t.balance += r.balance;
        if (isOverdue(r, today)) t.overdue += r.balance;
    }
    return {
        total: round2(t.total),
        concession: round2(t.concession),
        paid: round2(t.paid),
        balance: round2(t.balance),
        overdue: round2(t.overdue)
    };
}

/** totals + how many students are paid / partial / unpaid in a list of invoice rows */
export function rollup(rows, today = todayString()) {
    const base = sumRows(rows, today);
    const counts = { Paid: 0, Partial: 0, Unpaid: 0 };
    for (const list of groupBy(rows, (r) => r.studentId).values()) {
        counts[paymentStatus(sumRows(list, today))] += 1;
    }
    const students = counts.Paid + counts.Partial + counts.Unpaid;
    return {
        ...base,
        students,
        paidStudents: counts.Paid,
        partialStudents: counts.Partial,
        unpaidStudents: counts.Unpaid,
        collectionPct: pct(base.paid, base.total - base.concession)
    };
}

// ------------------------------------------------------------------
// Data hook (one fetch shared by every report)
// ------------------------------------------------------------------

export function useFeeAnalysisRows() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const seq = useRef(0);

    const load = useCallback(async () => {
        const mine = ++seq.current;
        setLoading(true);
        try {
            const res = await getFeeAnalysisRows();
            if (mine === seq.current) setRows(Array.isArray(res?.data) ? res.data : []);
        } catch (err) {
            if (mine === seq.current) {
                setRows([]);
                toast.error(err?.message || 'Failed to load fee analysis.');
            }
        } finally {
            if (mine === seq.current) setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);
    useLiveDataRefresh(load, [load], ['fees', 'students', 'invoices', 'concessions']);
    return { rows, loading, reload: load };
}

// ------------------------------------------------------------------
// Shared filters (one set for every report of the Fee Analysis tab)
// ------------------------------------------------------------------

export const DEFAULT_FILTERS = {
    category: '',
    className: '',
    sectionName: '',
    studentCategory: '',
    term: '',
    studentStatus: 'Active',
    from: '', // due date from
    to: '' // due date to
};

export function applyFilters(rows, f) {
    return rows.filter((r) =>
        (!f.category || r.feeCategory === f.category) &&
        (!f.className || r.className === f.className) &&
        (!f.sectionName || r.sectionName === f.sectionName) &&
        (!f.studentCategory || r.studentCategory === f.studentCategory) &&
        (!f.term || r.term === f.term) &&
        (!f.studentStatus || r.studentStatus === f.studentStatus) &&
        (!f.from || r.dueDate >= f.from) &&
        (!f.to || r.dueDate <= f.to)
    );
}

/** Dropdown options come from the full data set so a filter never hides its own choices. */
export function useFilterOptions(allRows, filters) {
    return useMemo(() => ({
        categories: unique(allRows, (r) => r.feeCategory).sort(natural),
        classes: unique(allRows, (r) => r.className).sort(compareClassNames),
        sections: unique(allRows.filter((r) => !filters.className || r.className === filters.className), (r) => r.sectionName).sort(natural),
        studentCategories: unique(allRows, (r) => r.studentCategory).sort(natural),
        terms: unique(allRows, (r) => r.term).sort(natural),
        statuses: unique(allRows, (r) => r.studentStatus).sort(natural)
    }), [allRows, filters.className]);
}

export function countActiveFilters(f) {
    return Object.entries(f).filter(([k, v]) => v && v !== DEFAULT_FILTERS[k]).length + (f.studentStatus === '' ? 1 : 0);
}
