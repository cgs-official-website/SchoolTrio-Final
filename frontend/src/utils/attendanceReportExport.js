/**
 * src/utils/attendanceReportExport.js
 *
 * Builds professional Daily / Weekly / Monthly attendance register workbooks.
 *
 * Output structure:
 *  - "Class Totals" sheet       : class-wise totals (+ pending classes for daily reports)
 *  - One sheet per class-section: student-wise register
 *      Daily   -> S.No | Roll No | Admission No | Student Name | <session status columns> | Remark
 *      Weekly  -> S.No | Roll No | Admission No | Student Name | <one column per day> | Present | Absent | Late | Marked | Attendance % | Remark
 *      Monthly -> same as weekly, one column per working day of the month
 *
 * Legend used in weekly / monthly registers:  P = Present, A = Absent, L = Late, - = Not marked
 * If a day has two different sessions (FN / AN) the cell shows both, e.g. "P/A".
 */

import * as XLSX from 'xlsx';

export const LOW_ATTENDANCE_THRESHOLD = 75;

const SESSION_ORDER = { STANDARD: 0, FN: 1, AN: 2 };
const SESSION_LABEL = { STANDARD: 'Full Day', FN: 'Forenoon (FN)', AN: 'Afternoon (AN)' };
const STATUS_LETTER = { Present: 'P', Absent: 'A', Late: 'L' };

/* ------------------------------------------------------------------ */
/* Date helpers (all pure string / UTC based, no timezone surprises)   */
/* ------------------------------------------------------------------ */

