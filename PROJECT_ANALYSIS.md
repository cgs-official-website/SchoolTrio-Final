# Project Analysis — School Management System (SMS / Zuna Schools)

## 1. Project Overview

### What the Application Is
The School Management System (branded internally as **Zuna Schools** / **Acme School System**) is a comprehensive, multi-tenant Software-as-a-Service (SaaS) educational ERP and portal. It coordinates administrative governance, academic tracking, staff payroll, transport operations, library cataloging, parent communication, and student admissions within an integrated web environment.

### What Problem It Solves
Educational institutions face significant operational fragmentation: student data resides in physical ledgers or disjointed spreadsheets, fee tracking is separated from enrollment registers, attendance lacks real-time absentee notification to guardians, and parent-teacher communication relies on unmonitored personal messaging apps. 

This platform unifies these workflows into a single system:
- Automates tenant registration and subscription license tracking.
- Partitions every school's operational data into isolated Firestore tenant namespaces.
- Provides real-time attendance marking with automated threshold-based absentee notifications and daily cutoff monitoring.
- Provides unified fee billing, dynamic custom registration links, live parent-teacher instant messaging, digital report card generation, and comprehensive transport/fleet tracking.

### Who Uses It
The platform serves five distinct user personas:
1. **Super Admin (Platform Owner):** Oversees the multi-tenant SaaS ecosystem, provisions pricing plans, approves/rejects newly registered schools, monitors aggregate licensing/storage usage, and reviews platform-wide audit logs and support tickets.
2. **School Admin (Principal / Management / Administrator):** Configures institutional settings, creates classes/sections, manages teacher rosters and dynamic role-based permissions (RBAC), oversees student enrollment, monitors fees, audits staff attendance, and manages infrastructure (transport, inventory, hostel, library).
3. **Teacher / Staff (Educators & Non-Teaching Staff):** Manages class rosters, marks daily session attendance (Forenoon/Afternoon), posts homework and lesson plans, inputs exam marks/grades, logs student behavior/performance metrics, schedules Parent-Teacher Meetings (PTMs), and chats with parents. Non-teaching staff access assigned administrative modules (e.g., Canteen, Transport, Inventory, Payroll).
4. **Parent / Guardian:** Tracks children's academic performance, monitors daily attendance records, views homework assignments, receives school notices, reviews fee invoices and records simulated payments, books PTM slots, submits student leave requests, and chats directly with teachers.
5. **Prospective Students / Leads (Public Visitors):** Apply for admissions online via public forms, submit admission lead inquiries, or self-register using school-specific registration links.

### Primary Purpose
To provide an end-to-end cloud infrastructure for K-12 and collegiate schools that eliminates paperwork, automates administrative overhead, enforces data integrity, and fosters transparent parent-school engagement.

### Major Business Areas & Modules
- **Tenant Management & SaaS Billing:** Multi-tier subscriptions, license limit controls, school approval gates.
- **Academic Governance:** Classes, sections, subjects, timetables, academic calendar, lesson plans.
- **Enrollment & Student Lifecycle:** Public admissions, lead funnels, student records, profile updates, class promotions.
- **Staff & HR/Payroll:** Staff directory, teaching vs. non-teaching classifications, monthly salary slips, attendance, leave approval hierarchy.
- **Attendance & Leave Processing:** Forenoon/Afternoon session attendance, automated 9:30 AM cutoff notifications, chronic absentee flagging, parent/teacher leave request workflows.
- **Examinations & Grading:** Exam term scheduling, marks entry, automated grading scales, report card generation.
- **Fee Management:** Master fee structures, batch invoice generation across class rosters, payment status tracking, revenue KPIs.
- **Communication & Collaboration:** Real-time parent-teacher 1-on-1 chat, group broadcast channels, noticeboard announcements, automated WhatsApp notifications via Meta Cloud API, transactional email delivery via Resend.
- **Logistics & Campus Operations:** Fleet management with Indian vehicle registration validation, route planning, library book issue/return tracking, itemized inventory & asset stock audit logs, canteen food requests.
- **Extensibility & Security:** Drag-and-drop Custom Form/Module Builder, granular Role-Based Access Control (RBAC) permission editor, Cloudinary / Firebase Storage integration, persistent multi-tab offline Firestore caching.

### Overall Application Architecture
The application is structured as a **Serverless Single-Page Application (SPA)** with backend API microservices deployed on **Vercel Serverless Functions**:
- **Client (Frontend):** React 19 SPA bundled by Vite and styled using Tailwind CSS v4. State is handled through React Context, custom hooks, and persistent offline client-side caching (`CacheService`).
- **Database & Identity Layer:** Google Firebase Auth for identity management, Cloud Firestore for persistent multi-tenant NoSQL data, and Firebase Storage + Cloudinary for media/document uploads.
- **Serverless API Engine (`/api`):** Node.js serverless functions running on Vercel that handle privileged operations requiring the Firebase Admin SDK or external third-party API credentials (Meta WhatsApp Cloud API, Resend Email API, and Cron jobs).

```text
+---------------------------------------------------------------------------------------+
|                                    CLIENT TIER                                        |
|  React 19 SPA (Vite 8) + Tailwind CSS v4 + React Router v7 + Framer Motion           |
|                                                                                       |
|  [AuthContext]  <───>  [NotificationContext]  <───>  [CacheService (LocalStorage)]    |
|        │                                                      │                       |
|  [ProtectedRoute] (Role & Permission RBAC Engine via usePermissions)                 |
+--------┬───────────────────────────────┬──────────────────────┬───────────────────────+
         │                               │                      │
         │ Direct Client SDK             │ Direct Client SDK    │ Secure API Calls
         ▼                               ▼                      ▼
+──────────────────────+       +──────────────────+   +─────────────────────────────────+
|   FIREBASE AUTH      |       |  CLOUD FIRESTORE |   |     VERCEL SERVERLESS (/api)    |
| - Email/Password     |       | - schools/{id}/* |   | - /api/send-email (Resend)      |
| - Synthetic Parent   |       | - users/{uid}    |   | - /api/whatsapp-service (Meta)  |
|   Admission Auth     |       | - plans, settings|   | - /api/check-attendance-cutoff  |
+──────────────────────+       +─────────┬────────+   | - /api/forgot-password          |
                                         │            +────────────────┬────────────────+
                                         ▼                             │
                               +──────────────────+                    │ Privileged Admin SDK
                               | FIREBASE STORAGE | <──────────────────+
                               | & CLOUDINARY     |
                               +──────────────────+
```

---

## 2. Technology Stack

### Frontend
- **React Version:** `19.2.7` (latest React engine with native concurrent features).
- **DOM Engine:** `react-dom: 19.2.7`.
- **Build Tool:** `vite: 8.1.1` with `@vitejs/plugin-react: 6.0.3`.
- **Language:** JavaScript (ESNext, JSX modules).
- **Styling / CSS Framework:** `tailwindcss: 4.3.2` with `@tailwindcss/vite: 4.3.2`, `postcss: 8.5.16`, `autoprefixer: 10.5.2`, `tailwind-merge: 3.6.0`, and `clsx: 2.1.1`.
- **Routing:** `react-router-dom: 7.18.1` (client-side browser router supporting nested routes, lazy loading, and programmatic navigation).
- **State Management:** React Context API (`AuthContext`, `NotificationContext`), coupled with custom persistence wrapper (`CacheService` using `localStorage` and memory maps).
- **Icons:** `lucide-react: 1.23.0` and `react-icons: 5.7.0` (specifically using `react-icons/lu` and `react-icons/fi`).
- **Animation Libraries:** `framer-motion: 12.42.2` (for smooth page transitions, modal reveals, and accordion behaviors).
- **3D Graphics:** `three: 0.185.1`, `@react-three/fiber: 9.6.1`, `@react-three/drei: 10.7.7` (used in landing page interactive 3D hero assets).
- **Calendar & Scheduling:** `react-big-calendar: 1.20.0` with `date-fns: 4.4.0`.
- **Rich Text Editor:** `react-quill-new: 3.7.0` (used for noticeboard content formatting).
- **Image Cropping & Manipulation:** `react-easy-crop: 6.2.3`.
- **Toast Notifications:** `react-hot-toast: 2.6.0`.
- **Export & Document Generation:**
  - `xlsx: 0.18.5` (Excel workbook export and import processing).
  - `jspdf: 4.2.1` with `jspdf-autotable: 5.0.8` (client-side PDF generation for ID cards, admission forms, and fee receipts).
- **Linter & Code Quality:** `oxlint: 1.71.0` with `.oxlintrc.json`.

### Backend
- **Firebase Client SDK:** `firebase: 12.16.0` (Modular v9/v10+ SDK imports).
- **Firebase Admin SDK:** `firebase-admin: 10.3.0` (executing inside Node.js serverless functions).
- **Serverless Hosting Environment:** Vercel Functions (`/api/*.js`) with Node.js runtime, configured via `vercel.json`.

### Database
- **Cloud Firestore:**
  - Multi-tab offline persistence enabled via `initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })` (`src/firebase/config.js`).
  - Hierarchical multi-tenant subcollections under `schools/{schoolId}/*`.
- **Firebase Realtime Database:** Present in `.env` configuration (`VITE_FIREBASE_DATABASE_URL`), primarily reserved for presence or legacy sync.
- **Firebase Cloud Storage:** Bucket `school-management-system-6a2c4.firebasestorage.app` for secure file storage.

### Authentication
- **Firebase Authentication (`firebase/auth`):**
  - Email/Password authentication for Super Admins, School Admins, and Staff/Teachers.
  - Synthetic Email Generation for Parents (`{admissionNumber}@parent.School.com`) to enable password-based parent logins without requiring personal email uniqueness.
  - Auth state persistence handled by Firebase SDK + local optimistic caching.
  - Admin SDK password reset link generation with custom branded Resend emails (`/api/forgot-password.js`).

### External Integrations
- **Resend API (`resend: 6.17.2`):** Delivers transactional emails (Welcome, Password Reset, School Account Approval) from verified domain `Team Carrezza <admin@teamcarrezza.com>`.
- **Meta WhatsApp Cloud API (Graph API v19.0):** Dispatches automated Parent-Teacher Meeting (PTM) alerts and Noticeboard notifications directly to parents' mobile phones.
- **Cloudinary API:** Handles image/document uploads (student photos, registration certificates, custom form attachments) via direct unauthenticated POST to `https://api.cloudinary.com/v1_1/{cloudName}/auto/upload` using client upload presets.

