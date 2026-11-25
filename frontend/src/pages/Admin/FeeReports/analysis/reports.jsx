import React, { useMemo, useState } from 'react';
import { DateField, natural, compareClassNames, unique } from '../transport/transportReportShared';
import {
    rupees, rollup, sumRows, groupBy, pct, isOverdue, todayString, dateKey, monthKey, monthLabel, formatDmy,
    classSectionOf, paymentStatus
} from './analysisData';
import {
    AnalysisReport, ViewToggle, ControlsRow, METRIC_OPTIONS, moneyCol, countCol, statusCol, percentCol, defaultTotals
} from './reportKit';

const byClassThenSection = (a, b) => compareClassNames(a.className, b.className) || natural(a.sectionName, b.sectionName);

// ==================================================================
// CONSOLIDATED
// ==================================================================

/** Fee Category totals. "Category Type" clubs categories of the same type (Normal / Late / Bus ...) together. */
export function CategoryConsolidated({ ctx }) {
    const [mode, setMode] = useState('category');

    const rows = useMemo(() => {
        const key = mode === 'type' ? (r) => r.categoryType || 'Normal' : (r) => r.feeCategory;
        return [...groupBy(ctx.rows, key)]
            .map(([name, list]) => ({ id: name, name, categoryCount: unique(list, (r) => r.feeCategory).length, ...rollup(list) }))
            .sort((a, b) => natural(a.name, b.name));
    }, [ctx.rows, mode]);

    const columns = useMemo(() => [
        { key: 'name', label: mode === 'type' ? 'Category Type' : 'Fee Category', value: (r) => r.name },
        ...(mode === 'type' ? [countCol('cats', 'Categories Clubbed', (r) => r.categoryCount)] : []),
        countCol('students', 'No of Students', (r) => r.students),
        moneyCol('total', 'Total Amount', (r) => r.total),
        moneyCol('concession', 'Concession', (r) => r.concession),
        moneyCol('paid', 'Paid Amount', (r) => r.paid),
        moneyCol('balance', 'Unpaid Amount', (r) => r.balance),
        moneyCol('overdue', 'Over Due', (r) => r.overdue),
        percentCol('pct', 'Collected', (r) => r.collectionPct)
    ], [mode]);

    return (
        <AnalysisReport
            key={mode} ctx={ctx} title="Category Consolidated" fileBase="fee-category-consolidated"
            columns={columns} rows={rows} totals={defaultTotals(ctx.rows)}
            controls={(
                <ControlsRow>
                    <ViewToggle
                        label="Group by" value={mode} onChange={setMode}
                        options={[{ value: 'category', label: 'Fee Category' }, { value: 'type', label: 'Category Type (club)' }]}
                    />
                </ControlsRow>
            )}
        />
    );
}

/** Class totals (reference "Class Wise Consolidated") or Class + Section totals (reference "Class Consolidated"). */
export function ClassConsolidated({ ctx }) {
    const [mode, setMode] = useState('class');

    const rows = useMemo(() => {
        const key = mode === 'section' ? (r) => `${r.className}\u0000${r.sectionName}` : (r) => r.className;
        return [...groupBy(ctx.rows, key)]
            .map(([k, list]) => ({
                id: k,
                className: list[0].className,
                sectionName: mode === 'section' ? list[0].sectionName : '',
                ...rollup(list)
            }))
            .sort(byClassThenSection);
    }, [ctx.rows, mode]);

    const columns = useMemo(() => [
        { key: 'class', label: 'Class Name', value: (r) => r.className, sortValue: (r) => r.className },
        ...(mode === 'section' ? [{ key: 'section', label: 'Section Name', value: (r) => r.sectionName }] : []),
        countCol('students', 'No of Students', (r) => r.students),
        countCol('paidS', 'Paid Students', (r) => r.paidStudents),
        countCol('unpaidS', 'Unpaid Students', (r) => r.unpaidStudents),
        countCol('partialS', 'Partial Students', (r) => r.partialStudents),
        moneyCol('total', 'Total Amount', (r) => r.total),
        moneyCol('paid', 'Paid Amount', (r) => r.paid),
        moneyCol('concession', 'Concession', (r) => r.concession),
        moneyCol('balance', 'Unpaid Amount', (r) => r.balance),
        moneyCol('overdue', 'Over Due', (r) => r.overdue)
    ], [mode]);

    return (
        <AnalysisReport
            key={mode} ctx={ctx} title="Class Consolidated" fileBase="fee-class-consolidated"
            columns={columns} rows={rows} totals={defaultTotals(ctx.rows)}
            controls={(
                <ControlsRow>
                    <ViewToggle
                        label="Show" value={mode} onChange={setMode}
                        options={[{ value: 'class', label: 'Class wise' }, { value: 'section', label: 'Class + Section wise' }]}
                    />
                </ControlsRow>
            )}
        />
    );
}

