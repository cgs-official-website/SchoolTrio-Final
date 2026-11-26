/**
 * Overall student fee ledger ("Student Ledger As On <date>").
 *
 * One model (buildLedgerStatement) feeds three outputs: print, PDF and Excel,
 * so all three always show the same numbers. Everything is calculated from the
 * student's real invoices; nothing is typed in or estimated.
 *
 * Layout (same as the school's existing ledger):
 *   school name + address, title, student details,
 *   "Over All Total Due Amount"      -> one row per fee, gross amount
 *   "Over All Total Received Amount" -> one row per payment (receipt)
 *   Total Due / Total Received / Concession / Balance / Date-Time
 */

// ---------------------------------------------------------------- helpers

const obj = (v) => (v && typeof v === 'object' ? v : {});

const concessionOf = (inv) => {
    const v = Number(inv?.concessionAmount);
    return Number.isFinite(v) && v > 0 ? v : 0;
};

/** What the parent really pays for a fee: fee minus its concession. */
const netOf = (inv) => {
    const v = Number(inv?.netAmount);
    return Number.isFinite(v) ? v : Number(inv?.amount || 0) - concessionOf(inv);
};

const lateFeeOf = (inv) => {
    const v = Number(obj(inv?.customData).lateFee);
    return Number.isFinite(v) && v > 0 ? v : 0;
};

const fullName = (s) => [s?.firstName, s?.lastName].filter(Boolean).join(' ').trim();

const fatherName = (s) => {
    const cd = obj(s?.customData);
    return s?.fatherName || cd.fatherName || s?.parentName || cd.parentName || '';
};

const motherName = (s) => s?.motherName || obj(s?.customData).motherName || '';

const mobileNo = (s) => {
    const cd = obj(s?.customData);
    return s?.parentPhone || cd.parentPhone || cd.fatherPhone || cd.guardianPhone || s?.guardianPhone || cd.motherPhone || s?.motherPhone || '';
};

const classSection = (s) => [s?.class?.name, s?.section?.name].filter(Boolean).join(' - ');

const escapeHtml = (v) =>
    String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const formatAmount = (n) =>
    Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

const pad = (n) => String(n).padStart(2, '0');

/** 25 Nov 2026 */
const longDate = (d) =>
    d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

/** 25 Nov 2026 1:16 PM */
const longDateTime = (d) =>
    `${longDate(d)} ${d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase()}`;

/** dd-mm-yyyy (the payment date column) */
const shortDate = (value) => {
    if (!value) return '—';
    const text = String(value);
    const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (plain) return `${plain[3]}-${plain[2]}-${plain[1]}`;
    const d = new Date(text);
    if (Number.isNaN(d.getTime())) return '—';
    return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
};

const safeFile = (v) => String(v || 'student').replace(/[^a-z0-9-_]+/gi, '_');

// ---------------------------------------------------------------- model

/**
 * @param {{ schoolName?: string, schoolAddress?: string, student: object, invoices: object[], now?: Date }} input
 */
