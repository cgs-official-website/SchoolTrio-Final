# RBAC.1 — Roles & Permissions Architecture & Legacy Preflight Audit

## 1. Executive Summary

This preflight audit evaluates the current Roles & Permissions (RBAC) architecture across the frontend UI, custom hooks, backend services, PostgreSQL database models, and legacy Firestore integration points.

- **Frontend State**:
  - `src/hooks/usePermissions.js` actively uses two Firestore snapshot listeners (`schools/${schoolId}/teachers` and `schools/${schoolId}/roles`) on almost every authenticated page.
  - `src/pages/Admin/RolesPermissions.jsx` reads and writes directly to Firestore `schools/${schoolId}/roles` and `schools/${schoolId}`.
- **Backend & Database State**:
  - PostgreSQL models (`SchoolRole`, `RolePermission`, `UserRoleAssignment`) are 100% defined and active in Prisma schema.
  - Backend RBAC module ([`backend/src/modules/rbac/`](file:///c:/Projects/SMS/backend/src/modules/rbac/)) exposes 9 production-grade REST endpoints with comprehensive Redis caching (TTL 300s), fail-safe fallback, multi-role union resolution, and audit logging.
  - 95 baseline tests across 9 test files are passing with 100% success rate.
- **Audit Conclusion**: Zero architectural or security blockers exist. The backend REST endpoints and database models are fully capable of supporting the complete frontend migration for `usePermissions.js` and `RolesPermissions.jsx`.

---

## 2. Current RBAC Architecture

```
                                  CURRENT ARCHITECTURE
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ FRONTEND                                                                               │
│                                                                                        │
│   usePermissions() Hook  ──[onSnapshot]──> Firestore: schools/{schoolId}/teachers      │
│          │               ──[onSnapshot]──> Firestore: schools/{schoolId}/roles         │
│          ▼                                                                             │
│   20+ UI Pages & Components (Class, Student, Payroll, Library, ProtectedRoute, etc.)  │
│                                                                                        │
│   RolesPermissions.jsx   ──[getDocs/setDoc/deleteDoc]──> Firestore: schools/{id}/roles │
└────────────────────────────────────────────────────────────────────────────────────────┘

                                   TARGET ARCHITECTURE
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ FRONTEND                                                                               │
│                                                                                        │
│   usePermissions() Hook  ──[GET /api/v1/rbac/my-permissions]──> REST API Client        │
│          │                                                                             │
│          ▼                                                                             │
│   RolesPermissions.jsx   ──[GET/POST/PATCH/DELETE /api/v1/rbac/*]──> REST API Client   │
└──────────────────────────────────────────┬─────────────────────────────────────────────┘
                                           │
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ BACKEND & DATABASE                                                                     │
│                                                                                        │
│   Express Router (/api/v1/rbac/*)                                                      │
│          │ (authenticate + tenantContext + requireRole)                                │
│          ▼                                                                             │
│   RBAC Service (Redis Cache-aside + Multi-Role Logical OR Union)                       │
│          │                                                                             │
│          ▼                                                                             │
│   Prisma / PostgreSQL: SchoolRole, RolePermission, UserRoleAssignment                  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Permission Data Model

### Legacy Firestore Shape
In Firestore `schools/${schoolId}/roles/{roleId}`:
```json
{
  "name": "Library",
  "loginPanel": "admin",
  "permissions": {
    "library": { "read": true, "create": true, "edit": true, "delete": true },
    "attendance": { "read": true, "create": false, "edit": false, "delete": false }
  },
  "updatedAt": "2026-09-17T00:00:00.000Z"
}
```

### Authoritative PostgreSQL / REST API Shape
Returned by `GET /api/v1/rbac/my-permissions`:
```json
{
  "success": true,
  "data": {
    "userId": "uuid",
    "schoolId": "uuid",
    "systemRole": "TEACHER",
    "isSuperAdmin": false,
    "isSchoolAdmin": false,
    "roles": [
      {
        "id": "uuid",
        "name": "Library Staff",
        "slug": "library-staff",
        "loginPanel": "admin",
        "isSystemDefault": false
      }
    ],
    "permissions": {
      "library": { "canRead": true, "canCreate": true, "canEdit": true, "canDelete": true },
      "attendance": { "canRead": true, "canCreate": false, "canEdit": false, "canDelete": false },
      "classes": { "canRead": false, "canCreate": false, "canEdit": false, "canDelete": false }
    },
    "isUnrestricted": false
  }
}
```

### Invariant & Normalization Rules
1. **Dependency Invariant**: Any write privilege (`canCreate`, `canEdit`, `canDelete`) automatically implies and enforces `canRead = true`.
2. **Revocation Invariant**: `canRead = false` automatically forces `canCreate = false`, `canEdit = false`, `canDelete = false`.
3. **Multi-Role Union**: When a user possesses multiple roles, permissions evaluate as the logical OR union of all assigned roles.

---

## 4. `usePermissions()` Analysis

### Implementation Audit
- **Location**: [`src/hooks/usePermissions.js`](file:///c:/Projects/SMS/src/hooks/usePermissions.js)
- **Inputs**: `currentUser`, `userProfile` from `AuthContext`.
- **Admin Bypass**: If `userProfile.role === 'admin'`, immediately sets `permissions = 'ALL'`.
- **Current Data Fetching**:
  1. Sets up `onSnapshot` listener on `schools/${schoolId}/teachers` filtered by `userId == currentUser.uid` to extract `roles` array.
  2. Sets up secondary `onSnapshot` listener on `schools/${schoolId}/roles` to fetch all tenant roles and compute in-memory union.
- **Outputs**:
  - `permissions`: Object map or `'ALL'` or `{}`.
  - `loading`: Boolean loading flag.
  - `canRead(moduleKey)`: Boolean check.
  - `canCreate(moduleKey)`: Boolean check.
  - `canEdit(moduleKey)`: Boolean check.
  - `canDelete(moduleKey)`: Boolean check.

### Consumers of `usePermissions()` (20 Identified Files)
1. `src/components/ProtectedRoute.jsx`
2. `src/components/PermissionGuard.jsx`
3. `src/components/AcademicCalendar.jsx`
4. `src/pages/AdminDashboard.jsx`
5. `src/pages/TeacherDashboard.jsx`
6. `src/pages/Admin/ClassManagement.jsx`
7. `src/pages/Admin/StudentManagement.jsx`
8. `src/pages/Admin/StaffAssignment.jsx`
9. `src/pages/Admin/SubjectManagement.jsx`
10. `src/pages/Admin/TimetableManagement.jsx`
11. `src/pages/Admin/TransportManagement.jsx`
12. `src/pages/Admin/LibraryManagement.jsx`
13. `src/pages/Admin/InventoryManagement.jsx`
14. `src/pages/Admin/FeeManagement.jsx`
15. `src/pages/Admin/LeaveManagement.jsx`
16. `src/pages/Admin/Noticeboard.jsx`
17. `src/pages/Admin/HRPayrollManagement.jsx`
18. `src/pages/Teacher/LessonPlans.jsx`
19. `src/pages/Teacher/ResourceSharing.jsx`
20. `src/pages/Teacher/HomeworkManagement.jsx`

---

## 5. `RolesPermissions.jsx` Analysis

- **Location**: [`src/pages/Admin/RolesPermissions.jsx`](file:///c:/Projects/SMS/src/pages/Admin/RolesPermissions.jsx)
- **Current Firestore Operations**:
  - `doc(db, 'schools', schoolId)` $\longrightarrow$ Fetches permitted modules.
  - `collection(db, 'schools/${schoolId}/roles')` $\longrightarrow$ Fetches custom/default roles and permissions.
  - `setDoc(doc(db, 'schools/${schoolId}/roles', activeRole), ...)` $\longrightarrow$ Saves role permissions and login panel.
  - `deleteDoc(doc(db, 'schools/${schoolId}/roles', roleToDelete))` $\longrightarrow$ Deletes custom role.
- **Equivalent REST Endpoints**:
  - Fetch roles & permissions: `GET /api/v1/rbac/roles`
  - Create new custom role: `POST /api/v1/rbac/roles`
  - Update permissions: `PATCH /api/v1/rbac/roles/:roleId` and `PUT /api/v1/rbac/roles/:roleId/permissions`
  - Delete custom role: `DELETE /api/v1/rbac/roles/:roleId`
  - Available modules: `GET /api/v1/rbac/permissions`

---

## 6. Backend REST Endpoint Audit

| Endpoint | HTTP Method | Auth Required | Tenant Scoped | RBAC Authorization | Controller / Service Handler |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/v1/rbac/my-permissions` | `GET` | Yes (JWT) | Yes | Authenticated Tenant User | `rbacController.getMyPermissions` |
| `/api/v1/rbac/roles` | `GET` | Yes (JWT) | Yes | `SCHOOL_ADMIN`, `SUPER_ADMIN` | `rbacController.listRoles` |
| `/api/v1/rbac/roles/:roleId` | `GET` | Yes (JWT) | Yes | `SCHOOL_ADMIN`, `SUPER_ADMIN` | `rbacController.getRole` |
| `/api/v1/rbac/roles` | `POST` | Yes (JWT) | Yes | `SCHOOL_ADMIN`, `SUPER_ADMIN` | `rbacController.createRole` |
| `/api/v1/rbac/roles/:roleId` | `PATCH` | Yes (JWT) | Yes | `SCHOOL_ADMIN`, `SUPER_ADMIN` | `rbacController.updateRole` |
| `/api/v1/rbac/roles/:roleId` | `DELETE` | Yes (JWT) | Yes | `SCHOOL_ADMIN`, `SUPER_ADMIN` | `rbacController.deleteRole` |
| `/api/v1/rbac/permissions` | `GET` | Yes (JWT) | Yes | `SCHOOL_ADMIN`, `SUPER_ADMIN` | `rbacController.listSystemPermissions` |
| `/api/v1/rbac/assignments` | `POST` | Yes (JWT) | Yes | `SCHOOL_ADMIN`, `SUPER_ADMIN` | `rbacController.assignRole` |
| `/api/v1/rbac/assignments` | `DELETE` | Yes (JWT) | Yes | `SCHOOL_ADMIN`, `SUPER_ADMIN` | `rbacController.removeRole` |

---

## 7. PostgreSQL Model Audit

Defined in [`backend/prisma/schema.prisma`](file:///c:/Projects/SMS/backend/prisma/schema.prisma):

```prisma
model SchoolRole {
  id              String   @id @default(uuid()) @db.Uuid
  schoolId        String   @map("school_id") @db.Uuid
  name            String   @db.VarChar(100)
  slug            String   @db.VarChar(100)
  loginPanel      String   @default("admin") @map("login_panel") @db.VarChar(20)
  isSystemDefault Boolean  @default(false) @map("is_system_default")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  school          School                @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  permissions     RolePermission[]
  userAssignments UserRoleAssignment[]

  @@unique([schoolId, slug])
  @@unique([schoolId, name])
  @@map("school_roles")
}

model RolePermission {
  id        String   @id @default(uuid()) @db.Uuid
  roleId    String   @map("role_id") @db.Uuid
  moduleKey String   @map("module_key") @db.VarChar(100)
  canRead   Boolean  @default(false) @map("can_read")
  canCreate Boolean  @default(false) @map("can_create")
  canEdit   Boolean  @default(false) @map("can_edit")
  canDelete Boolean  @default(false) @map("can_delete")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  schoolRole SchoolRole @relation(fields: [roleId], references: [id], onDelete: Cascade)

  @@unique([roleId, moduleKey])
  @@map("role_permissions")
}

model UserRoleAssignment {
  id         String   @id @default(uuid()) @db.Uuid
  schoolId   String   @map("school_id") @db.Uuid
  userId     String   @map("user_id") @db.Uuid
  roleId     String   @map("role_id") @db.Uuid
  assignedAt DateTime @default(now()) @map("assigned_at")

  user       User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  schoolRole SchoolRole @relation(fields: [roleId], references: [id], onDelete: Cascade)

  @@unique([schoolId, userId, roleId])
  @@map("user_role_assignments")
}
```

---

## 8. Permission Registry Comparison

The 32 canonical module keys in [`backend/src/modules/rbac/rbac.constants.js`](file:///c:/Projects/SMS/backend/src/modules/rbac/rbac.constants.js) match the frontend modules in [`RolesPermissions.jsx`](file:///c:/Projects/SMS/src/pages/Admin/RolesPermissions.jsx):

| Module Key | Frontend Display Label | Backend Canonical Key | Status |
| :--- | :--- | :--- | :--- |
| `classes` | Classes & Sections | `classes` | **PASS** |
| `subjects` | Subject Management | `subjects` | **PASS** |
| `students` | Student Directory | `students` | **PASS** |
| `staff` | Staff Management | `staff` | **PASS** |
| `chats` | Chat & Messaging | `chats` | **PASS** |
| `homework` | Homework Management | `homework` | **PASS** |
| `leaves` | Leave Requests | `leaves` | **PASS** |
| `lesson_plans` | Lesson Plans | `lesson_plans` | **PASS** |
| `resources` | Resource Sharing | `resources` | **PASS** |
| `ptm` | PTM Scheduler | `ptm` | **PASS** |
| `performance` | Performance Tracking | `performance` | **PASS** |
| `timetables` | Timetables & Scheduling | `timetables` | **PASS** |
| `transport` | Transport Management (GPS/Routes) | `transport` | **PASS** |
| `library` | Library Management | `library` | **PASS** |
| `exams` | Examinations & Report Cards | `exams` | **PASS** |
| `noticeboard` | Noticeboard & Announcements | `noticeboard` | **PASS** |
| `media` | Media & Cloudinary Integration | `media` | **PASS** |
| `hr-payroll` | HR & Payroll Management | `hr-payroll` | **PASS** |
| `attendance` | Attendance Management | `attendance` | **PASS** |
| `calendar` | Academic Calendar | `calendar` | **PASS** |
| `fees` | Fees & Payments | `fees` | **PASS** |
| `hostel` | Hostel Management | `hostel` | **PASS** |
| `inventory` | Inventory & Assets | `inventory` | **PASS** |
| `health` | Health & Medical Records | `health` | **PASS** |
| `complaints` | Complaint Redressal | `complaints` | **PASS** |
| `alumni` | Alumni Management | `alumni` | **PASS** |
| `documents` | Document Management | `documents` | **PASS** |
| `branches` | Multi-Branch Management | `branches` | **PASS** |
| `reports` | Reports & Analytics | `reports` | **PASS** |
| `leads` | Leads Management | `leads` | **PASS** |
| `form-builder` | Custom Forms / Form Builder | `form-builder` | **PASS** |
| `billing` | Billing & Subscriptions | `billing` | **PASS** |

---

## 9. System Role Audit

15 Institutional Default Roles are supported in both frontend and backend:
1. `Correspondent` (`admin` panel, system default)
2. `Principal` (`admin` panel, system default)
3. `Vice Principal` (`admin` panel, system default)
4. `Subject Wise Head` (`teacher` panel, system default)
5. `Class Incharge` (`teacher` panel, system default)
6. `Staffs` (`teacher` panel, system default)
7. `Administrative Officer` (`admin` panel, system default)
8. `Finance Department` (`admin` panel, system default)
9. `Library` (`admin` panel, system default)
10. `Canteen` (`admin` panel, system default)
11. `Transport` (`admin` panel, system default)
12. `Janitors` (`admin` panel, system default)
13. `Hostel` (`admin` panel, system default)
14. `Inventory` (`admin` panel, system default)
15. `Security` (`admin` panel, system default)

*System default roles cannot have their slugs modified or be deleted from the system.*

---

## 10. Role Assignment Flow

```
User (PostgreSQL User Table)
       │
       ▼
UserRoleAssignment (Multi-role compound link)
       │
       ▼
SchoolRole (Role Definition + loginPanel)
       │
       ▼
RolePermission (Per-module CRUD flags)
       │
       ▼
Effective Permissions (Union calculation across all assigned roles)
```

---

## 11. Effective Permission Resolution

1. **SuperAdmin**: `isUnrestricted: true`, all 32 modules granted full CRUD (`true`).
2. **School Admin**: `isUnrestricted: true`, all 32 modules granted full CRUD (`true`).
3. **Staff / Teacher**:
   - Queries `user_role_assignments` for `schoolId` + `userId`.
   - Computes logical OR across all assigned roles:
     $$\text{canRead}_{\text{eff}}(M) = \bigvee_{r \in \text{Roles}} \text{canRead}_r(M)$$
   - Applies dependency invariant: if any write permission is true $\implies \text{canRead} = \text{true}$.
   - Caches computed map in Redis under key `rbac:perms:${schoolId}:${userId}` (TTL 300s).

---

## 12. Real-Time Behavior & Invalidation

- **Current Firestore Behavior**: Firestore listeners (`onSnapshot`) push updates in real time.
- **REST Behavior**:
  - `GET /api/v1/rbac/my-permissions` is fetched on app mount / auth context change.
  - Role/permission updates in `RolesPermissions.jsx` automatically invalidate Redis cache via `delPattern("rbac:perms:${schoolId}:*")` and update state upon mutation.
  - No polling or WebSockets needed; standard React refetch on auth/tenant/role change preserves responsive permissions.

---

## 13. Security Preconditions

- **Privilege Escalation Prevention**: Non-admin users attempting to assign roles to themselves or call `/api/v1/rbac/roles` receive `403 Forbidden`.
- **Tenant Isolation**: Every query strictly scoped by `schoolId` via `tenantContext` and Prisma tenant extension.
- **Cross-Tenant Guard**: Role and assignment IDs from another tenant are rejected with `404 Not Found` or `403 TenantAccessError`.

---

## 14. Firestore Dependency Map

| Target File | Current Firestore Dependency | Replacement REST Operation |
| :--- | :--- | :--- |
| `src/hooks/usePermissions.js` | `onSnapshot(schools/${schoolId}/teachers)`<br>`onSnapshot(schools/${schoolId}/roles)` | `GET /api/v1/rbac/my-permissions` via `src/api/rbac.js` |
| `src/pages/Admin/RolesPermissions.jsx` | `getDoc(schools/${schoolId})`<br>`getDocs(schools/${schoolId}/roles)`<br>`setDoc(schools/${schoolId}/roles)`<br>`deleteDoc(schools/${schoolId}/roles)` | `GET /api/v1/rbac/roles`<br>`POST /api/v1/rbac/roles`<br>`PATCH /api/v1/rbac/roles/:id`<br>`DELETE /api/v1/rbac/roles/:id`<br>`GET /api/v1/rbac/permissions` |

---

## 15. Existing Test Baseline

Ran baseline RBAC backend test suite:
```bash
npm test -- tests/integration/rbac tests/unit/rbac tests/security/rbac-middleware.test.js
```
- `tests/unit/rbac/rbac.effective-permissions.test.js` (13 tests passed)
- `tests/unit/rbac/rbac.service.test.js` (15 tests passed)
- `tests/security/rbac-middleware.test.js` (34 tests passed)
- `tests/unit/rbac/rbac.slug.test.js` (17 tests passed)
- `tests/unit/rbac/rbac-migrator.test.js` (3 tests passed)
- `tests/integration/rbac/rbac-my-permissions.test.js` (1 test passed)
- `tests/integration/rbac/rbac-permissions.test.js` (2 tests passed)
- `tests/integration/rbac/rbac-assignments.test.js` (3 tests passed)
- `tests/integration/rbac/rbac-roles.test.js` (7 tests passed)

**Baseline Total: 9 test files passed, 95 tests passed, 0 failures.**

---

## 16. REST Migration Contract

The frontend migration in **RBAC.3** must strictly adhere to the following contract:
1. `usePermissions()` must return `{ permissions, loading, canRead, canCreate, canEdit, canDelete }` with identical function signatures and behavior.
2. `canRead(moduleKey)` and other action checkers must accept all 32 canonical module keys.
3. System default roles cannot be deleted.
4. Toggling permissions in `RolesPermissions.jsx` must preserve the automatic read-dependency invariant.
5. Zero runtime Firestore operations in `usePermissions.js` and `RolesPermissions.jsx`.

---

## 17. Concrete Blockers

**ZERO BLOCKERS FOUND.**
All backend models, endpoints, schemas, validation rules, and caching mechanisms are verified, active, and test-covered.

---

## 18. Recommended RBAC.2 Scope

- **RBAC.2**: Perform backend verification and contract alignment confirmation for RBAC endpoints before cutting over frontend.

==================================================
HARD STOP
==================================================