---

## 3. Project Structure

```text
c:\Projects\SMS\
├── .env                                  # Client & serverless environment variables
├── .oxlintrc.json                        # Oxlint configuration
├── api/                                  # Vercel Serverless Functions (Node.js runtime)
│   ├── check-attendance-cutoff.js        # Scheduled/automated attendance cutoff & stat recomputation
│   ├── forgot-password.js                # Admin SDK password reset & custom email dispatch
│   ├── send-email.js                     # Generic transactional email dispatcher via Resend
│   └── whatsapp-service.js               # Meta WhatsApp Cloud API dispatcher & test runner
├── public/                               # Static assets (favicons, logos, manifests)
├── src/
│   ├── main.jsx                          # React application entry point (DOM root rendering)
│   ├── App.jsx                           # Root router definition & route guards
│   ├── index.css                         # Global CSS & Tailwind v4 theme styling
│   ├── assets/                           # Bundled graphic assets
│   ├── components/                       # Shared reusable UI & layout components
│   │   ├── AcademicCalendar.jsx          # Event calendar wrapping react-big-calendar
│   │   ├── Captcha.jsx                   # Mathematical/alphanumeric visual verification widget
│   │   ├── ChatInput.jsx                 # Text & voice recording message input bar
│   │   ├── ConfirmModal.jsx              # Modal confirmation dialog for destructive actions
│   │   ├── CustomAudioPlayer.jsx         # Audio playback bar for recorded voice notes
│   │   ├── CustomFieldsRenderer.jsx      # Dynamic form renderer for custom module fields
│   │   ├── ExportModal.jsx               # Column selection modal for Excel/PDF exports
│   │   ├── FilePreviewModal.jsx          # Inline document & image viewer
│   │   ├── ImageCropper.jsx              # Avatar cropping interface using react-easy-crop
│   │   ├── NoticeFeed.jsx                # Modular notice list widget
│   │   ├── PermissionGuard.jsx           # Granular RBAC permission check component
│   │   ├── ProtectedRoute.jsx            # Role and module route gatekeeper
│   │   ├── RaiseTicketModal.jsx          # SuperAdmin support ticket creation modal
│   │   ├── Skeleton.jsx                  # UI loading skeleton placeholders
│   │   ├── TopNavbar.jsx                 # Universal dashboard header with profile & notifications
│   │   └── ZunaLogo.jsx                  # Branded SVG logo component
│   ├── context/                          # React context providers
│   │   ├── AuthContext.jsx               # Current user, cached profile, and auth listener
│   │   └── NotificationContext.jsx       # Real-time unread badge listeners across modules
│   ├── firebase/                         # Firebase client configuration & services
│   │   ├── config.js                     # Firebase app, auth, db, and storage initialization
│   │   ├── auth.js                       # Auth methods (login, register, synthetic parent auth, profile)
│   │   ├── firestore.js                  # Master Firestore query, batch, and mutation service (~2100 lines)
│   │   └── schema.js                     # Type definitions for background collections & stats
│   ├── hooks/                            # Custom React hooks
│   │   ├── usePermissions.js             # Real-time staff RBAC permission evaluator
│   │   └── useSchoolBranding.js          # Dynamic browser title & favicon updater
│   ├── lib/                              # Email layout generators
│   │   └── emailTemplates.js             # HTML email templates (Welcome, Reset, Approval)
│   ├── pages/                            # Main application route views
│   │   ├── LandingPage.jsx               # Public marketing landing page with 3D canvas
│   │   ├── LoginPage.jsx                 # Unified email / admission number login portal
│   │   ├── ForgotPassword.jsx            # Password reset request screen
│   │   ├── SchoolRegistration.jsx        # Multi-step school onboarding & plan calculator
│   │   ├── TeacherRegistration.jsx       # Staff invite redemption & registration screen
│   │   ├── ParentRegistration.jsx        # Parent admission-number onboarding screen
│   │   ├── PublicAdmissionForm.jsx       # Public student admission submission form
│   │   ├── PublicLeadForm.jsx            # Public lead inquiry form generated dynamically
│   │   ├── PendingApproval.jsx           # Screen shown to schools awaiting SuperAdmin approval
│   │   ├── Unauthorized.jsx              # 403 Forbidden error screen
│   │   ├── NotFound.jsx                  # 404 Not Found error screen
│   │   ├── SuperAdminDashboard.jsx       # SuperAdmin layout container
│   │   ├── SuperAdmin/                   # SuperAdmin modules (Tenants, Plans, Usage, Tickets, Logs)
│   │   ├── AdminDashboard.jsx            # School Admin layout container (Sidebar + TopNav)
│   │   ├── Admin/                        # School Admin modules (31 dedicated feature views)
│   │   ├── TeacherDashboard.jsx          # Teacher layout container
│   │   ├── Teacher/                      # Teacher modules (Roster, Attendance, Grades, Homework, etc.)
│   │   ├── ParentDashboard.jsx           # Parent layout container (Child switcher + Sidebar)
│   │   └── Parent/                       # Parent modules (Overview, Grades, Fees, Attendance, etc.)
│   ├── services/                         # Client-side API wrappers & local caching
│   │   ├── CacheService.js               # Tenant-isolated LocalStorage and memory cache engine
│   │   ├── emailService.js               # Dispatcher to /api/send-email with client fallback
│   │   └── whatsappService.js            # Dispatcher to /api/whatsapp-service with auth token injection
│   └── utils/                            # Helper utilities
│       ├── classSorting.js               # Numeric & alphanumeric natural class name sorting
│       ├── cloudinary.js                 # Cloudinary upload handler with Firebase Storage fallback
│       ├── cropImage.js                  # Canvas image cropping helper
│       ├── dateUtils.js                  # Standardized date formatting utilities
│       ├── genderUtils.js                # Gender normalization helpers
│       └── validationUtils.js            # Input validation regexes (Names, DOB, Blood Groups, Aadhaar, Vehicles)
├── tests/                                # Test suites (Selenium WebDriver automation & Mocha tests)
├── vercel.json                           # Vercel deployment routes and SPA rewrites
└── vite.config.js                        # Vite build configuration with React & Tailwind plugins
```

---

## 4. Application Modules / Features

| Module | Purpose | Main Users | Main Actions | Important Screens |
| :--- | :--- | :--- | :--- | :--- |
| **Authentication & Onboarding** | Multi-persona entry, synthetic auth for parents, school registration. | All Users | Register, Login, Reset Password, Redeem Invites | `LoginPage.jsx`, `SchoolRegistration.jsx`, `TeacherRegistration.jsx`, `ParentRegistration.jsx` |
| **Tenant & License Governance** | SaaS tenant approval, license limits, tier pricing, platform audits. | Super Admin | Approve/Reject Tenants, Modify Limits, Edit Pricing, Audit Platform | `SuperAdmin/TenantManagement.jsx`, `PlanManagement.jsx`, `LicenseUsage.jsx` |
| **Environment Setup & Branding** | School configuration, logo/favicon setup, attendance cutoff, API keys. | Admin | Configure School Info, Set 9:30 Cutoff, Input Cloudinary/WhatsApp Keys | `Admin/EnvironmentSetup.jsx` |
| **Class & Subject Setup** | Class/section provisioning and master subject registry. | Admin, Staff | Create/Edit/Delete Classes & Sections, Assign Subjects | `Admin/ClassManagement.jsx`, `Admin/SubjectManagement.jsx` |
| **Student Lifecycle & Directory** | Student records, Aadhaar/DOB validation, bulk imports, promotion. | Admin, Staff | Add/Edit/View Students, Bulk Excel Import/Export, Class Promotion | `Admin/StudentManagement.jsx`, `PublicAdmissionForm.jsx` |
| **Staff & HR/Payroll** | Staff roster, teaching vs non-teaching roles, salary slip generation. | Admin, Staff, Teacher | Add/Edit Staff, Assign Roles, Generate Salaries, Download Salary Slips | `Admin/StaffAssignment.jsx`, `Admin/HRPayrollManagement.jsx`, `Teacher/MySalary.jsx` |
| **Attendance Tracking & Cutoff** | Session attendance (FN/AN), cutoff enforcement, absentee flagging. | Admin, Teacher, Parent | Mark Attendance, Override Status, Export Monthly Registers, View Logs | `Teacher/Attendance.jsx`, `Admin/Attendance.jsx`, `Parent/Attendance.jsx` |
| **Leave Management** | Teacher and student leave request submission and approval workflow. | Admin, Teacher, Parent | Submit Leave, Attach Proof, Approve/Reject Requests, Audit Status | `Admin/LeaveManagement.jsx`, `Teacher/LeaveRequests.jsx`, `Parent/LeaveRequests.jsx` |
| **Fee Billing & Payments** | Fee structure creation, batch invoice generation, payment tracking. | Admin, Parent | Create Fees, Generate Invoices, Record Cash/Online Payments, View KPIs | `Admin/FeeManagement.jsx`, `Parent/Fees.jsx` |
| **Exams & Report Cards** | Exam scheduling, mark entry, grade calculation, PDF report card generation. | Admin, Teacher, Parent | Create Exams, Enter Marks, Print Report Cards, View Grades | `Admin/ExamManagement.jsx`, `Teacher/Grades.jsx`, `Parent/Grades.jsx` |
| **Homework & Lesson Plans** | Homework assignment, submission tracking, curriculum lesson planning. | Admin, Teacher, Parent | Create Homework, Attach Files, Plan Syllabus, Track Completion | `Teacher/HomeworkManagement.jsx`, `Admin/AdminHomework.jsx`, `Parent/HomeworkOverview.jsx` |
| **Communication & Chat** | Real-time 1-on-1 parent-teacher chat, audio notes, group channels. | Admin, Teacher, Parent | Send Messages, Record Voice Notes, Mark Read, Monitor Chats | `Teacher/Chat.jsx`, `Parent/Chat.jsx`, `Admin/ChatMonitor.jsx` |
| **Noticeboard & Broadcast** | Announcements with Rich Text, WhatsApp notification trigger. | Admin, Teacher, Parent | Publish Notices, Select Audience, Trigger WhatsApp Messages | `Admin/Noticeboard.jsx`, `Teacher/TeacherNoticeboard.jsx`, `Parent/ParentNoticeboard.jsx` |
| **Parent-Teacher Meetings (PTM)** | Booking meeting slots, scheduling conferences, WhatsApp confirmations. | Teacher, Parent | Schedule PTM, Request Reschedule, Send WhatsApp Reminder | `Teacher/PTMScheduler.jsx`, `Parent/PTM.jsx` |
| **Fleet & Transport** | Bus routes, pickup stops, Indian vehicle registration validation. | Admin, Staff, Teacher | Add Vehicles, Plan Routes, Assign Students, View Pickup Stops | `Admin/TransportManagement.jsx`, `Teacher/TransportDetails.jsx` |
| **Library Management** | Cataloging books, tracking availability, issuing and returning books. | Admin, Staff | Add Books, Manage Categories, Issue Books to Students, Record Returns | `Admin/LibraryManagement.jsx` |
| **Inventory & Asset Auditing** | Campus asset tracking, stock adjustments, audit transaction logs. | Admin, Staff | Add Inventory Items, Record Stock In/Out, Review Audit Logs | `Admin/InventoryManagement.jsx`, `Admin/InventoryAuditLogs.jsx` |
| **Canteen & Meal Management** | Daily menu publishing, student/staff canteen meal requests. | Admin, Staff, Parent | Set Menu, Submit Meal Requests, Approve/Process Orders | `Admin/CanteenManagement.jsx`, `Parent/Canteen.jsx` |
| **Admissions & Leads CRM** | Public lead capture forms, admission pipeline, lead conversion. | Admin, Staff | Build Lead Forms, Review Inquiries, Convert Leads to Students | `Admin/LeadsManagement.jsx`, `Admin/FormBuilder.jsx`, `PublicLeadForm.jsx` |
| **Roles & Permissions (RBAC)** | Dynamic custom roles with fine-grained CRUD module permissions. | Admin | Create Roles, Toggle Read/Create/Edit/Delete per Module, Assign Roles | `Admin/RolesPermissions.jsx` |
| **Custom Form & Module Builder** | Drag-and-drop form designer for dynamic school modules. | Admin | Design Modules, Add Dynamic Fields, Render Custom Tables | `Admin/FormBuilder.jsx`, `Admin/CustomModuleView.jsx` |