export function StudentConsolidated({ ctx }) {
    const rows = useMemo(
        () => [...groupBy(ctx.rows, (r) => r.studentId).values()]
            .map((list) => {
                const f = list[0];
                const t = sumRows(list);
                return {
                    id: f.studentId,
                    admissionNumber: f.admissionNumber,
                    studentName: f.studentName,
                    className: f.className,
                    sectionName: f.sectionName,
                    gender: f.gender,
                    mobile: f.fatherPhone || f.motherPhone,
                    studentCategory: f.studentCategory,
                    categories: unique(list, (r) => r.feeCategory).join(', '),
                    ...t,
                    status: paymentStatus(t)
                };
            })
            .sort((a, b) => byClassThenSection(a, b) || natural(a.studentName, b.studentName)),
        [ctx.rows]
    );

    const columns = useMemo(() => [
        { key: 'adm', label: 'Adm No', value: (r) => r.admissionNumber },
        { key: 'name', label: 'Student Name', value: (r) => r.studentName },
        { key: 'class', label: 'Class Name', value: (r) => r.className },
        { key: 'section', label: 'Sec Name', value: (r) => r.sectionName },
        { key: 'mobile', label: 'Mobile No', value: (r) => r.mobile },
        { key: 'gender', label: 'Gender', value: (r) => r.gender, defaultHidden: true },
        { key: 'scat', label: 'Student Category', value: (r) => r.studentCategory },
        { key: 'cats', label: 'Fee Category', value: (r) => r.categories, wrap: true },
        moneyCol('total', 'Amount', (r) => r.total),
        moneyCol('paid', 'Paid Amount', (r) => r.paid),
        moneyCol('concession', 'Concession', (r) => r.concession),
        moneyCol('balance', 'Balance', (r) => r.balance),
        moneyCol('overdue', 'Over Due', (r) => r.overdue, { defaultHidden: true }),
        statusCol('status', 'Status', (r) => r.status)
    ], []);

    return (
        <AnalysisReport
            ctx={ctx} title="Student Consolidated" fileBase="fee-student-consolidated"
            columns={columns} rows={rows} totals={defaultTotals(ctx.rows)}
        />
    );
}

/** For every fee category: how many students have paid, partly paid or not paid. */
export function CollectionStatus({ ctx }) {
    const rows = useMemo(
        () => [...groupBy(ctx.rows, (r) => r.feeCategory)]
            .map(([name, list]) => ({ id: name, name, ...rollup(list) }))
            .sort((a, b) => natural(a.name, b.name)),
        [ctx.rows]
    );

    const columns = useMemo(() => [
        { key: 'name', label: 'Fee Category', value: (r) => r.name },
        countCol('students', 'No of Students', (r) => r.students),
        countCol('paidS', 'Paid Students', (r) => r.paidStudents),
        countCol('partialS', 'Partial Students', (r) => r.partialStudents),
        countCol('unpaidS', 'Unpaid Students', (r) => r.unpaidStudents),
        moneyCol('total', 'Total Amount', (r) => r.total),
        moneyCol('paid', 'Paid Amount', (r) => r.paid),
        moneyCol('balance', 'Balance', (r) => r.balance),
        percentCol('pct', 'Collected', (r) => r.collectionPct)
    ], []);

    return (
        <AnalysisReport
            ctx={ctx} title="Collection Status" fileBase="fee-collection-status"
            columns={columns} rows={rows} totals={defaultTotals(ctx.rows)}
        />
    );
}

// ==================================================================
// CATEGORY WISE
// ==================================================================

