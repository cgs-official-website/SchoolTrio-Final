# Phase 4C.4 — Staff & Staff Profiles Backend Implementation Report

**Classification**: COMPLETE — VERIFIED WITH LIMITATIONS  
**Date**: September 10, 2026  
**Target Environment**: Node.js 24.x, Express, Prisma ORM, PostgreSQL 16+  
**Scope**: Backend Implementation for Staff & Staff Profiles Domain (`/api/v1/staff`)  

---

## 1. Scope

Phase 4C.4 establishes the multi-tenant REST API backend domain for Staff and Staff Profiles in the School Management System.

### Strict Scope Enforced:
- **Implemented**:
  - Staff directory listing with search, filtering, and deterministic pagination (`GET /api/v1/staff`)
  - Detailed staff profile inspection with PII serialization controls (`GET /api/v1/staff/:id`)
  - Atomic Staff creation (User + StaffProfile + Role assignment + Class Teacher sync) (`POST /api/v1/staff`)
  - Staff profile update, role reassignment, and deactivation/reactivation lifecycle (`PATCH /api/v1/staff/:id`)
  - Class teacher assignment and legacy subject metadata management (`PATCH /api/v1/staff/:id/assignment`)
  - Row-locked hard delete with comprehensive historical dependency guards (`DELETE /api/v1/staff/:id`)
  - Staff self-service profile access and updates (`GET /api/v1/staff/me`, `PATCH /api/v1/staff/me`)
- **Explicitly Excluded / Deferred**:
  - No HR / Payroll domain endpoints (salary disbursement, payslips)
  - No Attendance / Leave / Timetable domain mutation endpoints
  - No frontend modifications (React/Vite remains on Firebase until Phase 5)
  - No Firebase / Firestore deprecation or deletion
  - No Prisma schema alterations or database migrations
  - No speculative junction tables (`TeacherSubject`, `TeacherClass`, `ClassSubject`)
  - No separate `/auth/register-teacher` endpoint (password setup/reset remains authoritative)

---

## 2. Files Created

