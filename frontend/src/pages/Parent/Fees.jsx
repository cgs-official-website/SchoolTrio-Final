import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getStudentInvoices, getStudentFeeLedger } from '../../api/invoices';
import { getSchoolSettings } from '../../api/settings';
import { downloadInvoicePdf } from '../../utils/feeDocuments';
import { downloadLedgerPdf } from '../../utils/ledgerPdf';
import { useLiveDataRefresh } from '../../hooks/useLiveDataRefresh';
import {
  LuReceipt as Receipt,
  LuCircleCheck as CheckCircle2,
  LuTrendingUp as TrendingUp,
  LuTriangleAlert as AlertTriangle,
  LuDownload as Download,
  LuClock as Clock,
  LuTicketPercent as ConcessionIcon,
  LuFileText as FileText,
  LuLoader as Loader
} from 'react-icons/lu';
import toast from 'react-hot-toast';

const EMPTY_STATS = { totalInvoiced: 0, concession: 0, paid: 0, outstanding: 0, overdueCount: 0, overdueAmount: 0 };

const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;
const dmy = (v) => (v ? new Date(v).toLocaleDateString('en-GB') : 'N/A');

const isPaid = (i) => String(i.status || '').toLowerCase() === 'paid';
const categoryOf = (inv) => inv.feeCategory || inv.feeName || inv.name || 'School Fee';
const netOf = (inv) => Number(inv.netAmount ?? inv.amount) || 0;

/** paid | concessed (fully concessed, nothing to pay) | overdue | pending */
const statusOf = (inv) => {
  if (isPaid(inv)) return 'paid';
  if (netOf(inv) <= 0 && Number(inv.concessionAmount) > 0) return 'concessed';
  if (inv.isOverdue) return 'overdue';
  return 'pending';
};

const daysBetween = (dueDate) => {
  const due = new Date(`${String(dueDate).slice(0, 10)}T00:00:00`);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((due - now) / 86400000);
};

