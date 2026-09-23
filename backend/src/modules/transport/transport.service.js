import * as transportRepository from './transport.repository.js';
import { createAuditLog } from '../audit/audit.repository.js';
import { SYSTEM_ROLES } from '../../config/constants.js';
import {
  TenantAccessError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
  ValidationError
} from '../../utils/app-error.js';
import { normalizeRegistrationNumber, normalizePhoneNumber } from './transport.schemas.js';

/**
 * Checks if actor is a Parent.
 */
function isParent(actor) {
  const role = (actor?.systemRole || actor?.role || '').toUpperCase();
  return role === SYSTEM_ROLES.PARENT || role === 'PARENT';
}

/**
 * Checks if actor is a Student.
 */
function isStudent(actor) {
  const role = (actor?.systemRole || actor?.role || '').toUpperCase();
  return role === SYSTEM_ROLES.STUDENT || role === 'STUDENT';
}

/**
 * Checks if actor is a Teacher.
 */
function isTeacher(actor) {
  const role = (actor?.systemRole || actor?.role || '').toUpperCase();
  return role === SYSTEM_ROLES.TEACHER || role === 'TEACHER' || actor?.loginPanel === 'teacher';
}

/**
 * Resolves teacher StaffProfile and verifies active status.
 */
async function resolveTeacherProfile(schoolId, actor, tx) {
  const userId = actor?.id || actor?.userId;
  if (!userId) {
    throw new ForbiddenError('Authenticated user ID missing');
  }

  const profile = await transportRepository.findStaffProfileByUserId(schoolId, userId, tx);
  if (!profile) {
    throw new ForbiddenError('Staff profile not found for authenticated teacher');
  }

  if (profile.user?.isActive === false || profile.status === 'Inactive') {
    throw new ForbiddenError('Teacher account is deactivated or inactive');
  }

  return profile;
}

// ============================================================
// VEHICLE SERVICE OPERATIONS
// ============================================================

export async function listVehicles(schoolId, query = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to list vehicles');
  }
  return transportRepository.findVehicles(schoolId, query);
}

export async function getVehicleById(schoolId, id) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to get vehicle');
  }
  const vehicle = await transportRepository.findVehicleById(schoolId, id);
  if (!vehicle) {
    throw new NotFoundError('Vehicle not found in active school');
  }
  return vehicle;
}

export async function createVehicle(schoolId, data, actor = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to create vehicle');
  }

  const normalizedReg = normalizeRegistrationNumber(data.registrationNumber);
  const existing = await transportRepository.findVehicleByRegistrationNumber(schoolId, normalizedReg);
  if (existing) {
    throw new ConflictError(`Vehicle with registration number '${normalizedReg}' already exists in this school`);
  }

  const vehicle = await transportRepository.createVehicle(schoolId, {
    ...data,
    registrationNumber: normalizedReg
  });

  createAuditLog({
    schoolId,
    entityType: 'TransportVehicle',
    entityId: vehicle.id,
    actionPerformed: 'CREATE_TRANSPORT_VEHICLE',
    userName: actor?.name || actor?.email || 'Administrator',
    userRole: actor?.role || actor?.systemRole || null,
    modifiedFields: {
      registrationNumber: vehicle.registrationNumber,
      capacity: vehicle.capacity,
      status: vehicle.status
    }
  }).catch(() => {});

  return vehicle;
}

