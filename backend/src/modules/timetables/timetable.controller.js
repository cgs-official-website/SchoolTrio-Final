import * as timetableService from './timetable.service.js';

/**
 * Controller: Lists timetable periods matching query filters.
 * GET /api/v1/timetables
 */
export async function listTimetables(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const actor = req.auth || req.user;
    const periods = await timetableService.listTimetables(schoolId, req.query, actor);

    res.status(200).json({
      status: 'success',
      data: periods
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Controller: Gets structured weekly timetable for a specific class.
 * GET /api/v1/timetables/classes/:classId
 */
export async function getClassTimetable(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const { classId } = req.params;
    const actor = req.auth || req.user;

    const classTimetable = await timetableService.getClassTimetable(schoolId, classId, actor);

    res.status(200).json({
      status: 'success',
      data: classTimetable
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Controller: Atomically replaces the entire weekly timetable for a class.
 * PUT /api/v1/timetables/classes/:classId
 */
export async function replaceClassTimetable(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const { classId } = req.params;
    const actor = req.auth || req.user;

    const result = await timetableService.replaceClassTimetable(schoolId, classId, req.body, actor);

    res.status(200).json({
      status: 'success',
      message: 'Class timetable updated successfully',
      data: result
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Controller: Creates a single timetable period.
 * POST /api/v1/timetables
 */
export async function createTimetablePeriod(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const actor = req.auth || req.user;

    const period = await timetableService.createTimetablePeriod(schoolId, req.body, actor);

    res.status(201).json({
      status: 'success',
      message: 'Timetable period created successfully',
      data: period
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Controller: Updates a single timetable period.
 * PATCH /api/v1/timetables/:id
 */
export async function updateTimetablePeriod(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const { id } = req.params;
    const actor = req.auth || req.user;

    const period = await timetableService.updateTimetablePeriod(schoolId, id, req.body, actor);

    res.status(200).json({
      status: 'success',
      message: 'Timetable period updated successfully',
      data: period
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Controller: Deletes a single timetable period.
 * DELETE /api/v1/timetables/:id
 */
export async function deleteTimetablePeriod(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const { id } = req.params;
    const actor = req.auth || req.user;

    const result = await timetableService.deleteTimetablePeriod(schoolId, id, actor);

    res.status(200).json({
      status: 'success',
      message: result.message,
      data: { id: result.id }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Controller: Returns the authenticated teacher's timetable schedule.
 * GET /api/v1/timetables/my-schedule
 */
export async function getMySchedule(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const actor = req.auth || req.user;

    const schedule = await timetableService.getMySchedule(schoolId, actor);

    res.status(200).json({
      status: 'success',
      data: schedule
    });
  } catch (err) {
    next(err);
  }
}
