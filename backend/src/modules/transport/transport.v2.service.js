import * as repo from './transport.v2.repository.js';
import * as baseRepo from './transport.repository.js';
import { createAuditLog } from '../audit/audit.repository.js';
import { syncTransportInvoices, findMappedStudentIds, syncAllTransportInvoices } from './transport.billing.js';
import { SYSTEM_ROLES } from '../../config/constants.js';
import { TenantAccessError, NotFoundError, ConflictError, ValidationError, ForbiddenError } from '../../utils/app-error.js';

const who = (actor) => ({
    userName: actor?.name || actor?.email || 'Administrator',
    userRole: actor?.role || actor?.systemRole || null
});

const audit = (schoolId, actor, entityType, entityId, action, fields) =>
    createAuditLog({
        schoolId,
        entityType,
        entityId,
        actionPerformed: action,
        ...who(actor),
        modifiedFields: fields
    }).catch(() => { });

const needTenant = (schoolId, what) => {
    if (!schoolId) throw new TenantAccessError(`Tenant context required to ${what}`);
};

// ---- distance helpers: the old free-text "slab name" is now a distance in km ----
const parseKm = (label) => {
    const m = /(\d+(?:\.\d+)?)/.exec(String(label ?? ''));
    return m ? Number(m[1]) : null;
};
const formatKm = (n) => `${Number(n)} KM`;
const slabFromInput = (data) => {
    if (data.distanceKm !== null && data.distanceKm !== undefined && data.distanceKm !== '') return formatKm(data.distanceKm);
    return data.slabName ? String(data.slabName).trim() : null;
};
const sameDistance = (a, b) => {
    const na = parseKm(a);
    const nb = parseKm(b);
    if (na !== null && nb !== null) return na === nb;
    return String(a ?? '').toLowerCase().replace(/\s+/g, '') === String(b ?? '').toLowerCase().replace(/\s+/g, '');
};

const shapeStop = (s) => {
    const routes = (s.routes || []).map((r) => r.route).filter(Boolean);
    return {
        id: s.id,
        stopName: s.stopName,
        slabName: s.slabName,
        distanceKm: parseKm(s.slabName),
        distanceLabel: s.slabName ? (parseKm(s.slabName) !== null ? formatKm(parseKm(s.slabName)) : s.slabName) : null,
        geocode: s.geocode,
        routes,
        // every bus (route + vehicle) that stops here
        buses: routes.map((r) => ({
            routeId: r.id,
            routeName: r.name,
            busNumber: r.vehicle?.registrationNumber || r.routeNumber || null
        })),
        studentCount: s._count?.students ?? 0,
        feeCount: s._count?.fees ?? 0,
        createdAt: s.createdAt
    };
};

const shapeFee = (f) => {
    const slab = f.kind === 'STOP' ? f.busStop?.slabName || null : f.slabName;
    return {
        id: f.id,
        kind: f.kind,
        busStopId: f.busStopId,
        stopName: f.busStop?.stopName || null,
        slabName: slab,
        distanceKm: parseKm(slab),
        dueDate: f.dueDate,
        // single amount (the old one-way / two-way pair is kept in sync in the DB)
        amount: Number(f.twoWayAmount),
        createdAt: f.createdAt
    };
};

// ---------------- BUS STOPS ----------------
export async function listBusStops(schoolId, query = {}) {
    needTenant(schoolId, 'list bus stops');
    return (await repo.findBusStops(schoolId, query)).map(shapeStop);
}

export async function getBusStop(schoolId, id) {
    needTenant(schoolId, 'get bus stop');
    const stop = await repo.findBusStopById(schoolId, id);
    if (!stop) throw new NotFoundError('Bus stop not found in active school');
    return shapeStop(stop);
}

export async function listSlabNames(schoolId) {
    needTenant(schoolId, 'list slabs');
    return repo.findDistinctSlabNames(schoolId);
}

async function assertRoutesExist(schoolId, routeIds) {
    const unique = [...new Set(routeIds)];
    const found = await repo.countRoutesInTenant(schoolId, unique);
    if (found !== unique.length) throw new NotFoundError('One or more selected routes were not found in active school');
    return unique;
}

