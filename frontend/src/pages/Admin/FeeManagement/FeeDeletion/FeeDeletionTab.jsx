import React, { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { LuFilter as Filter } from 'react-icons/lu';
import { feeDeletionsApi } from '../../../../api/feeDeletions';
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

const PAGE_SIZE = 20;
const EMPTY_FORM = { student: null, selectedIds: [], reason: '' };
const EMPTY_FILTERS = { classId: '', sectionId: '', student: null };

const formatMoney = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;

const formatDate = (iso) => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
};

export default function FeeDeletionTab() {
  const { canDelete } = usePermissions();
  // Same permission the backend checks (delete)
  const allowDelete = canDelete('fees');

  const { classOptions, sectionOptions } = useClassSectionOptions();

  // ---------- filters (apply as soon as a value is picked) ----------
  const [showFilters, setShowFilters] = useState(false);
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
    (params) => feeDeletionsApi.listFeeDeletions({ ...params, ...filterParams }),
    [filterParams]
  );

  const list = useMasterList({
    fetcher,
    defaultSortBy: 'createdAt',
    defaultOrder: 'desc',
    limit: PAGE_SIZE,
    errorMessage: 'Failed to load deleted fees.'
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
  const [fees, setFees] = useState([]);
  const [feesLoading, setFeesLoading] = useState(false);

  const studentId = form.student?.value;

  useEffect(() => {
    if (!showForm || !studentId) {
      setFees([]);
      return undefined;
    }
    let cancelled = false;
    setFeesLoading(true);
    feeDeletionsApi
      .listStudentFees(studentId)
      .then((res) => {
        if (!cancelled) setFees(res?.data || []);
      })
      .catch((error) => {
        if (!cancelled) {
          setFees([]);
          toast.error(error.message || 'Failed to load student fees.');
        }
      })
      .finally(() => {
        if (!cancelled) setFeesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showForm, studentId]);

  const deletableFees = useMemo(() => fees.filter((f) => f.deletable), [fees]);
  const allSelected =
    deletableFees.length > 0 && deletableFees.every((f) => form.selectedIds.includes(f.id));

  const toggleFee = (id) =>
    setForm((prev) => ({
      ...prev,
      selectedIds: prev.selectedIds.includes(id)
        ? prev.selectedIds.filter((x) => x !== id)
        : [...prev.selectedIds, id]
    }));

  const toggleAll = () =>
    setForm((prev) => ({ ...prev, selectedIds: allSelected ? [] : deletableFees.map((f) => f.id) }));

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setForm(EMPTY_FORM);
    setFees([]);
  };

  const afterChange = async () => {
    notifyDataChanged('fees');
    notifyDataChanged('invoices');
    await list.reload();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.student) return toast.error('Select a student.');
    if (form.selectedIds.length === 0) return toast.error('Select at least one fee to delete.');
    if (form.reason.trim().length < 3) return toast.error('Enter the reason for deleting.');

    const ok = window.confirm(
      `Delete ${form.selectedIds.length} fee${form.selectedIds.length === 1 ? '' : 's'} for ${form.student.label}?\n\n` +
        'Any concession on these fees is removed too. This cannot be undone.'
    );
    if (!ok) return;

    setSaving(true);
    try {
      const res = await feeDeletionsApi.createFeeDeletion({
        studentId: form.student.value,
        invoiceIds: form.selectedIds,
        reason: form.reason.trim()
      });
      const deleted = res?.data?.deleted ?? form.selectedIds.length;
      toast.success(`${deleted} fee${deleted === 1 ? '' : 's'} deleted.`);
      closeForm();
      list.setPage(1);
      await afterChange();
    } catch (error) {
      toast.error(error.message || 'Failed to delete fees.');
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
    { key: 'feeCategory', label: 'Category Name', sortable: true, className: 'font-semibold' },
    { key: 'dueDate', label: 'Due Date', sortable: true },
    {
      key: 'amount',
      label: 'Amount',
      sortable: true,
      render: (row) => <span className="font-mono font-bold whitespace-nowrap">{formatMoney(row.amount)}</span>
    },
    { key: 'reason', label: 'Reason', sortable: false },
    { key: 'deletedBy', label: 'Deleted By', sortable: false },
    {
      key: 'createdAt',
      label: 'Date',
      sortable: true,
      render: (row) => <span className="whitespace-nowrap">{formatDate(row.createdAt)}</span>
    }
  ];

  return (
    <div>
      <MasterHeader
        title="Specific Student Fee Entry Delete"
        searchValue={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder="Search Student Name, Admission No., Category"
        addLabel="Add Student Fee Delete"
        onAdd={openAdd}
        canAdd={allowDelete}
        addDisabled={showForm}
      />

      {/* Filter icon: right side, below the Add button */}
      <div className="flex justify-end mb-3">
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          aria-label="Toggle filters"
          aria-expanded={showFilters}
          title="Filter"
          className={`relative p-2.5 rounded-xl border transition-colors ${
            showFilters
              ? 'bg-primary-600 border-primary-600 text-white'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Filter size={18} />
          {hasActiveFilter && !showFilters && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-white dark:border-slate-900" />
          )}
        </button>
      </div>

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
          title="Add Student Fee Delete"
          onSubmit={handleSubmit}
          onCancel={closeForm}
          saving={saving}
          submitLabel="Delete"
          columns={2}
        >
          <FormField label="Student Name" required>
            <StudentSelect
              value={form.student}
              onChange={(student) => setForm((prev) => ({ ...prev, student, selectedIds: [] }))}
            />
          </FormField>

          <FormField label="Reason" required>
            <input
              type="text"
              maxLength={500}
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder="e.g. Route Change, Unwanted Fee"
              className={inputClass}
            />
          </FormField>

          {form.student && (
            <div className="md:col-span-2">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
                Student fees {form.selectedIds.length > 0 && `(${form.selectedIds.length} selected)`}
              </p>
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
                <table className="w-full text-left text-sm min-w-max">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <th className="p-3 pl-4 w-10">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleAll}
                          disabled={deletableFees.length === 0}
                          aria-label="Select all deletable fees"
                          className="accent-primary-600 w-4 h-4"
                        />
                      </th>
                      <th className="p-3">Category Name</th>
                      <th className="p-3">Due Date</th>
                      <th className="p-3">Amount</th>
                      <th className="p-3">Paid Amount</th>
                      <th className="p-3">Concession Amount</th>
                      <th className="p-3">Balance</th>
                      <th className="p-3 pr-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {fees.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="p-6 text-center text-slate-500 dark:text-slate-400">
                          {feesLoading ? 'Loading...' : 'This student has no fees.'}
                        </td>
                      </tr>
                    ) : (
                      fees.map((f) => (
                        <tr key={f.id}>
                          <td className="p-3 pl-4">
                            {f.deletable ? (
                              <input
                                type="checkbox"
                                checked={form.selectedIds.includes(f.id)}
                                onChange={() => toggleFee(f.id)}
                                aria-label={`Select ${f.feeCategory}`}
                                className="accent-primary-600 w-4 h-4"
                              />
                            ) : null}
                          </td>
                          <td className="p-3 font-semibold">{f.feeCategory}</td>
                          <td className="p-3">{f.dueDate}</td>
                          <td className="p-3 font-mono">{formatMoney(f.amount)}</td>
                          <td className="p-3 font-mono">{formatMoney(f.paidAmount)}</td>
                          <td className="p-3 font-mono">{formatMoney(f.concessionAmount)}</td>
                          <td className="p-3 font-mono font-bold">{formatMoney(f.balance)}</td>
                          <td className="p-3 pr-4">{f.status}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </InlineFormPanel>
      )}

      {/* The list is read-only: a deleted fee cannot be restored */}
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
        emptyTitle={list.search || hasActiveFilter ? 'No matching deleted fees' : 'No deleted fees yet'}
        emptyMessage={
          list.search || hasActiveFilter
            ? 'Try a different search or clear the filters.'
            : 'Click "Add Student Fee Delete" to remove a fee from a student.'
        }
      />
    </div>
  );
}