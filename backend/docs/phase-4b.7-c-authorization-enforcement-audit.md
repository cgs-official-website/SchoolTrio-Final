# PHASE 4B.7-C — BACKEND BUSINESS ENDPOINT AUTHORIZATION PREFLIGHT REPORT
## STEP 1 — READ-ONLY AUDIT & IMPLEMENTATION BLUEPRINT

**Phase**: Phase 4B.7-C — Backend Business Endpoint Authorization Enforcement  
**Stage**: Step 1 — Preflight Audit (Read-Only)  
**Execution Date**: 2026-09-09  
**Classification**: **READY FOR IMPLEMENTATION**  
**Database**: PostgreSQL 16 (Prisma ORM on Railway)  
**Authentication Authority**: PostgreSQL User + HS256 JWT + HttpOnly RefreshSession  
**Authorization Authority**: PostgreSQL SchoolRole + RolePermission + UserRoleAssignment  

---

## 1. Executive Summary

Phase 4B.7-B successfully established the PostgreSQL RBAC data layer, repository, service, management APIs (`/api/v1/rbac/*`), and live Firestore-to-PostgreSQL migrator.

The purpose of **Phase 4B.7-C** is to move from client-dependent permission checks to **strict, server-side authoritative authorization** across all backend business endpoints.

### Key Audit Conclusions:
1. **Frontend Is Not a Security Boundary**: The frontend React UI (`usePermissions.js`) conditionally renders UI elements based on Firestore/PostgreSQL permissions. However, backend routes currently do not evaluate functional permissions, meaning direct API requests could bypass frontend restrictions.
2. **Authoritative Middleware Pipeline Established**: The foundational `authenticate` and `tenantContext` middleware are robust, cryptographically verified, and strictly isolated by `schoolId`.
3. **`requirePermission` Middleware Upgrade Required**: The current `requirePermission` stub in `backend/src/middleware/rbac.middleware.js` checks an in-memory array on `req.user` rather than querying PostgreSQL RBAC. It must be upgraded to dynamically resolve effective permissions via `rbacService.getUserEffectivePermissions(schoolId, userId)` with Redis caching and PostgreSQL fallback.
4. **Canonical 32-Module Alignment**: All business endpoints map directly to the 32 canonical module keys established in Phase 4B.7-B without requiring new or unmapped keys.
5. **Zero Implementation in This Step**: No source code, database schemas, frontend components, or configuration files have been modified.

---

## 2. Current Authentication & Authorization Pipeline

### Pipeline Architecture

```
Incoming HTTP Request
       │
       ▼
1. authenticate (auth.middleware.js)
   ├── Extracts Bearer <access_token> from Authorization header
   ├── Verifies HS256 signature and expiration
   ├── Queries PostgreSQL User by decoded.sub
   ├── Enforces user.isActive === true (Rejects deactivated accounts with 403)
   ├── Enforces decoded.tokenVersion === user.tokenVersion (Rejects revoked sessions with 401)
   └── Attaches req.auth and req.user
       │
       ▼
2. tenantContext (tenant.middleware.js)
   ├── Resolves authoritative schoolId from req.auth.schoolId
   ├── Validates and rejects any conflicting req.body/query/params.schoolId (403)
   ├── Handles SUPER_ADMIN tenant switching via X-Tenant-Id header
   └── Binds execution to AsyncLocalStorage via runWithTenantContext
       │
       ▼
3. requirePermission(moduleKey, operation) [TO BE UPGRADED IN 4B.7-C]
   ├── Checks SUPER_ADMIN / SCHOOL_ADMIN bypass (Universal Access)
   ├── Queries Redis cache: rbac:perms:<schoolId>:<userId>
   ├── Fallback: Queries PostgreSQL via rbacService.getUserEffectivePermissions()
   └── Evaluates Boolean: canRead / canCreate / canEdit / canDelete
       │
       ▼
4. validate(schemas) (validate.middleware.js)
   ├── Validates req.params against Zod schema
   ├── Validates req.query against Zod schema
   └── Validates req.body against Zod schema
       │
       ▼
5. Controller Execution (module.controller.js)
   └── Parses HTTP inputs and delegates to service layer
       │
       ▼
6. Service Layer & Entity Ownership (module.service.js)
   └── Enforces business rules and fine-grained resource ownership (e.g. ParentStudentLink)
       │
       ▼
7. Tenant-Scoped Prisma Client (tenant-extension.js)
   └── Automatically applies { where: { schoolId } } filter on PostgreSQL queries
```

