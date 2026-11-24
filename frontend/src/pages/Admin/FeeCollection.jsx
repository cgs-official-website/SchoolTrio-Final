import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { listClasses } from '../../api/classes';
import { listStudents, getStudent, updateStudent } from '../../api/students';
import { getStudentInvoices, payInvoice } from '../../api/invoices';
import { getRoute, getBusStop } from '../../api/transport';
import { getSchoolSettings } from '../../api/settings';
import usePermissions from '../../hooks/usePermissions';
import { useLiveDataRefresh } from '../../hooks/useLiveDataRefresh';
import { notifyDataChanged } from '../../utils/liveData';
import { sortClassesAscending, sortSectionsAscending } from '../../utils/classSorting';
import {
    LuSearch as Search,
    LuUser as UserIcon,
    LuBus as Bus,
    LuReceipt as Receipt,
    LuHistory as History,
    LuPrinter as Printer,
    LuIndianRupee as Rupee,
    LuTriangleAlert as AlertTriangle,
    LuLoader as Loader,
    LuMousePointerClick as Pointer
} from 'react-icons/lu';
import toast from 'react-hot-toast';

/**
 * Payment modes accepted by POST /api/v1/invoices/:id/pay (see invoice.schemas.js).
 * Keep in sync with that enum. "Cash" needs no reference number; every other mode may carry one.
 */
const PAYMENT_MODES = ['Cash', 'Cheque', 'UPI', 'Card', 'Bank Transfer'];

/** Student categories offered in the dropdown. The chosen value is saved on the student (customData.studentCategory). */
const STUDENT_CATEGORIES = ['Regular', 'Existing Student', 'New Student', 'Old Student'];
const DEFAULT_STUDENT_CATEGORY = STUDENT_CATEGORIES[0];

const parseAmount = (text) => {
    const n = Number(String(text).replace(/[₹,\s]/g, ''));
    return Number.isFinite(n) ? n : NaN;
};

const formatMoney = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const todayString = () => {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
};

const formatDate = (value) => {
    if (!value) return '—';
    const d = new Date(value.length === 10 ? `${value}T00:00:00` : value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const monthLabel = (key) => {
    const [y, m] = key.split('-').map(Number);
    const name = new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'short' });
    return `${name} ${y}`;
};

const studentFullName = (s) => [s?.firstName, s?.lastName].filter(Boolean).join(' ').trim();
const studentFather = (s) => {
    const cd = s?.customData && typeof s.customData === 'object' ? s.customData : {};
    return s?.fatherName || cd.fatherName || s?.parentName || cd.parentName || '';
};
const studentPhone = (s) => {
    const cd = s?.customData && typeof s.customData === 'object' ? s.customData : {};
    return s?.parentPhone || cd.parentPhone || cd.fatherPhone || cd.guardianPhone || s?.guardianPhone || '';
};
const classSectionLabel = (s) => [s?.class?.name, s?.section?.name].filter(Boolean).join(' - ');

const escapeHtml = (v) =>
    String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const invoiceLateFee = (inv) => {
    const cd = inv?.customData && typeof inv.customData === 'object' ? inv.customData : {};
    const v = Number(cd.lateFee);
    return Number.isFinite(v) && v > 0 ? v : 0;
};

/** Concession given on a fee (comes from the API; 0 when none). */
const concessionOf = (inv) => {
    const v = Number(inv?.concessionAmount);
    return Number.isFinite(v) && v > 0 ? v : 0;
};
/** What the parent actually pays for a fee: the fee minus its concession. */
const netOf = (inv) => {
    const v = Number(inv?.netAmount);
    return Number.isFinite(v) ? v : Number(inv?.amount || 0) - concessionOf(inv);
};
const concessionLabel = (inv) => {
    const names = Array.from(new Set((inv?.concessions || []).map((c) => c.category).filter(Boolean)));
    return names.join(', ');
};

function buildReceiptHtml({ schoolName, student, receiptNumber, paidAt, mode, reference, items }) {
    const grossTotal = items.reduce((sum, i) => sum + Number(i.amount || 0), 0);
    const concessionTotal = items.reduce((sum, i) => sum + concessionOf(i), 0);
    const hasConcession = concessionTotal > 0;
    const feesTotal = grossTotal - concessionTotal;
    const lateFeeTotal = items.reduce((sum, i) => sum + invoiceLateFee(i), 0);
    const total = feesTotal + lateFeeTotal;
    // The Concession column only appears when at least one fee on this receipt has a concession.
    const span = hasConcession ? 4 : 2;
    const lateRow = lateFeeTotal > 0
        ? `<tr><td colspan="${span}">Late fee (penalty)</td><td class="r">${escapeHtml(formatMoney(lateFeeTotal))}</td></tr>`
        : '';
    const rows = items
        .map((i) => {
            const c = concessionOf(i);
            const concessionCells = hasConcession
                ? `<td class="r">${c > 0 ? `- ${escapeHtml(formatMoney(c))}` : '—'}</td><td class="r">${escapeHtml(formatMoney(netOf(i)))}</td>`
                : '';
            return `<tr><td>${escapeHtml(i.feeName)}</td><td>${escapeHtml(formatDate(i.dueDate))}</td><td class="r">${escapeHtml(formatMoney(i.amount))}</td>${concessionCells}</tr>`;
        })
        .join('');
    const head = hasConcession
        ? '<th>Fee</th><th>Due date</th><th class="r">Fee amount</th><th class="r">Concession</th><th class="r">Net amount</th>'
        : '<th>Fee</th><th>Due date</th><th class="r">Amount</th>';
    return `<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${escapeHtml(receiptNumber || '')}</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:32px}
h1{font-size:20px;margin:0}h2{font-size:14px;margin:4px 0 0;font-weight:normal;color:#555}
.meta{display:flex;justify-content:space-between;margin:20px 0;font-size:13px;gap:24px}
.meta div{line-height:1.7}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{border:1px solid #bbb;padding:8px;text-align:left}th{background:#f2f2f2}
.r{text-align:right}.total td{font-weight:bold;background:#fafafa}
.foot{margin-top:48px;display:flex;justify-content:space-between;font-size:12px;color:#555}
@media print{body{margin:16px}}
</style></head><body>
<h1>${escapeHtml(schoolName || '')}</h1><h2>Fee Receipt</h2>
<div class="meta">
<div><b>Student:</b> ${escapeHtml(studentFullName(student))}<br><b>Adm No:</b> ${escapeHtml(student.admissionNumber)}<br><b>Class &amp; Sec:</b> ${escapeHtml(classSectionLabel(student))}<br><b>Father:</b> ${escapeHtml(studentFather(student) || '—')}</div>
<div><b>Receipt No:</b> ${escapeHtml(receiptNumber || '—')}<br><b>Date:</b> ${escapeHtml(formatDate(paidAt))}<br><b>Mode:</b> ${escapeHtml(mode || '—')}</div>
</div>
<table><thead><tr>${head}</tr></thead><tbody>${rows}
${lateRow}<tr class="total"><td colspan="${span}">Total paid</td><td class="r">${escapeHtml(formatMoney(total))}</td></tr></tbody></table>
<div class="foot"><span>Received by: ____________</span><span>Authorised signature</span></div>
<script>window.onload=function(){window.focus();window.print();}</script>
</body></html>`;
}

