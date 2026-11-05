import React, { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import {
    LuX as X,
    LuDownload as Download,
    LuFileSpreadsheet as FileSpreadsheet
} from 'react-icons/lu';
import { listAttendanceSessions, getAttendanceDashboardStats } from '../../api/attendance';
import { listStudents } from '../../api/students';
import { flattenClassesWithSections } from '../../utils/classSorting';
import {
    buildAttendanceWorkbook,
    getPeriodRange,
    getLocalToday,
    addDays
} from '../../utils/attendanceReportExport';

const PERIOD_OPTIONS = [
    { id: 'daily', label: 'Daily', hint: 'One date, student-wise status' },
    { id: 'weekly', label: 'Weekly', hint: 'Mon–Sun register with totals' },
    { id: 'monthly', label: 'Monthly', hint: 'Full month register with %' }
];

const SESSION_OPTIONS = [
    { id: 'all', label: 'All Sessions' },
    { id: 'FN', label: 'Forenoon (FN)' },
    { id: 'AN', label: 'Afternoon (AN)' }
];

const PREVIEW_TEXT = {
    daily: 'Each class gets its own sheet with Roll No, Admission No, Student Name and Present / Absent / Late for the chosen date, plus class totals.',
    weekly: 'Each class gets a register with one column per working day (P / A / L), then Present, Absent, Late, Marked, Attendance % and a low-attendance remark.',
    monthly: 'Each class gets a full month register with one column per working day (P / A / L), then Present, Absent, Late, Marked, Attendance % and a low-attendance remark.'
};

const inputClass =
    'w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-sm font-semibold text-slate-900 dark:text-white bg-white dark:bg-slate-900 transition-all';
const labelClass = 'block text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider';
const chipClass =
    'px-3 py-1 text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors';

/** Fetches every page of sessions (with student records) for the given filters. */
async function fetchAllSessions(filters) {
    let all = [];
    let page = 1;
    let totalPages = 1;
    do {
        const res = await listAttendanceSessions({ ...filters, includeRecords: true, page, limit: 100 });
        const rows = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        all = all.concat(rows);
        totalPages = res?.pagination?.totalPages || 1;
        page += 1;
    } while (page <= totalPages);
    return all;
}

export default function AttendanceExportModal({
    isOpen,
    onClose,
    classes = [],
    defaultDate,
    isCoordinator = false,
    assignedGrades = [],
    generatedBy = ''
}) {
    const [mode, setMode] = useState('daily');
    const [anchorDate, setAnchorDate] = useState(defaultDate || getLocalToday());
    const [anchorMonth, setAnchorMonth] = useState((defaultDate || getLocalToday()).slice(0, 7));
    const [classKey, setClassKey] = useState('all');
    const [sessionFilter, setSessionFilter] = useState('all');
    const [busy, setBusy] = useState(false);
    const [step, setStep] = useState('');

    // Reset the form every time the pop-up opens
    useEffect(() => {
        if (isOpen) {
            const base = defaultDate || getLocalToday();
            setMode('daily');
            setAnchorDate(base);
            setAnchorMonth(base.slice(0, 7));
            setClassKey('all');
            setSessionFilter('all');
            setBusy(false);
            setStep('');
        }
    }, [isOpen, defaultDate]);

    const gradeMatches = (gradeLevel, name) => {
        const g = String(gradeLevel || '').toLowerCase();
        const n = String(name || '').toLowerCase();
        return assignedGrades.some((a) => {
            const x = a.toLowerCase();
            return x === g || (g && g.includes(x)) || x === n;
        });
    };

    const classOptions = useMemo(() => {
        let list = flattenClassesWithSections(classes);
        if (isCoordinator && assignedGrades.length > 0) {
            list = list.filter((o) => gradeMatches(o.rawClass?.gradeLevel, o.className));
        }
        return list;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [classes, isCoordinator, assignedGrades]);

    const period = useMemo(
        () => getPeriodRange(mode, mode === 'monthly' ? anchorMonth : anchorDate),
        [mode, anchorDate, anchorMonth]
    );

    if (!isOpen) return null;

    const selectedUnit = classKey === 'all' ? null : classOptions.find((o) => o.key === classKey) || null;
    const classLabel = selectedUnit ? selectedUnit.label : 'All Classes';
    const canDownload = mode === 'monthly' ? !!anchorMonth : !!anchorDate;

    /* ---- quick pick chips ---- */
    const today = getLocalToday();
    const quickPicks =
        mode === 'daily'
            ? [
                { label: 'Today', apply: () => setAnchorDate(today) },
                { label: 'Yesterday', apply: () => setAnchorDate(addDays(today, -1)) }
            ]
            : mode === 'weekly'
                ? [
                    { label: 'This Week', apply: () => setAnchorDate(today) },
                    { label: 'Last Week', apply: () => setAnchorDate(addDays(today, -7)) }
                ]
                : [
                    { label: 'This Month', apply: () => setAnchorMonth(today.slice(0, 7)) },
                    {
                        label: 'Last Month',
                        apply: () => {
                            const [y, m] = today.slice(0, 7).split('-').map(Number);
                            const dt = new Date(Date.UTC(y, m - 2, 1));
                            setAnchorMonth(`${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`);
                        }
                    }
                ];

    /* ---- export ---- */
    const handleDownload = async () => {
        if (busy || !canDownload) return;
        setBusy(true);

        try {
            setStep('Fetching attendance records...');
            const filters = { startDate: period.startDate, endDate: period.endDate };
            if (selectedUnit?.classId) filters.classId = selectedUnit.classId;
            if (selectedUnit?.sectionId) filters.sectionId = selectedUnit.sectionId;
            if (sessionFilter !== 'all') filters.session = sessionFilter;

            let sessions = await fetchAllSessions(filters);

            // Section stored only as a name (no id) -> filter client side
            if (selectedUnit && !selectedUnit.sectionId && selectedUnit.sectionName) {
                sessions = sessions.filter((s) => !s.section?.name || s.section.name === selectedUnit.sectionName);
            }
            // Grade coordinators only see their assigned grades
            if (isCoordinator && assignedGrades.length > 0) {
                sessions = sessions.filter((s) => gradeMatches(s.class?.gradeLevel, s.class?.name));
            }

            if (sessions.length === 0) {
                toast.error(
                    mode === 'daily'
                        ? `No attendance was marked for ${classLabel} on ${period.label}.`
                        : `No attendance records found for ${classLabel} in this ${mode === 'weekly' ? 'week' : 'month'}.`
                );
                return;
            }

            // Active student rosters (so students without a record still show in the register)
            setStep('Loading student lists...');
            const unitKeys = new Map();
            sessions.forEach((s) => {
                const classId = s.class?.id || s.classId || '';
                const sectionId = s.section?.id || s.sectionId || '';
                unitKeys.set(`${classId}:${sectionId}`, { classId, sectionId });
            });

            const rosters = new Map();
            const entries = [...unitKeys.entries()];
            for (let i = 0; i < entries.length; i += 4) {
                await Promise.all(
                    entries.slice(i, i + 4).map(async ([key, { classId, sectionId }]) => {
                        try {
                            const query = { classId, status: 'Active', limit: 1000 };
                            if (sectionId) query.sectionId = sectionId;
                            const res = await listStudents(query);
                            let list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
                            // Session marked without a section: only students with no section belong here.
                            // (Otherwise the whole class would be counted again in addition to its sections.)
                            if (!sectionId) list = list.filter((stu) => !stu.sectionId);
                            rosters.set(key, list);
                        } catch (err) {
                            console.warn('[Attendance Export] Roster load failed for', key, err);
                            rosters.set(key, []);
                        }
                    })
                );
            }

            // Pending (unmarked) classes - daily reports only
            let pending = [];
            if (mode === 'daily') {
                try {
                    const statsRes = await getAttendanceDashboardStats({ date: period.startDate, session: 'all' });
                    const stats = statsRes?.data || statsRes || {};
                    (stats.pendingClassList || []).forEach((c) => {
                        if (selectedUnit && c.classId !== selectedUnit.classId) return;
                        if (isCoordinator && assignedGrades.length > 0 && !gradeMatches(c.gradeLevel, c.className)) return;
                        const secs = Array.isArray(c.sections) && c.sections.length > 0 ? c.sections : [c];
                        secs.forEach((sec) => {
                            if (selectedUnit?.sectionId && sec.sectionId !== selectedUnit.sectionId) return;
                            pending.push({ className: c.className, sectionName: sec.sectionName || '', total: sec.total ?? 0 });
                        });
                    });
                } catch (err) {
                    console.warn('[Attendance Export] Pending classes unavailable:', err);
                    pending = [];
                }
            }

            setStep('Building Excel file...');
            const result = buildAttendanceWorkbook({
                period,
                sessions,
                rosters,
                pending,
                classLabel,
                sessionFilter,
                generatedBy
            });

            if (!result) {
                toast.error('Nothing to export for the selected options.');
                return;
            }

            XLSX.writeFile(result.workbook, result.fileName);
            toast.success(`${result.fileName} downloaded (${result.studentCount} students, ${result.unitCount} class sheet${result.unitCount === 1 ? '' : 's'}).`);
            onClose();
        } catch (err) {
            console.error('[Admin Attendance] Failed to export attendance report:', err);
            toast.error('Failed to export attendance report.');
        } finally {
            setBusy(false);
            setStep('');
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-xl w-full shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh] animate-fade-in-up">
                {/* Header */}
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-2xl">
                            <FileSpreadsheet size={22} />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white">Export Attendance Report</h3>
                            <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5 font-medium">
                                Choose the period and class to download as Excel.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={busy}
                        className="p-2 hover:bg-slate-200/60 dark:hover:bg-slate-700 text-slate-400 dark:text-slate-300 hover:text-slate-600 dark:hover:text-white rounded-xl transition-colors disabled:opacity-50"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-5">
                    {/* Period type */}
                    <div className="space-y-2">
                        <label className={labelClass}>Report Type</label>
                        <div className="grid grid-cols-3 gap-2.5">
                            {PERIOD_OPTIONS.map((opt) => (
                                <button
                                    key={opt.id}
                                    type="button"
                                    disabled={busy}
                                    onClick={() => setMode(opt.id)}
                                    className={`text-left p-3 rounded-xl border transition-all ${mode === opt.id
                                            ? 'border-emerald-400 dark:border-emerald-700 bg-emerald-50/60 dark:bg-emerald-950/30 ring-2 ring-emerald-500/30'
                                            : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                                        }`}
                                >
                                    <div className="text-sm font-bold text-slate-900 dark:text-white">{opt.label}</div>
                                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">{opt.hint}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Date / week / month picker */}
                    <div className="space-y-2">
                        <label className={labelClass}>
                            {mode === 'daily' ? 'Select Date' : mode === 'weekly' ? 'Select Any Date In The Week' : 'Select Month'}
                        </label>
                        {mode === 'monthly' ? (
                            <input
                                type="month"
                                value={anchorMonth}
                                disabled={busy}
                                onChange={(e) => setAnchorMonth(e.target.value)}
                                className={inputClass}
                            />
                        ) : (
                            <input
                                type="date"
                                value={anchorDate}
                                disabled={busy}
                                onChange={(e) => setAnchorDate(e.target.value)}
                                className={inputClass}
                            />
                        )}
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-2">
                                {quickPicks.map((q) => (
                                    <button key={q.label} type="button" disabled={busy} onClick={q.apply} className={chipClass}>
                                        {q.label}
                                    </button>
                                ))}
                            </div>
                            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">{canDownload ? period.label : ''}</span>
                        </div>
                    </div>

                    {/* Class + session */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className={labelClass}>Class &amp; Section</label>
                            <select
                                value={classKey}
                                disabled={busy}
                                onChange={(e) => setClassKey(e.target.value)}
                                className={inputClass}
                            >
                                <option value="all">All Classes</option>
                                {classOptions.map((o) => (
                                    <option key={o.key} value={o.key}>
                                        {o.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className={labelClass}>Session</label>
                            <select
                                value={sessionFilter}
                                disabled={busy}
                                onChange={(e) => setSessionFilter(e.target.value)}
                                className={inputClass}
                            >
                                {SESSION_OPTIONS.map((o) => (
                                    <option key={o.id} value={o.id}>
                                        {o.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* What you will get */}
                    <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 p-4">
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">
                            What you will get
                        </p>
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                            {PREVIEW_TEXT[mode]} A <span className="font-bold">Summary</span> sheet with class-wise totals is always included.
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center gap-3 shrink-0">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 truncate">{busy ? step : ''}</span>
                    <div className="flex items-center gap-3 shrink-0">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={busy}
                            className="px-5 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700 rounded-xl transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleDownload}
                            disabled={busy || !canDownload}
                            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold disabled:opacity-60 disabled:cursor-not-allowed shadow-md shadow-emerald-600/20 transition-all flex items-center gap-2 active:scale-[0.98]"
                        >
                            {busy ? (
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            ) : (
                                <Download size={18} />
                            )}
                            {busy ? 'Preparing...' : 'Download Excel'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}