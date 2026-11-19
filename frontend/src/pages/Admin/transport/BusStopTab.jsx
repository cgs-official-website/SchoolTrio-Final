import React, { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { LuPlus as Plus, LuSearch as Search, LuMapPin as MapPin } from 'react-icons/lu';
import { Edit, Trash2 } from 'lucide-react';
import ConfirmModal from '../../../components/ConfirmModal';
import { listBusStops, listBusSlabs, createBusStop, updateBusStop, deleteBusStop } from '../../../api/transport';
import { useLiveDataRefresh } from '../../../hooks/useLiveDataRefresh';
import { notifyDataChanged } from '../../../utils/liveData';
import { exportRowsToExcel, exportRowsToPdf } from '../../../utils/transportExport';
import {
    inputCls, primaryBtn, ghostBtn, cardCls, thCls, tdCls, theadRowCls,
    Field, Modal, ExportButtons, EmptyState
} from './ui';

const EMPTY = { id: null, stopName: '', routeIds: [], slabName: '', geocode: '' };

export default function BusStopTab({ routes, canCreate, canEdit, canDelete, onChanged }) {
    const [stops, setStops] = useState([]);
    const [slabs, setSlabs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [form, setForm] = useState(null);
    const [saving, setSaving] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, id: null, name: '' });

    const load = useCallback(async () => {
        try {
            const [stopsRes, slabsRes] = await Promise.all([listBusStops(), listBusSlabs().catch(() => ({ data: [] }))]);
            setStops(Array.isArray(stopsRes?.data) ? stopsRes.data : []);
            setSlabs(Array.isArray(slabsRes?.data) ? slabsRes.data : []);
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Failed to load bus stops.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);
    useLiveDataRefresh(load, [load], 'transport');

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return stops;
        return stops.filter((s) =>
            [s.stopName, s.slabName, s.geocode, ...(s.routes || []).map((r) => r.name)]
                .some((v) => (v || '').toLowerCase().includes(q))
        );
    }, [stops, search]);

    const rowsForExport = () =>
        filtered.map((s, i) => [i + 1, s.stopName, (s.routes || []).map((r) => r.name).join(', '), s.slabName || '', s.geocode || '', s.studentCount]);
    const headers = ['S.No', 'Bus Stop Name', 'Route Name', 'Slab Name', 'Geocode', 'Students'];

    const toggleRoute = (id) =>
        setForm((f) => ({
            ...f,
            routeIds: f.routeIds.includes(id) ? f.routeIds.filter((r) => r !== id) : [...f.routeIds, id]
        }));

    const openEdit = (s) =>
        setForm({
            id: s.id,
            stopName: s.stopName,
            routeIds: (s.routes || []).map((r) => r.id),
            slabName: s.slabName || '',
            geocode: s.geocode || ''
        });

    const handleSave = async (e) => {
        e.preventDefault();
        if (form.id ? !canEdit : !canCreate) {
            toast.error('You do not have permission for this action.');
            return;
        }
        const stopName = form.stopName.trim();
        if (!stopName) return toast.error('Bus stop name is required.');
        if (form.routeIds.length === 0) return toast.error('Select at least one route.');

        setSaving(true);
        try {
            const payload = {
                stopName,
                routeIds: form.routeIds,
                slabName: form.slabName.trim() || null,
                geocode: form.geocode.trim() || null
            };
            if (form.id) await updateBusStop(form.id, payload);
            else await createBusStop(payload);
            toast.success(form.id ? 'Bus stop updated successfully!' : 'Bus stop added successfully!');
            notifyDataChanged('transport');
            setForm(null);
            await load();
            onChanged?.();
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Failed to save bus stop.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!canDelete) return toast.error('You do not have permission to delete bus stops.');
        try {
            await deleteBusStop(confirmDelete.id);
            toast.success('Bus stop deleted successfully');
            setConfirmDelete({ isOpen: false, id: null, name: '' });
            notifyDataChanged('transport');
            await load();
            onChanged?.();
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Failed to delete bus stop.');
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
            <div className={`${cardCls} flex flex-col md:flex-row justify-between items-center gap-4 p-4`}>
                <div className="relative w-full md:max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                        type="text"
                        placeholder="Search bus stop, route, slab..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                    />
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto justify-end">
                    <ExportButtons
                        disabled={filtered.length === 0}
                        onExcel={() => exportRowsToExcel('Bus_Stops', headers, rowsForExport(), 'Bus Stops')}
                        onPdf={() => exportRowsToPdf('Bus_Stops', 'Bus Stops', headers, rowsForExport())}
                    />
                    {canCreate && (
                        <button
                            type="button"
                            onClick={() => setForm({ ...EMPTY })}
                            className={primaryBtn}
                        >
                            <Plus size={18} /> Add Bus Stop
                        </button>
                    )}
                </div>
            </div>

            <div className={`${cardCls} overflow-hidden`}>
                <div className="overflow-x-auto w-full min-w-0">
                    <table className="w-full text-left border-collapse min-w-max">
                        <thead>
                            <tr className={theadRowCls}>
                                <th className={thCls}>S.No</th>
                                <th className={thCls}>Bus Stop Name</th>
                                <th className={thCls}>Route Name</th>
                                <th className={thCls}>Slab Name</th>
                                <th className={thCls}>Geocode</th>
                                <th className={thCls}>Students</th>
                                <th className={`${thCls} text-right`}>Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm text-slate-600 dark:text-slate-300 font-medium">
                            {filtered.length === 0 ? (
                                <tr>
                                    <td colSpan="7">
                                        <EmptyState
                                            icon={MapPin}
                                            title="No Bus Stops Found"
                                            text={stops.length === 0 ? 'Add your first bus stop to start mapping students and fees.' : 'No bus stop matches your search.'}
                                        />
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((s, i) => (
                                    <tr key={s.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                                        <td className={tdCls}>{i + 1}</td>
                                        <td className={`${tdCls} font-bold text-slate-900 dark:text-white`}>{s.stopName}</td>
                                        <td className="py-3 px-4 max-w-md">
                                            <div className="flex flex-wrap gap-1">
                                                {(s.routes || []).map((r) => (
                                                    <span key={r.id} className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-md text-xs font-semibold">
                                                        {r.name}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className={tdCls}>{s.slabName || '-'}</td>
                                        <td className={tdCls}>{s.geocode || '-'}</td>
                                        <td className={tdCls}>{s.studentCount}</td>
                                        <td className={`${tdCls} text-right`}>
                                            {canEdit && (
                                                <button type="button" onClick={() => openEdit(s)} title="Edit Bus Stop"
                                                    className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-slate-800 rounded-lg transition-colors">
                                                    <Edit size={18} />
                                                </button>
                                            )}
                                            {canDelete && (
                                                <button type="button" onClick={() => setConfirmDelete({ isOpen: true, id: s.id, name: s.stopName })} title="Delete Bus Stop"
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
                    Showing {filtered.length} of {stops.length} entries
                </div>
            </div>

            {form && (
                <Modal title={form.id ? 'Edit Bus Stop' : 'Add Bus Stop'} onClose={() => setForm(null)}>
                    <form onSubmit={handleSave} className="space-y-4">
                        <Field label="Stop Name" required>
                            <input
                                type="text"
                                value={form.stopName}
                                onChange={(e) => setForm({ ...form, stopName: e.target.value })}
                                placeholder="e.g. 1 TO 5"
                                className={inputCls}
                                maxLength={150}
                                required
                            />
                        </Field>

                        <Field label="Route Name" required>
                            <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                                {routes.length === 0 ? (
                                    <p className="p-3 text-sm text-slate-400">No routes available. Add a bus route first.</p>
                                ) : (
                                    routes.map((r) => (
                                        <label key={r.id} className="flex items-center gap-3 px-4 py-2 text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                                            <input type="checkbox" checked={form.routeIds.includes(r.id)} onChange={() => toggleRoute(r.id)} />
                                            <span className="font-medium text-slate-700 dark:text-slate-200">{r.name}</span>
                                        </label>
                                    ))
                                )}
                            </div>
                            <div className="flex gap-3 mt-1 text-xs">
                                <button type="button" className="text-primary-600 font-semibold" onClick={() => setForm({ ...form, routeIds: routes.map((r) => r.id) })}>Select all</button>
                                <button type="button" className="text-slate-500 font-semibold" onClick={() => setForm({ ...form, routeIds: [] })}>Clear</button>
                                <span className="text-slate-400 ml-auto">{form.routeIds.length} selected</span>
                            </div>
                        </Field>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Field label="Slab Name">
                                <input
                                    type="text"
                                    list="bus-slab-options"
                                    value={form.slabName}
                                    onChange={(e) => setForm({ ...form, slabName: e.target.value })}
                                    placeholder="Select or type slab"
                                    className={inputCls}
                                    maxLength={100}
                                />
                                <datalist id="bus-slab-options">
                                    {slabs.map((sl) => <option key={sl} value={sl} />)}
                                </datalist>
                            </Field>
                            <Field label="Geocode">
                                <input
                                    type="text"
                                    value={form.geocode}
                                    onChange={(e) => setForm({ ...form, geocode: e.target.value })}
                                    placeholder="Bus Stop Geocode"
                                    className={inputCls}
                                    maxLength={100}
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
                title="Delete Bus Stop"
                message={`Are you sure you want to delete "${confirmDelete.name}"? Its fee entries will also be removed.`}
                confirmText="Delete Bus Stop"
                onConfirm={handleDelete}
                onCancel={() => setConfirmDelete({ isOpen: false, id: null, name: '' })}
            />
        </div>
    );
}