export default function FeeCollection() {
    const { userProfile } = useAuth();
    const { canEdit } = usePermissions();
    const role = userProfile?.role?.toLowerCase();
    const hasEditPermission = role === 'admin' || role === 'superadmin' || canEdit('fees');

    // ----- selectors -----
    const [classes, setClasses] = useState([]);
    const [classesLoading, setClassesLoading] = useState(true);
    const [classId, setClassId] = useState('');
    const [sectionId, setSectionId] = useState('');
    const [query, setQuery] = useState('');
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [roster, setRoster] = useState({ key: '', students: [] });
    const [rosterLoading, setRosterLoading] = useState(false);
    const [highlight, setHighlight] = useState(0);

    // ----- selected student data -----
    const [student, setStudent] = useState(null);
    const [invoices, setInvoices] = useState([]);
    const [invoicesLoading, setInvoicesLoading] = useState(false);
    const [transport, setTransport] = useState(null); // { routeName, stopName } | null
    const [schoolName, setSchoolName] = useState('');

    // ----- payment form -----
    const [tab, setTab] = useState('ledger'); // 'ledger' | 'history'
    const [selectedIds, setSelectedIds] = useState(() => new Set());
    const [payDate, setPayDate] = useState(todayString());
    const [mode, setMode] = useState('Cash');
    const [reference, setReference] = useState('');
    const [lateFeeText, setLateFeeText] = useState('');
    const [paying, setPaying] = useState(false);
    // null = amount follows the fees ticked in the ledger; a string = the clerk typed an amount
    const [amountText, setAmountText] = useState(null);
    const [category, setCategory] = useState(DEFAULT_STUDENT_CATEGORY);
    const [categorySaving, setCategorySaving] = useState(false);

    const mountedRef = useRef(true);
    const rosterReqRef = useRef(0);
    const comboRef = useRef(null);
    const inputRef = useRef(null);
    const modeRef = useRef(null);

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    // ============================================================
    // Classes (sections come with each class)
    // ============================================================
    const fetchClasses = useCallback(async () => {
        try {
            const res = await listClasses({ limit: 100 });
            if (!mountedRef.current) return;
            const raw = Array.isArray(res?.data) ? res.data : [];
            setClasses(sortClassesAscending(raw));
        } catch (err) {
            if (mountedRef.current) toast.error(err.message || 'Failed to load classes.');
        } finally {
            if (mountedRef.current) setClassesLoading(false);
        }
    }, []);

    useEffect(() => { fetchClasses(); }, [fetchClasses]);
    useLiveDataRefresh(fetchClasses, [fetchClasses], ['classes']);

    useEffect(() => {
        getSchoolSettings()
            .then((res) => {
                const d = res?.data || res;
                if (mountedRef.current) setSchoolName(d?.name || d?.schoolName || '');
            })
            .catch(() => { });
    }, []);

    const selectedClass = useMemo(() => classes.find((c) => c.id === classId) || null, [classes, classId]);
    const sections = useMemo(() => sortSectionsAscending(selectedClass?.sections || []), [selectedClass]);
    const classHasSections = sections.length > 0;
    const classReady = Boolean(classId) && (!classHasSections || Boolean(sectionId));
    // No class chosen -> search the whole school; class chosen -> search inside that class/section
    const globalMode = !classId;
    const canSearchStudents = globalMode || classReady;

    // ============================================================
    // Student roster: loaded once per class + section, searched locally while typing
    // ============================================================
    const rosterKey = classReady ? `${classId}|${sectionId}` : '';

    const fetchRoster = useCallback(async (key, silent = false) => {
        if (!key) return;
        const [cId, sId] = key.split('|');
        const reqId = ++rosterReqRef.current;
        if (!silent) setRosterLoading(true);
        try {
            const res = await listStudents({
                classId: cId,
                sectionId: sId || undefined,
                status: 'Active',
                limit: 1000,
                sort: 'firstName',
                order: 'asc'
            });
            if (!mountedRef.current || reqId !== rosterReqRef.current) return;
            setRoster({ key, students: Array.isArray(res?.data) ? res.data : [] });
        } catch (err) {
            if (mountedRef.current && reqId === rosterReqRef.current) {
                setRoster({ key, students: [] });
                toast.error(err.message || 'Failed to load students.');
            }
        } finally {
            if (mountedRef.current && reqId === rosterReqRef.current) setRosterLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!rosterKey) {
            rosterReqRef.current += 1;
            setRoster({ key: '', students: [] });
            setRosterLoading(false);
            return;
        }
        fetchRoster(rosterKey);
    }, [rosterKey, fetchRoster]);
    useLiveDataRefresh(() => { if (rosterKey) fetchRoster(rosterKey, true); }, [rosterKey, fetchRoster], ['students']);

    // ----- school-wide search (used while no class is selected): debounced, server-side, small page -----
    const [globalState, setGlobalState] = useState({ q: '', students: [], loading: false });
    const globalReqRef = useRef(0);
    const globalQuery = globalMode ? query.trim() : '';
    useEffect(() => {
        if (!globalMode) {
            globalReqRef.current += 1;
            setGlobalState({ q: '', students: [], loading: false });
            return undefined;
        }
        const reqId = ++globalReqRef.current;
        setGlobalState((g) => ({ ...g, loading: true }));
        const t = setTimeout(async () => {
            try {
                const res = await listStudents({ search: globalQuery || undefined, status: 'Active', limit: 50, sort: 'firstName', order: 'asc' });
                if (!mountedRef.current || reqId !== globalReqRef.current) return;
                const list = Array.isArray(res?.data) ? res.data : [];
                const ql = globalQuery.toLowerCase();
                // names / admission numbers that START with the typed letters come first, then the rest
                const rank = (st) => {
                    if (!ql) return 0;
                    const n = studentFullName(st).toLowerCase();
                    const adm = String(st.admissionNumber || '').toLowerCase();
                    if (n.startsWith(ql) || (st.firstName || '').toLowerCase().startsWith(ql) || adm.startsWith(ql)) return 0;
                    return 1;
                };
                setGlobalState({ q: globalQuery, students: [...list].sort((a, b) => rank(a) - rank(b)), loading: false });
            } catch (err) {
                if (!mountedRef.current || reqId !== globalReqRef.current) return;
                setGlobalState({ q: globalQuery, students: [], loading: false });
                toast.error(err.message || 'Student search failed.');
            }
        }, 300);
        return () => clearTimeout(t);
    }, [globalMode, globalQuery]);

    const results = useMemo(() => {
        if (globalMode) return globalState.q === globalQuery ? globalState.students : [];
        if (roster.key !== rosterKey) return [];
        const q = query.trim().toLowerCase();
        if (!q) return roster.students.slice(0, 50);
        return roster.students
            .filter((s) => {
                const hay = [studentFullName(s), s.admissionNumber, s.rollNumber, studentFather(s), studentPhone(s)]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();
                return hay.includes(q);
            })
            .slice(0, 50);
    }, [globalMode, globalState, globalQuery, roster, rosterKey, query]);
    const resultsLoading = globalMode ? globalState.loading : (rosterLoading || roster.key !== rosterKey);

    useEffect(() => { setHighlight(0); }, [query, rosterKey, globalMode]);

    // close the dropdown on outside click
    useEffect(() => {
        const onDown = (e) => {
            if (comboRef.current && !comboRef.current.contains(e.target)) setDropdownOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, []);

    // ============================================================
    // Student fee data
    // ============================================================
    const fetchInvoices = useCallback(async (target, silent = false) => {
        if (!target?.id) return;
        if (!silent) setInvoicesLoading(true);
        try {
            const all = [];
            let page = 1;
            let hasNext = true;
            while (hasNext && page <= 10) {
                const res = await getStudentInvoices(target.id, { limit: 100, page });
                all.push(...(Array.isArray(res?.data) ? res.data : []));
                hasNext = Boolean(res?.pagination?.hasNextPage);
                page += 1;
            }
            if (!mountedRef.current) return;
            setInvoices(all);
        } catch (err) {
            if (mountedRef.current) {
                setInvoices([]);
                toast.error(err.message || 'Failed to load fee details.');
            }
        } finally {
            if (mountedRef.current && !silent) setInvoicesLoading(false);
        }
    }, []);

    const fetchTransport = useCallback(async (target) => {
        setTransport(null);
        if (!target?.transportRouteId && !target?.busStopId) return;
        try {
            // New mappings store a bus stop (busStopId); old ones store a route stop (pickupStopId).
            const [routeRes, stopRes] = await Promise.all([
                target.transportRouteId ? getRoute(target.transportRouteId).catch(() => null) : null,
                target.busStopId ? getBusStop(target.busStopId).catch(() => null) : null
            ]);
            if (!mountedRef.current) return;
            const route = routeRes?.data;
            const oldStop = (route?.stops || []).find((s) => s.id === target.pickupStopId);
            setTransport({
                routeName: route?.name || route?.routeNumber || '',
                stopName: stopRes?.data?.stopName || oldStop?.stopName || ''
            });
        } catch {
            // Roles without transport access simply do not see the bus box details.
            if (mountedRef.current) setTransport({ routeName: '', stopName: '' });
        }
    }, []);

    useEffect(() => {
        setSelectedIds(new Set());
        setTab('ledger');
        setReference('');
        setMode('Cash');
        setAmountText(null);
        setPayDate(todayString());
        setCategory(student?.customData?.studentCategory || DEFAULT_STUDENT_CATEGORY);
        if (student) {
            fetchInvoices(student);
            fetchTransport(student);
        } else {
            setInvoices([]);
            setTransport(null);
        }
    }, [student, fetchInvoices, fetchTransport]);

    useLiveDataRefresh(() => { if (student) fetchInvoices(student, true); }, [student, fetchInvoices], ['fees', 'invoices']);

    // ============================================================
    // Ledger derivation (everything comes from the invoices)
    // ============================================================
    const ledger = useMemo(() => {
        const active = invoices.filter((i) => i.status !== 'Cancelled');
        const monthKeys = Array.from(new Set(active.map((i) => String(i.dueDate || '').slice(0, 7)).filter(Boolean))).sort();

        const firstDue = new Map();
        active.forEach((i) => {
            const cur = firstDue.get(i.feeName);
            if (!cur || i.dueDate < cur) firstDue.set(i.feeName, i.dueDate);
        });
        const feeNames = Array.from(firstDue.keys()).sort((a, b) => (firstDue.get(a) || '').localeCompare(firstDue.get(b) || '') || a.localeCompare(b));

        const cells = new Map();
        active.forEach((i) => {
            const key = `${i.feeName}|${String(i.dueDate).slice(0, 7)}`;
            if (!cells.has(key)) cells.set(key, []);
            cells.get(key).push(i);
        });

        // Unpaid balance of earlier months carries forward into the next month's balance.
        let carried = 0;
        const perMonth = monthKeys.map((mk) => {
            const inMonth = active.filter((i) => String(i.dueDate).slice(0, 7) === mk);
            // Totals are after concession: what the student really has to pay
            const total = inMonth.reduce((s, i) => s + netOf(i), 0);
            const concession = inMonth.reduce((s, i) => s + concessionOf(i), 0);
            const paid = inMonth.filter((i) => i.status === 'Paid').reduce((s, i) => s + netOf(i), 0);
            const previousDue = carried;
            const balance = previousDue + total - paid;
            carried = balance;
            return { key: mk, total, concession, paid, previousDue, balance, pending: inMonth.filter((i) => i.status === 'Pending') };
        });

        const pending = active.filter((i) => i.status === 'Pending');
        const concession = active.reduce((s, i) => s + concessionOf(i), 0);
        const total = active.reduce((s, i) => s + netOf(i), 0);
        const paid = active.filter((i) => i.status === 'Paid').reduce((s, i) => s + netOf(i), 0);
        // per fee row (the separate Concession column in the ledger)
        const feeConcession = new Map();
        active.forEach((i) => feeConcession.set(i.feeName, (feeConcession.get(i.feeName) || 0) + concessionOf(i)));
        const nextDue = pending.length ? pending.map((i) => i.dueDate).sort()[0] : null;

        return { active, monthKeys, feeNames, cells, perMonth, pending, total, paid, concession, feeConcession, balance: total - paid, nextDue };
    }, [invoices]);

    const todayStr = todayString();
    // The Concession column shows only when this student has a concession on any fee
    const showConcessionColumn = ledger.concession > 0;
    const selectedInvoices = useMemo(
        () => ledger.pending.filter((i) => selectedIds.has(i.id)).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate))),
        [ledger.pending, selectedIds]
    );
    const selectedTotal = selectedInvoices.reduce((s, i) => s + netOf(i), 0);
    const selectedConcession = selectedInvoices.reduce((s, i) => s + concessionOf(i), 0);

    // Late fee (penalty): optional, only offered when a selected fee is past its due date.
    const hasOverdueSelected = selectedInvoices.some((i) => String(i.dueDate).slice(0, 10) < payDate);
    const lateFeeParsed = parseAmount(lateFeeText);
    const lateFeeValue = hasOverdueSelected && Number.isFinite(lateFeeParsed) && lateFeeParsed > 0 ? lateFeeParsed : 0;
    const lateFeeInvalid = lateFeeText.trim() !== '' && (!Number.isFinite(lateFeeParsed) || lateFeeParsed < 0);
    const payableTotal = selectedTotal + lateFeeValue;

    // Pending fees in the order they should be cleared: oldest due date first.
    const payableOrder = useMemo(
        () => [...ledger.pending].sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)) || String(a.feeName).localeCompare(String(b.feeName))),
        [ledger.pending]
    );

    // What the typed amount means in terms of whole fees (the server settles one whole fee at a time).
    const amountCheck = useMemo(() => {
        if (amountText === null) return { ok: selectedInvoices.length > 0, message: '' };
        const typed = parseAmount(amountText);
        if (!Number.isFinite(typed) || typed <= 0) return { ok: false, message: 'Enter a valid amount.' };
        const value = typed - lateFeeValue; // the late fee is on top of the fees themselves
        if (value === selectedTotal && selectedInvoices.length > 0) return { ok: true, message: '' };
        const smallest = payableOrder[0];
        if (!smallest) return { ok: false, message: 'There are no pending fees to collect.' };
        if (selectedInvoices.length === 0) {
            return { ok: false, message: `Amount is less than the oldest pending fee (${smallest.feeName}, ${formatMoney(netOf(smallest))}). Partial payments are not supported yet.` };
        }
        const nextInv = payableOrder[selectedInvoices.length];
        const upper = nextInv ? ` or ${formatMoney(selectedTotal + netOf(nextInv))} (${selectedInvoices.length + 1} fees)` : '';
        return { ok: false, message: `${formatMoney(value)} does not match whole fees. Collect ${formatMoney(selectedTotal)} (${selectedInvoices.length} fee${selectedInvoices.length === 1 ? '' : 's'})${upper}.` };
    }, [amountText, selectedInvoices, selectedTotal, payableOrder, lateFeeValue]);

    const history = useMemo(() => {
        const paid = invoices
            .filter((i) => i.status === 'Paid')
            .sort((a, b) => String(b.paidAt || '').localeCompare(String(a.paidAt || '')));
        const groups = [];
        const byReceipt = new Map();
        paid.forEach((i) => {
            if (!i.receiptNumber) {
                groups.push({ key: i.id, receiptNumber: '', paidAt: i.paidAt, mode: i.paymentMode, reference: i.transactionReference, items: [i] });
                return;
            }
            if (!byReceipt.has(i.receiptNumber)) {
                const g = { key: i.receiptNumber, receiptNumber: i.receiptNumber, paidAt: i.paidAt, mode: i.paymentMode, reference: i.transactionReference, items: [] };
                byReceipt.set(i.receiptNumber, g);
                groups.push(g);
            }
            byReceipt.get(i.receiptNumber).items.push(i);
        });
        return groups;
    }, [invoices]);

    // ============================================================
    // Handlers
    // ============================================================
    const toggleInvoice = (inv) => {
        setAmountText(null);
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(inv.id)) next.delete(inv.id); else next.add(inv.id);
            return next;
        });
    };

    const toggleMonth = (pendingInMonth) => {
        if (pendingInMonth.length === 0) return;
        setAmountText(null);
        setSelectedIds((prev) => {
            const next = new Set(prev);
            const allOn = pendingInMonth.every((i) => next.has(i.id));
            pendingInMonth.forEach((i) => (allOn ? next.delete(i.id) : next.add(i.id)));
            return next;
        });
    };

    const selectOverdue = () => { setAmountText(null); setSelectedIds(new Set(ledger.pending.filter((i) => i.dueDate < todayStr).map((i) => i.id))); };
    const selectAllPending = () => { setAmountText(null); setSelectedIds(new Set(ledger.pending.map((i) => i.id))); };
    const clearSelection = () => { setAmountText(null); setSelectedIds(new Set()); };

    const handleAmountChange = (text) => {
        const cleaned = text.replace(/[^0-9.,]/g, '');
        if (cleaned === '') {
            setAmountText(null);
            setSelectedIds(new Set());
            return;
        }
        setAmountText(cleaned);
        const value = parseAmount(cleaned) - lateFeeValue;
        const ids = new Set();
        if (Number.isFinite(value)) {
            let running = 0;
            for (const inv of payableOrder) {
                const next = running + netOf(inv);
                if (next > value) break;
                running = next;
                ids.add(inv.id);
            }
        }
        setSelectedIds(ids);
    };

    const handleCategoryChange = async (next) => {
        if (!student || next === category) return;
        const previous = category;
        setCategory(next);
        setCategorySaving(true);
        try {
            const fresh = await getStudent(student.id);
            const current = fresh?.data?.customData && typeof fresh.data.customData === 'object' ? fresh.data.customData : {};
            await updateStudent(student.id, { customData: { ...current, studentCategory: next } });
            if (!mountedRef.current) return;
            toast.success(`Student category set to ${next}`);
        } catch (err) {
            if (mountedRef.current) {
                setCategory(previous);
                toast.error(err?.message || 'Could not save the student category.');
            }
        } finally {
            if (mountedRef.current) setCategorySaving(false);
        }
    };

    const handleClassChange = (value) => {
        setClassId(value);
        setSectionId('');
        setQuery('');
        setStudent(null);
    };

    const handleSectionChange = (value) => {
        setSectionId(value);
        setQuery('');
        setStudent(null);
    };

    const chooseStudent = (s) => {
        setStudent(s);
        setQuery('');
        setDropdownOpen(false);
    };

    const clearStudent = () => {
        setStudent(null);
        setQuery('');
        setDropdownOpen(false);
        inputRef.current?.focus();
    };

    const printReceipt = (win, data) => {
        const html = buildReceiptHtml({ schoolName, ...data });
        const target = win || window.open('', '_blank', 'width=820,height=900');
        if (!target) {
            toast.error('Allow pop-ups to print the receipt.');
            return;
        }
        target.document.open();
        target.document.write(html);
        target.document.close();
    };

    const handlePay = async () => {
        if (paying || !student || selectedInvoices.length === 0 || !amountCheck.ok) return;
        if (!hasEditPermission) {
            toast.error('You do not have permission to collect fees.');
            return;
        }
        if (payDate > todayStr) {
            toast.error('Payment date cannot be in the future.');
            return;
        }
        if (lateFeeInvalid) {
            toast.error('Enter a valid late fee amount.');
            return;
        }

        setPaying(true);
        const toPay = [...selectedInvoices];
        const settled = [];
        let receiptNumber = '';
        let failure = null;
        const paidAtIso = payDate === todayStr ? new Date().toISOString() : `${payDate}T12:00:00.000Z`;

        for (const inv of toPay) {
            try {
                const res = await payInvoice(inv.id, {
                    paymentMode: mode,
                    transactionReference: reference.trim() || undefined,
                    receiptNumber: receiptNumber || undefined,
                    paidAt: paidAtIso,
                    // the server re-checks this against the fee minus its concession (catches a concession added meanwhile)
                    amount: netOf(inv),
                    // the penalty is recorded once per receipt, on the first fee settled
                    ...(settled.length === 0 && lateFeeValue > 0 ? { lateFee: lateFeeValue } : {})
                });
                if (!receiptNumber) receiptNumber = res?.data?.receiptNumber || '';
                settled.push(inv);
            } catch (err) {
                failure = { inv, message: err?.message || 'Payment failed' };
                break;
            }
        }

        if (!mountedRef.current) return;
        setPaying(false);

        if (settled.length > 0) {
            const total = settled.reduce((s, i) => s + netOf(i), 0) + lateFeeValue;
            toast.success(`${formatMoney(total)} collected${receiptNumber ? ` · Receipt ${receiptNumber}` : ''}`);
            notifyDataChanged('fees');
            notifyDataChanged('invoices');
            setSelectedIds(new Set());
            setAmountText(null);
            setReference('');
            setLateFeeText('');
            await fetchInvoices(student, true);
        }

        if (failure) {
            toast.error(`${failure.inv.feeName}: ${failure.message}${settled.length ? ` (${settled.length} of ${toPay.length} were collected)` : ''}`);
        }
    };

    // Same receipt as the Print button in Payment history, for the most recent payment.
    const latestPayment = history[0] || null;
    const printLatest = () => {
        if (!student || !latestPayment) {
            toast.error('No payment has been recorded for this student yet.');
            return;
        }
        printReceipt(null, {
            student,
            receiptNumber: latestPayment.receiptNumber,
            paidAt: latestPayment.paidAt,
            mode: latestPayment.mode,
            reference: latestPayment.reference,
            items: latestPayment.items
        });
    };

    // keyboard shortcuts (kept in a ref so the listener is attached once)
    const shortcutRef = useRef();
    shortcutRef.current = { handlePay, printLatest, clearStudent, setTab, tab };
    useEffect(() => {
        const onKey = (e) => {
            const s = shortcutRef.current;
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) s.printLatest(); else s.handlePay();
            } else if (e.altKey && e.key.toLowerCase() === 'c') {
                e.preventDefault();
                s.clearStudent();
            } else if (e.altKey && e.key.toLowerCase() === 'm') {
                e.preventDefault();
                modeRef.current?.focus();
            } else if (e.altKey && e.key.toLowerCase() === 'h') {
                e.preventDefault();
                s.setTab(s.tab === 'history' ? 'ledger' : 'history');
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const onComboKeyDown = (e) => {
        if (!dropdownOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) {
            setDropdownOpen(true);
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, Math.max(results.length - 1, 0)));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
        } else if (e.key === 'Enter' && !e.ctrlKey) {
            e.preventDefault();
            if (results[highlight]) chooseStudent(results[highlight]);
        } else if (e.key === 'Escape') {
            setDropdownOpen(false);
        }
    };

    const selectClass =
        'w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed';

    const studentInputValue = student
        ? `${studentFullName(student)} (${student.admissionNumber})${classSectionLabel(student) ? ` - ${classSectionLabel(student)}` : ''}`
        : query;

    // ============================================================
    // Render
    // ============================================================
    return (
        <div className="space-y-6 animate-fade-in">
            <div>
                <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Fee Collection</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    Select a class and section, find the student, then collect the pending fees.
                </p>
            </div>

            {/* Selector bar */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm p-4 sm:p-5">
                <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_2fr_auto] gap-4 items-end">
                    <div>
                        <label htmlFor="fc-class" className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Class</label>
                        <select id="fc-class" value={classId} onChange={(e) => handleClassChange(e.target.value)} disabled={classesLoading} className={selectClass}>
                            <option value="">{classesLoading ? 'Loading classes…' : classes.length ? 'Select Class' : 'No classes found'}</option>
                            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>

                    <div>
                        <label htmlFor="fc-section" className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Section</label>
                        <select id="fc-section" value={sectionId} onChange={(e) => handleSectionChange(e.target.value)} disabled={!classId || !classHasSections} className={selectClass}>
                            <option value="">
                                {!classId ? 'Select Section' : classHasSections ? 'Select Section' : 'No sections'}
                            </option>
                            {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>

                    <div ref={comboRef} className="relative">
                        <label htmlFor="fc-student" className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Student</label>
                        <div className="relative">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            <input
                                id="fc-student"
                                ref={inputRef}
                                type="text"
                                role="combobox"
                                aria-expanded={dropdownOpen}
                                aria-controls="fc-student-list"
                                autoComplete="off"
                                value={studentInputValue}
                                readOnly={Boolean(student)}
                                disabled={!canSearchStudents}
                                placeholder={!canSearchStudents ? 'Select a section first' : globalMode ? 'Search any student by name / admission no.' : 'Select student or type a name / admission no.'}
                                onFocus={() => { if (!student) setDropdownOpen(true); }}
                                onChange={(e) => { setQuery(e.target.value); setDropdownOpen(true); }}
                                onKeyDown={onComboKeyDown}
                                className={`${selectClass} pl-9`}
                            />
                        </div>

                        {dropdownOpen && canSearchStudents && !student && (
                            <div id="fc-student-list" role="listbox" className="absolute z-30 left-0 right-0 mt-2 max-h-96 overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl">
                                {resultsLoading && results.length === 0 ? (
                                    <div className="flex items-center gap-2 p-4 text-sm text-slate-500"><Loader size={16} className="animate-spin" /> Loading students…</div>
                                ) : results.length === 0 ? (
                                    <div className="p-4 text-sm text-slate-500 dark:text-slate-400">
                                        {globalMode ? (query.trim() ? 'No active student matches that search.' : 'No active students found.') : query.trim() ? 'No student matches that search in this class.' : 'No active students in this class and section.'}
                                    </div>
                                ) : (
                                    results.map((s, idx) => (
                                        <button
                                            type="button"
                                            key={s.id}
                                            role="option"
                                            aria-selected={idx === highlight}
                                            onMouseEnter={() => setHighlight(idx)}
                                            onClick={() => chooseStudent(s)}
                                            className={`w-full text-left flex items-center gap-4 px-4 py-3 border-b last:border-b-0 border-slate-100 dark:border-slate-800 ${idx === highlight ? 'bg-primary-50 dark:bg-slate-800' : ''}`}
                                        >
                                            {s.photoUrl ? (
                                                <img src={s.photoUrl} alt="" className="w-12 h-12 rounded-full object-cover shrink-0" />
                                            ) : (
                                                <span className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center shrink-0"><UserIcon size={22} /></span>
                                            )}
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-sm font-bold uppercase text-primary-700 dark:text-primary-300 truncate">{studentFullName(s)}</span>
                                                <dl className="grid grid-cols-[6.5rem_1fr] gap-x-2 text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                                                    <dt className="text-slate-400">Adm No</dt><dd className="font-semibold truncate">{s.admissionNumber || '—'}</dd>
                                                    <dt className="text-slate-400">Class &amp; Sec</dt><dd className="font-semibold truncate">{classSectionLabel(s) || '—'}</dd>
                                                    <dt className="text-slate-400">Father Name</dt><dd className="font-semibold truncate">{studentFather(s) || '—'}</dd>
                                                    <dt className="text-slate-400">Phone No</dt><dd className="font-semibold truncate">{studentPhone(s) || '—'}</dd>
                                                </dl>
                                            </span>
                                        </button>
                                    ))
                                )}
                            </div>
                        )}
                    </div>

                    <button type="button" onClick={clearStudent} className="px-4 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-800 text-white text-sm font-bold transition-colors">
                        Clear
                    </button>
                </div>
            </div>

            {!student ? (
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-300 dark:border-slate-700 py-20 px-6 flex flex-col items-center text-center gap-4">
                    <div className="w-20 h-20 rounded-3xl bg-primary-50 dark:bg-slate-800 text-primary-600 flex items-center justify-center"><Pointer size={36} /></div>
                    <h2 className="text-xl font-black text-slate-900 dark:text-white">Select the student</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md">
                        Choose a class and section, then pick a student from the list. Their fee ledger, pending dues and payment options appear here.
                    </p>
                </div>
            ) : (
                <>
                    {/* Student summary */}
                    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
                        <div className="grid grid-cols-2 lg:grid-cols-[2fr_repeat(4,1fr)_1.4fr] gap-4 items-center">
                            <div className="col-span-2 lg:col-span-1 flex items-center gap-3 min-w-0">
                                {student.photoUrl ? (
                                    <img src={student.photoUrl} alt="" className="w-14 h-14 rounded-full object-cover shrink-0" />
                                ) : (
                                    <span className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center shrink-0"><UserIcon size={26} /></span>
                                )}
                                <div className="min-w-0">
                                    <p className="font-black text-slate-900 dark:text-white truncate">{studentFullName(student)}</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">Adm {student.admissionNumber} · {classSectionLabel(student) || '—'}</p>
                                    {studentFather(student) && <p className="text-xs text-slate-500 dark:text-slate-400 truncate">Father: {studentFather(student)}</p>}
                                </div>
                            </div>
                            <SummaryStat label="Balance" value={formatMoney(ledger.balance)} tone={ledger.balance > 0 ? 'red' : 'green'} />
                            <SummaryStat
                                label="Next due date"
                                value={ledger.nextDue ? formatDate(ledger.nextDue) : '—'}
                                tone={ledger.nextDue && ledger.nextDue < todayStr ? 'red' : 'amber'}
                                hint={ledger.nextDue && ledger.nextDue < todayStr ? 'Overdue' : null}
                            />
                            <SummaryStat label="Paid" value={formatMoney(ledger.paid)} tone="green" />
                            <SummaryStat label="Total fee" value={formatMoney(ledger.total)} tone="neutral" hint={ledger.concession > 0 ? `after ${formatMoney(ledger.concession)} concession` : null} hintTone="rose" />
                            <div className="col-span-2 lg:col-span-1 flex items-center gap-2 rounded-2xl bg-slate-50 dark:bg-slate-800 px-3 py-2.5">
                                <Bus size={18} className="text-slate-500 shrink-0" />
                                <div className="min-w-0 text-xs">
                                    <p className="font-bold uppercase tracking-wider text-slate-400">Bus stop</p>
                                    <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                                        {!student.transportRouteId && !student.busStopId ? 'Not using transport' : transport?.stopName || transport?.routeName || 'Assigned'}
                                    </p>
                                    {transport?.routeName && transport?.stopName && <p className="text-slate-500 dark:text-slate-400 truncate">{transport.routeName}</p>}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-slate-200 dark:border-slate-700">
                        <div className="flex gap-6">
                            <TabButton active={tab === 'ledger'} onClick={() => setTab('ledger')} icon={<Receipt size={18} />}>Fee ledger</TabButton>
                            <TabButton active={tab === 'history'} onClick={() => setTab('history')} icon={<History size={18} />}>Payment history ({history.length})</TabButton>
                        </div>
                        <div className="flex items-center gap-2 pb-2">
                            <label htmlFor="fc-category" className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Student category</label>
                            <select
                                id="fc-category"
                                value={category}
                                onChange={(e) => handleCategoryChange(e.target.value)}
                                disabled={categorySaving}
                                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60"
                            >
                                {STUDENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                    </div>

                    {invoicesLoading ? (
                        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 p-10 flex items-center justify-center gap-2 text-slate-500">
                            <Loader size={18} className="animate-spin" /> Loading fee details…
                        </div>
                    ) : tab === 'ledger' ? (
                        <>
                            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                                {ledger.active.length === 0 ? (
                                    <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
                                        No fees have been assigned to this student yet. Fees added in Fee Management appear here automatically.
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                                            <span className="text-xs text-slate-500 dark:text-slate-400 mr-auto">Click a pending amount, or a month heading, to add it to this payment.</span>
                                            <button type="button" onClick={selectOverdue} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200">Select overdue</button>
                                            <button type="button" onClick={selectAllPending} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200">Select all pending</button>
                                            <button type="button" onClick={clearSelection} disabled={selectedIds.size === 0} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-40">Clear selection</button>
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="w-full border-collapse text-sm min-w-max">
                                                <thead>
                                                    <tr className="bg-slate-50 dark:bg-slate-800/60">
                                                        <th className="sticky left-0 z-10 bg-slate-50 dark:bg-slate-800 text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-500 border border-slate-200 dark:border-slate-700">Fee category</th>
                                                        {ledger.perMonth.map((m) => (
                                                            <th key={m.key} className="border border-slate-200 dark:border-slate-700 p-0">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleMonth(m.pending)}
                                                                    disabled={m.pending.length === 0}
                                                                    title={m.pending.length ? 'Select all pending fees in this month' : 'Nothing pending'}
                                                                    className="w-full px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 enabled:hover:bg-primary-50 dark:enabled:hover:bg-slate-700 disabled:cursor-default"
                                                                >
                                                                    {monthLabel(m.key)}
                                                                </button>
                                                            </th>
                                                        ))}
                                                        {showConcessionColumn && (
                                                            <th className="border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-300 bg-rose-50/60 dark:bg-rose-900/10">Concession</th>
                                                        )}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {ledger.feeNames.map((fee) => (
                                                        <tr key={fee}>
                                                            <td className="sticky left-0 z-10 bg-white dark:bg-slate-900 px-4 py-2 font-semibold text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 whitespace-nowrap">{fee}</td>
                                                            {ledger.perMonth.map((m) => {
                                                                const list = ledger.cells.get(`${fee}|${m.key}`) || [];
                                                                return (
                                                                    <td key={m.key} className="border border-slate-200 dark:border-slate-700 px-2 py-1.5 text-center align-middle">
                                                                        <div className="flex flex-col items-center gap-1">
                                                                            {list.map((inv) => <LedgerCell key={inv.id} inv={inv} todayStr={todayStr} selected={selectedIds.has(inv.id)} onToggle={() => toggleInvoice(inv)} />)}
                                                                        </div>
                                                                    </td>
                                                                );
                                                            })}
                                                            {showConcessionColumn && (
                                                                <td className="border border-slate-200 dark:border-slate-700 px-4 py-2 text-center font-bold tabular-nums text-rose-600 dark:text-rose-300 bg-rose-50/60 dark:bg-rose-900/10">
                                                                    {(ledger.feeConcession.get(fee) || 0) > 0 ? `- ${ledger.feeConcession.get(fee).toLocaleString('en-IN')}` : ''}
                                                                </td>
                                                            )}
                                                        </tr>
                                                    ))}
                                                    <SummaryRow label="Total" values={ledger.perMonth.map((m) => m.total)} className="bg-teal-100 dark:bg-teal-900/40 text-teal-900 dark:text-teal-100" extra={showConcessionColumn ? `- ${ledger.concession.toLocaleString('en-IN')}` : null} />
                                                    <SummaryRow label="Paid" values={ledger.perMonth.map((m) => m.paid)} className="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200" extra={showConcessionColumn ? '' : null} />
                                                    {ledger.perMonth.some((m) => m.previousDue > 0) && (
                                                        <SummaryRow label="Previous Due (B/F)" values={ledger.perMonth.map((m) => m.previousDue)} className="bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200" hideZero extra={showConcessionColumn ? '' : null} />
                                                    )}
                                                    <SummaryRow label="Balance" values={ledger.perMonth.map((m) => m.balance)} className="bg-rose-100 dark:bg-rose-900/30 text-rose-800 dark:text-rose-200" hideZero extra={showConcessionColumn ? '' : null} />
                                                </tbody>
                                            </table>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Payment form */}
                            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm p-5 space-y-5">
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                    <div>
                                        <label htmlFor="fc-amount" className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Amount</label>
                                        <div className="relative">
                                            <Rupee size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                            <input
                                                id="fc-amount"
                                                inputMode="decimal"
                                                autoComplete="off"
                                                value={amountText !== null ? amountText : selectedInvoices.length ? payableTotal.toLocaleString('en-IN') : ''}
                                                onChange={(e) => handleAmountChange(e.target.value)}
                                                disabled={!hasEditPermission || ledger.pending.length === 0}
                                                aria-invalid={amountText !== null && !amountCheck.ok}
                                                placeholder={ledger.pending.length ? 'Type amount or select fees' : 'Nothing pending'}
                                                className={`${selectClass} pl-8 font-black ${amountText !== null && !amountCheck.ok ? 'border-red-400 focus:ring-red-400' : ''}`}
                                            />
                                        </div>
                                        <p className={`text-[11px] mt-1 ${amountText !== null && !amountCheck.ok ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-slate-400'}`}>
                                            {amountText !== null && !amountCheck.ok ? amountCheck.message : null}
                                            {!(amountText !== null && !amountCheck.ok) && <>{selectedInvoices.length} fee{selectedInvoices.length === 1 ? '' : 's'} selected{selectedConcession > 0 ? ` · after ${formatMoney(selectedConcession)} concession` : ''}{lateFeeValue > 0 ? ` · incl. late fee ${formatMoney(lateFeeValue)}` : ''}</>}
                                        </p>
                                    </div>
                                    <div>
                                        <label htmlFor="fc-date" className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Select date</label>
                                        <input id="fc-date" type="date" value={payDate} max={todayStr} onChange={(e) => setPayDate(e.target.value || todayStr)} className={selectClass} />
                                    </div>
                                    <div>
                                        <label htmlFor="fc-late" className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Late fee</label>
                                        <div className="relative">
                                            <Rupee size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                            <input
                                                id="fc-late"
                                                inputMode="decimal"
                                                autoComplete="off"
                                                value={hasOverdueSelected ? lateFeeText : ''}
                                                onChange={(e) => {
                                                    setLateFeeText(e.target.value.replace(/[^0-9.]/g, ''));
                                                    setAmountText(null);
                                                }}
                                                disabled={!hasEditPermission || !hasOverdueSelected}
                                                aria-invalid={lateFeeInvalid}
                                                placeholder={hasOverdueSelected ? 'Optional penalty' : 'No overdue fee selected'}
                                                className={`${selectClass} pl-8`}
                                            />
                                        </div>
                                        {hasOverdueSelected && <p className="text-[11px] mt-1 text-slate-400">Optional · added to the total</p>}
                                    </div>
                                    <div>
                                        <label htmlFor="fc-remarks" className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Remarks</label>
                                        <input id="fc-remarks" disabled placeholder="Not available yet" className={selectClass} />
                                    </div>
                                </div>

                                <fieldset>
                                    <legend className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Payment mode</legend>
                                    <div className="flex flex-wrap gap-2" role="radiogroup">
                                        {PAYMENT_MODES.map((m, idx) => (
                                            <label key={m} className={`cursor-pointer select-none flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-colors ${mode === m ? 'border-primary-600 bg-primary-50 dark:bg-slate-800 text-primary-700 dark:text-primary-300' : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                                                <input
                                                    ref={idx === 0 ? modeRef : null}
                                                    type="radio"
                                                    name="fc-mode"
                                                    value={m}
                                                    checked={mode === m}
                                                    onChange={() => setMode(m)}
                                                    className="accent-primary-600"
                                                />
                                                {m}
                                            </label>
                                        ))}
                                    </div>
                                </fieldset>

                                {mode !== 'Cash' && (
                                    <div className="max-w-md">
                                        <label htmlFor="fc-ref" className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                                            {mode === 'Cheque' ? 'Cheque number' : 'Transaction / reference number'}
                                        </label>
                                        <input id="fc-ref" value={reference} maxLength={100} onChange={(e) => setReference(e.target.value)} className={selectClass} />
                                    </div>
                                )}

                                <div className="flex flex-wrap items-center justify-end gap-3">
                                    {!hasEditPermission && (
                                        <span className="mr-auto flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-300"><AlertTriangle size={14} /> You can view fees but not collect payments.</span>
                                    )}
                                    <button type="button" onClick={handlePay} disabled={paying || selectedInvoices.length === 0 || !amountCheck.ok || !hasEditPermission} className="px-6 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-800 text-white text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2">
                                        {paying && <Loader size={14} className="animate-spin" />} Pay
                                    </button>
                                    <button type="button" onClick={printLatest} disabled={!latestPayment} title={latestPayment ? `Print receipt ${latestPayment.receiptNumber || ''}`.trim() : 'No payment to print yet'} className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                                        <Printer size={15} /> Print
                                    </button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                            {history.length === 0 ? (
                                <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">No payments have been recorded for this student.</div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left border-collapse min-w-max">
                                        <thead>
                                            <tr className="bg-slate-50 dark:bg-slate-800/60 text-xs font-bold uppercase tracking-wider text-slate-500">
                                                <th className="px-4 py-3">Receipt no.</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Fees</th><th className="px-4 py-3">Mode</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3" />
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {history.map((g) => {
                                                const amount = g.items.reduce((s, i) => s + netOf(i) + invoiceLateFee(i), 0);
                                                const concession = g.items.reduce((s, i) => s + concessionOf(i), 0);
                                                return (
                                                    <tr key={g.key} className="border-t border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-200">
                                                        <td className="px-4 py-3 font-semibold">{g.receiptNumber || '—'}</td>
                                                        <td className="px-4 py-3">{formatDate(g.paidAt)}</td>
                                                        <td className="px-4 py-3">{g.items.map((i) => i.feeName).join(', ')}</td>
                                                        <td className="px-4 py-3">{g.mode || '—'}</td>
                                                        <td className="px-4 py-3">{g.reference || '—'}</td>
                                                        <td className="px-4 py-3 text-right font-bold">
                                                            {formatMoney(amount)}
                                                            {concession > 0 && <span className="block text-[11px] font-semibold text-rose-600 dark:text-rose-400">incl. concession - {formatMoney(concession)}</span>}
                                                        </td>
                                                        <td className="px-4 py-3 text-right">
                                                            <button type="button" onClick={() => printReceipt(null, { student, receiptNumber: g.receiptNumber, paidAt: g.paidAt, mode: g.mode, reference: g.reference, items: g.items })} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">
                                                                <Printer size={13} /> Print
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

function SummaryStat({ label, value, tone = 'neutral', hint, hintTone = 'red' }) {
    const tones = {
        red: 'text-red-600 dark:text-red-400',
        green: 'text-emerald-600 dark:text-emerald-400',
        amber: 'text-amber-600 dark:text-amber-400',
        neutral: 'text-slate-900 dark:text-white'
    };
    return (
        <div className="text-center lg:border-l border-slate-100 dark:border-slate-800 lg:px-2">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p>
            <p className={`text-lg font-black ${tones[tone]}`}>{value}</p>
            {hint && <p className={`text-[11px] font-bold ${hintTone === 'rose' ? 'text-rose-600 dark:text-rose-400' : 'text-red-600 dark:text-red-400'}`}>{hint}</p>}
        </div>
    );
}

function TabButton({ active, onClick, icon, children }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`pb-3 font-bold text-sm transition-all border-b-2 flex items-center gap-2 ${active ? 'border-primary-600 text-primary-600 dark:text-primary-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}
        >
            {icon}
            {children}
        </button>
    );
}

function LedgerCell({ inv, todayStr, selected, onToggle }) {
    const amount = Number(inv.amount).toLocaleString('en-IN');
    const concession = concessionOf(inv);
    const concessionNote = concession > 0 ? (
        <span className="text-[11px] font-bold text-rose-600 dark:text-rose-300 tabular-nums" title={concessionLabel(inv) || 'Concession'}>
            - {concession.toLocaleString('en-IN')} = {netOf(inv).toLocaleString('en-IN')}
        </span>
    ) : null;
    if (inv.status === 'Paid') {
        return (
            <span className="flex flex-col items-center leading-tight">
                <span className="text-emerald-700 dark:text-emerald-300 line-through decoration-1 tabular-nums" title={`Paid ${formatDate(inv.paidAt)}`}>{amount}</span>
                {concessionNote}
            </span>
        );
    }
    const overdue = inv.dueDate < todayStr;
    return (
        <span className="flex flex-col items-center gap-0.5">
            <button
                type="button"
                onClick={onToggle}
                aria-pressed={selected}
                title={overdue ? 'Overdue — click to select' : 'Click to select'}
                className={`px-2.5 py-1 rounded-lg text-sm font-bold tabular-nums border transition-colors ${selected
                    ? 'bg-primary-600 border-primary-600 text-white'
                    : overdue
                        ? 'border-red-300 text-red-700 bg-red-50 hover:bg-red-100 dark:border-red-800 dark:text-red-300 dark:bg-red-900/20'
                        : 'border-slate-300 text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800'
                    }`}
            >
                {amount}
            </button>
            {concessionNote}
        </span>
    );
}

function SummaryRow({ label, values, className, hideZero = false, extra = null }) {
    return (
        <tr className={className}>
            <td className="sticky left-0 z-10 px-4 py-2 font-bold border border-slate-200 dark:border-slate-700 bg-inherit">{label}</td>
            {values.map((v, i) => (
                <td key={i} className="px-4 py-2 text-center font-bold tabular-nums border border-slate-200 dark:border-slate-700">
                    {hideZero && v === 0 ? '' : v.toLocaleString('en-IN')}
                </td>
            ))}
            {extra !== null && <td className="px-4 py-2 text-center font-bold tabular-nums border border-slate-200 dark:border-slate-700">{extra}</td>}
        </tr>
    );
}
