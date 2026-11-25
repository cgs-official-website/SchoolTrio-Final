import React from 'react';
import {
    formatMoney, studentName, classSec, netAmount, concessionAmount, grossAmount, paidAmount,
    termName, byNatural, isChequeMode, daysBetween, todayKey, toDateKey
} from '../shared/reportUtils';

// ---------- small helpers ----------
const sum = (arr, fn) => arr.reduce((s, x) => s + fn(x), 0);
const distinct = (arr, fn) => new Set(arr.map(fn)).size;
const groupBy = (arr, keyFn) => {
    const m = new Map();
    arr.forEach((x) => {
        const k = keyFn(x);
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(x);
    });
    return m;
};
const studentKey = (inv) => inv.student?.id || inv.studentId || 'unassigned';
const classKey = (inv) => inv.student?.class?.id || 'none';
const money = (key, label, extra = {}) => ({ key, label, type: 'money', ...extra });
const text = (key, label, extra = {}) => ({ key, label, ...extra });
const date = (key, label) => ({ key, label, type: 'date' });
const isPaid = (inv) => inv.status === 'Paid';
const isPending = (inv) => inv.status === 'Pending';

/** Term names in display order (collectionPeriod.displayOrder), "No Term" last. */
function termList(invoices) {
    const m = new Map();
    invoices.forEach((i) => {
        const n = termName(i);
        if (!m.has(n)) m.set(n, i.collectionPeriod?.displayOrder ?? 9999);
    });
    return [...m.entries()].sort((a, b) => a[1] - b[1] || byNatural(a[0], b[0])).map(([n]) => n);
}

const categoryList = (invoices) => [...new Set(invoices.map((i) => i.feeName))].sort(byNatural);

const studentIdentity = (list) => {
    const s = list[0].student;
    return { admNo: s?.admissionNumber || '-', name: studentName(s), cls: classSec(s) };
};

const STUDENT_COLS = [text('admNo', 'Adm. No.'), text('name', 'Student Name'), text('cls', 'Class - Sec')];

