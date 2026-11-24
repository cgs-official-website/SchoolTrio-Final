import React, { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { LuEye as Eye } from 'react-icons/lu';
import { feeCancellationsApi } from '../../../../api/feeCancellations';
import usePermissions from '../../../../hooks/usePermissions';
import { notifyDataChanged } from '../../../../utils/liveData';
import {
  MasterHeader,
  InlineFormPanel,
  FormField,
  inputClass,
  MasterTable,
  useMasterList
} from '../FeeMaster/components';
import StudentSelect from '../FeeConcession/StudentSelect';
import useClassSectionOptions from '../FeeConcession/useClassSectionOptions';
import FeeCancellationDetail from './FeeCancellationDetail';
import ExportModal from '../../../../components/ExportModal';
import useExcelExport from '../../../../hooks/useExcelExport';
import { formatExportDate } from '../../../../utils/excelExport';

const PAGE_SIZE = 20;
const EMPTY_FORM = { classId: '', sectionId: '', student: null, invoiceId: '', description: '' };
const EMPTY_FILTERS = { classId: '', sectionId: '', student: null };

const EXPORT_COLUMNS = [
  { key: 'admissionNumber', label: 'Admission No', value: (r) => r.admissionNumber },
  { key: 'studentName', label: 'Student Name', value: (r) => r.studentName },
  { key: 'className', label: 'Class', value: (r) => r.className },
  { key: 'sectionName', label: 'Section', value: (r) => r.sectionName },
  { key: 'feeCategory', label: 'Fee Category', value: (r) => r.feeCategory },
  { key: 'receiptNumber', label: 'Receipt No', value: (r) => r.receiptNumber },
  { key: 'paymentMode', label: 'Payment Mode', value: (r) => r.paymentMode },
  { key: 'amount', label: 'Amount', value: (r) => r.amount },
  { key: 'description', label: 'Description', value: (r) => r.description },
  { key: 'cancelledBy', label: 'Cancelled By', value: (r) => r.cancelledBy },
  { key: 'createdAt', label: 'Date', value: (r) => formatExportDate(r.createdAt) }
];

const formatMoney = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;

const formatDate = (iso) => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
};

