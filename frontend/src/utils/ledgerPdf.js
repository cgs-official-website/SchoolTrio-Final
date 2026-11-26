import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const money = (v) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

const longDate = (key) => {
  const [y, m, d] = String(key).split('-');
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
};

const stamp = (iso) => {
  const d = new Date(iso);
  const time = d
    .toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
    .toUpperCase();
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()} ${time}`;
};

const safeFileName = (text) => String(text || 'Student').replace(/[\\/:*?"<>|\s]+/g, '_');

/** Builds the student ledger PDF from the /fee-reports/ledger response and downloads it. */
export function downloadLedgerPdf(ledger) {
  const { school, student, asOn, generatedAt, dues, received, totals } = ledger;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const left = 14;
  let y = 16;

  const ensureSpace = (needed) => {
    if (y + needed > pageH - 14) {
      doc.addPage();
      y = 16;
    }
  };

  // ----- header -----
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(school.name || '', pageW / 2, y, { align: 'center' });
  y += 6;

  if (school.address) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const lines = doc.splitTextToSize(school.address, pageW - 40);
    doc.text(lines, pageW / 2, y, { align: 'center' });
    y += lines.length * 4.5 + 3;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`Student Ledger As On (${longDate(asOn)})`, pageW / 2, y + 4, { align: 'center' });
  y += 14;

  // ----- student details -----
  const detail = (label, value, x, labelWidth, maxWidth) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(label, x, y);
    doc.text(`: ${value || '-'}`, x + labelWidth, y, { maxWidth });
  };

  detail('Name of the Student', student.name, left, 36, 66);
  detail('Admission No', student.admissionNumber, 122, 28, 46);
  y += 7;
  detail('Class', student.className, left, 36, 66);
  detail('Mobile No.', student.mobile, 122, 28, 46);
  y += 7;
  detail('Section', student.sectionName, left, 36, 66);
  detail('Parent Name', student.parentName, 122, 28, 46);
  y += 10;

  const tableOptions = {
    theme: 'grid',
    margin: { left, right: 14 },
    styles: { fontSize: 9, cellPadding: 2, textColor: 20, lineColor: [120, 120, 120], lineWidth: 0.2 },
    headStyles: { fillColor: [235, 235, 235], textColor: 20, fontStyle: 'bold' },
    footStyles: { fillColor: [245, 245, 245], textColor: 20, fontStyle: 'bold' },
    showFoot: 'lastPage'
  };

  const right = (content) => ({ content, styles: { halign: 'right' } });

  // ----- total due -----
  ensureSpace(30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Over All Total Due Amount', left, y);

  autoTable(doc, {
    ...tableOptions,
    startY: y + 3,
    head: [['S.No', 'Particulars', 'Due Date', right('Amount'), right('Concession'), right('Net Amount')]],
    body:
      dues.length > 0
        ? dues.map((d, i) => [
            i + 1,
            d.particulars,
            d.dueDate,
            right(money(d.amount)),
            right(money(d.concession)),
            right(money(d.netAmount))
          ])
        : [[{ content: 'No fees found', colSpan: 6, styles: { halign: 'center' } }]],
    foot:
      dues.length > 0
        ? [
            [
              { content: 'Total', colSpan: 3, styles: { halign: 'right' } },
              right(money(totals.due)),
              right(money(totals.concession)),
              right(money(totals.netDue))
            ]
          ]
        : undefined,
    columnStyles: {
      0: { cellWidth: 14 },
      2: { cellWidth: 26 },
      3: { cellWidth: 26 },
      4: { cellWidth: 26 },
      5: { cellWidth: 28 }
    }
  });
  y = doc.lastAutoTable.finalY + 9;
  
  // ----- total received -----
  ensureSpace(30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Over All Total Received Amount', left, y);

  autoTable(doc, {
    ...tableOptions,
    startY: y + 3,
    head: [['S.No', 'Receipt No', 'Payment Type', 'Date', right('Amount')]],
    body:
      received.length > 0
        ? received.map((r, i) => [
            i + 1,
            r.receiptNumber || '',
            r.paymentType,
            r.date,
            right(money(r.amount))
          ])
        : [[{ content: 'No payments received', colSpan: 5, styles: { halign: 'center' } }]],
    foot:
      received.length > 0
        ? [[{ content: 'Total', colSpan: 4, styles: { halign: 'right' } }, right(money(totals.received))]]
        : undefined,
    columnStyles: {
      0: { cellWidth: 14 },
      1: { cellWidth: 40 },
      3: { cellWidth: 30 },
      4: { cellWidth: 32 }
    }
  });
  y = doc.lastAutoTable.finalY + 10;

  // ----- summary -----
  ensureSpace(40);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const summary = [
    ['Total Due Amount', money(totals.due)],
    ['Total Received Amount', money(totals.received)],
    ['Concession Amount', money(totals.concession)],
    ['Balance Amount', money(totals.balance)],
    ['Date/Time', stamp(generatedAt)]
  ];
  for (const [label, value] of summary) {
    doc.text(label, left + 2, y);
    doc.text(`: ${value}`, left + 58, y);
    y += 7;
  }

  doc.save(`Ledger_${safeFileName(student.admissionNumber)}.pdf`);
}