const pad = (n) => String(n).padStart(2, '0');
const parseKey = (key) => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
};
const formatKey = (dt) => `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;

export const toDateKey = (value) => String(value || '').slice(0, 10);

export const addDays = (key, days) => {
    const dt = parseKey(key);
    dt.setUTCDate(dt.getUTCDate() + days);
    return formatKey(dt);
};

/** Today's date (device local time) as YYYY-MM-DD */
export const getLocalToday = () => {
    const now = new Date();
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const longDate = (key) =>
    parseKey(key).toLocaleDateString('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' });

const dayHeader = (key) => {
    const dt = parseKey(key);
    const weekday = dt.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short' });
    return `${pad(dt.getUTCDate())} ${weekday}`;
};

/**
 * Resolves the start / end / label of a report period.
 *
 * @param {'daily'|'weekly'|'monthly'} mode
 * @param {string} anchor - 'YYYY-MM-DD' for daily/weekly, 'YYYY-MM' for monthly
 */
export function getPeriodRange(mode, anchor) {
    if (mode === 'monthly') {
        const monthKey = String(anchor || '').slice(0, 7);
        const [y, m] = monthKey.split('-').map(Number);
        const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
        const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', {
            timeZone: 'UTC',
            month: 'long',
            year: 'numeric'
        });
        return {
            mode,
            startDate: `${monthKey}-01`,
            endDate: `${monthKey}-${pad(lastDay)}`,
            label,
            fileKey: monthKey
        };
    }

    const dateKey = toDateKey(anchor);
    if (mode === 'weekly') {
        const offsetFromMonday = (parseKey(dateKey).getUTCDay() + 6) % 7;
        const startDate = addDays(dateKey, -offsetFromMonday);
        const endDate = addDays(startDate, 6);
        return {
            mode,
            startDate,
            endDate,
            label: `${longDate(startDate)} to ${longDate(endDate)}`,
            fileKey: `${startDate}_to_${endDate}`
        };
    }

    return { mode: 'daily', startDate: dateKey, endDate: dateKey, label: longDate(dateKey), fileKey: dateKey };
}

/* ------------------------------------------------------------------ */
/* Generic helpers                                                     */
/* ------------------------------------------------------------------ */

const percentage = (present, late, marked) =>
    marked > 0 ? Number((((present + late) / marked) * 100).toFixed(1)) : '';

const studentFullName = (s) => `${s?.firstName || ''} ${s?.lastName || ''}`.trim() || 'Unknown Student';

const compareStudents = (a, b) => {
    const ra = String(a.rollNumber ?? '').trim();
    const rb = String(b.rollNumber ?? '').trim();
    if (ra && rb) {
        const c = ra.localeCompare(rb, undefined, { numeric: true });
        if (c !== 0) return c;
    } else if (ra) {
        return -1;
    } else if (rb) {
        return 1;
    }
    return a.name.localeCompare(b.name);
};

const uniqueSheetName = (base, used) => {
    const clean = String(base || 'Sheet').replace(/[\\/?*[\]:]/g, '-').trim().slice(0, 31) || 'Sheet';
    let candidate = clean;
    let i = 2;
    while (used.has(candidate.toLowerCase())) {
        const suffix = ` (${i++})`;
        candidate = `${clean.slice(0, 31 - suffix.length)}${suffix}`;
    }
    used.add(candidate.toLowerCase());
    return candidate;
};

const safeFilePart = (text) =>
    String(text || '')
        .replace(/[^A-Za-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

const dayCellText = (entries) => {
    if (!entries || entries.length === 0) return '-';
    const letters = [...entries]
        .sort((a, b) => (SESSION_ORDER[a.session] ?? 9) - (SESSION_ORDER[b.session] ?? 9))
        .map((e) => STATUS_LETTER[e.status] || '?');
    return letters.every((l) => l === letters[0]) ? letters[0] : letters.join('/');
};

/* ------------------------------------------------------------------ */
/* Unit (class-section) assembly                                       */
/* ------------------------------------------------------------------ */

function buildUnits(sessions, rosters) {
    const unitMap = new Map();

    sessions.forEach((sess) => {
        const classId = sess.class?.id || sess.classId || '';
        const sectionId = sess.section?.id || sess.sectionId || '';
        const key = `${classId}:${sectionId}`;
        if (!unitMap.has(key)) {
            const className = (sess.class?.name || 'Class').toString().trim();
            const sectionName = (sess.section?.name || '').toString().trim();
            unitMap.set(key, {
                key,
                className,
                sectionName,
                label: sectionName ? `${className} - Section ${sectionName}` : className,
                sheetBase: sectionName ? `${className} - ${sectionName}` : className,
                sessions: [],
                studentMap: new Map()
            });
        }
        unitMap.get(key).sessions.push(sess);
    });

    unitMap.forEach((unit) => {
        const ensureStudent = (stu) => {
            if (!stu) return null;
            const id = stu.id || stu.studentId;
            if (!unit.studentMap.has(id)) {
                unit.studentMap.set(id, {
                    id,
                    name: studentFullName(stu),
                    rollNumber: stu.rollNumber ?? '',
                    admissionNumber: stu.admissionNumber ?? '',
                    days: new Map(),
                    counts: { Present: 0, Absent: 0, Late: 0 },
                    remarks: new Set()
                });
            }
            return unit.studentMap.get(id);
        };

        // Active roster first, so students without any record still appear in the register
        (rosters?.get(unit.key) || []).forEach(ensureStudent);

        unit.sessions.forEach((sess) => {
            const dateKey = toDateKey(sess.date);
            (sess.records || []).forEach((rec) => {
                const entry = ensureStudent(rec.student || { id: rec.studentId });
                if (!entry) return;
                if (!entry.days.has(dateKey)) entry.days.set(dateKey, []);
                entry.days.get(dateKey).push({ session: sess.session, status: rec.status, remark: rec.remark || '' });
                if (entry.counts[rec.status] !== undefined) entry.counts[rec.status] += 1;
                if (rec.remark) entry.remarks.add(String(rec.remark).trim());
            });
        });

        unit.students = [...unit.studentMap.values()].sort(compareStudents);
        unit.dates = [...new Set(unit.sessions.map((s) => toDateKey(s.date)))].sort();
        unit.sessionTypes = [...new Set(unit.sessions.map((s) => s.session))].sort(
            (a, b) => (SESSION_ORDER[a] ?? 9) - (SESSION_ORDER[b] ?? 9)
        );

        unit.totals = { Present: 0, Absent: 0, Late: 0 };
        unit.students.forEach((s) => {
            unit.totals.Present += s.counts.Present;
            unit.totals.Absent += s.counts.Absent;
            unit.totals.Late += s.counts.Late;
        });
        unit.totals.marked = unit.totals.Present + unit.totals.Absent + unit.totals.Late;
    });

    return [...unitMap.values()].sort((a, b) =>
        a.className.localeCompare(b.className, undefined, { numeric: true, sensitivity: 'base' }) ||
        a.sectionName.localeCompare(b.sectionName, undefined, { numeric: true, sensitivity: 'base' })
    );
}

/* ------------------------------------------------------------------ */
/* Sheet builders                                                      */
/* ------------------------------------------------------------------ */

const REPORT_TITLE = {
    daily: 'DAILY ATTENDANCE REPORT',
    weekly: 'WEEKLY ATTENDANCE REPORT',
    monthly: 'MONTHLY ATTENDANCE REGISTER'
};

function finishSheet(rows, { widths, merges }) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = widths.map((wch) => ({ wch }));
    ws['!merges'] = merges;
    return ws;
}

function titleRows(ctx, subtitle, lastCol) {
    const rows = [
        [REPORT_TITLE[ctx.period.mode]],
        [subtitle],
        [`Generated on ${ctx.generatedOn}${ctx.generatedBy ? ` by ${ctx.generatedBy}` : ''}`],
        []
    ];
    const merges = [0, 1, 2].map((r) => ({ s: { r, c: 0 }, e: { r, c: Math.max(lastCol, 1) } }));
    return { rows, merges };
}

function buildDailySheet(unit, ctx) {
    const types = unit.sessionTypes.length > 0 ? unit.sessionTypes : ['STANDARD'];
    const header = ['S.No', 'Roll No', 'Admission No', 'Student Name', ...types.map((t) => SESSION_LABEL[t] || t), 'Remark'];
    const lastCol = header.length - 1;
    const { rows, merges } = titleRows(
        ctx,
        `Class: ${unit.label}   |   Date: ${ctx.period.label}   |   Session: ${ctx.sessionText}`,
        lastCol
    );
    const headerRowIndex = rows.length;
    rows.push(header);

    const perSession = types.map(() => ({ Present: 0, Absent: 0, Late: 0 }));

    unit.students.forEach((stu, idx) => {
        const entries = stu.days.get(ctx.period.startDate) || [];
        const cells = types.map((type, i) => {
            const found = entries.find((e) => e.session === type);
            if (!found) return 'Not Marked';
            if (perSession[i][found.status] !== undefined) perSession[i][found.status] += 1;
            return found.status;
        });
        const remark = entries.map((e) => e.remark).filter(Boolean);
        rows.push([idx + 1, stu.rollNumber || '-', stu.admissionNumber || '-', stu.name, ...cells, [...new Set(remark)].join('; ')]);
    });

    rows.push([]);
    const blank = (label, values) => ['', '', '', label, ...values, ''];
    rows.push(blank('Total Students', types.map(() => unit.students.length)));
    rows.push(blank('Present', perSession.map((s) => s.Present)));
    rows.push(blank('Absent', perSession.map((s) => s.Absent)));
    rows.push(blank('Late', perSession.map((s) => s.Late)));
    rows.push(
        blank(
            'Attendance %',
            perSession.map((s) => percentage(s.Present, s.Late, s.Present + s.Absent + s.Late))
        )
    );

    return finishSheet(rows, {
        widths: [6, 10, 16, 30, ...types.map(() => 16), 28],
        merges
    });
}

function buildRegisterSheet(unit, ctx) {
    const dates = unit.dates;
    const dateStart = 4;
    const totalsStart = dateStart + dates.length;
    const header = [
        'S.No',
        'Roll No',
        'Admission No',
        'Student Name',
        ...dates.map(dayHeader),
        'Attendance %',
        'Present',
        'Absent',
        'Late',
        'Marked',
        'Remark'
    ];
    const lastCol = header.length - 1;
    const { rows, merges } = titleRows(
        ctx,
        `Class: ${unit.label}   |   Period: ${ctx.period.label}   |   Session: ${ctx.sessionText}`,
        Math.min(lastCol, 10)
    );
    const headerRowIndex = rows.length;
    rows.push(header);

    const perDate = dates.map(() => ({ Present: 0, Absent: 0, Late: 0 }));

    unit.students.forEach((stu, idx) => {
        const marked = stu.counts.Present + stu.counts.Absent + stu.counts.Late;
        const pct = percentage(stu.counts.Present, stu.counts.Late, marked);
        const cells = dates.map((d, i) => {
            const entries = stu.days.get(d);
            (entries || []).forEach((e) => {
                if (perDate[i][e.status] !== undefined) perDate[i][e.status] += 1;
            });
            return dayCellText(entries);
        });
        rows.push([
            idx + 1,
            stu.rollNumber || '-',
            stu.admissionNumber || '-',
            stu.name,
            ...cells,
            pct,
            stu.counts.Present,
            stu.counts.Absent,
            stu.counts.Late,
            marked,
            pct !== '' && pct < LOW_ATTENDANCE_THRESHOLD ? `Below ${LOW_ATTENDANCE_THRESHOLD}%` : ''
        ]);
    });

    rows.push([
        '',
        '',
        '',
        `TOTAL (${unit.students.length} Students)`,
        ...dates.map(() => ''),
        percentage(unit.totals.Present, unit.totals.Late, unit.totals.marked),
        unit.totals.Present,
        unit.totals.Absent,
        unit.totals.Late,
        unit.totals.marked,
        ''
    ]);

    const tail = ['', '', ''];
    const trailing = ['', '', '', '', '', ''];
    rows.push([]);
    rows.push([...tail, 'Daily Present', ...perDate.map((d) => d.Present), ...trailing]);
    rows.push([...tail, 'Daily Absent', ...perDate.map((d) => d.Absent), ...trailing]);
    rows.push([...tail, 'Daily Late', ...perDate.map((d) => d.Late), ...trailing]);
    rows.push([]);
    rows.push(['Legend:  P = Present   |   A = Absent   |   L = Late   |   - = Not marked   |   P/A = different status in FN / AN sessions']);
    rows.push([`Attendance % = (Present + Late) / Marked sessions.  "Below ${LOW_ATTENDANCE_THRESHOLD}%" flags low attendance.`]);
    merges.push(
        { s: { r: rows.length - 2, c: 0 }, e: { r: rows.length - 2, c: Math.min(lastCol, 10) } },
        { s: { r: rows.length - 1, c: 0 }, e: { r: rows.length - 1, c: Math.min(lastCol, 10) } }
    );

    return finishSheet(rows, {
        widths: [6, 10, 16, 30, ...dates.map(() => 8), 14, 9, 9, 8, 9, 18],
        merges
    });
}

/** First sheet: class-wise totals (and pending classes for daily reports). */
function buildClassTotalsSheet(units, ctx, pending) {
    const header = ['Class', 'Section', 'Students', 'Sessions Marked', 'Present', 'Absent', 'Late', 'Attendance %'];
    const { rows, merges } = titleRows(
        ctx,
        `Scope: ${ctx.classLabel}   |   Period: ${ctx.period.label}   |   Session: ${ctx.sessionText}`,
        header.length - 1
    );
    rows.push(header);

    const grand = { students: 0, sessions: 0, Present: 0, Absent: 0, Late: 0 };
    const uniqueStudentIds = new Set();
    units.forEach((u) => {
        u.students.forEach((stu) => uniqueStudentIds.add(stu.id));
        grand.sessions += u.sessions.length;
        grand.Present += u.totals.Present;
        grand.Absent += u.totals.Absent;
        grand.Late += u.totals.Late;
        rows.push([
            u.className,
            u.sectionName || '-',
            u.students.length,
            u.sessions.length,
            u.totals.Present,
            u.totals.Absent,
            u.totals.Late,
            percentage(u.totals.Present, u.totals.Late, u.totals.marked)
        ]);
    });
    grand.students = uniqueStudentIds.size;
    rows.push([
        'TOTAL',
        '',
        grand.students,
        grand.sessions,
        grand.Present,
        grand.Absent,
        grand.Late,
        percentage(grand.Present, grand.Late, grand.Present + grand.Absent + grand.Late)
    ]);

    if (pending && pending.length > 0) {
        rows.push([]);
        rows.push(['ATTENDANCE PENDING (not yet marked)']);
        merges.push({ s: { r: rows.length - 1, c: 0 }, e: { r: rows.length - 1, c: 3 } });
        rows.push(['Class', 'Section', 'Students']);
        pending.forEach((p) => rows.push([p.className, p.sectionName || '-', p.total ?? 0]));
    }

    return finishSheet(rows, { widths: [20, 12, 11, 17, 10, 10, 8, 14], merges });
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Builds the workbook.
 *
 * @param {Object} opts
 * @param {{mode:string,startDate:string,endDate:string,label:string,fileKey:string}} opts.period - from getPeriodRange
 * @param {Array<Object>} opts.sessions - attendance sessions fetched with includeRecords=true
 * @param {Map<string, Array<Object>>} [opts.rosters] - active students keyed by `${classId}:${sectionId||''}`
 * @param {Array<{className:string,sectionName?:string,total?:number}>} [opts.pending] - unmarked classes (daily)
 * @param {string} [opts.classLabel] - text shown in the Summary header, e.g. "All Classes" or "V - Section A"
 * @param {'all'|'FN'|'AN'} [opts.sessionFilter]
 * @param {string} [opts.generatedBy]
 * @returns {{ workbook: Object, fileName: string, unitCount: number, studentCount: number } | null}
 */
export function buildAttendanceWorkbook({
    period,
    sessions,
    rosters,
    pending = [],
    classLabel = 'All Classes',
    sessionFilter = 'all',
    generatedBy = ''
}) {
    if (!sessions || sessions.length === 0) return null;

    const ctx = {
        period,
        classLabel,
        generatedBy,
        generatedOn: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
        sessionText: sessionFilter === 'all' ? 'All Sessions' : SESSION_LABEL[sessionFilter] || sessionFilter
    };

    const units = buildUnits(sessions, rosters);
    const workbook = XLSX.utils.book_new();
    const used = new Set();

    XLSX.utils.book_append_sheet(
        workbook,
        buildClassTotalsSheet(units, ctx, period.mode === 'daily' ? pending : []),
        uniqueSheetName('Class Totals', used)
    );

    units.forEach((unit) => {
        const ws = period.mode === 'daily' ? buildDailySheet(unit, ctx) : buildRegisterSheet(unit, ctx);
        XLSX.utils.book_append_sheet(workbook, ws, uniqueSheetName(unit.sheetBase, used));
    });

    const modeName = period.mode.charAt(0).toUpperCase() + period.mode.slice(1);
    const fileName = `Attendance_${modeName}_${safeFilePart(classLabel) || 'All-Classes'}_${period.fileKey}.xlsx`;

    return {
        workbook,
        fileName,
        unitCount: units.length,
        studentCount: units.reduce((n, u) => n + u.students.length, 0)
    };
}