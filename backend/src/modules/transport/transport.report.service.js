import { prisma } from '../../database/prisma.client.js';

/**
 * Transport report data (Fee Reports -> Transport Report).
 *
 *  - getTransportStudentReport : one row per transport student with father / mother details and the
 *                                transport fee totals (total, concession, paid, due)  -> Bus Fee Report + Bus Summary
 *  - getTransportPaymentReport : one row per PAID transport invoice                    -> Bus Fee Collection + Route Wise Collection
 *
 * Transport invoices are the invoices whose fee name starts with "Transport" (see transport.billing.js).
 * Everything is read-only and tenant scoped.
 */

const TRANSPORT_INVOICE = { feeName: { startsWith: 'Transport', mode: 'insensitive' }, status: { not: 'Cancelled' } };
const num = (v) => Number(v || 0);
const round2 = (n) => Math.round(n * 100) / 100;
const fullName = (s) => `${s?.firstName || ''} ${s?.lastName || ''}`.trim();
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const vehicleNameOf = (v) => v?.customData?.vehicleName || v?.model || v?.registrationNumber || null;
const categoryOf = (s) => s?.customData?.studentCategory || s?.customData?.category || s?.class?.category?.name || null;

const netOf = (inv) => num(inv.amount) - (inv.concessions || []).reduce((t, c) => t + num(c.amount), 0);

/** "2026-08-15" -> "August" */
const monthOf = (dueDate) => {
    const m = /^(\d{4})-(\d{2})/.exec(String(dueDate || ''));
    return m ? MONTHS[Number(m[2]) - 1] || '' : '';
};

const parentOf = (links, relation) => {
    const hit = (links || []).find((l) => String(l.relationship || '').toLowerCase() === relation);
    return hit?.parent || null;
};

const studentSelect = {
    id: true,
    admissionNumber: true,
    firstName: true,
    lastName: true,
    bloodGroup: true,
    status: true,
    customData: true,
    transportRouteId: true,
    busStopId: true,
    class: { select: { id: true, name: true, category: { select: { name: true } } } },
    section: { select: { id: true, name: true } },
    transportRoute: { select: { id: true, name: true, routeNumber: true, vehicle: { select: { registrationNumber: true, model: true, customData: true } } } },
    busStop: { select: { id: true, stopName: true, slabName: true } }
};

const routeFields = (s) => ({
    routeId: s.transportRouteId || null,
    routeName: s.transportRoute?.name || '',
    busNumber: s.transportRoute?.vehicle?.registrationNumber || s.transportRoute?.routeNumber || '',
    vehicleName: vehicleNameOf(s.transportRoute?.vehicle) || '',
    busStopId: s.busStopId || null,
    stopName: s.busStop?.stopName || '',
    slabName: s.busStop?.slabName || ''
});

/** Students on transport (or that have transport invoices) with fee totals. */
export async function getTransportStudentReport(schoolId) {
    const students = await prisma.student.findMany({
        where: {
            schoolId,
            OR: [{ transportRouteId: { not: null } }, { invoices: { some: TRANSPORT_INVOICE } }]
        },
        select: {
            ...studentSelect,
            parents: {
                select: { relationship: true, parent: { select: { name: true, phone: true, address: true } } },
                orderBy: { createdAt: 'asc' }
            },
            invoices: {
                where: TRANSPORT_INVOICE,
                select: { amount: true, status: true, concessions: { where: { status: 'Active' }, select: { amount: true } } }
            }
        },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }]
    });

    const rows = students.map((s) => {
        const father = parentOf(s.parents, 'father') || s.parents?.[0]?.parent || null;
        const mother = parentOf(s.parents, 'mother');
        const total = s.invoices.reduce((t, i) => t + num(i.amount), 0);
        const concession = s.invoices.reduce((t, i) => t + (i.concessions || []).reduce((c, x) => c + num(x.amount), 0), 0);
        const paid = s.invoices.filter((i) => i.status === 'Paid').reduce((t, i) => t + netOf(i), 0);
        const due = Math.max(0, total - concession - paid);
        const mapped = Boolean(s.transportRouteId);
        return {
            id: s.id,
            admissionNumber: s.admissionNumber,
            studentName: fullName(s),
            category: categoryOf(s) || '',
            classId: s.class?.id || null,
            className: s.class?.name || '',
            sectionId: s.section?.id || null,
            sectionName: s.section?.name || '',
            bloodGroup: s.bloodGroup || '',
            fatherName: father?.name || '',
            fatherPhone: father?.phone || '',
            motherName: mother?.name || '',
            motherPhone: mother?.phone || '',
            address: father?.address || mother?.address || '',
            ...routeFields(s),
            // "Withdraw" = no longer on a bus, or the student record itself is not Active
            transportStatus: mapped && s.status === 'Active' ? 'Active' : 'Withdraw',
            totalAmount: round2(total),
            concession: round2(concession),
            paid: round2(paid),
            due: round2(due)
        };
    });

    return { data: rows };
}

const IST = '+05:30';

/** Every PAID transport invoice (payment) in the date range. */
export async function getTransportPaymentReport(schoolId, query = {}) {
    const paidAt = {};
    if (query.from) paidAt.gte = new Date(`${query.from}T00:00:00.000${IST}`);
    if (query.to) paidAt.lte = new Date(`${query.to}T23:59:59.999${IST}`);

    const invoices = await prisma.invoice.findMany({
        where: {
            schoolId,
            feeName: { startsWith: 'Transport', mode: 'insensitive' },
            status: 'Paid',
            ...(Object.keys(paidAt).length ? { paidAt } : {})
        },
        select: {
            id: true,
            feeName: true,
            amount: true,
            dueDate: true,
            paidAt: true,
            paymentMode: true,
            transactionReference: true,
            receiptNumber: true,
            customData: true,
            concessions: { where: { status: 'Active' }, select: { amount: true } },
            student: { select: studentSelect }
        },
        orderBy: [{ paidAt: 'asc' }, { id: 'asc' }]
    });

    const rows = invoices
        .filter((i) => i.student)
        .map((i) => ({
            id: i.id,
            admissionNumber: i.student.admissionNumber,
            studentName: fullName(i.student),
            category: categoryOf(i.student) || '',
            classId: i.student.class?.id || null,
            className: i.student.class?.name || '',
            sectionId: i.student.section?.id || null,
            sectionName: i.student.section?.name || '',
            ...routeFields(i.student),
            feeName: i.feeName,
            feeMonth: monthOf(i.dueDate),
            dueDate: i.dueDate,
            paidAt: i.paidAt ? i.paidAt.toISOString() : null,
            payMode: i.paymentMode || '',
            invoiceRef: i.receiptNumber || '',
            referenceNo: i.transactionReference || '',
            bank: i.customData?.bank || i.customData?.bankName || '',
            amount: round2(netOf(i))
        }));

    return { data: rows };
}
