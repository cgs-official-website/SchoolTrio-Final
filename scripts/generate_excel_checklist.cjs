const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

// 1. Admin Panel Modules Data
const adminModules = [
  {
    sNo: 1,
    name: 'Admin Overview (Dashboard)',
    path: '/admin',
    rbacKey: 'overview',
    component: 'AdminOverview.jsx',
    features: 'High-level KPI metrics, active student & staff headcount, today attendance %, fee revenue counter, pending approvals, quick actions.',
    apis: 'GET /api/v1/analytics/overview, GET /api/v1/schools/settings',
    database: 'schools, students, staff, attendance, fees',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Real-time stats synced with PostgreSQL'
  },
  {
    sNo: 2,
    name: 'Noticeboard & Circulars',
    path: '/admin/notices',
    rbacKey: 'noticeboard',
    component: 'Noticeboard.jsx',
    features: 'Create, edit, pin, search, and target notices to Teachers, Students, Parents or All. File attachment support and broadcast notifications.',
    apis: 'GET/POST/PUT/DELETE /api/v1/notices',
    database: 'notices, notice_targets',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Supports rich content & targeted audience'
  },
  {
    sNo: 3,
    name: 'Canteen Management',
    path: '/admin/canteen',
    rbacKey: 'canteen',
    component: 'CanteenManagement.jsx',
    features: 'Daily menu catalogue, dietary tags, student meal pre-orders, order status (Pending/Preparing/Served), daily meal tracking, price management.',
    apis: 'GET/POST/PUT /api/v1/canteen, /api/v1/canteen/orders',
    database: 'canteen_items, canteen_orders',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Live order tracking with filtering'
  },
  {
    sNo: 4,
    name: 'Environment Setup',
    path: '/admin/setup',
    rbacKey: 'setup',
    component: 'EnvironmentSetup.jsx',
    features: 'School profile setup, academic year, grading scheme configuration, attendance thresholds, working days, general school branding.',
    apis: 'GET/PUT /api/v1/schools/settings',
    database: 'schools, academic_years',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Configures school-wide defaults'
  },
  {
    sNo: 5,
    name: 'Staff Directory & Assignment',
    path: '/admin/staff',
    rbacKey: 'staff',
    component: 'StaffAssignment.jsx',
    features: 'Staff member directory, assign class teachers, subject-class allocation, staff profile details, department tagging, deactivate/activate staff accounts.',
    apis: 'GET/POST/PUT/DELETE /api/v1/staff, /api/v1/classes/assign-teacher',
    database: 'staff_profiles, users, user_role_assignments',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Complete staff lifecycle and assignment engine'
  },
  {
    sNo: 6,
    name: 'Classes & Sections',
    path: '/admin/classes',
    rbacKey: 'classes',
    component: 'ClassManagement.jsx',
    features: 'Create grades, sections (A, B, C), set student room capacity, assign class teachers, filter student enrollment count per section.',
    apis: 'GET/POST/PUT/DELETE /api/v1/classes',
    database: 'classes, sections, staff_profiles',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Foundation for timetables and attendance'
  },
  {
    sNo: 7,
    name: 'Subject Management',
    path: '/admin/subjects',
    rbacKey: 'subjects',
    component: 'SubjectManagement.jsx',
    features: 'Create/manage core and elective subjects, subject codes, associate subjects with specific classes, assign departments.',
    apis: 'GET/POST/PUT/DELETE /api/v1/subjects',
    database: 'subjects, class_subjects',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Integrated with timetable & exam systems'
  },
  {
    sNo: 8,
    name: 'Student Directory & Admission',
    path: '/admin/students',
    rbacKey: 'students',
    component: 'StudentManagement.jsx',
    features: 'Full student directory, new admission creation, parent profile linking, class-section enrollment, student profile drawer, bulk CSV import/export.',
    apis: 'GET/POST/PUT/DELETE /api/v1/students, /api/v1/parents',
    database: 'students, parents, parent_students',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Supports document upload and admission numbering'
  },
  {
    sNo: 9,
    name: 'Attendance Management',
    path: '/admin/attendance',
    rbacKey: 'attendance',
    component: 'AdminAttendance.jsx',
    features: 'School-wide daily attendance oversight, class-wise marking review, attendance percentage graphs, export daily/monthly reports, absent alert generation.',
    apis: 'GET/POST /api/v1/attendance, /api/v1/attendance/summary',
    database: 'attendance_records, students',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Supports Present, Absent, Late & Excused states'
  },
  {
    sNo: 10,
    name: 'HR & Payroll Management',
    path: '/admin/hr-payroll',
    rbacKey: 'hr-payroll',
    component: 'HRPayrollManagement.jsx',
    features: 'Staff salary structure, basic salary, allowances, deductions, PF/tax calculation, monthly payslip generation, payout status tracking.',
    apis: 'GET/POST/PUT /api/v1/payroll, /api/v1/payroll/generate',
    database: 'payroll_records, staff_profiles',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Automated salary slip calculation & PDF exports'
  },
  {
    sNo: 11,
    name: 'Chat Monitor & Moderation',
    path: '/admin/chats',
    rbacKey: 'chats',
    component: 'ChatMonitor.jsx',
    features: 'Admin surveillance of messaging channels between teachers and parents, flag inappropriate content, inspect communication history.',
    apis: 'GET /api/v1/chat/monitor, GET /api/v1/chat/channels',
    database: 'chat_threads, chat_messages',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Security & compliance audit logging'
  },
  {
    sNo: 12,
    name: 'Timetable Scheduling',
    path: '/admin/timetables',
    rbacKey: 'timetables',
    component: 'TimetableManagement.jsx',
    features: 'Weekly master timetable builder, section grid, time-slot allocation, teacher-subject assignment, conflict detection to avoid double booking.',
    apis: 'GET/POST/PUT/DELETE /api/v1/timetables',
    database: 'timetables, timetable_slots',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Clash prevention algorithm active'
  },
  {
    sNo: 13,
    name: 'Academic Calendar',
    path: '/admin/calendar',
    rbacKey: 'calendar',
    component: 'AcademicCalendar.jsx',
    features: 'Add and manage school events, public holidays, examination windows, sports day, term start/end dates with color categories.',
    apis: 'GET/POST/PUT/DELETE /api/v1/calendar',
    database: 'calendar_events, schools',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Synchronized with Teacher & Parent calendars'
  },
  {
    sNo: 14,
    name: 'Exams & Results Management',
    path: '/admin/exams',
    rbacKey: 'exams',
    component: 'ExamManagement.jsx',
    features: 'Create exams (Midterm, Final, Unit Test), grading criteria, marks verification, report card templates, automated report card publishing.',
    apis: 'GET/POST/PUT /api/v1/exams, /api/v1/report-cards',
    database: 'exams, exam_marks, report_cards, report_card_templates',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Supports custom report card template styling & PDF'
  },
  {
    sNo: 15,
    name: 'Homework Oversight',
    path: '/admin/homework',
    rbacKey: 'homework',
    component: 'AdminHomework.jsx',
    features: 'School-wide homework monitoring, audit assignments by class and subject, inspect submission deadlines and teacher grading activity.',
    apis: 'GET /api/v1/homework/overview, GET /api/v1/homework',
    database: 'homework_assignments, homework_submissions',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Central oversight of daily student assignments'
  },
  {
    sNo: 16,
    name: 'Fees & Payment Management',
    path: '/admin/fees',
    rbacKey: 'fees',
    component: 'FeeManagement.jsx',
    features: 'Fee structure creation (Tuition, Transport, Lab), term installments, student invoice generation, manual receipt entry, overdue penalty, concession setup.',
    apis: 'GET/POST/PUT /api/v1/fees, /api/v1/fees/invoices',
    database: 'fee_structures, fee_invoices, fee_payments',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Comprehensive financial tracking with payment receipts'
  },
  {
    sNo: 17,
    name: 'Transport Management',
    path: '/admin/transport',
    rbacKey: 'transport',
    component: 'TransportManagement.jsx',
    features: 'Bus routes, pickup and drop points, vehicle fleet details, driver details and contact, student allocation to specific bus routes.',
    apis: 'GET/POST/PUT/DELETE /api/v1/transport',
    database: 'transport_routes, transport_vehicles, student_transport',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Route stop management with student association'
  },
  {
    sNo: 18,
    name: 'Library Management',
    path: '/admin/library',
    rbacKey: 'library',
    component: 'LibraryManagement.jsx',
    features: 'Book inventory, ISBN, category, author, book issuing to students/staff, return dates, overdue fines, stock quantity monitoring.',
    apis: 'GET/POST/PUT/DELETE /api/v1/library, /api/v1/library/issue',
    database: 'library_books, library_issues',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Circulation engine with fine tracking'
  },
  {
    sNo: 19,
    name: 'Inventory & Asset Management',
    path: '/admin/inventory',
    rbacKey: 'inventory',
    component: 'InventoryManagement.jsx, InventoryAuditLogs.jsx',
    features: 'School physical assets (desks, computers, lab gear), serial numbers, supplier info, purchase date, maintenance status, item quantity, audit logs.',
    apis: 'GET/POST/PUT/DELETE /api/v1/inventory, /api/v1/inventory/audit-logs',
    database: 'inventory_items, inventory_logs',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Asset depreciation & full audit trail'
  },
  {
    sNo: 20,
    name: 'Leave Requests Approval',
    path: '/admin/leaves',
    rbacKey: 'leaves',
    component: 'LeaveManagement.jsx',
    features: 'Review leave applications from staff and students, Approve or Reject with remarks, leave balance deduction, historical leave register.',
    apis: 'GET/PUT /api/v1/leaves, /api/v1/leaves/status',
    database: 'leave_requests, staff_profiles, students',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Direct workflow coordination with staff calendar'
  },
  {
    sNo: 21,
    name: 'Reports & Analytics',
    path: '/admin/reports',
    rbacKey: 'reports',
    component: 'ReportsAnalytics.jsx, ReportTemplateBuilder.jsx',
    features: 'Academic performance graphs, student attendance trends, fee collection analytics, enrollment growth, custom PDF report template designer.',
    apis: 'GET /api/v1/analytics/reports, /api/v1/report-templates',
    database: 'report_templates, analytics_views',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Interactive charts & template customization'
  },
  {
    sNo: 22,
    name: 'API Integrations & Webhooks',
    path: '/admin/api',
    rbacKey: 'api',
    component: 'APIIntegrations.jsx',
    features: 'Webhook configuration, SMS gateway credentials, payment gateway keys, external LMS integration, developer API tokens.',
    apis: 'GET/POST/PUT /api/v1/integrations',
    database: 'school_integrations',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Secure API credentials management'
  },
  {
    sNo: 23,
    name: 'Registration Links Generator',
    path: '/admin/links',
    rbacKey: 'links',
    component: 'LinkGenerator.jsx',
    features: 'Generate secure self-onboarding registration links for Teachers and Parents with expiration controls and school code binding.',
    apis: 'GET/POST/DELETE /api/v1/registration/links',
    database: 'registration_links',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Streamlines bulk onboarding'
  },
  {
    sNo: 24,
    name: 'Leads & Inquiry Management',
    path: '/admin/leads',
    rbacKey: 'leads',
    component: 'LeadsManagement.jsx',
    features: 'Prospective student admission leads pipeline (New, Contacted, Follow-Up, Enrolled, Rejected), parent phone, target grade, conversion stats.',
    apis: 'GET/POST/PUT/DELETE /api/v1/leads',
    database: 'leads',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Admission CRM pipeline with status transitions'
  },
  {
    sNo: 25,
    name: 'Billing & Subscription Plan',
    path: '/admin/billing',
    rbacKey: 'billing',
    component: 'BillingDashboard.jsx, UpgradePlan.jsx',
    features: 'View active SaaS subscription tier, plan module entitlements, invoice billing history, upgrade school plan tier (Basic/Pro/Enterprise).',
    apis: 'GET /api/v1/billing/subscription, /api/v1/billing/invoices',
    database: 'schools.plan, subscriptions, invoices',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Multi-tenant subscription management'
  },
  {
    sNo: 26,
    name: 'Custom Form Builder',
    path: '/admin/form-builder',
    rbacKey: 'form-builder',
    component: 'FormBuilder.jsx, CustomModuleView.jsx',
    features: 'Create dynamic custom forms, configure field types (text, date, dropdown, file, number), render custom modules in sidebar navigation.',
    apis: 'GET/POST/PUT/DELETE /api/v1/custom-modules',
    database: 'custom_modules, custom_fields, custom_data',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Extendable schema system for custom school needs'
  },
  {
    sNo: 27,
    name: 'Roles & Permissions (RBAC)',
    path: '/admin/roles',
    rbacKey: 'roles',
    component: 'RolesPermissions.jsx',
    features: 'Custom roles creation, role slug generation, granular permission matrix (read, create, edit, delete, admin) across all 25+ modules.',
    apis: 'GET/POST/PUT/DELETE /api/v1/rbac/roles, /api/v1/rbac/permissions',
    database: 'roles, permissions, role_permissions',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Multi-tenant role-based security isolation'
  }
];

