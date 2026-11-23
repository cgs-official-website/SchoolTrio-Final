import React, { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { LuFilter as Filter, LuTrash2 as Trash2 } from 'react-icons/lu';
import { feeConcessionsApi, VALUE_TYPE_OPTIONS } from '../../../../api/feeConcessions';
import { feeCategoriesApi } from '../../../../api/feeCategories';
import { concessionCategoriesApi } from '../../../../api/concessionCategories';
import usePermissions from '../../../../hooks/usePermissions';
import { notifyDataChanged } from '../../../../utils/liveData';
import {
  MasterHeader,
  InlineFormPanel,
  FormField,
  inputClass,
  MasterTable,
  ConfirmDelete,
  useMasterList
} from '../FeeMaster/components';
import StudentSelect from './StudentSelect';
import useClassSectionOptions from './useClassSectionOptions';

const PAGE_SIZE = 20;
const AMOUNT_RE = /^\d+(\.\d{1,2})?$/;
const MAX_AMOUNT = 99999999.99;

const EMPTY_FORM = {
  classId: '',
  sectionId: '',
  student: null,
  selectedIds: [],
  valueType: '',
  value: '',
  concessionCategoryId: '',
  description: ''
};
const EMPTY_FILTERS = { classId: '', sectionId: '', student: null, feeCategoryId: '', concessionCategoryId: '' };

const formatMoney = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;

const formatDate = (iso) => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
};

const toPaise = (v) => Math.round(Number(v) * 100);

