import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { PrismaClient } from '@prisma/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.resolve(__dirname, '../prisma/schema.prisma');
const migrationSqlPath = path.resolve(
  __dirname,
  '../prisma/migrations/20260908000000_init_multi_tenant_schema/migration.sql'
);

describe('Phase 2B: Prisma Schema Structural Verification', () => {
  const schemaContent = fs.readFileSync(schemaPath, 'utf8');

  const EXPECTED_MODELS = [
    // Platform Global (4)
    'School',
    'SubscriptionPlan',
    'User',
    'RefreshSession',
    // System Audit (2)
    'MigrationIdMap',
    'AuditLog',
    // Tenant Junction (3)
    'RolePermission',
    'UserRoleAssignment',
    'ParentStudentLink',
    // Tenant Scoped (54)
    'SchoolSetting',
    'SchoolRole',
    'ClassCategory',
    'Class',
    'Section',
    'Subject',
    'TimetablePeriod',
    'AcademicCalendarEvent',
    'LessonPlan',
    'AcademicResource',
    'Student',
    'ParentProfile',
    'StaffProfile',
    'HRPayrollRecord',
    'AttendanceSession',
    'AttendanceRecord',
    'AttendanceStat',
    'AbsenteeFlag',
    'Examination',
    'Assessment',
    'AssessmentGrade',
    'ReportCardTemplate',
    'ReportCard',
    'HomeworkAssignment',
    'HomeworkSubmission',
    'FeeCollectionPeriod',
    'FeeStructure',
    'Invoice',
    'LibraryCategory',
    'LibraryBook',
    'LibraryBookIssue',
    'TransportVehicle',
    'TransportRoute',
    'RouteStop',
    'InventoryCategory',
    'InventoryItem',
    'InventoryAuditLog',
    'ChatRoom',
    'ChatMessage',
    'BroadcastChannel',
    'ChannelPost',
    'Notice',
    'Notification',
    'LeaveApplication',
    'LeaveApprovalRule',
    'PtmAppointment',
    'CanteenRequest',
    'Complaint',
    'CustomModule',
    'CustomFormSchema',
    'CustomModuleRecord',
    'AdmissionLead',
    'LeadForm',
    'AdmissionApplication',
    'PasswordResetToken',
    // Support Tickets (2)
    'SupportTicket',
    'SupportTicketMessage',
    // Platform Settings (1)
    'PlatformSetting'
  ];

  const FORBIDDEN_SPECULATIVE_MODELS = [
    'FeeInstallment',
    'PaymentTransaction',
    'AssessmentCategory',
    'ChannelSubscriber',
    'LeaveBalance'
  ];

  it('contains exactly the 67 validated models in schema.prisma', () => {
    const declaredModels = (schemaContent.match(/^model\s+(\w+)\s+\{/gm) || []).map((m) =>
      m.replace(/^model\s+/, '').replace(/\s+\{$/, '')
    );

    expect(declaredModels).toHaveLength(67);
    for (const modelName of EXPECTED_MODELS) {
      expect(declaredModels).toContain(modelName);
    }
  });

  it('does not contain speculative or unvalidated models', () => {
    for (const forbidden of FORBIDDEN_SPECULATIVE_MODELS) {
      const regex = new RegExp(`^model\\s+${forbidden}\\s+\\{`, 'm');
      expect(schemaContent).not.toMatch(regex);
    }
  });

  it('exposes all model delegates on generated PrismaClient', () => {
    const client = new PrismaClient();
    const delegates = Object.keys(client).filter(
      (k) => !k.startsWith('$') && !k.startsWith('_') && k !== 'constructor'
    );

    // Each of the 67 models maps to a camelCase delegate on client
    expect(delegates).toHaveLength(67);

    // Check specific critical delegates
    expect(client.school).toBeDefined();
    expect(client.subscriptionPlan).toBeDefined();
    expect(client.platformSetting).toBeDefined();

    expect(client.student).toBeDefined();
    expect(client.parentProfile).toBeDefined();
    expect(client.staffProfile).toBeDefined();
    expect(client.attendanceSession).toBeDefined();
    expect(client.attendanceRecord).toBeDefined();
    expect(client.customModule).toBeDefined();
    expect(client.customModuleRecord).toBeDefined();
    expect(client.rolePermission).toBeDefined();
    expect(client.userRoleAssignment).toBeDefined();
  });

  it('enforces composite tenant unique constraints on tenant models', () => {
    // Critical tenant models must declare @@unique([schoolId, id])
    const tenantSampleModels = [
      'Student',
      'Class',
      'Section',
      'Subject',
      'StaffProfile',
      'AttendanceSession',
      'AttendanceRecord',
      'Invoice',
      'CustomModuleRecord'
    ];

    for (const model of tenantSampleModels) {
      const modelBlockRegex = new RegExp(`model\\s+${model}\\s+\\{([\\s\\S]*?)\\}`, 'm');
      const match = schemaContent.match(modelBlockRegex);
      expect(match).toBeTruthy();
      expect(match[1]).toContain('@@unique([schoolId, id])');
    }
  });

  it('normalizes attendance into AttendanceSession and AttendanceRecord', () => {
    expect(schemaContent).toContain('model AttendanceSession');
    expect(schemaContent).toContain('model AttendanceRecord');
    expect(schemaContent).toContain('model AttendanceStat');
    expect(schemaContent).toContain('model AbsenteeFlag');
  });

  it('supports dynamic JSONB storage for customizable modules', () => {
    expect(schemaContent).toMatch(/customData\s+Json\?\s+@map\("custom_data"\)/);
    expect(schemaContent).toMatch(/sections\s+Json/);
    expect(schemaContent).toMatch(/data\s+Json/);
  });
});

describe('Phase 2B: Generated Migration SQL Safety Audit', () => {
  it('contains valid migration.sql with zero destructive DROP statements', () => {
    expect(fs.existsSync(migrationSqlPath)).toBe(true);
    const sql = fs.readFileSync(migrationSqlPath, 'utf8');

    // Verify ZERO destructive DROP statements
    const dropMatches = sql.match(/DROP\s+(TABLE|DATABASE|SCHEMA)/gi) || [];
    expect(dropMatches).toHaveLength(0);

    // Verify 63 tables created
    const createTableMatches = sql.match(/CREATE\s+TABLE\s+"[^"]+"/gi) || [];
    expect(createTableMatches).toHaveLength(63);

    // Verify 63 primary key constraints
    const pkeyMatches = sql.match(/CONSTRAINT\s+"[^"]+_pkey"\s+PRIMARY\s+KEY/gi) || [];
    expect(pkeyMatches).toHaveLength(63);

    // Verify composite tenant foreign keys exist
    const compositeFKs =
      sql.match(
        /FOREIGN\s+KEY\s+\("school_id",\s*"[^"]+"\)\s+REFERENCES\s+"[^"]+"\("school_id",\s*"id"\)/gi
      ) || [];
    expect(compositeFKs.length).toBeGreaterThan(30);

    // Verify referential actions
    expect(sql).toContain('ON DELETE CASCADE');
    expect(sql).toContain('ON DELETE RESTRICT');
    expect(sql).toContain('ON DELETE SET NULL');
  });
});