// 2. Teacher Panel Modules Data
const teacherModules = [
  {
    sNo: 1,
    name: 'Class Roster / Dashboard',
    path: '/teacher',
    rbacKey: 'roster',
    component: 'ClassRoster.jsx',
    features: 'Assigned class and section overview, student roll roster, quick student contact info, profile completion progress tracker.',
    apis: 'GET /api/v1/classes/roster, GET /api/v1/staff/me',
    database: 'staff_profiles, classes, students',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Teacher entry point with assigned class roster'
  },
  {
    sNo: 2,
    name: 'Noticeboard',
    path: '/teacher/notices',
    rbacKey: 'noticeboard',
    component: 'TeacherNoticeboard.jsx',
    features: 'View official school notices, circulars, department announcements, staff meeting reminders with pinned notices.',
    apis: 'GET /api/v1/notices',
    database: 'notices',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Filtered notices targeted to staff'
  },
  {
    sNo: 3,
    name: 'Academic Calendar',
    path: '/teacher/calendar',
    rbacKey: 'calendar',
    component: 'TeacherCalendar.jsx',
    features: 'Interactive month/week calendar of school events, exams, sports meets, staff meetings, and public holidays.',
    apis: 'GET /api/v1/calendar',
    database: 'calendar_events',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Synced with school academic schedule'
  },
  {
    sNo: 4,
    name: 'Weekly Timetable',
    path: '/teacher/timetable',
    rbacKey: 'timetables',
    component: 'TeacherTimetable.jsx',
    features: 'Personalized schedule of assigned teaching periods, subject time-slots, section rooms, and free period overview.',
    apis: 'GET /api/v1/timetables/teacher',
    database: 'timetable_slots, classes, subjects',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Auto-populated from master timetable'
  },
  {
    sNo: 5,
    name: 'Lesson Plans',
    path: '/teacher/lesson-plans',
    rbacKey: 'lesson_plans',
    component: 'LessonPlans.jsx',
    features: 'Create and submit weekly lesson plans, syllabus chapters, learning objectives, attachment of teaching worksheets and status.',
    apis: 'GET/POST/PUT/DELETE /api/v1/lesson-plans',
    database: 'lesson_plans',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Curriculum delivery tracking'
  },
  {
    sNo: 6,
    name: 'Resource Sharing',
    path: '/teacher/resources',
    rbacKey: 'resources',
    component: 'ResourceSharing.jsx',
    features: 'Upload and share study notes, textbook PDF links, assignments, presentation slides with students and classes.',
    apis: 'GET/POST/DELETE /api/v1/resources',
    database: 'shared_resources',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Direct file distribution to enrolled classes'
  },
  {
    sNo: 7,
    name: 'Attendance Marking',
    path: '/teacher/attendance',
    rbacKey: 'attendance',
    component: 'Attendance.jsx',
    features: 'Daily attendance sheet marking (Present, Absent, Late, Excused), batch submit for class, attendance stats summary.',
    apis: 'GET/POST /api/v1/attendance',
    database: 'attendance_records',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Batch save with instantaneous validation'
  },
  {
    sNo: 8,
    name: 'Homework Management',
    path: '/teacher/homework',
    rbacKey: 'homework',
    component: 'HomeworkManagement.jsx',
    features: 'Assign homework to class, specify instructions and attachments, set due date, evaluate submitted work, assign marks & feedback.',
    apis: 'GET/POST/PUT/DELETE /api/v1/homework, /api/v1/homework/submissions',
    database: 'homework_assignments, homework_submissions',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Full grading lifecycle for homework assignments'
  },
  {
    sNo: 9,
    name: 'Performance Tracking',
    path: '/teacher/performance',
    rbacKey: 'performance',
    component: 'PerformanceTracking.jsx',
    features: 'Class performance metrics, subject grade distribution, student progress tracking, identify students requiring attention.',
    apis: 'GET /api/v1/students/performance, /api/v1/classes/:id/performance',
    database: 'student_performance, exam_marks',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Visual progress charts and analytical graphs'
  },
  {
    sNo: 10,
    name: 'PTM Scheduler',
    path: '/teacher/ptm',
    rbacKey: 'ptm',
    component: 'PTMScheduler.jsx',
    features: 'Create available Parent-Teacher meeting appointment slots, set date and slot duration, manage parent bookings, meeting notes.',
    apis: 'GET/POST/PUT /api/v1/ptm',
    database: 'ptm_slots, ptm_bookings',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Two-way coordination with parent portal'
  },
  {
    sNo: 11,
    name: 'Transport Details',
    path: '/teacher/transport',
    rbacKey: 'transport',
    component: 'TransportDetails.jsx',
    features: 'Check bus routes for class students, driver contact info, emergency communication numbers, route stops overview.',
    apis: 'GET /api/v1/transport',
    database: 'transport_routes, transport_vehicles',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Emergency safety info for field trips & departures'
  },
  {
    sNo: 12,
    name: 'Grades & Marks Entry',
    path: '/teacher/grades',
    rbacKey: 'exams',
    component: 'Grades.jsx',
    features: 'Enter and update examination marks by subject and section, calculate percentage and grade scale, generate report card preview.',
    apis: 'GET/POST /api/v1/exams/marks, /api/v1/report-cards',
    database: 'exam_marks, exams, report_cards',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Connected to report card generator'
  },
  {
    sNo: 13,
    name: 'Messages & Chat',
    path: '/teacher/chat',
    rbacKey: 'chats',
    component: 'TeacherChat.jsx',
    features: 'Direct private messaging with parents of assigned students, broadcast group announcements to class parents, real-time messaging.',
    apis: 'GET/POST /api/v1/chat, /api/v1/chat/messages',
    database: 'chat_threads, chat_messages',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Teacher-parent communication bridge'
  },
  {
    sNo: 14,
    name: 'My Salary & Payslips',
    path: '/teacher/salary',
    rbacKey: 'hr-payroll',
    component: 'MySalary.jsx',
    features: 'Personal monthly salary breakdown, basic pay, deductions, allowances, PF, tax, and direct payslip PDF download.',
    apis: 'GET /api/v1/payroll/me',
    database: 'payroll_records',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Confidential staff payslip viewer'
  },
  {
    sNo: 15,
    name: 'Leave Requests',
    path: '/teacher/leaves',
    rbacKey: 'leaves',
    component: 'TeacherLeaves.jsx',
    features: 'Submit casual or sick leave applications, specify date range and reason, track approval status from school administration.',
    apis: 'GET/POST /api/v1/leaves/my',
    database: 'leave_requests',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Tracks leave balance and real-time status'
  },
  {
    sNo: 16,
    name: 'Profile Setup & Reset Password',
    path: '/teacher/profile',
    rbacKey: 'profile',
    component: 'ProfileSetup.jsx',
    features: 'Manage personal profile, qualifications, banking info, ID documents, plus new dedicated Reset Password section with bcrypt hash update in DB.',
    apis: 'GET/PUT /api/v1/staff/me, POST /api/v1/auth/change-password',
    database: 'staff_profiles, users (passwordHash, tokenVersion)',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Includes new Reset Password section updating DB'
  }
];

