import * as auditService from './audit.service.js';
import { ApiResponse } from '../../utils/api-response.js';
import { TenantAccessError } from '../../utils/app-error.js';

/**
 * Controller: Get paginated audit logs for the authenticated tenant.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const getTenantAuditLogs = async (req, res, next) => {
  try {
    const schoolId = req.schoolId || req.tenant?.schoolId;
    if (!schoolId) {
      throw new TenantAccessError('Tenant context required: active school association is missing');
    }
    const result = await auditService.getTenantAuditLogs(schoolId, req.query);
    return res.status(200).json({
      success: true,
      data: result.logs,
      pagination: {
        ...result.pagination,
        summary: result.summary
      },
      summary: result.summary
    });
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
    return res.status(200).json({
      success: true,
      data: result.logs,
      pagination: {
        ...result.pagination,
        summary: result.summary
      },
      summary: result.summary
    });
  } catch (err) {
    next(err);
  }
};