export function buildLedgerStatement({ schoolName, schoolAddress, student, invoices, now = new Date() }) {
    const active = (invoices || []).filter((i) => i.status !== 'Cancelled');

    // ---- Over All Total Due Amount: one row per fee name, oldest due date first
    const byFee = new Map();
    active.forEach((i) => {
        const key = i.feeName || 'Fee';
        const row = byFee.get(key) || { particulars: key, amount: 0, firstDue: String(i.dueDate || ''), paidCount: 0, count: 0 };
        row.amount += Number(i.amount || 0);
        row.count += 1;
        if (i.status === 'Paid') row.paidCount += 1;
        const due = String(i.dueDate || '');
        if (due && (!row.firstDue || due < row.firstDue)) row.firstDue = due;
        byFee.set(key, row);
    });
    const dueRows = Array.from(byFee.values())
        .sort((a, b) => a.firstDue.localeCompare(b.firstDue) || a.particulars.localeCompare(b.particulars))
        .map(({ particulars, amount, paidCount, count }) => ({
            particulars,
            amount,
            // Paid = every fee under this name is settled, Unpaid = none is, Partial = some of them (e.g. monthly fees)
            status: paidCount === count ? 'Paid' : paidCount === 0 ? 'Unpaid' : 'Partial'
        }));

    // Late fee (penalty) is collected with a payment, so it counts as due and received.
    const paid = active.filter((i) => i.status === 'Paid');
    const lateFeeTotal = paid.reduce((s, i) => s + lateFeeOf(i), 0);
    if (lateFeeTotal > 0) dueRows.push({ particulars: 'Late Fee', amount: lateFeeTotal, status: 'Paid' });

    // ---- Over All Total Received Amount: one row per receipt (a receipt can settle several fees)
    const groups = new Map();
    paid.forEach((i) => {
        const key = i.receiptNumber || `single-${i.id}`;
        if (!groups.has(key)) {
            groups.set(key, { paymentType: i.paymentMode || '', chequeNo: i.transactionReference || '', paidAt: i.paidAt, amount: 0 });
        }
        const g = groups.get(key);
        g.amount += netOf(i) + lateFeeOf(i);
        if (i.paidAt && (!g.paidAt || String(i.paidAt) < String(g.paidAt))) g.paidAt = i.paidAt;
    });
    const receivedRows = Array.from(groups.values())
        .sort((a, b) => String(a.paidAt || '').localeCompare(String(b.paidAt || '')))
        .map((g) => ({ paymentType: g.paymentType || '—', chequeNo: g.chequeNo, date: shortDate(g.paidAt), amount: g.amount }));

    // ---- Totals
    const totalDue = dueRows.reduce((s, r) => s + r.amount, 0);
    const totalReceived = receivedRows.reduce((s, r) => s + r.amount, 0);
    const concession = active.reduce((s, i) => s + concessionOf(i), 0);
    const balance = totalDue - totalReceived - concession;

    return {
        schoolName: schoolName || '',
        schoolAddress: schoolAddress || '',
        title: `Student Ledger As On (${longDate(now)})`,
        details: {
            name: fullName(student),
            classSection: classSection(student),
            fatherName: fatherName(student),
            admissionNo: student?.admissionNumber || '',
            mobileNo: mobileNo(student),
            motherName: motherName(student)
        },
        dueRows,
        receivedRows,
        totals: { totalDue, totalReceived, concession, balance },
        generatedAt: longDateTime(now),
        fileBase: `Student_Ledger_${safeFile(fullName(student))}_${safeFile(student?.admissionNumber)}`
    };
}

// ---------------------------------------------------------------- print

export function buildLedgerHtml(m) {
    const d = m.details;
    const dueRows = m.dueRows.length
        ? m.dueRows.map((r, i) => `<tr><td class="c">${i + 1}</td><td>${escapeHtml(r.particulars)}</td><td class="r">${formatAmount(r.amount)}</td><td>${escapeHtml(r.status)}</td></tr>`).join('')
        : '<tr><td colspan="4" class="c">No fees assigned</td></tr>';
    const recRows = m.receivedRows.length
        ? m.receivedRows.map((r, i) => `<tr><td class="c">${i + 1}</td><td>${escapeHtml(r.paymentType)}</td><td>${escapeHtml(r.chequeNo)}</td><td>${escapeHtml(r.date)}</td><td class="r">${formatAmount(r.amount)}</td></tr>`).join('')
        : '<tr><td colspan="5" class="c">No payments received</td></tr>';
    const t = m.totals;
    const info = (label, value) => `<tr><td class="lb">${label}</td><td class="sep">:</td><td>${escapeHtml(value || '')}</td></tr>`;
    const total = (label, value) => `<tr><td class="tl">${label}</td><td class="sep">:</td><td>${escapeHtml(value)}</td></tr>`;

    return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(m.title)}</title>