export async function updateVehicle(schoolId, id, data, actor = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to update vehicle');
  }

  const existing = await transportRepository.findVehicleById(schoolId, id);
  if (!existing) {
    throw new NotFoundError('Vehicle not found in active school');
  }

  let updatePayload = { ...data };
  if (data.registrationNumber !== undefined) {
    const normalizedReg = normalizeRegistrationNumber(data.registrationNumber);
    const duplicate = await transportRepository.findVehicleByRegistrationNumber(schoolId, normalizedReg, id);
    if (duplicate) {
      throw new ConflictError(`Vehicle with registration number '${normalizedReg}' already exists in this school`);
    }
    updatePayload.registrationNumber = normalizedReg;
  }

  const updated = await transportRepository.updateVehicle(schoolId, id, updatePayload);

  createAuditLog({
    schoolId,
    entityType: 'TransportVehicle',
    entityId: updated.id,
    actionPerformed: 'UPDATE_TRANSPORT_VEHICLE',
    userName: actor?.name || actor?.email || 'Administrator',
    userRole: actor?.role || actor?.systemRole || null,
    modifiedFields: data
  }).catch(() => {});

  return updated;
}

export async function deleteVehicle(schoolId, id, actor = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to delete vehicle');
  }

  const existing = await transportRepository.findVehicleById(schoolId, id);
  if (!existing) {
    throw new NotFoundError('Vehicle not found in active school');
  }

  await transportRepository.deleteVehicle(schoolId, id);

  createAuditLog({
    schoolId,
    entityType: 'TransportVehicle',
    entityId: id,
    actionPerformed: 'DELETE_TRANSPORT_VEHICLE',
    userName: actor?.name || actor?.email || 'Administrator',
    userRole: actor?.role || actor?.systemRole || null,
    modifiedFields: {
      deletedRegistrationNumber: existing.registrationNumber
    }
  }).catch(() => {});

  return { message: 'Vehicle deleted successfully', id };
}

// ============================================================
// ROUTE SERVICE OPERATIONS
// ============================================================

export async function listRoutes(schoolId, query = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to list routes');
  }
  return transportRepository.findRoutes(schoolId, query);
}

export async function getRouteById(schoolId, id) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to get route');
  }
  const route = await transportRepository.findRouteById(schoolId, id);
  if (!route) {
    throw new NotFoundError('Route not found in active school');
  }
  return route;
}

export async function createRoute(schoolId, data, actor = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to create route');
  }

  // Verify vehicle exists in tenant if supplied
  if (data.vehicleId) {
    const vehicle = await transportRepository.findVehicleById(schoolId, data.vehicleId);
    if (!vehicle) {
      throw new NotFoundError('Vehicle not found in active school');
    }
  }

  const cleanPhone = data.driverPhone ? normalizePhoneNumber(data.driverPhone) : null;

  const route = await transportRepository.createRoute(schoolId, {
    ...data,
    driverPhone: cleanPhone
  });

  createAuditLog({
    schoolId,
    entityType: 'TransportRoute',
    entityId: route.id,
    actionPerformed: 'CREATE_TRANSPORT_ROUTE',
    userName: actor?.name || actor?.email || 'Administrator',
    userRole: actor?.role || actor?.systemRole || null,
    modifiedFields: {
      name: route.name,
      capacity: route.capacity,
      vehicleId: route.vehicleId,
      driverName: route.driverName
    }
  }).catch(() => {});

  return route;
}

export async function updateRoute(schoolId, id, data, actor = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to update route');
  }

  const existing = await transportRepository.findRouteById(schoolId, id);
  if (!existing) {
    throw new NotFoundError('Route not found in active school');
  }

  if (data.vehicleId && data.vehicleId !== existing.vehicleId) {
    const vehicle = await transportRepository.findVehicleById(schoolId, data.vehicleId);
    if (!vehicle) {
      throw new NotFoundError('Vehicle not found in active school');
    }
  }

  const updatePayload = { ...data };
  if (data.driverPhone !== undefined) {
    updatePayload.driverPhone = data.driverPhone ? normalizePhoneNumber(data.driverPhone) : null;
  }

  const updated = await transportRepository.updateRoute(schoolId, id, updatePayload);

  createAuditLog({
    schoolId,
    entityType: 'TransportRoute',
    entityId: updated.id,
    actionPerformed: 'UPDATE_TRANSPORT_ROUTE',
    userName: actor?.name || actor?.email || 'Administrator',
    userRole: actor?.role || actor?.systemRole || null,
    modifiedFields: data
  }).catch(() => {});

  return updated;
}

