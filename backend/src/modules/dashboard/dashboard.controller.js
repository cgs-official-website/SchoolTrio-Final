import * as dashboardService from './dashboard.service.js';

/**
 * Controller to generate intelligent, permission-aware AI briefing for the active authenticated user.
 */
export async function getAiBriefing(req, res, next) {
  try {
    const schoolId = req.schoolId;
    const user = req.user;
    const clientContext = req.body || {};

    const briefing = await dashboardService.generateBriefing(schoolId, user, clientContext);

    return res.status(200).json({
      success: true,
      data: briefing
    });
  } catch (error) {
    next(error);
  }
}