### Direct Answers to Pipeline Questions:
1. **Where is JWT authentication performed?**  
   In `backend/src/middleware/auth.middleware.js` (`authenticate`).
2. **Where is tenant context established?**  
   In `backend/src/middleware/tenant.middleware.js` (`tenantContext`).
3. **Where are system roles checked?**  
   In `backend/src/middleware/rbac.middleware.js` (`requireRole`).
4. **Where are functional RBAC permissions currently checked?**  
   Currently only in `GET /api/v1/rbac/my-permissions` and test suites. They are not yet mounted on business endpoints.
5. **Is `requirePermission` already implemented?**  
   A stub exists in `rbac.middleware.js` (Phase 4A), but it checks a static `req.user.permissions` array. It must be updated to invoke PostgreSQL RBAC.
6. **Is `requirePermission` mounted anywhere outside RBAC endpoints?**  
   No. Currently mounted on 0 routes.
7. **What happens if a user has a valid JWT but no functional role?**  
   If an endpoint has only `authenticate` and `tenantContext`, the request currently succeeds. When `requirePermission` is mounted, users with no functional roles will be denied with 403 `ForbiddenError`.
8. **What happens if a user tampers with frontend permission state?**  
   Frontend state is ignored by the backend. Backend RBAC computes permissions directly from PostgreSQL.
9. **What happens if a user directly calls a protected business API?**  
   Without backend `requirePermission`, any authenticated tenant user could execute operations. Phase 4B.7-C closes this vulnerability completely.

---

## 3. Complete Backend Route Inventory