export async function deleteRoute(schoolId, id, actor = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to delete route');
  }

  const existing = await transportRepository.findRouteById(schoolId, id);
  if (!existing) {
    throw new NotFoundError('Route not found in active school');
  }

  await transportRepository.deleteRoute(schoolId, id);

  createAuditLog({
    schoolId,
    entityType: 'TransportRoute',
    entityId: id,
    actionPerformed: 'DELETE_TRANSPORT_ROUTE',
    userName: actor?.name || actor?.email || 'Administrator',
    userRole: actor?.role || actor?.systemRole || null,
    modifiedFields: {
      deletedRouteName: existing.name
    }
  }).catch(() => {});

  return { message: 'Route deleted successfully', id };
}

// ============================================================
// ROUTE STOP SERVICE OPERATIONS
// ============================================================

export async function createRouteStop(schoolId, routeId, data, actor = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to create stop');
  }

  const route = await transportRepository.findRouteById(schoolId, routeId);
  if (!route) {
    throw new NotFoundError('Route not found in active school');
  }

  const stop = await transportRepository.createRouteStop(schoolId, routeId, data);

  createAuditLog({
    schoolId,
    entityType: 'RouteStop',
    entityId: stop.id,
    actionPerformed: 'CREATE_ROUTE_STOP',
    userName: actor?.name || actor?.email || 'Administrator',
    userRole: actor?.role || actor?.systemRole || null,
    modifiedFields: {
      routeId,
      stopName: stop.stopName,
      pickupTime: stop.pickupTime
    }
  }).catch(() => {});

  return stop;
}

export async function updateRouteStop(schoolId, id, data, actor = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to update stop');
  }

  const existing = await transportRepository.findStopById(schoolId, id);
  if (!existing) {
    throw new NotFoundError('Route stop not found in active school');
  }

  const updated = await transportRepository.updateRouteStop(schoolId, id, data);

  createAuditLog({
    schoolId,
    entityType: 'RouteStop',
    entityId: updated.id,
    actionPerformed: 'UPDATE_ROUTE_STOP',
    userName: actor?.name || actor?.email || 'Administrator',
    userRole: actor?.role || actor?.systemRole || null,
    modifiedFields: data
  }).catch(() => {});

  return updated;
}

export async function deleteRouteStop(schoolId, id, actor = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to delete stop');
  }

  const existing = await transportRepository.findStopById(schoolId, id);
  if (!existing) {
    throw new NotFoundError('Route stop not found in active school');
  }

  await transportRepository.deleteRouteStop(schoolId, id);

  createAuditLog({
    schoolId,
    entityType: 'RouteStop',
    entityId: id,
    actionPerformed: 'DELETE_ROUTE_STOP',
    userName: actor?.name || actor?.email || 'Administrator',
    userRole: actor?.role || actor?.systemRole || null,
    modifiedFields: {
      deletedStopName: existing.stopName
    }
  }).catch(() => {});

  return { message: 'Route stop deleted successfully', id };
}

// ============================================================
// STUDENT TRANSPORT ASSIGNMENT SERVICE OPERATIONS
// ============================================================

export async function listStudentAssignments(schoolId, query = {}, actor = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to list assignments');
  }

  const filterOptions = { ...query };

  // 1. Parent Scope Enforcement
  if (isParent(actor)) {
    const userId = actor.id || actor.userId;
    const authorizedStudentIds = await transportRepository.findAuthorizedStudentIdsForParent(schoolId, userId);
    if (authorizedStudentIds.length === 0) {
      return [];
    }
    const allAssignments = await transportRepository.findStudentAssignments(schoolId, filterOptions);
    return allAssignments.filter(a => authorizedStudentIds.includes(a.id));
  }

  // 2. Student Scope Enforcement
  if (isStudent(actor)) {
    const userId = actor.id || actor.userId;
    const student = await transportRepository.findStudentByUserId(schoolId, userId);
    if (!student || !student.transportRouteId) {
      return [];
    }
    const allAssignments = await transportRepository.findStudentAssignments(schoolId, filterOptions);
    return allAssignments.filter(a => a.id === student.id);
  }

  // 3. Teacher Scope Enforcement
  if (isTeacher(actor) && !actor.hasPermission) {
    const profile = await resolveTeacherProfile(schoolId, actor);
    if (profile.assignedClassId) {
      filterOptions.classId = profile.assignedClassId;
    }
  }

  return transportRepository.findStudentAssignments(schoolId, filterOptions);
}