// 3. Parent Panel Modules Data
const parentModules = [
  {
    sNo: 1,
    name: 'Student Overview (Dashboard)',
    path: '/parent',
    rbacKey: 'overview',
    component: 'StudentOverview.jsx',
    features: 'Current active child summary: attendance %, upcoming homework due dates, latest exam grades, school announcements, quick actions.',
    apis: 'GET /api/v1/parents/children, /api/v1/students/:id/overview',
    database: 'parents, students, attendance, homework',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Child-centric overview dashboard'
  },
  {
    sNo: 2,
    name: 'My Children & Switch Child',
    path: '/parent/children',
    rbacKey: 'children',
    component: 'MyChildren.jsx',
    features: 'Multi-child switcher, profile cards of all enrolled children, link additional sibling using student Admission Number and Date of Birth.',
    apis: 'GET /api/v1/parents/children, POST /api/v1/parents/link-child',
    database: 'parent_students, students',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Seamless multi-student family support'
  },
  {
    sNo: 3,
    name: 'Academic Performance',
    path: '/parent/performance',
    rbacKey: 'performance',
    component: 'Performance.jsx',
    features: 'Subject-wise score progression, test results over time, grade trends, visual performance analytics, comparative analysis.',
    apis: 'GET /api/v1/students/:id/performance',
    database: 'student_performance, exam_marks',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Visual grade analytics and strengths indicators'
  },
  {
    sNo: 4,
    name: 'PTM Meeting Booking',
    path: '/parent/ptm',
    rbacKey: 'ptm',
    component: 'PTM.jsx',
    features: 'View available Parent-Teacher meeting schedules, book 1-on-1 time slots with child class/subject teachers, meeting status.',
    apis: 'GET /api/v1/ptm/parent, POST /api/v1/ptm/book',
    database: 'ptm_slots, ptm_bookings',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Interactive slot reservation system'
  },
  {
    sNo: 5,
    name: 'Noticeboard',
    path: '/parent/notices',
    rbacKey: 'noticeboard',
    component: 'ParentNoticeboard.jsx',
    features: 'School-wide circulars, event updates, holiday alerts, targeted parent notices, downloadable circular attachments.',
    apis: 'GET /api/v1/notices',
    database: 'notices',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Real-time school announcements for parents'
  },
  {
    sNo: 6,
    name: 'Calendar & Events',
    path: '/parent/calendar',
    rbacKey: 'calendar',
    component: 'Calendar.jsx / AcademicCalendar.jsx',
    features: 'School holidays, exam schedules, sports day, annual celebrations, parent meetings calendar view.',
    apis: 'GET /api/v1/calendar',
    database: 'calendar_events',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Full school calendar visibility'
  },
  {
    sNo: 7,
    name: 'Child Attendance',
    path: '/parent/attendance',
    rbacKey: 'attendance',
    component: 'Attendance.jsx',
    features: 'Monthly attendance calendar view of child, detailed list of present, absent, and late marks, total attendance percentage.',
    apis: 'GET /api/v1/attendance/student/:id',
    database: 'attendance_records',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Daily attendance transparency for parents'
  },
  {
    sNo: 8,
    name: 'Library Borrowings',
    path: '/parent/library',
    rbacKey: 'library',
    component: 'ParentLibrary.jsx',
    features: 'Books currently issued to student, issue date, return deadline, overdue book notification and library history.',
    apis: 'GET /api/v1/library/student/:id',
    database: 'library_issues, library_books',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Helps parents track return due dates'
  },
  {
    sNo: 9,
    name: 'Canteen & Meal Orders',
    path: '/parent/canteen',
    rbacKey: 'canteen',
    component: 'Canteen.jsx',
    features: 'View school cafeteria menu, pre-order meals for child, inspect dietary information, order history and payment records.',
    apis: 'GET /api/v1/canteen, POST /api/v1/canteen/order',
    database: 'canteen_items, canteen_orders',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Supports cashless cafeteria ordering'
  },
  {
    sNo: 10,
    name: 'Homework Overview',
    path: '/parent/homework',
    rbacKey: 'homework',
    component: 'HomeworkOverview.jsx',
    features: 'View daily assigned homework, task instructions, due date countdown, student submission status and teacher remarks.',
    apis: 'GET /api/v1/homework/student/:id',
    database: 'homework_assignments, homework_submissions',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Keeps parents updated on daily homework'
  },
  {
    sNo: 11,
    name: 'Report Card & Grades',
    path: '/parent/grades',
    rbacKey: 'exams',
    component: 'Grades.jsx',
    features: 'Term-wise official report cards, subject scores, teacher feedback comments, download high-fidelity official PDF report cards.',
    apis: 'GET /api/v1/report-cards/student/:id',
    database: 'report_cards, exam_marks',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Official digital report card with PDF download'
  },
  {
    sNo: 12,
    name: 'Fees & Payments',
    path: '/parent/fees',
    rbacKey: 'fees',
    component: 'Fees.jsx',
    features: 'Tuition and transport fee breakdown, invoices due, paid transaction history, online payment gateway, download payment receipts.',
    apis: 'GET /api/v1/fees/student/:id, POST /api/v1/fees/pay',
    database: 'fee_invoices, fee_payments',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Complete online fee payment & invoice portal'
  },
  {
    sNo: 13,
    name: 'Leave Requests',
    path: '/parent/leaves',
    rbacKey: 'leaves',
    component: 'LeaveRequests.jsx',
    features: 'Submit student absence leave request, select dates, provide reason / medical notes, monitor teacher approval status.',
    apis: 'GET/POST /api/v1/leaves/student',
    database: 'leave_requests',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Digital leave application without physical notes'
  },
  {
    sNo: 14,
    name: 'Messages / Teacher Chat',
    path: '/parent/chat',
    rbacKey: 'chats',
    component: 'Chat.jsx',
    features: 'One-on-one direct chat with class teacher and subject teachers, inquiry messages, class announcements, read receipts.',
    apis: 'GET/POST /api/v1/chat, /api/v1/chat/messages',
    database: 'chat_threads, chat_messages',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Safe, monitored direct messaging channel'
  }
];