export async function createBusStop(schoolId, data, actor = {}) {
    needTenant(schoolId, 'create bus stop');
    const routeIds = await assertRoutesExist(schoolId, data.routeIds);
    const dup = await repo.findBusStopByName(schoolId, data.stopName);
    if (dup) throw new ConflictError(`Bus stop '${data.stopName}' already exists`);
    const stop = await repo.createBusStop(schoolId, { ...data, slabName: slabFromInput(data), routeIds });
    audit(schoolId, actor, 'BusStop', stop.id, 'CREATE_BUS_STOP', { stopName: stop.stopName, routeIds });
    return shapeStop(stop);
}

export async function updateBusStop(schoolId, id, data, actor = {}) {
    needTenant(schoolId, 'update bus stop');
    const existing = await repo.findBusStopById(schoolId, id);
    if (!existing) throw new NotFoundError('Bus stop not found in active school');
    const routeIds = await assertRoutesExist(schoolId, data.routeIds);
    const dup = await repo.findBusStopByName(schoolId, data.stopName, id);
    if (dup) throw new ConflictError(`Bus stop '${data.stopName}' already exists`);

    // Do not detach a route that still has students mapped to this stop
    const removed = (existing.routes || []).map((r) => r.route.id).filter((rid) => !routeIds.includes(rid));
    for (const rid of removed) {
        const n = await repo.countStudentsOnStopRoute(schoolId, id, rid);
        if (n > 0) {
            const name = existing.routes.find((r) => r.route.id === rid)?.route?.name;
            throw new ConflictError(`Cannot remove route '${name}': ${n} student(s) are mapped to this stop on that route`);
        }
    }

    const stop = await baseRepo.runTransaction(async (tx) => {
        const updated = await repo.updateBusStop(schoolId, id, { ...data, slabName: slabFromInput(data), routeIds }, tx);
        // distance may have changed -> a different slab fee can now apply to students on this stop
        await syncTransportInvoices(schoolId, await findMappedStudentIds(schoolId, { busStopId: id }, tx), tx);
        return updated;
    }, { timeout: 60000 });
    audit(schoolId, actor, 'BusStop', id, 'UPDATE_BUS_STOP', { stopName: data.stopName, routeIds });
    return shapeStop(stop);
}

export async function deleteBusStop(schoolId, id, actor = {}) {
    needTenant(schoolId, 'delete bus stop');
    const existing = await repo.findBusStopById(schoolId, id);
    if (!existing) throw new NotFoundError('Bus stop not found in active school');
    const mapped = await repo.countStudentsOnStop(schoolId, id);
    if (mapped > 0) {
        throw new ConflictError(`Cannot delete '${existing.stopName}': ${mapped} student(s) are mapped to this stop. Unmap them first.`);
    }
    await repo.deleteBusStop(schoolId, id);
    audit(schoolId, actor, 'BusStop', id, 'DELETE_BUS_STOP', { deletedStopName: existing.stopName });
    return { message: 'Bus stop deleted successfully', id };
}

// ---------------- BUS FEES ----------------
const normalizeFee = (data) => ({
    ...data,
    busStopId: data.kind === 'STOP' ? data.busStopId : null,
    slabName: data.kind === 'SLAB' ? slabFromInput(data) : null
});

async function validateFeeTarget(schoolId, data, excludeId = null) {
    if (data.kind === 'STOP') {
        const stop = await repo.findBusStopById(schoolId, data.busStopId);
        if (!stop) throw new NotFoundError('Bus stop not found in active school');
    }
    const dup = await repo.findDuplicateFee(schoolId, data, excludeId);
    if (dup) throw new ConflictError('A fee entry already exists for this stop/distance and due date');
}

export async function listBusFees(schoolId, query = {}) {
    needTenant(schoolId, 'list bus fees');
    return (await repo.findBusFees(schoolId, query)).map(shapeFee);
}

export async function getBusFee(schoolId, id) {
    needTenant(schoolId, 'get bus fee');
    const fee = await repo.findBusFeeById(schoolId, id);
    if (!fee) throw new NotFoundError('Fee entry not found in active school');
    return shapeFee(fee);
}

export async function createBusFee(schoolId, data, actor = {}) {
    needTenant(schoolId, 'create bus fee');
    const clean = normalizeFee(data);
    await validateFeeTarget(schoolId, clean);
    const fee = await baseRepo.runTransaction(async (tx) => {
        const created = await repo.createBusFee(schoolId, clean, tx);
        await syncTransportInvoices(schoolId, await findMappedStudentIds(schoolId, {}, tx), tx);
        return created;
    }, { timeout: 60000 });
    audit(schoolId, actor, 'BusFee', fee.id, 'CREATE_BUS_FEE', {
        kind: clean.kind, dueDate: clean.dueDate, amount: clean.amount
    });
    return shapeFee(fee);
}

