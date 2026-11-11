/**
 * src/utils/access-scope.js
 *
 * Central, role-driven access context. Replaces per-module hard-coded role lists.
 *
 * A user "has admin-panel scope" when ANY of their assigned school roles has
 * loginPanel === 'admin' (set in Roles & Permissions -> Login Panel).
 *
 * Meaning:
 *  - Admin-panel roles (Correspondent, Principal, Grade Co-ordinator, ...) see school-wide data
 *    in every module the role grants (the module permission itself still gates read / create /
 *    edit / delete at the route level).
 *  - Teacher-panel roles (Staffs, Class Incharge, ...) keep their own-class / own-record scope.
 *
 * `requirePermission` computes this once per request and attaches it to req.user / req.auth, so
 * services can read it synchronously with hasAdminPanelScope(actor).
 */

import * as rbacRepository from '../modules/rbac/rbac.repository.js';
import { RedisCacheService } from '../services/redis-cache.service.js';

const ACCESS_CONTEXT_TTL_SECONDS = 120;

// Lives under the `rbac:perms:{schoolId}:` prefix, so every role-level permission change
// (which clears `rbac:perms:{schoolId}:*`) clears this cache as well.
export const accessContextCacheKey = (schoolId, userId) => `rbac:perms:${schoolId}:ctx:${userId}`;

/**
 * @returns {Promise<{ hasAnyRole: boolean, hasAdminPanelRole: boolean }>}
 */
export async function getAccessContext(schoolId, userId) {
    const cacheKey = accessContextCacheKey(schoolId, userId);

    try {
        const cached = await RedisCacheService.get(cacheKey);
        if (cached && typeof cached === 'object' && typeof cached.hasAnyRole === 'boolean') {
            return cached;
        }
    } catch (_err) {
        // Fail open to DB query
    }

    const assignments = await rbacRepository.findUserRoleAssignments(schoolId, userId);
    const context = {
        hasAnyRole: assignments.length > 0,
        hasAdminPanelRole: assignments.some(
            (a) => String(a.schoolRole?.loginPanel || '').toLowerCase() === 'admin'
        )
    };

    try {
        await RedisCacheService.set(cacheKey, context, ACCESS_CONTEXT_TTL_SECONDS);
    } catch (_err) {
        // Non-blocking on cache write failure
    }

    return context;
}

/** Attaches the access context to the request user objects that services receive as `actor`. */
export function applyAccessContext(req, context) {
    for (const target of [req.auth, req.user]) {
        if (target && typeof target === 'object') {
            target.hasAnyRole = context.hasAnyRole;
            target.hasAdminPanelRole = context.hasAdminPanelRole;
        }
    }
}

/** Synchronous check for services: true when the actor holds an admin-panel role. */
export function hasAdminPanelScope(actor) {
    return actor?.hasAdminPanelRole === true;
}