// 4. SuperAdmin Panel Modules Data
const superAdminModules = [
  {
    sNo: 1,
    name: 'SuperAdmin Overview',
    path: '/superadmin',
    rbacKey: 'superadmin',
    component: 'SuperAdminDashboard.jsx',
    features: 'Platform-wide multi-tenant metrics, total schools enrolled, total active students/teachers across platform, revenue.',
    apis: 'GET /api/v1/superadmin/metrics',
    database: 'schools, subscriptions, users',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Global SaaS management overview'
  },
  {
    sNo: 2,
    name: 'School Tenants Management',
    path: '/superadmin/tenants',
    rbacKey: 'superadmin',
    component: 'TenantManagement.jsx',
    features: 'Approve, suspend, or reject registered schools, assign school codes, inspect school tenant databases and admin credentials.',
    apis: 'GET/POST/PUT /api/v1/superadmin/tenants',
    database: 'schools, users',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Multi-tenant school lifecycle control'
  },
  {
    sNo: 3,
    name: 'SaaS Plan Management',
    path: '/superadmin/plans',
    rbacKey: 'superadmin',
    component: 'PlanManagement.jsx',
    features: 'Define subscription tiers (Basic, Standard, Premium), pricing, student quota limits, enabled module entitlements.',
    apis: 'GET/POST/PUT /api/v1/superadmin/plans',
    database: 'plans, plan_features',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Configures module feature gates'
  },
  {
    sNo: 4,
    name: 'License Usage & Limits',
    path: '/superadmin/usage',
    rbacKey: 'superadmin',
    component: 'LicenseUsage.jsx',
    features: 'Track student/staff quota consumption per tenant school, overage warnings, storage and API usage monitor.',
    apis: 'GET /api/v1/superadmin/usage',
    database: 'schools, students, staff',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Enforces subscription limits'
  },
  {
    sNo: 5,
    name: 'Support Tickets Desk',
    path: '/superadmin/tickets',
    rbacKey: 'superadmin',
    component: 'SupportTickets.jsx',
    features: 'Receive support inquiries from school administrators, ticket priority (Low/Medium/Urgent), reply threads, resolution status.',
    apis: 'GET/POST/PUT /api/v1/superadmin/tickets',
    database: 'support_tickets, ticket_messages',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Helpdesk ticket resolution center'
  },
  {
    sNo: 6,
    name: 'White-Label Branding Settings',
    path: '/superadmin/branding',
    rbacKey: 'superadmin',
    component: 'BrandingSettings.jsx',
    features: 'Customize portal title, favicon, default theme colors, login branding, platform footer and white-label options.',
    apis: 'GET/PUT /api/v1/superadmin/branding',
    database: 'platform_settings',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'System-wide UI customization'
  },
  {
    sNo: 7,
    name: 'Platform Audit Logs',
    path: '/superadmin/audit-logs',
    rbacKey: 'superadmin',
    component: 'AuditLogs.jsx',
    features: 'Security audit logs, superadmin action logs, login attempts, tenant status changes, IP address tracking.',
    apis: 'GET /api/v1/superadmin/audit-logs',
    database: 'audit_logs',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Compliance & security trace log'
  },
  {
    sNo: 8,
    name: 'Global Noticeboard',
    path: '/superadmin/notices',
    rbacKey: 'superadmin',
    component: 'Noticeboard.jsx',
    features: 'Publish maintenance announcements and platform update alerts to all school administrators.',
    apis: 'GET/POST /api/v1/superadmin/notices',
    database: 'notices',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Global system broadcast alerts'
  },
  {
    sNo: 9,
    name: 'Email Templates Designer',
    path: '/superadmin/email-templates',
    rbacKey: 'superadmin',
    component: 'EmailTemplates.jsx',
    features: 'Design and edit automated email templates for Welcome Email, Password Reset, Admission Confirmation, Invoice Alerts.',
    apis: 'GET/POST/PUT /api/v1/superadmin/email-templates',
    database: 'email_templates',
    status: 'Working - Fully Functional',
    checklist: '[✔] Tested & Verified',
    remarks: 'Integrated with Nodemailer delivery'
  }
];