export async function updateBusFee(schoolId, id, data, actor = {}) {
    needTenant(schoolId, 'update bus fee');
    const existing = await repo.findBusFeeById(schoolId, id);
    if (!existing) throw new NotFoundError('Fee entry not found in active school');
    const clean = normalizeFee(data);
    await validateFeeTarget(schoolId, clean, id);
    const fee = await baseRepo.runTransaction(async (tx) => {
        const updated = await repo.updateBusFee(schoolId, id, clean, tx);
        await syncTransportInvoices(schoolId, await findMappedStudentIds(schoolId, {}, tx), tx);
        return updated;
    }, { timeout: 60000 });
    audit(schoolId, actor, 'BusFee', id, 'UPDATE_BUS_FEE', { kind: clean.kind, dueDate: clean.dueDate, amount: clean.amount });
    return shapeFee(fee);
}

export async function deleteBusFee(schoolId, id, actor = {}) {
    needTenant(schoolId, 'delete bus fee');
    const existing = await repo.findBusFeeById(schoolId, id);
    if (!existing) throw new NotFoundError('Fee entry not found in active school');
    await baseRepo.runTransaction(async (tx) => {
        await repo.deleteBusFee(schoolId, id, tx);
        // unpaid invoices of the deleted fee are cancelled; paid ones stay as receipts
        await syncTransportInvoices(schoolId, await findMappedStudentIds(schoolId, {}, tx), tx);
    }, { timeout: 60000 });
    audit(schoolId, actor, 'BusFee', id, 'DELETE_BUS_FEE', { dueDate: existing.dueDate, kind: existing.kind });
    return { message: 'Fee entry deleted successfully', id };
}

// ---------------- STUDENT MAPPINGS ----------------
async function mapStudents(schoolId, studentIds, data, actor, action) {
    const unique = [...new Set(studentIds)];

    await baseRepo.runTransaction(async (tx) => {
        const route = await baseRepo.lockRouteForUpdate(schoolId, data.routeId, tx);
        if (!route) throw new NotFoundError('Route not found in active school');

        const stop = await repo.findBusStopById(schoolId, data.busStopId, tx);
        if (!stop) throw new NotFoundError('Bus stop not found in active school');
        const link = await repo.findStopRouteLink(data.busStopId, data.routeId, tx);
        if (!link) throw new ValidationError(`Bus stop '${stop.stopName}' is not served by route '${route.name}'`);

        const students = await repo.findStudentsForMapping(schoolId, unique, tx);
        if (students.length !== unique.length) throw new NotFoundError('One or more students were not found in active school');

        // Capacity: everyone ends up on this route, so count others + selected
        const others = await repo.countOtherStudentsOnRoute(schoolId, data.routeId, unique, tx);
        if (others + unique.length > route.capacity) {
            throw new ConflictError(
                `Cannot map: route '${route.name}' capacity is ${route.capacity} and would reach ${others + unique.length}`
            );
        }

        await repo.applyMapping(schoolId, unique, data, tx);

        // bill the bus fee(s) of this stop so they show up in Parent Fees and Admin Fee Collection
        await syncTransportInvoices(schoolId, unique, tx);
    }, { timeout: 60000 });

    audit(schoolId, actor, 'StudentTransportAssignment', unique[0], action, {
        studentIds: unique, routeId: data.routeId, busStopId: data.busStopId,
        travelMode: data.travelMode, effectFrom: data.effectFrom
    });
    return { count: unique.length };
}

export async function createMappings(schoolId, data, actor = {}) {
    needTenant(schoolId, 'map students');
    return mapStudents(schoolId, data.studentIds, data, actor, 'MAP_STUDENT_BUS');
}

export async function updateMapping(schoolId, studentId, data, actor = {}) {
    needTenant(schoolId, 'update student mapping');
    const student = await baseRepo.findStudentInTenant(schoolId, studentId);
    if (!student) throw new NotFoundError('Student not found in active school');
    return mapStudents(schoolId, [studentId], data, actor, 'UPDATE_STUDENT_BUS_MAPPING');
}

