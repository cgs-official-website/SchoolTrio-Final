import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { feeCategoriesApi } from '../../../../api/feeCategories';
import usePermissions from '../../../../hooks/usePermissions';
import {
  MasterHeader,
  InlineFormPanel,
  FormField,
  inputClass,
  MasterTable,
  ConfirmDelete,
  useMasterList
} from './components';

const DEFAULT_TYPES = ['Normal', 'Late', 'Bus'];
const ADD_NEW = '__add_new__';
const EMPTY_FORM = { name: '', categoryType: 'Normal', paymentOrder: '0', shortCode: '' };

const TYPE_BADGE = {
  Normal: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  Late: 'bg-amber-100 text-amber-700 border-amber-200',
  Bus: 'bg-blue-100 text-blue-700 border-blue-200'
};
const CUSTOM_BADGE = 'bg-primary-50 text-primary-700 border-primary-100 dark:bg-primary-900/30 dark:text-primary-300 dark:border-primary-800';

export default function FeeCategoryTab() {
  const { canCreate, canEdit, canDelete } = usePermissions();
  const allowCreate = canCreate('fees');
  const allowEdit = canEdit('fees');
  const allowDelete = canDelete('fees');

  const list = useMasterList({
    fetcher: feeCategoriesApi.listFeeCategories,
    errorMessage: 'Failed to load fee categories.'
  });

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [typeOptions, setTypeOptions] = useState(DEFAULT_TYPES);
  const [addingType, setAddingType] = useState(false);
  const [newType, setNewType] = useState('');
  const [previousType, setPreviousType] = useState('Normal');

  const loadTypes = useCallback(async () => {
    try {
      const res = await feeCategoriesApi.listFeeCategoryTypes();
      if (Array.isArray(res?.data) && res.data.length > 0) setTypeOptions(res.data);
    } catch (error) {
      console.error('Failed to load category types:', error);
    }
  }, []);

  useEffect(() => {
    loadTypes();
  }, [loadTypes]);

  const resetTypeInput = () => {
    setAddingType(false);
    setNewType('');
  };

  const openAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    resetTypeInput();
    setShowForm(true);
  };

  const openEdit = (row) => {
    setEditingId(row.id);
    setForm({
      name: row.name || '',
      categoryType: row.categoryType || 'Normal',
      paymentOrder: String(row.paymentOrder ?? 0),
      shortCode: row.shortCode || ''
    });
    resetTypeInput();
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    resetTypeInput();
  };

  const handleTypeSelect = (value) => {
    if (value === ADD_NEW) {
      setPreviousType(form.categoryType);
      setAddingType(true);
      return;
    }
    setForm({ ...form, categoryType: value });
  };

  const confirmNewType = () => {
    const trimmed = newType.trim();
    if (!trimmed) {
      toast.error('Enter a category type name.');
      return;
    }
    const existing = typeOptions.find((t) => t.toLowerCase() === trimmed.toLowerCase());
    const finalType = existing || trimmed;
    if (!existing) setTypeOptions([...typeOptions, finalType]);
    setForm({ ...form, categoryType: finalType });
    resetTypeInput();
  };

  const cancelNewType = () => {
    setForm({ ...form, categoryType: previousType });
    resetTypeInput();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) {
      toast.error('Fee category name is required.');
      return;
    }
    if (addingType) {
      toast.error('Add the new category type or cancel it first.');
      return;
    }
    const paymentOrder = form.paymentOrder === '' ? 0 : Number(form.paymentOrder);
    if (!Number.isInteger(paymentOrder) || paymentOrder < 0) {
      toast.error('Payment order must be a whole number, 0 or more.');
      return;
    }

    const payload = {
      name,
      categoryType: form.categoryType,
      paymentOrder,
      shortCode: form.shortCode.trim() || null
    };

    setSaving(true);
    try {
      if (editingId) {
        await feeCategoriesApi.updateFeeCategory(editingId, payload);
        toast.success('Fee category updated.');
      } else {
        await feeCategoriesApi.createFeeCategory(payload);
        toast.success('Fee category added.');
      }
      closeForm();
      await Promise.all([list.reload(), loadTypes()]);
    } catch (error) {
      toast.error(error.message || 'Failed to save fee category.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await feeCategoriesApi.deleteFeeCategory(deleteTarget.id);
      toast.success('Fee category deleted.');
      setDeleteTarget(null);
      await Promise.all([list.reload(), loadTypes()]);
    } catch (error) {
      toast.error(error.message || 'Failed to delete fee category.');
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    { key: 'name', label: 'Category Name', sortable: true, className: 'font-semibold' },
    {
      key: 'categoryType',
      label: 'Category Type',
      sortable: true,
      render: (row) => (
        <span
          className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-bold border ${
            TYPE_BADGE[row.categoryType] || CUSTOM_BADGE
          }`}
        >
          {row.categoryType}
        </span>
      )
    },
    { key: 'paymentOrder', label: 'Payment Order', sortable: true },
    { key: 'shortCode', label: 'Short Code', sortable: true, render: (row) => row.shortCode || '—' }
  ];

  return (
    <div>
      <MasterHeader
        title="Fee Category Details"
        searchValue={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder="Search category name or code"
        addLabel="Add Fee Category"
        onAdd={openAdd}
        canAdd={allowCreate}
        addDisabled={showForm && !editingId}
      />

      {showForm && (
        <InlineFormPanel
          title={editingId ? 'Edit Fee Category' : 'Add Fee Category'}
          onSubmit={handleSubmit}
          onCancel={closeForm}
          saving={saving}
          submitLabel={editingId ? 'Update' : 'Save'}
          columns={2}
        >
          <FormField label="Fee Category Name" required>
            <input
              type="text"
              autoFocus
              maxLength={150}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Type fee category name"
              className={inputClass}
            />
          </FormField>

          <FormField label="Category Type" required>
            {addingType ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  autoFocus
                  maxLength={50}
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      confirmNewType();
                    }
                  }}
                  placeholder="New category type"
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={confirmNewType}
                  className="px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-bold transition-colors shrink-0"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={cancelNewType}
                  className="px-4 py-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-bold transition-colors shrink-0"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <select
                value={form.categoryType}
                onChange={(e) => handleTypeSelect(e.target.value)}
                className={inputClass}
              >
                {typeOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
                <option value={ADD_NEW}>+ Add new type</option>
              </select>
            )}
          </FormField>

          <FormField label="Payment Order">
            <input
              type="number"
              min="0"
              step="1"
              value={form.paymentOrder}
              onChange={(e) => setForm({ ...form, paymentOrder: e.target.value })}
              placeholder="Type payment order"
              className={inputClass}
            />
          </FormField>
          <FormField label="Short Code">
            <input
              type="text"
              maxLength={30}
              value={form.shortCode}
              onChange={(e) => setForm({ ...form, shortCode: e.target.value })}
              placeholder="Type short code"
              className={inputClass}
            />
          </FormField>
        </InlineFormPanel>
      )}

      <MasterTable
        columns={columns}
        rows={list.rows}
        loading={list.loading}
        sortBy={list.sortBy}
        order={list.order}
        onSort={list.handleSort}
        pagination={list.pagination}
        onPageChange={list.setPage}
        onEdit={openEdit}
        onDelete={setDeleteTarget}
        canEdit={allowEdit}
        canDelete={allowDelete}
        emptyTitle={list.search ? 'No matching fee categories' : 'No fee categories yet'}
        emptyMessage={list.search ? 'Try a different search term.' : 'Click "Add Fee Category" to create the first one.'}
      />

      <ConfirmDelete
        open={Boolean(deleteTarget)}
        title="Delete fee category?"
        message={deleteTarget ? `"${deleteTarget.name}" will be permanently removed.` : ''}
        deleting={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}