// 5. System Summary Data
const summaryData = [
  {
    metric: 'Project Name',
    value: 'SchoolTrio (Zuna School Management System)'
  },
  {
    metric: 'Architecture',
    value: 'Full-Stack Multi-Tenant SaaS (Vite/React + Express + PostgreSQL Prisma)'
  },
  {
    metric: 'Authentication & Security',
    value: 'JWT Access Tokens + HttpOnly Refresh Cookies + Bcrypt Hashing + RBAC'
  },
  {
    metric: 'Total Admin Panel Modules',
    value: '27 Modules (All Working & Integrated)'
  },
  {
    metric: 'Total Teacher Panel Modules',
    value: '16 Modules (All Working & Integrated)'
  },
  {
    metric: 'Total Parent Panel Modules',
    value: '14 Modules (All Working & Integrated)'
  },
  {
    metric: 'Total SuperAdmin Modules',
    value: '9 Modules (All Working & Integrated)'
  },
  {
    metric: 'Total Documented Modules',
    value: '66 Distinct Modules'
  },
  {
    metric: 'Overall Working Status',
    value: '100% Operational & Verified'
  },
  {
    metric: 'Date Generated',
    value: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  }
];

// Helper to convert module objects to row arrays
function moduleToRow(m) {
  return [
    m.sNo,
    m.name,
    m.path,
    m.rbacKey,
    m.component,
    m.features,
    m.apis,
    m.database,
    m.status,
    m.checklist,
    m.remarks
  ];
}

