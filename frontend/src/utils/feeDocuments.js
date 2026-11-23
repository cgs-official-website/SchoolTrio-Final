import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const fmtDate = (v) => {
    if (!v) return '-';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-GB');
};
const rupees = (n) => `Rs. ${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** Academic year of an invoice: saved on the invoice, else worked out from its due date (April - March). */
const academicYearOf = (invoice) => {
    const saved = invoice?.customData?.academicYear;
    if (saved) return saved;
    const d = new Date(`${String(invoice?.dueDate || '').slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return '-';
    const start = d.getUTCMonth() < 3 ? d.getUTCFullYear() - 1 : d.getUTCFullYear();
    return `${start}-${start + 1}`;
};
const feeTitle = (invoice) => invoice.feeName || invoice.name || 'School Fee';
const safe = (v) => String(v || 'document').replace(/[^a-z0-9-_]+/gi, '_');

function header(doc, schoolName, title) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(schoolName || 'School', 105, 18, { align: 'center' });
    doc.setFontSize(12);
    doc.text(title, 105, 27, { align: 'center' });
    doc.setDrawColor(200);
    doc.line(14, 31, 196, 31);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
}

function studentBlock(doc, student, y) {
    const lines = [
        `Student: ${student?.name || '-'}`,
        `Admission No: ${student?.admissionNumber || '-'}`,
        `Class: ${[student?.className, student?.sectionName].filter(Boolean).join(' - ') || '-'}`
    ];
    lines.forEach((t, i) => doc.text(t, 14, y + i * 6));
    return y + lines.length * 6;
}

/** Invoice (works for any non-cancelled invoice) */
export function downloadInvoicePdf({ schoolName, student, invoice }) {
    const doc = new jsPDF();
    header(doc, schoolName, 'FEE INVOICE');
    const paid = String(invoice.status || '').toLowerCase() === 'paid';
    doc.text(`Invoice No: ${String(invoice.id || '').slice(0, 8).toUpperCase()}`, 196, 40, { align: 'right' });
    doc.text(`Invoice Date: ${fmtDate(invoice.createdAt)}`, 196, 46, { align: 'right' });
    doc.text(`Due Date: ${fmtDate(invoice.dueDate)}`, 196, 52, { align: 'right' });
    doc.text(`Academic Year: ${academicYearOf(invoice)}`, 196, 58, { align: 'right' });
    const y = studentBlock(doc, student, 40);

    autoTable(doc, {
        startY: Math.max(y, 60) + 6,
        head: [['Fee Details', 'Academic Year', 'Due Date', 'Amount']],
        body: [[feeTitle(invoice), academicYearOf(invoice), fmtDate(invoice.dueDate), rupees(invoice.amount)]],
        foot: [['', '', 'Total', rupees(invoice.amount)]],
        styles: { fontSize: 10 },
        headStyles: { fillColor: [147, 100, 150] },
        footStyles: { fillColor: [240, 240, 240], textColor: 20 }
    });
    const endY = doc.lastAutoTable.finalY + 10;
    doc.setFont('helvetica', 'bold');
    doc.text(`Status: ${paid ? 'PAID' : 'PAYMENT PENDING'}`, 14, endY);
    doc.setFont('helvetica', 'normal');
    if (!paid) doc.text('Please pay at the school office before the due date.', 14, endY + 7);
    doc.save(`Invoice_${safe(student?.name)}_${safe(feeTitle(invoice))}_${safe(academicYearOf(invoice))}.pdf`);
}

/** Receipt (only for paid invoices) */
export function downloadReceiptPdf({ schoolName, student, invoice }) {
    const doc = new jsPDF();
    header(doc, schoolName, 'FEE RECEIPT');
    doc.text(`Receipt No: ${invoice.receiptNumber || '-'}`, 196, 40, { align: 'right' });
    doc.text(`Paid On: ${fmtDate(invoice.paidAt)}`, 196, 46, { align: 'right' });
    doc.text(`Payment Mode: ${invoice.paymentMode || '-'}`, 196, 52, { align: 'right' });
    doc.text(`Academic Year: ${academicYearOf(invoice)}`, 196, 58, { align: 'right' });
    if (invoice.transactionReference) doc.text(`Reference: ${invoice.transactionReference}`, 196, 64, { align: 'right' });
    const y = studentBlock(doc, student, 40);

    autoTable(doc, {
        startY: Math.max(y, invoice.transactionReference ? 66 : 60) + 6,
        head: [['Fee Details', 'Academic Year', 'Due Date', 'Amount Paid']],
        body: [[feeTitle(invoice), academicYearOf(invoice), fmtDate(invoice.dueDate), rupees(invoice.amount)]],
        foot: [['', '', 'Total Paid', rupees(invoice.amount)]],
        styles: { fontSize: 10 },
        headStyles: { fillColor: [147, 100, 150] },
        footStyles: { fillColor: [240, 240, 240], textColor: 20 }
    });
    const endY = doc.lastAutoTable.finalY + 10;
    doc.setFont('helvetica', 'bold');
    doc.text('PAID - Thank you.', 14, endY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('This is a computer generated receipt.', 14, endY + 8);
    doc.save(`Receipt_${safe(invoice.receiptNumber || student?.name)}.pdf`);
}