export default function ParentFees() {
  const { userProfile } = useAuth();
  const outletContext = useOutletContext();
  const activeChild = outletContext?.activeChild;
  const studentId = outletContext?.activeStudentId || userProfile?.linkedStudentId;

  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(EMPTY_STATS);
  const [schoolName, setSchoolName] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const mountedRef = useRef(true);
  const currentStudentRef = useRef(studentId);

  const fetchInvoices = useCallback(async (targetStudentId, silent = false) => {
    if (!targetStudentId) {
      setInvoices([]);
      setStats(EMPTY_STATS);
      setLoading(false);
      return;
    }

    if (!silent) setLoading(true);
    try {
      const res = await getStudentInvoices(targetStudentId, { limit: 100 });
      if (!mountedRef.current || currentStudentRef.current !== targetStudentId) return;

      const summary = res?.summary || {};
      // Deleted fees never show to parents
      const live = (res?.data || []).filter((i) => String(i.status || '').toLowerCase() !== 'cancelled');

      // The backend sends totals that already include concessions. If a figure is missing,
      // fall back to adding up the list itself so the cards are never wrongly 0.
      const pick = (...vals) => {
        const v = vals.find((x) => x !== undefined && x !== null && x !== '');
        return v === undefined ? undefined : Number(v);
      };
      const sumOf = (list, fn) => list.reduce((t, i) => t + fn(i), 0);
      const unpaid = live.filter((i) => !isPaid(i));
      const overdue = unpaid.filter((i) => i.isOverdue);

      const totalInvoiced = pick(summary.totalInvoiced) ?? sumOf(live, (i) => Number(i.amount) || 0);
      const concession = pick(summary.concessionAmount) ?? sumOf(live, (i) => Number(i.concessionAmount) || 0);
      const paid = pick(summary.paidAmount, summary.totalPaid) ?? sumOf(live.filter(isPaid), netOf);
      const outstanding = pick(summary.outstandingAmount, summary.totalOutstanding) ?? sumOf(unpaid, netOf);
      const overdueCount = pick(summary.overdueCount) ?? overdue.length;
      const overdueAmount = pick(summary.overdueAmount, summary.totalOverdue) ?? sumOf(overdue, netOf);

      live.sort((a, b) => new Date(b.dueDate || 0) - new Date(a.dueDate || 0));

      setInvoices(live);
      setStats({ totalInvoiced, concession, paid, outstanding, overdueCount, overdueAmount });
    } catch (error) {
      if (mountedRef.current && currentStudentRef.current === targetStudentId) {
        console.error('Error fetching invoices:', error);
        toast.error(error.message || 'Failed to load fee details.');
        setInvoices([]);
        setStats(EMPTY_STATS);
      }
    } finally {
      if (mountedRef.current && currentStudentRef.current === targetStudentId) {
        if (!silent) setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    currentStudentRef.current = studentId;
    setStatusFilter('all');
    setCategoryFilter('');

    if (!studentId) {
      setLoading(false);
      setInvoices([]);
      setStats(EMPTY_STATS);
      return;
    }

    fetchInvoices(studentId, false);

    return () => {
      mountedRef.current = false;
    };
  }, [studentId, fetchInvoices]);

  // Live data synchronization for fees and invoices
  const handleLiveRefresh = useCallback(() => {
    if (studentId) {
      fetchInvoices(studentId, true);
    }
  }, [fetchInvoices, studentId]);

  useLiveDataRefresh(handleLiveRefresh, [handleLiveRefresh], ['fees', 'invoices']);

  // School name for the invoice / receipt header (silently ignored if the parent role cannot read it)
  useEffect(() => {
    getSchoolSettings()
      .then((res) => {
        const d = res?.data || res;
        if (mountedRef.current) setSchoolName(d?.name || d?.schoolName || '');
      })
      .catch(() => { });
  }, []);

  const studentInfo = {
    name: [activeChild?.firstName, activeChild?.lastName].filter(Boolean).join(' ') || activeChild?.name || userProfile?.name || '',
    admissionNumber: activeChild?.admissionNumber || '',
    className: activeChild?.className || activeChild?.class?.name || '',
    sectionName: activeChild?.sectionName || activeChild?.section?.name || ''
  };

  const categories = useMemo(
    () => [...new Set(invoices.map(categoryOf))].sort((a, b) => a.localeCompare(b)),
    [invoices]
  );

  const hasConcessedFees = useMemo(() => invoices.some((i) => statusOf(i) === 'concessed'), [invoices]);

  const filtered = useMemo(
    () =>
      invoices.filter((inv) => {
        if (statusFilter !== 'all' && statusOf(inv) !== statusFilter) return false;
        if (categoryFilter && categoryOf(inv) !== categoryFilter) return false;
        return true;
      }),
    [invoices, statusFilter, categoryFilter]
  );

  const statusOptions = [
    ['all', 'All'],
    ['pending', 'Pending'],
    ['overdue', 'Overdue'],
    ['paid', 'Paid'],
    ...(hasConcessedFees ? [['concessed', 'Fully Concessed']] : [])
  ];

  const handleInvoice = (inv) => downloadInvoicePdf({ schoolName, student: studentInfo, invoice: inv });

  const handleLedger = async () => {
    if (!studentId) return;
    setLedgerLoading(true);
    try {
      const res = await getStudentFeeLedger(studentId);
      if (!res?.data) throw new Error('No ledger data returned.');
      downloadLedgerPdf(res.data);
    } catch (error) {
      toast.error(error.message || 'Failed to generate the ledger.');
    } finally {
      setLedgerLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex justify-center items-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent"></div>
      </div>
    );
  }

  const hasConcession = stats.concession > 0;
  const pillClass = (active) =>
    `px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
      active
        ? 'bg-primary-600 border-primary-600 text-white'
        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
    }`;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto min-w-0 w-full">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-3 min-w-0 w-full">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight truncate">Fees & Payments</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Monitor fee invoices, receipts, and outstanding dues for your linked student.</p>
        </div>
        <button
          type="button"
          onClick={handleLedger}
          disabled={ledgerLoading || !studentId}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
        >
          {ledgerLoading ? <Loader size={16} className="animate-spin" /> : <FileText size={16} />}
          Download Ledger
        </button>
      </div>

      {/* Stats Widgets */}
      <div className={`grid grid-cols-1 gap-6 ${hasConcession ? 'md:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-3'}`}>
        {/* Total Invoiced */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-100 dark:border-slate-800 shadow-sm flex items-center gap-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-2 h-full bg-slate-400"></div>
          <div className="w-12 h-12 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-2xl flex items-center justify-center">
            <Receipt size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider">Total Invoiced</p>
            <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{money(stats.totalInvoiced)}</p>
          </div>
        </div>

        {/* Concession */}
        {hasConcession && (
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-100 dark:border-slate-800 shadow-sm flex items-center gap-4 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-2 h-full bg-violet-500"></div>
            <div className="w-12 h-12 bg-violet-50 text-violet-600 rounded-2xl flex items-center justify-center">
              <ConcessionIcon size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider">Concession</p>
              <p className="text-2xl font-black text-violet-700 dark:text-violet-300 mt-1">{money(stats.concession)}</p>
            </div>
          </div>
        )}

        {/* Paid */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-100 dark:border-slate-800 shadow-sm flex items-center gap-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-2 h-full bg-emerald-500"></div>
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
            <TrendingUp size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider">Paid Amount</p>
            <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{money(stats.paid)}</p>
          </div>
        </div>

        {/* Outstanding */}
        <div className={`bg-white dark:bg-slate-900 rounded-3xl p-6 border shadow-sm flex items-center gap-4 relative overflow-hidden ${stats.overdueCount > 0 ? 'border-red-200' : 'border-slate-100 dark:border-slate-800'}`}>
          <div className={`absolute top-0 left-0 w-2 h-full ${stats.overdueCount > 0 ? 'bg-red-500' : 'bg-amber-500'}`}></div>
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${stats.overdueCount > 0 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
            <AlertTriangle size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider">
              {stats.overdueCount > 0 ? 'Overdue Balance' : 'Outstanding Balance'}
            </p>
            <p className={`text-2xl font-black mt-1 ${stats.overdueCount > 0 ? 'text-red-600' : 'text-amber-600'}`}>
              {money(stats.outstanding)}
            </p>
            {stats.overdueCount > 0 && (
              <p className="text-[11px] font-bold text-red-600 mt-0.5">
                {stats.overdueCount} Invoice(s) Past Due
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Dues Alert Banner */}
      {stats.outstanding > 0 && (
        <div className={`rounded-3xl p-5 border shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-fade-in ${stats.overdueCount > 0
          ? 'bg-gradient-to-r from-red-50 to-orange-50 border-red-200 text-red-900'
          : 'bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-200 text-amber-900'
          }`}>
          <div className="flex items-start gap-4 min-w-0 w-full">
            <div className={`p-3 rounded-2xl shrink-0 mt-0.5 ${stats.overdueCount > 0 ? 'bg-red-500 text-white shadow-md shadow-red-500/20 animate-pulse' : 'bg-amber-500 text-white shadow-md shadow-amber-500/20'}`}>
              <AlertTriangle size={24} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full ${stats.overdueCount > 0 ? 'bg-red-200 text-red-950 font-black' : 'bg-amber-200 text-amber-950 font-bold'}`}>
                  {stats.overdueCount > 0 ? '⚠️ Overdue Fees' : '💳 Pending Fees'}
                </span>
                {stats.overdueCount > 0 && (
                  <span className="text-xs font-bold text-red-700 bg-white/80 px-2 py-0.5 rounded-full border border-red-200">
                    {stats.overdueCount} Overdue
                  </span>
                )}
              </div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white mt-1">
                {stats.overdueCount > 0
                  ? `You have ${money(stats.overdueAmount)} in overdue fees. Please pay at the school office.`
                  : `You have an outstanding balance of ${money(stats.outstanding)} pending payment.`}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                {stats.overdueCount > 0
                  ? 'Payments are collected at the school office. Please settle overdue invoices as soon as possible.'
                  : 'Payments are collected at the school office. Please settle pending invoices before their due date.'}
                {hasConcession ? ' Amounts shown are after concession.' : ''}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Invoices List */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex flex-wrap justify-between items-center gap-3">
          <h2 className="text-lg font-bold text-slate-950 dark:text-white">Invoice Log</h2>

          {invoices.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {statusOptions.map(([value, label]) => (
                <button key={value} type="button" onClick={() => setStatusFilter(value)} className={pillClass(statusFilter === value)}>
                  {label}
                </button>
              ))}
              {categories.length > 1 && (
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  aria-label="Filter by fee category"
                  className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                >
                  <option value="">All categories</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>

        {invoices.length === 0 ? (
          <div className="p-12 text-center text-slate-400 dark:text-slate-300">
            <Receipt className="mx-auto mb-3 opacity-40" size={48} />
            <p className="font-medium text-sm">No fee invoices generated yet.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400 dark:text-slate-300">
            <Receipt className="mx-auto mb-3 opacity-40" size={48} />
            <p className="font-medium text-sm">No fees match the selected filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto min-w-0 w-full custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-max">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider bg-slate-50/30">
                  <th className="py-4 px-6">Fee Details</th>
                  <th className="py-4 px-6">Due Date</th>
                  <th className="py-4 px-6">Amount</th>
                  <th className="py-4 px-6">Concession</th>
                  <th className="py-4 px-6">Balance</th>
                  <th className="py-4 px-6 text-center">Status</th>
                  <th className="py-4 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {filtered.map((inv) => {
                  const state = statusOf(inv);
                  const overdue = state === 'overdue';
                  const feeTitle = inv.feeName || inv.name || 'School Fee';
                  const kinds = [...new Set((inv.concessions || []).map((c) => c.category).filter(Boolean))];
                  const balance = Number(inv.balance ?? (state === 'paid' ? 0 : netOf(inv))) || 0;

                  return (
                    <tr
                      key={inv.id}
                      className={`transition-colors ${overdue ? 'bg-red-50/40 hover:bg-red-50/70' : 'hover:bg-slate-50/50'}`}
                    >
                      <td className="py-4 px-6">
                        <p className="font-semibold text-slate-900 dark:text-white">{feeTitle}</p>
                        <p className="text-xs text-slate-400 dark:text-slate-300 mt-0.5">
                          {inv.createdAt ? `Invoiced on ${dmy(inv.createdAt)}` : 'Standard Fee'}
                          {inv.customData?.academicYear ? ` · AY ${inv.customData.academicYear}` : ''}
                        </p>
                      </td>

                      <td className="py-4 px-6">
                        <span className={`font-medium ${overdue ? 'text-red-600 font-bold' : 'text-slate-600 dark:text-slate-300'}`}>
                          {dmy(inv.dueDate)}
                          {overdue && (
                            <span className="ml-2 inline-flex items-center gap-1 text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-black uppercase tracking-wide border border-red-200">
                              <AlertTriangle size={10} /> Overdue
                            </span>
                          )}
                        </span>
                      </td>

                      <td className="py-4 px-6">
                        <span className="font-bold text-slate-900 dark:text-white">{money(inv.amount)}</span>
                      </td>

                      <td className="py-4 px-6">
                        {Number(inv.concessionAmount) > 0 ? (
                          <div>
                            <p className="font-semibold text-violet-700 dark:text-violet-300">-{money(inv.concessionAmount)}</p>
                            {kinds.length > 0 && (
                              <p className="text-[11px] text-slate-400 dark:text-slate-300 mt-0.5">{kinds.join(', ')}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600">-</span>
                        )}
                      </td>

                      <td className="py-4 px-6">
                        <span className={`font-bold ${overdue ? 'text-red-600' : 'text-slate-900 dark:text-white'}`}>
                          {money(balance)}
                        </span>
                      </td>

                      <td className="py-4 px-6 text-center">
                        {state === 'paid' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/50">
                            <CheckCircle2 size={12} /> Paid
                          </span>
                        ) : state === 'concessed' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-violet-50 text-violet-700 border border-violet-200/50">
                            <ConcessionIcon size={12} /> Fully Concessed
                          </span>
                        ) : overdue ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200 animate-pulse">
                            <AlertTriangle size={12} /> Overdue
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200/50">
                            Pending
                          </span>
                        )}
                      </td>

                      <td className="py-4 px-6 text-right">
                        {state === 'paid' ? (
                          <div className="flex flex-col items-end gap-1.5">
                            <button
                              onClick={() => handleInvoice(inv)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors"
                            >
                              <Download size={13} /> Invoice
                            </button>
                            <span className="text-[11px] text-slate-400 dark:text-slate-300">
                              {[
                                inv.receiptNumber || 'Fully Settled',
                                inv.paymentMode,
                                inv.paidAt ? `Paid ${dmy(inv.paidAt)}` : null
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                          </div>
                        ) : state === 'concessed' ? (
                          <span className="text-[11px] font-medium text-violet-700 dark:text-violet-300">No payment needed</span>
                        ) : (
                          <div className="flex flex-col items-end gap-1.5">
                            {inv.dueDate && (() => {
                              const d = daysBetween(inv.dueDate);
                              return d < 0 ? (
                                <span className="text-[11px] font-bold text-red-600">Overdue by {Math.abs(d)} day{Math.abs(d) === 1 ? '' : 's'} · Pay at school office</span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700">
                                  <Clock size={11} /> {d === 0 ? 'Due today' : `Due in ${d} day${d === 1 ? '' : 's'}`} · Pay at school office
                                </span>
                              );
                            })()}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}