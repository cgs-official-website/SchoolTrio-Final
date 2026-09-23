import { Router } from 'express';
import healthRoutes from '../modules/health/health.routes.js';
import authRoutes from '../modules/auth/auth.routes.js';
import rbacRoutes from '../modules/rbac/rbac.routes.js';
import classRoutes from '../modules/classes/class.routes.js';
import categoryRoutes from '../modules/class-categories/category.routes.js';
import subjectRoutes from '../modules/subjects/subject.routes.js';
import studentRoutes from '../modules/students/student.routes.js';
import parentRoutes from '../modules/parents/parent.routes.js';
import staffRoutes from '../modules/staff/staff.routes.js';
import attendanceRoutes from '../modules/attendance/attendance.routes.js';
import { feeCollectionPeriodRoutes, feeStructureRoutes } from '../modules/fees/fee.routes.js';
import { invoiceRoutes, studentInvoiceRoutes } from '../modules/invoices/invoice.routes.js';
import { leaveRoutes, studentLeaveRoutes, staffLeaveRoutes } from '../modules/leaves/leave.routes.js';
import examRoutes from '../modules/exams/exam.routes.js';
import assessmentRoutes from '../modules/assessments/assessment.routes.js';
import assessmentGradeRoutes from '../modules/assessment-grades/assessment-grade.routes.js';
import reportCardRoutes from '../modules/report-cards/report-card.routes.js';
import reportCardTemplateRoutes from '../modules/report-card-templates/report-card-template.routes.js';
import { homeworkRoutes, studentHomeworkRoutes } from '../modules/homework/homework.routes.js';
import noticeRoutes from '../modules/notices/notice.routes.js';
import ptmRoutes from '../modules/ptm/ptm.routes.js';
import chatRoutes from '../modules/chats/chats.routes.js';
import notificationRoutes from '../modules/notifications/notifications.routes.js';
import { canteenRoutes } from '../modules/canteen/canteen.routes.js';
import { complaintRoutes } from '../modules/complaints/complaint.routes.js';
import timetableRoutes from '../modules/timetables/timetable.routes.js';
import transportRoutes from '../modules/transport/transport.routes.js';
import calendarRoutes from '../modules/calendar/calendar.routes.js';
import lessonPlanRoutes from '../modules/lesson-plans/lesson-plan.routes.js';
import academicResourceRoutes from '../modules/academic-resources/academic-resource.routes.js';
import libraryRoutes from '../modules/library/library.routes.js';
import inventoryRoutes from '../modules/inventory/inventory.routes.js';
import hrPayrollRoutes from '../modules/hr-payroll/hr-payroll.routes.js';
import { admissionsRouter, publicAdmissionsRouter, publicLeadsRouter } from '../modules/admissions/admissions.routes.js';
import { settingsRouter, publicSchoolsRouter } from '../modules/settings/settings.routes.js';
import { customModulesRouter } from '../modules/custom-modules/custom-modules.routes.js';
import { billingRouter, publicPlansRouter } from '../modules/billing/billing.routes.js';
import { auditRouter, superAdminAuditRouter } from '../modules/audit/audit.routes.js';
import { supportTicketsRouter, superAdminSupportTicketsRouter } from '../modules/support-tickets/support-tickets.routes.js';
import { superadminRouter } from '../modules/superadmin/superadmin.routes.js';
import studentHealthRoutes from '../modules/student-health/student-health.routes.js';
import { publicRegistrationRouter } from '../modules/registration/registration.routes.js';
import emailTemplateRoutes from '../modules/email-templates/email-templates.routes.js';
import { platformBrandingRouter } from '../modules/platform-branding/platform-branding.routes.js';

const router = Router();

/**
 * Health Endpoints mounted under /api/v1/health
 */
router.use('/health', healthRoutes);

/**
 * Primary Authentication Endpoints mounted under /api/v1/auth
 */
router.use('/auth', authRoutes);

/**
 * PostgreSQL RBAC Endpoints mounted under /api/v1/rbac
 */
router.use('/rbac', rbacRoutes);

/**
 * Class & Section Endpoints mounted under /api/v1/classes
 */
router.use('/classes', classRoutes);

/**
 * Class Category Endpoints mounted under /api/v1/class-categories
 */
router.use('/class-categories', categoryRoutes);

/**
 * Subject Endpoints mounted under /api/v1/subjects
 */
router.use('/subjects', subjectRoutes);

/**
 * Student Endpoints mounted under /api/v1/students
 */
router.use('/students', studentRoutes);

/**
 * Student Health Endpoints mounted under /api/v1/students
 */
router.use('/students', studentHealthRoutes);

/**
 * Student Invoice History Endpoints mounted under /api/v1/students
 */
router.use('/students', studentInvoiceRoutes);

/**
 * Student Leave History & Submission Endpoints mounted under /api/v1/students
 */
router.use('/students', studentLeaveRoutes);

/**
 * Student Homework List & Status Update Endpoints mounted under /api/v1/students
 */
router.use('/students', studentHomeworkRoutes);

/**
 * Parent Endpoints mounted under /api/v1/parents
 */
router.use('/parents', parentRoutes);

/**
 * Staff Endpoints mounted under /api/v1/staff
 */
router.use('/staff', staffRoutes);

/**
 * Staff Leave Self-Service Endpoints mounted under /api/v1/staff
 */
router.use('/staff', staffLeaveRoutes);

/**
 * Attendance & Daily Operations Endpoints mounted under /api/v1/attendance
 */
router.use('/attendance', attendanceRoutes);

/**
 * Fee Collection Period Endpoints mounted under /api/v1/fee-collection-periods
 */
router.use('/fee-collection-periods', feeCollectionPeriodRoutes);