/**
 * Assigns a student to a route with serialized transaction & capacity check.
 */
export async function assignStudentToRoute(schoolId, routeId, data, actor = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to assign student');
  }

  const { studentId, pickupStopId } = data;

  // Execute inside serialized transaction to prevent capacity races
  const updatedStudent = await transportRepository.runTransaction(async (tx) => {
    // 1. Lock route row for update to serialize competing assignments
    let route;
    try {
      route = await transportRepository.lockRouteForUpdate(schoolId, routeId, tx);
    } catch {
      // Fallback to transactional find if locking raw query is unavailable
      route = await tx.transportRoute.findFirst({
        where: { schoolId, id: routeId }
      });
    }

    if (!route) {
      throw new NotFoundError('Route not found in active school');
    }

    // 2. Verify student exists in tenant
    const student = await transportRepository.findStudentInTenant(schoolId, studentId, tx);
    if (!student) {
      throw new NotFoundError('Student not found in active school');
    }

    // 3. Verify pickupStop if provided
    if (pickupStopId) {
      const stop = await tx.routeStop.findFirst({
        where: { schoolId, routeId, id: pickupStopId }
      });
      if (!stop) {
        throw new NotFoundError('Pickup stop not found on this route');
      }
    }

    // 4. Check capacity: only increment if student is moving from another route or unassigned
    const isAlreadyOnThisRoute = student.transportRouteId === routeId;
    if (!isAlreadyOnThisRoute) {
      const currentCount = await transportRepository.countStudentsOnRoute(schoolId, routeId, tx);
      if (currentCount >= route.capacity) {
        throw new ConflictError(`Cannot assign student: route '${route.name}' has reached its maximum capacity of ${route.capacity}`);
      }
    }

    // 5. Update student assignment
    return transportRepository.assignStudentToRoute(schoolId, studentId, routeId, pickupStopId, tx);
  });

  createAuditLog({
    schoolId,
    entityType: 'StudentTransportAssignment',
    entityId: studentId,
    actionPerformed: 'ASSIGN_STUDENT_TRANSPORT',
    userName: actor?.name || actor?.email || 'Administrator',
    userRole: actor?.role || actor?.systemRole || null,
    modifiedFields: {
      studentId,
      routeId,
      pickupStopId
    }
  }).catch(() => {});

  return updatedStudent;
}

/**
 * Unassigns a student from a route.
 */
export async function unassignStudentFromRoute(schoolId, routeId, data, actor = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to unassign student');
  }

  const { studentId } = data;

  const student = await transportRepository.findStudentInTenant(schoolId, studentId);
  if (!student) {
    throw new NotFoundError('Student not found in active school');
  }

  if (student.transportRouteId !== routeId) {
    throw new ValidationError('Student is not assigned to this route');
  }

  const updatedStudent = await transportRepository.unassignStudentFromRoute(schoolId, studentId);

  createAuditLog({
    schoolId,
    entityType: 'StudentTransportAssignment',
    entityId: studentId,
    actionPerformed: 'UNASSIGN_STUDENT_TRANSPORT',
    userName: actor?.name || actor?.email || 'Administrator',
    userRole: actor?.role || actor?.systemRole || null,
    modifiedFields: {
      studentId,
      previousRouteId: routeId
    }
  }).catch(() => {});

  return updatedStudent;
}