<style>
@page{size:A4;margin:14mm}
body{font-family:"Times New Roman",Times,serif;color:#000;margin:0;padding:24px 30px;font-size:13px}
.school{text-align:center;font-weight:bold;font-size:15px;margin:0}
.addr{text-align:center;font-weight:bold;margin:14px 0 0;font-size:13px}
.title{text-align:center;font-weight:bold;font-size:14px;margin:30px 0 20px}
.info{display:flex;justify-content:space-between;gap:24px;margin-bottom:18px}
.info table{border-collapse:collapse}.info td{padding:5px 0;vertical-align:top}
.lb{font-weight:bold;white-space:nowrap;padding-right:6px}.sep{padding:0 10px;width:10px}
h3{font-size:13px;margin:16px 0 4px}
table.grid{width:100%;border-collapse:collapse}
table.grid th,table.grid td{border:1px solid #333;padding:3px 6px;text-align:left}
table.grid th{font-weight:bold}
.c{text-align:center}.r{text-align:right}
.totals{border-collapse:collapse;margin:16px 0 0 4px}
.totals td{padding:5px 0}.tl{font-weight:bold;min-width:150px}
@media print{body{padding:0}}
</style></head><body>
<p class="school">${escapeHtml(m.schoolName)}</p>
${m.schoolAddress ? `<p class="addr">${escapeHtml(m.schoolAddress)}</p>` : ''}
<p class="title">${escapeHtml(m.title)}</p>
<div class="info">
<table>${info('Name of the Student', d.name)}${info('Class &amp; Section', d.classSection)}${info("Father's Name", d.fatherName)}</table>
<table>${info('Admission No', d.admissionNo)}${info('Mobile No.', d.mobileNo)}${info("Mother's Name", d.motherName)}</table>
</div>
<h3>Over All Total Due Amount</h3>
<table class="grid"><thead><tr><th style="width:48px">S.No</th><th>Particulars</th><th class="r" style="width:22%">Amount</th><th style="width:16%">Status</th></tr></thead><tbody>${dueRows}</tbody></table>
<h3 style="margin-top:20px">Over All Total Received Amount</h3>
<table class="grid"><thead><tr><th style="width:48px">S.No</th><th>Payment Type</th><th>Cheque / Ref No</th><th style="width:22%">Date</th><th class="r" style="width:20%">Amount</th></tr></thead><tbody>${recRows}</tbody></table>
<table class="totals">
${total('Total Due Amount', formatAmount(t.totalDue))}${total('Total Received Amount', formatAmount(t.totalReceived))}${total('Concession Amount', formatAmount(t.concession))}${total('Balance Amount', formatAmount(t.balance))}${total('Date/Time', m.generatedAt)}
</table>
<script>window.onload=function(){window.focus();window.print();}</script>
</body></html>`;
}

/** Opens the print dialog for the ledger. Returns false when the browser blocked the pop-up. */
export function printLedger(model) {
    const win = window.open('', '_blank', 'width=900,height=900');
    if (!win) return false;
    win.document.open();
    win.document.write(buildLedgerHtml(model));
    win.document.close();
    return true;
}

// ---------------------------------------------------------------- PDF

export async function exportLedgerPdf(m) {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const L = 14;
    const R = W - 14;
    const font = 'times';
    const grid = {
        theme: 'grid',
        styles: { font, fontSize: 10, cellPadding: 1.8, lineColor: [60, 60, 60], lineWidth: 0.2, textColor: 0 },
        headStyles: { fillColor: [255, 255, 255], textColor: 0, fontStyle: 'bold', lineColor: [60, 60, 60], lineWidth: 0.2 },
        margin: { left: L, right: 14 }
    };

    let y = 18;
    doc.setFont(font, 'bold');
    doc.setFontSize(13);
    doc.text(m.schoolName || '', W / 2, y, { align: 'center' });
    if (m.schoolAddress) {
        doc.setFontSize(10.5);
        y += 8;
        const lines = doc.splitTextToSize(m.schoolAddress, W - 28);
        doc.text(lines, W / 2, y, { align: 'center' });
        y += (lines.length - 1) * 5;
    }
    y += 14;
    doc.setFontSize(11.5);
    doc.text(m.title, W / 2, y, { align: 'center' });

    // student details, two columns
    const d = m.details;
    const left = [['Name of the Student', d.name], ['Class & Section', d.classSection], ["Father's Name", d.fatherName]];
    const right = [['Admission No', d.admissionNo], ['Mobile No.', d.mobileNo], ["Mother's Name", d.motherName]];
    y += 12;
    doc.setFontSize(10);
    const rightX = W / 2 + 14;
    left.forEach(([label, value], i) => {
        const ry = y + i * 7;
        doc.setFont(font, 'bold'); doc.text(label, L, ry);
        doc.setFont(font, 'normal'); doc.text(`:  ${value || ''}`, L + 36, ry);
        const [rl, rv] = right[i];
        doc.setFont(font, 'bold'); doc.text(rl, rightX, ry);
        doc.setFont(font, 'normal'); doc.text(`:  ${rv || ''}`, rightX + 27, ry);
    });
    y += left.length * 7 + 2;

    doc.setFont(font, 'bold');
    doc.setFontSize(10.5);
    doc.text('Over All Total Due Amount', L, y);
    autoTable(doc, {
        ...grid,
        startY: y + 2,
        head: [['S.No', 'Particulars', 'Amount', 'Status']],
        body: m.dueRows.length ? m.dueRows.map((r, i) => [i + 1, r.particulars, formatAmount(r.amount), r.status]) : [['', 'No fees assigned', '', '']],
        columnStyles: { 0: { cellWidth: 14, halign: 'center' }, 2: { halign: 'right', cellWidth: 40 }, 3: { cellWidth: 30 } },
        headStyles: { ...grid.headStyles },
        didParseCell: (data) => { if (data.section === 'head' && data.column.index === 2) data.cell.styles.halign = 'right'; }
    });

    y = doc.lastAutoTable.finalY + 9;
    if (y > H - 50) { doc.addPage(); y = 18; }
    doc.setFont(font, 'bold');
    doc.setFontSize(10.5);
    doc.text('Over All Total Received Amount', L, y);
    autoTable(doc, {
        ...grid,
        startY: y + 2,
        head: [['S.No', 'Payment Type', 'Cheque / Ref No', 'Date', 'Amount']],
        body: m.receivedRows.length
            ? m.receivedRows.map((r, i) => [i + 1, r.paymentType, r.chequeNo || '', r.date, formatAmount(r.amount)])
            : [['', 'No payments received', '', '', '']],
        columnStyles: { 0: { cellWidth: 14, halign: 'center' }, 3: { cellWidth: 34 }, 4: { halign: 'right', cellWidth: 38 } },
        didParseCell: (data) => { if (data.section === 'head' && data.column.index === 4) data.cell.styles.halign = 'right'; }
    });

    y = doc.lastAutoTable.finalY + 10;
    if (y > H - 40) { doc.addPage(); y = 18; }
    const t = m.totals;
    [
        ['Total Due Amount', formatAmount(t.totalDue)],
        ['Total Received Amount', formatAmount(t.totalReceived)],
        ['Concession Amount', formatAmount(t.concession)],
        ['Balance Amount', formatAmount(t.balance)],
        ['Date/Time', m.generatedAt]
    ].forEach(([label, value], i) => {
        const ry = y + i * 7;
        doc.setFont(font, 'bold'); doc.setFontSize(10); doc.text(label, L + 2, ry);
        doc.setFont(font, 'normal'); doc.text(`:  ${value}`, L + 48, ry);
    });

    doc.save(`${m.fileBase}.pdf`);
}

// ---------------------------------------------------------------- Excel

export async function exportLedgerExcel(m) {
    const XLSX = await import('xlsx');
    const d = m.details;
    const t = m.totals;
    const rows = [];
    const merges = [];
    const mergeRow = (text) => { merges.push({ s: { r: rows.length, c: 0 }, e: { r: rows.length, c: 4 } }); rows.push([text]); };

    mergeRow(m.schoolName);
    if (m.schoolAddress) mergeRow(m.schoolAddress);
    mergeRow(m.title);
    rows.push([]);
    rows.push(['Name of the Student', '', d.name, 'Admission No', d.admissionNo]);
    rows.push(['Class & Section', '', d.classSection, 'Mobile No.', d.mobileNo]);
    rows.push(["Father's Name", '', d.fatherName, "Mother's Name", d.motherName]);
    rows.push([]);
    rows.push(['Over All Total Due Amount']);
    rows.push(['S.No', 'Particulars', 'Amount', 'Status']);
    m.dueRows.forEach((r, i) => rows.push([i + 1, r.particulars, r.amount, r.status]));
    rows.push([]);
    rows.push(['Over All Total Received Amount']);
    rows.push(['S.No', 'Payment Type', 'Cheque / Ref No', 'Date', 'Amount']);
    m.receivedRows.forEach((r, i) => rows.push([i + 1, r.paymentType, r.chequeNo || '', r.date, r.amount]));
    rows.push([]);
    rows.push(['Total Due Amount', '', '', '', t.totalDue]);
    rows.push(['Total Received Amount', '', '', '', t.totalReceived]);
    rows.push(['Concession Amount', '', '', '', t.concession]);
    rows.push(['Balance Amount', '', '', '', t.balance]);
    rows.push(['Date/Time', '', '', '', m.generatedAt]);

    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet['!merges'] = merges;
    sheet['!cols'] = [{ wch: 22 }, { wch: 24 }, { wch: 26 }, { wch: 16 }, { wch: 22 }];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Student Ledger');
    XLSX.writeFile(book, `${m.fileBase}.xlsx`);
}