/** One row per student per fee category. */
export function StudentCategoryWise({ ctx }) {
    const rows = useMemo(
        () => [...groupBy(ctx.rows, (r) => `${r.studentId}\u0000${r.feeCategory}`)]
            .map(([k, list]) => {
                const f = list[0];
                const t = sumRows(list);
                return {
                    id: k,
                    admissionNumber: f.admissionNumber,
                    studentName: f.studentName,
                    className: f.className,
                    sectionName: f.sectionName,
                    fatherName: f.fatherName,
                    fatherPhone: f.fatherPhone,
                    studentCategory: f.studentCategory,
                    busStop: f.busStop,
                    busRoute: f.busRoute,
                    feeCategory: f.feeCategory,
                    months: unique(list, (r) => monthKey(r.dueDate)).sort().map(monthLabel).join(', '),
                    ...t,
                    status: paymentStatus(t)
                };
            })
            .sort((a, b) => byClassThenSection(a, b) || natural(a.studentName, b.studentName) || natural(a.feeCategory, b.feeCategory)),
        [ctx.rows]
    );

    const columns = useMemo(() => [
        { key: 'adm', label: 'Adm. No.', value: (r) => r.admissionNumber },
        { key: 'name', label: 'Student Name', value: (r) => r.studentName },
        { key: 'class', label: 'Class - Section', value: (r) => classSectionOf(r), sortValue: (r) => classSectionOf(r) },
        { key: 'father', label: 'Father Name', value: (r) => r.fatherName },
        { key: 'fmobile', label: 'Father Mobile', value: (r) => r.fatherPhone },
        { key: 'scat', label: 'Student Category', value: (r) => r.studentCategory },
        { key: 'stop', label: 'Bus Stop', value: (r) => r.busStop, defaultHidden: true },
        { key: 'route', label: 'Bus Route', value: (r) => r.busRoute, defaultHidden: true },
        { key: 'cat', label: 'Fee Category', value: (r) => r.feeCategory },
        { key: 'months', label: 'Fee Months', value: (r) => r.months, wrap: true },
        moneyCol('total', 'Amount', (r) => r.total),
        moneyCol('concession', 'Concession', (r) => r.concession),
        moneyCol('paid', 'Paid Amount', (r) => r.paid),
        moneyCol('balance', 'Balance', (r) => r.balance),
        statusCol('status', 'Status', (r) => r.status)
    ], []);

    return (
        <AnalysisReport
            ctx={ctx} title="Student Category Wise Report" fileBase="fee-student-category-wise"
            columns={columns} rows={rows} totals={defaultTotals(ctx.rows)}
        />
    );
}

/**
 * Grid report: one row per `rowKeyOf`, one column per `colOf` value, cells hold Total / Paid / Balance.
 * Used by Class Wise, Month Wise and Term Wise (student) reports.
 */
function MatrixReport({ ctx, title, fileBase, leadColumns, rowKeyOf, rowFieldsOf, colOf, rowSort }) {
    const [metric, setMetric] = useState('amount');

    const { rows, colDefs } = useMemo(() => {
        const cols = new Map();
        for (const r of ctx.rows) {
            const c = colOf(r);
            if (!cols.has(c.key)) cols.set(c.key, c);
        }
        const colList = [...cols.values()].sort((a, b) => (a.order - b.order) || natural(a.label, b.label));
        const out = [...groupBy(ctx.rows, rowKeyOf)].map(([k, list]) => {
            const cells = {};
            let total = 0;
            for (const r of list) {
                const ck = colOf(r).key;
                cells[ck] = (cells[ck] || 0) + r[metric];
                total += r[metric];
            }
            return { id: k, ...rowFieldsOf(list), cells, rowTotal: total };
        });
        if (rowSort) out.sort(rowSort);
        return { rows: out, colDefs: colList };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ctx.rows, metric]);

    const metricLabel = METRIC_OPTIONS.find((m) => m.value === metric).label;

    const columns = useMemo(() => [
        ...leadColumns,
        ...colDefs.map((c) => moneyCol(`c:${c.key}`, c.label, (r) => Math.round((r.cells[c.key] || 0) * 100) / 100)),
        moneyCol('rowTotal', `Total (${metricLabel})`, (r) => Math.round(r.rowTotal * 100) / 100)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    ], [colDefs, metricLabel]);

    return (
        <AnalysisReport
            key={metric} ctx={ctx} title={title} fileBase={fileBase}
            columns={columns} rows={rows} totals={defaultTotals(ctx.rows)}
            controls={(
                <ControlsRow>
                    <ViewToggle label="Amount shown" value={metric} onChange={setMetric} options={METRIC_OPTIONS} />
                </ControlsRow>
            )}
        />
    );
}

const FEE_CATEGORY_COL = (r) => ({ key: r.feeCategory, label: r.feeCategory, order: 0 });

