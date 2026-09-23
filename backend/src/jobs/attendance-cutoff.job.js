import { logger } from '../utils/logger.js';

/**
 * Attendance Cutoff Background Job (Phase 4A Interface Contract)
 *
 * CRITICAL SAFETY INVARIANT (Phase 4A):
 * - Does NOT start an active cron schedule.
 * - Does NOT mutate or update any attendance records.
 * - Does NOT run automatically on application startup.
 *
 * Full scheduled execution will be implemented in the dedicated Attendance module phase.
 */

export const attendanceCutoffJob = {
  name: 'attendance-cutoff',
  description: 'Evaluates daily attendance cutoff thresholds per school timezone',

  /**
   * Job execution handler (Inactive in Phase 4A)
   * @param {Object} [options]
   * @returns {Promise<{ status: string, processedSchools: number }>}
   */
  async execute(_options = {}) {
    logger.info('[JOB: attendance-cutoff] Job interface invoked (Phase 4A: Inactive execution stub)');
    return {
      status: 'skipped',
      processedSchools: 0,
      phase: 'Phase 4A Foundation Boundary'
    };
  }
};