// ---------- the reports ----------
export const REPORTS = [
    {
        key: 'student-wise',
        label: 'Student Wise Collection',
        filters: ['class', 'section', 'category', 'mode', 'from', 'to', 'search'],
        dateField: 'paidAt', dateLabel: 'Paid From',
        baseFilter: isPaid,
        build: (rows) => {
            const out = [...groupBy(rows, studentKey)].map(([id, list]) => ({
                id, ...studentIdentity(list),
                receipts: distinct(list, (i) => i.receiptNumber || i.id),
                categories: [...new Set(list.map((i) => i.feeName))].join(', '),
                lastPaid: list.map((i) => i.paidAt).sort().pop(),
                amount: sum(list, paidAmount)
            }));
            return {
                columns: [...STUDENT_COLS, text('receipts', 'Receipts', { align: 'right' }), text('categories', 'Fee Categories'),
                { key: 'lastPaid', label: 'Last Paid Date', type: 'date' }, money('amount', 'Amount Paid')],
                rows: out.sort((a, b) => byNatural(a.name, b.name)),
                total: { label: 'Total Amount', value: sum(out, (r) => r.amount) },
                totals: { amount: sum(out, (r) => r.amount), receipts: sum(out, (r) => r.receipts) }
            };
        }
    },
    {
        key: 'category-wise',
        label: 'Category wise Collection',
        filters: ['class', 'section', 'category', 'mode', 'from', 'to', 'search'],
        dateField: 'paidAt', dateLabel: 'Paid From',
        baseFilter: isPaid,
        build: (rows) => {
            const out = [...groupBy(rows, (i) => i.feeName)].map(([id, list]) => ({
                id, category: id, students: distinct(list, studentKey),
                receipts: distinct(list, (i) => i.receiptNumber || i.id),
                lastPaid: list.map((i) => i.paidAt).sort().pop(), amount: sum(list, paidAmount)
            }));
            return {
                columns: [text('category', 'Fee Category'), text('students', 'Students', { align: 'right' }),
                text('receipts', 'Receipts', { align: 'right' }), date('lastPaid', 'Last Paid Date'), money('amount', 'Collected')],
                rows: out.sort((a, b) => byNatural(a.category, b.category)),
                total: { label: 'Total Amount', value: sum(out, (r) => r.amount) },
                totals: { amount: sum(out, (r) => r.amount), receipts: sum(out, (r) => r.receipts) }
            };
        }
    },
    {
        key: 'category-fee-details',
        label: 'Category Wise Fee Details',
        filters: ['class', 'section', 'category', 'term', 'search'],
        build: (rows) => {
            const out = [...groupBy(rows, (i) => i.feeName)].map(([id, list]) => {
                const net = sum(list, netAmount);
                const paid = sum(list, paidAmount);
                return {
                    id, category: id, students: distinct(list, studentKey), gross: sum(list, grossAmount),
                    concession: sum(list, concessionAmount), net, paid, balance: sum(list.filter(isPending), netAmount),
                    pct: net > 0 ? `${Math.round((paid / net) * 100)}%` : '0%'
                };
            });
            const t = (k) => sum(out, (r) => r[k]);
            return {
                columns: [text('category', 'Fee Category'), text('students', 'Students', { align: 'right' }), money('gross', 'Total Fee'),
                money('concession', 'Concession'), money('net', 'Net Fee'), money('paid', 'Collected'),
                money('balance', 'Balance'), text('pct', 'Collection %', { align: 'right' })],
                rows: out.sort((a, b) => byNatural(a.category, b.category)),
                total: { label: 'Total Net Fee', value: t('net') },
                totals: { gross: t('gross'), concession: t('concession'), net: t('net'), paid: t('paid'), balance: t('balance') }
            };
        }
    },
    {
        key: 'invoice',
        label: 'Invoice Report',
        filters: ['class', 'section', 'category', 'term', 'status', 'from', 'to', 'search'],
        dateField: 'dueDate', dateLabel: 'Due From',
        build: (rows) => {
            const out = rows.map((i) => ({
                id: i.id, admNo: i.student?.admissionNumber || '-', name: studentName(i.student), cls: classSec(i.student),
                category: i.feeName, term: termName(i), dueDate: i.dueDate, gross: grossAmount(i), concession: concessionAmount(i),
                net: netAmount(i), status: i.status, receipt: i.receiptNumber || '-', paidAt: i.paidAt
            }));
            return {
                columns: [...STUDENT_COLS, text('category', 'Fee Category'), ...(rows.some((i) => i.collectionPeriod) ? [text('term', 'Term')] : []), date('dueDate', 'Due Date'),
                money('gross', 'Fee'), money('concession', 'Concession'), money('net', 'Net Fee'),
                {
                    key: 'status', label: 'Status',
                    render: (r) => (
                        <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${r.status === 'Paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{r.status}</span>
                    )
                },
                text('receipt', 'Receipt No.'), date('paidAt', 'Paid Date')],
                rows: out.sort((a, b) => byNatural(a.name, b.name)),
                total: { label: 'Total Net Fee', value: sum(out, (r) => r.net) },
                totals: { gross: sum(out, (r) => r.gross), concession: sum(out, (r) => r.concession), net: sum(out, (r) => r.net) }
            };
        }
    },
    {
        key: 'student-term',
        label: 'Student Term Report',
        filters: ['class', 'section', 'category', 'term', 'search'],
        build: (rows) => {
            const terms = termList(rows);
            const out = [...groupBy(rows, studentKey)].map(([id, list]) => {
                const row = { id, ...studentIdentity(list), total: sum(list, netAmount), paid: sum(list, paidAmount) };
                row.balance = row.total - sum(list.filter(isPaid), netAmount);
                terms.forEach((t) => {
                    const tl = list.filter((i) => termName(i) === t);
                    row[`t_${t}`] = { net: sum(tl, netAmount), pending: sum(tl.filter(isPending), netAmount), has: tl.length > 0 };
                });
                return row;
            });
            const termCols = terms.map((t) => ({
                key: `t_${t}`, label: t, type: 'money', get: (r) => r[`t_${t}`].net,
                render: (r) => {
                    const c = r[`t_${t}`];
                    if (!c.has) return <span className="text-slate-300">-</span>;
                    return <span className={c.pending > 0 ? 'text-amber-600 font-semibold' : 'text-emerald-600 font-semibold'}>{formatMoney(c.net)}</span>;
                }
            }));
            const totals = { total: sum(out, (r) => r.total), paid: sum(out, (r) => r.paid), balance: sum(out, (r) => r.balance) };
            terms.forEach((t) => { totals[`t_${t}`] = sum(out, (r) => r[`t_${t}`].net); });
            return {
                columns: [...STUDENT_COLS, ...termCols, money('total', 'Total Fee'), money('paid', 'Paid'), money('balance', 'Balance')],
                rows: out.sort((a, b) => byNatural(a.name, b.name)),
                total: { label: 'Total Fee', value: totals.total }, totals
            };
        }
    },
    {
        key: 'multi-class-category',
        label: 'Multiple ClassWise Category Report',
        filters: ['classes', 'category', 'mode', 'from', 'to'],
        dateField: 'paidAt', dateLabel: 'Paid From',
        baseFilter: isPaid,
        defaults: () => ({ classes: [] }),
        build: (rows) => {
            const cats = categoryList(rows);
            const out = [...groupBy(rows, (i) => i.student?.class?.name || 'Unassigned')].map(([cls, list]) => {
                const row = { id: cls, cls, lastPaid: list.map((i) => i.paidAt).sort().pop(), total: sum(list, paidAmount) };
                cats.forEach((c) => { row[`c_${c}`] = sum(list.filter((i) => i.feeName === c), paidAmount); });
                return row;
            });
            const totals = { total: sum(out, (r) => r.total) };
            cats.forEach((c) => { totals[`c_${c}`] = sum(out, (r) => r[`c_${c}`]); });
            return {
                columns: [text('cls', 'Class'), ...cats.map((c) => money(`c_${c}`, c)), date('lastPaid', 'Last Paid Date'), money('total', 'Total')],
                rows: out.sort((a, b) => byNatural(a.cls, b.cls)),
                total: { label: 'Total Amount', value: totals.total }, totals
            };
        }
    },
    {
        key: 'cheque-dd-report',
        label: 'Cheque/DD Report',
        filters: ['class', 'section', 'category', 'from', 'to', 'search'],
        dateField: 'paidAt', dateLabel: 'Paid From',
        baseFilter: (i) => isPaid(i) && isChequeMode(i.paymentMode),
        build: (rows) => {
            const out = rows.map((i) => ({
                id: i.id, paidAt: i.paidAt, receipt: i.receiptNumber || '-', admNo: i.student?.admissionNumber || '-',
                name: studentName(i.student), cls: classSec(i.student), category: i.feeName,
                ref: i.transactionReference || '-', mode: i.paymentMode, amount: paidAmount(i)
            }));
            return {
                columns: [date('paidAt', 'Paid Date'), text('receipt', 'Receipt No.'), ...STUDENT_COLS, text('category', 'Fee Category'),
                text('ref', 'Cheque/DD No.'), text('mode', 'Mode'), money('amount', 'Amount')],
                rows: out.sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt))),
                total: { label: 'Total Amount', value: sum(out, (r) => r.amount) },
                totals: { amount: sum(out, (r) => r.amount) }
            };
        }
    },
    {
        key: 'class-installment',
        label: 'Class Installment Report',
        filters: ['classes', 'category', 'term'],
        defaults: () => ({ classes: [] }),
        build: (rows) => {
            const terms = termList(rows);
            const out = [...groupBy(rows, (i) => i.student?.class?.name || 'Unassigned')].map(([cls, list]) => {
                const row = { id: cls, cls, net: sum(list, netAmount), paid: sum(list, paidAmount) };
                row.balance = row.net - sum(list.filter(isPaid), netAmount);
                terms.forEach((t) => {
                    const tl = list.filter((i) => termName(i) === t);
                    row[`t_${t}`] = { net: sum(tl, netAmount), paid: sum(tl.filter(isPaid), netAmount) };
                });
                return row;
            });
            const termCols = terms.map((t) => ({
                key: `t_${t}`, label: t, type: 'money', get: (r) => r[`t_${t}`].net,
                render: (r) => {
                    const c = r[`t_${t}`];
                    return <span>{formatMoney(c.paid)} <span className="text-slate-400">/ {formatMoney(c.net)}</span></span>;
                }
            }));
            const totals = { net: sum(out, (r) => r.net), paid: sum(out, (r) => r.paid), balance: sum(out, (r) => r.balance) };
            return {
                columns: [text('cls', 'Class'), ...termCols, money('net', 'Total Fee'), money('paid', 'Collected'), money('balance', 'Balance')],
                rows: out.sort((a, b) => byNatural(a.cls, b.cls)),
                total: { label: 'Total Collected', value: totals.paid }, totals
            };
        }
    },
    {
        key: 'receipt-wise',
        label: 'Receipt Wise Category Collection',
        filters: ['class', 'section', 'category', 'mode', 'from', 'to', 'search'],
        dateField: 'paidAt', dateLabel: 'Paid From',
        baseFilter: isPaid,
        build: (rows) => {
            const cats = categoryList(rows);
            const out = [...groupBy(rows, (i) => i.receiptNumber || i.id)].map(([id, list]) => {
                const first = list[0];
                const row = {
                    id, receipt: first.receiptNumber || '-', paidAt: first.paidAt, ...studentIdentity(list),
                    mode: first.paymentMode || '-', total: sum(list, paidAmount)
                };
                cats.forEach((c) => { row[`c_${c}`] = sum(list.filter((i) => i.feeName === c), paidAmount); });
                return row;
            });
            const totals = { total: sum(out, (r) => r.total) };
            cats.forEach((c) => { totals[`c_${c}`] = sum(out, (r) => r[`c_${c}`]); });
            return {
                columns: [text('receipt', 'Receipt No.'), date('paidAt', 'Paid Date'), ...STUDENT_COLS, text('mode', 'Pay Mode'),
                ...cats.map((c) => money(`c_${c}`, c)), money('total', 'Total')],
                rows: out.sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt))),
                total: { label: 'Total Amount', value: totals.total }, totals
            };
        }
    },
    {
        key: 'defaulters',
        label: 'Student Defaulters',
        filters: ['class', 'section', 'category', 'term', 'asOn', 'search'],
        defaults: () => ({ asOn: todayKey() }),
        baseFilter: (i, f) => isPending(i) && i.dueDate && i.dueDate < (f.asOn || todayKey()),
        build: (rows, f) => {
            const asOn = f.asOn || todayKey();
            const out = [...groupBy(rows, studentKey)].map(([id, list]) => {
                const oldest = list.map((i) => i.dueDate).sort()[0];
                return {
                    id, ...studentIdentity(list), count: list.length,
                    categories: [...new Set(list.map((i) => i.feeName))].join(', '),
                    oldest, days: daysBetween(oldest, asOn), amount: sum(list, netAmount)
                };
            });
            return {
                columns: [...STUDENT_COLS, text('count', 'Pending Fees', { align: 'right' }), text('categories', 'Fee Categories'),
                date('oldest', 'Oldest Due Date'), text('days', 'Days Overdue', { align: 'right' }), money('amount', 'Due Amount')],
                rows: out.sort((a, b) => b.amount - a.amount),
                total: { label: 'Total Due', value: sum(out, (r) => r.amount) },
                totals: { amount: sum(out, (r) => r.amount), count: sum(out, (r) => r.count) }
            };
        }
    },
    {
        key: 'cheque-dd-collection',
        label: 'Cheque/DD Collection',
        filters: ['class', 'section', 'from', 'to'],
        dateField: 'paidAt', dateLabel: 'Paid From',
        baseFilter: (i) => isPaid(i) && isChequeMode(i.paymentMode),
        build: (rows) => {
            const out = [...groupBy(rows, (i) => toDateKey(i.paidAt))].map(([d, list]) => ({
                id: d, paidAt: d, cheques: distinct(list, (i) => i.receiptNumber || i.id),
                students: distinct(list, studentKey), amount: sum(list, paidAmount)
            }));
            return {
                columns: [date('paidAt', 'Paid Date'), text('cheques', 'Cheque/DD Count', { align: 'right' }),
                text('students', 'Students', { align: 'right' }), money('amount', 'Amount')],
                rows: out.sort((a, b) => b.paidAt.localeCompare(a.paidAt)),
                total: { label: 'Total Amount', value: sum(out, (r) => r.amount) },
                totals: { amount: sum(out, (r) => r.amount), cheques: sum(out, (r) => r.cheques) }
            };
        }
    }
];
