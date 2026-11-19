import * as repo from './transport.v2.repository.js';
import * as baseRepo from './transport.repository.js';
import { createAuditLog } from '../audit/audit.repository.js';
import { TenantAccessError, NotFoundError, ConflictError, ValidationError } from '../../utils/app-error.js';

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

const shapeStop = (s) => ({
    id: s.id,
    stopName: s.stopName,
    slabName: s.slabName,
    geocode: s.geocode,
    routes: (s.routes || []).map((r) => r.route).filter(Boolean),
    studentCount: s._count?.students ?? 0,
    feeCount: s._count?.fees ?? 0,
    createdAt: s.createdAt
});

const shapeFee = (f) => ({
    id: f.id,
    kind: f.kind,
    busStopId: f.busStopId,
    stopName: f.busStop?.stopName || null,
    slabName: f.kind === 'STOP' ? f.busStop?.slabName || null : f.slabName,
    dueDate: f.dueDate,
    oneWayAmount: Number(f.oneWayAmount),
    twoWayAmount: Number(f.twoWayAmount),
    createdAt: f.createdAt
});

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
    const stop = await repo.createBusStop(schoolId, { ...data, routeIds });
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

    const stop = await baseRepo.runTransaction((tx) => repo.updateBusStop(schoolId, id, { ...data, routeIds }, tx));
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
async function validateFeeTarget(schoolId, data, excludeId = null) {
    if (data.kind === 'STOP') {
        const stop = await repo.findBusStopById(schoolId, data.busStopId);
        if (!stop) throw new NotFoundError('Bus stop not found in active school');
    } else {
        const slabs = await repo.findDistinctSlabNames(schoolId);
        if (!slabs.some((s) => s.toLowerCase() === data.slabName.trim().toLowerCase())) {
            throw new ValidationError(`Slab '${data.slabName}' is not assigned to any bus stop`);
        }
    }
    const dup = await repo.findDuplicateFee(schoolId, data, excludeId);
    if (dup) throw new ConflictError('A fee entry already exists for this stop/slab and due date');
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
    await validateFeeTarget(schoolId, data);
    const fee = await repo.createBusFee(schoolId, data);
    audit(schoolId, actor, 'BusFee', fee.id, 'CREATE_BUS_FEE', {
        kind: data.kind, dueDate: data.dueDate, oneWayAmount: data.oneWayAmount, twoWayAmount: data.twoWayAmount
    });
    return shapeFee(fee);
}

export async function updateBusFee(schoolId, id, data, actor = {}) {
    needTenant(schoolId, 'update bus fee');
    const existing = await repo.findBusFeeById(schoolId, id);
    if (!existing) throw new NotFoundError('Fee entry not found in active school');
    await validateFeeTarget(schoolId, data, id);
    const fee = await repo.updateBusFee(schoolId, id, data);
    audit(schoolId, actor, 'BusFee', id, 'UPDATE_BUS_FEE', data);
    return shapeFee(fee);
}

export async function deleteBusFee(schoolId, id, actor = {}) {
    needTenant(schoolId, 'delete bus fee');
    const existing = await repo.findBusFeeById(schoolId, id);
    if (!existing) throw new NotFoundError('Fee entry not found in active school');
    await repo.deleteBusFee(schoolId, id);
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
    });

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
    await repo.clearMapping(schoolId, studentId);
    audit(schoolId, actor, 'StudentTransportAssignment', studentId, 'UNMAP_STUDENT_BUS', {
        previousRouteId: student.transportRouteId
    });
    return { message: 'Student unmapped successfully', id: studentId };
}
