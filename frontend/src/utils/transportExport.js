import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const safeName = (name) => String(name || 'export').replace(/[^a-z0-9-_ ]/gi, '_').trim() || 'export';

/**
 * @param {string} fileName - without extension
 * @param {string[]} headers
 * @param {Array<Array<string|number>>} rows
 */
export function exportRowsToExcel(fileName, headers, rows, sheetName = 'Sheet1') {
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = headers.map((h, i) => ({
        wch: Math.min(40, Math.max(String(h).length, ...rows.map((r) => String(r[i] ?? '').length)) + 2)
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, String(sheetName).slice(0, 31));
    XLSX.writeFile(wb, `${safeName(fileName)}.xlsx`);
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
        const aoa = [...lines.map((l) => [l]), [], headers, ...rows];
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        const last = headers.length - 1;
        // header block spans the whole table width
        ws['!merges'] = lines.map((_, r) => ({ s: { r, c: 0 }, e: { r, c: last } }));
        ws['!cols'] = headers.map((h, i) => ({
            wch: Math.min(40, Math.max(String(h).length, ...rows.map((r) => String(r[i] ?? '').length)) + 2)
        }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, String(title).slice(0, 31).replace(/[\\/?*[\]:]/g, ' '));
        XLSX.writeFile(wb, `${safeName(fileName)}.xlsx`);
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
