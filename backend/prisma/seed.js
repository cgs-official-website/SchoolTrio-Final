import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL
});

/**
 * 1. Validated Platform Subscription Plans
 * Derived directly from src/firebase/firestore.js initializeDefaultSubscriptionPlans
 */
const SUBSCRIPTION_PLANS = [
  {
    name: 'Base Plan',
    userLimit: 300,
    pricePerUserPerYear: 160.00,
    cloudStorageGB: 25,
    modules: {
      staffManagement: true,
      studentManagement: true,
      timetable: true,
      feeManagement: true,
      attendance: true,
      exams: false,
      library: false,
      transport: false,
      lms: false,
      apiIntegration: false
    },
    isActive: true
  },
  {
    name: 'Standard Plan',
    userLimit: 600,
    pricePerUserPerYear: 240.00,
    cloudStorageGB: 60,
    modules: {
      staffManagement: true,
      studentManagement: true,
      timetable: true,
      feeManagement: true,
      attendance: true,
      exams: true,
      library: true,
      transport: true,
      lms: false,
      apiIntegration: true
    },
    isActive: true
  },
  {
    name: 'Premium Plan',
    userLimit: 1200,
    pricePerUserPerYear: 320.00,
    cloudStorageGB: 120,
    modules: {
      staffManagement: true,
      studentManagement: true,
      timetable: true,
      feeManagement: true,
      attendance: true,
      exams: true,
      library: true,
      transport: true,
      lms: true,
      apiIntegration: true
    },
    isActive: true
  },
  {
    name: 'Enterprise Plan',
    userLimit: 0,
    pricePerUserPerYear: 0.00,
    cloudStorageGB: 0,
    modules: {
      staffManagement: true,
      studentManagement: true,
      timetable: true,
      feeManagement: true,
      attendance: true,
      exams: true,
      library: true,
      transport: true,
      lms: true,
      apiIntegration: true
    },
    isActive: true
  }
];

/**
 * 2. Validated Institutional Default Roles
 * Derived directly from src/pages/Admin/RolesPermissions.jsx DEFAULT_ROLES
 */
const DEFAULT_ROLES = [
  { name: 'Correspondent', slug: 'correspondent', loginPanel: 'admin', isSystemDefault: true },
  { name: 'Principal', slug: 'principal', loginPanel: 'admin', isSystemDefault: true },
  { name: 'Vice Principal', slug: 'vice-principal', loginPanel: 'admin', isSystemDefault: true },
  { name: 'Subject Wise Head', slug: 'subject-wise-head', loginPanel: 'teacher', isSystemDefault: true },
  { name: 'Class Incharge', slug: 'class-incharge', loginPanel: 'teacher', isSystemDefault: true },
  { name: 'Staffs', slug: 'staffs', loginPanel: 'teacher', isSystemDefault: true },
  { name: 'Administrative Officer', slug: 'administrative-officer', loginPanel: 'admin', isSystemDefault: true },
  { name: 'Finance Department', slug: 'finance-department', loginPanel: 'admin', isSystemDefault: true },
  { name: 'Library', slug: 'library', loginPanel: 'admin', isSystemDefault: true },
  { name: 'Canteen', slug: 'canteen', loginPanel: 'admin', isSystemDefault: true },
  { name: 'Transport', slug: 'transport', loginPanel: 'admin', isSystemDefault: true },
  { name: 'Janitors', slug: 'janitors', loginPanel: 'admin', isSystemDefault: true },
  { name: 'Hostel', slug: 'hostel', loginPanel: 'admin', isSystemDefault: true },
  { name: 'Inventory', slug: 'inventory', loginPanel: 'admin', isSystemDefault: true },
  { name: 'Security', slug: 'security', loginPanel: 'admin', isSystemDefault: true }
];

/**
 * 3. Exact Permissions Derived from Application Modules
 * Core & Add-on modules from src/pages/Admin/RolesPermissions.jsx
 */
const MODULE_KEYS = [
  'classes', 'subjects', 'students', 'staff', 'chats', 'homework',
  'leaves', 'lesson_plans', 'resources', 'ptm', 'performance',
  'timetables', 'transport', 'library', 'exams', 'noticeboard',
  'hr-payroll', 'attendance', 'calendar', 'fees', 'hostel',
  'inventory', 'complaints', 'reports', 'form-builder', 'leads', 'billing'
];

/**
 * Helper to compute default CRUD flags for a role and module.
 */