export async function deleteMapping(schoolId, studentId, actor = {}) {
    needTenant(schoolId, 'unmap student');
    const student = await baseRepo.findStudentInTenant(schoolId, studentId);
    if (!student) throw new NotFoundError('Student not found in active school');
    await baseRepo.runTransaction(async (tx) => {
        await repo.clearMapping(schoolId, studentId, tx);
        // cancels the student's unpaid transport invoices (paid ones are kept)
        await syncTransportInvoices(schoolId, [studentId], tx);
    });
    audit(schoolId, actor, 'StudentTransportAssignment', studentId, 'UNMAP_STUDENT_BUS', {
        previousRouteId: student.transportRouteId
    });
    return { message: 'Student unmapped successfully', id: studentId };
}

// ---------------- PARENT / STUDENT SELF-SERVICE ----------------
const roleOf = (actor) => String(actor?.systemRole || actor?.role || '').toUpperCase();

// Fee schedule for one stop: stop-specific fee wins over a distance-slab fee for the same due date.
async function resolveFeesForStop(schoolId, stop) {
    if (!stop) return [];
    const all = await repo.findFeesForStop(schoolId, stop.id);
    const byDue = new Map();
    all
        .filter((f) => f.kind === 'SLAB' && stop.slabName && sameDistance(f.slabName, stop.slabName))
        .forEach((f) => byDue.set(f.dueDate, { id: f.id, dueDate: f.dueDate, amount: Number(f.twoWayAmount), basis: 'SLAB' }));
    all
        .filter((f) => f.kind === 'STOP')
        .forEach((f) => byDue.set(f.dueDate, { id: f.id, dueDate: f.dueDate, amount: Number(f.twoWayAmount), basis: 'STOP' }));
    return [...byDue.values()].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/**
 * Transport details of the logged-in parent's children (or of the logged-in student).
 * GET /api/v1/transport/my-transport[?studentId=]
 */
export async function getMyTransport(schoolId, query = {}, actor = {}) {
    needTenant(schoolId, 'view transport details');
    const role = roleOf(actor);
    const userId = actor.id || actor.userId;

    let allowedIds = [];
    if (role === SYSTEM_ROLES.PARENT || role === 'PARENT') {
        allowedIds = await baseRepo.findAuthorizedStudentIdsForParent(schoolId, userId);
    } else if (role === SYSTEM_ROLES.STUDENT || role === 'STUDENT') {
        const me = await baseRepo.findStudentByUserId(schoolId, userId);
        allowedIds = me ? [me.id] : [];
    } else {
        throw new ForbiddenError('Only parents and students can use this view');
    }

    let ids = allowedIds;
    if (query.studentId) {
        if (!allowedIds.includes(query.studentId)) {
            throw new ForbiddenError('You can only view transport details of your own children');
        }
        ids = [query.studentId];
    }
    if (ids.length === 0) return [];

    const students = await repo.findStudentsTransportDetail(schoolId, ids);
    return Promise.all(
        students.map(async (st) => {
            const assigned = Boolean(st.transportRouteId);
            const stop = st.busStop || null;
            const fees = assigned ? await resolveFeesForStop(schoolId, stop) : [];
            const slab = stop?.slabName || null;
            return {
                studentId: st.id,
                studentName: `${st.firstName || ''} ${st.lastName || ''}`.trim(),
                admissionNumber: st.admissionNumber || null,
                className: st.class?.name || null,
                sectionName: st.section?.name || null,
                assigned,
                routeName: st.transportRoute?.name || null,
                busNumber: st.transportRoute?.vehicle?.registrationNumber || null,
                busModel: st.transportRoute?.vehicle?.model || null,
                driverName: st.transportRoute?.driverName || null,
                driverPhone: st.transportRoute?.driverPhone || null,
                stopName: stop?.stopName || st.pickupStop?.stopName || null,
                distanceKm: parseKm(slab),
                distanceLabel: slab ? (parseKm(slab) !== null ? formatKm(parseKm(slab)) : slab) : null,
                travelMode: st.travelMode || null,
                effectFrom: st.transportEffectFrom || null,
                fees,
                totalFee: fees.reduce((sum, f) => sum + f.amount, 0)
            };
        })
    );
}


// ---------------- BACK-FILL ----------------
/**
 * Bills every student who is already mapped to a bus stop (for mappings made before
 * transport invoices existed). POST /api/v1/transport/fees/sync-invoices
 */
export async function syncAllInvoices(schoolId, actor = {}) {
    needTenant(schoolId, 'sync transport invoices');
    const result = await baseRepo.runTransaction((tx) => syncAllTransportInvoices(schoolId, tx), { timeout: 120000 });
    audit(schoolId, actor, 'BusFee', schoolId, 'SYNC_TRANSPORT_INVOICES', result);
    return result;
}