const headers = [
  'S.No',
  'Module Name',
  'Route / Path',
  'RBAC Module Key',
  'Frontend Component',
  'Key Features & Description',
  'Backend API Endpoints',
  'Database Tables',
  'Working Status',
  'Checklist Status',
  'Remarks & Notes'
];

const colWidths = [
  { wch: 6 },  // S.No
  { wch: 28 }, // Module Name
  { wch: 24 }, // Route
  { wch: 18 }, // RBAC Key
  { wch: 26 }, // Component
  { wch: 55 }, // Features
  { wch: 40 }, // APIs
  { wch: 32 }, // Database
  { wch: 26 }, // Working Status
  { wch: 20 }, // Checklist
  { wch: 42 }  // Remarks
];

// Create workbook
const wb = XLSX.utils.book_new();

// Sheet 1: Summary Sheet
const summaryRows = [
  ['SCHOOLTRIO SYSTEM - MODULE CHECKLIST & STATUS OVERVIEW'],
  ['Comprehensive audit checklist covering all modules across Admin, Teacher, and Parent portals.'],
  [],
  ['Metric / Dimension', 'Value / Status'],
  ...summaryData.map(d => [d.metric, d.value]),
  [],
  ['PORTAL SUMMARY MATRIX'],
  ['Panel Name', 'Total Modules', 'Operational Status', 'Database Integrated', 'Checklist Verified'],
  ['Admin Panel', adminModules.length, '100% Working', 'PostgreSQL / Prisma', '27 / 27 Verified'],
  ['Teacher Panel', teacherModules.length, '100% Working', 'PostgreSQL / Prisma', '16 / 16 Verified'],
  ['Parent Panel', parentModules.length, '100% Working', 'PostgreSQL / Prisma', '14 / 14 Verified'],
  ['SuperAdmin Panel', superAdminModules.length, '100% Working', 'PostgreSQL / Prisma', '9 / 9 Verified']
];
const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
wsSummary['!cols'] = [{ wch: 38 }, { wch: 50 }, { wch: 24 }, { wch: 24 }, { wch: 24 }];
XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary Overview');

