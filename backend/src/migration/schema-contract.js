/**
 * Schema Contract & Migration Dependency Tiers
 * 
 * Verifies and enforces the 63-model architecture defined in backend/prisma/schema.prisma.
 * Defines the 7-tier sequential dependency order required for relational integrity.
 */

export const TARGET_MODELS = [
  'School',
  'SubscriptionPlan',
  'User',
  'RefreshSession',
  'MigrationIdMap',
  'AuditLog',
  'RolePermission',
  'UserRoleAssignment',
  'ParentStudentLink',
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
  'AdmissionApplication'
];

export const MIGRATION_TIERS = {
  TIER_1_FOUNDATIONS: {
    name: 'Tier 1: Global Foundations',
    models: ['SubscriptionPlan', 'School', 'User', 'RefreshSession']
  },
  TIER_2_SECURITY: {
    name: 'Tier 2: Identity & Security',
    models: ['SchoolRole', 'RolePermission', 'UserRoleAssignment', 'ParentStudentLink', 'SchoolSetting']
  },
  TIER_3_ACADEMIC: {
    name: 'Tier 3: Academic & Organization',
    models: ['ClassCategory', 'Class', 'Section', 'Subject', 'TimetablePeriod', 'AcademicCalendarEvent', 'LessonPlan', 'AcademicResource']
  },
  TIER_4_PEOPLE: {
    name: 'Tier 4: Student & Staff Profiles',
    models: ['Student', 'ParentProfile', 'StaffProfile', 'HRPayrollRecord']
  },
  TIER_5_OPERATIONS: {
    name: 'Tier 5: Core Domain Operations',
    models: [
      'AttendanceSession', 'AttendanceRecord', 'AttendanceStat', 'AbsenteeFlag',
      'Examination', 'Assessment', 'AssessmentGrade', 'ReportCardTemplate', 'ReportCard',
      'HomeworkAssignment', 'HomeworkSubmission', 'FeeCollectionPeriod', 'FeeStructure', 'Invoice'
    ]
  },
  TIER_6_SERVICES: {
    name: 'Tier 6: Auxiliary Services',
    models: [
      'LibraryCategory', 'LibraryBook', 'LibraryBookIssue',
      'TransportVehicle', 'TransportRoute', 'RouteStop',
      'InventoryCategory', 'InventoryItem', 'InventoryAuditLog',
      'ChatRoom', 'ChatMessage', 'Notice', 'Notification',
      'LeaveApplication', 'LeaveApprovalRule', 'PtmAppointment', 'CanteenRequest', 'Complaint'
    ]
  },
  TIER_7_EXTENSIBILITY: {
    name: 'Tier 7: Extensibility & Audit',
    models: [
      'CustomModule', 'CustomFormSchema', 'CustomModuleRecord',
      'AdmissionLead', 'LeadForm', 'AdmissionApplication',
      'AuditLog', 'MigrationIdMap', 'BroadcastChannel', 'ChannelPost'
    ]
  }
};

export const EMPTY_SYSTEM_MODELS = new Set([
  'RefreshSession',
  'AcademicResource',
  'AbsenteeFlag',
  'ReportCardTemplate',
  'BroadcastChannel',
  'ChannelPost',
  'LeaveApprovalRule',
  'Complaint',
  'CustomModule',
  'CustomModuleRecord',
  'LeadForm',
  'MigrationIdMap'
]);
