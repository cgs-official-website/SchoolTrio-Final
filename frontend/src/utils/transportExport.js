import XLSX from 'xlsx-js-style'; // same API as "xlsx", plus cell styles (bold, centre, fill, border)
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getSchoolSettings } from '../api/settings';

const safeName = (name) => String(name || 'export').replace(/[^a-z0-9-_ ]/gi, '_').trim() || 'export';

// ---------- school header (name / address / academic year), fetched once ----------
let metaPromise = null;
const EMPTY_META = { schoolName: '', address: '', academicYear: '' };

export function loadReportMeta() {
    if (!metaPromise) {
        metaPromise = getSchoolSettings()
            .then((res) => {
                const d = res?.data || res || {};
                return {
                    schoolName: d.name || d.schoolName || '',
                    address: d.address || d.location || '',
                    academicYear: d.academicConfig?.currentYear || ''
                };
            })
            .catch(() => {
                metaPromise = null; // try again next time
                return EMPTY_META;
            });
    }
    return metaPromise;
}

const todayDmy = () => {
    const t = new Date();
    return `${String(t.getDate()).padStart(2, '0')}-${String(t.getMonth() + 1).padStart(2, '0')}-${t.getFullYear()}`;
};

// text columns are left aligned (like the student name in the sample), everything else is centred
const LEFT_HEADER = /name|address|stop|route|vehicle|driver|applies|type|email|class\s*&/i;

const CENTER = { horizontal: 'center', vertical: 'center', wrapText: true };
const THIN = { style: 'thin', color: { rgb: '9CA3AF' } };

/**
 * One Excel layout for every transport list (the "BUS ROUTE LIST - VAN 1" sheet):
 *
 *        SCHOOL NAME                (bold, centred over the whole table)
 *        address
 *
 *        BUS ROUTE LIST - VAN 1     (bold, centred)
 *        Report Generated As on 24-11-2026
 *        Period:
 *        For A.Y : 2026-2027
 *   SL. NO. | STUDENT NAME | ADM NO | ...   (bold, centred, grey)
 *   rows ...
 */
