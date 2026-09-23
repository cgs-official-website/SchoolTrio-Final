# Phase 4C.5 — Attendance & Daily Operations Backend Implementation Report

**Status:** COMPLETE — VERIFIED WITH LIMITATIONS  
**Scope:** Pure Backend REST API (`/api/v1/attendance`) — Node.js / Express / Prisma / PostgreSQL  
**Frontend Modifications:** NONE (Phase 5 strict boundary preserved)  
**Firebase/Firestore Removals:** NONE (Legacy bridge maintained)  
**Prisma Schema Modifications:** NONE (Zero schema changes / Zero migrations)  
**Live Production Database Writes:** ZERO (All queries read-only / isolated unit & mock testing)  
**Multi-Connection PostgreSQL Concurrency Test Status:** NOT EXECUTED (No isolated disposable PostgreSQL test database provisioned; destructive tests against shared Railway production were strictly avoided)

---

## 1. Scope and Architecture Overview

Phase 4C.5 establishes the complete backend domain for Attendance & Daily Operations. It implements session tracking, single-day and cumulative attendance records, deterministic row-locked stat aggregations, absentee alert lifecycle, and daily administrative dashboard metrics without modifying the frontend or touching existing Prisma schemas.

### Architecture Topology
```
HTTP Request
    │
    ▼
authenticate middleware (Extracts & verifies access JWT)
    │
    ▼
tenantContext({ requireTenant: true }) (Extracts schoolId from claims / SuperAdmin header)
    │
    ▼
requirePermission('attendance', 'action') (Authoritative PostgreSQL RBAC)
    │
    ▼
validate(schema) (Zod body, query, and params schema validation)
    │
    ▼
attendance.controller.js (Handles HTTP envelope & ApiResponse mapping)
    │
    ▼
attendance.service.js (Transaction boundaries, concurrency control, statistics recomputations, parent validation)
    │
    ▼
attendance.repository.js (Tenant-scoped SQL / Prisma queries + row-level locks)
    │
    ▼
PostgreSQL Database (attendance_sessions, attendance_records, attendance_stats, absentee_flags)
```

---

## 2. Files Created and Modified

