import { basePrisma } from '../database/prisma.client.js';
import {
  DEFAULT_ROLE_NAMES,
  DEFAULT_ROLES,
  slugifyRoleName,
  normalizePermissions
} from '../modules/rbac/rbac.constants.js';

/**
 * Standalone Firestore -> PostgreSQL RBAC Migration Tool
 *
 * Capabilities:
 * 1. Read-Only Firestore extraction of role definitions and staff role assignments.
 * 2. Dry-Run Mode: Performs 0 database writes, calculates all diffs and unresolved identities.
 * 3. Live Mode: Transactional, idempotent persistence into PostgreSQL SchoolRole, RolePermission, UserRoleAssignment.
 * 4. Resolves teacher.userId (Firebase UID) -> PostgreSQL User.legacyFirestoreId -> User.id.
 * 5. Strictly protects against fake user generation and cross-tenant leakage.
 */
export class RbacMigrator {
  /**
   * @param {Object} options
   * @param {Object} [options.prismaClient] - Prisma client instance
   * @param {Object} [options.firestoreDb] - Firestore database instance (from Firebase Admin)
   * @param {boolean} [options.dryRun=true] - Whether execution is dry-run (zero writes)
   */
  constructor(options = {}) {
    this.prisma = options.prismaClient || basePrisma;
    this.db = options.firestoreDb || null;
    this.dryRun = options.dryRun !== false;
  }