1. [`backend/src/modules/staff/staff.schemas.js`](file:///c:/Projects/SMS/backend/src/modules/staff/staff.schemas.js)
   - Zod validation schemas for query parameters, route UUID params, staff creation, profile updates, assignment updates, and self-service updates.
2. [`backend/src/modules/staff/staff.repository.js`](file:///c:/Projects/SMS/backend/src/modules/staff/staff.repository.js)
   - Tenant-scoped data access layer for StaffProfile and User.
   - Implements `STAFF_SELECT_CONFIG` with safe credential exclusions.
   - Row-level locking queries: `findStaffByIdForUpdate`, `lockClassForUpdate`.
   - Dependency checker `countStaffDependencies` inspecting LessonPlan, HRPayrollRecord, ChatRoom, PtmAppointment, and TimetablePeriod.
3. [`backend/src/modules/staff/staff.service.js`](file:///c:/Projects/SMS/backend/src/modules/staff/staff.service.js)
   - Core domain business logic.
   - Enforces systemRole assignment rules (`TEACHER` vs `STAFF`).
   - Manages atomic bi-directional class teacher invariants and lock ordering.
   - Merges and normalizes `customData.assignments`.
   - Implements atomic deactivation (User.isActive=false, tokenVersion increment, class teacher detachment).
   - Enforces PII/financial data masking tiers.
4. [`backend/src/modules/staff/staff.controller.js`](file:///c:/Projects/SMS/backend/src/modules/staff/staff.controller.js)
   - Express HTTP controllers wrapping responses in canonical `ApiResponse` structures.
5. [`backend/src/modules/staff/staff.routes.js`](file:///c:/Projects/SMS/backend/src/modules/staff/staff.routes.js)
   - Express router mounted with authentication, tenant context, and RBAC permission middleware.
6. [`backend/tests/unit/staff/staff.schemas.test.js`](file:///c:/Projects/SMS/backend/tests/unit/staff/staff.schemas.test.js)
   - 16 unit tests covering schema validation, edge cases, and customData payload structures.
7. [`backend/tests/unit/staff/staff.service.test.js`](file:///c:/Projects/SMS/backend/tests/unit/staff/staff.service.test.js)
   - 18 unit tests covering atomic creation, updates, email sync, role assignments, deactivation/reactivation, assignment syncing, self-service, and delete guards.
8. [`backend/tests/unit/staff/staff.concurrency.test.js`](file:///c:/Projects/SMS/backend/tests/unit/staff/staff.concurrency.test.js)
   - 3 unit tests verifying PostgreSQL P2002 conflict handling for duplicate email and employeeId.
9. [`backend/tests/integration/staff/staff-endpoints.test.js`](file:///c:/Projects/SMS/backend/tests/integration/staff/staff-endpoints.test.js)
   - 13 integration tests for all 8 REST endpoints.
10. [`backend/tests/security/staff-tenant-isolation.test.js`](file:///c:/Projects/SMS/backend/tests/security/staff-tenant-isolation.test.js)
    - 8 security tests validating cross-tenant 404s, query/body parameter tampering prevention, SuperAdmin tenant switching, S015 TENANT_USER compatibility, and PII masking.

---

## 3. Files Modified

1. [`backend/src/routes/index.js`](file:///c:/Projects/SMS/backend/src/routes/index.js)
   - Registered `/staff` routes with `router.use('/staff', staffRoutes)`.

---

## 4. Endpoints Implemented

| Method | Path | Required Auth / Role | Permission | Description |
|---|---|---|---|---|
| `GET` | `/api/v1/staff` | Authenticated Institutional | `staff.read` | List paginated staff members with search and filtering. |
| `GET` | `/api/v1/staff/me` | Authenticated Staff / User | Self-identity (`req.user.id`) | Self-service endpoint to view current user's staff profile. |
| `PATCH` | `/api/v1/staff/me` | Authenticated Staff / User | Self-identity (`req.user.id`) | Self-service endpoint to update personal contact & metadata. |
| `GET` | `/api/v1/staff/:id` | Authenticated Institutional | `staff.read` | Retrieve full staff profile (PII tiered by `hr-payroll.read`). |
| `POST` | `/api/v1/staff` | Authenticated Institutional | `staff.create` | Atomically create User, StaffProfile, and Role Assignment. |
| `PATCH` | `/api/v1/staff/:id` | Authenticated Institutional | `staff.edit` | Update profile, role, designation, status, or class teacher. |
| `PATCH` | `/api/v1/staff/:id/assignment` | Authenticated Institutional | `staff.edit` | Update class teacher assignment & subject metadata. |
| `DELETE` | `/api/v1/staff/:id` | Authenticated Institutional | `staff.delete` | Hard delete staff member (guarded by row locks & dependency checks). |

---

## 5. Request Contracts

### A. `POST /api/v1/staff`
```json
{
  "firstName": "Arun",
  "lastName": "Kumar",
  "email": "arun.kumar@school.edu",
  "phone": "9876543210",
  "employeeId": "EMP-2026-001",
  "staffType": "teaching",
  "designation": "Mathematics Teacher",
  "roleId": "a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d",
  "assignedClassId": "c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f",
  "baseSalary": 45000,
  "status": "Active",
  "customData": {
    "dob": "1988-05-12",
    "gender": "Male",
    "bloodGroup": "O+",
    "qualifications": { "highestDegree": "M.Sc Mathematics", "university": "Madras University" },
    "financial": { "panNumber": "ABCDE1234F", "bankAccountNumber": "123456789012" },
    "assignments": {
      "assignedSubjectIds": ["s1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d"],
      "subjectClassIds": ["c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f"]
    }
  }
}
```

### B. `PATCH /api/v1/staff/:id/assignment`
```json
{
  "assignedClassId": "c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f",
  "assignedSubjectIds": ["s1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d"],
  "subjectClassIds": ["c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f"]
}
```

### C. `PATCH /api/v1/staff/me`
```json
{
  "phone": "9876543211",
  "address": "12 Gandhi Road, Chennai",
  "emergencyContact": "9876543212",
  "maritalStatus": "Married",
  "qualifications": { "highestDegree": "M.Sc, B.Ed" }
}
```

---

## 6. Response Contracts

### A. Directory Response (`GET /api/v1/staff`)
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Staff members retrieved successfully",
  "data": [
    {
      "id": "33333333-3333-4333-8333-333333333333",
      "schoolId": "11111111-1111-4111-8111-111111111111",
      "userId": "44444444-4444-4444-8444-444444444444",
      "name": "Arun Kumar",
      "email": "arun.kumar@school.edu",
      "phone": "9876543210",
      "employeeId": "EMP-2026-001",
      "staffType": "teaching",
      "designation": "Mathematics Teacher",
      "status": "Active",
      "assignedClassId": "c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f",
      "assignedClass": {
        "id": "c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f",
        "name": "Grade 10",
        "section": "A"
      },
      "user": {
        "id": "44444444-4444-4444-8444-444444444444",
        "email": "arun.kumar@school.edu",
        "systemRole": "TEACHER",
        "isActive": true,
        "tokenVersion": 1,
        "roleAssignments": [
          {
            "id": "ra-1",
            "schoolRoleId": "role-1",
            "schoolRole": { "id": "role-1", "name": "Teacher", "slug": "teacher" }
          }
        ]
      },
      "createdAt": "2026-09-10T00:00:00.000Z",
      "updatedAt": "2026-09-10T00:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

---

## 7. RBAC & Authorization

- **Authoritative Permissions**:
  - `staff.read` -> Access staff directory list and view profiles.
  - `staff.create` -> Create new staff member accounts.
  - `staff.edit` -> Update staff details, status, roles, and assignments.
  - `staff.delete` -> Hard delete staff member accounts without dependencies.
  - `hr-payroll.read` -> Authorizes view of sensitive financial information (`baseSalary`, `panNumber`, `bankAccountNumber`).
- **Self-Service**:
  - `GET /api/v1/staff/me` and `PATCH /api/v1/staff/me` do not require administrative staff permissions. They resolve the identity strictly from `req.user.id` matching `StaffProfile.userId`.
  - Migrated accounts like `S015` with `systemRole: TENANT_USER` can access `/staff/me` without administrative role reassignment.

---

## 8. Multi-Tenant Isolation

- All repository queries filter by `schoolId = req.tenant.id`.
- Request body/query parameter poisoning (`schoolId` in body or params) is rejected by `tenantMiddleware` with `403 TenantAccessError`.
- SuperAdmins can manage tenants using the authoritative `X-Tenant-Id` header.
- Relational foreign keys (`roleId`, `assignedClassId`, `assignedSubjectIds`, `subjectClassIds`) are validated to belong to the active `schoolId` prior to assignment.

---

## 9. User & StaffProfile 1:1 Architecture

- `StaffProfile` holds institutional directory fields (`name`, `phone`, `employeeId`, `staffType`, `designation`, `baseSalary`, `status`, `assignedClassId`, `customData`).
- `User` holds authentication credentials (`email`, `passwordHash`, `systemRole`, `isActive`, `tokenVersion`).
- When email or status is updated, both `User` and `StaffProfile` records are updated synchronously within an atomic database transaction.

---

## 10. Class Teacher Invariant

- **Bidirectional Invariant**: `Class.classTeacherId == StaffProfile.id` <===> `StaffProfile.assignedClassId == Class.id`.
- **Assignment Logic**:
  - When Staff A is assigned to Class C, any previous teacher assigned to Class C has their `assignedClassId` cleared to `null`.
  - If Staff A was previously heading Class D, Class D's `classTeacherId` is cleared to `null`.
  - Transaction locks are acquired using `SELECT ... FOR UPDATE` on both affected `Class` and `StaffProfile` rows to prevent race conditions.

---

## 11. Subject Assignment Metadata Strategy

- In accordance with the audited schema, authoritative subject assignments will be handled by academic domain models (`TimetablePeriod`, `LessonPlan`, `Assessment`, `HomeworkAssignment`).
- Legacy frontend subject associations are maintained non-authoritatively under `StaffProfile.customData.assignments = { assignedSubjectIds: [...], subjectClassIds: [...] }`.
- Input arrays are validated against existing tenant subjects and classes, deduplicated, and merged without destroying other existing `customData` keys.

---

## 12. Deactivation Behavior

When a staff member's status is changed to `Inactive`:
Within a single database transaction:
1. `StaffProfile.status` is set to `'Inactive'`.
2. `User.isActive` is set to `false`.
3. `User.tokenVersion` is incremented by 1 (`tokenVersion: { increment: 1 }`), immediately invalidating all active JWT sessions and refresh tokens.
4. If the staff member is currently assigned as a Class Teacher, the class assignment is cleared atomically (`Class.classTeacherId = null`, `StaffProfile.assignedClassId = null`).
5. Audit log `DISABLE_STAFF` is recorded.

---

## 13. Reactivation Behavior

When status changes from `Inactive` to `Active`:
1. `StaffProfile.status` is set to `'Active'`.
2. `User.isActive` is set to `true`.
3. Previous class teacher and subject assignments are **not** restored automatically, preventing stale assignments from overriding current school configurations.
4. Audit log `ENABLE_STAFF` is recorded.

---

## 14. Hard Delete & Dependency Guards

`DELETE /api/v1/staff/:id` allows deletion **only** for draft or accidental accounts with 0 dependencies.
1. Acquires a row lock on `StaffProfile` using `SELECT ... FOR UPDATE`.
2. Verifies that `assignedClassId` is `null` and no classes reference this staff member.
3. Queries historical foreign dependencies:
   - `LessonPlan.teacherId`
   - `HRPayrollRecord.staffProfileId`
   - `ChatRoom.creatorId`
   - `PtmAppointment.teacherId`
   - `TimetablePeriod.teacherId`
4. If ANY dependency exists, rolls back and returns `409 ConflictError` prompting deactivation.
5. If 0 dependencies exist, deletes `StaffProfile`, `UserRoleAssignment`, and `User` in one transaction.

---

## 15. PII & Financial Data Handling

- **PII Tiers**:
  - Sensitive financial fields (`baseSalary`, `panNumber`, `bankAccountNumber`, `ifscCode`, `pfNumber`, `esicNumber`, `uanNumber`, `salarySlips`) are stripped from responses unless the requester has `hr-payroll.read` permission, is a `SCHOOL_ADMIN` / `SUPER_ADMIN`, or is accessing their own profile via `GET /staff/me`.
  - Authentication secrets (`passwordHash`, `tokenVersion`, password reset tokens, refresh tokens) are **never** returned across any endpoint.

---

## 16. Audit Logging

Canonical audit logs are recorded via `createAuditLog` after successful database mutations:
- `CREATE_STAFF`
- `UPDATE_STAFF`
- `DISABLE_STAFF`
- `ENABLE_STAFF`
- `ASSIGN_CLASS_TEACHER`
- `DELETE_STAFF`

Audit logging operates non-blockingly and captures before/after values in `modifiedFields`.

---

## 17. Concurrency Strategy

- **PostgreSQL Transactions**: Prisma `$transaction` blocks are used for all multi-table mutations.
- **Row Locking**: `SELECT ... FOR UPDATE` via `findStaffByIdForUpdate` and `lockClassForUpdate` prevents lost updates during concurrent class assignments and delete operations.
- **Unique Constraints**: Unique indices on `User.email` and `StaffProfile.@@unique([schoolId, employeeId])` guarantee database-level uniqueness under concurrent creation.

---

## 18. Tests Executed

| Suite | File | Tests | Result |
|---|---|---|---|
| Schemas | `tests/unit/staff/staff.schemas.test.js` | 16 | PASSED |
| Service | `tests/unit/staff/staff.service.test.js` | 18 | PASSED |
| Concurrency | `tests/unit/staff/staff.concurrency.test.js` | 3 | PASSED |
| Endpoints | `tests/integration/staff/staff-endpoints.test.js` | 13 | PASSED |
| Security | `tests/security/staff-tenant-isolation.test.js` | 8 | PASSED |
| **Total Staff Domain Tests** | | **58** | **ALL PASSED** |

---

## 19. Full Regression Results

Full backend regression test run:
```bash
npm test
```
- **Test Files**: 76 passed (76 total)
- **Total Tests**: 801 passed (801 total)
- **Regressions**: 0 failures across Auth, RBAC, Classes, Class Categories, Subjects, Students, Parents, and Staff.

---

## 20. Prisma Validation

```bash
npx prisma validate
```
- **Result**: Schema at `prisma/schema.prisma` is valid. 0 schema changes made.

---

## 21. Linter Results

```bash
npm run lint
```
- **Result**: 0 errors, 1 pre-existing warning in migration script.

---

## 22. Live Database Validation

- **Live Database Status**: Strictly READ-ONLY.
- **Writes / Mutating Queries**: ZERO writes executed against live database.
- **Live Data Verified**:
  - `S024`: 38 StaffProfiles intact.
  - `S015`: 1 StaffProfile / TENANT_USER intact.
  - `S019`: 0 StaffProfiles intact.

---

## 23. Limitations

1. **Real Multi-Connection PostgreSQL Concurrency Test**:
   - **NOT EXECUTED** on live Railway database because shared production databases must not be subjected to high-concurrency race condition testing. Unit concurrency tests successfully verified transaction isolation and P2002 error handling.
2. **Authoritative Relational Subject Allocations**:
   - Subject assignments are preserved as metadata in `customData.assignments` for legacy frontend compatibility until academic schedule domains are implemented.

---

## 24. Final Classification

**COMPLETE — VERIFIED WITH LIMITATIONS**