// Sheet 2: Admin Panel
const adminRows = [
  ['ADMIN PANEL - MODULES CHECKLIST & OPERATIONAL STATUS'],
  ['Complete status checklist of all school administration modules and features.'],
  [],
  headers,
  ...adminModules.map(moduleToRow)
];
const wsAdmin = XLSX.utils.aoa_to_sheet(adminRows);
wsAdmin['!cols'] = colWidths;
XLSX.utils.book_append_sheet(wb, wsAdmin, 'Admin Panel');

// Sheet 3: Teacher Panel
const teacherRows = [
  ['TEACHER PANEL - MODULES CHECKLIST & OPERATIONAL STATUS'],
  ['Complete status checklist of all educator and staff modules including classroom workflows and profile security.'],
  [],
  headers,
  ...teacherModules.map(moduleToRow)
];
const wsTeacher = XLSX.utils.aoa_to_sheet(teacherRows);
wsTeacher['!cols'] = colWidths;
XLSX.utils.book_append_sheet(wb, wsTeacher, 'Teacher Panel');

// Sheet 4: Parent Panel
const parentRows = [
  ['PARENT PANEL - MODULES CHECKLIST & OPERATIONAL STATUS'],
  ['Complete status checklist of all parent portal modules covering student tracking, attendance, fees, and communication.'],
  [],
  headers,
  ...parentModules.map(moduleToRow)
];
const wsParent = XLSX.utils.aoa_to_sheet(parentRows);
wsParent['!cols'] = colWidths;
XLSX.utils.book_append_sheet(wb, wsParent, 'Parent Panel');

// Sheet 5: SuperAdmin Panel
const superAdminRows = [
  ['SUPERADMIN PANEL - MODULES CHECKLIST & OPERATIONAL STATUS'],
  ['Complete status checklist of all global platform administration, licensing, multi-tenant and support modules.'],
  [],
  headers,
  ...superAdminModules.map(moduleToRow)
];
const wsSuperAdmin = XLSX.utils.aoa_to_sheet(superAdminRows);
wsSuperAdmin['!cols'] = colWidths;
XLSX.utils.book_append_sheet(wb, wsSuperAdmin, 'SuperAdmin Panel');

// Output file path
const outputPath = path.join(__dirname, '..', 'SchoolTrio_Module_Checklist_Status.xlsx');
XLSX.writeFile(wb, outputPath);
console.log(`Excel checklist successfully generated at: ${outputPath}`);
