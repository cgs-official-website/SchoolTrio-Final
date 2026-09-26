import { basePrisma } from '../database/prisma.client.js';

export async function reconcileTeachersAndRbac() {
  console.log('🚀 Starting System-Wide Teacher RBAC & Class Relationship Reconciliation...');

  const schools = await basePrisma.school.findMany({
    select: { id: true, name: true, code: true }
  });

  console.log(`Found ${schools.length} total school tenants to reconcile.`);

  const CANONICAL_TEACHER_READ_MODULES = [
    'students', 'classes', 'subjects', 'attendance', 'homework',
    'timetables', 'noticeboard', 'lesson_plans', 'resources', 'calendar', 'chats', 'exams', 'performance'
  ];

  let totalRolesCreated = 0;
  let totalPermissionsSeeded = 0;
  let totalUserRolesAssigned = 0;
  let totalClassesSynced = 0;

  for (const school of schools) {
    console.log(`\nProcessing Tenant: [${school.code}] ${school.name}`);

    // Batch load existing roles & permissions
    const existingRoles = await basePrisma.schoolRole.findMany({
      where: { schoolId: school.id },
      include: { permissions: true }
    });

    const defaultRoleConfigs = [
      { name: 'Staffs', slug: 'staffs', loginPanel: 'teacher' },
      { name: 'Class Incharge', slug: 'class-incharge', loginPanel: 'teacher' },
      { name: 'Subject Wise Head', slug: 'subject-wise-head', loginPanel: 'teacher' }
    ];

    const tenantRolesMap = new Map();
    existingRoles.forEach(r => tenantRolesMap.set(r.slug, r));

    for (const cfg of defaultRoleConfigs) {
      if (!tenantRolesMap.has(cfg.slug)) {
        const created = await basePrisma.schoolRole.create({
          data: {
            schoolId: school.id,
            name: cfg.name,
            slug: cfg.slug,
            loginPanel: cfg.loginPanel,
            isSystemDefault: true
          }
        });
        created.permissions = [];
        tenantRolesMap.set(cfg.slug, created);
        totalRolesCreated++;
        console.log(`  + Created default role '${cfg.name}'`);
      }
    }

    const defaultStaffsRole = tenantRolesMap.get('staffs') || Array.from(tenantRolesMap.values())[0];

    // Seed missing permissions
    const permInserts = [];
    for (const role of tenantRolesMap.values()) {
      const existingPermKeys = new Set((role.permissions || []).map(p => p.moduleKey));
      for (const moduleKey of CANONICAL_TEACHER_READ_MODULES) {
        if (!existingPermKeys.has(moduleKey)) {
          permInserts.push(basePrisma.rolePermission.create({
            data: {
              schoolRoleId: role.id,
              moduleKey,
              canRead: true,
              canCreate: ['attendance', 'homework', 'chats', 'lesson_plans', 'resources'].includes(moduleKey),
              canEdit: ['attendance', 'homework', 'chats', 'lesson_plans', 'resources'].includes(moduleKey),
              canDelete: false
            }
          }));
          totalPermissionsSeeded++;
        }
      }
    }
    if (permInserts.length > 0) {
      await Promise.all(permInserts);
    }

    // Auto-assign roles to orphaned teacher users
    const teacherUsers = await basePrisma.user.findMany({
      where: {
        schoolId: school.id,
        OR: [
          { systemRole: 'TEACHER' },
          { staffProfile: { isNot: null } }
        ]
      },
      include: { roleAssignments: true }
    });

    const roleAssignInserts = [];
    for (const u of teacherUsers) {
      if (u.roleAssignments.length === 0 && defaultStaffsRole) {
        roleAssignInserts.push(basePrisma.userRoleAssignment.create({
          data: {
            schoolId: school.id,
            userId: u.id,
            schoolRoleId: defaultStaffsRole.id
          }
        }));
        totalUserRolesAssigned++;
        console.log(`  + Assigned role '${defaultStaffsRole.name}' to user '${u.email}'`);
      }
    }
    if (roleAssignInserts.length > 0) {
      await Promise.all(roleAssignInserts);
    }

    // Two-Way Sync Class Teacher <-> Staff Profile
    const staffProfiles = await basePrisma.staffProfile.findMany({
      where: { schoolId: school.id, assignedClassId: { not: null } }
    });

    const classUpdates = [];
    for (const sp of staffProfiles) {
      const cls = await basePrisma.class.findUnique({
        where: { id: sp.assignedClassId }
      });
      if (cls && cls.classTeacherId !== sp.id) {
        classUpdates.push(basePrisma.class.update({
          where: { id: cls.id },
          data: { classTeacherId: sp.id }
        }));
        totalClassesSynced++;
        console.log(`  + Synced Class '${cls.name}' classTeacherId -> Staff '${sp.name}'`);
      }
    }
    if (classUpdates.length > 0) {
      await Promise.all(classUpdates);
    }
  }

  console.log('\n✅ System-Wide Reconciliation Summary:');
  console.log(`- Default Roles Created: ${totalRolesCreated}`);
  console.log(`- Role Permissions Seeded: ${totalPermissionsSeeded}`);
  console.log(`- User-Role Assignments Created: ${totalUserRolesAssigned}`);
  console.log(`- Class Teacher Relations Synced: ${totalClassesSynced}`);

  return {
    totalRolesCreated,
    totalPermissionsSeeded,
    totalUserRolesAssigned,
    totalClassesSynced
  };
}

reconcileTeachersAndRbac()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Migration execution failed:', err);
    process.exit(1);
  });
