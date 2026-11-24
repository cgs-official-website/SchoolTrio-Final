import React, { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { LuPlus as Plus, LuSearch as Search, LuUsers as Users, LuFileSpreadsheet as SheetIcon, LuFileText as PdfIcon } from 'react-icons/lu';
import { Edit, Trash2 } from 'lucide-react';
import ConfirmModal from '../../../components/ConfirmModal';
import {
    listTransportAssignments, listBusStops, createStudentMappings, updateStudentMapping, deleteStudentMapping
} from '../../../api/transport';
import { listStudents } from '../../../api/students';
import { listClasses } from '../../../api/classes';
import { sortClassesAscending, sortSectionsAscending } from '../../../utils/classSorting';
import { useLiveDataRefresh } from '../../../hooks/useLiveDataRefresh';
import { notifyDataChanged } from '../../../utils/liveData';
import { exportRowsToExcel, exportRowsToPdf, formatDisplayDate, formatAmount } from '../../../utils/transportExport';
import {
    inputCls, primaryBtn, ghostBtn, cardCls, thCls, tdCls, theadRowCls,
    Field, Modal, ExportButtons, EmptyState, todayStr
} from './ui';

const TRAVEL_MODES = ['Pickup & Drop', 'Pickup', 'Drop'];
const studentName = (s) => `${s.firstName || ''} ${s.lastName || ''}`.trim();
// Dropdown shows the vehicle NAME (falls back to the vehicle number only if the vehicle has no name)
const busName = (r) => {
    if (r?.vehicleName) return r.vehicleName;
    return r?.vehicleNumber && r.vehicleNumber !== 'N/A' ? r.vehicleNumber : 'No bus';
};
const routeLabel = (r) => `${r.name} - ${busName(r)}`;
const kmOf = (label) => {
    const m = /(\d+(?:\.\d+)?)/.exec(String(label ?? ''));
    return m ? `${Number(m[1])} KM` : label || '';
};

const emptyForm = (extra = {}) => ({
    id: null, routeId: '', busStopId: '', travelMode: 'Pickup & Drop', effectFrom: todayStr(),
    classId: '', sectionId: '', studentIds: [], ...extra
});

export default function StudentMappingTab({ routes, canCreate, canEdit, canDelete, preset, onPresetUsed, onChanged }) {
    const [assignments, setAssignments] = useState([]);
    const [classes, setClasses] = useState([]);
    const [stops, setStops] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [routeFilter, setRouteFilter] = useState('ALL');
    const [classFilter, setClassFilter] = useState('ALL');
    const [sectionFilter, setSectionFilter] = useState('ALL');
    const [form, setForm] = useState(null);
    const [studentQuery, setStudentQuery] = useState('');
    const [candidates, setCandidates] = useState([]); // students of the chosen class/section
    const [loadingCandidates, setLoadingCandidates] = useState(false);
    const [saving, setSaving] = useState(false);
    const [confirmUnmap, setConfirmUnmap] = useState({ isOpen: false, id: null, name: '' });

    const load = useCallback(async () => {
        try {
            const [aRes, cRes, stopsRes] = await Promise.all([
                listTransportAssignments(),
                listClasses({ limit: 100 }).catch(() => ({ data: [] })),
                listBusStops().catch(() => ({ data: [] }))
            ]);
            setAssignments(Array.isArray(aRes?.data) ? aRes.data : []);
            setClasses(sortClassesAscending(Array.isArray(cRes?.data) ? cRes.data : []));
            setStops(Array.isArray(stopsRes?.data) ? stopsRes.data : []);
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Failed to load transport students.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);
    useLiveDataRefresh(load, [load], 'transport');

    useEffect(() => {
        if (preset?.routeId && canCreate) {
            setForm(emptyForm({ routeId: preset.routeId }));
            setStudentQuery('');
            onPresetUsed?.();
        }
    }, [preset, canCreate, onPresetUsed]);

    // Load only the students of the chosen standard (+ section) in the add form
    const pickClassId = form && !form.id ? form.classId : '';
    const pickSectionId = form && !form.id ? form.sectionId : '';
    useEffect(() => {
        if (!pickClassId) {
            setCandidates([]);
            return undefined;
        }
        let cancelled = false;
        setLoadingCandidates(true);
        listStudents({ classId: pickClassId, ...(pickSectionId ? { sectionId: pickSectionId } : {}), limit: 1000 })
            .then((res) => { if (!cancelled) setCandidates(Array.isArray(res?.data) ? res.data : []); })
            .catch((err) => {
                if (cancelled) return;
                console.error(err);
                setCandidates([]);
                toast.error(err.message || 'Failed to load students.');
            })
            .finally(() => { if (!cancelled) setLoadingCandidates(false); });
        return () => { cancelled = true; };
    }, [pickClassId, pickSectionId]);

    const mappedIds = useMemo(() => new Set(assignments.map((a) => a.id)), [assignments]);
    const unmappedCandidates = useMemo(
        () => candidates.filter((s) => !mappedIds.has(s.id) && !s.transportRouteId),
        [candidates, mappedIds]
    );
    const assignmentById = useMemo(() => new Map(assignments.map((a) => [a.id, a])), [assignments]);
    const isAlreadyMapped = (st) => mappedIds.has(st.id) || Boolean(st.transportRouteId);

    const vehicleNo = (a) => a.transportRoute?.vehicle?.registrationNumber || a.transportRoute?.routeNumber || '-';
    const vehicleNameOf = (a) => a.transportRoute?.vehicle?.customData?.vehicleName || a.transportRoute?.vehicle?.model || '-';
    const stopOf = (a) => a.busStop?.stopName || a.pickupStop?.stopName || '-';
    const distanceOf = (a) => kmOf(a.busStop?.slabName) || '-';

    const classKey = (a) => a.classId || a.class?.id || a.class?.name || '';
    const natural = (x, y) => String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' });

    const classOptions = useMemo(() => {
        const m = new Map();
        assignments.forEach((a) => { if (classKey(a) && a.class?.name) m.set(classKey(a), a.class.name); });
        return [...m.entries()].sort((x, y) => natural(x[1], y[1]));
    }, [assignments]);

    const sectionOptions = useMemo(() => {
        const m = new Map();
        assignments.forEach((a) => {
            if (classFilter !== 'ALL' && classKey(a) !== classFilter) return;
            if (a.section?.name) m.set(a.section.name.toLowerCase(), a.section.name);
        });
        return [...m.values()].sort(natural);
    }, [assignments, classFilter]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return assignments.filter((a) => {
            if (routeFilter !== 'ALL' && a.transportRouteId !== routeFilter) return false;
            if (classFilter !== 'ALL' && classKey(a) !== classFilter) return false;
            if (sectionFilter !== 'ALL' && (a.section?.name || '').toLowerCase() !== sectionFilter.toLowerCase()) return false;
            if (!q) return true;
            return [studentName(a), a.admissionNumber, a.transportRoute?.name, vehicleNameOf(a), vehicleNo(a), stopOf(a), a.parents?.[0]?.parent?.phone]
                .some((v) => (v || '').toLowerCase().includes(q));
        });
    }, [assignments, search, routeFilter, classFilter, sectionFilter]);

    const headers = ['S.No', 'Admission No', 'Student Name', 'Mobile No', 'Class', 'Section', 'Vehicle Name', 'Bus Number', 'Route Name', 'Stop Name', 'Distance (KM)', 'Travel Mode', 'Effect From', 'Fees (Rs.)', 'Due Date'];

    // one export row (plain text only - the PDF font has no rupee sign, so amounts are numbers under "Fees (Rs.)")
    const rowOf = (a, i, feeCell, dueCell) => [
        i + 1, a.admissionNumber || '', studentName(a), a.parents?.[0]?.parent?.phone || '',
        a.class?.name || '', a.section?.name || '', vehicleNameOf(a) === '-' ? '' : vehicleNameOf(a), vehicleNo(a), a.transportRoute?.name || '',
        stopOf(a), distanceOf(a) === '-' ? '' : distanceOf(a), a.travelMode || '', formatDisplayDate(a.transportEffectFrom), feeCell, dueCell
    ];

    const rowsForExport = () =>
        filtered.map((a, i) => rowOf(
            a, i,
            a.fees?.length ? a.totalFee : '',
            (a.fees || []).map((f) => formatDisplayDate(f.dueDate)).join(', ')
        ));

    // hover text on the Fees cell, e.g. "Phase 1: ₹5,000 due 11-12-2026; Phase 2: ₹5,000 due 11-03-2027"
    const feeDetailText = (a) =>
        (a.fees || [])
            .map((f) => `${f.phaseCount > 1 ? `Phase ${f.phase}: ` : ''}₹${formatAmount(f.amount)} due ${formatDisplayDate(f.dueDate)}`)
            .join('; ');

    // Excel / PDF of ONE student: same layout and columns as the list export.
    // A student with several fee phases gets one row per phase (amount + its due date).
    const exportOne = (a, type) => {
        const phases = a.fees?.length ? a.fees : [null];
        const rows = phases.map((f) => rowOf(a, 0, f ? f.amount : '', f ? formatDisplayDate(f.dueDate) : ''));
        const base = `Transport_${studentName(a)}_${a.admissionNumber || ''}`;
        if (type === 'excel') exportRowsToExcel(base, headers, rows, 'Transport Student', `TRANSPORT DETAILS - ${studentName(a)}`);
        else exportRowsToPdf(base, `Transport Details - ${studentName(a)}`, headers, rows);
    };

    const stopsForRoute = (routeId) => stops.filter((s) => (s.routes || []).some((r) => r.id === routeId));

    const openAdd = () => {
        setForm(emptyForm());
        setStudentQuery('');
    };

    const openEdit = (a) => {
        setForm({
            id: a.id, studentLabel: `${studentName(a)} (${a.admissionNumber || 'No Adm No'})`,
            routeId: a.transportRouteId || '', busStopId: a.busStopId || a.busStop?.id || '',
            travelMode: a.travelMode || 'Pickup & Drop', effectFrom: a.transportEffectFrom || todayStr(),
            classId: '', sectionId: '', studentIds: [a.id]
        });
    };

    const toggleStudent = (id) =>
        setForm((f) => ({ ...f, studentIds: f.studentIds.includes(id) ? f.studentIds.filter((x) => x !== id) : [...f.studentIds, id] }));

    const visibleCandidates = useMemo(() => {
        const q = studentQuery.trim().toLowerCase();
        return q
            ? unmappedCandidates.filter((s) => studentName(s).toLowerCase().includes(q) || (s.admissionNumber || '').toLowerCase().includes(q))
            : unmappedCandidates;
    }, [unmappedCandidates, studentQuery]);

    // every student of the chosen class/section: free ones first, students already on a bus are shown greyed out
    const listedCandidates = useMemo(() => {
        const q = studentQuery.trim().toLowerCase();
        const base = q
            ? candidates.filter((st) => studentName(st).toLowerCase().includes(q) || (st.admissionNumber || '').toLowerCase().includes(q))
            : candidates;
        return [...base.filter((st) => !isAlreadyMapped(st)), ...base.filter((st) => isAlreadyMapped(st))];
    }, [candidates, studentQuery, mappedIds]);

    const allVisibleSelected = visibleCandidates.length > 0 && visibleCandidates.every((s) => form?.studentIds.includes(s.id));
    const toggleAllVisible = () =>
        setForm((f) => {
            const ids = visibleCandidates.map((s) => s.id);
            return {
                ...f,
                studentIds: allVisibleSelected ? f.studentIds.filter((id) => !ids.includes(id)) : [...new Set([...f.studentIds, ...ids])]
            };
        });

    const selectedClass = classes.find((c) => c.id === form?.classId);
    const sectionsOfClass = useMemo(() => sortSectionsAscending(selectedClass?.sections || []), [selectedClass]);

    const selectedRoute = routes.find((r) => r.id === form?.routeId);
    const routeCount = assignments.filter((a) => a.transportRouteId === form?.routeId && !(form?.studentIds || []).includes(a.id)).length;

    const handleSave = async (e) => {
        e.preventDefault();
        if (form.id ? !canEdit : !canCreate) return toast.error('You do not have permission for this action.');
        if (!form.routeId) return toast.error('Please select a bus route.');
        if (!form.busStopId) return toast.error('Please select a bus stop.');
        if (!form.effectFrom) return toast.error('Please select the effect from date.');
        if (form.studentIds.length === 0) return toast.error('Please select at least one student.');
        if (selectedRoute && routeCount + form.studentIds.length > selectedRoute.capacity) {
            return toast.error(`Bus capacity (${selectedRoute.capacity}) would be exceeded.`);
        }

        setSaving(true);
        try {
            const base = { routeId: form.routeId, busStopId: form.busStopId, travelMode: form.travelMode, effectFrom: form.effectFrom };
            if (form.id) await updateStudentMapping(form.id, base);
            else await createStudentMappings({ ...base, studentIds: form.studentIds });
            toast.success(form.id ? 'Mapping updated successfully!' : `${form.studentIds.length} student(s) mapped successfully!`);
            notifyDataChanged('transport');
            setForm(null);
            await load();
            onChanged?.();
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Failed to save mapping.');
        } finally {
            setSaving(false);
        }
    };

    const handleUnmap = async () => {
        if (!canEdit) return toast.error('You do not have permission to modify student mappings.');
        try {
            await deleteStudentMapping(confirmUnmap.id);
            toast.success('Student unmapped successfully');
            notifyDataChanged('transport');
            await load();
            onChanged?.();
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Failed to unmap student.');
        } finally {
            setConfirmUnmap({ isOpen: false, id: null, name: '' });
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center py-16">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent"></div>
            </div>
        );
    }

    const selectCls = 'px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-200';

    return (
        <div className="space-y-6">
            <div className={`${cardCls} flex flex-col lg:flex-row justify-between items-center gap-4 p-4`}>
                <div className="flex flex-col sm:flex-row flex-wrap gap-3 w-full lg:flex-1 min-w-0">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="Search student, admission no, bus number, stop..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                        />
                    </div>
                    <select value={routeFilter} onChange={(e) => setRouteFilter(e.target.value)} className={selectCls} title="Filter by bus route">
                        <option value="ALL">All Buses</option>
                        {routes.map((r) => <option key={r.id} value={r.id}>{routeLabel(r)}</option>)}
                    </select>
                    <select
                        value={classFilter}
                        onChange={(e) => { setClassFilter(e.target.value); setSectionFilter('ALL'); }}
                        className={selectCls}
                        title="Filter by standard"
                    >
                        <option value="ALL">All Standards</option>
                        {classOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                    </select>
                    <select value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)} className={selectCls} title="Filter by section">
                        <option value="ALL">All Sections</option>
                        {sectionOptions.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                </div>
                <div className="flex items-center gap-3 justify-end shrink-0">
                    <ExportButtons
                        disabled={filtered.length === 0}
                        onExcel={() => exportRowsToExcel('Transport_Students', headers, rowsForExport(), 'Transport Students', 'TRANSPORT STUDENTS LIST')}
                        onPdf={() => exportRowsToPdf('Transport_Students', 'Transport Student List', headers, rowsForExport())}
                    />
                    {canCreate && (
                        <button type="button" onClick={openAdd} className={`${primaryBtn} whitespace-nowrap !px-4 !py-2 text-sm`}>
                            <Plus size={16} /> Student Add
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
                                <th className={thCls}>Admission No</th>
                                <th className={thCls}>Student Name</th>
                                <th className={thCls}>Mobile No</th>
                                <th className={thCls}>Class</th>
                                <th className={thCls}>Section</th>
                                <th className={thCls}>Vehicle Name</th>
                                <th className={thCls}>Bus Number</th>
                                <th className={thCls}>Route Name</th>
                                <th className={thCls}>Stop Name</th>
                                <th className={thCls}>Distance (KM)</th>
                                <th className={thCls}>Travel Mode</th>
                                <th className={thCls}>Effect From</th>
                                <th className={thCls}>Fees</th>
                                <th className={thCls}>Due Date</th>
                                <th className={`${thCls} text-right`}>Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm text-slate-600 dark:text-slate-300 font-medium">
                            {filtered.length === 0 ? (
                                <tr>
                                    <td colSpan="16">
                                        <EmptyState icon={Users} title="No Transport Students Found"
                                            text={assignments.length === 0 ? 'Use "Student Add" to map students to a bus and stop.' : 'No student matches your search/filter.'} />
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((a, i) => (
                                    <tr key={a.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                                        <td className={tdCls}>{i + 1}</td>
                                        <td className={`${tdCls} font-mono text-xs`}>{a.admissionNumber || 'N/A'}</td>
                                        <td className={`${tdCls} font-bold text-slate-900 dark:text-white`}>{studentName(a)}</td>
                                        <td className={tdCls}>{a.parents?.[0]?.parent?.phone || '-'}</td>
                                        <td className={tdCls}>{a.class?.name || '-'}</td>
                                        <td className={tdCls}>{a.section?.name || '-'}</td>
                                        <td className={`${tdCls} font-semibold text-slate-800 dark:text-slate-100`}>{vehicleNameOf(a)}</td>
                                        <td className={`${tdCls} font-mono text-xs`}>{vehicleNo(a)}</td>
                                        <td className={tdCls}>{a.transportRoute?.name || '-'}</td>
                                        <td className={tdCls}>{stopOf(a)}</td>
                                        <td className={tdCls}>{distanceOf(a)}</td>
                                        <td className={tdCls}>{a.travelMode || '-'}</td>
                                        <td className={tdCls}>{formatDisplayDate(a.transportEffectFrom) || '-'}</td>
                                        <td className={tdCls}>
                                            {a.fees?.length ? (
                                                <div title={feeDetailText(a)}>
                                                    <span className="font-bold text-slate-900 dark:text-white">₹{formatAmount(a.totalFee)}</span>
                                                    {a.fees.length > 1 && (
                                                        <span className="block text-[11px] text-slate-400 dark:text-slate-500 font-normal">{a.fees.length} phases</span>
                                                    )}
                                                </div>
                                            ) : '-'}
                                        </td>
                                        <td className={tdCls}>
                                            {a.fees?.length ? (
                                                <div title={feeDetailText(a)}>
                                                    {a.fees.map((f) => (
                                                        <span key={f.dueDate} className="block">{formatDisplayDate(f.dueDate)}</span>
                                                    ))}
                                                </div>
                                            ) : '-'}
                                        </td>
                                        <td className={`${tdCls} text-right`}>
                                            <button type="button" onClick={() => exportOne(a, 'excel')} title="Export this student to Excel"
                                                className="p-1.5 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg transition-colors">
                                                <SheetIcon size={18} />
                                            </button>
                                            <button type="button" onClick={() => exportOne(a, 'pdf')} title="Export this student to PDF"
                                                className="p-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors">
                                                <PdfIcon size={18} />
                                            </button>
                                            {canEdit && (
                                                <>
                                                    <button type="button" onClick={() => openEdit(a)} title="Edit Mapping"
                                                        className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-slate-800 rounded-lg transition-colors">
                                                        <Edit size={18} />
                                                    </button>
                                                    <button type="button" onClick={() => setConfirmUnmap({ isOpen: true, id: a.id, name: studentName(a) })} title="Unmap Student"
                                                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-slate-800 rounded-lg transition-colors">
                                                        <Trash2 size={18} />
                                                    </button>
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800">
                    Showing {filtered.length} of {assignments.length} entries
                </div>
            </div>

            {form && (
                <Modal title={form.id ? 'Edit Bus Student Mapping' : 'Add Bus Student Mapping'} onClose={() => setForm(null)} wide>
                    <form onSubmit={handleSave} className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Field label="Bus Route" required>
                                <select value={form.routeId} onChange={(e) => setForm({ ...form, routeId: e.target.value, busStopId: '' })} className={inputCls} required>
                                    <option value="">Please select Bus Route</option>
                                    {routes.map((r) => <option key={r.id} value={r.id}>{routeLabel(r)}</option>)}
                                </select>
                            </Field>
                            <Field label="Bus Stop" required>
                                <select value={form.busStopId} onChange={(e) => setForm({ ...form, busStopId: e.target.value })} className={inputCls} required disabled={!form.routeId}>
                                    <option value="">Please select Bus Stop</option>
                                    {stopsForRoute(form.routeId).map((s) => (
                                        <option key={s.id} value={s.id}>{s.stopName}{s.distanceKm !== null && s.distanceKm !== undefined ? ` (${s.distanceKm} KM)` : ''}</option>
                                    ))}
                                </select>
                                {form.routeId && stopsForRoute(form.routeId).length === 0 && (
                                    <p className="text-xs text-amber-600 mt-1">No bus stop is linked to this bus yet. Add one in the Bus Stop tab.</p>
                                )}
                            </Field>
                            <Field label="Travel Mode" required>
                                <select value={form.travelMode} onChange={(e) => setForm({ ...form, travelMode: e.target.value })} className={inputCls} required>
                                    {TRAVEL_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                                </select>
                            </Field>
                            <Field label="Effect From" required>
                                <input type="date" value={form.effectFrom} onChange={(e) => setForm({ ...form, effectFrom: e.target.value })} className={inputCls} required />
                            </Field>
                        </div>

                        {selectedRoute && (
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                Bus capacity: {routeCount + form.studentIds.length} / {selectedRoute.capacity} after this save
                            </p>
                        )}

                        {form.id ? (
                            <Field label="Student">
                                <div className="px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-200">{form.studentLabel}</div>
                            </Field>
                        ) : (
                            <>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <Field label="Standard" required>
                                        <select
                                            value={form.classId}
                                            onChange={(e) => { setForm({ ...form, classId: e.target.value, sectionId: '', studentIds: [] }); setStudentQuery(''); }}
                                            className={inputCls}
                                        >
                                            <option value="">Select standard</option>
                                            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                    </Field>
                                    <Field label="Section">
                                        <select
                                            value={form.sectionId}
                                            onChange={(e) => setForm({ ...form, sectionId: e.target.value, studentIds: [] })}
                                            className={inputCls}
                                            disabled={!form.classId}
                                        >
                                            <option value="">All sections</option>
                                            {sectionsOfClass.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                                        </select>
                                    </Field>
                                </div>

                                <Field label="Student List" required>
                                    {!form.classId ? (
                                        <p className="px-4 py-6 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-sm text-slate-400 text-center">
                                            Select a standard (and section) to see its students.
                                        </p>
                                    ) : (
                                        <>
                                            <input
                                                type="text"
                                                value={studentQuery}
                                                onChange={(e) => setStudentQuery(e.target.value)}
                                                placeholder="Search by name or admission no"
                                                className={`${inputCls} mb-2`}
                                            />
                                            <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                                                {loadingCandidates ? (
                                                    <p className="p-3 text-sm text-slate-400">Loading students...</p>
                                                ) : listedCandidates.length === 0 ? (
                                                    <p className="p-3 text-sm text-slate-400">No students found.</p>
                                                ) : (
                                                    listedCandidates.map((st) => {
                                                        const taken = isAlreadyMapped(st);
                                                        const routeName = assignmentById.get(st.id)?.transportRoute?.name;
                                                        return (
                                                            <label
                                                                key={st.id}
                                                                className={`flex items-center gap-3 px-4 py-2 text-sm ${taken
                                                                    ? 'bg-slate-50 dark:bg-slate-800/60 cursor-not-allowed'
                                                                    : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    disabled={taken}
                                                                    checked={!taken && form.studentIds.includes(st.id)}
                                                                    onChange={() => toggleStudent(st.id)}
                                                                />
                                                                <span className={`font-medium ${taken ? 'text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-200'}`}>
                                                                    {studentName(st)}
                                                                </span>
                                                                {taken && (
                                                                    <span className="text-[11px] text-slate-400 dark:text-slate-500 italic">
                                                                        already on a bus{routeName ? ` · ${routeName}` : ''}
                                                                    </span>
                                                                )}
                                                                <span className={`text-xs font-mono ml-auto ${taken ? 'text-slate-300 dark:text-slate-600' : 'text-slate-400'}`}>
                                                                    {st.admissionNumber || 'No Adm No'}
                                                                </span>
                                                            </label>
                                                        );
                                                    })
                                                )}
                                            </div>
                                            <div className="flex items-center gap-3 mt-1 text-xs">
                                                <button type="button" onClick={toggleAllVisible} disabled={visibleCandidates.length === 0} className="text-primary-600 font-semibold disabled:opacity-40">
                                                    {allVisibleSelected ? 'Unselect all' : 'Select all'}
                                                </button>
                                                <span className="text-slate-400">{form.studentIds.length} selected</span>
                                            </div>
                                        </>
                                    )}
                                </Field>
                            </>
                        )}

                        <div className="pt-4 flex justify-end gap-3">
                            <button type="submit" disabled={saving} className={primaryBtn}>{saving ? 'Saving...' : 'Save'}</button>
                            <button type="button" onClick={() => setForm(null)} className={ghostBtn}>Cancel</button>
                        </div>
                    </form>
                </Modal>
            )}

            <ConfirmModal
                isOpen={confirmUnmap.isOpen}
                title="Unmap Student"
                message={`Remove "${confirmUnmap.name}" from the bus? The student record itself is not deleted.`}
                confirmText="Unmap"
                onConfirm={handleUnmap}
                onCancel={() => setConfirmUnmap({ isOpen: false, id: null, name: '' })}
            />
        </div>
    );
}