# PHASE 4B.7-A — RBAC & PERMISSION MIGRATION AUDIT
## INVESTIGATION ONLY — ZERO IMPLEMENTATION

**Phase**: 4B.7-A — RBAC & Permission Migration Audit  
**Timestamp**: 2026-09-09  
**Audit Mode**: READ-ONLY AUDIT  
**Status / Decision**: READY FOR 4B.7-B  

---

## 1. Executive Summary

Phase 4B.7-A establishes the complete, authoritative source-of-truth investigation for migrating the School Management System SaaS role-based access control (RBAC) and permission architecture from client-side Firestore listeners to the PostgreSQL relational model.

Following the successful completion of Phase 4B.6-D (Frontend Authentication Cutover), authentication authority is established in PostgreSQL, with JWT access tokens in JavaScript memory and HttpOnly refresh cookies. However, frontend authorization (module read/create/edit/delete visibility and routing) still relies on Firestore realtime listeners in `src/hooks/usePermissions.js` and tenant subcollections (`schools/{schoolId}/roles` and `schools/{schoolId}/teachers`).

The backend PostgreSQL database already contains the relational foundations: `SchoolRole`, `RolePermission`, `UserRoleAssignment`, `StaffProfile`, `ParentProfile`, and `User` with `systemRole`. The backend middleware foundation (`requireRole`, `requirePermission`, `authenticate`, `tenantContext`, and `prisma-tenant-extension`) is implemented and tested.

This audit provides the exact role inventory, permission actions, module registry, data flow mappings, security threat analysis, and a structured migration strategy for Phase 4B.7-B through 4B.7-G.

---

## 2. Current RBAC Architecture

The current system operates a **two-tier role architecture**:

```
                              ┌──────────────────────────────┐
                              │     Platform System Role     │
                              │      (User.systemRole)       │
                              └──────────────┬───────────────┘
                                             │
                     ┌───────────────────────┴───────────────────────┐
                     ▼                                               ▼
       ┌───────────────────────────┐                   ┌───────────────────────────┐
       │   Global Platform Roles   │                   │    Tenant Scoped Roles    │
       │  (SUPER_ADMIN, TENANT_USER) │                   │ (SCHOOL_ADMIN, TEACHER,   │
       └───────────────────────────┘                   │  PARENT, STUDENT, STAFF)  │
                                                       └─────────────┬─────────────┘
                                                                     │
                                                       ┌─────────────▼─────────────┐
                                                       │  Institutional Staff Role │
                                                       │   (SchoolRole / Firestore │
                                                       │    schools/{id}/roles)    │
                                                       └─────────────┬─────────────┘
                                                                     │
                                                       ┌─────────────▼─────────────┐
                                                       │  Granular Module CRUD     │
                                                       │ (RolePermission / canRead,│
                                                       │  canCreate, edit, delete) │
                                                       └───────────────────────────┘
```

### 2.1 Tier 1: Platform & System Roles (`systemRole` / `userProfile.role`)
- **`SUPER_ADMIN`**: Global platform administrator. Universal bypass of tenant scoping. Full access to tenant management, billing plans, audit logs, and global settings.
- **`SCHOOL_ADMIN`** / **`admin`**: Primary tenant administrator. Full, unconditional permissions (`permissions: 'ALL'`) across all modules enabled for the school. Manages staff, students, billing, settings, and roles.
- **`PRINCIPAL`**: Administrative institutional head. Treated identically to `SCHOOL_ADMIN` for frontend panel routing.
- **`TEACHER`** / **`teacher`**: Academic staff. Associated with teaching subjects, classes, attendance, grading, lesson plans, and homework.
- **`PARENT`** / **`parent`**: Guardian portal user. Linked to one or more students via `ParentStudentLink`. Access restricted to parent dashboard.
- **`STUDENT`** / **`student`**: Student portal identity (read-only views of attendance, timetable, results).
- **`STAFF`** / **`staff`**: Non-teaching or specialized institutional staff (e.g. Accountant, Librarian, Transport Manager, Warden).
- **`TENANT_USER`**: Default unspecialized tenant user.

### 2.2 Tier 2: Tenant Functional Roles (`SchoolRole` / Firestore `schools/{schoolId}/roles`)
- 15 default institutional roles defined per school (see Section 3).
- Custom roles dynamically created by school admins via `RolesPermissions.jsx`.
- Each functional role defines:
  - Role Name (e.g., `'Finance Department'`, `'Library'`, `'Exam Coordinator'`).
  - Target Login Panel: `'admin'` (Admin Panel) or `'teacher'` (Teacher Panel).
  - Module Permission Map: `{ [moduleKey]: { read: boolean, create: boolean, edit: boolean, delete: boolean } }`.

---

## 3. Role Inventory