/**
 * Fee Structure Endpoints mounted under /api/v1/fee-structures
 */
router.use('/fee-structures', feeStructureRoutes);

/**
 * Invoice Endpoints mounted under /api/v1/invoices
 */
router.use('/invoices', invoiceRoutes);

/**
 * Examination Endpoints mounted under /api/v1/exams
 */
router.use('/exams', examRoutes);

/**
 * Assessment Endpoints mounted under /api/v1/assessments
 */
router.use('/assessments', assessmentRoutes);

/**
 * Assessment Grade / Mark Entry Endpoints mounted under /api/v1/assessments
 */
router.use('/assessments', assessmentGradeRoutes);

/**
 * Report Card Core Domain Endpoints mounted under /api/v1/report-cards
 */
router.use('/report-cards', reportCardRoutes);

/**
 * Report Card Template Configuration Endpoints mounted under /api/v1/report-card-templates
 */
router.use('/report-card-templates', reportCardTemplateRoutes);

/**
 * Homework Assignment & Submission Endpoints mounted under /api/v1/homework
 */
router.use('/homework', homeworkRoutes);

/**
 * Institutional Leave Endpoints mounted under /api/v1/leaves
 */
router.use('/leaves', leaveRoutes);

/**
 * Noticeboard & Announcement Endpoints mounted under /api/v1/notices
 */
router.use('/notices', noticeRoutes);

/**
 * Parent-Teacher Meeting (PTM) Endpoints mounted under /api/v1/ptm
 */
router.use('/ptm', ptmRoutes);

/**
 * Chat / Communication Endpoints mounted under /api/v1/chats
 */
router.use('/chats', chatRoutes);

/**
 * Notifications & Alerts Endpoints mounted under /api/v1/notifications
 */
router.use('/notifications', notificationRoutes);

/**
 * Canteen Request Endpoints mounted under /api/v1/canteen
 */
router.use('/canteen', canteenRoutes);

/**
 * Complaint Endpoints mounted under /api/v1/complaints
 */
router.use('/complaints', complaintRoutes);

/**
 * Timetable & Scheduling Endpoints mounted under /api/v1/timetables
 */
router.use('/timetables', timetableRoutes);

/**
 * Transport & Vehicle Fleet Endpoints mounted under /api/v1/transport
 */
router.use('/transport', transportRoutes);

/**
 * Academic Calendar Endpoints mounted under /api/v1/calendar
 */
router.use('/calendar', calendarRoutes);

/**
 * Lesson Plan Endpoints mounted under /api/v1/lesson-plans
 */
router.use('/lesson-plans', lessonPlanRoutes);

/**
 * Academic Resource Endpoints mounted under /api/v1/academic-resources
 */
router.use('/academic-resources', academicResourceRoutes);

/**
 * Library Management Endpoints mounted under /api/v1/library
 */
router.use('/library', libraryRoutes);

/**
 * Inventory Management Endpoints mounted under /api/v1/inventory
 */
router.use('/inventory', inventoryRoutes);

/**
 * HR & Payroll Endpoints mounted under /api/v1/hr-payroll
 */
router.use('/hr-payroll', hrPayrollRoutes);

/**
 * Admissions & Lead Management Authenticated Endpoints mounted under /api/v1/admissions
 */
router.use('/admissions', admissionsRouter);

/**
 * Public Admissions Endpoints mounted under /api/v1/public/admissions
 */
router.use('/public/admissions', publicAdmissionsRouter);

/**
 * Public Lead Inquiries Endpoints mounted under /api/v1/public/leads
 */
router.use('/public/leads', publicLeadsRouter);

/**
 * Public School Metadata Endpoints mounted under /api/v1/public/schools
 */
router.use('/public/schools', publicSchoolsRouter);

/**
 * School Settings & Environment Configuration Endpoints mounted under /api/v1/settings
 */
router.use('/settings', settingsRouter);

/**
 * Custom Dynamic Modules & Form Builder Endpoints mounted under /api/v1/custom-modules
 */
router.use('/custom-modules', customModulesRouter);

/**
 * Tenant Billing & Subscription Endpoints mounted under /api/v1/billing
 */
router.use('/billing', billingRouter);

/**
 * Public Subscription Plans Endpoints mounted under /api/v1/public/plans
 */
router.use('/public/plans', publicPlansRouter);

/**
 * Public Self-Registration Endpoints mounted under /api/v1/public
 */
router.use('/public', publicRegistrationRouter);

/**
 * Tenant Audit Logs Endpoints mounted under /api/v1/audit
 */
router.use('/audit', auditRouter);

/**
 * SuperAdmin Global Audit Logs Endpoints mounted under /api/v1/superadmin/audit
 */
router.use('/superadmin/audit', superAdminAuditRouter);

/**
 * Tenant Support Tickets Endpoints mounted under /api/v1/support-tickets
 */
router.use('/support-tickets', supportTicketsRouter);

/**
 * SuperAdmin Global Support Tickets Endpoints mounted under /api/v1/superadmin/support-tickets
 */
router.use('/superadmin/support-tickets', superAdminSupportTicketsRouter);

/**
 * SuperAdmin Platform Suite Endpoints mounted under /api/v1/superadmin
 */
router.use('/superadmin', superadminRouter);

/**
 * Email Templates Endpoints mounted under /api/v1/email-templates
 */
router.use('/email-templates', emailTemplateRoutes);

/**
 * Global Platform Branding Endpoints mounted under /api/v1/platform/branding
 */
router.use('/platform/branding', platformBrandingRouter);

/**
 * API v1 Foundation Root Status Endpoint
 */
router.get('/', (_req, res) => {
  res.json({
    message: 'School Management System API v1 Foundation',
    status: 'operational',
    phase: 'Phase 1B Bootstrap'
  });
});

export default router;
