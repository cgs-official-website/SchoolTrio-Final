import * as transportService from './transport.service.js';

// ============================================================
// VEHICLE CONTROLLER
// ============================================================

export async function listVehicles(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const vehicles = await transportService.listVehicles(schoolId, req.query);
    res.status(200).json({
      status: 'success',
      data: vehicles
    });
  } catch (err) {
    next(err);
  }
}

export async function getVehicleById(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const { id } = req.params;
    const vehicle = await transportService.getVehicleById(schoolId, id);
    res.status(200).json({
      status: 'success',
      data: vehicle
    });
  } catch (err) {
    next(err);
  }
}

export async function createVehicle(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const actor = req.auth || req.user;
    const vehicle = await transportService.createVehicle(schoolId, req.body, actor);
    res.status(201).json({
      status: 'success',
      message: 'Vehicle registered successfully',
      data: vehicle
    });
  } catch (err) {
    next(err);
  }
}

export async function updateVehicle(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const { id } = req.params;
    const actor = req.auth || req.user;
    const vehicle = await transportService.updateVehicle(schoolId, id, req.body, actor);
    res.status(200).json({
      status: 'success',
      message: 'Vehicle updated successfully',
      data: vehicle
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteVehicle(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const { id } = req.params;
    const actor = req.auth || req.user;
    const result = await transportService.deleteVehicle(schoolId, id, actor);
    res.status(200).json({
      status: 'success',
      message: result.message,
      data: { id: result.id }
    });
  } catch (err) {
    next(err);
  }
}

// ============================================================
// ROUTE CONTROLLER
// ============================================================

export async function listRoutes(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const routes = await transportService.listRoutes(schoolId, req.query);
    res.status(200).json({
      status: 'success',
      data: routes
    });
  } catch (err) {
    next(err);
  }
}

export async function getRouteById(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const { id } = req.params;
    const route = await transportService.getRouteById(schoolId, id);
    res.status(200).json({
      status: 'success',
      data: route
    });
  } catch (err) {
    next(err);
  }
}

export async function createRoute(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const actor = req.auth || req.user;
    const route = await transportService.createRoute(schoolId, req.body, actor);
    res.status(201).json({
      status: 'success',
      message: 'Route created successfully',
      data: route
    });
  } catch (err) {
    next(err);
  }
}

export async function updateRoute(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const { id } = req.params;
    const actor = req.auth || req.user;
    const route = await transportService.updateRoute(schoolId, id, req.body, actor);
    res.status(200).json({
      status: 'success',
      message: 'Route updated successfully',
      data: route
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteRoute(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const { id } = req.params;
    const actor = req.auth || req.user;
    const result = await transportService.deleteRoute(schoolId, id, actor);
    res.status(200).json({
      status: 'success',
      message: result.message,
      data: { id: result.id }
    });
  } catch (err) {
    next(err);
  }
}

// ============================================================
// ROUTE STOP CONTROLLER
// ============================================================

export async function createRouteStop(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const { routeId } = req.params;
    const actor = req.auth || req.user;
    const stop = await transportService.createRouteStop(schoolId, routeId, req.body, actor);
    res.status(201).json({
      status: 'success',
      message: 'Route stop created successfully',
      data: stop
    });
  } catch (err) {
    next(err);
  }
}

export async function updateRouteStop(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const { id } = req.params;
    const actor = req.auth || req.user;
    const stop = await transportService.updateRouteStop(schoolId, id, req.body, actor);
    res.status(200).json({
      status: 'success',
      message: 'Route stop updated successfully',
      data: stop
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteRouteStop(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const { id } = req.params;
    const actor = req.auth || req.user;
    const result = await transportService.deleteRouteStop(schoolId, id, actor);
    res.status(200).json({
      status: 'success',
      message: result.message,
      data: { id: result.id }
    });
  } catch (err) {
    next(err);
  }
}

// ============================================================
// STUDENT TRANSPORT ASSIGNMENT CONTROLLER
// ============================================================

export async function listStudentAssignments(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const actor = req.auth || req.user;
    const assignments = await transportService.listStudentAssignments(schoolId, req.query, actor);
    res.status(200).json({
      status: 'success',
      data: assignments
    });
  } catch (err) {
    next(err);
  }
}

export async function assignStudentToRoute(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const { routeId } = req.params;
    const actor = req.auth || req.user;
    const assignment = await transportService.assignStudentToRoute(schoolId, routeId, req.body, actor);
    res.status(200).json({
      status: 'success',
      message: 'Student assigned to route successfully',
      data: assignment
    });
  } catch (err) {
    next(err);
  }
}

export async function unassignStudentFromRoute(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const { routeId } = req.params;
    const actor = req.auth || req.user;
    const student = await transportService.unassignStudentFromRoute(schoolId, routeId, req.body, actor);
    res.status(200).json({
      status: 'success',
      message: 'Student unassigned from route successfully',
      data: student
    });
  } catch (err) {
    next(err);
  }
}
