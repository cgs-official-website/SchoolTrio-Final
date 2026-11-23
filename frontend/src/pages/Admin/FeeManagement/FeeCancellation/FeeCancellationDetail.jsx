import React from 'react';
import { LuArrowLeft as ArrowLeft } from 'react-icons/lu';

const formatMoney = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;

const formatDate = (iso) => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
};

function Detail({ label, children }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white break-words">{children || '-'}</p>
    </div>
  );
}

export default function FeeCancellationDetail({ row, onBack }) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Cancellation Details</h3>
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white shadow-sm transition-colors"
        >
          <ArrowLeft size={16} /> Back To List
        </button>
      </div>

      <div className="p-6 rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
          <Detail label="Student Name">
            {row.studentName}
            {row.admissionNumber ? ` (${row.admissionNumber})` : ''}
          </Detail>
          <Detail label="Class Name">{row.className}</Detail>
          <Detail label="Section Name">{row.sectionName}</Detail>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6 pt-6 border-t border-slate-100 dark:border-slate-800">
          <Detail label="Fee Category">{row.feeCategory}</Detail>
          <Detail label="Receipt No">{row.receiptNumber}</Detail>
          <Detail label="Payment Mode">{row.paymentMode}</Detail>
          <Detail label="Amount">{formatMoney(row.amount)}</Detail>
          <Detail label="Originally Paid On">{formatDate(row.paidAt)}</Detail>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-6 border-t border-slate-100 dark:border-slate-800">
          <div className="sm:col-span-3">
            <Detail label="Description">{row.description}</Detail>
          </div>
          <Detail label="Cancelled By">{row.cancelledBy}</Detail>
          <Detail label="Effective Date">{formatDate(row.createdAt)}</Detail>
        </div>
      </div>
    </div>
  );
}