/** Rows = class, columns = fee categories (reference "Category wise class Report") */
export function ClassWiseCategory({ ctx }) {
    return (
        <MatrixReport
            ctx={ctx} title="Category Wise Class Report" fileBase="fee-category-wise-class"
            leadColumns={[{ key: 'class', label: 'Class Name', value: (r) => r.className }]}
            rowKeyOf={(r) => r.className}
            rowFieldsOf={(list) => ({ className: list[0].className })}
            rowSort={(a, b) => compareClassNames(a.className, b.className)}
            colOf={FEE_CATEGORY_COL}
        />
    );
}

/** Rows = fee category, columns = due month (reference "Month Wise Category Report") */
export function MonthWiseCategory({ ctx }) {
    return (
        <MatrixReport
            ctx={ctx} title="Month Wise Category Report" fileBase="fee-month-wise-category"
            leadColumns={[{ key: 'cat', label: 'Fee Category', value: (r) => r.feeCategory }]}
            rowKeyOf={(r) => r.feeCategory}
            rowFieldsOf={(list) => ({ feeCategory: list[0].feeCategory })}
            rowSort={(a, b) => natural(a.feeCategory, b.feeCategory)}
            colOf={(r) => { const k = monthKey(r.dueDate); return { key: k, label: monthLabel(k), order: Number(k.replace('-', '')) || 0 }; }} // yyyymm keeps months chronological
        />
    );
}

/** Rows = student, columns = fee term (reference "Student Term Wise Category") */
export function TermWiseStudent({ ctx }) {
    return (
        <MatrixReport
            ctx={ctx} title="Student Term Wise Category" fileBase="fee-student-term-wise"
            leadColumns={[
                { key: 'adm', label: 'Adm No', value: (r) => r.admissionNumber },
                { key: 'name', label: 'Student Name', value: (r) => r.studentName },
                { key: 'class', label: 'Class - Section', value: (r) => classSectionOf(r) },
                { key: 'scat', label: 'Student Category', value: (r) => r.studentCategory }
            ]}
            rowKeyOf={(r) => r.studentId}
            rowFieldsOf={(list) => {
                const f = list[0];
                return {
                    admissionNumber: f.admissionNumber, studentName: f.studentName, className: f.className,
                    sectionName: f.sectionName, studentCategory: f.studentCategory
                };
            }}
            rowSort={(a, b) => byClassThenSection(a, b) || natural(a.studentName, b.studentName)}
            colOf={(r) => ({ key: r.term || 'No Term', label: r.term || 'No Term', order: r.term ? (r.termOrder ?? 500) : 999 })}
        />
    );
}

// ==================================================================
// COLLECTION & DEFAULTERS
// ==================================================================

const paidRows = (rows) => rows.filter((r) => r.invoiceStatus === 'Paid' && r.paidAt);

function PaidDateRange({ from, to, onFrom, onTo, onReset }) {
    return (
        <ControlsRow>
            <div className="grid grid-cols-2 gap-3 w-full sm:w-auto sm:min-w-[22rem]">
                <DateField label="Paid From" value={from} onChange={onFrom} />
                <DateField label="Paid To" value={to} onChange={onTo} />
            </div>
            {onReset && (
                <button type="button" onClick={onReset} className="text-xs font-bold text-primary-700 dark:text-primary-400 hover:underline">
                    Reset dates
                </button>
            )}
        </ControlsRow>
    );
}

/** One row per receipt (a receipt can cover several fees). */
export function ReceiptWise({ ctx }) {
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');

    const rows = useMemo(() => {
        const inRange = paidRows(ctx.rows).filter((r) => {
            const d = dateKey(r.paidAt);
            return (!from || d >= from) && (!to || d <= to);
        });
        return [...groupBy(inRange, (r) => r.receiptNo || r.id)]
            .map(([k, list]) => {
                const f = list[0];
                return {
                    id: k,
                    receiptNo: f.receiptNo,
                    paidAt: f.paidAt,
                    admissionNumber: f.admissionNumber,
                    studentName: f.studentName,
                    className: f.className,
                    sectionName: f.sectionName,
                    categories: unique(list, (r) => r.feeCategory).join(', '),
                    payMode: f.payMode,
                    referenceNo: f.referenceNo,
                    amount: Math.round(list.reduce((t, r) => t + r.paid, 0) * 100) / 100
                };
            })
            .sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt)));
    }, [ctx.rows, from, to]);

    const columns = useMemo(() => [
        { key: 'receipt', label: 'Receipt No.', value: (r) => r.receiptNo },
        { key: 'date', label: 'Paid Date', value: (r) => formatDmy(r.paidAt), sortValue: (r) => r.paidAt || '' },
        { key: 'adm', label: 'Adm. No.', value: (r) => r.admissionNumber },
        { key: 'name', label: 'Student Name', value: (r) => r.studentName },
        { key: 'class', label: 'Class - Section', value: (r) => classSectionOf(r), sortValue: (r) => classSectionOf(r) },
        { key: 'cats', label: 'Fee Category', value: (r) => r.categories, wrap: true },
        { key: 'mode', label: 'Pay Mode', value: (r) => r.payMode },
        { key: 'ref', label: 'Ref. No.', value: (r) => r.referenceNo },
        moneyCol('amount', 'Amount', (r) => r.amount)
    ], []);

    const total = rows.reduce((t, r) => t + r.amount, 0);

    return (
        <AnalysisReport
            ctx={ctx} title="Receipt Wise Collection" fileBase="fee-receipt-wise"
            columns={columns} rows={rows}
            totals={[{ label: 'Receipts', value: rows.length }, { label: 'Total Collected', value: rupees(total) }]}
            emptyText="No receipts for the selected filters and dates"
            controls={<PaidDateRange from={from} to={to} onFrom={setFrom} onTo={setTo} onReset={from || to ? () => { setFrom(''); setTo(''); } : undefined} />}
        />
    );
}

