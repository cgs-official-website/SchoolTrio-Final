import * as auditService from './audit.service.js';
import { ApiResponse } from '../../utils/api-response.js';

/**
 * Controller: Get paginated audit logs for the authenticated tenant.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const getTenantAuditLogs = async (req, res, next) => {
  try {
    const schoolId = req.tenant?.schoolId;
    const result = await auditService.getTenantAuditLogs(schoolId, req.query);
    return ApiResponse.paginated(res, result.logs, result.pagination);
  } catch (err) {
    next(err);
  }
};

/**
 * Controller: Get paginated global audit logs across all tenants for SuperAdmin.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const getSuperAdminAuditLogs = async (req, res, next) => {
  try {
    const result = await auditService.getGlobalAuditLogs(req.query);
    return ApiResponse.paginated(res, result.logs, result.pagination);
  } catch (err) {
    next(err);
  }
};
