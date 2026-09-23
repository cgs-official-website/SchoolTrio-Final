import { TenantAccessError } from '../utils/app-error.js';
import { runWithTenantContext } from '../database/prisma.client.js';
import { SYSTEM_ROLES, REGEX } from '../config/constants.js';
import * as authRepository from '../modules/auth/auth.repository.js';

/**
 * Multi-Tenant Context Resolution & Isolation Middleware (Phase 4B.3 Implementation)
 *
 * Security Invariants:
 * 1. The authenticated user's authoritative PostgreSQL record determines tenant identity.
 * 2. `req.body.schoolId`, `req.query.schoolId`, and `req.params.schoolId` are NEVER trusted to establish tenant.
 * 3. Normal users presenting an `X-Tenant-Id` or `X-School-Id` header different from their own are strictly rejected with 403.
 * 4. SuperAdmin users (`systemRole === 'SUPER_ADMIN'`) may switch tenant context via `X-Tenant-Id` ONLY after:
 *    - Validating UUID format.
 *    - Verifying the target school exists in PostgreSQL.
 * 5. Downstream execution is bound to AsyncLocalStorage via `runWithTenantContext`.
 */

/**
 * Tenant resolution middleware for tenant-scoped routes.
 *
 * @param {Object} [options]
 * @param {boolean} [options.requireTenant=true] - Whether tenant context is mandatory for this route
 * @returns {import('express').RequestHandler}
 */
export const tenantContext = (options = { requireTenant: true }) => {
  return async (req, _res, next) => {
    try {
      const user = req.auth || req.user;

      if (!user) {
        if (options.requireTenant) {
          throw new TenantAccessError('Tenant context required: unauthenticated request');
        }
        return next();
      }

      const isSuperAdmin =
        user.systemRole === SYSTEM_ROLES.SUPER_ADMIN ||
        user.role === SYSTEM_ROLES.SUPER_ADMIN ||
        user.roles?.includes(SYSTEM_ROLES.SUPER_ADMIN);

      const headerTenantId = req.headers['x-tenant-id'] || req.headers['x-school-id'];

      // 1. Super Admin Tenant Handling
      if (isSuperAdmin) {
        if (!headerTenantId) {
          // SuperAdmin without tenant switch -> Global platform context (bypassTenant: true)
          const context = {
            schoolId: null,
            userId: user.userId || user.id,
            role: SYSTEM_ROLES.SUPER_ADMIN,
            bypassTenant: true
          };

          req.tenant = {
            schoolId: null,
            isSuperAdminSwitch: false,
            bypassTenant: true
          };
          req.schoolId = null;

          return runWithTenantContext(context, () => next());
        }

        const targetSchoolId = String(headerTenantId).trim();

        // Validate UUID syntax
        if (!REGEX.UUID.test(targetSchoolId)) {
          throw new TenantAccessError('Invalid tenant identifier format: must be a valid UUID');
        }

        // Validate target school exists in PostgreSQL
        const targetSchool = await authRepository.findSchoolById(targetSchoolId);
        if (!targetSchool) {
          throw new TenantAccessError('Target school tenant not found');
        }

        const context = {
          schoolId: targetSchool.id,
          userId: user.userId || user.id,
          role: SYSTEM_ROLES.SUPER_ADMIN,
          bypassTenant: false
        };

        req.tenant = {
          schoolId: targetSchool.id,
          switchedBy: user.userId || user.id,
          isSuperAdminSwitch: true,
          school: targetSchool
        };
        req.schoolId = targetSchool.id;

        return runWithTenantContext(context, () => next());
      }

      // 2. Normal Tenant User Handling
      const schoolId = user.schoolId;

      if (!schoolId) {
        if (options.requireTenant) {
          throw new TenantAccessError(
            'Tenant context required: active school association is missing from authenticated identity'
          );
        }
        return next();
      }

      // Reject non-SuperAdmin attempting to use X-Tenant-Id or X-School-Id to switch tenants
      if (headerTenantId && String(headerTenantId).trim() !== schoolId) {
        throw new TenantAccessError(
          'Unauthorized tenant switch attempt: tenant switching is restricted to system administrators'
        );
      }

      // Prevent cross-tenant poisoning: Check for explicit conflicting schoolId in body, query, or params
      const candidateIds = [
        req.body?.schoolId,
        req.query?.schoolId,
        req.params?.schoolId
      ].filter(Boolean);

      for (const candidate of candidateIds) {
        if (candidate !== schoolId) {
          throw new TenantAccessError(
            `Cross-tenant access rejected: request parameter specifies schoolId '${candidate}' which conflicts with authenticated tenant '${schoolId}'`
          );
        }
      }

      // Bind tenant execution context for the remainder of the request lifecycle
      const context = {
        schoolId,
        userId: user.userId || user.id,
        role: user.systemRole || user.role,
        bypassTenant: false
      };

      req.tenant = {
        schoolId,
        isSuperAdminSwitch: false
      };
      req.schoolId = schoolId;

      return runWithTenantContext(context, () => next());
    } catch (err) {
      next(err);
    }
  };
};