/** What was collected on one day (or a date range), split by fee category and pay mode. */
export function SpecificDateCollection({ ctx }) {
    const [from, setFrom] = useState(todayString);
    const [to, setTo] = useState(todayString);

    const paid = useMemo(() => paidRows(ctx.rows).filter((r) => {
        const d = dateKey(r.paidAt);
        return (!from || d >= from) && (!to || d <= to);
    }), [ctx.rows, from, to]);

    const modes = useMemo(() => unique(paid, (r) => r.payMode || 'Other').sort(natural), [paid]);

    const rows = useMemo(
        () => [...groupBy(paid, (r) => r.feeCategory)]
            .map(([name, list]) => {
                const byMode = {};
                for (const r of list) { const m = r.payMode || 'Other'; byMode[m] = (byMode[m] || 0) + r.paid; }
                return {
                    id: name, name,
                    receipts: new Set(list.map((r) => r.receiptNo || r.id)).size,
                    students: new Set(list.map((r) => r.studentId)).size,
                    byMode,
                    total: Math.round(list.reduce((t, r) => t + r.paid, 0) * 100) / 100
                };
            })
            .sort((a, b) => natural(a.name, b.name)),
        [paid]
    );

    const columns = useMemo(() => [
        { key: 'name', label: 'Fee Category', value: (r) => r.name },
        countCol('receipts', 'Receipts', (r) => r.receipts),
        countCol('students', 'Students', (r) => r.students),
        ...modes.map((m) => moneyCol(`m:${m}`, m, (r) => Math.round((r.byMode[m] || 0) * 100) / 100)),
        moneyCol('total', 'Total Collected', (r) => r.total)
    ], [modes]);

    const total = rows.reduce((t, r) => t + r.total, 0);
    const receipts = new Set(paid.map((r) => r.receiptNo || r.id)).size;

    return (
        <AnalysisReport
            ctx={ctx} title="Category Wise Specific Date" fileBase="fee-category-specific-date"
            columns={columns} rows={rows}
            totals={[
                { label: 'Period', value: from && to && from === to ? formatDmy(from) : `${formatDmy(from)} to ${formatDmy(to)}` },
                { label: 'Receipts', value: receipts },
                { label: 'Total Collected', value: rupees(total) }
            ]}
            emptyText="Nothing was collected in the selected period"
            controls={<PaidDateRange from={from} to={to} onFrom={setFrom} onTo={setTo} onReset={() => { setFrom(todayString()); setTo(todayString()); }} />}
        />
    );
}

/** For each due month: what was due, what came in and what is still pending. */
export function MonthWiseCollection({ ctx }) {
    const rows = useMemo(() => {
        const today = todayString();
        return [...groupBy(ctx.rows, (r) => monthKey(r.dueDate))]
            .map(([k, list]) => {
                const t = rollup(list, today);
                const defaulterStudents = [...groupBy(list, (r) => r.studentId).values()]
                    .filter((l) => l.some((r) => isOverdue(r, today))).length;
                return { id: k, month: k, ...t, defaulterStudents };
            })
            .sort((a, b) => a.month.localeCompare(b.month));
    }, [ctx.rows]);

    const columns = useMemo(() => [
        { key: 'month', label: 'Month', value: (r) => monthLabel(r.month), sortValue: (r) => r.month },
        moneyCol('total', 'Total Amount', (r) => r.total),
        moneyCol('concession', 'Concession', (r) => r.concession),
        moneyCol('paid', 'Collected', (r) => r.paid),
        moneyCol('balance', 'Balance', (r) => r.balance),
        moneyCol('overdue', 'Defaulter Amount', (r) => r.overdue),
        countCol('defaulters', 'Defaulter Students', (r) => r.defaulterStudents),
        percentCol('pct', 'Collected', (r) => r.collectionPct)
    ], []);

    return (
        <AnalysisReport
            ctx={ctx} title="Month Wise Collection / Defaulter" fileBase="fee-month-wise-collection"
            columns={columns} rows={rows} totals={defaultTotals(ctx.rows)}
        />
    );
}