| Role Name | Slug | Tier | Scope | Dynamic? | Default Login Panel | PostgreSQL Target | Migration Action |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- | :--- |
| **Super Admin** | `superadmin` / `SUPER_ADMIN` | Platform | Global | No | SuperAdmin Panel | `User.systemRole = 'SUPER_ADMIN'` | Preserve global platform authority |
| **School Admin** | `admin` / `SCHOOL_ADMIN` | Tenant | School | No | Admin Panel | `User.systemRole = 'SCHOOL_ADMIN'` | Map to primary admin |
| **Principal** | `principal` / `PRINCIPAL` | Tenant | School | No | Admin Panel | `User.systemRole = 'PRINCIPAL'` + `SchoolRole` | Map to system role + `SchoolRole` |
| **Correspondent** | `correspondent` | Functional | School | System Default | Admin Panel | `SchoolRole (slug: correspondent)` | Seed `SchoolRole` + permissions |
| **Vice Principal** | `vice-principal` | Functional | School | System Default | Admin Panel | `SchoolRole (slug: vice-principal)` | Seed `SchoolRole` + permissions |
| **Subject Wise Head** | `subject-wise-head` | Functional | School | System Default | Teacher Panel | `SchoolRole (slug: subject-wise-head)` | Seed `SchoolRole` + permissions |
| **Class Incharge** | `class-incharge` | Functional | School | System Default | Teacher Panel | `SchoolRole (slug: class-incharge)` | Seed `SchoolRole` + permissions |
| **Staffs** | `staffs` | Functional | School | System Default | Teacher Panel | `SchoolRole (slug: staffs)` | Seed `SchoolRole` + permissions |
| **Administrative Officer**| `administrative-officer`| Functional | School | System Default | Admin Panel | `SchoolRole (slug: administrative-officer)` | Seed `SchoolRole` + permissions |
| **Finance Department** | `finance-department` | Functional | School | System Default | Admin Panel | `SchoolRole (slug: finance-department)` | Seed `SchoolRole` + permissions |
| **Library** | `library` | Functional | School | System Default | Admin Panel | `SchoolRole (slug: library)` | Seed `SchoolRole` + permissions |
| **Canteen** | `canteen` | Functional | School | System Default | Admin Panel | `SchoolRole (slug: canteen)` | Seed `SchoolRole` + permissions |
| **Transport** | `transport` | Functional | School | System Default | Admin Panel | `SchoolRole (slug: transport)` | Seed `SchoolRole` + permissions |
| **Janitors** | `janitors` | Functional | School | System Default | Admin Panel | `SchoolRole (slug: janitors)` | Seed `SchoolRole` + permissions |
| **Hostel** | `hostel` | Functional | School | System Default | Admin Panel | `SchoolRole (slug: hostel)` | Seed `SchoolRole` + permissions |
| **Inventory** | `inventory` | Functional | School | System Default | Admin Panel | `SchoolRole (slug: inventory)` | Seed `SchoolRole` + permissions |
| **Security** | `security` | Functional | School | System Default | Admin Panel | `SchoolRole (slug: security)` | Seed `SchoolRole` + permissions |
| **Parent** | `parent` / `PARENT` | Platform | School | No | Parent Panel | `User.systemRole = 'PARENT'` + `ParentProfile` | Direct system role |
| **Student** | `student` / `STUDENT` | Platform | School | No | Student Panel | `User.systemRole = 'STUDENT'` + `Student` | Direct system role |
| **Custom Roles** *(Dynamic)* | Custom string | Functional | School | Yes | Configurable | `SchoolRole (isSystemDefault: false)` | Migrate from `schools/{id}/roles` |

---

## 4. Permission Inventory

Permissions in the application are structured around **4 atomic actions** applied to individual functional modules:

| Permission Action | Semantic Meaning | Scope | Frontend Guard | PostgreSQL Column |
| :--- | :--- | :--- | :--- | :--- |
| **`read`** | View list, inspect details, access route | Module-level | `canRead(moduleKey)` | `RolePermission.canRead` (`Boolean`) |
| **`create`** | Add new entity / record / document | Module-level | `canCreate(moduleKey)` | `RolePermission.canCreate` (`Boolean`) |
| **`edit`** | Update existing record / modify fields | Module-level | `canEdit(moduleKey)` | `RolePermission.canEdit` (`Boolean`) |
| **`delete`** | Remove entity / soft-delete / purge | Module-level | `canDelete(moduleKey)` | `RolePermission.canDelete` (`Boolean`) |

### Dependency Rules:
1. `create: true`, `edit: true`, or `delete: true` automatically implies and enforces `read: true`.
2. Setting `read: false` automatically disables `create`, `edit`, and `delete`.

---

## 5. Module Inventory

