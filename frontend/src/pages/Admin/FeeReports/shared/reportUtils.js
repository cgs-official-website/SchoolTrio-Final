import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { listInvoices } from '../../../../api/invoices';

export const formatMoney = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;

export const formatDate = (value) => {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
};

/** yyyy-mm-dd in local time (for <input type="date"> comparisons). */
export const toDateKey = (value) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const todayKey = () => toDateKey(new Date());

export const studentName = (s) => (s ? `${s.firstName || ''} ${s.lastName || ''}`.trim() || '-' : '-');

export const isTransportInvoice = (inv) => /^transport/i.test(inv?.feeName || '');

/** Net payable after active concessions (what the student is billed). */
export const concessionTotal = (inv) =>
    (inv?.concessions || []).reduce((sum, c) => sum + Number(c.amount || 0), 0);

/** Downloads rows as a CSV file. columns: [{ label, value: (row) => any }] */
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
            } while (page <= totalPages && page <= 100);
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
