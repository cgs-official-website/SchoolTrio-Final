import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  LuPencil as Pencil,
  LuX as X
} from 'react-icons/lu';
import { classesApi } from '../../../../api/classes';
import { feeCategoriesApi } from '../../../../api/feeCategories';
import { studentsApi } from '../../../../api/students';
import {
  feeEntriesApi,
  FEE_TYPE_OPTIONS,
  FEE_TYPE_LABELS,
  GENDER_OPTIONS
} from '../../../../api/feeEntries';
import usePermissions from '../../../../hooks/usePermissions';
import { sortClassesAscending, sortSectionsAscending, formatClassSection } from '../../../../utils/classSorting';
import { notifyDataChanged } from '../../../../utils/liveData';
import { getTodayDateString } from '../../../../utils/validationUtils';
import {
  MasterHeader,
  InlineFormPanel,
  FormField,
  inputClass,
  MasterTable,
  useMasterList,
  useDebouncedValue
} from '../FeeMaster/components';
import FeeEntryTargetPicker from './FeeEntryTargetPicker';
import ExportModal from '../../../../components/ExportModal';
import useExcelExport from '../../../../hooks/useExcelExport';
import { formatExportDate } from '../../../../utils/excelExport';

const PAGE_SIZE = 20;
const MAX_TARGETS = 1000;
const MAX_AMOUNT = 99999999.99;
const AMOUNT_RE = /^\d+(\.\d{1,2})?$/;

const EMPTY_FORM = { feeType: '', targets: [], feeCategoryId: '', gender: '', amount: '', dueDate: '' };

// ---------- filter config ----------
const SEARCH_TYPE_OPTIONS = [
  { value: 'CATEGORY', label: 'Category' },
  { value: 'STUDENT', label: 'Student Entry' },
  { value: 'CLASS', label: 'Specific Class Entry' },
  { value: 'SECTION', label: 'Specific Class Section Entry' }
];
const EMPTY_FILTERS = { searchType: '', categoryId: '', student: null, classId: '', sectionId: '' };

const TARGET_NOUN = {
  CLASS: ['class', 'classes'],
  SECTION: ['class section', 'class sections'],
  STUDENT: ['student', 'students']
};
const TARGET_FIELD_LABEL = {
  CLASS: 'Select Classes',
  SECTION: 'Select Class Sections',
  STUDENT: 'Select Students'
};

const TYPE_BADGE = {
  ALL_STUDENT: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  CLASS: 'bg-primary-50 text-primary-700 border-primary-100',
  SECTION: 'bg-teal-50 text-teal-700 border-teal-100',
  STUDENT: 'bg-amber-50 text-amber-700 border-amber-100'
};

const EXPORT_COLUMNS = [
  { key: 'className', label: 'Class', value: (r) => r.className },
  { key: 'sectionName', label: 'Section', value: (r) => r.sectionName },
  { key: 'gender', label: 'Gender', value: (r) => r.gender },
  { key: 'studentName', label: 'Student Name', value: (r) => r.studentName },
  { key: 'admissionNumber', label: 'Admission No', value: (r) => r.admissionNumber },
  { key: 'amount', label: 'Amount', value: (r) => r.amount },
  { key: 'concessionAmount', label: 'Concession', value: (r) => r.concessionAmount },
  { key: 'balance', label: 'Balance', value: (r) => r.balance },
  { key: 'feeCategory', label: 'Fee Category', value: (r) => r.feeCategory },
  { key: 'feeType', label: 'Student Type', value: (r) => FEE_TYPE_LABELS[r.feeType] || r.feeType },
  { key: 'dueDate', label: 'Due Date', value: (r) => formatExportDate(r.dueDate) },
  { key: 'status', label: 'Status', value: (r) => r.status }
];

const formatMoney = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;

const isPaidRow = (row) => Boolean(row.locked) || String(row.status || '').toLowerCase() === 'paid';

// Class list responses may or may not carry section ids; fetch them per class when they do not.
const needsSectionFetch = (c) =>
  !Array.isArray(c.sections) || c.sections.some((s) => !s || typeof s !== 'object' || !s.id);

/**
 * Single-select student search with dropdown (used only by the filter panel).
 */