---

## 5. User Roles & Permissions

### System Roles Defined in Code
1. **`superadmin`**: Platform administrator. Defined globally in `users/{uid}` with `role: 'superadmin'`.
2. **`admin`**: Primary tenant administrator. Has implicit unrestricted access (`permissions = 'ALL'`) across all subcollections belonging to their `schoolId`.
3. **`teacher`**: Academic educator. Linked to `schools/{schoolId}/teachers` where `userId == uid`. Can have teaching or non-teaching privileges.
4. **`staff`**: Non-teaching or administrative staff member (e.g., Accountant, Librarian, Transport In-charge, Canteen Manager). Evaluates RBAC permissions dynamically.
5. **`parent`**: Guardian of one or more students. Identified by `role: 'parent'`, linked to student profiles via `linkedStudentId` and `linkedStudents` array.

### RBAC Permission Engine (`src/hooks/usePermissions.js`)
For non-admin staff (`teacher`, `staff`), permissions are evaluated dynamically:
1. The hook queries `schools/{schoolId}/teachers` matching `currentUser.uid`.
2. It retrieves the staff member's assigned roles array (`staffData.roles` or `staffData.role`).
3. It sets up an `onSnapshot` listener on `schools/{schoolId}/roles`.
4. It iterates over the assigned role documents and merges the permission matrix into:
   ```javascript
   merged[moduleKey] = { read: boolean, create: boolean, edit: boolean, delete: boolean }
   ```
5. If `userProfile.role === 'admin'`, `canRead`, `canCreate`, `canEdit`, and `canDelete` always return `true`.

### Permissions Matrix

| Feature / Module | SuperAdmin | School Admin | Teacher | Staff (Custom RBAC) | Parent |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Platform Overview & Tenants** | ✓ | ✗ | ✗ | ✗ | ✗ |
| **SaaS Pricing Plans & Limits** | ✓ | ✗ | ✗ | ✗ | ✗ |
| **School Environment Setup** | ✗ | ✓ | ✗ | ✗ | ✗ |
| **Roles & RBAC Management** | ✗ | ✓ | ✗ | ✗ | ✗ |
| **Staff Directory & Invites** | ✗ | ✓ | Read-Only | Via RBAC | ✗ |
| **Classes & Subject Setup** | ✗ | ✓ | Read-Only | Via RBAC | ✗ |
| **Student Directory** | ✗ | ✓ | Assigned Class | Via RBAC | Own Child Only |
| **Mark Daily Attendance** | ✗ | ✓ (Override) | Assigned Class | Via RBAC | ✗ |
| **View Attendance Logs** | ✗ | ✓ | ✓ | Via RBAC | Own Child Only |
| **Submit Leave Requests** | ✗ | ✗ | ✓ (Self) | ✓ (Self) | ✓ (Child) |
| **Approve Leave Requests** | ✗ | ✓ | ✗ | Via RBAC | ✗ |
| **Fee Structure & Billing** | ✗ | ✓ | ✗ | Via RBAC | ✗ |
| **View & Pay Invoices** | ✗ | ✓ | ✗ | Via RBAC | Own Child Only |
| **Create Exams & Grade** | ✗ | ✓ | Assigned Class | Via RBAC | ✗ |
| **View Grades / Report Cards** | ✗ | ✓ | Assigned Class | Via RBAC | Own Child Only |
| **Create Homework** | ✗ | ✓ | Assigned Class | Via RBAC | ✗ |
| **View Homework** | ✗ | ✓ | ✓ | Via RBAC | Own Child Only |
| **Noticeboard Publish** | ✗ | ✓ | Class Notice | Via RBAC | ✗ |
| **Noticeboard View** | ✗ | ✓ | ✓ | ✓ | ✓ |
| **1-on-1 Parent-Teacher Chat** | ✗ | Monitor Only | Assigned Class | ✗ | Assigned Teacher |
| **PTM Scheduling** | ✗ | ✓ | Assigned Class | Via RBAC | Request / Accept |
| **Transport & Fleet** | ✗ | ✓ | View Bus Info | Via RBAC | View Bus Info |
| **Library Catalog & Issue** | ✗ | ✓ | ✗ | Via RBAC | ✗ |
| **Inventory & Audit Logs** | ✗ | ✓ | ✗ | Via RBAC | ✗ |
| **HR & Payroll Processing** | ✗ | ✓ | View Own Salary | Via RBAC | ✗ |
| **Admissions & Lead CRM** | ✗ | ✓ | ✗ | Via RBAC | ✗ |
| **Custom Module Builder** | ✗ | ✓ | ✗ | ✗ | ✗ |

---

## 6. Complete Application Navigation

```text
Public / Root
├── / (LandingPage.jsx - Marketing, 3D Hero, Pricing)
├── /login (LoginPage.jsx - Email or Admission Number)
├── /forgot-password (ForgotPassword.jsx - Custom Email Reset)
├── /register (SchoolRegistration.jsx - Multi-step Onboarding)
├── /admission/:schoolId (PublicAdmissionForm.jsx)
├── /leads/form/:schoolId/:formId (PublicLeadForm.jsx)
├── /register/teacher/:schoolId (TeacherRegistration.jsx - Invite Redemption)
├── /register/parent/:schoolId (ParentRegistration.jsx)
├── /unauthorized (Unauthorized.jsx - 403)
└── /404 (NotFound.jsx - 404)

Super Admin (/superadmin -> SuperAdminDashboard.jsx)
├── /superadmin (Overview.jsx)
├── /superadmin/tenants (TenantManagement.jsx, TenantsList.jsx, TenantDetails.jsx)
├── /superadmin/billing (PlanManagement.jsx, SubscriptionsList.jsx)
├── /superadmin/license-usage (LicenseUsage.jsx)
├── /superadmin/support-tickets (SupportTickets.jsx)
├── /superadmin/audit-logs (AuditLogs.jsx)
└── /superadmin/email-templates (EmailTemplates.jsx)

School Admin (/admin -> AdminDashboard.jsx)
├── /admin/pending (PendingApproval.jsx - Awaiting SuperAdmin verification)
├── /admin (AdminOverview.jsx)
├── /admin/setup (EnvironmentSetup.jsx - Admin only)
├── /admin/links (LinkGenerator.jsx - Admin only)
├── /admin/roles (RolesPermissions.jsx - Admin only)
├── /admin/api (APIIntegrations.jsx - Admin only)
├── /admin/upgrade (UpgradePlan.jsx - Admin only)
├── /admin/billing (BillingDashboard.jsx - moduleKey: 'billing')
├── /admin/classes (ClassManagement.jsx - moduleKey: 'classes')
├── /admin/subjects (SubjectManagement.jsx - moduleKey: 'subjects')
├── /admin/students (StudentManagement.jsx - moduleKey: 'students')
├── /admin/staff (StaffAssignment.jsx - moduleKey: 'staff')
├── /admin/attendance (Attendance.jsx - moduleKey: 'attendance')
├── /admin/leaves (LeaveManagement.jsx - moduleKey: 'leaves')
├── /admin/fees (FeeManagement.jsx - moduleKey: 'fees')
├── /admin/timetables (TimetableManagement.jsx - moduleKey: 'timetables')
├── /admin/calendar (Calendar.jsx -> AcademicCalendar.jsx - moduleKey: 'calendar')
├── /admin/exams (ExamManagement.jsx - moduleKey: 'exams')
├── /admin/homework (AdminHomework.jsx - moduleKey: 'homework')
├── /admin/notices (Noticeboard.jsx - moduleKey: 'noticeboard')
├── /admin/chats (ChatMonitor.jsx - moduleKey: 'chats')
├── /admin/transport (TransportManagement.jsx - moduleKey: 'transport')
├── /admin/library (LibraryManagement.jsx - moduleKey: 'library')
├── /admin/inventory (InventoryManagement.jsx - moduleKey: 'inventory')
├── /admin/inventory/audit-logs (InventoryAuditLogs.jsx - moduleKey: 'inventory')
├── /admin/hr-payroll (HRPayrollManagement.jsx - moduleKey: 'hr-payroll')
├── /admin/reports (ReportsAnalytics.jsx - moduleKey: 'reports')
├── /admin/leads (LeadsManagement.jsx - moduleKey: 'leads')
├── /admin/canteen (CanteenManagement.jsx - moduleKey: 'canteen')
├── /admin/form-builder (FormBuilder.jsx - moduleKey: 'form-builder')
└── /admin/custom/:moduleId (CustomModuleView.jsx)

Teacher (/teacher -> TeacherDashboard.jsx)
├── /teacher (ClassRoster.jsx)
├── /teacher/profile (ProfileSetup.jsx)
├── /teacher/attendance (Attendance.jsx - moduleKey: 'attendance')
├── /teacher/homework (HomeworkManagement.jsx - moduleKey: 'homework')
├── /teacher/grades (Grades.jsx - moduleKey: 'exams')
├── /teacher/notices (TeacherNoticeboard.jsx - moduleKey: 'noticeboard')
├── /teacher/calendar (Calendar.jsx -> AcademicCalendar.jsx - moduleKey: 'calendar')
├── /teacher/timetable (TeacherTimetable.jsx - moduleKey: 'timetables')
├── /teacher/lesson-plans (LessonPlans.jsx - moduleKey: 'lesson_plans')
├── /teacher/performance (PerformanceTracking.jsx - moduleKey: 'performance')
├── /teacher/resources (ResourceSharing.jsx - moduleKey: 'resources')
├── /teacher/ptm (PTMScheduler.jsx - moduleKey: 'ptm')
├── /teacher/leaves (LeaveRequests.jsx - moduleKey: 'leaves')
├── /teacher/salary (MySalary.jsx - moduleKey: 'hr-payroll')
├── /teacher/transport (TransportDetails.jsx - moduleKey: 'transport')
└── /teacher/chat (Chat.jsx - moduleKey: 'chats')

Parent (/parent -> ParentDashboard.jsx)
├── /parent (StudentOverview.jsx)
├── /parent/children (MyChildren.jsx - Multi-child overview & linking)
├── /parent/attendance (Attendance.jsx)
├── /parent/homework (HomeworkOverview.jsx)
├── /parent/grades (Grades.jsx)
├── /parent/performance (Performance.jsx)
├── /parent/ptm (PTM.jsx)
├── /parent/fees (Fees.jsx)
├── /parent/notices (ParentNoticeboard.jsx)
├── /parent/calendar (Calendar.jsx -> AcademicCalendar.jsx)
├── /parent/canteen (Canteen.jsx)
├── /parent/leaves (LeaveRequests.jsx)
└── /parent/chat (Chat.jsx)
```

