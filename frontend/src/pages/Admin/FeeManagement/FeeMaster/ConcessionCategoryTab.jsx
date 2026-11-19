import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { concessionCategoriesApi } from '../../../../api/concessionCategories';
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

export default function ConcessionCategoryTab() {
  const { canCreate, canEdit, canDelete } = usePermissions();
  const allowCreate = canCreate('fees');
  const allowEdit = canEdit('fees');
  const allowDelete = canDelete('fees');

  const list = useMasterList({
    fetcher: concessionCategoriesApi.listConcessionCategories,
    errorMessage: 'Failed to load concession categories.'
  });

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const openAdd = () => {
    setEditingId(null);
    setName('');
    setShowForm(true);
  };

  const openEdit = (row) => {
    setEditingId(row.id);
    setName(row.name || '');
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setName('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Concession name is required.');
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await concessionCategoriesApi.updateConcessionCategory(editingId, { name: trimmed });
        toast.success('Concession category updated.');
      } else {
        await concessionCategoriesApi.createConcessionCategory({ name: trimmed });
        toast.success('Concession category added.');
      }
      closeForm();
      await list.reload();
    } catch (error) {
      toast.error(error.message || 'Failed to save concession category.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await concessionCategoriesApi.deleteConcessionCategory(deleteTarget.id);
      toast.success('Concession category deleted.');
      setDeleteTarget(null);
      await list.reload();
    } catch (error) {
      toast.error(error.message || 'Failed to delete concession category.');
    } finally {
      setDeleting(false);
    }
  };

  const columns = [{ key: 'name', label: 'Concession Name', sortable: true, className: 'font-semibold' }];

  return (
    <div>
      <MasterHeader
        title="Concession List"
        searchValue={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder="Type concession name"
        addLabel="Add Concession Category"
        onAdd={openAdd}
        canAdd={allowCreate}
        addDisabled={showForm && !editingId}
      />

      {showForm && (
        <InlineFormPanel
          title="Concession"
          onSubmit={handleSubmit}
          onCancel={closeForm}
          saving={saving}
          submitLabel={editingId ? 'Update' : 'Add'}
          columns={1}
        >
          <FormField label="Concession Name" required>
            <input
              type="text"
              autoFocus
              maxLength={150}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Concession name"
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
        emptyTitle={list.search ? 'No matching concession categories' : 'No concession categories yet'}
        emptyMessage={
          list.search ? 'Try a different search term.' : 'Click "Add Concession Category" to create the first one.'
        }
      />

      <ConfirmDelete
        open={Boolean(deleteTarget)}
        title="Delete concession category?"
        message={deleteTarget ? `"${deleteTarget.name}" will be permanently removed.` : ''}
        deleting={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}