| Module Key | Module Display Label | Route Path | Core / Add-on | Supported Panels | Notes |
| :--- | :--- | :--- | :--- :--- | :---: | :--- |
| `classes` | Classes & Sections | `/admin/classes` | **Core** | Admin | Academic structure |
| `subjects` | Subject Management | `/admin/subjects` | **Core** | Admin | Curriculum subjects |
| `students` | Student Directory | `/admin/students` | **Core** | Admin | Student records |
| `staff` | Staff Management | `/admin/staff` | **Core** | Admin | Staff assignments & profiles |
| `chats` | Chat & Messaging | `/admin/chats`, `/teacher/chat`, `/parent/chat` | **Core** | Admin, Teacher, Parent | Communication |
| `homework` | Homework Management | `/admin/homework`, `/teacher/homework`, `/parent/homework` | **Core** | Admin, Teacher, Parent | Homework tasks & submissions |
| `leaves` | Leave Requests | `/admin/leaves`, `/teacher/leaves`, `/parent/leaves` | **Core** | Admin, Teacher, Parent | Leave management |
| `lesson_plans` | Lesson Plans | `/teacher/lesson-plans` | **Core** | Teacher | Route uses hyphen (`lesson-plans`) |
| `resources` | Resource Sharing | `/teacher/resources` | **Core** | Teacher | Teacher study materials |
| `ptm` | PTM Scheduler | `/teacher/ptm`, `/parent/ptm` | **Core** | Teacher, Parent | Parent-Teacher meetings |
| `performance` | Performance Tracking | `/teacher/performance`, `/parent/performance` | **Core** | Teacher, Parent | Student academic performance |
| `timetables` | Timetables & Scheduling | `/admin/timetables`, `/teacher/timetable` | Add-on | Admin, Teacher | Period scheduling |
| `transport` | Transport Management | `/admin/transport`, `/teacher/transport` | Add-on | Admin, Teacher | Vehicles, routes, GPS |
| `library` | Library Management | `/admin/library` | Add-on | Admin | Book catalog & issuance |
| `exams` | Examinations & Grading | `/admin/exams`, `/teacher/grades`, `/parent/grades` | Add-on | Admin, Teacher, Parent | Exams, marks, report cards |
| `noticeboard` | Noticeboard & Announcements | `/admin/notices`, `/teacher/notices`, `/parent/notices` | Add-on | Admin, Teacher, Parent | Announcements |
| `media` | Media & Cloudinary | Embedded | Add-on | Admin | Cloud storage integration |
| `hr-payroll` | HR & Payroll | `/admin/hr-payroll`, `/teacher/salary` | Add-on | Admin, Teacher | Staff payroll & slips |
| `attendance` | Attendance Management | `/admin/attendance`, `/teacher/attendance`, `/parent/attendance` | Add-on | Admin, Teacher, Parent | Daily attendance |
| `calendar` | Academic Calendar | `/admin/calendar`, `/teacher/calendar`, `/parent/calendar` | Add-on | Admin, Teacher, Parent | School event calendar |
| `fees` | Fees & Payments | `/admin/fees`, `/parent/fees` | Add-on | Admin, Parent | Invoicing, collections |
| `hostel` | Hostel Management | `/admin/hostel` | Add-on | Admin | Rooms & allocations |
| `inventory` | Inventory & Assets | `/admin/inventory` | Add-on | Admin | Assets & audit logs |
| `health` | Health & Medical | `/admin/health` | Add-on | Admin | Medical logs |
| `complaints` | Complaint Redressal | `/admin/complaints` | Add-on | Admin | Support & tickets |
| `alumni` | Alumni Management | `/admin/alumni` | Add-on | Admin | Alumni registry |
| `documents` | Document Management | `/admin/documents` | Add-on | Admin | Digital document store |
| `branches` | Multi-Branch Management | `/admin/branches` | Add-on | Admin | Branch management |
| `reports` | Reports & Analytics | `/admin/reports` | Add-on | Admin | Analytics |
| `leads` | Leads Management | `/admin/leads` | Add-on | Admin | Admission leads |
| `form-builder` | Custom Forms / Builder | `/admin/form-builder` | Add-on | Admin | Dynamic schema forms |
| `billing` | Billing & Subscriptions| `/admin/billing` | System Add-on | Admin | School SaaS subscription |

---

## 6. Firestore Role/Permission Data Model

### 6.1 `schools/{schoolId}/roles/{roleName}`
- **Path**: `schools/{schoolId}/roles/{roleName}` (e.g. `schools/S024/roles/Library`).
- **Fields**:
  - `name`: string (e.g. `'Library'`).
  - `loginPanel`: `'admin'` | `'teacher'`.
  - `permissions`: Map of module permissions:
    ```json
    {
      "library": { "read": true, "create": true, "edit": true, "delete": true },
      "noticeboard": { "read": true, "create": false, "edit": false, "delete": false }
    }
    ```
  - `updatedAt`: ISO timestamp string.