---

## 7. Authentication Workflow

```text
                       [ User Opens Application ]
                                   │
                                   ▼
                     [ onAuthStateChanged Triggered ]
                                   │
                     ┌─────────────┴─────────────┐
                     ▼                           ▼
            [ No Firebase User ]       [ User Authenticated ]
                     │                           │
                     │                           ▼
                     │                 [ Check Local Cache ]
                     │                 (userProfile_{uid})
                     │                           │
                     │                 ┌─────────┴─────────┐
                     │                 ▼                   ▼
                     │            [ Found ]          [ Not Found ]
                     │                 │                   │
                     │                 ▼                   ▼
                     │           [ Render UI ]      [ Show GlobalLoader ]
                     │          (Instant Unblock)          │
                     │                 │                   │
                     │                 └─────────┬─────────┘
                     │                           │
                     │                           ▼
                     │                 [ Fetch from Firestore ]
                     │                     users/{uid}
                     │                           │
                     │                 ┌─────────┴─────────┐
                     │                 ▼                   ▼
                     │            [ Exists ]         [ Not Found ]
                     │                 │                   │
                     │                 ▼                   ▼
                     │          [ Resolve Role ]     [ Navigate /404 ]
                     │                 │
                     │                 ▼
                     │          [ Update Cache ]
                     │                 │
                     │                 ▼
                     │       [ ProtectedRoute Check ]
                     │                 │
                     │        ┌────────┴────────┐
                     │        ▼                 ▼
                     │   [ Authorized ]   [ Unauthorized ]
                     │        │                 │
                     │        ▼                 ▼
                     │   [ Destination ]   [ Navigate /unauthorized ]
                     ▼
             [ Public Routes ]
       (Landing, Login, Register)
```

### Exact Authentication Mechanisms Used
1. **Email/Password Login:**
   - Handled by `loginUser(email, password)` via `signInWithEmailAndPassword(auth, email, password)`.
2. **Admission Number Login for Parents:**
   - Handled by `loginWithAdmissionNumber(admissionNumber, password)`.
   - The system synthesizes an email format:
     ```javascript
     const clean = admissionNumber.replace(/[^a-zA-Z0-9]/g, '');
     const syntheticEmail = `${clean}@parent.School.com`.toLowerCase();
     ```
   - Authenticates against Firebase Auth using `syntheticEmail` and the parent's chosen password. This guarantees unauthenticated clients never query Firestore to look up email addresses by admission number.
3. **Optimistic Caching & Background Profile Sync (`AuthContext.jsx`):**
   - On auth change, `CacheService.getPersistent('global', `userProfile_${user.uid}`)` unblocks the UI immediately if previously cached.
   - In parallel, `getUserProfile(user.uid)` fetches the latest profile from `users/{uid}` in Firestore.
   - If user is a `teacher` or `staff`, queries `schools/{schoolId}/teachers` where `userId == uid` to resolve `assignedClassId`, normalize non-teaching staff roles, and fetch the role document to check `loginPanel`.
   - Updates `userProfile` state and updates `CacheService`.
4. **Logout Behavior:**
   - Calls `logoutUser()` which executes `signOut(auth)`.
   - Clears `currentUser` and `userProfile` in `AuthContext`.
   - Clears tenant cache via `CacheService.clearTenant(schoolId)`.
   - Redirects the browser to `/login`.

---

## 8. Detailed Feature Workflows

### 8.1 Feature: Daily Attendance Marking & Cutoff Warning
- **Starting Point:** Teacher clicks *Attendance* in Teacher Dashboard (`/teacher/attendance`).
- **Workflow:**
  1. Teacher selects the target Date (defaults to current date) and Session (`FN` - Forenoon or `AN` - Afternoon).
  2. The system queries `schools/{schoolId}/students` for the teacher's assigned class (`assignedClassId`).
  3. The system checks if `schools/{schoolId}/attendance/{classId}_{dateString}` already exists.
  4. If record exists, statuses are loaded. If no record exists, every student is defaulted to `Present`.
  5. Teacher toggles absentees or late arrivals (`Present` -> `Absent` -> `Late`).
  6. Teacher clicks "Save Attendance".
  7. System executes `saveAttendance()` in `src/firebase/firestore.js`:
     - Writes to `schools/{schoolId}/attendance/{classId}_{dateString}`.
     - Calls `updateStudentRunningStatsAndFlags()`:
       - Recalculates student's cumulative year percentage in `schools/{schoolId}/attendanceStats/{studentId}`.
       - Compares monthly absences against `absenteeThreshold` (configured in `schools/{schoolId}/config/attendanceSettings`, default: 2).
       - If absences >= threshold, creates/updates `schools/{schoolId}/absenteeFlags/{studentId}_{month}`.
     - Calls `recomputeDashboardStats()`:
       - Updates `schools/{schoolId}/dashboardStats/{dateStr}` with aggregate present/absent/late counts for school-wide, by-grade, and by-section metrics.
- **Automated Cutoff Check (`/api/check-attendance-cutoff.js`):**
  - Runs daily via cron or trigger.
  - Checks if school local time is past `cutoffTime` (default `09:30`).
  - Iterates over all active classes. If no attendance record exists for today, creates an unread notification in `schools/{schoolId}/notifications` with `type: 'attendance_pending'` and `message: '{Class Name} attendance not marked'`.

### 8.2 Feature: Master Fee Assignment & Invoice Provisioning
- **Starting Point:** Admin clicks *Fees & Payments* (`/admin/fees`) -> "Assign New Fee".
- **Workflow:**
  1. Admin specifies `name` (e.g., "Term 1 Tuition"), `amount` (e.g., 5000), `dueDate`, and selects a `classId`.
  2. Form submits to `createFeeStructure(schoolId, feeData)`.
  3. System creates the master document in `schools/{schoolId}/feeStructures`.
  4. System executes a query on `schools/{schoolId}/students` where `assignedClassId == classId`.
  5. Using a Firestore `writeBatch`, the system provisions individual invoice documents in `schools/{schoolId}/invoices` for every enrolled student:
     - Document fields: `{ studentId, feeId, feeName, amount, dueDate, status: 'Pending', createdAt }`.
  6. Batch commits atomically. Real-time listeners on both Admin and Parent portals instantly display the pending invoices.
- **Payment Recording:**
  - Admin clicks "Record Payment" or Parent clicks "Pay Now" (simulated checkout).
  - Calls `markInvoicePaid(schoolId, invoiceId)`.
  - Updates invoice with `{ status: 'Paid', paidAt: ISOString }`.
  - KPI cards (Total Expected, Collected, Outstanding) re-aggregate in real time.

### 8.3 Feature: Parent-Teacher Communication & Audio Voice Notes
- **Starting Point:** Parent opens `/parent/chat` or Teacher opens `/teacher/chat`.
- **Workflow:**
  1. Room ID is resolved as `{studentId}_{teacherId}` under `schools/{schoolId}/chats/{roomId}`.
  2. `subscribeToMessages()` establishes a Firestore `onSnapshot` listener on the subcollection `messages` ordered by `createdAt` ascending.
  3. If user records a voice note:
     - MediaStream captures audio via `MediaRecorder` API.
     - Audio blob is passed to `uploadChatMedia(schoolId, roomId, blob)`.
     - Uploads to Cloudinary or Firebase Storage (`Schools/{schoolId}/Chats/{roomId}/{timestamp}.webm`).
  4. Client calls `sendMessage(schoolId, studentId, teacherId, parentId, senderId, senderRole, text, mediaUrl, mediaType)`.
  5. Creates document in `schools/{schoolId}/chats/{roomId}/messages`.
  6. Increments recipient's unread badge count (`unreadCount_parent` or `unreadCount_teacher`).
  7. When recipient opens room, calls `markChatRead()`, resetting their respective counter to 0.