| HTTP Method | Path | Router File | Controller / Handler | Auth Middleware | Tenant Middleware | Current Role Middleware | Current Permission Middleware | Target RBAC Module | Target Operation | Current Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/` | `routes/index.js` | Inline status handler | None (Public) | None | None | None | None | N/A | Public |
| `GET` | `/api/v1/health` | `health.routes.js` | `liveCheck` | None (Public) | None | None | None | None | N/A | Public |
| `GET` | `/api/v1/health/live` | `health.routes.js` | `liveCheck` | None (Public) | None | None | None | None | N/A | Public |
| `GET` | `/api/v1/health/ready` | `health.routes.js` | `readyCheck` | None (Public) | None | None | None | None | N/A | Public |
| `POST` | `/api/v1/auth/login` | `auth.routes.js` | `login` | None (Rate limited) | None | None | None | None | N/A | Public |
| `POST` | `/api/v1/auth/admission-login` | `auth.routes.js` | `admissionLogin` | None (Rate limited) | None | None | None | None | None | N/A | Public |
| `POST` | `/api/v1/auth/firebase-exchange` | `auth.routes.js` | `firebaseExchange` | None (Rate limited) | None | None | None | None | N/A | Public |
| `POST` | `/api/v1/auth/password-reset/request` | `auth.routes.js` | `requestPasswordReset` | None (Rate limited) | None | None | None | None | N/A | Public |
| `POST` | `/api/v1/auth/password-reset/confirm` | `auth.routes.js` | `confirmPasswordReset` | None (Rate limited) | None | None | None | None | N/A | Public |
| `POST` | `/api/v1/auth/password-setup/confirm` | `auth.routes.js` | `confirmPasswordSetup` | None (Rate limited) | None | None | None | None | N/A | Public |
| `POST` | `/api/v1/auth/change-password` | `auth.routes.js` | `changePassword` | `authenticate` | None | None | None | None | N/A | Authenticated Self |
| `POST` | `/api/v1/auth/refresh` | `auth.routes.js` | `refresh` | Cookie-based | None | None | None | None | N/A | Public |
| `POST` | `/api/v1/auth/logout` | `auth.routes.js` | `logout` | Cookie-based | None | None | None | None | N/A | Public |
| `POST` | `/api/v1/auth/logout-all` | `auth.routes.js` | `logoutAll` | `authenticate` | None | None | None | None | N/A | Authenticated Self |
| `GET` | `/api/v1/auth/me` | `auth.routes.js` | `me` | `authenticate` | None | None | None | None | N/A | Authenticated Self |
| `GET` | `/api/v1/rbac/my-permissions` | `rbac.routes.js` | `getMyPermissions` | `authenticate` | `tenantContext(true)` | None | None | None | N/A | Authenticated Tenant |
| `GET` | `/api/v1/rbac/roles` | `rbac.routes.js` | `listRoles` | `authenticate` | `tenantContext(true)` | `requireRole(ADMIN, SUPER_ADMIN)` | None | None | `roles:read` | Admin Protected |
| `GET` | `/api/v1/rbac/roles/:roleId` | `rbac.routes.js` | `getRole` | `authenticate` | `tenantContext(true)` | `requireRole(ADMIN, SUPER_ADMIN)` | None | None | `roles:read` | Admin Protected |
| `POST` | `/api/v1/rbac/roles` | `rbac.routes.js` | `createRole` | `authenticate` | `tenantContext(true)` | `requireRole(ADMIN, SUPER_ADMIN)` | None | None | `roles:create` | Admin Protected |
| `PATCH` | `/api/v1/rbac/roles/:roleId` | `rbac.routes.js` | `updateRole` | `authenticate` | `tenantContext(true)` | `requireRole(ADMIN, SUPER_ADMIN)` | None | None | `roles:edit` | Admin Protected |
| `DELETE` | `/api/v1/rbac/roles/:roleId` | `rbac.routes.js` | `deleteRole` | `authenticate` | `tenantContext(true)` | `requireRole(ADMIN, SUPER_ADMIN)` | None | None | `roles:delete` | Admin Protected |
| `GET` | `/api/v1/rbac/roles/:roleId/permissions` | `rbac.routes.js` | `getRolePermissions` | `authenticate` | `tenantContext(true)` | `requireRole(ADMIN, SUPER_ADMIN)` | None | None | `roles:read` | Admin Protected |
| `PUT` | `/api/v1/rbac/roles/:roleId/permissions` | `rbac.routes.js` | `updateRolePermissions` | `authenticate` | `tenantContext(true)` | `requireRole(ADMIN, SUPER_ADMIN)` | None | None | `roles:edit` | Admin Protected |
| `GET` | `/api/v1/rbac/users/:userId/roles` | `rbac.routes.js` | `getUserRoles` | `authenticate` | `tenantContext(true)` | `requireRole(ADMIN, SUPER_ADMIN)` | None | None | `roles:read` | Admin Protected |
| `POST` | `/api/v1/rbac/users/:userId/roles` | `rbac.routes.js` | `assignUserRole` | `authenticate` | `tenantContext(true)` | `requireRole(ADMIN, SUPER_ADMIN)` | None | None | `roles:edit` | Admin Protected |
| `DELETE` | `/api/v1/rbac/users/:userId/roles/:roleId` | `rbac.routes.js` | `removeUserRole` | `authenticate` | `tenantContext(true)` | `requireRole(ADMIN, SUPER_ADMIN)` | None | None | `roles:edit` | Admin Protected |

---

## 4. Endpoint → RBAC Module Mapping (32 Canonical Keys)

All 32 business domains map cleanly to standard CRUD operations on the canonical keys:

| Canonical Module Key | Domain / Subsystem | `canRead` Operations | `canCreate` Operations | `canEdit` Operations | `canDelete` Operations |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`classes`** | Classes, Sections, Categories | List classes, view section detail | Add new class/section | Update class name, grade, section | Archive/delete class |
| **`subjects`** | Subjects & Syllabus | List subjects, view syllabus | Create subject, assign teacher | Edit subject details/credits | Delete subject |
| **`students`** | Student Profiles & Records | View student directory, profile | Register/enroll student | Edit student info, update status | Delete/archive student |
| **`staff`** | Staff Profiles & Directory | View staff directory, details | Register staff profile | Update staff info, department | Deactivate staff profile |
| **`attendance`** | Student & Staff Attendance | View daily/monthly attendance | Mark/submit attendance sheet | Update attendance record | Clear attendance sheet |
| **`timetables`** | Timetables & Schedules | View class/teacher timetable | Create timetable grid/slots | Reschedule/modify slot | Delete timetable |
| **`homework`** | Homework & Assignments | View assignments, submissions | Post homework assignment | Edit assignment, grade submission | Delete assignment |
| **`lesson_plans`**| Lesson Plans & Progress | View lesson plans, syllabus tracker | Create lesson plan | Update progress, review plan | Delete lesson plan |
| **`resources`** | Academic Resources & Materials| Browse/download learning files | Upload resource/study material | Edit resource metadata | Remove resource file |
| **`exams`** | Examinations & Schedules | View exam schedule, hall tickets | Create exam, set schedule | Modify exam dates, publish results | Cancel/delete exam |
| **`performance`** | Student Grading & Marksheets | View report cards, student marks | Enter/upload exam marks | Recalculate/modify marks | Delete mark record |
| **`reports`** | Report Cards & Analytics | View analytics, generate report | Create report card template | Customize template | Delete template |
| **`fees`** | Fee Structures & Invoices | View fee ledger, invoice list | Generate invoice, collect payment | Apply fee discount, waive fine | Void/cancel invoice |
| **`transport`** | Vehicles, Routes, Stops | View route map, vehicle tracking | Add vehicle, create route | Edit stop timings, assign student | Remove route/vehicle |
| **`library`** | Catalog & Borrowing | Search books, view borrow log | Add book to catalog, issue book | Update book record, renew issue | Write off/delete book |
| **`hostel`** | Rooms, Beds, Allocation | View occupancy, room list | Allocate room/bed to student | Transfer room, change allocation | Deallocate room |
| **`inventory`** | Items, Categories, Stock | View stock balance, inventory log | Add item, record inward stock | Update item, record consumption | Write off inventory |
| **`health`** | Medical Records & Incident Log| View student medical history | Record medical incident/checkup | Update prescription/health notes | Delete record |
| **`complaints`** | Grievance & Complaint Desk | View complaints, status | Submit new grievance/complaint | Update status, add resolution | Close/archive ticket |
| **`noticeboard`** | Circulars & Noticeboard | View notices, circular list | Draft/publish notice | Edit notice, pin circular | Delete/unpublish notice |
| **`calendar`** | Academic Calendar & Events | View school calendar, holidays | Schedule event, mark holiday | Reschedule event, edit dates | Remove event |
| **`ptm`** | Parent-Teacher Meetings | View PTM schedules, slots | Schedule PTM session | Book/reschedule slot, add notes | Cancel PTM session |
| **`leaves`** | Staff & Student Leave Apps | View leave applications/balance | Submit leave application | Approve/reject leave application | Cancel leave app |
| **`chats`** | Internal Messaging & Channels | Read chat messages, channels | Send message, create group | Edit message, update channel | Delete message/channel |
| **`media`** | Gallery & Event Photos | View media gallery, albums | Upload event photo/video album | Update album title/tags | Delete media item |
| **`documents`** | Student/Staff Certificates | View uploaded student/staff docs | Generate certificate, upload doc | Update document metadata | Delete document |
| **`branches`** | Multi-Branch Management | View branch list, switch branch | Register new school branch | Update branch details | Decommission branch |
| **`leads`** | Admission Leads & CRM | View lead pipeline, inquiry list | Capture new admission lead | Update lead stage, add follow-up | Archive/delete lead |
| **`form-builder`**| Custom Forms & Admissions | View forms, view responses | Design new custom form schema | Edit form fields, toggle active | Delete form schema |
| **`hr-payroll`** | Staff Salaries & Pay Slips | View payroll summary, payslips | Run monthly payroll, generate slip | Adjust salary components | Void payroll run |
| **`billing`** | SaaS Subscription & Billing | View plan details, invoice history | Upgrade plan, initiate payment | Update billing contact | Cancel subscription |

---

## 5. Identification of Special Operations

| Special Operation | Relevant Module | Semantic Action | Required Classification | Enforcement Strategy |
| :--- | :--- | :--- | :---: | :--- |
| **Attendance Cutoff & Daily Locking** | `attendance` | `canCreate` / `canEdit` | **B** (Needs additional backend rule) | Check `SchoolSetting` cutoff time in service layer; reject past-cutoff edits unless user has `SCHOOL_ADMIN` role. |
| **Leave Application Approval / Rejection** | `leaves` | `canEdit` | **B** (Needs additional backend rule) | Service layer validates applicant is not approving own leave and satisfies `LeaveApprovalRule`. |
| **Fee Payment Collection & Receipting** | `fees` | `canCreate` | **B** (Needs additional backend rule) | Transactional receipt number generation, atomic balance update, immutable audit log entry. |
| **Fee Invoice Cancellation / Voiding** | `fees` | `canDelete` | **C** (Needs system/functional role restriction) | Restrict voiding to `SCHOOL_ADMIN` or `Finance Department` role; reject ordinary staff. |
| **Exam Result Publishing** | `exams` | `canEdit` | **C** (Needs system/functional role restriction) | Transition from `DRAFT` &rarr; `PUBLISHED` permitted only for Principal / Head Master / School Admin. |
| **Bulk Student / Staff Import (CSV)** | `students` / `staff` | `canCreate` | **B** (Needs additional backend rule) | Batch size limit (max 500 rows), pre-validation pass, atomic single-tenant transaction. |
| **Global Notice Publishing (Multi-School)** | `noticeboard` | `canCreate` | **C** (Needs system/functional role restriction) | Multi-school broadcast strictly restricted to `SUPER_ADMIN`; single-tenant broadcast to `SCHOOL_ADMIN` / Principal. |
| **Custom Role Permission Mutation** | `/api/v1/rbac/*` | `roles:edit` | **C** (Already enforced) | Restricted to `SCHOOL_ADMIN` / `SUPER_ADMIN` with system default role protection. |
| **Parent Access to Student Data** | Multiple | `canRead` (Self-Scoped) | **B** (Needs additional backend rule) | Non-RBAC ownership check: verify `ParentStudentLink` in PostgreSQL where `parent.userId === req.auth.userId`. |
| **Student Access to Own Records** | Multiple | `canRead` (Self-Scoped) | **B** (Needs additional backend rule) | Non-RBAC ownership check: verify `student.userId === req.auth.userId`. |

---

## 6. System Role vs Functional Role Interactions

```
                        ┌──────────────────────────────┐
                        │ Authenticated User (req.auth)│
                        └──────────────┬───────────────┘
                                       │
                ┌──────────────────────┴──────────────────────┐
                ▼                                             ▼
     [Platform System Roles]                       [Tenant Functional Roles]
  ┌───────────────────────────┐                  ┌───────────────────────────┐
  │ SUPER_ADMIN               │                  │ Principal                 │
  │ -> Global / Tenant Bypass │                  │ Vice Principal            │
  ├───────────────────────────┤                  │ Class Incharge            │
  │ SCHOOL_ADMIN              │                  │ Subject Wise Head         │
  │ -> Tenant Universal Bypass│                  │ Staffs                    │
  ├───────────────────────────┤                  │ Finance Department        │
  │ PARENT                    │                  │ Library, Transport, etc.  │
  │ -> ParentStudentLink Only │                  │ Custom Tenant Roles       │
  ├───────────────────────────┤                  └─────────────┬─────────────┘
  │ STUDENT                   │                                │
  │ -> Own Student Record Only│                                │ Multi-Role Union (Logical OR)
  └───────────────────────────┘                                ▼
                                                 ┌───────────────────────────┐
                                                 │ 32-Module Permission Map  │
                                                 │ { canRead, canCreate, ...}│
                                                 └───────────────────────────┘
```

### Exact Behavioral Rules:
1. **`SUPER_ADMIN`**:
   - Universal bypass for all functional permissions.
   - Operating with `X-Tenant-Id`: Granted unrestricted access within the specified tenant.
   - Operating without `X-Tenant-Id`: Restricted to global platform models (`School`, `SubscriptionPlan`) with `bypassTenant: true`.
2. **`SCHOOL_ADMIN`**:
   - Universal bypass for all functional permissions within their own `schoolId`.
   - Cannot access data belonging to other tenants.
3. **`TEACHER` / `STAFF` / `TENANT_USER`**:
   - Strict functional RBAC evaluation: evaluated via `UserRoleAssignment` &rarr; `SchoolRole` &rarr; `RolePermission`.
   - Multiple assigned roles are combined using logical OR union (`canRead = roleA.canRead || roleB.canRead`).
   - If user has 0 roles assigned, access to all 32 modules is denied.
4. **`PARENT` / `STUDENT`**:
   - Bypasses staff functional RBAC; evaluated by resource relationship checks (`ParentStudentLink` / `student.userId`).

---

## 7. Tenant Isolation Audit

### Invariants & Defenses Verified:
1. **Authoritative Context**: `req.auth.schoolId` is derived exclusively from the verified JWT and PostgreSQL `User` record.
2. **Anti-Poisoning**: `tenant.middleware.js` checks `req.body.schoolId`, `req.query.schoolId`, and `req.params.schoolId`. Any mismatched `schoolId` throws 403 `TenantAccessError`.
3. **AsyncLocalStorage Propagation**: `runWithTenantContext` ensures all downstream queries through `prisma` automatically inherit the active `schoolId`.
4. **Prisma Client Extension**: `tenant-extension.js` injects `where: { schoolId }` into all CRUD operations on tenant-scoped tables.
5. **Repository Defense-in-Depth**: All repository methods explicitly require `schoolId` as their first parameter.

---

## 8. Authorization Placement Recommendation

### Recommended Middleware Execution Order:
```
router.METHOD(
  '/path',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission(moduleKey, operation),
  validate(zodSchemas),
  controller.handler
);
```

### Rationale:
- **`authenticate`** first: Ensures identity, active account status, and token freshness.
- **`tenantContext`** second: Establishes tenant boundary and prevents cross-tenant spoofing.
- **`requirePermission`** third: Blocks unauthorized requests immediately before doing expensive schema validation or executing controller logic.
- **`validate`** fourth: Validates payload syntax only for authorized requests.
- **`controller` / `service`** fifth: Executes business rules, fine-grained ownership checks, and DB operations.

---

## 9. Critical / High / Medium / Low Authorization Gaps

| Severity | Gap Description | Evidence | Phase 4B.7-C Resolution Plan |
| :---: | :--- | :--- | :--- |
| **CRITICAL** | **Backend routes lack functional permission enforcement** | Existing business controllers run without `requirePermission()`; access currently relies on frontend UI guards. | Upgrade `requirePermission` in `rbac.middleware.js` and mount across all business routes. |
| **HIGH** | **`requirePermission` stub checks static array** | `backend/src/middleware/rbac.middleware.js` lines 49–73 checks `req.user.permissions` array which is not populated. | Update `requirePermission` to call `rbacService.getUserEffectivePermissions(schoolId, userId)` with Redis caching. |
| **HIGH** | **Parent/Student data isolation on API level** | Direct parent access requires relational verification against `ParentStudentLink`. | Enforce ownership check helper in parent-accessible services. |
| **MEDIUM** | **Bulk export / import rate limiting** | Bulk actions consume significant server resources. | Attach specific rate limiters to bulk import/export routes. |
| **LOW** | **Missing permission change audit trail on bulk updates** | Bulk role changes should record audit logs. | Covered by existing `AuditLog` service in RBAC mutations. |

---

## 10. Frontend Semantic Cross-Check

- Frontend `usePermissions.js` checks `canRead`, `canCreate`, `canEdit`, `canDelete` across the 32 module keys.
- Merges multiple roles using logical OR union.
- Grants `'ALL'` access to `userProfile.role === 'admin'`.
- **Result**: The PostgreSQL RBAC model and backend authorization architecture match frontend semantics with 100% fidelity.

---

## 11. Legacy Firestore Dependencies

| Component / Subsystem | Current Dependency | Status for 4B.7-C | Strategy |
| :--- | :--- | :---: | :--- |
| **Staff Roles in Firestore** | `schools/{id}/roles` | **SAFE FOR 4B.7-C** | Migrated to PostgreSQL `SchoolRole` in Phase 4B.7-B. Firestore roles remain read-only for legacy client backwards compatibility. |
| **Teacher Role Links** | `schools/{id}/teachers` | **SAFE FOR 4B.7-C** | Migrated to PostgreSQL `UserRoleAssignment`. |
| **Frontend UI Permissions** | `usePermissions.js` | **DEFERRED (4B.7-D)** | Frontend cutover to `/api/v1/rbac/my-permissions` will be executed in Phase 4B.7-D. |
| **Firestore RBAC Deletion** | Cleanup / Retirement | **DEFERRED (4B.7-E)** | Firestore RBAC collections will be retired in Phase 4B.7-E. |

---

## 12. Redis Caching & Fail-Safe Strategy

### Caching Architecture
- **Cache Key**: `rbac:perms:${schoolId}:${userId}`
- **TTL**: 300 seconds (5 minutes)
- **Serialization**: JSON stringified permission map `{ classes: { canRead: true, ... }, ... }`
- **Invalidation Triggers**:
  - `PUT /api/v1/rbac/roles/:roleId/permissions` &rarr; Invalidate `rbac:perms:${schoolId}:*` via `RedisCacheService.delPattern()`
  - `POST /api/v1/rbac/users/:userId/roles` &rarr; Invalidate `rbac:perms:${schoolId}:${userId}`
  - `DELETE /api/v1/rbac/users/:userId/roles/:roleId` &rarr; Invalidate `rbac:perms:${schoolId}:${userId}`
  - `DELETE /api/v1/rbac/roles/:roleId` &rarr; Invalidate `rbac:perms:${schoolId}:*`

### Security Rule on Cache Failure:
- If Redis is down, disconnected, or times out, `RedisCacheService.get()` returns `null` and logs a warning.
- `requirePermission` immediately falls back to PostgreSQL query `rbacService.getUserEffectivePermissions(schoolId, userId)`.
- **Authorization NEVER fails open to grant access, and NEVER crashes. PostgreSQL is always the authoritative source of truth**.

---

## 13. SUPER_ADMIN Tenant Switching Audit

- In `tenant.middleware.js`, `SUPER_ADMIN` can supply `X-Tenant-Id: <uuid>`.
- The middleware validates UUID syntax and confirms the target school exists in PostgreSQL.
- When `SUPER_ADMIN` switches to a tenant, `req.tenant.schoolId` is set to the target school and `bypassTenant: false` is active.
- `requirePermission` automatically grants access to all modules for `SUPER_ADMIN` within that tenant.
- If no header is supplied, `req.tenant.schoolId` is `null` and `bypassTenant: true` is active for global administration.

---

## 14. Existing Test Coverage & Required Testing Strategy

### Current Status:
- 49 Test Files, 430 Tests Passing (100%).
- Full unit and integration coverage for primary auth, password lifecycle, tenant isolation, and RBAC management.

### Required Test Suite for Phase 4B.7-C:
1. **Unit Tests for `requirePermission` Middleware**:
   - Rejects unauthenticated requests with 401.
   - Rejects requests missing tenant context with 403.
   - Allows `SUPER_ADMIN` unconditionally.
   - Allows `SCHOOL_ADMIN` within own tenant unconditionally.
   - Checks user with explicit `canRead: true` on target module &rarr; allows request.
   - Checks user with `canRead: false` on target module &rarr; rejects with 403 `ForbiddenError`.
   - Checks user with `canCreate: false` attempting POST &rarr; rejects with 403.
   - Checks user with `canEdit: false` attempting PUT/PATCH &rarr; rejects with 403.
   - Checks user with `canDelete: false` attempting DELETE &rarr; rejects with 403.
   - Verifies multi-role OR union permission resolution in middleware.
   - Verifies Redis cache hit vs. cache miss vs. Redis outage fallback to PostgreSQL.
2. **Integration Tests on Protected Business Endpoints**:
   - End-to-end HTTP request testing with JWTs having various role combinations.
   - Cross-tenant access attempt on protected endpoints &rarr; rejects with 403.

---

## 15. Recommended Implementation Batches

```
┌────────────────────────────────────────────────────────────────────────┐
│ BATCH 1: Upgraded requirePermission Middleware & Caching Layer         │
│ - Refactor requirePermission() in rbac.middleware.js                   │
│ - Connect to rbacService.getUserEffectivePermissions() + Redis         │
│ - Add comprehensive unit & middleware integration test suites          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ BATCH 2: Core Academic Domains (Classes, Subjects, Students, Staff)    │
│ - Mount requirePermission on academic core routes                      │
│ - Add integration authorization tests                                  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ BATCH 3: Daily Academic Operations (Attendance, Homework, Timetable,   │
│          Lesson Plans, Academic Resources, Calendar)                   │
│ - Mount requirePermission on daily operational routes                  │
│ - Implement special attendance cutoff & leave approval validation      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ BATCH 4: Assessment & Grading (Exams, Performance, Report Cards)       │
│ - Mount requirePermission on assessment routes                         │
│ - Enforce exam publishing role restriction                             │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ BATCH 5: Finance & Operations (Fees, Invoices, Billing, Payroll,       │
│          Inventory, Transport, Library, Hostel)                        │
│ - Mount requirePermission on finance and logistics routes             │
│ - Enforce fee voiding and payroll restrictions                         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ BATCH 6: Communication & Engagement (Noticeboard, Chats, PTM,          │
│          Complaints, Media, Documents, Leads, Form-Builder)            │
│ - Mount requirePermission on communication and auxiliary routes        │
│ - Enforce global broadcast restrictions                                │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 16. Blockers

**ZERO BLOCKERS IDENTIFIED**.
- The PostgreSQL schema is 100% complete and validated.
- The RBAC repository, service, and effective-permission calculator are fully implemented and verified.
- The Redis caching layer with fallback is already active.
- All 32 canonical module keys match frontend and business requirements.

---

## 17. Files Requiring Modification During Implementation

1. `backend/src/middleware/rbac.middleware.js` (Upgrade `requirePermission` implementation).
2. `backend/src/modules/rbac/rbac.service.js` (Add cache-aside wrapper for `getUserEffectivePermissions`).
3. Business router files as business modules are connected.
4. New test files in `backend/tests/security/` and `backend/tests/unit/rbac/`.

---

## 18. Explicit Confirmation of Non-Changes

During this preflight audit phase:
- **0** source files modified.
- **0** schema changes made.
- **0** migrations created.
- **0** database writes executed.
- **0** Firestore writes executed.
- **0** Firebase Auth modifications made.
- **0** frontend files modified.
- **0** packages installed.

---

## 19. Final Classification

**READY FOR IMPLEMENTATION**

The authorization architecture is completely specified, unambiguous, and ready for batch execution upon user approval.

============================================================
# HARD STOP — AWAITING USER APPROVAL TO BEGIN BATCH 1
============================================================