function StudentFilterSelect({ value, onChange }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounced = useDebouncedValue(query, 350);
  const requestRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    const requestId = ++requestRef.current;
    setLoading(true);
    studentsApi
      .listStudents({ search: debounced.trim(), limit: 20 })
      .then((res) => {
        if (requestId !== requestRef.current) return;
        setOptions(
          (res?.data || []).map((s) => {
            const name = [s.firstName, s.lastName].filter(Boolean).join(' ') || 'Unnamed student';
            const extra = [s.admissionNumber, s.class?.name || s.className].filter(Boolean).join(' • ');
            return { value: s.id, label: extra ? `${name} (${extra})` : name };
          })
        );
      })
      .catch((error) => {
        if (requestId !== requestRef.current) return;
        setOptions([]);
        toast.error(error.message || 'Failed to load students.');
      })
      .finally(() => {
        if (requestId === requestRef.current) setLoading(false);
      });
  }, [debounced, open]);

  if (value) {
    return (
      <div className={`${inputClass} flex items-center justify-between gap-2`}>
        <span className="truncate">{value.label}</span>
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label="Clear student"
          className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 shrink-0"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search Student Name or Admission No."
        className={inputClass}
      />
      {open && (
        <ul className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg">
          {options.length === 0 ? (
            <li className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
              {loading ? 'Loading...' : 'No students found.'}
            </li>
          ) : (
            options.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(o);
                    setQuery('');
                    setOpen(false);
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  {o.label}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

export default function FeeEntryTab() {
  const { canCreate, canEdit } = usePermissions();
  const allowCreate = canCreate('fees');
  const allowEdit = canEdit('fees');

  // ---------- filters ----------
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  const filterParams = useMemo(() => {
  switch (filters.searchType) {
    case 'CATEGORY':
      return filters.categoryId ? { feeCategoryId: filters.categoryId } : {};
    case 'STUDENT':
      return filters.student ? { studentId: filters.student.value } : {};
    case 'CLASS':
      return filters.classId ? { classId: filters.classId } : {};
    case 'SECTION':
      if (!filters.classId) return {};
      return {
        classId: filters.classId,
        ...(filters.sectionId ? { sectionId: filters.sectionId } : {})
      };
    default:
      return {};
  }
}, [filters]);

  const hasActiveFilter = Object.keys(filterParams).length > 0;

  const fetcher = useCallback(
    (params) => feeEntriesApi.listFeeEntries({ ...params, ...filterParams }),
    [filterParams]
  );

  const list = useMasterList({
    fetcher,
    defaultSortBy: 'createdAt',
    defaultOrder: 'desc',
    limit: PAGE_SIZE,
    errorMessage: 'Failed to load fee entries.'
  });

  const exporter = useExcelExport({
    columns: EXPORT_COLUMNS,
    fetcher,
    getQuery: () => ({ search: list.search, sortBy: list.sortBy, order: list.order }),
    defaultFileName: 'Fee_Structure',
    sheetName: 'Fee Structure'
  });

  const updateFilter = (patch) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    list.setPage(1);
  };

  const changeSearchType = (searchType) => {
    setFilters({ ...EMPTY_FILTERS, searchType });
    list.setPage(1);
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    list.setPage(1);
  };

  // ---------- reference data: classes, sections, fee categories ----------
  const [classOptions, setClassOptions] = useState([]);
  const [sectionOptions, setSectionOptions] = useState([]);
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [classRes, categoryRes] = await Promise.all([
          classesApi.listClasses({ limit: 100 }),
          feeCategoriesApi.listFeeCategories({ limit: 100, sortBy: 'name', order: 'asc' })
        ]);

        const classes = sortClassesAscending(classRes?.data || []);

        const fetchedSections = {};
        await Promise.all(
          classes.filter(needsSectionFetch).map(async (c) => {
            try {
              const res = await classesApi.listSections(c.id);
              fetchedSections[c.id] = res?.data || [];
            } catch {
              fetchedSections[c.id] = [];
            }
          })
        );

        if (cancelled) return;

        const classList = [];
        const sectionList = [];
        for (const c of classes) {
          classList.push({ value: c.id, label: c.name });
          const sections = needsSectionFetch(c) ? fetchedSections[c.id] || [] : c.sections;
          for (const s of sortSectionsAscending(sections)) {
            if (!s || typeof s !== 'object' || !s.id) continue;
            sectionList.push({
              value: s.id,
              classId: c.id,
              label: formatClassSection({ name: c.name, section: s.name })
            });
          }
        }

        setClassOptions(classList);
        setSectionOptions(sectionList);
        setCategories(categoryRes?.data || []);
      } catch (error) {
        if (!cancelled) toast.error(error.message || 'Failed to load classes and fee categories.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Sections of the class picked in the filter (section label is just the section name here).
  const filterSectionOptions = useMemo(
    () => sectionOptions.filter((s) => s.classId === filters.classId),
    [sectionOptions, filters.classId]
  );

  // ---------- add form ----------
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // ---------- edit form ----------
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ amount: '', dueDate: '' });

  const afterChange = async () => {
    notifyDataChanged('fees');
    notifyDataChanged('invoices');
    await list.reload();
  };

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setForm(EMPTY_FORM);
  };

  const handleFeeTypeChange = (feeType) => {
    setForm((prev) => ({
      ...prev,
      feeType,
      targets: [],
      gender: feeType === 'STUDENT' ? '' : prev.gender
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.feeType) {
      toast.error('Select a fee type name.');
      return;
    }

    const isAll = form.feeType === 'ALL_STUDENT';
    const [noun, nounPlural] = TARGET_NOUN[form.feeType] || [];

    if (!isAll && form.targets.length === 0) {
      toast.error(`Select at least one ${noun}.`);
      return;
    }
    if (form.targets.length > MAX_TARGETS) {
      toast.error(`You can select at most ${MAX_TARGETS} ${nounPlural} at a time.`);
      return;
    }
    if (!form.feeCategoryId) {
      toast.error('Select a category name.');
      return;
    }

    const amountText = String(form.amount).trim();
    if (!AMOUNT_RE.test(amountText) || Number(amountText) <= 0) {
      toast.error('Enter a valid amount greater than zero, with at most 2 decimal places.');
      return;
    }
    if (Number(amountText) > MAX_AMOUNT) {
      toast.error('Amount is too large.');
      return;
    }

    if (!form.dueDate) {
      toast.error('Due date is required.');
      return;
    }
    if (form.dueDate < getTodayDateString()) {
      toast.error('Due date cannot be in the past.');
      return;
    }

    const category = categories.find((c) => c.id === form.feeCategoryId);
    const gender = form.feeType === 'STUDENT' ? null : form.gender || null;

    // A wrong All Student / Class / Section entry creates many invoices, and each is removed one by one.
    if (form.feeType !== 'STUDENT') {
      const who = isAll
        ? 'ALL active students'
        : `${form.targets.length} ${form.targets.length === 1 ? noun : nounPlural}`;
      const ok = window.confirm(
        `Create ${category?.name || 'this fee'} of ${formatMoney(amountText)} for ${who}${gender ? ` (${gender} only)` : ''}, due ${form.dueDate}?\n\nA pending fee is created for every matching active student.`
      );
      if (!ok) return;
    }

    const payload = {
      feeType: form.feeType,
      targetIds: isAll ? [] : form.targets.map((t) => t.value),
      feeCategoryId: form.feeCategoryId,
      gender,
      amount: Number(amountText),
      dueDate: form.dueDate
    };

    setSaving(true);
    try {
      const res = await feeEntriesApi.createFeeEntry(payload);
      const { matched = 0, generated = 0, skipped = 0 } = res?.data || {};

      if (matched === 0) {
        toast('Saved, but no active students match yet. Students who join later will get this fee automatically.', {
          duration: 7000
        });
      } else if (generated === 0) {
        toast(`No new fees created: all ${matched} matching student${matched === 1 ? '' : 's'} already have this fee.`, {
          duration: 7000
        });
      } else {
        toast.success(
          `Fee created for ${generated} student${generated === 1 ? '' : 's'}.` +
            (skipped > 0 ? ` ${skipped} skipped (already billed).` : '')
        );
      }

      closeForm();
      list.setPage(1);
      await afterChange();
    } catch (error) {
      toast.error(error.message || 'Failed to create fee entry.');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (row) => {
    if (isPaidRow(row)) {
      toast.error('This fee is already paid and cannot be edited.');
      return;
    }
    closeForm();
    setEditing(row);
    setEditForm({ amount: String(row.amount), dueDate: row.dueDate || '' });
  };

  const closeEdit = () => {
    setEditing(null);
    setEditForm({ amount: '', dueDate: '' });
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editing) return;

    const amountText = String(editForm.amount).trim();
    if (!AMOUNT_RE.test(amountText) || Number(amountText) <= 0) {
      toast.error('Enter a valid amount greater than zero, with at most 2 decimal places.');
      return;
    }
    if (Number(amountText) > MAX_AMOUNT) {
      toast.error('Amount is too large.');
      return;
    }
    if (!editForm.dueDate) {
      toast.error('Due date is required.');
      return;
    }
    if (editForm.dueDate !== editing.dueDate && editForm.dueDate < getTodayDateString()) {
      toast.error('Due date cannot be in the past.');
      return;
    }

    const payload = {};
    if (Number(amountText) !== Number(editing.amount)) payload.amount = Number(amountText);
    if (editForm.dueDate !== editing.dueDate) payload.dueDate = editForm.dueDate;

    if (Object.keys(payload).length === 0) {
      toast('Nothing changed.');
      closeEdit();
      return;
    }

    setSaving(true);
    try {
      await feeEntriesApi.updateFeeEntry(editing.id, payload);
      toast.success('Fee entry updated.');
      closeEdit();
      await afterChange();
    } catch (error) {
      toast.error(error.message || 'Failed to update fee entry.');
    } finally {
      setSaving(false);
    }
  };

  // ---------- table ----------
  const columns = [
    { key: 'className', label: 'Class', sortable: true },
    { key: 'sectionName', label: 'Section', sortable: true },
    { key: 'gender', label: 'Gender', sortable: true },
    {
      key: 'studentName',
      label: 'Student Name',
      sortable: true,
      render: (row) => (
        <div>
          <div className="font-semibold">{row.studentName}</div>
          {row.admissionNumber && (
            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">{row.admissionNumber}</div>
          )}
        </div>
      )
    },
    {
      key: 'amount',
      label: 'Amount',
      sortable: true,
      render: (row) => <span className="font-mono font-bold whitespace-nowrap">{formatMoney(row.amount)}</span>
    },
    {
      key: 'concessionAmount',
      label: 'Concession',
      sortable: false,
      render: (row) => (
        <span className="font-mono whitespace-nowrap">
          {row.concessionAmount > 0 ? formatMoney(row.concessionAmount) : '-'}
        </span>
      )
    },
    {
      key: 'balance',
      label: 'Balance',
      sortable: false,
      render: (row) => (
        <span className="font-mono font-bold whitespace-nowrap">{formatMoney(row.balance)}</span>
      )
    },
    { key: 'feeCategory', label: 'Fee Category', sortable: true, className: 'font-semibold' },
    {
      key: 'feeType',
      label: 'Student Type',
      sortable: true,
      render: (row) => (
        <span
          className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-bold border ${
            TYPE_BADGE[row.feeType] || TYPE_BADGE.CLASS
          }`}
        >
          {FEE_TYPE_LABELS[row.feeType] || row.feeType}
        </span>
      )
    },
    {
      key: 'actions',
      label: 'Action',
      sortable: false,
      render: (row) => {
        if (isPaidRow(row)) {
          return (
            <span className="inline-flex px-3 py-1 rounded-lg text-xs font-bold bg-green-100 text-green-700 border border-green-200">
              Paid
            </span>
          );
        }
        if (!allowEdit) return null;
        return (
          <button
            type="button"
            onClick={() => openEdit(row)}
            title="Edit"
            aria-label="Edit fee entry"
            className="p-2 rounded-lg text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-colors"
          >
            <Pencil size={16} />
          </button>
        );
      }
    }
  ];

  const feeTypeNeedsTarget = form.feeType && form.feeType !== 'ALL_STUDENT';
  const dateInputMin = getTodayDateString();

  return (
    <div>
      <MasterHeader
        title="Fee Entry Details"
        searchValue={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder="Search Student Name, Admission No."
        addLabel="Add Fee Entry"
        onAdd={openAdd}
        canAdd={allowCreate}
        addDisabled={showForm || Boolean(editing)}
        onFilter={() => setShowFilters((v) => !v)}
        filterOpen={showFilters}
        filterActive={hasActiveFilter}
        onExport={exporter.openModal}
      />

      {showFilters && (
        <div className="mb-4 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <FormField label="Search Type">
              <select
                value={filters.searchType}
                onChange={(e) => changeSearchType(e.target.value)}
                className={inputClass}
              >
                <option value="">Select search type</option>
                {SEARCH_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </FormField>

            {filters.searchType === 'CATEGORY' && (
              <FormField label="Category Name">
                <select
                  value={filters.categoryId}
                  onChange={(e) => updateFilter({ categoryId: e.target.value })}
                  className={inputClass}
                >
                  <option value="">Select category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </FormField>
            )}

            {filters.searchType === 'STUDENT' && (
              <FormField label="Student Name">
                <StudentFilterSelect value={filters.student} onChange={(student) => updateFilter({ student })} />
              </FormField>
            )}

            {(filters.searchType === 'CLASS' || filters.searchType === 'SECTION') && (
              <FormField label="Class">
                <select
                  value={filters.classId}
                  onChange={(e) => updateFilter({ classId: e.target.value, sectionId: '' })}
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
            )}

            {filters.searchType === 'SECTION' && (
              <FormField label="Section">
                <select
                  value={filters.sectionId}
                  onChange={(e) => updateFilter({ sectionId: e.target.value })}
                  disabled={!filters.classId}
                  className={`${inputClass} disabled:opacity-60`}
                >
                  <option value="">{filters.classId ? 'All sections' : 'Select a class first'}</option>
                  {filterSectionOptions.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </FormField>
            )}
          </div>

          {(filters.searchType || hasActiveFilter) && (
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
          title="Add Fee Entry"
          onSubmit={handleSubmit}
          onCancel={closeForm}
          saving={saving}
          submitLabel="Save"
          columns={3}
        >
          <FormField label="Fee Type Name" required>
            <select
              value={form.feeType}
              onChange={(e) => handleFeeTypeChange(e.target.value)}
              className={inputClass}
            >
              <option value="">Select fee type</option>
              {FEE_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </FormField>

          <FormField
            label="Category Name"
            required
            hint={categories.length === 0 ? 'No fee categories yet. Add one in Fee Master first.' : undefined}
          >
            <select
              value={form.feeCategoryId}
              onChange={(e) => setForm({ ...form, feeCategoryId: e.target.value })}
              className={inputClass}
            >
              <option value="">Select category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </FormField>

          {form.feeType !== 'STUDENT' ? (
            <FormField label="Gender">
              <select
                value={form.gender}
                onChange={(e) => setForm({ ...form, gender: e.target.value })}
                className={inputClass}
              >
                <option value="">All</option>
                {GENDER_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </FormField>
          ) : (
            <div />
          )}

          {feeTypeNeedsTarget && (
            <div className="md:col-span-3">
              <FormField
                label={TARGET_FIELD_LABEL[form.feeType]}
                required
                hint={`${form.targets.length} selected`}
              >
                <FeeEntryTargetPicker
                  key={form.feeType}
                  feeType={form.feeType}
                  selected={form.targets}
                  onChange={(targets) => setForm((prev) => ({ ...prev, targets }))}
                  classOptions={classOptions}
                  sectionOptions={sectionOptions}
                />
              </FormField>
            </div>
          )}

          <FormField label="Due Amount" required>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="Amount"
              className={inputClass}
            />
          </FormField>

          <FormField label="Due Date" required>
            <input
              type="date"
              min={dateInputMin}
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              className={inputClass}
            />
          </FormField>
        </InlineFormPanel>
      )}

      {editing && (
        <InlineFormPanel
          title="Edit Fee Entry"
          onSubmit={handleEditSubmit}
          onCancel={closeEdit}
          saving={saving}
          submitLabel="Update"
          columns={2}
        >
          <FormField label="Student">
            <input
              type="text"
              disabled
              value={`${editing.studentName}${editing.admissionNumber ? ` (${editing.admissionNumber})` : ''}`}
              className={`${inputClass} opacity-70`}
            />
          </FormField>
          <FormField label="Fee Category">
            <input type="text" disabled value={editing.feeCategory} className={`${inputClass} opacity-70`} />
          </FormField>
          <FormField label="Due Amount" required>
            <input
              type="number"
              min="0"
              step="0.01"
              autoFocus
              value={editForm.amount}
              onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
              className={inputClass}
            />
          </FormField>
          <FormField label="Due Date" required>
            <input
              type="date"
              value={editForm.dueDate}
              onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })}
              className={inputClass}
            />
          </FormField>
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
        emptyTitle={list.search || hasActiveFilter ? 'No matching fee entries' : 'No fee entries yet'}
        emptyMessage={
          list.search || hasActiveFilter
            ? 'Try a different search or clear the filters.'
            : 'Click "Add Fee Entry" to assign the first fee.'
        }
      />
      <ExportModal
        isOpen={exporter.open}
        onClose={exporter.closeModal}
        title="Export Fee Structure"
        subtitle="Customize file settings and select columns to export."
        defaultFileName="Fee_Structure"
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