### 8.4 Feature: Leave Application & Approval Hierarchy
- **Starting Point:** Teacher visits `/teacher/leaves` or Parent visits `/parent/leaves`.
- **Workflow:**
  1. Applicant clicks "Request Leave", selects leave type (`Annual`, `Sick`, `Maternity`, `Paternity`, `Others`), dates, and reason.
  2. If file attached, validates size and uploads to storage.
  3. Submits document to `schools/{schoolId}/leaves` with `status: 'Pending'`.
  4. Creates notification in `schools/{schoolId}/notifications` with `type: 'leave_submitted'`.
  5. School Admin opens `/admin/leaves`, sees pending request with animated amber badge.
  6. Admin clicks **Approve** or **Reject**.
  7. Firestore updates `status: 'Approved'` or `status: 'Rejected'`.
  8. Applicant's dashboard updates in real time via active `onSnapshot` subscription.

---

## 9. CRUD Operations Matrix

| Entity | Storage Path | Create | Read | Update | Delete | Search & Filters |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| **School Tenant** | `schools/{schoolId}` | SuperAdmin / Register | All Auth | SuperAdmin / Admin | SuperAdmin | Status, Name, Date |
| **User Profile** | `users/{uid}` | Register / Invites | Self / Admin | Self / Admin | SuperAdmin | Email, Role, School |
| **Class & Section** | `schools/{id}/classes` | Admin | School Staff | Admin | Admin | Name, Grade, Section |
| **Subject** | `schools/{id}/subjects` | Admin | School Staff | Admin | Admin | Subject Name, Code |
| **Student** | `schools/{id}/students` | Admin / Public Form | School Staff / Parent | Admin / Staff | Admin | Name, Admission No, Roll No, Class |
| **Staff / Teacher** | `schools/{id}/teachers` | Admin | School Staff | Admin / Staff | Admin | Name, Emp ID, Department, Role |
| **Daily Attendance** | `schools/{id}/attendance` | Teacher / Admin | School Staff / Parent | Teacher / Admin | Admin | Class, Date Session |
| **Leave Request** | `schools/{id}/leaves` | Teacher / Parent | Applicant / Admin | Admin (Status) | Admin | Status (Pending/History), Role |
| **Fee Structure** | `schools/{id}/feeStructures` | Admin | Admin | Admin | Admin | Class, Date |
| **Invoice** | `schools/{id}/invoices` | Auto Batch Write | Admin / Parent | Admin / Parent | Admin | Student, Fee Name, Status |
| **Transport Route** | `schools/{id}/transportRoutes` | Admin | School Staff | Admin | Admin | Route Name, Vehicle No |
| **Vehicle** | `schools/{id}/vehicles` | Admin | School Staff | Admin | Admin | Reg Number, Vehicle Model |
| **Book** | `schools/{id}/books` | Admin / Librarian | School Staff | Admin / Librarian | Admin | Title, Author, ISBN, Category |
| **Issued Book** | `schools/{id}/issuedBooks` | Admin / Librarian | School Staff | Admin / Librarian | Admin | Student, Status (Issued/Returned) |
| **Exam** | `schools/{id}/exams` | Admin | School Staff / Parent | Admin | Admin | Term, Academic Year, Date |
| **Assessment / Grade**| `schools/{id}/assessments` | Teacher / Admin | School Staff / Parent | Teacher / Admin | Admin | Class, Exam, Subject |
| **Homework** | `schools/{id}/homeworks` | Teacher / Admin | School Staff / Parent | Teacher / Admin | Teacher / Admin | Class, Subject, Due Date |
| **Noticeboard** | `schools/{id}/notices` | Admin / Teacher | All School Users | Admin / Teacher | Admin / Teacher | Audience, Class, Date |
| **Chat Message** | `.../chats/{room}/messages` | Teacher / Parent | Room Participants | Update Status | Soft Delete | Room, Timestamp |
| **Custom Module** | `schools/{id}/customModules`| Admin | Admin / Staff | Admin | Admin | Module Name, Order |

---

## 10. Firebase Architecture

### Firebase Initialization (`src/firebase/config.js`)
- Configured via client environment variables (`import.meta.env.VITE_FIREBASE_*`).
- Offline Persistence: Enabled across multiple browser tabs using:
  ```javascript
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  });
  ```

### Firestore Security Rules Architecture
Security rules enforce strict tenant boundary access control:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAuthenticated() { return request.auth != null; }
    function getUserData() { return get(/databases/$(database)/documents/users/$(request.auth.uid)).data; }
    function currentRole() { return isAuthenticated() ? getUserData().role : ''; }
    function currentSchoolId() { return isAuthenticated() ? getUserData().schoolId : ''; }
    function isSuperAdmin() { return currentRole().lower() == 'superadmin'; }
    function belongsToSchool(schoolId) { return isAuthenticated() && (currentSchoolId() == schoolId || isSuperAdmin()); }
    function isAdminOfSchool(schoolId) { return isAuthenticated() && (isSuperAdmin() || (currentSchoolId() == schoolId && currentRole().lower() == 'admin')); }
    function isTeacherOfSchool(schoolId) { return isAuthenticated() && (isSuperAdmin() || (currentSchoolId() == schoolId && (currentRole().lower() == 'teacher' || currentRole().lower() == 'staff'))); }
    function isParentOfSchool(schoolId) { return isAuthenticated() && (isSuperAdmin() || (currentSchoolId() == schoolId && currentRole().lower() == 'parent')); }
    
    // Subcollections under schools/{schoolId} strictly require belongsToSchool(schoolId)
  }
}
```

### Storage Upload Destinations
1. **Student Photos & Admission Proofs:**
   - Path: `Schools/{schoolId}/AdmissionApplications/{studentName}_{timestamp}`
2. **Chat Attachments & Voice Notes:**
   - Path: `Schools/{schoolId}/Chats/{roomId}/{timestamp}.webm`
3. **Custom Module Uploads:**
   - Path: `CustomModules/{schoolName}/{fileName}`
4. **Cloudinary Primary Engine:**
   - If tenant has configured Cloudinary credentials in `schools/{schoolId}.apiKeys.cloudinary`, uploads go directly to Cloudinary, reserving Firebase Storage as a zero-config fallback.

---

## 11. Data Model (Entity Relationship Overview)

```text
[Global collections]
  ├── users/{uid}
  │    ├── email: string
  │    ├── role: 'superadmin' | 'admin' | 'teacher' | 'staff' | 'parent'
  │    ├── schoolId: string
  │    ├── permittedModules: string[]
  │    ├── linkedStudentId?: string
  │    └── linkedStudents?: Array<{ studentId, classId, studentName }>
  │
  ├── plans/{planId} / subscriptionPlans/{planId}
  │    ├── name, userLimit, pricePerUserPerYear, cloudStorageGB, modules: Map<string, boolean>
  │
  └── settings/emailTemplates
       ├── welcomeHtml, forgotPasswordHtml, approvalHtml

[Tenant Collection: schools/{schoolId}]
  ├── name, schoolName, schoolType, status ('pending'|'approved'|'rejected')
  ├── plan, seatLimit, teacherLimit, apiKeys: { cloudinary, whatsapp }
  │
  ├── classes/{classId}
  │    ├── name, grade, section, classTeacherId
  │
  ├── subjects/{subjectId}
  │    ├── name, code, credits
  │
  ├── students/{studentId}
  │    ├── admissionNumber (Unique), rollNumber, firstName, lastName, studentName
  │    ├── classId, sectionId, dob, gender, bloodGroup, aadharNumber
  │    ├── parentName, parentPhone, parentEmail, address, photoUrl
  │    └── transportRouteId, hostelRoomId, status ('Active'|'Inactive'|'Alumni')
  │
  ├── teachers/{teacherId}
  │    ├── userId (FK to users/{uid}), employeeId, name, email, phone
  │    ├── role ('teacher'|'staff'|custom), roles: string[], staff_type ('teaching'|'non-teaching')
  │    ├── assignedClassId, status ('Active'|'Inactive')
  │
  ├── attendance/{classId_date_session}
  │    ├── classId, date, markedBy, records: { [studentId]: 'Present'|'Absent'|'Late' }
  │
  ├── attendanceStats/{studentId}
  │    ├── studentId, academicYear, totalDays, presentDays, absentDays, lateDays, attendancePercentage
  │
  ├── absenteeFlags/{studentId_YYYY-MM}
  │    ├── studentId, classId, month, absentCount, flaggedAt
  │
  ├── dashboardStats/{dateStr}
  │    ├── schoolWide: { total, present, absent, late, percentage }
  │    ├── byGrade: Map, bySection: Map, classesMarked: number, classesPending: string[]
  │
  ├── feeStructures/{feeId}
  │    ├── name, amount, dueDate, classId
  │
  ├── invoices/{invoiceId}
  │    ├── studentId, feeId, feeName, amount, dueDate, status ('Pending'|'Paid'), paidAt
  │
  ├── exams/{examId}
  │    ├── name, term, academicYear, startDate, endDate
  │
  ├── assessments/{assessmentId}
  │    ├── examId, classId, subjectId, totalMarks, passingMarks, grades: { [studentId]: { marks, grade, remarks } }
  │
  ├── homeworks/{homeworkId}
  │    ├── title, description, classId, subjectId, dueDate, attachments: Array<{ name, url }>
  │
  ├── notices/{noticeId}
  │    ├── title, content, type ('global'|'class'), classId, audience ('all'|'teachers'|'parents'), viewedBy: Array
  │
  ├── chats/{studentId_teacherId}
  │    ├── studentId, teacherId, status, unreadCount_parent, unreadCount_teacher
  │    └── messages/{messageId}
  │         ├── text, senderId, senderRole, mediaUrl, mediaType, createdAt
  │
  ├── transportRoutes/{routeId}
  │    ├── name, routeNumber, vehicleNumber, driverName, driverPhone, stops: Array, assignedStudents: string[]
  │
  ├── vehicles/{vehicleId}
  │    ├── registrationNumber (Format: MH-12-PQ-4567), model, capacity, status
  │
  ├── books/{bookId}
  │    ├── title, author, isbn, category, totalQuantity, availableQuantity
  │
  ├── issuedBooks/{issueId}
  │    ├── bookId, studentId, issuedAt, dueDate, returnedAt, status ('issued'|'returned')
  │
  ├── inventory/{itemId}
  │    ├── itemName, category, quantity, unit, minimumStock, unitPrice, location
  │
  ├── inventoryLogs/{logId}
  │    ├── itemId, action ('ADD'|'ISSUE'|'RETURN'|'DISPOSE'), quantity, changedBy, timestamp
  │
  ├── leaves/{leaveId}
  │    ├── applicantId, applicantName, applicantRole, leaveType, startDate, endDate, reason, status ('Pending'|'Approved'|'Rejected')
  │
  ├── ptms/{ptmId}
  │    ├── studentId, classId, teacherId, date, time, type ('In-person'|'Online'), status ('Scheduled'|'Completed'|'Cancelled')
  │
  ├── roles/{roleId}
  │    ├── name, loginPanel ('admin'|'teacher'|null), permissions: { [moduleKey]: { read, create, edit, delete } }
  │
  └── customModules/{moduleId}
       ├── name, order, fields: Array<{ id, label, type, required, options }>
