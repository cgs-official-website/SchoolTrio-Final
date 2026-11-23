import { prisma } from '../../database/prisma.client.js';
import { stopInSlab } from './transport.slab.js';

/**
 * Transport fee -> Fee ledger bridge.
 *
 * Bus fees (bus_fees table) are only a price list. The Parent "Fees & Payments" page and the
 * Admin "Fee Collection" ledger read INVOICES, so a student mapped to a bus stop must get an
 * invoice for every bus fee that applies to that stop.
 *
 * How it works:
 *   - one shared FeeStructure per bus fee (customData.source = 'TRANSPORT', customData.busFeeId)
 *     with targetType 'STUDENT' and the mapped students in targetIds
 *   - one Invoice per (student, bus fee) under the "Transport Fee" fee category (type 'Bus')
 *   - a bus stop that has its OWN fee (Stop Fee) is billed ONLY with its stop fees; the distance-slab
 *     fee is skipped for that stop completely, whatever the due dates are (no "stop + slab" double billing)
 *   - every invoice carries its academic year and phase ("Transport Fee - Phase 1", "Phase 2" ...);
 *     the phase is the position of its due date inside the student's academic year
 *   - everything is idempotent: call it as often as you like
 *   - PAID invoices are never touched. Only unpaid (Pending) ones are updated / cancelled.
 */

export const TRANSPORT_SOURCE = 'TRANSPORT';
export const TRANSPORT_CATEGORY_NAME = 'Transport Fee';
const ID_CHUNK = 200;

const chunk = (items, size) => {
    const out = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
};

/** Finds (or creates) the fee category that all transport invoices belong to. */
async function ensureTransportCategory(schoolId, tx) {
    const byName = await tx.feeCategory.findFirst({
        where: { schoolId, name: { equals: TRANSPORT_CATEGORY_NAME, mode: 'insensitive' } }
    });
    if (byName) return byName;

    const anyBus = await tx.feeCategory.findFirst({ where: { schoolId, categoryType: 'Bus' }, orderBy: { createdAt: 'asc' } });
    if (anyBus) return anyBus;

    return tx.feeCategory.create({
        data: { schoolId, name: TRANSPORT_CATEGORY_NAME, categoryType: 'Bus', paymentOrder: 0, shortCode: 'BUS' }
    });
}

/**
 * Academic year of a due date (April - March): 2026-11-23 -> "2026-2027", 2027-02-10 -> "2026-2027".
 * Same format as the school's academicConfig.currentYear.
 */