export default function FeeConcessionTab() {
  const { canCreate, canDelete } = usePermissions();
  const allowCreate = canCreate('fees');
  const allowDelete = canDelete('fees');

  const { classOptions, sectionOptions } = useClassSectionOptions();
  const [feeCategories, setFeeCategories] = useState([]);
  const [concessionCategories, setConcessionCategories] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [feeRes, concRes] = await Promise.all([
          feeCategoriesApi.listFeeCategories({ limit: 100, sortBy: 'name', order: 'asc' }),
          concessionCategoriesApi.listConcessionCategories({ limit: 100, sortBy: 'name', order: 'asc' })
        ]);
        if (cancelled) return;
        setFeeCategories(feeRes?.data || []);
        setConcessionCategories(concRes?.data || []);
      } catch (error) {
        if (!cancelled) toast.error(error.message || 'Failed to load categories.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------- filters (apply as soon as a value is picked) ----------
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  const filterParams = useMemo(() => {
    const params = {};
    if (filters.classId) params.classId = filters.classId;
    if (filters.sectionId) params.sectionId = filters.sectionId;
    if (filters.student) params.studentId = filters.student.value;
    if (filters.feeCategoryId) params.feeCategoryId = filters.feeCategoryId;
    if (filters.concessionCategoryId) params.concessionCategoryId = filters.concessionCategoryId;
    return params;
  }, [filters]);

  const hasActiveFilter = Object.keys(filterParams).length > 0;

  const fetcher = useCallback(
    (params) => feeConcessionsApi.listFeeConcessions({ ...params, ...filterParams }),
    [filterParams]
  );

  const list = useMasterList({
    fetcher,
    defaultSortBy: 'createdAt',
    defaultOrder: 'desc',
    limit: PAGE_SIZE,
    errorMessage: 'Failed to load concessions.'
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

  const formSections = useMemo(
    () => sectionOptions.filter((s) => s.classId === form.classId),
    [sectionOptions, form.classId]
  );

  const studentId = form.student?.value;

  useEffect(() => {
    if (!showForm || !studentId) {
      setFees([]);
      return undefined;
    }
    let cancelled = false;
    setFeesLoading(true);
    feeConcessionsApi
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

  // What each selected fee would get, so problems show before saving
  const preview = useMemo(() => {
    const v = Number(form.value);
    const valid = form.valueType && AMOUNT_RE.test(String(form.value).trim()) && v > 0;
    const map = {};
    for (const f of fees) {
      if (!form.selectedIds.includes(f.id) || !valid) continue;
      const give = form.valueType === 'PERCENTAGE' ? Math.round(f.amount * v) / 100 : v;
      map[f.id] = { give, tooMuch: toPaise(give) > toPaise(f.balance) };
    }
    return map;
  }, [fees, form.selectedIds, form.valueType, form.value]);

  const allSelected = fees.length > 0 && fees.every((f) => form.selectedIds.includes(f.id));

  const toggleFee = (id) =>
    setForm((prev) => ({
      ...prev,
      selectedIds: prev.selectedIds.includes(id)
        ? prev.selectedIds.filter((x) => x !== id)
        : [...prev.selectedIds, id]
    }));

  const toggleAllFees = () =>
    setForm((prev) => ({ ...prev, selectedIds: allSelected ? [] : fees.map((f) => f.id) }));

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setForm(EMPTY_FORM);
    setFees([]);
  };

  // ---------- delete ----------
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

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
    if (form.selectedIds.length === 0) return toast.error('Select at least one fee.');
    if (!form.valueType) return toast.error('Select Percentage or Rupees.');

    const valueText = String(form.value).trim();
    if (!AMOUNT_RE.test(valueText) || Number(valueText) <= 0) {
      return toast.error('Enter a valid amount greater than zero, with at most 2 decimal places.');
    }
    if (form.valueType === 'PERCENTAGE' && Number(valueText) > 100) {
      return toast.error('Percentage cannot be more than 100.');
    }
    if (Number(valueText) > MAX_AMOUNT) return toast.error('Amount is too large.');
    if (!form.concessionCategoryId) return toast.error('Select a concession category.');

    const tooMuch = fees.find((f) => preview[f.id]?.tooMuch);
    if (tooMuch) {
      return toast.error(
        `Concession of ${formatMoney(preview[tooMuch.id].give)} on ${tooMuch.feeCategory} is more than its balance of ${formatMoney(tooMuch.balance)}.`
      );
    }

    setSaving(true);
    try {
      const res = await feeConcessionsApi.createFeeConcession({
        studentId: form.student.value,
        invoiceIds: form.selectedIds,
        valueType: form.valueType,
        value: Number(valueText),
        concessionCategoryId: form.concessionCategoryId,
        description: form.description.trim() || undefined
      });
      const { created = 0, totalAmount = 0 } = res?.data || {};
      toast.success(`Concession of ${formatMoney(totalAmount)} added on ${created} fee${created === 1 ? '' : 's'}.`);
      closeForm();
      list.setPage(1);
      await afterChange();
    } catch (error) {
      toast.error(error.message || 'Failed to add concession.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await feeConcessionsApi.deleteFeeConcession(deleteTarget.id);
      toast.success('Concession deleted.');
      setDeleteTarget(null);
      await afterChange();
    } catch (error) {
      toast.error(error.message || 'Failed to delete concession.');
    } finally {
      setDeleting(false);
    }
  };

  // ---------- table ----------
  const columns = [
    { key: 'admissionNumber', label: 'Admission No', sortable: true, className: 'font-mono' },
    { key: 'studentName', label: 'Student Name', sortable: true, className: 'font-semibold' },
    { key: 'className', label: 'Class', sortable: true },
    { key: 'sectionName', label: 'Section', sortable: true },
    { key: 'feeCategory', label: 'Fee Category', sortable: true, className: 'font-semibold' },
    {
      key: 'amount',
      label: 'Amount',
      sortable: true,
      render: (row) => (
        <div className="whitespace-nowrap">
          <div className="font-mono font-bold">{formatMoney(row.amount)}</div>
          {row.valueType === 'PERCENTAGE' && (
            <div className="text-xs text-slate-500 dark:text-slate-400">{row.value}%</div>
          )}
        </div>
      )
    },
    {
      key: 'createdAt',
      label: 'Date',
      sortable: true,
      render: (row) => <span className="whitespace-nowrap">{formatDate(row.createdAt)}</span>
    },
    { key: 'concessionType', label: 'Concession Type', sortable: true },
    { key: 'concessionCategory', label: 'Concession Category', sortable: true },
    {
      key: 'actions',
      label: 'Action',
      sortable: false,
      render: (row) => {
        if (row.locked) {
          return (
            <span className="inline-flex px-3 py-1 rounded-lg text-xs font-bold bg-green-100 text-green-700 border border-green-200">
              Paid
            </span>
          );
        }
        if (!allowDelete) return null;
        return (
          <button
            type="button"
            onClick={() => setDeleteTarget(row)}
            title="Delete"
            aria-label="Delete concession"
            className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
          >
            <Trash2 size={16} />
          </button>
        );
      }
    }
  ];

  return (
    <div>
      <MasterHeader
        title="Concession"
        searchValue={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder="Search Student Name, Admission No."
        addLabel="Add Fee Concession"
        onAdd={openAdd}
        canAdd={allowCreate}
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

            <FormField label="Fee Category">
              <select
                value={filters.feeCategoryId}
                onChange={(e) => updateFilter({ feeCategoryId: e.target.value })}
                className={inputClass}
              >
                <option value="">All fee categories</option>
                {feeCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Concession Category">
              <select
                value={filters.concessionCategoryId}
                onChange={(e) => updateFilter({ concessionCategoryId: e.target.value })}
                className={inputClass}
              >
                <option value="">All concession categories</option>
                {concessionCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
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
          title="Add Fee Concession"
          onSubmit={handleSubmit}
          onCancel={closeForm}
          saving={saving}
          submitLabel="Save"
          columns={3}
        >
          <FormField label="Class Name" required>
            <select
              value={form.classId}
              onChange={(e) =>
                setForm({ ...EMPTY_FORM, classId: e.target.value })
              }
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
              onChange={(student) => setForm((prev) => ({ ...prev, student, selectedIds: [] }))}
              classId={form.classId}
              sectionId={form.sectionId}
              disabled={!form.classId}
            />
          </FormField>

          {form.student && (
            <div className="md:col-span-3">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
                Pending fees {form.selectedIds.length > 0 && `(${form.selectedIds.length} selected)`}
              </p>
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
                <table className="w-full text-left text-sm min-w-max">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <th className="p-3 pl-4 w-10">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleAllFees}
                          disabled={fees.length === 0}
                          aria-label="Select all fees"
                          className="accent-primary-600 w-4 h-4"
                        />
                      </th>
                      <th className="p-3">Category Name</th>
                      <th className="p-3">Due Date</th>
                      <th className="p-3">Amount</th>
                      <th className="p-3">Concession Given</th>
                      <th className="p-3">Balance</th>
                      <th className="p-3 pr-4">This Concession</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {fees.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="p-6 text-center text-slate-500 dark:text-slate-400">
                          {feesLoading ? 'Loading...' : 'This student has no pending fees.'}
                        </td>
                      </tr>
                    ) : (
                      fees.map((f) => {
                        const p = preview[f.id];
                        return (
                          <tr key={f.id}>
                            <td className="p-3 pl-4">
                              <input
                                type="checkbox"
                                checked={form.selectedIds.includes(f.id)}
                                onChange={() => toggleFee(f.id)}
                                aria-label={`Select ${f.feeCategory}`}
                                className="accent-primary-600 w-4 h-4"
                              />
                            </td>
                            <td className="p-3 font-semibold">{f.feeCategory}</td>
                            <td className="p-3">{f.dueDate}</td>
                            <td className="p-3 font-mono">{formatMoney(f.amount)}</td>
                            <td className="p-3 font-mono">{formatMoney(f.concession)}</td>
                            <td className="p-3 font-mono font-bold">{formatMoney(f.balance)}</td>
                            <td
                              className={`p-3 pr-4 font-mono ${
                                p?.tooMuch ? 'text-red-600 font-bold' : 'text-slate-700 dark:text-slate-200'
                              }`}
                            >
                              {p ? `${formatMoney(p.give)}${p.tooMuch ? ' (too much)' : ''}` : '-'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <FormField label="Type" required>
            <div className="flex items-center gap-6 py-2.5">
              {VALUE_TYPE_OPTIONS.map((o) => (
                <label key={o.value} className="inline-flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <input
                    type="radio"
                    name="valueType"
                    value={o.value}
                    checked={form.valueType === o.value}
                    onChange={() => setForm({ ...form, valueType: o.value })}
                    className="accent-primary-600 w-4 h-4"
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </FormField>

          <FormField
            label={form.valueType === 'PERCENTAGE' ? 'Percentage (%)' : 'Amount'}
            required
            hint={form.valueType === 'RUPEES' ? 'Applied to each selected fee' : undefined}
          >
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
              placeholder={form.valueType === 'PERCENTAGE' ? 'e.g. 10' : 'Enter Amount'}
              className={inputClass}
            />
          </FormField>

          <FormField
            label="Concession Category"
            required
            hint={concessionCategories.length === 0 ? 'No concession categories yet. Add one in Fee Master first.' : undefined}
          >
            <select
              value={form.concessionCategoryId}
              onChange={(e) => setForm({ ...form, concessionCategoryId: e.target.value })}
              className={inputClass}
            >
              <option value="">Select concession category</option>
              {concessionCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </FormField>

          <div className="md:col-span-3">
            <FormField label="Description">
              <textarea
                rows={3}
                maxLength={500}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Enter the Description"
                className={inputClass}
              />
            </FormField>
          </div>
        </InlineFormPanel>
      )}

      {/* Row actions are rendered by the "Action" column above, so MasterTable's built-in ones are off. */}
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
        emptyTitle={list.search || hasActiveFilter ? 'No matching concessions' : 'No concessions yet'}
        emptyMessage={
          list.search || hasActiveFilter
            ? 'Try a different search or clear the filters.'
            : 'Click "Add Fee Concession" to give the first one.'
        }
      />

      <ConfirmDelete
        open={Boolean(deleteTarget)}
        title="Delete concession?"
        message={
          deleteTarget
            ? `The ${formatMoney(deleteTarget.amount)} concession on ${deleteTarget.feeCategory} for ${deleteTarget.studentName} will be removed and the fee goes back to its full balance. This works only while the fee is unpaid.`
            : ''
        }
        deleting={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}