```

---

## 12. Business Rules

1. **Tenant Status Gate:**
   - If `schools/{schoolId}.status !== 'approved'`, non-superadmin users are redirected to `/admin/pending`.
2. **Synthetic Parent Credentials:**
   - Parent accounts authenticate using their child's Admission Number. The system forms the synthetic email `{cleanAdmissionNumber}@parent.School.com`. No personal parent email is permitted as a Firebase Auth identity.
3. **Class Capacity & License Limits:**
   - Total students in a school cannot exceed `seatLimit` defined on the school document.
   - Total staff members cannot exceed `teacherLimit`.
4. **Attendance Cutoff:**
   - Daily attendance must be marked before `cutoffTime` (default `09:30` in school's configured timezone).
   - Past this time, missing classes trigger automated `attendance_pending` warnings in notifications.
5. **Chronic Absentee Rule:**
   - If a student accrues `>= absenteeThreshold` absences (default: 2) in a single calendar month, an automated flag document is written to `absenteeFlags` and high-priority alerts are surfaced.
6. **Binary Fee Payments:**
   - Invoices cannot be partially paid. Payments are strictly binary (`Pending` -> `Paid`).
   - Invoices are automatically provisioned in a single batch for all enrolled students when a fee structure is assigned.
7. **Library Book Inventory Balancing:**
   - Issuing a book decrements `availableQuantity` by 1 and creates an `issuedBooks` record.
   - Returning a book increments `availableQuantity` by 1 and updates status to `returned`.
8. **Vehicle Registration Syntax Enforcement:**
   - Indian vehicle registration format requires 2 letters, 2 digits, 2 letters, and 4 digits separated by hyphens (e.g., `MH-12-PQ-4567`). Values missing hyphens or containing arbitrary alphanumeric strings are rejected.
9. **Name & Identity Integrity:**
   - Names cannot contain digits.
   - Date of Birth cannot be in the future, and calendar roll-over dates (e.g. Feb 31) are rejected.
   - Aadhaar numbers must contain exactly 12 numeric digits.
   - Blood groups must match standard clinical groupings (`A+`, `A-`, `B+`, `B-`, `AB+`, `AB-`, `O+`, `O-`).
10. **Role Isolation:**
    - Staff members can only see or edit modules if granted explicit boolean flags (`read`, `create`, `edit`, `delete`) in their assigned `roles` document.

---

## 13. Status & State Machines

### Tenant Account Lifecycle
```text
[Registered] ──> Status: 'pending'
                     │
         ┌───────────┴───────────┐
         ▼                       ▼
   SuperAdmin Approves      SuperAdmin Rejects
         │                       │
         ▼                       ▼
Status: 'approved'        Status: 'rejected'
         │
         ▼ (SuperAdmin Suspension)
Status: 'suspended'
```

### Student Admission Lifecycle
```text
Public Form Submitted ──> Status: 'Pending'
                               │
                   ┌───────────┴───────────┐
                   ▼                       ▼
            Admin Approves           Admin Rejects
                   │                       │
                   ▼                       ▼
           Status: 'Active'        Status: 'Rejected'
                   │
                   ▼ (Graduation / Transfer)
       Status: 'Alumni' / 'Transferred'
```

### Invoice Status State Machine
```text
Fee Structure Created ──> Invoice Created (Status: 'Pending')
                                │
                                ▼
                   Admin Records Cash OR Parent Simulates
                                │
                                ▼
                       Status: 'Paid' (Timestamp: paidAt)
```

### Leave Request State Machine
```text
Applicant Submits Request ──> Status: 'Pending'
                                    │
                        ┌───────────┴───────────┐
                        ▼                       ▼
                  Admin Approves          Admin Rejects
                        │                       │
                        ▼                       ▼
               Status: 'Approved'      Status: 'Rejected'
```

### Library Book Issue State Machine
```text
Book Issued ──> Document Created (Status: 'issued', Book Qty - 1)
                     │
                     ▼
             Student Returns Book
                     │
                     ▼
           Status: 'returned' (ReturnedAt: ISO, Book Qty + 1)
```

---

## 14. Search, Filter & Sorting Capabilities

- **Client-Side vs. Firestore-Side Filtering:**
  - Due to Firestore composite indexing requirements, the application relies on fetching active tenant subcollections (via real-time `onSnapshot` listeners) and performing debounced, multi-parameter filtering on the client.
- **Search Capabilities:**
  - **Students:** Full-text match across First Name, Last Name, Admission Number, Roll Number, and Guardian Name.
  - **Staff:** Matches Employee ID, Name, Email, Department, and Designation.
  - **Invoices:** Filters by Student Name, Admission Number, and Fee Name.
  - **Inventory:** Filters by Item Name, Category, and Supplier.
  - **Library:** Instant search by Book Title, Author, ISBN, and Category.
- **Sorting Logic:**
  - Classes are sorted using natural alphanumeric algorithms via `sortClassesAscending` (`src/utils/classSorting.js`) so that "Grade 2" precedes "Grade 10".
  - Invoices and notices are sorted chronologically by `createdAt` descending.

---

## 15. Forms & Validation Specifications

| Form | Key Fields | Required Validations | Target Firestore Action |
| :--- | :--- | :--- | :--- |
| **School Onboarding** | School Name, Type, Student Count, Admin Email, Password, UDISE | Email format, Password strength, Terms accepted | `registerUser` + `createSchool` |
| **Student Enrollment** | First/Last Name, DOB, Gender, Class, Admission No, Parent Phone | `validateName`, `validateDateOfBirth`, `validatePhone`, `validateBloodGroup`, `validateAadhaarNumber` | `addSubDocument('students')` |
| **Staff Invite Registration** | Name, Email, Password, Employee ID, Captcha | Captcha match, Password complexity, matching staff invitation | `registerUser` + updates `teachers/{id}` |
| **Parent Registration** | Name, Admission Number, Password, Captcha | Captcha match, Synthetic parent auth | `registerUser` + `addSubDocument('parents')` |
| **Fee Structure Assignment**| Name, Amount, Due Date, Class ID | Positive amount, valid Class ID | `createFeeStructure` (Batch write) |
| **Vehicle Registration** | Vehicle Number, Model, Capacity | `validateVehicleRegistrationNumber` (`MH-12-PQ-4567`) | `addSubDocument('vehicles')` |
| **Leave Request** | Leave Type, Dates, Reason, Optional File | Start <= End date, File size <= 3MB | `addSubDocument('leaves')` |
| **Noticeboard Post** | Title, Content (Quill), Audience | Title non-empty, Content non-empty | `createNotice` |

---

## 16. UI/UX Structure & Design System

### Layout Structure
- **Global Header (`TopNavbar.jsx`):** Displays dynamic school branding, active academic year, unread notification bells with popover drawer, dark mode toggle, and user profile avatar dropdown.
- **Collapsible Sidebar (`AdminDashboard.jsx`, `TeacherDashboard.jsx`, `ParentDashboard.jsx`):**
  - Features responsive sliding drawers for mobile viewports (`md:hidden`).
  - Supports expandable sub-menus (e.g. Classes & Sections -> Class List / Subject Management).
  - Displays dynamic red unread counter badges (powered by `NotificationContext`).
- **Design Tokens & Theme:**
  - **Color Palette:** Curated Indigo/Primary scale (`#4f46e5`, `#6366f1`), Slate neutral scale (`slate-50` through `slate-900`), with Emerald green (`#10b981`) for success/paid and Rose/Red (`#ef4444`) for danger/overdue.
  - **Glassmorphism:** Navigation components and toasts utilize backdrop blur (`backdrop-blur-md bg-white/85 border border-slate-200/60`).
  - **Typography:** Inter font family loaded through Google Fonts with systematic weight hierarchy (400, 500, 600, 700).
- **Responsive Behavior:**
  - Desktop: Multi-column grid tables with hover row highlights.
  - Mobile: Tables transition into card-based layouts (`hidden md:table` vs `block md:hidden`), modals stretch to bottom-sheet viewports.

---

## 17. Screen-by-Screen Analysis

### 17.1 Public Portal
- **Landing Page (`/`):** Three.js 3D interactive hero canvas, feature highlights, tier pricing cards with instant redirection to registration.
- **Login Portal (`/login`):** Split-panel presentation with branded hero gradient on left; accepts both Email and Student Admission Number. Directs users dynamically based on role and `loginPanel`.
- **Public Admission Form (`/admission/:schoolId`):** Multi-section form capturing complete personal, medical, previous academic, and parent details with photo upload and reference number generation.

### 17.2 School Admin Portal
- **Admin Overview (`/admin`):** High-level KPI metrics (Total Students, Staff, Attendance Percentage, Fee Revenue), quick shortcuts, and attendance alerts.
- **Environment Setup (`/admin/setup`):** Institution profile editor, logo/favicon upload, 9:30 AM attendance cutoff time picker, and third-party API key configurations.
- **Student Management (`/admin/students`):** Grid/table of all students with comprehensive filters, Add/Edit modal with Aadhaar/DOB validation, bulk Excel import/export, and ID card PDF generation.
- **Fee Management (`/admin/fees`):** KPI revenue overview, batch fee structure creation modal, searchable invoice ledger, and instant payment recording.
- **Attendance Management (`/admin/attendance`):** School-wide attendance overview, date session selector, class completion indicators, and monthly register export.
- **Transport Management (`/admin/transport`):** Route visualizer, vehicle registry with strict Indian plate format validation, and student bus-stop assignment.
- **Roles & Permissions (`/admin/roles`):** Visual matrix allowing admins to configure custom roles and toggle read/create/edit/delete capabilities per module.

### 17.3 Teacher Portal
- **Class Roster (`/teacher`):** Visual student directory showing student contact info, roll numbers, and parent details for the teacher's assigned class.
- **Attendance (`/teacher/attendance`):** Session-based attendance checklist with single-click status toggles and auto-save indicators.
- **Grades & Marks Entry (`/teacher/grades`):** Assessment creator, marks input matrix per student, automated percentage/grade computation, and individual report card printouts.
- **Homework Management (`/teacher/homework`):** Assignment creator with file attachment upload and student submission status tracker.
- **PTM Scheduler (`/teacher/ptm`):** Conference scheduler with parent booking status and integrated Meta WhatsApp notification trigger.