### Source Code (`backend/src/modules/attendance/`)
- [`attendance.schemas.js`](file:///c:/Projects/SMS/backend/src/modules/attendance/attendance.schemas.js): Zod schemas for query parameters, params, create/upsert session payloads, update payloads, dashboard stats query, student attendance query, and absentee flag resolution.
- [`attendance.repository.js`](file:///c:/Projects/SMS/backend/src/modules/attendance/attendance.repository.js): Multi-tenant database repository containing session queries, row locks (`lockSessionForUpdate`, `lockSessionByNaturalKeyForUpdate`, `lockAttendanceStatForUpdate`), record upserts, student aggregations, stats recomputations, and absentee flag queries.
- [`attendance.service.js`](file:///c:/Projects/SMS/backend/src/modules/attendance/attendance.service.js): Core business service managing atomic session creation, P2002 race fallback, deterministic stat locking (`studentIds.sort()`), academic year derivation, parent child-link verification, and audit event dispatches.
- [`attendance.controller.js`](file:///c:/Projects/SMS/backend/src/modules/attendance/attendance.controller.js): Express controller handlers formatting standardized `ApiResponse` payloads.
- [`attendance.routes.js`](file:///c:/Projects/SMS/backend/src/modules/attendance/attendance.routes.js): Express router mounting all 9 attendance endpoints with auth, tenant context, RBAC, and Zod validation middlewares.

### Modified Router Index
- [`backend/src/routes/index.js`](file:///c:/Projects/SMS/backend/src/routes/index.js): Mounted `attendanceRoutes` under `/api/v1/attendance`.

### Test Suites
- [`backend/tests/unit/attendance/attendance.schemas.test.js`](file:///c:/Projects/SMS/backend/tests/unit/attendance/attendance.schemas.test.js) (21 tests)
- [`backend/tests/unit/attendance/attendance.service.test.js`](file:///c:/Projects/SMS/backend/tests/unit/attendance/attendance.service.test.js) (12 tests)
- [`backend/tests/unit/attendance/attendance.concurrency.test.js`](file:///c:/Projects/SMS/backend/tests/unit/attendance/attendance.concurrency.test.js) (3 tests)
- [`backend/tests/integration/attendance/attendance-endpoints.test.js`](file:///c:/Projects/SMS/backend/tests/integration/attendance/attendance-endpoints.test.js) (12 tests)
- [`backend/tests/security/attendance-tenant-isolation.test.js`](file:///c:/Projects/SMS/backend/tests/security/attendance-tenant-isolation.test.js) (7 tests)

---

## 3. Endpoints Implemented

| Method | Path | Permission | Description |
|---|---|---|---|
| `GET` | `/api/v1/attendance/dashboard-stats` | `attendance.read` | Real-time daily school dashboard metrics (classes marked, pending, counts, percentages). |
| `GET` | `/api/v1/attendance/absentee-flags` | `attendance.read` | Paginated list of monthly absentee flags with filter support. |
| `PATCH` | `/api/v1/attendance/absentee-flags/:id/resolve` | `attendance.edit` | Resolves an absentee flag with notes and audit log. |
| `GET` | `/api/v1/attendance/students/:studentId` | `attendance.read` or Linked Parent | Student attendance timeline (all/weekly/monthly/term) and cumulative stat totals. |
| `GET` | `/api/v1/attendance/sessions` | `attendance.read` | Paginated list of attendance sessions filtered by class, date range, or session. |
| `GET` | `/api/v1/attendance/sessions/:id` | `attendance.read` | Single attendance session with detailed student records. |
| `POST` | `/api/v1/attendance/sessions` | `attendance.create` | Submits or upserts an attendance session, recomputing student stats and absentee flags. |
| `PATCH` | `/api/v1/attendance/sessions/:id` | `attendance.edit` | Row-locked update to existing attendance session records with stat recalculations. |
| `DELETE` | `/api/v1/attendance/sessions/:id` | `attendance.delete` | Administrative deletion of attendance session with cascade record removal and stat recomputation. |

---

## 4. Request & Response Contracts

### 1. `POST /api/v1/attendance/sessions`
**Request Body:**
```json
{
  "classId": "11111111-1111-4111-8111-111111111111",
  "sectionId": "22222222-2222-4222-8222-222222222222",
  "date": "2026-09-05",
  "session": "STANDARD",
  "academicYear": "2026-27",
  "records": [
    { "studentId": "33333333-3333-4333-8333-333333333333", "status": "Present", "remark": "On time" },
    { "studentId": "44444444-4444-4444-8444-444444444444", "status": "Absent", "remark": "Sick" },
    { "studentId": "55555555-5555-4555-8555-555555555555", "status": "Late", "remark": "15 min delay" }
  ]
}
```
**Response (201 Created):**
```json
{
  "success": true,
  "message": "Attendance session recorded successfully",
  "data": {
    "id": "66666666-6666-4666-8666-666666666666",
    "schoolId": "11111111-1111-4111-8111-111111111111",
    "classId": "11111111-1111-4111-8111-111111111111",
    "sectionId": "22222222-2222-4222-8222-222222222222",
    "date": "2026-09-05",
    "session": "STANDARD",
    "markedByUserId": "77777777-7777-4777-8777-777777777777",
    "submittedAt": "2026-09-05T09:00:00.000Z",
    "records": [...]
  }
}
```

### 2. `GET /api/v1/attendance/dashboard-stats?date=2026-09-05`
**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "date": "2026-09-05",
    "classesTotal": 12,
    "classesMarked": 10,
    "classesPending": 2,
    "schoolWide": {
      "total": 350,
      "present": 320,
      "absent": 20,
      "late": 10,
      "percentage": 94.3
    },
    "byGrade": { ... },
    "byClass": { ... }
  }
}
```

---

## 5. Authorization & RBAC

1. **SuperAdmin / SchoolAdmin**: Full institutional access across all attendance endpoints in the active tenant.
2. **Class Teacher**:
   - Authorized to mark (`attendance.create`) and edit (`attendance.edit`) attendance **strictly for their assigned class** (`Class.classTeacherId === req.user.staffProfile.id` or `StaffProfile.assignedClassId === classId`).
   - Unassigned teachers attempting to mark an arbitrary class receive `403 Forbidden`.
   - Teachers are strictly barred from deleting attendance sessions (`403 Forbidden`).
3. **Parents**:
   - Access to `GET /api/v1/attendance/students/:studentId` is allowed only when `ParentProfile` (via `req.user.id`) is linked to the requested `studentId` via an authoritative `ParentStudentLink`.
   - Access to unlinked students or foreign tenant students returns `403 Forbidden` / `404 Not Found`.
4. **Students**:
   - No direct student authentication accounts exist in the backend; student self-service is rejected.

---

## 6. Multi-Tenant Isolation & Poisoning Defense

- All queries derive tenant isolation exclusively from `req.tenant.schoolId` (extracted from the authenticated JWT claims or the validated SuperAdmin `X-Tenant-Id` header).
- Any attempt to inject a foreign `schoolId` via payload bodies or query parameters is actively detected and rejected with `403 Forbidden` by tenant middleware.
- Validated foreign tenant IDs (`classId`, `sectionId`, `studentId`) fail tenant ownership checks and return `404 Not Found` or `400 Validation Error`, preventing cross-tenant existence disclosure.

---

## 7. Transaction, Concurrency & Locking Strategy

### Natural Key Uniqueness & P2002 Race Handling
The session uniqueness invariant is `[schoolId, classId, date, session]`.
When two teachers submit attendance for the same class and date concurrently:
1. Transaction attempts `findSessionByNaturalKey`.
2. If none exists, it executes `createSession`.
3. If concurrent creation triggers Prisma `P2002`, the transaction catches the error, re-acquires a `FOR UPDATE` lock on the existing session row via raw SQL:
   ```sql
   SELECT id, school_id, class_id, section_id, date, session, marked_by_user_id
   FROM attendance_sessions
   WHERE school_id = $1::uuid AND class_id = $2::uuid AND date = $3 AND session = $4
   FOR UPDATE
   ```
4. It updates the existing session records safely without failing the request.

### Deterministic Row-Locking for AttendanceStat
When recalculating statistics across affected students:
1. Affected student IDs are deduplicated and sorted deterministically (`studentIds.sort()`).
2. Row locks on `attendance_stats` are acquired in ascending lexicographical UUID order:
   ```sql
   SELECT id, school_id, student_id, academic_year, total_days, present_days, absent_days, late_days, percentage
   FROM attendance_stats
   WHERE school_id = $1::uuid AND student_id = $2::uuid AND academic_year = $3
   FOR UPDATE
   ```
3. Source `AttendanceRecord` rows are aggregated, and `AttendanceStat` is upserted.
4. Deterministic lock acquisition prevents database deadlocks when multiple workers record attendance simultaneously.

---

## 8. Statistics Invariant & Academic Year Resolution

### Attendance Statistics Formula
`AttendanceStat` is derived directly from authoritative `AttendanceRecord` rows:
$$\text{totalDays} = \text{presentDays} + \text{absentDays} + \text{lateDays}$$
$$\text{percentage} = \begin{cases} 100 & \text{if } \text{totalDays} = 0 \\ \operatorname{round}\left(\frac{\text{presentDays} + \text{lateDays}}{\text{totalDays}} \times 100, 1\right) & \text{otherwise} \end{cases}$$

Allowed statuses are strictly `Present`, `Absent`, and `Late`. Speculative statuses (`Excused`, `Half Day`) are omitted.

### Academic Year Resolution Strategy
1. **Explicit Year**: Used if supplied and valid (e.g., `"2026-27"`).
2. **School Settings**: Queried from `SchoolSetting` (category `'academicConfig'`).
3. **Deterministic Fallback**: April 1 – March 31 boundary (e.g., `2026-09-10` $\to$ `"2026-27"`, `2027-02-15` $\to$ `"2026-27"`).

---

## 9. Absentee Flag Lifecycle

- **Threshold Source**: `SchoolSetting` (category `'attendanceSettings'`, field `'absenteeThreshold'`), defaulting to `2`.
- **Evaluation Window**: Calendar month (`YYYY-MM`).
- **Trigger**: Count of `status === 'Absent'` in the month $\ge \text{threshold}$.
- **Resolution / Drop**:
  - If absence count $\ge \text{threshold}$, `AbsenteeFlag` is created or updated (`isResolved: false`).
  - If attendance is corrected on PATCH/DELETE and absence count drops below threshold, the `AbsenteeFlag` is automatically deleted.
  - Resolved flags can be updated via `PATCH /api/v1/attendance/absentee-flags/:id/resolve` with optional `resolutionNotes`.

---

## 10. Audit Logging

Canonical audit records (`createAuditLog`) are dispatched asynchronously **after successful transaction commit**:
- `RECORD_ATTENDANCE: <ClassName> (<Date> - <Session>)`
- `UPDATE_ATTENDANCE: <ClassName> (<Date> - <Session>)`
- `DELETE_ATTENDANCE_SESSION: <SessionId>`
- `RESOLVE_ABSENTEE_FLAG: <StudentName> (<MonthStr>)`

Audit log failures are trapped safely so they never roll back a successful database transaction.

---

## 11. Test Results & Verification

### Targeted Attendance Test Suite
- `tests/unit/attendance/attendance.schemas.test.js`: 21 passed
- `tests/unit/attendance/attendance.concurrency.test.js`: 3 passed
- `tests/unit/attendance/attendance.service.test.js`: 12 passed
- `tests/integration/attendance/attendance-endpoints.test.js`: 12 passed
- `tests/security/attendance-tenant-isolation.test.js`: 7 passed
- **Total Attendance Tests:** 55 passed / 0 failed.

### Full Backend Regression Suite
- **Test Files:** 81 passed / 81 passed (100%)
- **Total Tests:** 856 passed / 856 passed (100%)
- **Execution Time:** ~22s

### Code Quality & Static Analysis
- `npm run lint`: 0 errors / 0 attendance warnings.
- `npx prisma validate`: Schema is valid.

---

## 12. Safety & Limitations

1. **Live Database Safety**: Zero write operations or schema migrations were executed against the Railway live database. All testing used mocked database drivers and isolated unit/integration setups.
2. **PostgreSQL Multi-Connection Concurrency Testing Limitation**: Because no isolated disposable PostgreSQL database instance is available in this environment, multi-process destructive concurrency testing against real PostgreSQL was **NOT EXECUTED** to protect shared live data.
3. **Frontend Integration**: Frontend React components remain unchanged and will be connected in Phase 5 via TanStack Query.