  /**
   * Runs the RBAC migration for a specific school tenant.
   *
   * @param {string} schoolIdentifier - School code (e.g. 'SchoolS024') or PostgreSQL School UUID
   * @returns {Promise<Object>} Comprehensive migration report
   */
  async migrateTenantRbac(schoolIdentifier) {
    if (!schoolIdentifier || typeof schoolIdentifier !== 'string') {
      throw new Error('Valid schoolIdentifier (code or UUID) is required for RBAC migration');
    }

    // 1. Resolve target school in PostgreSQL
    const targetSchool = await this.prisma.school.findFirst({
      where: {
        OR: [
          { id: schoolIdentifier.length === 36 ? schoolIdentifier : undefined },
          { code: schoolIdentifier },
          { legacyFirestoreId: schoolIdentifier }
        ].filter(Boolean)
      }
    });

    if (!targetSchool) {
      throw new Error(`Target school '${schoolIdentifier}' not found in PostgreSQL database`);
    }

    const schoolId = targetSchool.id;
    const schoolCode = targetSchool.code || targetSchool.legacyFirestoreId || schoolIdentifier;
    const firestoreSchoolDocId = targetSchool.legacyFirestoreId || targetSchool.code || schoolIdentifier;

    const report = {
      tenantId: schoolId,
      schoolCode,
      firestoreDocId: firestoreSchoolDocId,
      isDryRun: this.dryRun,
      timestamp: new Date().toISOString(),
      sourceRolesCount: 0,
      existingTargetRolesCount: 0,
      rolesToCreate: 0,
      rolesCreated: 0,
      rolesAlreadyMapped: 0,
      roleSlugConflicts: [],
      permissionsToUpsert: 0,
      permissionsUpserted: 0,
      teachersProcessed: 0,
      userAssignmentsToCreate: 0,
      userAssignmentsCreated: 0,
      userAssignmentsAlreadyMapped: 0,
      unresolvedUsers: [],
      unresolvedRoles: [],
      status: 'SUCCESS'
    };

    // 2. Query existing PostgreSQL roles for this tenant
    const existingRoles = await this.prisma.schoolRole.findMany({
      where: { schoolId },
      include: { permissions: true }
    });
    report.existingTargetRolesCount = existingRoles.length;
    const existingRoleSlugMap = new Map(existingRoles.map(r => [r.slug, r]));

    // 3. Extract roles from Firestore: schools/{firestoreSchoolDocId}/roles
    let firestoreRoles = [];
    if (this.db) {
      try {
        const rolesColRef = this.db.collection('schools').doc(firestoreSchoolDocId).collection('roles');
        const rolesSnap = await rolesColRef.get();
        firestoreRoles = rolesSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
      } catch (err) {
        console.warn(`[RBAC MIGRATOR] Could not read Firestore roles for ${firestoreSchoolDocId}:`, err.message);
      }
    }

    // If Firestore has no roles, seed institutional default roles if none exist
    if (firestoreRoles.length === 0 && existingRoles.length === 0) {
      firestoreRoles = DEFAULT_ROLES.map(r => ({
        id: r.name,
        name: r.name,
        loginPanel: r.loginPanel,
        isSystemDefault: true,
        permissions: {}
      }));
    }

    report.sourceRolesCount = firestoreRoles.length;

    // 4. Process Roles and Role Permissions
    const processedSlugs = new Set();
    const plannedRoleMutations = [];

    for (const sourceRole of firestoreRoles) {
      const roleName = String(sourceRole.name || sourceRole.id || '').trim();
      if (!roleName) continue;

      let slug;
      try {
        slug = slugifyRoleName(roleName);
      } catch (slugErr) {
        report.roleSlugConflicts.push({
          roleName,
          error: slugErr.message
        });
        continue;
      }

      if (processedSlugs.has(slug)) {
        report.roleSlugConflicts.push({
          roleName,
          slug,
          error: `Duplicate slug '${slug}' generated from multiple source roles`
        });
        continue;
      }
      processedSlugs.add(slug);

      const isSystemDefault = Boolean(
        sourceRole.isSystemDefault ?? DEFAULT_ROLE_NAMES.includes(roleName)
      );
      const loginPanel = sourceRole.loginPanel || 'admin';
      const normalizedPermissions = normalizePermissions(sourceRole.permissions);

      const existingRole = existingRoleSlugMap.get(slug);

      if (existingRole) {
        report.rolesAlreadyMapped++;
        plannedRoleMutations.push({
          action: 'UPDATE_PERMISSIONS_ONLY',
          roleId: existingRole.id,
          name: roleName,
          slug,
          loginPanel,
          isSystemDefault: existingRole.isSystemDefault,
          permissions: normalizedPermissions
        });
      } else {
        report.rolesToCreate++;
        plannedRoleMutations.push({
          action: 'CREATE_ROLE_AND_PERMISSIONS',
          name: roleName,
          slug,
          loginPanel,
          isSystemDefault,
          permissions: normalizedPermissions
        });
      }
    }

    // 5. Extract teachers and role assignments from Firestore: schools/{firestoreSchoolDocId}/teachers
    let firestoreTeachers = [];
    if (this.db) {
      try {
        const teachersColRef = this.db.collection('schools').doc(firestoreSchoolDocId).collection('teachers');
        const teachersSnap = await teachersColRef.get();
        firestoreTeachers = teachersSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
      } catch (err) {
        console.warn(`[RBAC MIGRATOR] Could not read Firestore teachers for ${firestoreSchoolDocId}:`, err.message);
      }
    }

    report.teachersProcessed = firestoreTeachers.length;

    // Fetch existing PostgreSQL Users and UserRoleAssignments for this tenant
    const tenantUsers = await this.prisma.user.findMany({
      where: { schoolId }
    });
    const userByLegacyUidMap = new Map();
    for (const u of tenantUsers) {
      if (u.legacyFirestoreId) {
        userByLegacyUidMap.set(u.legacyFirestoreId, u);
      }
    }

    const existingAssignments = await this.prisma.userRoleAssignment.findMany({
      where: { schoolId }
    });
    const existingAssignmentKeySet = new Set(
      existingAssignments.map(a => `${a.userId}_${a.schoolRoleId}`)
    );

    const plannedAssignments = [];

    for (const teacher of firestoreTeachers) {
      const firebaseUid = teacher.userId || teacher.id;
      if (!firebaseUid) continue;

      const targetUser = userByLegacyUidMap.get(firebaseUid);
      if (!targetUser) {
        report.unresolvedUsers.push({
          teacherId: teacher.id,
          firebaseUid,
          name: teacher.name || 'Unknown',
          email: teacher.email || 'Unknown'
        });
        continue;
      }

      const assignedRoleNames = Array.isArray(teacher.roles) && teacher.roles.length > 0
        ? teacher.roles
        : (teacher.role ? [teacher.role] : ['Staffs']);

      for (const roleName of assignedRoleNames) {
        if (!roleName) continue;
        let roleSlug;
        try {
          roleSlug = slugifyRoleName(roleName);
        } catch (_err) {
          report.unresolvedRoles.push({
            teacherId: teacher.id,
            roleName,
            error: 'Cannot generate valid slug'
          });
          continue;
        }

        // Match against existing roles or planned roles
        let targetRoleId = existingRoleSlugMap.get(roleSlug)?.id;
        if (!targetRoleId) {
          const planned = plannedRoleMutations.find(p => p.slug === roleSlug);
          if (planned) {
            targetRoleId = `PLANNED_${roleSlug}`;
          }
        }

        if (!targetRoleId) {
          report.unresolvedRoles.push({
            teacherId: teacher.id,
            roleName,
            roleSlug,
            error: 'Role definition not found in PostgreSQL or planned roles'
          });
          continue;
        }

        const assignmentKey = `${targetUser.id}_${targetRoleId}`;
        if (existingAssignmentKeySet.has(assignmentKey)) {
          report.userAssignmentsAlreadyMapped++;
        } else {
          report.userAssignmentsToCreate++;
          plannedAssignments.push({
            userId: targetUser.id,
            userEmail: targetUser.email,
            roleSlug,
            roleId: targetRoleId
          });
        }
      }
    }

    // 6. Execute Live Mutations if NOT Dry-Run
    if (!this.dryRun) {
      await this.prisma.$transaction(async (tx) => {
        const createdRoleMap = new Map(existingRoleSlugMap);

        // Step A: Create or Update Roles & Permissions
        for (const mut of plannedRoleMutations) {
          if (mut.action === 'CREATE_ROLE_AND_PERMISSIONS') {
            const created = await tx.schoolRole.create({
              data: {
                schoolId,
                name: mut.name,
                slug: mut.slug,
                loginPanel: mut.loginPanel,
                isSystemDefault: mut.isSystemDefault
              }
            });
            createdRoleMap.set(mut.slug, created);
            report.rolesCreated++;

            if (mut.permissions.length > 0) {
              await tx.rolePermission.createMany({
                data: mut.permissions.map(p => ({
                  schoolRoleId: created.id,
                  moduleKey: p.moduleKey,
                  canRead: p.canRead,
                  canCreate: p.canCreate,
                  canEdit: p.canEdit,
                  canDelete: p.canDelete
                }))
              });
              report.permissionsUpserted += mut.permissions.length;
            }
          } else if (mut.action === 'UPDATE_PERMISSIONS_ONLY') {
            for (const p of mut.permissions) {
              await tx.rolePermission.upsert({
                where: {
                  schoolRoleId_moduleKey: {
                    schoolRoleId: mut.roleId,
                    moduleKey: p.moduleKey
                  }
                },
                update: {
                  canRead: p.canRead,
                  canCreate: p.canCreate,
                  canEdit: p.canEdit,
                  canDelete: p.canDelete
                },
                create: {
                  schoolRoleId: mut.roleId,
                  moduleKey: p.moduleKey,
                  canRead: p.canRead,
                  canCreate: p.canCreate,
                  canEdit: p.canEdit,
                  canDelete: p.canDelete
                }
              });
              report.permissionsUpserted++;
            }
          }
        }

        // Step B: Create User-Role Assignments
        for (const assign of plannedAssignments) {
          const resolvedRoleId = assign.roleId.startsWith('PLANNED_')
            ? createdRoleMap.get(assign.roleSlug)?.id
            : assign.roleId;

          if (resolvedRoleId) {
            await tx.userRoleAssignment.upsert({
              where: {
                userId_schoolRoleId: {
                  userId: assign.userId,
                  schoolRoleId: resolvedRoleId
                }
              },
              update: {},
              create: {
                schoolId,
                userId: assign.userId,
                schoolRoleId: resolvedRoleId
              }
            });
            report.userAssignmentsCreated++;
          }
        }
      }, {
        maxWait: 15000,
        timeout: 60000
      });
    }

    if (report.unresolvedUsers.length > 0 || report.unresolvedRoles.length > 0 || report.roleSlugConflicts.length > 0) {
      report.status = 'COMPLETED_WITH_WARNINGS';
    }

    return report;
  }
}