### 17.4 Parent Portal
- **Student Overview (`/parent`):** Daily academic summary for selected child (attendance percentage, recent grades, upcoming homework, outstanding fee alerts).
- **Child Switcher (`MyChildren.jsx` / Navbar dropdown):** Allows parents with multiple enrolled siblings to link new students via Admission Number + DOB and switch active views seamlessly.
- **Fees (`/parent/fees`):** List of pending and paid invoices, overdue warnings, and simulated online payment checkout.
- **1-on-1 Chat (`/parent/chat`):** Instant messaging thread with child's class teacher supporting real-time text, voice audio messages, and image attachments.

---

## 18. Reusable Components Classification

```text
Reusable Component Hierarchy
├── Layout Components
│   ├── TopNavbar.jsx (Header, dynamic school branding, notification drawer, profile dropdown)
│   ├── Layout.jsx (SuperAdmin sidebar & content container)
│   └── Skeleton.jsx (Shimmering placeholder elements for data tables & cards)
│
├── UI & Interaction Components
│   ├── ConfirmModal.jsx (Action confirmation dialogs with danger state styling)
│   ├── FilePreviewModal.jsx (In-app image, PDF, and media previewer)
│   ├── ImageCropper.jsx (Interactive canvas cropper for student/staff avatars)
│   ├── CustomAudioPlayer.jsx (HTML5 audio visualizer with play/pause and progress scrubbing)
│   ├── ZunaLogo.jsx (Branded SVG vector logo)
│   └── Captcha.jsx (Dynamic visual security verification code generator)
│
├── Data & Form Components
│   ├── CustomFieldsRenderer.jsx (Dynamic JSON-schema-driven field generator)
│   ├── ExportModal.jsx (Column-picker dialog for selective Excel/PDF data extraction)
│   ├── AcademicCalendar.jsx (Calendar component wrapping react-big-calendar)
│   ├── ChatInput.jsx (Rich message input supporting text, attachments, and audio recording)
│   └── NoticeFeed.jsx (Reusable announcement feed widget)
│
└── Security & Gatekeeper Components
    ├── ProtectedRoute.jsx (Route-level role and module permission enforcement)
    ├── PermissionGuard.jsx (In-component conditional element renderer based on RBAC)
    └── RaiseTicketModal.jsx (In-app support ticket submission dialog)
```

---

## 19. State Management

The application combines multiple complementary state paradigms:
1. **Global Auth State (`AuthContext.jsx`):**
   - Holds `currentUser` (Firebase Auth User) and `userProfile` (Firestore document).
   - Backed by `CacheService` to provide instant optimistic state restoration from `localStorage` upon page refresh.
2. **Real-Time Notification State (`NotificationContext.jsx`):**
   - Listens to unread counts across 6 subcollections (`notices`, `homeworks`, `complaints`, `leaves`, `canteen_requests`, `chats`).
   - Tracks `lastViewed` timestamps in `localStorage` to compute unread badges dynamically.
3. **Staff Permission State (`usePermissions.js`):**
   - Subscribes in real time to the staff member's role document in Firestore and computes merged module capabilities (`read`, `create`, `edit`, `delete`).
4. **Tenant-Isolated Local Storage Cache (`CacheService.js`):**
   - Prefixes all cached keys with `${schoolId}_${key}` to prevent data collision in multi-account or shared browser sessions.
   - Enforces configurable Time-To-Live (TTL) timestamps with automated expiration cleanup.
5. **Component Local State:**
   - React `useState` and `useReducer` for modal visibility, form data, search keywords, and pagination controls.

---

## 20. End-to-End Data Flow

```text
+─────────────────────────────────────────────────────────────────────────+
| 1. User Interaction (e.g. Teacher marks attendance & clicks "Save")     |
+────────────────────────────────────┬────────────────────────────────────+
                                     │
                                     ▼
+─────────────────────────────────────────────────────────────────────────+
| 2. Component Handler (`Teacher/Attendance.jsx`: `handleSave()`)          |
|    - Validates local input array                                        |
|    - Dispatches loading toast indicator                                 |
+────────────────────────────────────┬────────────────────────────────────+
                                     │
                                     ▼
+─────────────────────────────────────────────────────────────────────────+
| 3. Firestore Service Call (`src/firebase/firestore.js`)                 |
|    - Executes `saveAttendance(schoolId, classId, date, teacherId, data)`|
|    - Writes document to `schools/{id}/attendance/{classId}_{date}`      |
+────────────────────────────────────┬────────────────────────────────────+
                                     │
                                     ▼
+─────────────────────────────────────────────────────────────────────────+
| 4. Secondary Background Aggregations (Inside `firestore.js`)             |
|    - `updateStudentRunningStatsAndFlags()`: updates attendanceStats/    |
|    - Recomputes absentee counts -> creates absenteeFlags/ if threshold  |
|    - `recomputeDashboardStats()`: updates dashboardStats/{date}         |
+────────────────────────────────────┬────────────────────────────────────+
                                     │
                                     ▼
+─────────────────────────────────────────────────────────────────────────+
| 5. Real-Time Broadcast (`onSnapshot` listeners)                         |
|    - Admin Dashboard KPI cards update instantly                         |
|    - Parent Portal attendance timeline reflects new status              |
|    - Local Component updates UI and displays success toast              |
+─────────────────────────────────────────────────────────────────────────+
```

---

## 21. External Integrations

### 1. Resend Email Delivery Service
- **Purpose:** Sends transactional HTML emails for new user account credentials, school onboarding approvals, and password reset instructions.
- **Implementation:** Deployed inside serverless function `/api/send-email.js` using `resend: 6.17.2`. Client wrapper in `src/services/emailService.js` dispatches requests to `/api/send-email` with client-side fallback if the endpoint is unreachable in dev mode.
- **Verified Sending Domain:** `Team Carrezza <admin@teamcarrezza.com>`.

### 2. Meta WhatsApp Cloud API (Graph API v19.0)
- **Purpose:** Automatically alerts parents via WhatsApp when a PTM is scheduled or when an urgent school notice is published.
- **Implementation:** Located in `/api/whatsapp-service.js` with client wrapper `src/services/whatsappService.js`.
- **Security:** Tenant WhatsApp Access Tokens and Phone Number IDs are stored in the school document (`schools/{id}.integrations.whatsapp`) and never exposed to the client. The client sends a Bearer ID token; `/api/whatsapp-service` validates user authenticity and school ownership via Firebase Admin SDK before contacting Meta Graph endpoints.
- **Audit Logging:** Logs every dispatched message to `whatsapp_logs/{schoolId}_{type}_{refId}` to prevent duplicate sends and track delivery status.

### 3. Cloudinary Media Storage
- **Purpose:** Provides high-speed CDN image hosting and automatic format optimization for student ID photos, registration certificates, and custom form uploads.
- **Implementation:** Located in `src/utils/cloudinary.js`.
- **Workflow:** Checks tenant configuration `schools/{id}.apiKeys.cloudinary`. If configured, submits an unauthenticated multipart `FormData` POST to `https://api.cloudinary.com/v1_1/{cloudName}/auto/upload`. If unconfigured, falls back seamlessly to Google Firebase Storage.

---

## 22. Error Handling Architecture

- **Firebase Network & Permission Errors:**
  - Firestore calls throughout `src/firebase/firestore.js` and components are wrapped in `try/catch` blocks.
  - In snapshot listeners, the optional error callback is provided (e.g. `(error) => console.error(...)`) to prevent uncaught Firestore snapshot exceptions from crashing the React rendering tree.
- **Authentication Exceptions:**
  - `LoginPage.jsx` and registration screens translate Firebase Auth codes (`auth/invalid-credential`, `auth/email-already-in-use`, `auth/user-not-found`) into user-friendly error banners.
- **Route-Level Permission Errors:**
  - `ProtectedRoute.jsx` intercepts unauthorized role or module access and redirects immediately to `/unauthorized` (`Unauthorized.jsx`) without exposing underlying UI components.
- **Form Validation Feedback:**
  - Input fields employ inline red helper text and trigger dynamic `react-hot-toast` alerts when submission criteria fail.

---

## 23. Notifications System

The application employs a dual notification architecture:
1. **In-App Notification Drawer (`NotificationContext.jsx` & `TopNavbar.jsx`):**
   - Maintains real-time `onSnapshot` listeners across critical operational collections:
     - `notices`: Unread announcements based on user role and target audience.
     - `homeworks`: New assignments published since `lastViewed_homework`.
     - `complaints`: Pending grievances requiring Admin action.
     - `leaves`: Pending leave requests requiring Admin review.
     - `canteen_requests`: Orders placed by parents awaiting processing.
     - `chats`: Unread message count per room for parents and teachers.
   - Clears badges automatically upon navigating to the relevant module.
2. **Automated Cutoff Alerts:**
   - Background cutoff checker (`/api/check-attendance-cutoff.js`) generates persistent notifications in `schools/{schoolId}/notifications` for any class that has not marked attendance by the institutional cutoff time.

---

## 24. File & Image Handling

- **Upload Pipeline:**
  1. User selects file via standard `<input type="file" />` or image cropper (`ImageCropper.jsx`).
  2. Client-side validation enforces a **3MB size limit** (extended to 5MB for admission photos).
  3. File is passed to `uploadFileToCloudinaryOrFirebase(file, schoolId, storagePath)`.
  4. Upload executes to Cloudinary CDN if credentials exist, or to Firebase Storage.
  5. The resulting HTTPS URL is stored in the Firestore document.
- **File Preview:**
  - Supported formats (PNG, JPG, WEBP, PDF) open in `FilePreviewModal.jsx` for seamless viewing without navigating away from the dashboard.
- **Audio Voice Notes:**
  - Voice notes are captured as WebM audio blobs in `ChatInput.jsx`, uploaded to storage, and rendered with custom playback controls via `CustomAudioPlayer.jsx`.

---

## 25. Important Dependencies

