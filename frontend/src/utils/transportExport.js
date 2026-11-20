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
