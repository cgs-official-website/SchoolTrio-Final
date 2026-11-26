import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { listInvoices } from '../../../../api/invoices';

export const formatMoney = (v) =>
    `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export const formatDate = (value) => {
    if (!value) return '-';
    const d = new Date(String(value).length === 10 ? `${value}T00:00:00` : value);
    if (Number.isNaN(d.getTime())) return '-';
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
};

/** yyyy-mm-dd (local time) – used to compare against <input type="date"> values. */
export const toDateKey = (value) => {
    if (!value) return '';
    if (typeof value === 'string' && value.length === 10) return value;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const todayKey = () => toDateKey(new Date());

export const daysBetween = (fromKey, toKey) => {
    const a = new Date(`${fromKey}T00:00:00`);
    const b = new Date(`${toKey}T00:00:00`);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
    return Math.max(0, Math.round((b - a) / 86400000));
};

export const byNatural = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });

export const studentName = (s) => (s ? `${s.firstName || ''} ${s.lastName || ''}`.trim() || '-' : 'Unknown Student');
export const classSec = (s) =>
    s?.class?.name ? `${s.class.name}${s.section?.name ? ` - ${s.section.name}` : ''}` : '-';

export const grossAmount = (inv) => Number(inv?.amount || 0);
export const concessionAmount = (inv) => Number(inv?.concessionAmount || 0);
export const netAmount = (inv) =>
    inv?.netAmount !== undefined && inv?.netAmount !== null
        ? Number(inv.netAmount)
        : Math.max(grossAmount(inv) - concessionAmount(inv), 0);
/** What was actually received for a paid invoice (net fee + any late fee). */
export const paidAmount = (inv) =>
    inv?.status === 'Paid' ? netAmount(inv) + Number(inv?.customData?.lateFee || 0) : 0;
export const termName = (inv) => inv?.collectionPeriod?.name || 'No Term';
export const isChequeMode = (mode) => /cheque|dd|demand/i.test(mode || '');

/** Triggers a CSV download. columns: [{ label, value: (row) => any }] */
export function downloadCsv(filename, columns, rows) {
    const esc = (v) => {
        const s = v === null || v === undefined ? '' : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [columns.map((c) => esc(c.label)).join(',')];
    rows.forEach((r) => lines.push(columns.map((c) => esc(c.value(r))).join(',')));
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

/** Opens a print dialog (Save as PDF) with a plain table of the given rows. */
export function printTable(title, headers, bodyRows) {
    const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const html = `<html><head><title>${esc(title)}</title><style>
    body{font-family:Arial,sans-serif;padding:16px;color:#111}h2{margin:0 0 12px}
    table{border-collapse:collapse;width:100%;font-size:11px}
    th,td{border:1px solid #ccc;padding:5px 7px;text-align:left}th{background:#f1f5f9}
  </style></head><body><h2>${esc(title)}</h2><table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
  <tbody>${bodyRows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`;
    const w = window.open('', '_blank');
    if (!w) {
        toast.error('Please allow pop-ups to print.');
        return;
    }
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
}

/** Loads every invoice (all pages) matching the given query. */
export function useAllInvoices(query = {}) {
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(true);
    const key = JSON.stringify(query);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const all = [];
            let page = 1;
            let totalPages = 1;
            do {
                const res = await listInvoices({ ...JSON.parse(key), page, limit: 100 });
                all.push(...(res?.data || []));
                totalPages = res?.pagination?.totalPages || 1;
                page += 1;
            } while (page <= totalPages && page <= 200);
            setInvoices(all);
        } catch (err) {
            toast.error(err?.message || 'Failed to load report data.');
            setInvoices([]);
        } finally {
            setLoading(false);
        }
    }, [key]);

    useEffect(() => {
        load();
    }, [load]);

    return { invoices, loading, reload: load };
}
