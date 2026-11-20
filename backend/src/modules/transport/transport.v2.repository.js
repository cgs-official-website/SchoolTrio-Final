import { prisma } from '../../database/prisma.client.js';

const stopInclude = {
    routes: { select: { route: { select: { id: true, name: true, routeNumber: true } } } },
    _count: { select: { students: true, fees: true } }
};

// ---------------- BUS STOPS ----------------
export async function findBusStops(schoolId, filters = {}, tx = prisma) {
    const where = { schoolId };
    if (filters.search) {
        const q = filters.search.trim();
        where.OR = [
            { stopName: { contains: q, mode: 'insensitive' } },
            { slabName: { contains: q, mode: 'insensitive' } },
            { geocode: { contains: q, mode: 'insensitive' } }
        ];
    }
    if (filters.routeId) where.routes = { some: { routeId: filters.routeId } };
    return tx.busStop.findMany({ where, include: stopInclude, orderBy: { stopName: 'asc' } });
}

export async function findBusStopById(schoolId, id, tx = prisma) {
    return tx.busStop.findFirst({ where: { schoolId, id }, include: stopInclude });
}

export async function findBusStopByName(schoolId, stopName, excludeId = null, tx = prisma) {
    const where = { schoolId, stopName: { equals: stopName, mode: 'insensitive' } };
    if (excludeId) where.id = { not: excludeId };
    return tx.busStop.findFirst({ where });
}

export async function countRoutesInTenant(schoolId, routeIds, tx = prisma) {
    return tx.transportRoute.count({ where: { schoolId, id: { in: routeIds } } });
}

export async function createBusStop(schoolId, data, tx = prisma) {
    return tx.busStop.create({
        data: {
            schoolId,
            stopName: data.stopName,
            slabName: data.slabName || null,
            geocode: data.geocode || null,
            routes: { create: data.routeIds.map((routeId) => ({ schoolId, routeId })) }
        },
        include: stopInclude
    });
}

export async function updateBusStop(schoolId, id, data, tx = prisma) {
    await tx.busStop.update({
        where: { schoolId_id: { schoolId, id } },
        data: { stopName: data.stopName, slabName: data.slabName || null, geocode: data.geocode || null }
    });
    await tx.busStopRoute.deleteMany({ where: { busStopId: id, routeId: { notIn: data.routeIds } } });
    await tx.busStopRoute.createMany({
        data: data.routeIds.map((routeId) => ({ schoolId, busStopId: id, routeId })),
        skipDuplicates: true
    });
    return tx.busStop.findFirst({ where: { schoolId, id }, include: stopInclude });
}

export async function deleteBusStop(schoolId, id, tx = prisma) {
    return tx.busStop.delete({ where: { schoolId_id: { schoolId, id } } });
}

export async function countStudentsOnStopRoute(schoolId, busStopId, routeId, tx = prisma) {
    return tx.student.count({ where: { schoolId, busStopId, transportRouteId: routeId } });
}

export async function countStudentsOnStop(schoolId, busStopId, tx = prisma) {
    return tx.student.count({ where: { schoolId, busStopId } });
}

export async function findDistinctSlabNames(schoolId, tx = prisma) {
    const rows = await tx.busStop.findMany({
        where: { schoolId, slabName: { not: null } },
        select: { slabName: true },
        distinct: ['slabName'],
        orderBy: { slabName: 'asc' }
    });
    return rows.map((r) => r.slabName).filter(Boolean);
}

// ---------------- BUS FEES ----------------
const feeInclude = { busStop: { select: { id: true, stopName: true, slabName: true } } };

export async function findBusFees(schoolId, filters = {}, tx = prisma) {
    const where = { schoolId };
    if (filters.kind) where.kind = filters.kind;
    if (filters.search) {
        const q = filters.search.trim();
        where.OR = [
            { slabName: { contains: q, mode: 'insensitive' } },
            { busStop: { stopName: { contains: q, mode: 'insensitive' } } }
        ];
    }
    return tx.busFee.findMany({
        where,
        include: feeInclude,
        orderBy: [{ createdAt: 'asc' }]
    });
}

export async function findBusFeeById(schoolId, id, tx = prisma) {
    return tx.busFee.findFirst({ where: { schoolId, id }, include: feeInclude });
}

export async function findDuplicateFee(schoolId, data, excludeId = null, tx = prisma) {
    const where = { schoolId, kind: data.kind, dueDate: data.dueDate };
    if (data.kind === 'STOP') where.busStopId = data.busStopId;
    else where.slabName = { equals: data.slabName, mode: 'insensitive' };
    if (excludeId) where.id = { not: excludeId };
    return tx.busFee.findFirst({ where });
}

export async function createBusFee(schoolId, data, tx = prisma) {
    return tx.busFee.create({
        data: {
            schoolId,
            kind: data.kind,
            busStopId: data.kind === 'STOP' ? data.busStopId : null,
            slabName: data.kind === 'SLAB' ? data.slabName : null,
            dueDate: data.dueDate,
            oneWayAmount: data.oneWayAmount,
            twoWayAmount: data.twoWayAmount
        },
        include: feeInclude
    });
}

export async function updateBusFee(schoolId, id, data, tx = prisma) {
    return tx.busFee.update({
        where: { schoolId_id: { schoolId, id } },
        data: {
            kind: data.kind,
            busStopId: data.kind === 'STOP' ? data.busStopId : null,
            slabName: data.kind === 'SLAB' ? data.slabName : null,
            dueDate: data.dueDate,
            oneWayAmount: data.oneWayAmount,
            twoWayAmount: data.twoWayAmount
        },
        include: feeInclude
    });
}

export async function deleteBusFee(schoolId, id, tx = prisma) {
    return tx.busFee.delete({ where: { schoolId_id: { schoolId, id } } });
}

// ---------------- STUDENT MAPPINGS ----------------
export async function findStopRouteLink(busStopId, routeId, tx = prisma) {
    return tx.busStopRoute.findFirst({ where: { busStopId, routeId } });
}

export async function findStudentsForMapping(schoolId, studentIds, tx = prisma) {
    return tx.student.findMany({
        where: { schoolId, id: { in: studentIds } },
        select: { id: true, transportRouteId: true, firstName: true }
    });
}

export async function countOtherStudentsOnRoute(schoolId, routeId, excludeIds, tx = prisma) {
    return tx.student.count({
        where: { schoolId, transportRouteId: routeId, id: { notIn: excludeIds } }
    });
}

export async function applyMapping(schoolId, studentIds, data, tx = prisma) {
    return tx.student.updateMany({
        where: { schoolId, id: { in: studentIds } },
        data: {
            transportRouteId: data.routeId,
            busStopId: data.busStopId,
            travelMode: data.travelMode,
            transportEffectFrom: data.effectFrom,
            // legacy per-route stop no longer matches a new route/stop choice
            pickupStopId: null
        }
    });
}

export async function clearMapping(schoolId, studentId, tx = prisma) {
    return tx.student.update({
        where: { schoolId_id: { schoolId, id: studentId } },
        data: {
            transportRouteId: null,
            pickupStopId: null,
            busStopId: null,
            travelMode: null,
            transportEffectFrom: null
        }
    });
}