const daysBetween = (fromKey, toKey) => {
    const a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fromKey);
    const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(toKey);
    if (!a || !b) return 0;
    return Math.round((Date.UTC(+b[1], +b[2] - 1, +b[3]) - Date.UTC(+a[1], +a[2] - 1, +a[3])) / 86400000);
};

/** Students (per fee category) who still owe money. Default = overdue only. */
export function StudentDefaulters({ ctx }) {
    const [mode, setMode] = useState('overdue');

    const rows = useMemo(() => {
        const today = todayString();
        const pending = ctx.rows.filter((r) => (mode === 'overdue' ? isOverdue(r, today) : r.balance > 0));
        return [...groupBy(pending, (r) => `${r.studentId}\u0000${r.feeCategory}`)]
            .map(([k, list]) => {
                const f = list[0];
                const oldest = list.reduce((m, r) => (r.dueDate < m ? r.dueDate : m), list[0].dueDate);
                return {
                    id: k,
                    admissionNumber: f.admissionNumber,
                    studentName: f.studentName,
                    className: f.className,
                    sectionName: f.sectionName,
                    fatherName: f.fatherName,
                    fatherPhone: f.fatherPhone,
                    motherPhone: f.motherPhone,
                    feeCategory: f.feeCategory,
                    months: unique(list, (r) => monthKey(r.dueDate)).sort().map(monthLabel).join(', '),
                    balance: Math.round(list.reduce((t, r) => t + r.balance, 0) * 100) / 100,
                    oldestDue: oldest,
                    daysOverdue: Math.max(0, daysBetween(oldest, today))
                };
            })
            .sort((a, b) => b.daysOverdue - a.daysOverdue || b.balance - a.balance);
    }, [ctx.rows, mode]);

    const columns = useMemo(() => [
        { key: 'adm', label: 'Adm. No.', value: (r) => r.admissionNumber },
        { key: 'name', label: 'Student Name', value: (r) => r.studentName },
        { key: 'class', label: 'Class - Section', value: (r) => classSectionOf(r), sortValue: (r) => classSectionOf(r) },
        { key: 'father', label: 'Father Name', value: (r) => r.fatherName },
        { key: 'fmobile', label: 'Father Mobile', value: (r) => r.fatherPhone },
        { key: 'mmobile', label: 'Mother Mobile', value: (r) => r.motherPhone, defaultHidden: true },
        { key: 'cat', label: 'Fee Category', value: (r) => r.feeCategory },
        { key: 'months', label: 'Pending Months', value: (r) => r.months, wrap: true },
        { key: 'oldest', label: 'Oldest Due Date', value: (r) => formatDmy(r.oldestDue), sortValue: (r) => r.oldestDue },
        countCol('days', 'Days Overdue', (r) => r.daysOverdue),
        moneyCol('balance', 'Balance', (r) => r.balance)
    ], []);

    const students = new Set(rows.map((r) => r.admissionNumber)).size;
    const total = rows.reduce((t, r) => t + r.balance, 0);

    return (
        <AnalysisReport
            key={mode} ctx={ctx} title="Category Wise Student Defaulters" fileBase="fee-student-defaulters"
            columns={columns} rows={rows}
            totals={[{ label: 'Defaulter Students', value: students }, { label: mode === 'overdue' ? 'Overdue Balance' : 'Pending Balance', value: rupees(total) }]}
            emptyText={mode === 'overdue' ? 'No overdue fees for the selected filters' : 'No pending fees for the selected filters'}
            controls={(
                <ControlsRow>
                    <ViewToggle
                        label="Show" value={mode} onChange={setMode}
                        options={[{ value: 'overdue', label: 'Overdue only' }, { value: 'pending', label: 'All pending' }]}
                    />
                </ControlsRow>
            )}
        />
    );
}
