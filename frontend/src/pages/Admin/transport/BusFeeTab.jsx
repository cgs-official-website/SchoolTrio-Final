import React, { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { LuPlus as Plus, LuSearch as Search, LuIndianRupee as Rupee } from 'react-icons/lu';
import { Edit, Trash2, Eye } from 'lucide-react';
import ConfirmModal from '../../../components/ConfirmModal';
import {
    listBusFees, listBusStops, listBusSlabs, createBusFee, updateBusFee, deleteBusFee
} from '../../../api/transport';
import { useLiveDataRefresh } from '../../../hooks/useLiveDataRefresh';
import { notifyDataChanged } from '../../../utils/liveData';
import { exportRowsToExcel, exportRowsToPdf, formatDisplayDate, formatAmount } from '../../../utils/transportExport';
import {
    inputCls, primaryBtn, ghostBtn, cardCls, thCls, tdCls, theadRowCls,
    Field, Modal, ExportButtons, EmptyState
} from './ui';

const emptyStopForm = { id: null, kind: 'STOP', busStopId: '', slabName: '', dueDate: '', oneWayAmount: '', twoWayAmount: '' };
const emptySlabForm = { ...emptyStopForm, kind: 'SLAB' };

export default function BusFeeTab({ canCreate, canEdit, canDelete }) {
    const [fees, setFees] = useState([]);
    const [stops, setStops] = useState([]);
    const [slabs, setSlabs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [kindFilter, setKindFilter] = useState('ALL');
    const [form, setForm] = useState(null);
    const [saving, setSaving] = useState(false);
    const [viewFee, setViewFee] = useState(null);
    const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, id: null, name: '' });

    const load = useCallback(async () => {
        try {
            const [feesRes, stopsRes, slabsRes] = await Promise.all([
                listBusFees(),
                listBusStops().catch(() => ({ data: [] })),
                listBusSlabs().catch(() => ({ data: [] }))
            ]);
            setFees(Array.isArray(feesRes?.data) ? feesRes.data : []);
            setStops(Array.isArray(stopsRes?.data) ? stopsRes.data : []);
            setSlabs(Array.isArray(slabsRes?.data) ? slabsRes.data : []);
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Failed to load bus fee entries.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);
    useLiveDataRefresh(load, [load], 'transport');

    const labelOf = (f) => (f.kind === 'STOP' ? f.stopName || '-' : `Slab: ${f.slabName || '-'}`);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return fees.filter((f) => {
            if (kindFilter !== 'ALL' && f.kind !== kindFilter) return false;
            if (!q) return true;
            return [labelOf(f), f.slabName, formatDisplayDate(f.dueDate)].some((v) => (v || '').toLowerCase().includes(q));
        });
    }, [fees, search, kindFilter]);

    const headers = ['S.No', 'Bus Stop / Slab', 'Slab Name', 'Due Date', 'One Way Amount', 'Two Way Amount'];
    const rowsForExport = () =>
        filtered.map((f, i) => [i + 1, labelOf(f), f.slabName || '', formatDisplayDate(f.dueDate), f.oneWayAmount, f.twoWayAmount]);

    const openEdit = (f) =>
        setForm({
            id: f.id,
            kind: f.kind,
            busStopId: f.busStopId || '',
            slabName: f.kind === 'SLAB' ? f.slabName || '' : '',
            dueDate: f.dueDate,
            oneWayAmount: String(f.oneWayAmount),
            twoWayAmount: String(f.twoWayAmount)
        });

    const handleSave = async (e) => {
        e.preventDefault();
        if (form.id ? !canEdit : !canCreate) return toast.error('You do not have permission for this action.');
        if (form.kind === 'STOP' && !form.busStopId) return toast.error('Please select a bus stop.');
        if (form.kind === 'SLAB' && !form.slabName) return toast.error('Please select a slab name.');
        if (!form.dueDate) return toast.error('Please select a due date.');
        const one = Number(form.oneWayAmount);
        const two = Number(form.twoWayAmount);
        if (form.oneWayAmount === '' || !Number.isFinite(one) || one < 0) return toast.error('Enter a valid one way fee.');
        if (form.twoWayAmount === '' || !Number.isFinite(two) || two < 0) return toast.error('Enter a valid two way fee.');

        setSaving(true);
        try {
            const payload = {
                kind: form.kind,
                busStopId: form.kind === 'STOP' ? form.busStopId : null,
                slabName: form.kind === 'SLAB' ? form.slabName : null,
                dueDate: form.dueDate,
                oneWayAmount: one,
                twoWayAmount: two
            };
            if (form.id) await updateBusFee(form.id, payload);
            else await createBusFee(payload);
            toast.success(form.id ? 'Fee entry updated successfully!' : 'Fee entry added successfully!');
            notifyDataChanged('transport');
            setForm(null);
            await load();
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Failed to save fee entry.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!canDelete) return toast.error('You do not have permission to delete fee entries.');
        try {
            await deleteBusFee(confirmDelete.id);
            toast.success('Fee entry deleted successfully');
            notifyDataChanged('transport');
            await load();
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Failed to delete fee entry.');
        } finally {
            setConfirmDelete({ isOpen: false, id: null, name: '' });
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center py-16">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className={`${cardCls} flex flex-wrap items-center gap-3 p-4`}>
                <div className="flex flex-1 min-w-[260px] gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="Search bus stop, slab or due date..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                        />
                    </div>
                    <select
                        value={kindFilter}
                        onChange={(e) => setKindFilter(e.target.value)}
                        className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-200"
                        title="Filter"
                    >
                        <option value="ALL">All Fee Entries</option>
                        <option value="STOP">Bus Stop Fees</option>
                        <option value="SLAB">Slab Fees</option>
                    </select>
                </div>
                <div className="flex flex-nowrap items-center gap-3 ml-auto">
                    <ExportButtons
                        disabled={filtered.length === 0}
                        onExcel={() => exportRowsToExcel('Bus_Fee_Entries', headers, rowsForExport(), 'Bus Fees')}
                        onPdf={() => exportRowsToPdf('Bus_Fee_Entries', 'Bus Fee Entries', headers, rowsForExport())}
                    />
                    {canCreate && (
                        <>
                            <button type="button" className={`${primaryBtn} whitespace-nowrap`} onClick={() => setForm({ ...emptyStopForm })}>
                                <Plus size={18} /> Add Bus Fee
                            </button>
                            <button type="button" className={`${primaryBtn} whitespace-nowrap`} onClick={() => setForm({ ...emptySlabForm })}>
                                <Plus size={18} /> Add Slab Fee
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div className={`${cardCls} overflow-hidden`}>
                <div className="overflow-x-auto w-full min-w-0">
                    <table className="w-full text-left border-collapse min-w-max">
                        <thead>
                            <tr className={theadRowCls}>
                                <th className={thCls}>S.No</th>
                                <th className={thCls}>Bus Stop / Slab</th>
                                <th className={thCls}>Due Date</th>
                                <th className={thCls}>One Way Amount</th>
                                <th className={thCls}>Two Way Amount</th>
                                <th className={`${thCls} text-right`}>Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm text-slate-600 dark:text-slate-300 font-medium">
                            {filtered.length === 0 ? (
                                <tr>
                                    <td colSpan="6">
                                        <EmptyState
                                            icon={Rupee}
                                            title="No Fee Entries Found"
                                            text={fees.length === 0 ? 'Add a bus fee or slab fee to see it here.' : 'No fee entry matches your search/filter.'}
                                        />
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((f, i) => (
                                    <tr key={f.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                                        <td className={tdCls}>{i + 1}</td>
                                        <td className={`${tdCls} font-bold text-slate-900 dark:text-white`}>{labelOf(f)}</td>
                                        <td className={tdCls}>{formatDisplayDate(f.dueDate)}</td>
                                        <td className={tdCls}>₹ {formatAmount(f.oneWayAmount)}</td>
                                        <td className={tdCls}>₹ {formatAmount(f.twoWayAmount)}</td>
                                        <td className={`${tdCls} text-right`}>
                                            <button type="button" onClick={() => setViewFee(f)} title="View"
                                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-800 rounded-lg transition-colors">
                                                <Eye size={18} />
                                            </button>
                                            {canEdit && (
                                                <button type="button" onClick={() => openEdit(f)} title="Edit"
                                                    className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-slate-800 rounded-lg transition-colors">
                                                    <Edit size={18} />
                                                </button>
                                            )}
                                            {canDelete && (
                                                <button type="button" onClick={() => setConfirmDelete({ isOpen: true, id: f.id, name: `${labelOf(f)} (${formatDisplayDate(f.dueDate)})` })} title="Delete"
                                                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-slate-800 rounded-lg transition-colors">
                                                    <Trash2 size={18} />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800">
                    Showing {filtered.length} of {fees.length} entries
                </div>
            </div>

            {form && (
                <Modal
                    title={`${form.id ? 'Edit' : 'Add'} ${form.kind === 'STOP' ? 'Bus Fee Entry' : 'Bus Slab Fee Entry'}`}
                    onClose={() => setForm(null)}
                >
                    <form onSubmit={handleSave} className="space-y-4">
                        {form.kind === 'STOP' ? (
                            <Field label="Bus Stop" required>
                                <select value={form.busStopId} onChange={(e) => setForm({ ...form, busStopId: e.target.value })} className={inputCls} required>
                                    <option value="">Please select Bus Stop</option>
                                    {stops.map((s) => <option key={s.id} value={s.id}>{s.stopName}</option>)}
                                </select>
                                {stops.length === 0 && <p className="text-xs text-amber-600 mt-1">Add a bus stop first in the Bus Stop tab.</p>}
                            </Field>
                        ) : (
                            <Field label="Bus Slab Name" required>
                                <select value={form.slabName} onChange={(e) => setForm({ ...form, slabName: e.target.value })} className={inputCls} required>
                                    <option value="">Slab Name</option>
                                    {slabs.map((s) => <option key={s} value={s}>{s}</option>)}
                                </select>
                                {slabs.length === 0 && <p className="text-xs text-amber-600 mt-1">No slabs yet. Give a Slab Name to a bus stop first.</p>}
                            </Field>
                        )}

                        <Field label="Due Date" required>
                            <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className={inputCls} required />
                        </Field>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Field label="One Way Fee" required>
                                <input type="number" min="0" step="0.01" value={form.oneWayAmount} onChange={(e) => setForm({ ...form, oneWayAmount: e.target.value })} placeholder="One Way Fee" className={inputCls} required />
                            </Field>
                            <Field label="Two Way Fee" required>
                                <input type="number" min="0" step="0.01" value={form.twoWayAmount} onChange={(e) => setForm({ ...form, twoWayAmount: e.target.value })} placeholder="Two Way Fee" className={inputCls} required />
                            </Field>
                        </div>

                        <div className="pt-4 flex justify-end gap-3">
                            <button type="submit" disabled={saving} className={primaryBtn}>{saving ? 'Saving...' : 'Save'}</button>
                            <button type="button" onClick={() => setForm(null)} className={ghostBtn}>Cancel</button>
                        </div>
                    </form>
                </Modal>
            )}

            {viewFee && (
                <Modal title="Fee Entry Details" onClose={() => setViewFee(null)}>
                    <dl className="grid grid-cols-2 gap-y-3 text-sm">
                        <dt className="text-slate-500">Type</dt><dd className="font-semibold">{viewFee.kind === 'STOP' ? 'Bus Stop Fee' : 'Slab Fee'}</dd>
                        {viewFee.kind === 'STOP' && (<><dt className="text-slate-500">Bus Stop</dt><dd className="font-semibold">{viewFee.stopName}</dd></>)}
                        <dt className="text-slate-500">Slab Name</dt><dd className="font-semibold">{viewFee.slabName || '-'}</dd>
                        <dt className="text-slate-500">Due Date</dt><dd className="font-semibold">{formatDisplayDate(viewFee.dueDate)}</dd>
                        <dt className="text-slate-500">One Way Amount</dt><dd className="font-semibold">₹ {formatAmount(viewFee.oneWayAmount)}</dd>
                        <dt className="text-slate-500">Two Way Amount</dt><dd className="font-semibold">₹ {formatAmount(viewFee.twoWayAmount)}</dd>
                    </dl>
                    <div className="pt-6 flex justify-end">
                        <button type="button" onClick={() => setViewFee(null)} className={ghostBtn}>Close</button>
                    </div>
                </Modal>
            )}

            <ConfirmModal
                isOpen={confirmDelete.isOpen}
                title="Delete Fee Entry"
                message={`Are you sure you want to delete the fee entry "${confirmDelete.name}"?`}
                confirmText="Delete"
                onConfirm={handleDelete}
                onCancel={() => setConfirmDelete({ isOpen: false, id: null, name: '' })}
            />
        </div>
    );
}