export default function FeeCancellationTab() {
  const { canDelete } = usePermissions();
  // Cancelling a payment needs the same permission the backend checks (delete)
  const allowCancel = canDelete('fees');

  const { classOptions, sectionOptions } = useClassSectionOptions();

  // ---------- filters (apply as soon as a value is picked) ----------
  const [showFilters, setShowFilters] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  const filterParams = useMemo(() => {
    const params = {};
    if (filters.classId) params.classId = filters.classId;
    if (filters.sectionId) params.sectionId = filters.sectionId;
    if (filters.student) params.studentId = filters.student.value;
    return params;
  }, [filters]);

  const hasActiveFilter = Object.keys(filterParams).length > 0;

  const fetcher = useCallback(
    (params) => feeCancellationsApi.listFeeCancellations({ ...params, ...filterParams }),
    [filterParams]
  );

  const list = useMasterList({
    fetcher,
    defaultSortBy: 'createdAt',
    defaultOrder: 'desc',
    limit: PAGE_SIZE,
    errorMessage: 'Failed to load cancellations.'
  });

  const exporter = useExcelExport({
    columns: EXPORT_COLUMNS,
    fetcher,
    getQuery: () => ({ search: list.search, sortBy: list.sortBy, order: list.order }),
    defaultFileName: 'Fee_Cancellation',
    sheetName: 'Fee Cancellation'
  });

  const updateFilter = (patch) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    list.setPage(1);
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    list.setPage(1);
  };

  const filterSections = useMemo(
    () => sectionOptions.filter((s) => s.classId === filters.classId),
    [sectionOptions, filters.classId]
  );

  // ---------- add form ----------
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [payments, setPayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);

  const formSections = useMemo(
    () => sectionOptions.filter((s) => s.classId === form.classId),
    [sectionOptions, form.classId]
  );

  const studentId = form.student?.value;

  useEffect(() => {
    if (!showForm || !studentId) {
      setPayments([]);
      return undefined;
    }
    let cancelled = false;
    setPaymentsLoading(true);
    feeCancellationsApi
      .listStudentPayments(studentId)
      .then((res) => {
        if (!cancelled) setPayments(res?.data || []);
      })
      .catch((error) => {
        if (!cancelled) {
          setPayments([]);
          toast.error(error.message || 'Failed to load student payments.');
        }
      })
      .finally(() => {
        if (!cancelled) setPaymentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showForm, studentId]);

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setForm(EMPTY_FORM);
    setPayments([]);
  };

  const afterChange = async () => {
    notifyDataChanged('fees');
    notifyDataChanged('invoices');
    await list.reload();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.classId) return toast.error('Select a class.');
    if (formSections.length > 0 && !form.sectionId) return toast.error('Select a section.');
    if (!form.student) return toast.error('Select a student.');
    if (!form.invoiceId) return toast.error('Select the payment to cancel.');
    if (form.description.trim().length < 3) return toast.error('Enter the reason for cancelling.');

    const chosen = payments.find((p) => p.id === form.invoiceId);
    const ok = window.confirm(
      `Cancel the payment of ${formatMoney(chosen?.amount)} for ${chosen?.feeCategory || 'this fee'}` +
        `${chosen?.receiptNumber ? ` (receipt ${chosen.receiptNumber})` : ''}?\n\n` +
        'The fee will go back to Pending. The receipt is kept in the cancellation list.'
    );
    if (!ok) return;

    setSaving(true);
    try {
      await feeCancellationsApi.createFeeCancellation({
        invoiceId: form.invoiceId,
        description: form.description.trim()
      });
      toast.success('Payment cancelled. The fee is Pending again.');
      closeForm();
      list.setPage(1);
      await afterChange();
    } catch (error) {
      toast.error(error.message || 'Failed to cancel payment.');
    } finally {
      setSaving(false);
    }
  };

  // ---------- table ----------
  const columns = [
    { key: 'admissionNumber', label: 'Admission No', sortable: true, className: 'font-mono' },
    { key: 'studentName', label: 'Student Name', sortable: true, className: 'font-semibold' },
    { key: 'className', label: 'Class', sortable: true },
    { key: 'sectionName', label: 'Section', sortable: true },
    { key: 'feeCategory', label: 'Fee Category', sortable: true, className: 'font-semibold' },
    { key: 'receiptNumber', label: 'Receipt No', sortable: true, render: (row) => row.receiptNumber || '-' },
    { key: 'paymentMode', label: 'Payment Mode', sortable: true, render: (row) => row.paymentMode || '-' },
    {
      key: 'amount',
      label: 'Amount',
      sortable: true,
      render: (row) => <span className="font-mono font-bold whitespace-nowrap">{formatMoney(row.amount)}</span>
    },
    { key: 'description', label: 'Description', sortable: false },
    { key: 'cancelledBy', label: 'Cancelled By', sortable: false },
    {
      key: 'createdAt',
      label: 'Date',
      sortable: true,
      render: (row) => <span className="whitespace-nowrap">{formatDate(row.createdAt)}</span>
    },
    {
      key: 'view',
      label: 'View',
      sortable: false,
      render: (row) => (
        <button
          type="button"
          onClick={() => setViewing(row)}
          title="View details"
          aria-label="View cancellation details"
          className="p-2 rounded-lg text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-colors"
        >
          <Eye size={18} />
        </button>
      )
    }
  ];

  if (viewing) {
    return <FeeCancellationDetail row={viewing} onBack={() => setViewing(null)} />;
  } 
  return (
    <div>
      <MasterHeader
        title="Fee Cancellation"
        searchValue={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder="Search Student Name, Admission No., Receipt No."
        addLabel="Add Fee Cancellation"
        onAdd={openAdd}
        canAdd={allowCancel}
        addDisabled={showForm}
        onFilter={() => setShowFilters((v) => !v)}
        filterOpen={showFilters}
        filterActive={hasActiveFilter}
        onExport={exporter.openModal}
      />

      {showFilters && (
        <div className="mb-4 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <FormField label="Class">
              <select
                value={filters.classId}
                onChange={(e) => updateFilter({ classId: e.target.value, sectionId: '', student: null })}
                className={inputClass}
              >
                <option value="">All classes</option>
                {classOptions.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Section">
              <select
                value={filters.sectionId}
                onChange={(e) => updateFilter({ sectionId: e.target.value, student: null })}
                disabled={!filters.classId}
                className={`${inputClass} disabled:opacity-60`}
              >
                <option value="">{filters.classId ? 'All sections' : 'Select a class first'}</option>
                {filterSections.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Student Name">
              <StudentSelect
                key={`${filters.classId}-${filters.sectionId}`}
                value={filters.student}
                onChange={(student) => updateFilter({ student })}
                classId={filters.classId}
                sectionId={filters.sectionId}
              />
            </FormField>
          </div>

          {hasActiveFilter && (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={clearFilters}
                className="px-4 py-2.5 rounded-xl text-sm font-bold bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 transition-colors"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      )}

      {showForm && (
        <InlineFormPanel
          title="Add Fee Cancellation"
          onSubmit={handleSubmit}
          onCancel={closeForm}
          saving={saving}
          submitLabel="Save"
          columns={3}
        >
          <FormField label="Class Name" required>
            <select
              value={form.classId}
              onChange={(e) => setForm({ ...EMPTY_FORM, classId: e.target.value })}
              className={inputClass}
            >
              <option value="">Select class</option>
              {classOptions.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Section Name" required={formSections.length > 0}>
            <select
              value={form.sectionId}
              onChange={(e) => setForm({ ...EMPTY_FORM, classId: form.classId, sectionId: e.target.value })}
              disabled={!form.classId}
              className={`${inputClass} disabled:opacity-60`}
            >
              <option value="">{form.classId ? 'Select section' : 'Select a class first'}</option>
              {formSections.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Student Name" required>
            <StudentSelect
              key={`${form.classId}-${form.sectionId}`}
              value={form.student}
              onChange={(student) => setForm((prev) => ({ ...prev, student, invoiceId: '' }))}
              classId={form.classId}
              sectionId={form.sectionId}
              disabled={!form.classId}
            />
          </FormField>

          {form.student && (
            <div className="md:col-span-3">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
                Paid fees (select the payment to cancel)
              </p>
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
                <table className="w-full text-left text-sm min-w-max">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <th className="p-3 pl-4 w-10" />
                      <th className="p-3">Category Name</th>
                      <th className="p-3">Receipt No</th>
                      <th className="p-3">Payment Mode</th>
                      <th className="p-3">Paid On</th>
                      <th className="p-3 pr-4">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {payments.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="p-6 text-center text-slate-500 dark:text-slate-400">
                          {paymentsLoading ? 'Loading...' : 'This student has no paid fees.'}
                        </td>
                      </tr>
                    ) : (
                      payments.map((p) => (
                        <tr key={p.id}>
                          <td className="p-3 pl-4">
                            <input
                              type="radio"
                              name="paymentToCancel"
                              checked={form.invoiceId === p.id}
                              onChange={() => setForm({ ...form, invoiceId: p.id })}
                              aria-label={`Select ${p.feeCategory}`}
                              className="accent-primary-600 w-4 h-4"
                            />
                          </td>
                          <td className="p-3 font-semibold">{p.feeCategory}</td>
                          <td className="p-3 font-mono">{p.receiptNumber || '-'}</td>
                          <td className="p-3">{p.paymentMode || '-'}</td>
                          <td className="p-3">{formatDate(p.paidAt)}</td>
                          <td className="p-3 pr-4 font-mono font-bold">{formatMoney(p.amount)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="md:col-span-3">
            <FormField label="Description" required>
              <textarea
                rows={3}
                maxLength={500}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="e.g. Wrong Entry, Wrong Student, Cheque Bounced"
                className={inputClass}
              />
            </FormField>
          </div>
        </InlineFormPanel>
      )}

      {/* The list is read-only: a cancellation cannot be edited or deleted */}
      <MasterTable
        columns={columns}
        rows={list.rows}
        loading={list.loading}
        sortBy={list.sortBy}
        order={list.order}
        onSort={list.handleSort}
        pagination={list.pagination}
        onPageChange={list.setPage}
        canEdit={false}
        canDelete={false}
        emptyTitle={list.search || hasActiveFilter ? 'No matching cancellations' : 'No cancellations yet'}
        emptyMessage={
          list.search || hasActiveFilter
            ? 'Try a different search or clear the filters.'
            : 'Click "Add Fee Cancellation" to cancel a wrong payment.'
        }
      />

            <ExportModal
        isOpen={exporter.open}
        onClose={exporter.closeModal}
        title="Export Fee Cancellations"
        subtitle="Customize file settings and select columns to export."
        defaultFileName="Fee_Cancellation"
        availableFields={exporter.availableFields}
        selectedFields={exporter.selected}
        onToggleField={exporter.toggleField}
        onSelectAll={exporter.selectAll}
        onExport={exporter.exportNow}
        exporting={exporter.exporting}
        exportButtonText="Generate Excel"
      />
      
    </div>
  );
}