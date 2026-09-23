import { Router } from 'express';
import * as transportController from './transport.controller.js';
import * as transportSchemas from './transport.schemas.js';
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

export default router;
