import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { banksApi } from '../../../../api/banks';
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

const EMPTY_FORM = { name: '', code: '', isDefault: false };

export default function BankMasterTab() {
  const { canCreate, canEdit, canDelete } = usePermissions();
  const allowCreate = canCreate('fees');
  const allowEdit = canEdit('fees');
  const allowDelete = canDelete('fees');

  const list = useMasterList({
    fetcher: banksApi.listBanks,
    errorMessage: 'Failed to load banks.'
  });

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const openAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (row) => {
    setEditingId(row.id);
    setForm({ name: row.name || '', code: row.code || '', isDefault: Boolean(row.isDefault) });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) {
      toast.error('Bank name is required.');
      return;
    }

    const payload = { name, code: form.code.trim() || null, isDefault: form.isDefault };

    setSaving(true);
    try {
      if (editingId) {
        await banksApi.updateBank(editingId, payload);
        toast.success('Bank updated.');
      } else {
        await banksApi.createBank(payload);
        toast.success('Bank added.');
      }
      closeForm();
      await list.reload();
    } catch (error) {
      toast.error(error.message || 'Failed to save bank.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await banksApi.deleteBank(deleteTarget.id);
      toast.success('Bank deleted.');
      setDeleteTarget(null);
      await list.reload();
    } catch (error) {
      toast.error(error.message || 'Failed to delete bank.');
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    { key: 'name', label: 'Bank Name', sortable: true, className: 'font-semibold' },
    { key: 'code', label: 'Bank Code', sortable: true, render: (row) => row.code || '—' },
    {
      key: 'isDefault',
      label: 'Default Bank',
      sortable: true,
      render: (row) =>
        row.isDefault ? (
          <span className="inline-flex px-2.5 py-1 rounded-lg text-xs font-bold bg-green-100 text-green-700 border border-green-200">
            Yes
          </span>
        ) : (
          <span className="text-slate-500 dark:text-slate-400">No</span>
        )
    }
  ];

  const radioLabel = 'inline-flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200 cursor-pointer';

  return (
    <div>
      <MasterHeader
        title="Bank Details"
        searchValue={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder="Search bank name or code"
        addLabel="Add Bank Mapping"
        onAdd={openAdd}
        canAdd={allowCreate}
        addDisabled={showForm && !editingId}
      />

      {showForm && (
        <InlineFormPanel
          title={editingId ? 'Edit Bank Details' : 'Add Bank Details'}
          onSubmit={handleSubmit}
          onCancel={closeForm}
          saving={saving}
          submitLabel={editingId ? 'Update' : 'Save'}
          columns={3}
        >
          <FormField label="Bank Name" required>
            <input
              type="text"
              autoFocus
              maxLength={150}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Bank name"
              className={inputClass}
            />
          </FormField>
          <FormField label="Bank Code">
            <input
              type="text"
              maxLength={50}
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="Bank code"
              className={inputClass}
            />
          </FormField>
          <FormField label="Default" hint="Only one bank can be the default. Choosing Bank Default replaces the current one.">
            <div className="flex items-center gap-5 py-2.5">
              <label className={radioLabel}>
                <input
                  type="radio"
                  name="bank-default"
                  checked={form.isDefault}
                  onChange={() => setForm({ ...form, isDefault: true })}
                  className="accent-primary-600"
                />
                Bank Default
              </label>
              <label className={radioLabel}>
                <input
                  type="radio"
                  name="bank-default"
                  checked={!form.isDefault}
                  onChange={() => setForm({ ...form, isDefault: false })}
                  className="accent-primary-600"
                />
                No Default
              </label>
            </div>
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
        emptyTitle={list.search ? 'No matching banks' : 'No banks yet'}
        emptyMessage={list.search ? 'Try a different search term.' : 'Click "Add Bank Mapping" to add the first bank.'}
      />

      <ConfirmDelete
        open={Boolean(deleteTarget)}
        title="Delete bank?"
        message={deleteTarget ? `"${deleteTarget.name}" will be permanently removed.` : ''}
        deleting={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}