| Package | Version | Purpose in Application | Why It Matters for Future Development |
| :--- | :--- | :--- | :--- |
| **`firebase`** | `^12.16.0` | Client Auth, Firestore, and Storage SDK | All client data operations, offline persistence, and auth listeners |
| **`firebase-admin`** | `^10.3.0` | Privileged server-side Firestore and Auth SDK | Powers serverless API functions and password reset links |
| **`react-router-dom`**| `^7.18.1` | Client-side routing, navigation, route guards | Manages all URL structures and role-based route gates |
| **`framer-motion`** | `^12.42.2` | UI transitions, modal animations, accordion physics| Provides premium micro-interactions across desktop web views |
| **`react-hot-toast`** | `^2.6.0` | Global toast alert notifications | Primary mechanism for user action feedback across all modules |
| **`xlsx`** | `^0.18.5` | Excel workbook generation and spreadsheet parsing | Handles bulk student roster imports and attendance register exports |
| **`jspdf` / `jspdf-autotable`**| `^4.2.1` / `^5.0.8` | Client-side PDF generation | Renders student ID cards, admission application slips, and report cards |
| **`react-quill-new`** | `^3.7.0` | Rich text WYSIWYG editor | Allows rich HTML formatting for noticeboard announcements |
| **`react-easy-crop`** | `^6.2.3` | Interactive avatar and photo cropper | Ensures standardized aspect ratios for student and staff profile images |
| **`resend`** | `^6.17.2` | Transactional email delivery API | Delivers welcome emails, invitations, and reset links via Team Carrezza |
| **`three` / `@react-three`**| `^0.185.1` / `^9.6.1` | 3D canvas and WebGL rendering | Powers the 3D interactive hero asset on the public landing page |

---

## 26. Environment Configuration

The application relies on environment variables configured in `.env` (client) and Vercel project settings (serverless functions):

| Variable Name | Purpose | Scope | Exposed to Client |
| :--- | :--- | :---: | :---: |
| `VITE_FIREBASE_API_KEY` | Firebase Web API key | Client | Yes (Bundled) |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Auth Domain URL | Client | Yes (Bundled) |
| `VITE_FIREBASE_DATABASE_URL` | Firebase Realtime Database URL | Client | Yes (Bundled) |
| `VITE_FIREBASE_PROJECT_ID` | Google Cloud / Firebase Project ID | Client / API | Yes (Bundled) |
| `VITE_FIREBASE_STORAGE_BUCKET`| Firebase Cloud Storage bucket name | Client | Yes (Bundled) |
| `VITE_FIREBASE_MESSAGING_SENDER_ID`| Firebase Cloud Messaging sender ID | Client | Yes (Bundled) |
| `VITE_FIREBASE_APP_ID` | Firebase Web Client Application ID | Client | Yes (Bundled) |
| `VITE_FIREBASE_MEASUREMENT_ID`| Google Analytics 4 Measurement ID | Client | Yes (Bundled) |
| `RESEND_API_KEY` | Resend API secret authentication key | Serverless API | **No (Redacted)** |
| `FIREBASE_SERVICE_ACCOUNT_KEY`| Service Account JSON for Firebase Admin | Serverless API | **No (Redacted)** |

---

## 27. Deployment Architecture

- **Frontend SPA Deployment:**
  - Built with `npm run build` (`vite build`) producing static assets into `/dist`.
  - Hosted on **Vercel** with SPA rewrites configured in `vercel.json`:
    ```json
    {
      "rewrites": [
        { "source": "/api/(.*)", "destination": "/api/$1" },
        { "source": "/(.*)", "destination": "/index.html" }
      ]
    }
    ```
- **Backend API Deployment:**
  - Files inside `/api/*.js` run as Vercel Serverless Functions on the Node.js runtime.
  - Handles privileged operations requiring secret API keys (`RESEND_API_KEY`, `FIREBASE_SERVICE_ACCOUNT_KEY`).

---

## 28. Important Technical Risks

1. **Browser DOM and Window Dependencies:**
   - The application relies directly on browser globals (`window.location`, `localStorage`, `document`, `navigator.userAgent`, `URL.createObjectURL`, `FileReader`, `MediaRecorder`).
2. **Heavy Client-Side Array Aggregations:**
   - Dashboard KPIs and Fee reports calculate totals by querying and iterating over entire subcollections in memory (`invoices`, `attendance`, `students`). While functional for hundreds of students, schools with thousands of students will experience client UI blocking without server-side aggregation.
3. **WriteBatch Limit of 500 Operations:**
   - In `createFeeStructure()`, invoices are generated in a single `writeBatch`. Firestore limits batches to 500 writes. Assigning a fee to a class or school cohort exceeding 500 students will trigger an unhandled batch error.
4. **Unsigned Client Cloudinary Uploads:**
   - Uploading to Cloudinary relies on unsigned presets configured on the tenant document. If misconfigured, file uploads fall back to Firebase Storage, which requires appropriate storage security rules.
5. **Synthetic Email Parent Authentication:**
   - Parents have no native Firebase user record with a real email. Password recovery relies entirely on Admin resetting credentials or custom Admin SDK links, as standard Firebase client password reset emails cannot reach `{admissionNumber}@parent.School.com`.

---

## 29. Web-to-Mobile Migration Considerations (React Native)

| Existing Web Implementation | Recommended React Native Equivalent | Complexity | Implementation Notes |
| :--- | :--- | :---: | :--- |
| **`react-router-dom` v7** | `@react-navigation/native` + Bottom Tabs & Native Stack | High | Mobile apps require distinct Navigation Stacks per role with bottom tabs for Teacher/Parent and drawer navigation for Admin. |
| **Tailwind CSS v4 (Web)** | `NativeWind` or React Native `StyleSheet` | Medium | Web CSS layout tokens (e.g. `backdrop-blur`, `overflow-y-auto`) must be replaced with native flex layouts and `ScrollView` / `FlatList`. |
| **HTML Tables (`<table>`)** | `FlatList` with customized row cards | Medium | Desktop tables cannot fit on mobile viewports. Every data table (Students, Invoices, Attendance) must become a virtualized Card List. |
| **`localStorage` (`CacheService`)** | `@react-native-async-storage/async-storage` | Low | Replace `localStorage.getItem/setItem` calls with async storage operations. |
| **`react-quill-new` (WYSIWYG)** | Native Rich Text Editor or Markdown input | Medium | Web WYSIWYG relies on DOM contenteditable, which is unsupported on native mobile. |
| **`react-easy-crop`** | `react-native-image-crop-picker` | Medium | Native image picker provides hardware camera access and platform-native cropping. |
| **Voice Audio (`MediaRecorder`)** | `react-native-audio-recorder-player` | High | Web MediaStream API must be replaced with native microphone permissions and audio encoder modules. |
| **`jspdf` / `xlsx` Exporting** | `react-native-html-to-pdf` + `react-native-share` | Medium | File generation must save to device document directories and invoke the native iOS/Android share sheet. |
| **Synthetic Parent Login** | Preserved exact auth logic via `@react-native-firebase/auth` | Low | The synthetic email generation formula (`{admissionNo}@parent.School.com`) is 100% compatible with native Firebase Auth. |
| **Firestore Real-time Listeners** | `@react-native-firebase/firestore` | Low | Firestore `onSnapshot` subscriptions work identically in React Native. |

---

## 30. Complete Workflow Summary

```text
                                  [ SaaS Platform Registration ]
                                                │
                                                ▼
                                    [ SuperAdmin Approval ]
                                                │
                                                ▼
                                  [ School Admin Environment Setup ]
                                  (Classes, Subjects, Roles, Staff)
                                                │
                                                ▼
                                    [ Student Enrollment ]
                           (Public Form / Bulk Import / Direct Add)
                                                │
                 ┌──────────────────────────────┼──────────────────────────────┐
                 ▼                              ▼                              ▼
     [ Teacher Daily Operations ]     [ Fee & Finance Ops ]         [ Campus Logistics ]
     - Mark FN/AN Attendance          - Assign Fee Structures       - Plan Transport Routes
     - Assign Homework                - Batch Invoice Generation    - Catalog Library Books
     - Input Exam Marks               - Record Cash / Online Dues   - Audit Inventory Stock
     - Schedule PTMs                  - Track Outstanding Balances  - Approve Canteen Meals
                 │                              │                              │
                 └──────────────────────────────┼──────────────────────────────┘
                                                │
                                                ▼
                                   [ Parent Real-Time Access ]
                                   - Switch Active Children
                                   - View Attendance & Alerts
                                   - Review Homework & Grades
                                   - Pay Invoices (Simulated)
                                   - 1-on-1 Chat with Teacher
```

---

## 31. Critical Findings

### Most Important Features
1. **Multi-Tenant Isolation:** Complete data separation by partitioning all institutional collections under `schools/{schoolId}/*`.
2. **Synthetic Parent Authentication:** Unique password-based login for guardians using child admission numbers without requiring unique personal emails.
3. **Automated Attendance Cutoff & Chronic Absentee Engine:** Daily 9:30 AM cutoff notification generator paired with automated student absentee threshold monitoring.
4. **Class-Wide Batch Fee Billing:** Simultaneous provisioning of individual student invoices when an administrative fee structure is published.
5. **Real-Time Communication:** 1-on-1 parent-teacher chat with audio recording, noticeboards, and automated WhatsApp alert dispatching.

### Most Important Workflows to Preserve During Migration
- **Admission Number Login Flow:** Must remain identical in mobile to prevent disruption for parents.
- **Session Attendance (FN/AN):** Fast marking interface with automatic default to "Present".
- **Dynamic Role-Based Permission Resolution (`usePermissions`):** The client must continue to evaluate live role capabilities to control action buttons and screen visibility.
- **Multiple Children Switching:** Parents must be able to switch active child contexts with immediate state re-scoping across all modules.

### Most Important Business Rules
- Registration numbers for vehicles must strictly comply with Indian plate formatting (`^[A-Z]{2}-[0-9]{2}-[A-Z]{2}-[0-9]{4}$`).
- Student DOB cannot be in the future, names cannot contain numeric digits, and Aadhaar numbers must be exactly 12 digits.
- Book checkout operations must atomically decrement stock and prevent issue when available stock is 0.

### Most Complex Areas for React Native
- **Data Table Virtualization:** Converting 30+ complex desktop data tables into touch-friendly, virtualized native card layouts.
- **Voice Message Recording:** Handling hardware microphone permissions, audio encoding, waveform visualization, and CDN upload on iOS and Android.
- **Offline Multi-Tab Caching Migration:** Migrating web `localStorage` and Firestore web persistent cache to native device storage.