- **Entity Nature**: **Role Definition** (Tenant-scoped template defining rights for a role name).

### 6.2 `schools/{schoolId}/teachers/{teacherId}`
- **Path**: `schools/{schoolId}/teachers/{teacherId}`.
- **Fields**:
  - `userId`: string (Foreign key to `users/{uid}`).
  - `employeeId`: string (e.g. `'EMP-101'`).
  - `name`: string.
  - `email`: string.
  - `role`: string (primary role, e.g. `'Staffs'` or `'Library'`).
  - `roles`: array of strings (multi-role assignments, e.g. `['Class Incharge', 'Library']`).
  - `staff_type`: `'teaching'` | `'non-teaching'`.
  - `assignedClassId`: string (optional class teacher assignment).
  - `status`: `'Active'` | `'Inactive'`.
- **Entity Nature**: **Staff Profile + User-Role Assignment Junction**.

### 6.3 `users/{uid}`
- **Path**: `users/{uid}`.
- **Fields**:
  - `email`: string.
  - `role`: `'superadmin'` | `'admin'` | `'teacher'` | `'staff'` | `'parent'`.
  - `schoolId`: string (tenant UUID / code).
  - `permittedModules`: array of module IDs (school-level enabled modules).
- **Entity Nature**: **Global Identity & Top-level Role**.

---

## 7. usePermissions Analysis

### 7.1 Data Flow Architecture

```
User logs in
     │
     ▼
AuthContext provides { currentUser, userProfile }
     │
     ▼
usePermissions() evaluates userProfile:
     │
     ├── If userProfile.role === 'admin' ──► returns { permissions: 'ALL' } (Instant unblock)
     │
     └── If non-admin staff:
              │
              ▼
         Listener 1: onSnapshot on schools/{schoolId}/teachers where userId == currentUser.uid
              │
              ▼ Extracts assignedRoles = staffData.roles || [staffData.role] || ['Staffs']
              │
              ▼
         Listener 2: onSnapshot on schools/{schoolId}/roles
              │
              ▼ Iterates roleDoc in roles
              │  If assignedRoles.includes(roleDoc.id) ──► OR-merges permissions[moduleKey]
              │
              ▼
         setPermissions(mergedMatrix)
         setLoading(false)
```

### 7.2 Key Characteristics:
- **Realtime**: Changes to `schools/{schoolId}/roles` or `schools/{schoolId}/teachers` reflect in the UI immediately without page refresh.
- **Multi-Role Union**: If a staff member has `['Library', 'Transport']`, permissions are merged with logical OR (`perm1.read || perm2.read`).
- **Offline / Failure Fallback**: If listeners fail or user has no school ID, falls back to `{}` (all `canRead`, `canCreate`, `canEdit`, `canDelete` evaluate to `false`).

---

## 8. RolesPermissions Analysis

