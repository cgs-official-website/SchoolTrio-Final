import * as XLSX from 'xlsx';

/** dd-mm-yyyy from either a "YYYY-MM-DD" string or an ISO timestamp. */
export function formatExportDate(value) {
  if (!value) return '';
  const text = String(value);
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (plain) return `${plain[3]}-${plain[2]}-${plain[1]}`;

  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
}

const cleanFileName = (name) =>
  String(name || 'Export')
    .trim()
    .replace(/\.xlsx$/i, '')
    .replace(/[\\/:*?"<>|]/g, '_') || 'Export';

/**
 * Builds a one-sheet workbook and downloads it.
 * columns: [{ key, label, value: (row) => string | number }]
 * S.No is always added as the first column.
 */
export function downloadExcel({ fileName, sheetName = 'Sheet1', columns, rows }) {
  const header = ['S.No', ...columns.map((c) => c.label)];
  const body = rows.map((row, index) => [
    index + 1,
    ...columns.map((c) => {
      const v = c.value(row);
      return v === undefined || v === null ? '' : v;
    })
  ]);

  const sheet = XLSX.utils.aoa_to_sheet([header, ...body]);

  // Column widths follow the longest value in the first 500 rows
  sheet['!cols'] = header.map((label, i) => {
    const longest = Math.max(
      String(label).length,
      ...body.slice(0, 500).map((r) => String(r[i] ?? '').length)
    );
    return { wch: Math.min(Math.max(longest + 2, 8), 50) };
  });

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName.slice(0, 31));
  XLSX.writeFile(book, `${cleanFileName(fileName)}.xlsx`);
}