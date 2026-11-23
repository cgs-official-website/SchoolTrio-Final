import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import { LuPlus as Plus, LuSearch as Search, LuIndianRupee as Rupee, LuTriangleAlert as Warn } from 'react-icons/lu';
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

const emptyStopForm = { id: null, kind: 'STOP', busStopId: '', distanceFromKm: '', distanceToKm: '', dueDate: '', amount: '' };
const emptySlabForm = { ...emptyStopForm, kind: 'SLAB' };

const kmText = (n) => (n === null || n === undefined || n === '' ? '-' : `${n} KM`);

// "11 - 15 KM" for a range, "15 KM" when from === to
const rangeText = (f) => {
    const a = f.distanceFromKm;
    const b = f.distanceToKm;
    if (a === null || a === undefined || b === null || b === undefined) return kmText(f.distanceKm ?? f.slabName);
    return Number(a) === Number(b) ? `${a} KM` : `${a} - ${b} KM`;
};

// does a slab fee (from/to km) cover this distance?
const slabCovers = (slabFee, km) => {
    if (km === null || km === undefined || km === '') return false;
    const from = Number(slabFee.distanceFromKm ?? slabFee.distanceKm);
    const to = Number(slabFee.distanceToKm ?? slabFee.distanceKm);
    return Number(km) >= from && Number(km) <= to;
};

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

    // stops that have their OWN fee: for these stops the slab fee is NOT charged (stop fee replaces it)
    const stopsWithOwnFee = useMemo(() => new Set(fees.filter((f) => f.kind === 'STOP').map((f) => f.busStopId)), [fees]);

    // slab fees that a stop fee will replace for this stop (shown while adding / and in the table)
    const slabsReplacedFor = useCallback(
        (stopId) => {
            const stop = stops.find((s) => s.id === stopId);
            if (!stop) return [];
            return fees.filter((f) => f.kind === 'SLAB' && slabCovers(f, stop.distanceKm));
        },
        [fees, stops]
    );

    const appliesTo = (f) => (f.kind === 'STOP' ? f.stopName || '-' : `Distance: ${rangeText(f)}`);
    const typeLabel = (f) => (f.kind === 'STOP' ? 'Stop Fee' : 'Distance Slab');

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
            distanceFromKm: f.kind === 'SLAB' ? (f.distanceFromKm ?? f.distanceKm ?? '') : '',
            distanceToKm: f.kind === 'SLAB' ? (f.distanceToKm ?? f.distanceKm ?? '') : '',
            dueDate: f.dueDate,
            amount: String(f.amount)
        });

    const handleSave = async (e) => {
        e.preventDefault();
        if (form.id ? !canEdit : !canCreate) return toast.error('You do not have permission for this action.');
        if (form.kind === 'STOP' && !form.busStopId) return toast.error('Please select a bus stop.');
        if (form.kind === 'SLAB') {
            const from = Number(form.distanceFromKm);
            const to = Number(form.distanceToKm);
            if (form.distanceFromKm === '' || form.distanceToKm === '' || !Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to < 0) {
                return toast.error('Enter both From KM and To KM for this slab.');
            }
            if (from > to) return toast.error('To KM must be greater than or equal to From KM.');
        }
        if (!form.dueDate) return toast.error('Please select a due date.');
        const amount = Number(form.amount);
        if (form.amount === '' || !Number.isFinite(amount) || amount < 0) return toast.error('Enter a valid fee amount.');

        setSaving(true);
        try {
            const payload = {
                kind: form.kind,
                busStopId: form.kind === 'STOP' ? form.busStopId : null,
                distanceFromKm: form.kind === 'SLAB' ? Number(form.distanceFromKm) : null,
                distanceToKm: form.kind === 'SLAB' ? Number(form.distanceToKm) : null,
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

    const deletingRef = useRef(false);

    const handleDelete = async () => {
        if (deletingRef.current) return; // ignore repeated clicks while a delete is running
        if (!canDelete) return toast.error('You do not have permission to delete fee entries.');
        const id = confirmDelete.id;
        if (!id) return;
        deletingRef.current = true;
        setConfirmDelete({ isOpen: false, id: null, name: '' }); // close the dialog straight away
        try {
            await deleteBusFee(id);
            toast.success('Fee entry deleted successfully');
            notifyDataChanged('transport');
            await load();
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Failed to delete fee entry.');
        } finally {
            deletingRef.current = false;
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
                        <option value="STOP">Stop Fees</option>
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
                                <Plus size={18} /> Add Stop Fee
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
                                            text={fees.length === 0 ? 'Use "Add Slab Fee" for distance-based fees, or "Add Stop Fee" for a special stop.' : 'No fee entry matches your search.'}
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
                <Modal title={`${form.id ? 'Edit' : 'Add'} ${form.kind === 'STOP' ? 'Stop Fee' : 'Slab Fee'}`} onClose={() => setForm(null)}>
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
                                {form.busStopId && slabsReplacedFor(form.busStopId).length > 0 && (
                                    <div className="mt-2 flex gap-2 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                                        <Warn size={16} className="mt-0.5 shrink-0" />
                                        <p>
                                            <span className="font-bold">This will override the slab fee.</span>{' '}
                                            This stop is inside the slab fee(s): {[...new Set(slabsReplacedFor(form.busStopId).map((f) => `${rangeText(f)} (₹${formatAmount(f.amount)}, due ${formatDisplayDate(f.dueDate)})`))].join(', ')}.
                                            Once a stop fee exists, students at this stop pay ONLY the stop fee (every due date) and the slab fee is not charged. Add one stop fee per payment phase.
                                        </p>
                                    </div>
                                )}
                            </Field>
                        ) : (
                            <div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <Field label="From (KM)" required>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.1"
                                            value={form.distanceFromKm}
                                            onChange={(e) => setForm({ ...form, distanceFromKm: e.target.value })}
                                            placeholder="e.g. 11"
                                            className={inputCls}
                                            required
                                        />
                                    </Field>
                                    <Field label="To (KM)" required>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.1"
                                            value={form.distanceToKm}
                                            onChange={(e) => setForm({ ...form, distanceToKm: e.target.value })}
                                            placeholder="e.g. 15"
                                            className={inputCls}
                                            required
                                        />
                                    </Field>
                                </div>
                                {(() => {
                                    const a = Number(form.distanceFromKm);
                                    const b = Number(form.distanceToKm);
                                    if (form.distanceFromKm === '' || form.distanceToKm === '' || !(a <= b)) return null;
                                    const special = stops.filter((s) => stopsWithOwnFee.has(s.id) && s.distanceKm !== null && s.distanceKm >= a && s.distanceKm <= b);
                                    if (special.length === 0) return null;
                                    return (
                                        <div className="mt-2 flex gap-2 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                                            <Warn size={16} className="mt-0.5 shrink-0" />
                                            <p>
                                                <span className="font-bold">Not charged at {special.map((s) => s.stopName).join(', ')}.</span>{' '}
                                                These stops have their own stop fee, which replaces this slab fee.
                                            </p>
                                        </div>
                                    );
                                })()}
                                {(() => {
                                    const a = Number(form.distanceFromKm);
                                    const b = Number(form.distanceToKm);
                                    if (form.distanceFromKm === '' || form.distanceToKm === '' || !(a <= b)) return null;
                                    const existing = fees.filter((f) => f.kind === 'SLAB' && f.id !== form.id && Number(f.distanceFromKm ?? f.distanceKm) <= b && Number(f.distanceToKm ?? f.distanceKm) >= a);
                                    if (existing.length === 0) return null;
                                    return (
                                        <div className="mt-2 flex gap-2 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                                            <Warn size={16} className="mt-0.5 shrink-0" />
                                            <p>
                                                <span className="font-bold">A slab already exists for this distance:</span>{' '}
                                                {existing.map((f) => `${rangeText(f)} - ₹${formatAmount(f.amount)}, due ${formatDisplayDate(f.dueDate)}`).join(' | ')}.{' '}
                                                A distance can be in only one slab, so use the Edit button on that row instead. Add a second entry only for Phase 2 of the same range, with a different due date.
                                            </p>
                                        </div>
                                    );
                                })()}
                                <p className="text-xs text-slate-400 mt-1">
                                    Applies to every bus stop whose distance is from {form.distanceFromKm || 'From'} to {form.distanceToKm || 'To'} KM (both included){knownDistances.length ? `. Your stops are at: ${knownDistances.join(', ')} KM` : ''}.
                                </p>
                            </div>
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
                            <button type="submit" disabled={saving} className={primaryBtn}>{saving ? 'Saving...' : (form.kind === 'STOP' && form.busStopId && slabsReplacedFor(form.busStopId).length > 0 && !stopsWithOwnFee.has(form.busStopId) ? 'Save & Override Slab Fee' : 'Save')}</button>
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