function writeStyledExcel({ fileName, sheetName, title, headers, rows, meta = EMPTY_META }) {
    const lines = [
        { text: meta.schoolName, size: 16, bold: true },
        { text: meta.address, size: 11, bold: false },
        { text: '', size: 11, bold: false },
        { text: title, size: 13, bold: true },
        { text: `Report Generated As on ${todayDmy()}`, size: 11, bold: true },
        { text: 'Period:', size: 11, bold: true },
        { text: meta.academicYear ? `For A.Y : ${meta.academicYear}` : '', size: 11, bold: true }
    ];
    const headerRow = lines.length; // 0-based row index of the table header
    const aoa = [...lines.map((l) => [l.text]), headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const last = Math.max(headers.length - 1, 0);

    // title block: merged over the table width, bold + centred
    ws['!merges'] = lines.map((_, r) => ({ s: { r, c: 0 }, e: { r, c: last } }));
    lines.forEach((l, r) => {
        const addr = XLSX.utils.encode_cell({ r, c: 0 });
        if (!ws[addr]) ws[addr] = { t: 's', v: '' };
        ws[addr].s = { font: { bold: l.bold, sz: l.size }, alignment: { horizontal: 'center', vertical: 'center' } };
    });

    // table header: bold, centred, light grey, border
    headers.forEach((_, c) => {
        const addr = XLSX.utils.encode_cell({ r: headerRow, c });
        ws[addr].s = {
            font: { bold: true },
            alignment: CENTER,
            fill: { patternType: 'solid', fgColor: { rgb: 'EDEDED' } },
            border: { top: THIN, bottom: THIN, left: THIN, right: THIN }
        };
    });

    // data cells
    rows.forEach((row, i) => {
        headers.forEach((h, c) => {
            const addr = XLSX.utils.encode_cell({ r: headerRow + 1 + i, c });
            if (!ws[addr]) ws[addr] = { t: 's', v: '' };
            ws[addr].s = {
                alignment: { horizontal: LEFT_HEADER.test(String(h)) ? 'left' : 'center', vertical: 'center', wrapText: true },
                border: { top: THIN, bottom: THIN, left: THIN, right: THIN }
            };
        });
    });

    ws['!cols'] = headers.map((h, i) => ({
        wch: Math.min(45, Math.max(10, String(h).length + 2, ...rows.map((r) => String(r[i] ?? '').length + 2)))
    }));
    ws['!rows'] = [{ hpt: 24 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, String(sheetName || title).slice(0, 31).replace(/[\\/?*[\]:]/g, ' '));
    XLSX.writeFile(wb, `${safeName(fileName)}.xlsx`);
}

/**
 * Excel download used by every transport tab.
 * @param {string} fileName - without extension
 * @param {string[]} headers
 * @param {Array<Array<string|number>>} rows
 * @param {string} [sheetName]
 * @param {string} [title] - heading printed on the sheet, e.g. "BUS STOP LIST"
 */
export async function exportRowsToExcel(fileName, headers, rows, sheetName = 'Sheet1', title) {
    const meta = await loadReportMeta();
    writeStyledExcel({ fileName, sheetName, title: title || String(sheetName).toUpperCase(), headers, rows, meta });
}

export function exportRowsToPdf(fileName, title, headers, rows) {
    const doc = new jsPDF({ orientation: headers.length > 6 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
    doc.setFontSize(14);
    doc.text(title, 40, 40);
    autoTable(doc, {
        head: [headers],
        body: rows.map((r) => r.map((c) => String(c ?? ''))),
        startY: 56,
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [147, 100, 150] }
    });
    doc.save(`${safeName(fileName)}.pdf`);
}

/**
 * Printable list with the school header on top (school name, address, report title,
 * generated date, academic year) followed by the table - e.g. "BUS ROUTE LIST - VAN 1".
 *
 * @param {'excel'|'pdf'} type
 * @param {{ fileName: string, schoolName?: string, address?: string, title: string,
 *           academicYear?: string, headers: string[], rows: Array<Array<string|number>> }} opts
 */
export function exportReportWithHeader(type, opts) {
    const { fileName, schoolName = '', address = '', title, academicYear = '', headers, rows } = opts;
    const t = new Date();
    const generatedOn = `${String(t.getDate()).padStart(2, '0')}-${String(t.getMonth() + 1).padStart(2, '0')}-${t.getFullYear()}`;
    const lines = [
        schoolName,
        address,
        '',
        title,
        `Report Generated As on ${generatedOn}`,
        academicYear ? `For A.Y : ${academicYear}` : ''
    ];

    if (type === 'excel') {
        writeStyledExcel({ fileName, sheetName: title, title, headers, rows, meta: { schoolName, address, academicYear } });
        return;
    }

    const doc = new jsPDF({ orientation: headers.length > 6 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
    const w = doc.internal.pageSize.getWidth();
    let y = 40;
    [[schoolName, 15, 'bold'], [address, 9, 'normal'], [title, 13, 'bold'], [lines[4], 10, 'normal'], [lines[5], 10, 'normal']].forEach(([text, size, style]) => {
        if (!text) return;
        doc.setFont('helvetica', style);
        doc.setFontSize(size);
        doc.text(String(text), w / 2, y, { align: 'center', maxWidth: w - 80 });
        y += size + 8;
    });
    autoTable(doc, {
        head: [headers],
        body: rows.map((r) => r.map((c) => String(c ?? ''))),
        startY: y + 6,
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [147, 100, 150] }
    });
    doc.save(`${safeName(fileName)}.pdf`);
}

// yyyy-mm-dd -> dd-mm-yyyy for display
export function formatDisplayDate(value) {
    if (!value) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
    return m ? `${m[3]}-${m[2]}-${m[1]}` : String(value);
}

export function formatAmount(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '';
}
