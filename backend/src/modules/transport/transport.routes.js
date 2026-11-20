import { Router } from 'express';
import * as transportController from './transport.controller.js';
import * as transportSchemas from './transport.schemas.js';
import * as v2Controller from './transport.v2.controller.js';
import * as v2Schemas from './transport.v2.schemas.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantContext } from '../../middleware/tenant.middleware.js';
import { requirePermission } from '../../middleware/rbac.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { SYSTEM_ROLES } from '../../config/constants.js';

/**
 * Custom Authorization Gate for Reading Transport:
 * Allows institutional staff with 'transport.read' OR authenticated teachers/parents/students (scoped in service).
 */
export const requireTransportReadOrCustody = (req, res, next) => {
  const user = req.auth || req.user;
  const role = (user?.systemRole || user?.role || '').toUpperCase();
  if (
    role === SYSTEM_ROLES.PARENT ||
    role === 'PARENT' ||
    role === SYSTEM_ROLES.STUDENT ||
    role === 'STUDENT' ||
    role === SYSTEM_ROLES.TEACHER ||
    role === 'TEACHER' ||
    user?.loginPanel === 'teacher'
  ) {
    return next();
  }
  return requirePermission('transport', 'read')(req, res, next);
};

const router = Router();

// ============================================================
// VEHICLE ROUTES
// ============================================================

router.get(
  '/vehicles',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('transport', 'read'),
  validate(transportSchemas.listVehiclesSchema),
  transportController.listVehicles
);

router.get(
  '/vehicles/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('transport', 'read'),
  validate(transportSchemas.vehicleIdParamSchema),
  transportController.getVehicleById
);

router.post(
  '/vehicles',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('transport', 'create'),
  validate(transportSchemas.createVehicleSchema),
  transportController.createVehicle
);

router.patch(
  '/vehicles/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('transport', 'edit'),
  validate(transportSchemas.updateVehicleSchema),
  transportController.updateVehicle
);

router.delete(
  '/vehicles/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('transport', 'delete'),
  validate(transportSchemas.vehicleIdParamSchema),
  transportController.deleteVehicle
);

// ============================================================
// ROUTE ROUTES
// ============================================================

router.get(
  '/routes',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireTransportReadOrCustody,
  validate(transportSchemas.listRoutesSchema),
  transportController.listRoutes
);

router.get(
  '/routes/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireTransportReadOrCustody,
  validate(transportSchemas.routeIdParamSchema),
  transportController.getRouteById
);

router.post(
  '/routes',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('transport', 'create'),
  validate(transportSchemas.createRouteSchema),
  transportController.createRoute
);

router.patch(
  '/routes/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('transport', 'edit'),
  validate(transportSchemas.updateRouteSchema),
  transportController.updateRoute
);

router.delete(
  '/routes/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('transport', 'delete'),
  validate(transportSchemas.routeIdParamSchema),
  transportController.deleteRoute
);

// ============================================================
// ROUTE STOP ROUTES
// ============================================================

router.post(
  '/routes/:routeId/stops',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('transport', 'create'),
  validate(transportSchemas.createStopSchema),
  transportController.createRouteStop
);

router.patch(
  '/stops/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('transport', 'edit'),
  validate(transportSchemas.updateStopSchema),
  transportController.updateRouteStop
);

router.delete(
  '/stops/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('transport', 'delete'),
  validate(transportSchemas.stopIdParamSchema),
  transportController.deleteRouteStop
);

// ============================================================
// STUDENT TRANSPORT ASSIGNMENT ROUTES
// ============================================================

router.get(
  '/assignments',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireTransportReadOrCustody,
  validate(transportSchemas.listAssignmentsSchema),
  transportController.listStudentAssignments
);

router.post(
  '/routes/:routeId/assign',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('transport', 'edit'),
  validate(transportSchemas.assignStudentSchema),
  transportController.assignStudentToRoute
);

router.post(
  '/routes/:routeId/unassign',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('transport', 'edit'),
  validate(transportSchemas.unassignStudentSchema),
  transportController.unassignStudentFromRoute
);

// ============================================================
// TRANSPORT V2 (additive): BUS STOPS, BUS FEES, STUDENT MAPPINGS
// ============================================================

// Parent / student: transport details (bus, stop, distance, fee) of their own children
router.get(
  '/my-transport',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireTransportReadOrCustody,
  validate(v2Schemas.myTransportSchema),
  v2Controller.getMyTransport
);

router.get(
  '/bus-stops',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('transport', 'read'),
  validate(v2Schemas.listBusStopsSchema),
  v2Controller.listBusStops
);

router.get(
  '/slabs',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('transport', 'read'),
  validate(v2Schemas.listBusStopsSchema),
  v2Controller.listSlabNames
);

router.get(
  '/bus-stops/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('transport', 'read'),
  validate(v2Schemas.busStopIdParamSchema),
  v2Controller.getBusStop
);

router.post(
  '/bus-stops',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('transport', 'create'),
  validate(v2Schemas.createBusStopSchema),
  v2Controller.createBusStop
);

router.patch(
  '/bus-stops/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('transport', 'edit'),
  validate(v2Schemas.updateBusStopSchema),
  v2Controller.updateBusStop
);

router.delete(
  '/bus-stops/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('transport', 'delete'),
  validate(v2Schemas.busStopIdParamSchema),
  v2Controller.deleteBusStop
);

router.get(
  '/fees',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('transport', 'read'),
  validate(v2Schemas.listBusFeesSchema),
  v2Controller.listBusFees
);

router.get(
  '/fees/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('transport', 'read'),
  validate(v2Schemas.busFeeIdParamSchema),
  v2Controller.getBusFee
);

router.post(
  '/fees/sync-invoices',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('transport', 'edit'),
  v2Controller.syncTransportInvoices
);

router.post(
  '/fees',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('transport', 'create'),
  validate(v2Schemas.createBusFeeSchema),
  v2Controller.createBusFee
);

router.patch(
  '/fees/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('transport', 'edit'),
  validate(v2Schemas.updateBusFeeSchema),
  v2Controller.updateBusFee
);

router.delete(
  '/fees/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('transport', 'delete'),
  validate(v2Schemas.busFeeIdParamSchema),
  v2Controller.deleteBusFee
);

router.post(
  '/mappings',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('transport', 'create'),
  validate(v2Schemas.createMappingSchema),
  v2Controller.createMappings
);

router.patch(
  '/mappings/:studentId',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('transport', 'edit'),
  validate(v2Schemas.updateMappingSchema),
  v2Controller.updateMapping
);

router.delete(
  '/mappings/:studentId',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('transport', 'edit'),
  validate(v2Schemas.mappingStudentParamSchema),
  v2Controller.deleteMapping
);

export default router;
