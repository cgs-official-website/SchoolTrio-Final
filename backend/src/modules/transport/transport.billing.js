import { prisma } from '../../database/prisma.client.js';

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
 *   - stop-specific fee wins over a distance-slab fee for the same due date
 *     (same rule the Transport page already shows to parents)
 *   - everything is idempotent: call it as often as you like
 *   - PAID invoices are never touched. Only unpaid (Pending) ones are updated / cancelled.
 */

export const TRANSPORT_SOURCE = 'TRANSPORT';
export const TRANSPORT_CATEGORY_NAME = 'Transport Fee';
const ID_CHUNK = 200;

const parseKm = (label) => {
    const m = /(\d+(?:\.\d+)?)/.exec(String(label ?? ''));
    return m ? Number(m[1]) : null;
};
const sameDistance = (a, b) => {
    const na = parseKm(a);
    const nb = parseKm(b);
    if (na !== null && nb !== null) return na === nb;
    return String(a ?? '').toLowerCase().replace(/\s+/g, '') === String(b ?? '').toLowerCase().replace(/\s+/g, '');
};
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

/** Stop fee > slab fee for the same due date. Returns [{ busFeeId, dueDate, amount }] */
function resolveFees(allFees, stop) {
    if (!stop) return [];
    const byDue = new Map();
    allFees
        .filter((f) => f.kind === 'SLAB' && stop.slabName && sameDistance(f.slabName, stop.slabName))
        .forEach((f) => byDue.set(f.dueDate, { busFeeId: f.id, dueDate: f.dueDate, amount: Number(f.twoWayAmount) }));
    allFees
        .filter((f) => f.kind === 'STOP' && f.busStopId === stop.id)
        .forEach((f) => byDue.set(f.dueDate, { busFeeId: f.id, dueDate: f.dueDate, amount: Number(f.twoWayAmount) }));
    return [...byDue.values()];
}

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
            const fees = active && mapped ? resolveFees(allFees, st.busStop) : [];
            const wantedBusFeeIds = new Set(fees.map((f) => f.busFeeId));

            // ---- create / refresh invoices for the fees that apply ----
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
                            feeName: structure.name,
                            amount: fee.amount,
                            dueDate: fee.dueDate,
                            status: 'Pending',
                            customData: { source: TRANSPORT_SOURCE, busFeeId: fee.busFeeId }
                        }
                    });
                    result.created += 1;
                    continue;
                }

                if (invoice.status === 'Paid') continue; // never touch a paid invoice

                const changed =
                    invoice.status === 'Cancelled' ||
                    Number(invoice.amount) !== Number(fee.amount) ||
                    invoice.dueDate !== fee.dueDate;
                if (changed) {
                    await tx.invoice.update({
                        where: { id: invoice.id },
                        data: { status: 'Pending', amount: fee.amount, dueDate: fee.dueDate, feeName: structure.name }
                    });
                    result.updated += 1;
                }
            }

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