function getRoleModulePermissions(roleSlug, moduleKey) {
  // Full admin roles get all permissions
  if (['correspondent', 'principal', 'administrative-officer'].includes(roleSlug)) {
    return { canRead: true, canCreate: true, canEdit: true, canDelete: true };
  }

  // Vice Principal has full permissions on academic and student modules, read on finance
  if (roleSlug === 'vice-principal') {
    const isAcademic = ['classes', 'subjects', 'students', 'staff', 'homework', 'attendance', 'exams', 'reports', 'calendar', 'noticeboard'].includes(moduleKey);
    return {
      canRead: true,
      canCreate: isAcademic,
      canEdit: isAcademic,
      canDelete: isAcademic
    };
  }

  // Teaching / Academic roles
  if (['subject-wise-head', 'class-incharge', 'staffs'].includes(roleSlug)) {
    const teachingModules = ['classes', 'subjects', 'students', 'homework', 'lesson_plans', 'resources', 'attendance', 'exams', 'ptm', 'performance', 'chats', 'leaves', 'calendar', 'noticeboard'];
    if (teachingModules.includes(moduleKey)) {
      return { canRead: true, canCreate: true, canEdit: true, canDelete: roleSlug !== 'staffs' };
    }
    return { canRead: false, canCreate: false, canEdit: false, canDelete: false };
  }

  // Finance Department
  if (roleSlug === 'finance-department') {
    if (['fees', 'billing', 'hr-payroll', 'reports'].includes(moduleKey)) {
      return { canRead: true, canCreate: true, canEdit: true, canDelete: true };
    }
    if (['students', 'staff'].includes(moduleKey)) {
      return { canRead: true, canCreate: false, canEdit: false, canDelete: false };
    }
    return { canRead: false, canCreate: false, canEdit: false, canDelete: false };
  }

  // Domain-specific functional roles
  if (roleSlug === 'library' && moduleKey === 'library') {
    return { canRead: true, canCreate: true, canEdit: true, canDelete: true };
  }
  if (roleSlug === 'transport' && moduleKey === 'transport') {
    return { canRead: true, canCreate: true, canEdit: true, canDelete: true };
  }
  if (roleSlug === 'inventory' && moduleKey === 'inventory') {
    return { canRead: true, canCreate: true, canEdit: true, canDelete: true };
  }
  if (roleSlug === 'hostel' && moduleKey === 'hostel') {
    return { canRead: true, canCreate: true, canEdit: true, canDelete: true };
  }
  if (roleSlug === 'canteen' && moduleKey === 'complaints') {
    return { canRead: true, canCreate: false, canEdit: true, canDelete: false };
  }

  // Default view for noticeboard / calendar
  if (['noticeboard', 'calendar'].includes(moduleKey)) {
    return { canRead: true, canCreate: false, canEdit: false, canDelete: false };
  }

  return { canRead: false, canCreate: false, canEdit: false, canDelete: false };
}

/**
 * Main idempotent seed function
 */
export async function seed() {
  console.log('🌱 Starting database seed...');

  // 1. Upsert Subscription Plans (Platform Global)
  console.log('📦 Seeding platform subscription plans...');
  const seededPlans = [];
  for (const plan of SUBSCRIPTION_PLANS) {
    const record = await prisma.subscriptionPlan.upsert({
      where: { name: plan.name },
      update: {
        userLimit: plan.userLimit,
        pricePerUserPerYear: plan.pricePerUserPerYear,
        cloudStorageGB: plan.cloudStorageGB,
        modules: plan.modules,
        isActive: plan.isActive
      },
      create: {
        name: plan.name,
        userLimit: plan.userLimit,
        pricePerUserPerYear: plan.pricePerUserPerYear,
        cloudStorageGB: plan.cloudStorageGB,
        modules: plan.modules,
        isActive: plan.isActive
      }
    });
    seededPlans.push(record);
  }
  console.log(`✅ Seeded ${seededPlans.length} subscription plans.`);

  // 2. Upsert System Template School (Provides valid tenant context for template roles)
  console.log('🏫 Seeding system template school...');
  const templateSchool = await prisma.school.upsert({
    where: { code: 'SYSTEM_TEMPLATE' },
    update: {
      name: 'System Institutional Template School',
      status: 'active',
      timezone: 'Asia/Kolkata',
      planId: seededPlans[0].id
    },
    create: {
      name: 'System Institutional Template School',
      code: 'SYSTEM_TEMPLATE',
      status: 'active',
      timezone: 'Asia/Kolkata',
      planId: seededPlans[0].id
    }
  });
  console.log(`✅ System template school verified (ID: ${templateSchool.id}).`);

  // 3. Upsert Default Institutional Roles and Exact Permissions
  console.log('👥 Seeding default institutional roles and permissions...');
  let roleCount = 0;
  let permCount = 0;

  for (const roleDef of DEFAULT_ROLES) {
    const role = await prisma.schoolRole.upsert({
      where: {
        schoolId_slug: {
          schoolId: templateSchool.id,
          slug: roleDef.slug
        }
      },
      update: {
        name: roleDef.name,
        loginPanel: roleDef.loginPanel,
        isSystemDefault: roleDef.isSystemDefault
      },
      create: {
        schoolId: templateSchool.id,
        name: roleDef.name,
        slug: roleDef.slug,
        loginPanel: roleDef.loginPanel,
        isSystemDefault: roleDef.isSystemDefault
      }
    });
    roleCount++;

    await Promise.all(
      MODULE_KEYS.map(async (moduleKey) => {
        const perms = getRoleModulePermissions(roleDef.slug, moduleKey);
        await prisma.rolePermission.upsert({
          where: {
            schoolRoleId_moduleKey: {
              schoolRoleId: role.id,
              moduleKey
            }
          },
          update: {
            canRead: perms.canRead,
            canCreate: perms.canCreate,
            canEdit: perms.canEdit,
            canDelete: perms.canDelete
          },
          create: {
            schoolRoleId: role.id,
            moduleKey,
            canRead: perms.canRead,
            canCreate: perms.canCreate,
            canEdit: perms.canEdit,
            canDelete: perms.canDelete
          }
        });
      })
    );
    permCount += MODULE_KEYS.length;
  }

  console.log(`✅ Seeded ${roleCount} default roles with ${permCount} granular module permissions.`);
  console.log('🎉 Database seed completed successfully.');
}

// Execute seed if called directly
if (process.argv[1]?.endsWith('seed.js')) {
  seed()
    .then(async () => {
      await prisma.$disconnect();
    })
    .catch(async (e) => {
      console.error('❌ Error during seed:', e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