export function academicYearOf(dueDate) {
    const d = new Date(`${String(dueDate).slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return null;
    const start = d.getUTCMonth() < 3 ? d.getUTCFullYear() - 1 : d.getUTCFullYear();
    return `${start}-${start + 1}`;
}

/**
 * Which bus fees does this stop pay?
 *   1. the stop has its own fee(s)  -> ONLY those (the slab fee is overridden, even on other due dates)
 *   2. otherwise                    -> the distance-slab fee(s) that cover the stop's distance
 * Returns [{ busFeeId, dueDate, amount, basis }] sorted by due date.
 */
export function resolveFees(allFees, stop) {
    if (!stop) return [];
    const stopFees = allFees.filter((f) => f.kind === 'STOP' && f.busStopId === stop.id);
    const chosen = stopFees.length > 0
        ? stopFees
        : allFees.filter((f) => f.kind === 'SLAB' && stop.slabName && stopInSlab(stop.slabName, f.slabName));
    return chosen
        .map((f) => ({ busFeeId: f.id, dueDate: f.dueDate, amount: Number(f.twoWayAmount), basis: f.kind }))
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/** Adds academicYear / phase / phaseCount / feeName to every fee ("Transport Fee - Phase 1"). */
function labelFees(fees) {
    const byYear = new Map();
    fees.forEach((f) => {
        f.academicYear = academicYearOf(f.dueDate);
        if (!byYear.has(f.academicYear)) byYear.set(f.academicYear, []);
        byYear.get(f.academicYear).push(f);
    });
    byYear.forEach((list) => {
        list.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
        list.forEach((f, i) => {
            f.phase = i + 1;
            f.phaseCount = list.length;
            f.feeName = list.length > 1 ? `${TRANSPORT_CATEGORY_NAME} - Phase ${i + 1}` : TRANSPORT_CATEGORY_NAME;
        });
    });
    return fees;
}

const invoiceCustomData = (fee) => ({
    source: TRANSPORT_SOURCE,
    busFeeId: fee.busFeeId,
    academicYear: fee.academicYear,
    phase: fee.phase,
    phaseCount: fee.phaseCount
});

/** The shared structure of one bus fee; creates it on first use and keeps it in sync. */
async function upsertStructure(schoolId, fee, studentIds, categoryId, tx) {
    const existing = await tx.feeStructure.findFirst({
        where: { schoolId, customData: { path: ['busFeeId'], equals: fee.busFeeId } }
    });

    if (!existing) {
        return tx.feeStructure.create({
            data: {
                schoolId,
                feeCategoryId: categoryId,
                name: TRANSPORT_CATEGORY_NAME,
                amount: fee.amount,
                dueDate: fee.dueDate,
                targetType: 'STUDENT',
                targetIds: studentIds,
                customData: { source: TRANSPORT_SOURCE, busFeeId: fee.busFeeId }
            }
        });
    }

    const merged = Array.from(new Set([...(existing.targetIds || []), ...studentIds]));
    const needsUpdate =
        merged.length !== (existing.targetIds || []).length ||
        Number(existing.amount) !== Number(fee.amount) ||
        existing.dueDate !== fee.dueDate;
    if (!needsUpdate) return existing;

    return tx.feeStructure.update({
        where: { schoolId_id: { schoolId, id: existing.id } },
        data: { targetIds: merged, amount: fee.amount, dueDate: fee.dueDate }
    });
}

/**
 * Brings the invoices of the given students in line with their current bus stop + the bus fees.
 *
 * @param {string} schoolId
 * @param {string[]} studentIds
 * @param {object} [tx] prisma transaction client
 * @returns {Promise<{ created: number, updated: number, cancelled: number }>}
 */
const fmtDueDate = (d) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || ''));
    return m ? `${m[3]}-${m[2]}-${m[1]}` : String(d || '');
};
const fmtRupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/**
 * Tell the student's parent(s) that new transport fee(s) were added.
 * Shows in the parent's bell + the "Transport" menu badge (notification type 'transport').
 * Runs inside the same transaction as the invoice creation, so a rollback leaves no stray alert.
 */
async function notifyParentsOfNewFees(schoolId, studentId, newFees, tx) {
    if (!newFees.length) return;
    const [student, links] = await Promise.all([
        tx.student.findFirst({ where: { schoolId, id: studentId }, select: { firstName: true, lastName: true, classId: true } }),
        tx.parentStudentLink.findMany({ where: { schoolId, studentId }, select: { parent: { select: { userId: true } } } })
    ]);
    const userIds = [...new Set(links.map((l) => l.parent?.userId).filter(Boolean))];
    if (!student || userIds.length === 0) return;

    const name = `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'your child';
    const parts = newFees.map((f) => `${fmtRupees(f.amount)} (due ${fmtDueDate(f.dueDate)})`);
    const message = newFees.length === 1
        ? `New transport fee for ${name}: ${parts[0]}`
        : `New transport fees for ${name}: ${parts.join(', ')}`;
    const today = new Date().toISOString().slice(0, 10);

    await tx.notification.createMany({
        data: userIds.map((userId) => ({
            schoolId,
            userId,
            classId: student.classId || null,
            type: 'transport',
            message,
            date: today,
            read: false
        }))
    });
}

export async function syncTransportInvoices(schoolId, studentIds, tx = prisma) {
    const result = { created: 0, updated: 0, cancelled: 0 };
    const ids = [...new Set((studentIds || []).filter(Boolean))];
    if (!schoolId || ids.length === 0) return result;

    const allFees = await tx.busFee.findMany({ where: { schoolId } });
    let categoryId = null;

    for (const part of chunk(ids, ID_CHUNK)) {
        const students = await tx.student.findMany({
            where: { schoolId, id: { in: part } },
            select: {
                id: true,
                status: true,
                transportRouteId: true,
                busStopId: true,
                busStop: { select: { id: true, slabName: true } }
            }
        });

        for (const st of students) {
            const active = ['active'].includes(String(st.status || '').toLowerCase());
            const mapped = Boolean(st.transportRouteId && st.busStopId);
            const fees = active && mapped ? labelFees(resolveFees(allFees, st.busStop)) : [];
            const wantedBusFeeIds = new Set(fees.map((f) => f.busFeeId));

            // ---- create / refresh invoices for the fees that apply ----
            const newFees = []; // fees the parent has not been billed for before -> one alert per student
            for (const fee of fees) {
                if (!categoryId) categoryId = (await ensureTransportCategory(schoolId, tx)).id;
                const structure = await upsertStructure(schoolId, fee, [st.id], categoryId, tx);

                const invoice = await tx.invoice.findFirst({
                    where: { schoolId, studentId: st.id, feeStructureId: structure.id }
                });

                if (!invoice) {
                    await tx.invoice.create({
                        data: {
                            schoolId,
                            studentId: st.id,
                            feeStructureId: structure.id,
                            collectionPeriodId: null,
                            feeName: fee.feeName,
                            amount: fee.amount,
                            dueDate: fee.dueDate,
                            status: 'Pending',
                            customData: invoiceCustomData(fee)
                        }
                    });
                    result.created += 1;
                    newFees.push(fee);
                    continue;
                }

                if (invoice.status === 'Paid') {
                    // never touch the money / dates of a paid invoice. Only a one-time label back-fill
                    // (academic year + phase) for invoices paid before phases existed, so receipts show them.
                    if (!invoice.customData?.phase) {
                        await tx.invoice.update({
                            where: { id: invoice.id },
                            data: { feeName: fee.feeName, customData: { ...(invoice.customData || {}), ...invoiceCustomData(fee) } }
                        });
                        result.updated += 1;
                    }
                    continue;
                }

                const cd = invoice.customData || {};
                const changed =
                    invoice.status === 'Cancelled' ||
                    Number(invoice.amount) !== Number(fee.amount) ||
                    invoice.dueDate !== fee.dueDate ||
                    invoice.feeName !== fee.feeName ||
                    cd.academicYear !== fee.academicYear ||
                    cd.phase !== fee.phase ||
                    cd.phaseCount !== fee.phaseCount;
                if (invoice.status === 'Cancelled') newFees.push(fee); // fee assigned again
                if (changed) {
                    await tx.invoice.update({
                        where: { id: invoice.id },
                        data: {
                            status: 'Pending',
                            amount: fee.amount,
                            dueDate: fee.dueDate,
                            feeName: fee.feeName,
                            customData: { ...cd, ...invoiceCustomData(fee) }
                        }
                    });
                    result.updated += 1;
                }
            }

            await notifyParentsOfNewFees(schoolId, st.id, newFees, tx);

            // ---- cancel unpaid transport invoices that no longer apply (unmapped / stop changed / fee deleted) ----
            const stale = await tx.invoice.findMany({
                where: {
                    schoolId,
                    studentId: st.id,
                    status: 'Pending',
                    paidAt: null,
                    feeStructure: { customData: { path: ['source'], equals: TRANSPORT_SOURCE } }
                },
                select: { id: true, feeStructure: { select: { customData: true } } }
            });
            const staleIds = stale
                .filter((i) => !wantedBusFeeIds.has(i.feeStructure?.customData?.busFeeId))
                .map((i) => i.id);
            if (staleIds.length > 0) {
                const r = await tx.invoice.updateMany({ where: { id: { in: staleIds } }, data: { status: 'Cancelled' } });
                result.cancelled += r.count;
            }
        }
    }

    return result;
}

/** Every student that currently has a bus stop (used after a fee / stop changes). */
export async function findMappedStudentIds(schoolId, { busStopId } = {}, tx = prisma) {
    const rows = await tx.student.findMany({
        where: { schoolId, busStopId: busStopId || { not: null }, transportRouteId: { not: null } },
        select: { id: true }
    });
    return rows.map((r) => r.id);
}

/** Back-fill: bill every already-mapped student. Safe to run repeatedly. */
export async function syncAllTransportInvoices(schoolId, tx = prisma) {
    const ids = await findMappedStudentIds(schoolId, {}, tx);
    // also catch students who were unmapped before and still hold pending transport invoices
    const holders = await tx.invoice.findMany({
        where: {
            schoolId,
            status: 'Pending',
            feeStructure: { customData: { path: ['source'], equals: TRANSPORT_SOURCE } },
            studentId: { not: null }
        },
        select: { studentId: true },
        distinct: ['studentId']
    });
    const all = [...new Set([...ids, ...holders.map((h) => h.studentId)])];
    const result = await syncTransportInvoices(schoolId, all, tx);
    return { students: all.length, ...result };
}
