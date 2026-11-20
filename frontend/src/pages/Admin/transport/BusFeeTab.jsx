import React, { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { LuPlus as Plus, LuSearch as Search, LuIndianRupee as Rupee } from 'react-icons/lu';
import { Edit, Trash2 } from 'lucide-react';
import ConfirmModal from '../../../components/ConfirmModal';
import { listBusFees, listBusStops, createBusFee, updateBusFee, deleteBusFee } from '../../../api/transport';
import { useLiveDataRefresh } from '../../../hooks/useLiveDataRefresh';
import { notifyDataChanged } from '../../../utils/liveData';
import { exportRowsToExcel, exportRowsToPdf, formatDisplayDate, formatAmount } from '../../../utils/transportExport';
import {
    inputCls, primaryBtn, ghostBtn, cardCls, thCls, tdCls, theadRowCls,
    Field, Modal, ExportButtons, EmptyState
} from './ui';

const emptyStopForm = { id: null, kind: 'STOP', busStopId: '', distanceKm: '', dueDate: '', amount: '' };
const emptySlabForm = { ...emptyStopForm, kind: 'SLAB' };

const kmText = (n) => (n === null || n === undefined || n === '' ? '-' : `${n} KM`);

export default function BusFeeTab({ canCreate, canEdit, canDelete }) {
    const [fees, setFees] = useState([]);
    const [stops, setStops] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [kindFilter, setKindFilter] = useState('ALL');
    const [form, setForm] = useState(null);
    const [saving, setSaving] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, id: null, name: '' });

    const load = useCallback(async () => {
        try {
            const [feesRes, stopsRes] = await Promise.all([
                listBusFees(),
                listBusStops().catch(() => ({ data: [] }))
            ]);
            setFees(Array.isArray(feesRes?.data) ? feesRes.data : []);
            setStops(Array.isArray(stopsRes?.data) ? stopsRes.data : []);
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Failed to load bus fee entries.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);
    useLiveDataRefresh(load, [load], 'transport');

    // distances already used by bus stops - offered as quick picks for a slab fee
    const knownDistances = useMemo(
        () => [...new Set(stops.map((s) => s.distanceKm).filter((d) => d !== null && d !== undefined))].sort((a, b) => a - b),
        [stops]
    );

    const appliesTo = (f) => (f.kind === 'STOP' ? f.stopName || '-' : `Distance: ${kmText(f.distanceKm ?? f.slabName)}`);
    const typeLabel = (f) => (f.kind === 'STOP' ? 'Bus Stop' : 'Distance Slab');

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return fees.filter((f) => {
            if (kindFilter !== 'ALL' && f.kind !== kindFilter) return false;
            if (!q) return true;
            return [appliesTo(f), formatDisplayDate(f.dueDate), String(f.amount)].some((v) => (v || '').toLowerCase().includes(q));
        });
    }, [fees, search, kindFilter]);

    const headers = ['S.No', 'Applies To', 'Type', 'Due Date', 'Fee Amount'];
    const rowsForExport = () =>
        filtered.map((f, i) => [i + 1, appliesTo(f), typeLabel(f), formatDisplayDate(f.dueDate), f.amount]);

    const openEdit = (f) =>
        setForm({
            id: f.id,
            kind: f.kind,
            busStopId: f.busStopId || '',
            distanceKm: f.kind === 'SLAB' ? (f.distanceKm ?? '') : '',
            dueDate: f.dueDate,
            amount: String(f.amount)
        });

    const handleSave = async (e) => {
        e.preventDefault();
        if (form.id ? !canEdit : !canCreate) return toast.error('You do not have permission for this action.');
        if (form.kind === 'STOP' && !form.busStopId) return toast.error('Please select a bus stop.');
        if (form.kind === 'SLAB' && (form.distanceKm === '' || !Number.isFinite(Number(form.distanceKm)) || Number(form.distanceKm) < 0)) {
            return toast.error('Enter the distance in KM for this slab.');
        }
        if (!form.dueDate) return toast.error('Please select a due date.');
        const amount = Number(form.amount);
        if (form.amount === '' || !Number.isFinite(amount) || amount < 0) return toast.error('Enter a valid fee amount.');

        setSaving(true);
        try {
            const payload = {
                kind: form.kind,
                busStopId: form.kind === 'STOP' ? form.busStopId : null,
                distanceKm: form.kind === 'SLAB' ? Number(form.distanceKm) : null,
                dueDate: form.dueDate,
                amount
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
                            placeholder="Search bus stop, distance or due date..."
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
                        <option value="SLAB">Distance Slab Fees</option>
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

            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-3 text-xs text-slate-600 dark:text-slate-300 space-y-1">
                <p><span className="font-bold">Bus Fee</span> - a fee for one specific bus stop.</p>
                <p><span className="font-bold">Slab Fee</span> - one fee for every bus stop at the same distance (KM). If a stop has its own Bus Fee for the same due date, that fee is used instead.</p>
            </div>

            <div className={`${cardCls} overflow-hidden`}>
                <div className="overflow-x-auto w-full min-w-0">
                    <table className="w-full text-left border-collapse min-w-max">
                        <thead>
                            <tr className={theadRowCls}>
                                <th className={thCls}>S.No</th>
                                <th className={thCls}>Applies To</th>
                                <th className={thCls}>Type</th>
                                <th className={thCls}>Due Date</th>
                                <th className={thCls}>Fee Amount</th>
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
                                            text={fees.length === 0 ? 'Use "Add Bus Fee" or "Add Slab Fee" to set transport fees.' : 'No fee entry matches your search.'}
                                        />
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((f, i) => (
                                    <tr key={f.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                                        <td className={tdCls}>{i + 1}</td>
                                        <td className={`${tdCls} font-bold text-slate-900 dark:text-white`}>{appliesTo(f)}</td>
                                        <td className={tdCls}>
                                            <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${f.kind === 'STOP' ? 'bg-indigo-50 text-indigo-700' : 'bg-amber-50 text-amber-700'}`}>
                                                {typeLabel(f)}
                                            </span>
                                        </td>
                                        <td className={tdCls}>{formatDisplayDate(f.dueDate)}</td>
                                        <td className={`${tdCls} font-bold text-slate-900 dark:text-white`}>₹{formatAmount(f.amount)}</td>
                                        <td className={`${tdCls} text-right`}>
                                            {canEdit && (
                                                <button type="button" onClick={() => openEdit(f)} title="Edit Fee Entry"
                                                    className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-slate-800 rounded-lg transition-colors">
                                                    <Edit size={18} />
                                                </button>
                                            )}
                                            {canDelete && (
                                                <button type="button" onClick={() => setConfirmDelete({ isOpen: true, id: f.id, name: appliesTo(f) })} title="Delete Fee Entry"
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
                <Modal title={`${form.id ? 'Edit' : 'Add'} ${form.kind === 'STOP' ? 'Bus Fee' : 'Slab Fee'}`} onClose={() => setForm(null)}>
                    <form onSubmit={handleSave} className="space-y-4">
                        {form.kind === 'STOP' ? (
                            <Field label="Bus Stop" required>
                                <select value={form.busStopId} onChange={(e) => setForm({ ...form, busStopId: e.target.value })} className={inputCls} required>
                                    <option value="">Please select Bus Stop</option>
                                    {stops.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.stopName}{s.distanceKm !== null && s.distanceKm !== undefined ? ` (${s.distanceKm} KM)` : ''}
                                        </option>
                                    ))}
                                </select>
                                {stops.length === 0 && (
                                    <p className="text-xs text-amber-600 mt-1">No bus stops yet. Add one in the Bus Stop tab first.</p>
                                )}
                            </Field>
                        ) : (
                            <Field label="Distance (KM)" required>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.1"
                                    list="bus-fee-distances"
                                    value={form.distanceKm}
                                    onChange={(e) => setForm({ ...form, distanceKm: e.target.value })}
                                    placeholder="e.g. 25"
                                    className={inputCls}
                                    required
                                />
                                <datalist id="bus-fee-distances">
                                    {knownDistances.map((d) => <option key={d} value={d} />)}
                                </datalist>
                                <p className="text-xs text-slate-400 mt-1">
                                    Applies to every bus stop with this distance{knownDistances.length ? ` (used by your stops: ${knownDistances.join(', ')} KM)` : ''}.
                                </p>
                            </Field>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Field label="Due Date" required>
                                <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className={inputCls} required />
                            </Field>
                            <Field label="Fee Amount (₹)" required>
                                <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={form.amount}
                                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                                    placeholder="e.g. 5000"
                                    className={inputCls}
                                    required
                                />
                            </Field>
                        </div>

                        <div className="pt-4 flex justify-end gap-3">
                            <button type="submit" disabled={saving} className={primaryBtn}>{saving ? 'Saving...' : 'Save'}</button>
                            <button type="button" onClick={() => setForm(null)} className={ghostBtn}>Close</button>
                        </div>
                    </form>
                </Modal>
            )}

            <ConfirmModal
                isOpen={confirmDelete.isOpen}
                title="Delete Fee Entry"
                message={`Are you sure you want to delete the fee entry for "${confirmDelete.name}"?`}
                confirmText="Delete"
                onConfirm={handleDelete}
                onCancel={() => setConfirmDelete({ isOpen: false, id: null, name: '' })}
            />
        </div>
    );
}