### 8.1 Administrative UI Capabilities (`src/pages/Admin/RolesPermissions.jsx`)
- **Role Creation**: `handleAddRole()` adds custom role names to `rolesList` (preventing duplicates).
- **Default Role Protection**: `handleDeleteRole()` blocks deleting the 15 `DEFAULT_ROLES` (`toast.error("Cannot delete core system roles")`).
- **Target Login Panel**: Allows assigning each role to either `Admin Panel` or `Teacher Panel`.
- **Permission Matrix**: For each approved module (`CORE_MODULES` + school's `permittedModules`), presents checkboxes for `Read / View`, `Create / Add`, `Edit / Update`, `Delete`, plus a `Select All / Clear All` toggle.
- **Persistence**: Writes directly to `schools/{schoolId}/roles/{roleName}` using `setDoc(docRef, { name, permissions, loginPanel, updatedAt }, { merge: true })`.

---

## 9. ProtectedRoute Analysis

### 9.1 Authorization Enforcement Matrix

| Route Group | Path | `allowedRoles` | `moduleKey` | Authorization Behavior |
| :--- | :--- | :--- | :--- | :--- |
| **SuperAdmin** | `/superadmin/*` | `['superadmin']` | None | Strict role check. Rejects non-superadmin to `/unauthorized`. |
| **School Admin Root** | `/admin` | `['admin', 'staff', 'teacher']` | None | Allows access to layout; sub-routes guarded individually. |
| **Admin Setup** | `/admin/setup` | `['admin']` | None | Admin-only route. |
| **Admin Roles** | `/admin/roles` | `['admin']` | None | Admin-only role management. |
| **Admin Billing** | `/admin/billing` | `['admin']` | `billing` | Admin-only + requires `billing` module enabled. |
| **Admin Modules** | `/admin/{module}` | `['admin', 'staff', 'teacher']` | `moduleKey` | `userProfile.role === 'admin'` passes unconditionally. Staff/Teacher checks `canRead(moduleKey)`. |
| **Teacher Root** | `/teacher` | `['admin', 'staff', 'teacher']` | None | Allows access to layout; sub-routes guarded individually. |
| **Teacher Modules**| `/teacher/{module}` | `['admin', 'staff', 'teacher']` | `moduleKey` | `userProfile.role === 'admin'` passes. Teacher/Staff checks `canRead(moduleKey)`. |
| **Parent Root** | `/parent/*` | `['parent']` | None | Strict role check. Rejects non-parents to `/unauthorized`. |

---

## 10. Backend RBAC Foundation

### 10.1 Prisma Schema Relational Models

```prisma
model SchoolRole {
  id              String   @id @default(uuid()) @db.Uuid
  schoolId        String   @map("school_id") @db.Uuid
  name            String   @db.VarChar(100)
  slug            String   @db.VarChar(100)
  loginPanel      String?  @map("login_panel") @db.VarChar(30)
  isSystemDefault Boolean  @default(false) @map("is_system_default")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  school          School               @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  permissions     RolePermission[]
  userAssignments UserRoleAssignment[]
  leaveApprovalRules LeaveApprovalRule[]

  @@unique([schoolId, id])
  @@unique([schoolId, slug])
  @@map("school_roles")
}

model RolePermission {
  id           String   @id @default(uuid()) @db.Uuid
  schoolRoleId String   @map("school_role_id") @db.Uuid
  moduleKey    String   @map("module_key") @db.VarChar(100)
  canRead      Boolean  @default(false) @map("can_read")
  canCreate    Boolean  @default(false) @map("can_create")
  canEdit      Boolean  @default(false) @map("can_edit")
  canDelete    Boolean  @default(false) @map("can_delete")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  schoolRole   SchoolRole @relation(fields: [schoolRoleId], references: [id], onDelete: Cascade)

  @@unique([schoolRoleId, moduleKey])
  @@map("role_permissions")
}

model UserRoleAssignment {
  id           String   @id @default(uuid()) @db.Uuid
  schoolId     String   @map("school_id") @db.Uuid
  userId       String   @map("user_id") @db.Uuid
  schoolRoleId String   @map("school_role_id") @db.Uuid
  assignedAt   DateTime @default(now()) @map("assigned_at")

  user         User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  schoolRole   SchoolRole @relation(fields: [schoolRoleId], references: [id], onDelete: Cascade)

  @@unique([schoolId, id])
  @@unique([userId, schoolRoleId])
  @@index([schoolId, userId])
  @@map("user_role_assignments")
}
```

### 10.2 Backend Middleware Contracts
- **`requireRole(...allowedRoles)`**:
  - Inspects `req.user.systemRole` / `req.user.role` / `req.user.roles`.
  - SuperAdmin automatically bypasses.
  - Rejects missing roles with HTTP 403 `ForbiddenError`.
- **`requirePermission(...requiredPermissions)`**:
  - Inspects `req.user.permissions`.
  - SuperAdmin automatically bypasses.
  - Rejects missing permissions with HTTP 403 `ForbiddenError`.

---

## 11. Firebase UID Dependencies

### 11.1 Analysis of `currentUser.uid` Usage
Across the frontend, 50+ components reference `currentUser.uid`:
1. **Firestore Query Filters**: E.g., `where("userId", "==", currentUser.uid)` in `usePermissions.js`, `TransportDetails.jsx`, `ClassRoster.jsx`.
2. **Document ID Creation**: E.g., `chatRoomId = "${student.id}_${currentUser.uid}"` in `Chat.jsx`.
3. **Foreign Key Attachment**: E.g., `teacherId: currentUser.uid`, `applicantId: currentUser.uid` in `LessonPlans.jsx`, `LeaveRequests.jsx`, `ResourceSharing.jsx`.

### 11.2 Architectural Invariant for PostgreSQL Migration:
- In Phase 4B.6-D, `normalizeAuthUser` maps `id: backendUser.id` and `uid: backendUser.id` (PostgreSQL user UUID).
- For migrated accounts, PostgreSQL `User.id` corresponds to the migrated user record, while `User.legacyFirestoreId` preserves the original Firebase UID.
- When querying PostgreSQL, all foreign keys (`userId`, `teacherId`, `createdBy`) must use PostgreSQL UUIDs.
- During the transition period while Firestore business data is still active, `currentUser.uid` continues to provide the user ID for Firestore queries without compromising PostgreSQL authentication authority.

---

## 12. Tenant Isolation Analysis

| Layer | Isolation Mechanism | Enforcement Point | Vulnerability / Bypass Risk |
| :--- | :--- | :--- | :--- |
| **Frontend UI** | `userProfile.schoolId` scopes route loading and component state. | Client React code | Client-side only; not a security boundary. |
| **Firestore Rules** | `belongsToSchool(schoolId)` requires `currentSchoolId() == schoolId`. | Firebase Security Rules | Depends on `users/{uid}.schoolId`. |
| **Backend API Context**| `tenant.middleware.js` resolves `schoolId` from PostgreSQL JWT `req.auth.schoolId`. | Express Request Pipeline | **Zero spoofing**: Rejects client-supplied `schoolId` mismatches with 403. |
| **Database Queries** | `prisma-tenant-extension` injects `AND schoolId = tenantId` into all queries. | Prisma Extension | **Strict isolation**: Multi-record and unique-record operations are scoped automatically. |
| **SuperAdmin Switching**| `tenant.middleware.js` allows `X-Tenant-Id` header for `SUPER_ADMIN` only. | Express Middleware | Validates UUID format and target school existence in PostgreSQL. |

---

## 13. Firestore Security Rules Audit

Source inspection from `PROJECT_ANALYSIS.md` (lines 569–585):
- `isAuthenticated()`: Verifies `request.auth != null`.
- `getUserData()`: Retrieves `get(/databases/$(database)/documents/users/$(request.auth.uid)).data`.
- `belongsToSchool(schoolId)`: Enforces `currentSchoolId() == schoolId || isSuperAdmin()`.
- `isAdminOfSchool(schoolId)`: Enforces `isSuperAdmin() || (currentSchoolId() == schoolId && currentRole().lower() == 'admin')`.
- `isTeacherOfSchool(schoolId)`: Enforces `isSuperAdmin() || (currentSchoolId() == schoolId && (currentRole().lower() == 'teacher' || currentRole().lower() == 'staff'))`.

**Observation**: Firestore rules enforce coarse role boundaries (`admin`, `teacher`, `parent`, `superadmin`). Fine-grained module CRUD checks (`canRead`, `canEdit`, `canDelete`) are enforced in frontend UI components (`PermissionGuard.jsx`, `ProtectedRoute.jsx`), making backend PostgreSQL authorization migration necessary to establish a true security boundary.

---

## 14. Realtime Listeners Audit

| Component | Collection Listened | Frequency / Trigger | Migration Strategy |
| :--- | :--- | :--- | :--- |
| `usePermissions.js` | `schools/{id}/teachers` | On user mount / staff doc change | Replace with REST `GET /api/v1/rbac/my-permissions` + cache invalidation |
| `usePermissions.js` | `schools/{id}/roles` | On user mount / role doc change | Replace with REST `GET /api/v1/rbac/my-permissions` + cache invalidation |
| `AdminDashboard.jsx` | `schools/{id}/customModules` | On admin mount / custom module update | Replace with REST endpoint |
| `AdminDashboard.jsx` | `schools/{id}/settings/sidebar` | On admin mount / order change | Replace with REST endpoint |
| `TeacherDashboard.jsx`| `schools/{id}/teachers` | On teacher mount / profile update | Replace with REST endpoint |
| `ParentDashboard.jsx` | `schools/{id}/invoices` | On parent mount / new invoice | Keep until business module migration |
| `Chat.jsx` | `schools/{id}/chats` | Realtime messaging | Keep Firestore / migrate to WebSocket in future messaging phase |

---

## 15. Permission & Role Caching

### Source Inspection: `src/services/CacheService.js`
- Stores tenant-scoped cache items under `${schoolId}_${key}` with TTL (default 24 hours).
- `CacheService.clearTenant(schoolId)` purges memory and LocalStorage cache on logout.
- **Audit Findings**:
  - `usePermissions.js` does **not** use `CacheService` directly; it relies on Firestore's internal SDK cache and realtime `onSnapshot` subscriptions.
  - `AuthContext.jsx` in legacy mode uses `userProfile_${uid}` cache.
  - In `HYBRID_BRIDGE`, `AuthContext.jsx` does not rely on cached permissions for authentication.
  - **Risk**: Low. Stale cache cannot elevate PostgreSQL permissions because backend middleware enforces permissions per request.

---

## 16. Role Assignment Lifecycle

```
1. School Creation (SuperAdmin / Registration)
   ├── System seeds 15 default SchoolRole records for the new tenant.
   └── Assigns primary admin User to SCHOOL_ADMIN systemRole.

2. Staff Member Creation (Admin via StaffAssignment.jsx)
   ├── Admin creates staff profile with role = 'Staffs' (or custom role).
   ├── System creates StaffProfile record in PostgreSQL.
   └── System creates UserRoleAssignment linking User to SchoolRole.

3. Role & Permission Modification (Admin via RolesPermissions.jsx)
   ├── Admin edits CRUD matrix on a SchoolRole.
   ├── System updates RolePermission records for that SchoolRole.
   └── All users assigned to that SchoolRole inherit updated permissions.

4. Staff Role Reassignment / Multiple Roles
   ├── Admin updates UserRoleAssignment records for the user.
   └── User receives union of permissions across all assigned SchoolRoles.

5. Staff Deletion / Deactivation
   ├── Deactivating User (`isActive = false`) immediately invalidates all access.
   └── Deleting StaffProfile removes UserRoleAssignment records.
```

---

## 17. PostgreSQL Target Mapping

```
Firestore: schools/{schoolId}/roles/{roleName}
     │
     ▼
PostgreSQL: SchoolRole (table: school_roles)
     ├── id: UUID (PK)
     ├── schoolId: UUID (FK to schools.id)
     ├── name: roleName (VarChar 100)
     ├── slug: slugify(roleName) (VarChar 100) [Unique with schoolId]
     ├── loginPanel: doc.loginPanel || 'admin' (VarChar 30)
     └── isSystemDefault: DEFAULT_ROLES.includes(roleName) (Boolean)

Firestore: role.permissions[moduleKey] = { read, create, edit, delete }
     │
     ▼
PostgreSQL: RolePermission (table: role_permissions)
     ├── id: UUID (PK)
     ├── schoolRoleId: UUID (FK to school_roles.id)
     ├── moduleKey: moduleKey (VarChar 100) [Unique with schoolRoleId]
     ├── canRead: boolean
     ├── canCreate: boolean
     ├── canEdit: boolean
     └── canDelete: boolean

Firestore: schools/{schoolId}/teachers/{teacherId}.roles = ['Role1', 'Role2']
     │
     ▼
PostgreSQL: UserRoleAssignment (table: user_role_assignments)
     ├── id: UUID (PK)
     ├── schoolId: UUID (FK to schools.id)
     ├── userId: UUID (FK to users.id)
     └── schoolRoleId: UUID (FK to school_roles.id) [Unique with userId]
```

---

## 18. Security Threat Model

| Threat | Severity | Mitigation Strategy |
| :--- | :---: | :--- |
| **Client-Side Permission Tampering** | **CRITICAL** | Frontend checks remain UI visibility only. Backend routes MUST enforce `requirePermission` / `requireRole` on every API endpoint. |
| **Cross-Tenant Role Injection** | **CRITICAL** | `tenant.middleware.js` and `prisma-tenant-extension` enforce `schoolId` at query level; users cannot query or assign roles belonging to another tenant. |
| **Self-Role Elevation** | **HIGH** | Role management endpoints must be strictly restricted to `systemRole === 'SCHOOL_ADMIN'` or `systemRole === 'SUPER_ADMIN'`. Non-admin staff cannot modify their own roles. |
| **Stale Permission Window** | **MEDIUM** | Realtime Firestore listener updates instantly. When migrating to backend API, tokenVersion rotation or short-lived cached permissions (e.g. 5-min TTL / token re-fetch) must be used. |
| **Orphaned UserRoleAssignments on Role Deletion** | **MEDIUM** | PostgreSQL foreign keys use `onDelete: Cascade` on `SchoolRole` &rarr; `RolePermission` and `UserRoleAssignment`. |
| **Default System Role Deletion** | **LOW** | Prevent deletion of `isSystemDefault: true` roles in backend controller and service validation. |

---

## 19. Data Quality & Edge Cases

1. **Case-Insensitive Role Matching**: In Firestore, role names are matched case-insensitively (`r.toLowerCase() === roleName.toLowerCase()`). In PostgreSQL, `SchoolRole.slug` is normalized lowercase (e.g. `'finance-department'`).
2. **Missing Role Assignments**: If a staff member in Firestore lacks `roles` array or `role` string, `usePermissions.js` defaults to `['Staffs']`. In PostgreSQL, every staff member MUST have an explicit `UserRoleAssignment` to `staffs` upon creation.
3. **Multi-Role Union**: In Firestore, teachers can have multiple roles in `roles: []`. PostgreSQL `UserRoleAssignment` natively supports multiple `SchoolRole` records per user.

---

## 20. Migration Risks

| Risk | Classification | Mitigation Strategy |
| :--- | :---: | :--- |
| **Module Key Inconsistencies** (`lesson_plans` vs `lesson-plans`) | **MEDIUM** | Maintain a canonical `MODULE_KEYS` dictionary in `backend/src/config/constants.js` and validate all keys in Zod schemas. |
| **Realtime Permission Updates Loss** | **MEDIUM** | Implement a permission refresh trigger or short cache TTL when transitioning from Firestore listeners to REST API. |
| **Admin Panel Navigation Breaking for Custom Staff** | **MEDIUM** | Ensure `userAdapter.js` and `normalizeAuthUser` continue mapping `staffProfile` and resolved `loginPanel` correctly. |
| **SuperAdmin Universal Access** | **LOW** | `requireRole` and `requirePermission` middleware explicitly bypass for `SUPER_ADMIN`. |

---

## 21. Recommended Phased Migration Sequence

```
┌────────────────────────────────────────────────────────┐
│ Phase 4B.7-A: RBAC & Permission Migration Audit        │ ◄── COMPLETE (This Phase)
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│ Phase 4B.7-B: PostgreSQL RBAC Endpoints & Mapping      │
│ - Seed/Migrate SchoolRole & RolePermission per tenant  │
│ - Implement CRUD endpoints for Roles & Permissions     │
│ - Implement UserRoleAssignment management endpoints    │
│ - GET /api/v1/rbac/my-permissions endpoint             │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│ Phase 4B.7-C: Backend Authorization Enforcement        │
│ - Mount requirePermission on business endpoints        │
│ - Enforce strict tenant isolation on role management   │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│ Phase 4B.7-D: Frontend Permission Adapter & Cutover    │
│ - Migrate usePermissions.js to fetch from backend API  │
│ - Dual-mode flag support (FIREBASE_LEGACY vs BACKEND)  │
│ - Migrate RolesPermissions.jsx UI to backend API       │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│ Phase 4B.7-E: Verification & Firestore Retirement      │
│ - End-to-end multi-role permission verification        │
│ - Retire Firestore permission listeners                │
└────────────────────────────────────────────────────────┘
```

---

## 22. Rollback Strategy

During future Phase 4B.7 migrations, rollback safety is maintained:
1. Feature flag `VITE_AUTH_MODE=FIREBASE_LEGACY` continues to use Firestore realtime permissions in `usePermissions.js`.
2. PostgreSQL `SchoolRole` and `RolePermission` tables are additive and non-destructive to Firestore data.
3. Zero destructive changes to Firestore collections occur until the final retirement phase.

---

## 23. Future Test Plan

### Test Specifications for Phase 4B.7-B / 4B.7-C:
1. **Default Role Seeding**: Verify all 15 default `SchoolRole` records and their `RolePermission` CRUD flags are seeded for every tenant.
2. **Custom Role Creation**: Verify school admins can create custom roles with unique slugs within their tenant.
3. **Tenant Role Isolation**: Verify School A cannot view, edit, or assign roles belonging to School B.
4. **Multi-Role Permission Merging**: Verify a user with 2 assigned roles receives the union of permissions across both roles.
5. **Admin Universal Access**: Verify `SCHOOL_ADMIN` and `SUPER_ADMIN` receive unconditional access to all modules.
6. **Permission Enforcement**: Verify `requirePermission('classes:create')` allows authorized staff and returns HTTP 403 for unauthorized staff.
7. **Role Deletion Cascade**: Verify deleting a custom role cleans up `RolePermission` and `UserRoleAssignment` records.
8. **Default Role Protection**: Verify attempting to delete a system default role returns HTTP 400.

---

## 24. Contradictions & Unknowns

- **[VERIFIED]**: The 15 default institutional roles are identical between `src/pages/Admin/RolesPermissions.jsx` and `backend/prisma/seed.js`.
- **[VERIFIED]**: PostgreSQL schema already contains the relational tables `school_roles`, `role_permissions`, and `user_role_assignments`.
- **[INFERENCE]**: Frontend `usePermissions.js` checks `permissions[moduleKey]?.read === true`, which aligns with the boolean column `RolePermission.canRead`.
- **[UNKNOWN]**: Whether any legacy school tenant in production has custom role names with special characters that require specialized slugification handling.

---

## 25. Files Inspected

1. `src/hooks/usePermissions.js`
2. `src/pages/Admin/RolesPermissions.jsx`
3. `src/components/ProtectedRoute.jsx`
4. `src/components/PermissionGuard.jsx`
5. `src/pages/AdminDashboard.jsx`
6. `src/pages/TeacherDashboard.jsx`
7. `src/pages/Admin/StaffAssignment.jsx`
8. `src/App.jsx`
9. `src/firebase/firestore.js`
10. `src/firebase/auth.js`
11. `src/services/CacheService.js`
12. `backend/prisma/schema.prisma`
13. `backend/prisma/seed.js`
14. `backend/src/config/constants.js`
15. `backend/src/middleware/rbac.middleware.js`
16. `backend/src/middleware/auth.middleware.js`
17. `backend/src/middleware/tenant.middleware.js`
18. `backend/src/database/tenant-extension.js`
19. `backend/src/routes/index.js`
20. `backend/src/modules/auth/auth.routes.js`
21. `PROJECT_ANALYSIS.md`

---

## 26. Git Diff Verification

- Zero application implementation code modified.
- Zero Prisma schema changes.
- Zero database mutations.
- Zero Firestore rule or data changes.

---

## 27. Final Decision

**READY FOR 4B.7-B**

The investigation is complete. The system is fully mapped and ready for Phase 4B.7-B (PostgreSQL RBAC Endpoints & Mapping Implementation) upon explicit user approval.

# HARD STOP — AWAITING EXPLICIT APPROVAL FOR PHASE 4B.7-B
