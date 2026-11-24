import React, { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { LuPlus as Plus, LuSearch as Search, LuMapPin as MapPin } from 'react-icons/lu';
import { Edit, Trash2 } from 'lucide-react';
import ConfirmModal from '../../../components/ConfirmModal';
import { listBusStops, createBusStop, updateBusStop, deleteBusStop } from '../../../api/transport';
import { useLiveDataRefresh } from '../../../hooks/useLiveDataRefresh';
import { notifyDataChanged } from '../../../utils/liveData';
import { exportRowsToExcel, exportRowsToPdf } from '../../../utils/transportExport';
import {
    inputCls, primaryBtn, ghostBtn, cardCls, thCls, tdCls, theadRowCls,
    Field, Modal, ExportButtons, EmptyState
} from './ui';

const EMPTY = { id: null, stopName: '', routeIds: [], distanceKm: '', geocode: '' };

// "TN-33-BU-8569 - thindal"
const busLabel = (r) => `${r.vehicleName ? `${r.vehicleName} · ` : ''}${r.vehicleNumber && r.vehicleNumber !== 'N/A' ? r.vehicleNumber : 'No bus assigned'} - ${r.name}`;

export default function BusStopTab({ routes, canCreate, canEdit, canDelete, onChanged }) {
    const [stops, setStops] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [vehicleFilter, setVehicleFilter] = useState('ALL');
    const [form, setForm] = useState(null);
    const [saving, setSaving] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, id: null, name: '' });

    const load = useCallback(async () => {
        try {
            const res = await listBusStops();
            setStops(Array.isArray(res?.data) ? res.data : []);
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Failed to load bus stops.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);
    useLiveDataRefresh(load, [load], 'transport');

    const vehicleNamesOf = (s) => [...new Set((s.buses || []).map((b) => b.vehicleName || b.busNumber).filter(Boolean))];

    // every vehicle that serves at least one stop (for the filter dropdown)
    const vehicleOptions = useMemo(() => {
        const names = new Set();
        stops.forEach((s) => vehicleNamesOf(s).forEach((n) => names.add(n)));
        return [...names].sort((x, y) => x.localeCompare(y, undefined, { numeric: true, sensitivity: 'base' }));
    }, [stops]);

    // if the chosen vehicle no longer has any stop (e.g. after an edit), fall back to "All"
    const activeVehicle = vehicleOptions.includes(vehicleFilter) ? vehicleFilter : 'ALL';

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return stops.filter((s) => {
            if (activeVehicle !== 'ALL' && !vehicleNamesOf(s).includes(activeVehicle)) return false;
            if (!q) return true;
            return [s.stopName, s.distanceLabel, s.geocode, ...(s.buses || []).flatMap((b) => [b.vehicleName, b.busNumber, b.routeName])]
                .some((v) => (v || '').toLowerCase().includes(q));
        });
    }, [stops, search, activeVehicle]);

    const headers = ['S.No', 'Bus Stop Name', 'Vehicle Name', 'Distance (KM)', 'Geocode', 'Students'];
    const rowsForExport = () =>
        filtered.map((s, i) => [i + 1, s.stopName, vehicleNamesOf(s).join(', '), s.distanceKm ?? '', s.geocode || '', s.studentCount]);

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
            distanceKm: s.distanceKm ?? '',
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
        if (form.routeIds.length === 0) return toast.error('Select at least one bus that stops here.');
        if (form.distanceKm === '' || form.distanceKm === null || !Number.isFinite(Number(form.distanceKm)) || Number(form.distanceKm) < 0) {
            return toast.error('Distance (KM) is required and must be a valid number. It is used for slab fees.');
        }

        setSaving(true);
        try {
            const payload = {
                stopName,
                routeIds: form.routeIds,
                distanceKm: Number(form.distanceKm),
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
            <div className={`${cardCls} flex flex-wrap items-center gap-3 p-4`}>
                <div className="flex flex-1 min-w-[260px] gap-3">
                    <div className="relative flex-1 md:max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="Search bus stop, bus number, route..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                        />
                    </div>
                    <select
                        value={activeVehicle}
                        onChange={(e) => setVehicleFilter(e.target.value)}
                        className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-200"
                        title="Filter by vehicle"
                    >
                        <option value="ALL">All Vehicles</option>
                        {vehicleOptions.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                </div>
                <div className="flex flex-nowrap items-center gap-3 ml-auto">
                    <ExportButtons
                        disabled={filtered.length === 0}
                        onExcel={() => exportRowsToExcel('Bus_Stops', headers, rowsForExport(), 'Bus Stops')}
                        onPdf={() => exportRowsToPdf('Bus_Stops', 'Bus Stops', headers, rowsForExport())}
                    />
                    {canCreate && (
                        <button type="button" onClick={() => setForm({ ...EMPTY })} className={primaryBtn}>
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
                                <th className={thCls}>Vehicle Name</th>
                                <th className={thCls}>Distance (KM)</th>
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
                                            text={stops.length === 0 ? 'Add your first bus stop to start mapping students and fees.' : 'No bus stop matches your search/filter.'}
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
                                                {(s.buses || []).length === 0 ? (
                                                    <span className="text-xs text-slate-400">-</span>
                                                ) : (
                                                    s.buses.map((b) => (
                                                        <span
                                                            key={b.routeId}
                                                            title={`${b.busNumber || 'No bus'} · Route: ${b.routeName}`}
                                                            className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-md text-xs font-bold"
                                                        >
                                                            {b.vehicleName || b.busNumber || 'No bus'}
                                                        </span>
                                                    ))
                                                )}
                                            </div>
                                        </td>
                                        <td className={tdCls}>{s.distanceKm !== null && s.distanceKm !== undefined ? `${s.distanceKm} KM` : (s.distanceLabel || '-')}</td>
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
                        <Field label="Bus Stop Name" required>
                            <input
                                type="text"
                                value={form.stopName}
                                onChange={(e) => setForm({ ...form, stopName: e.target.value })}
                                placeholder="e.g. Perundurai Bus Stand"
                                className={inputCls}
                                maxLength={150}
                                required
                            />
                        </Field>

                        <Field label="Buses that stop here" required>
                            <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                                {routes.length === 0 ? (
                                    <p className="p-3 text-sm text-slate-400">No buses available. Register a vehicle and add a bus route first.</p>
                                ) : (
                                    routes.map((r) => (
                                        <label key={r.id} className="flex items-center gap-3 px-4 py-2 text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                                            <input type="checkbox" checked={form.routeIds.includes(r.id)} onChange={() => toggleRoute(r.id)} />
                                            <span className="font-medium text-slate-700 dark:text-slate-200">{busLabel(r)}</span>
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
                            <Field label="Distance (KM)" required>
                                <input
                                    type="number"
                                    required
                                    min="0"
                                    step="0.1"
                                    value={form.distanceKm}
                                    onChange={(e) => setForm({ ...form, distanceKm: e.target.value })}
                                    placeholder="Total km from school, e.g. 25"
                                    className={inputCls}
                                />
                            </Field>
                            <Field label="Geocode">
                                <input
                                    type="text"
                                    value={form.geocode}
                                    onChange={(e) => setForm({ ...form, geocode: e.target.value })}
                                    placeholder="Optional"
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