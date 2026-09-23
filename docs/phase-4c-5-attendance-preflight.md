# Phase 4C.5 — Attendance & Daily Operations Domain Preflight Audit

**Classification**: READY FOR IMPLEMENTATION  
**Date**: September 10, 2026  
**Target Environment**: Node.js 24.x, Express, Prisma ORM, PostgreSQL 16+, Redis (Optional Cache)  
**Scope**: Preflight Audit for Attendance, Attendance Sessions, Attendance Records, Student Attendance Stats, and Absentee Flags  

---

## 1. Executive Summary

Phase 4C.5 addresses the **Attendance & Daily Operations** domain. Attendance represents the core daily operational heartbeat of the School Management System, directly linking Teachers (`StaffProfile`), Classes & Sections (`Class`, `Section`), Students (`Student`), and Parents (`ParentProfile`).

All prerequisite domains:
1. **Authentication** (`/api/v1/auth`) — COMPLETE
2. **RBAC** (`/api/v1/rbac`) — COMPLETE
3. **Classes & Sections** (`/api/v1/classes`, `class-categories`) — COMPLETE
4. **Subjects** (`/api/v1/subjects`) — COMPLETE
5. **Students** (`/api/v1/students`) — COMPLETE
6. **Parents & Parent-Student Links** (`/api/v1/parents`) — COMPLETE
7. **Staff & Staff Profiles** (`/api/v1/staff`) — COMPLETE

are 100% implemented, tested, and verified.

The live database audit confirms that the PostgreSQL Attendance models (`attendance_sessions`, `attendance_records`, `attendance_stats`, `absentee_flags`) currently contain 0 records across all active tenants (`S024`, `S015`, `S019`), providing a clean-slate domain ready for first-class backend API implementation without complex legacy schema migration barriers.

---

## 2. Domain Selection Evidence

### Why Attendance is the Exact Phase 4C.5 Candidate:
1. **Strict Dependency Hierarchy**:
   - Attendance directly depends on `School` (Phase 1), `Class` & `Section` (Phase 4C.2), `Student` (Phase 4C.3-A), and `StaffProfile` (Phase 4C.4).
   - With all foundational entities in place, Attendance is the immediate next dependency in the academic operations DAG.
2. **Foundation for Downstream Academic Domains**:
   - **Report Cards & Assessments** require `attendanceSummary` (`totalDays`, `presentDays`, `percentage`).
   - **Student Profile Overview** requires running attendance stats and absentee history.
   - **Parent Portal Dashboard** displays daily attendance cards and monthly trends.
3. **High Frontend Business Usage**:
   - `src/pages/Admin/Attendance.jsx` (57 KB) — School-wide attendance overview, section-wise marking, analytics, absentee threshold alerts, Excel exports.
   - `src/pages/Teacher/Attendance.jsx` (35 KB) — Class Teacher daily roster marking, session toggles (FN/AN), historical attendance logs.
   - `src/pages/Parent/Attendance.jsx` (8.3 KB) — Parent student attendance tracker and breakdown.
4. **Architectural Simplicity**:
   - Clean, well-defined relational tables in Prisma.
   - No external payment gateways or third-party webhooks needed.

---

## 3. PostgreSQL Schema Audit

The PostgreSQL schema contains 4 dedicated models for the Attendance domain in `backend/prisma/schema.prisma`:

### Model 1: `AttendanceSession`
- **Table**: `attendance_sessions`
- **Primary Key**: `id UUID` (`@id @default(uuid())`)
- **Tenant Key**: `schoolId UUID` (`@map("school_id")`)
- **Fields**:
  - `classId UUID` (`@map("class_id")`, references `Class.id`, `onDelete: Cascade`)
  - `sectionId UUID?` (`@map("section_id")`, references `Section.id`, `onDelete: SetNull`)
  - `date VarChar(10)` (Format: `YYYY-MM-DD`)
  - `session VarChar(20)` (`@default("STANDARD")`, allowed: `STANDARD`, `FN`, `AN`)
  - `markedByUserId UUID` (`@map("marked_by_user_id")`)
  - `submittedAt DateTime?` (`@default(now())`)
  - `createdAt DateTime` (`@default(now())`)
  - `updatedAt DateTime` (`@updatedAt`)
- **Constraints & Indexes**:
  - `@@unique([schoolId, id])`
  - `@@unique([schoolId, classId, date, session])`
  - `@@index([schoolId, date])`
- **Relationships**:
  - `class`: `Class` (Cascade)
  - `section`: `Section?` (SetNull)
  - `records`: `AttendanceRecord[]` (Cascade)

### Model 2: `AttendanceRecord`
- **Table**: `attendance_records`
- **Primary Key**: `id UUID`
- **Tenant Key**: `schoolId UUID`
- **Fields**:
  - `sessionId UUID` (`@map("session_id")`, references `AttendanceSession.id`, `onDelete: Cascade`)
  - `studentId UUID` (`@map("student_id")`, references `Student.id`, `onDelete: Cascade`)
  - `status VarChar(20)` (`Present` | `Absent` | `Late` | `Excused` | `Half Day`)
  - `remark VarChar(255)?`
  - `createdAt DateTime` (`@default(now())`)
  - `updatedAt DateTime` (`@updatedAt`)
- **Constraints & Indexes**:
  - `@@unique([schoolId, id])`
  - `@@unique([schoolId, sessionId, studentId])`
  - `@@index([schoolId, studentId])`
- **Relationships**:
  - `session`: `AttendanceSession` (Cascade)
  - `student`: `Student` (Cascade)

### Model 3: `AttendanceStat`
- **Table**: `attendance_stats`
- **Primary Key**: `id UUID`
- **Tenant Key**: `schoolId UUID`
- **Fields**:
  - `studentId UUID` (`@map("student_id")`, references `Student.id`, `onDelete: Cascade`)
  - `academicYear VarChar(20)` (`@map("academic_year")`, e.g., `"2026-27"`)
  - `totalDays Int` (`@default(0)`)
  - `presentDays Int` (`@default(0)`)
  - `absentDays Int` (`@default(0)`)
  - `lateDays Int` (`@default(0)`)
  - `percentage Decimal(5, 2)` (`@default(100)`)
  - `updatedAt DateTime` (`@updatedAt`)
- **Constraints & Indexes**:
  - `@@unique([schoolId, id])`
  - `@@unique([schoolId, studentId, academicYear])`
- **Relationships**:
  - `student`: `Student` (Cascade)

### Model 4: `AbsenteeFlag`
- **Table**: `absentee_flags`
- **Primary Key**: `id UUID`
- **Tenant Key**: `schoolId UUID`
- **Fields**:
  - `studentId UUID` (`@map("student_id")`, references `Student.id`, `onDelete: Cascade`)
  - `classId UUID` (`@map("class_id")`, references `Class.id`, `onDelete: Cascade`)
  - `monthStr VarChar(7)` (`@map("month_str")`, Format: `YYYY-MM`)
  - `absentCount Int` (`@map("absent_count")`)
  - `flaggedAt DateTime` (`@default(now())`)
  - `isResolved Boolean` (`@default(false)`)
- **Constraints & Indexes**:
  - `@@unique([schoolId, id])`
  - `@@unique([schoolId, studentId, monthStr])`
- **Relationships**:
  - `student`: `Student` (Cascade)
  - `class`: `Class` (Cascade)

---

## 4. Firestore Source Audit

### Collection Paths & Structures:
1. `schools/{schoolId}/attendance/{classId}_{date}_{session}` (or `{classId}_{date}`)
   - Document ID: `${classId}_${dateString}` (e.g., `class123_2026-09-10_FN`)
   - Payload:
     ```json
     {
       "classId": "class-uuid",
       "date": "2026-09-10_FN",
       "markedBy": "user-uuid",
       "records": {
         "student-1": "Present",
         "student-2": "Absent",
         "student-3": "Late"
       },
       "updatedAt": "2026-09-10T09:15:00.000Z"
     }
     ```
2. `schools/{schoolId}/attendanceStats/{studentId}`
   - Document ID: `${studentId}`
   - Payload:
     ```json
     {
       "studentId": "student-uuid",
       "totalDays": 120,
       "presentDays": 114,
       "absentDays": 4,
       "lateDays": 2,
       "attendancePercentage": 96.7,
       "academicYear": "2026-27",
       "lastUpdated": "2026-09-10T09:15:00.000Z"
     }
     ```
3. `schools/{schoolId}/absenteeFlags/{studentId}_{monthStr}`
   - Document ID: `${studentId}_${monthStr}` (e.g., `student123_2026-09`)
   - Payload:
     ```json
     {
       "studentId": "student-uuid",
       "classId": "class-uuid",
       "month": "2026-09",
       "absentCount": 3,
       "flaggedAt": "2026-09-10T09:15:00.000Z"
     }
     ```
4. `schools/{schoolId}/config/attendanceSettings`
   - Document ID: `attendanceSettings`
   - Payload: `{ "cutoffTime": "09:30", "absenteeThreshold": 2 }`
5. `schools/{schoolId}/dashboardStats/{date}`
   - Computed document tracking daily percentage, section breakdowns, and pending markers.

---

## 5. Live Data Audit (Read-Only Inspection)

A read-only live query against the PostgreSQL database was executed:
```
School SYSTEM_TEMPLATE: AttendanceSession: 0, AttendanceRecord: 0, AttendanceStat: 0, AbsenteeFlag: 0
School SchoolS015:     AttendanceSession: 0, AttendanceRecord: 0, AttendanceStat: 0, AbsenteeFlag: 0
School SchoolS019:     AttendanceSession: 0, AttendanceRecord: 0, AttendanceStat: 0, AbsenteeFlag: 0
School SchoolS024:     AttendanceSession: 0, AttendanceRecord: 0, AttendanceStat: 0, AbsenteeFlag: 0
```

- **Findings**:
  - No legacy attendance records were migrated to PostgreSQL during initial bootstrap, as attendance represents ephemeral daily operational logs created live by users.
  - Zero orphan records, zero broken foreign keys, and zero constraint conflicts exist.
  - Clean slate ready for backend implementation.

---

## 6. Frontend Workflow Audit

### A. Admin Portal (`src/pages/Admin/Attendance.jsx`):
- **Tab 1: Dashboard**:
  - Overview of school-wide attendance percentage for selected date.
  - Grade-by-grade and section-by-section breakdown (Total, Present, Absent, Late).
  - Unmarked / pending attendance warnings and cutoff time tracking.
- **Tab 2: Class Marking**:
  - Filter by Class, Date, Session (FN / AN / STANDARD).
  - Pre-populates roster of students sorted alphabetically.
  - Batch submit attendance with Present / Absent / Late toggles.
- **Tab 3: Analytics**:
  - Monthly attendance trends.
  - List of students with `absentCount >= threshold` (Absentee Flags).
  - Excel/CSV export of daily and historical reports.

### B. Teacher Portal (`src/pages/Teacher/Attendance.jsx`):
- Automatically defaults to `userProfile.assignedClassId` (the Class for which the teacher is `classTeacherId`).
- Selects date & session, reviews roster, marks statuses, and clicks "Save Attendance".
- Auto-resolves pending attendance alerts for the class.
- Exports class attendance registers.

### C. Parent Portal (`src/pages/Parent/Attendance.jsx`):
- Queries attendance records for `userProfile.linkedStudentId`.
- Calculates overall attendance %, present count, absent count, late count.
- Filterable by: All Time, This Week, This Month, This Term.

---

## 7. RBAC & Permissions Audit

- **Canonical Module Key**: `attendance` (defined in `backend/src/modules/rbac/rbac.constants.js`).
- **Canonical Permissions**:
  - `attendance.read` — View attendance sessions, daily registers, student statistics, and absentee flags.
  - `attendance.create` — Submit new daily attendance sessions and student records.
  - `attendance.edit` — Re-mark/update attendance records and resolve absentee flags.
  - `attendance.delete` — Void/delete an invalid attendance session (Admin only).
- **Role Authority**:
  - `SCHOOL_ADMIN` / `SUPER_ADMIN`: Full access across all classes.
  - `TEACHER` / `Class Incharge`: Authorized to submit/update attendance for their assigned class (`Class.classTeacherId == req.user.staffProfile.id` or institutional teacher permissions).
  - `PARENT`: Authorized to view linked child's attendance via `ParentStudentLink` checks.

---

## 8. Proposed REST API Contract

### 1. `GET /api/v1/attendance/sessions`
- **Auth**: `attendance.read`
- **Query Params**: `classId`, `sectionId`, `date`, `startDate`, `endDate`, `session`, `page`, `limit`
- **Description**: Lists paginated attendance sessions with class/section metadata and record counts.

### 2. `GET /api/v1/attendance/sessions/:id`
- **Auth**: `attendance.read`
- **Params**: `id` (UUID)
- **Description**: Returns full session details including all individual student `AttendanceRecord`s.

### 3. `POST /api/v1/attendance/sessions`
- **Auth**: `attendance.create` (or Class Teacher for assigned class)
- **Request Body**:
  ```json
  {
    "classId": "uuid",
    "sectionId": "uuid",
    "date": "2026-09-10",
    "session": "STANDARD",
    "records": [
      { "studentId": "uuid-1", "status": "Present", "remark": null },
      { "studentId": "uuid-2", "status": "Absent", "remark": "Sick leave" },
      { "studentId": "uuid-3", "status": "Late", "remark": "Bus delay" }
    ]
  }
  ```
- **Side Effects (Atomic Transaction)**:
  1. Upserts `AttendanceSession` (`@@unique([schoolId, classId, date, session])`).
  2. Batch inserts/updates `AttendanceRecord`s.
  3. Recomputes and updates `AttendanceStat` for each submitted student.
  4. Evaluates monthly absent count and creates/updates `AbsenteeFlag` if threshold exceeded.
  5. Emits `RECORD_ATTENDANCE` audit log.

### 4. `PATCH /api/v1/attendance/sessions/:id`
- **Auth**: `attendance.edit` (or Class Teacher for assigned class)
- **Request Body**:
  ```json
  {
    "records": [
      { "studentId": "uuid-2", "status": "Present", "remark": "Correction" }
    ]
  }
  ```
- **Description**: Updates specific student records in an existing session and updates running stats.

### 5. `DELETE /api/v1/attendance/sessions/:id`
- **Auth**: `attendance.delete` (Admin only)
- **Description**: Voids an attendance session and updates student stats accordingly.

### 6. `GET /api/v1/attendance/dashboard-stats`
- **Auth**: `attendance.read`
- **Query Params**: `date` (YYYY-MM-DD)
- **Description**: Computes and returns school-wide, grade-wise, and section-wise attendance summary for the daily dashboard.

### 7. `GET /api/v1/attendance/students/:studentId`
- **Auth**: `attendance.read` / linked Parent / Student self
- **Query Params**: `filter` (`all` | `weekly` | `monthly` | `term`), `academicYear`
- **Description**: Returns detailed student attendance timeline and percentage breakdown for parent/student portal.

### 8. `GET /api/v1/attendance/absentee-flags`
- **Auth**: `attendance.read`
- **Query Params**: `classId`, `month`, `isResolved`, `page`, `limit`
- **Description**: Lists students flagged for high absenteeism.

### 9. `PATCH /api/v1/attendance/absentee-flags/:id/resolve`
- **Auth**: `attendance.edit`
- **Request Body**: `{ "isResolved": true, "resolutionNotes": "Parent contacted" }`
- **Description**: Marks an absentee alert as resolved.

---

## 9. Validation Rules

- **`date`**: Strict ISO Date `YYYY-MM-DD` (`/^\d{4}-\d{2}-\d{2}$/`). Future dates rejected.
- **`session`**: Enum `['STANDARD', 'FN', 'AN']`. Defaults to `'STANDARD'`.
- **`status`**: Enum `['Present', 'Absent', 'Late', 'Excused', 'Half Day']`.
- **`classId`**: Valid UUID belonging to current tenant.
- **`sectionId`**: Optional valid UUID belonging to current tenant and matching `classId`.
- **`records`**: Non-empty array of objects.
  - Every `studentId` must be a valid UUID belonging to the target `classId` and active tenant (`schoolId`).
  - Duplicate `studentId`s in payload are strictly rejected.
- **`monthStr`**: Strict `YYYY-MM` format (`/^\d{4}-\d{2}$/`).

---

## 10. Multi-Tenant Isolation

- Every query and database transaction enforces `schoolId = req.tenant.id`.
- Tenant spoofing via request body/params `schoolId` rejected with `403 TenantAccessError`.
- SuperAdmin tenant switching enabled via `X-Tenant-Id` header.
- Cross-tenant `classId`, `sectionId`, or `studentId` references are rejected with `NotFoundError` or `ValidationError`.

---

## 11. Dependency Matrix & Cascades

| Entity | Parent Entities | Dependent Entities | ON DELETE Behavior |
|---|---|---|---|
| `AttendanceSession` | `School`, `Class`, `Section` | `AttendanceRecord` | Cascade from School/Class; Cascades to Records |
| `AttendanceRecord` | `AttendanceSession`, `Student` | None | Cascade from Session/Student |
| `AttendanceStat` | `School`, `Student` | None | Cascade from Student |
| `AbsenteeFlag` | `School`, `Student`, `Class` | None | Cascade from Student/Class |

---

## 12. Delete Policy & Concurrency

### Deletion Policy:
- Deleting an `AttendanceSession` is an exceptional administrative operation.
- Transaction sequence:
  1. Acquire row lock: `SELECT id, school_id FROM attendance_sessions WHERE school_id = $1 AND id = $2 FOR UPDATE`.
  2. Read affected `AttendanceRecord`s and `studentId`s.
  3. Delete session (cascades to `attendance_records`).
  4. Recalculate running stats for affected students.
  5. Commit and log `DELETE_ATTENDANCE_SESSION`.

### Upsert Concurrency:
- Two teachers marking attendance for the same class/date/session simultaneously are handled via PostgreSQL `@@unique([schoolId, classId, date, session])`.
- The upsert transaction acquires a row lock on the session if existing, updates records in a batch, and recalculates stats atomically.

---

## 13. Audit Logging Strategy

Canonical audit records via `createAuditLog`:
- `RECORD_ATTENDANCE`: `${class.name} (${date} - ${session})`
- `UPDATE_ATTENDANCE`: `${class.name} (${date} - ${session})`
- `DELETE_ATTENDANCE_SESSION`: `${sessionId}`
- `RESOLVE_ABSENTEE_FLAG`: `${student.name} (${monthStr})`

Dispatched non-blockingly after transaction commits.

---

## 14. Realtime Strategy

- **Recommendation**: REST + TanStack Query with `staleTime: 30_000`.
- Attendance is recorded in discrete, deliberate batches (e.g. morning roll-call). It does not require persistent bidirectional WebSocket connections. Standard TanStack Query cache invalidation upon submitting attendance gives instantaneous local updates.

---

## 15. Security Review

| Threat Category | Severity | Mitigation |
|---|---|---|
| **IDOR / Class Spoofing** | HIGH | Verify teacher is assigned to class or has administrative role before allowing submission |
| **Cross-Tenant Student Injection** | HIGH | Validate all `studentId`s belong to `schoolId` and `classId` |
| **Parent Unauthorized Probing** | MEDIUM | Parent portal endpoint verifies `ParentStudentLink` before returning child attendance |
| **Race Conditions in Multi-Tab Marking** | MEDIUM | Handled via PostgreSQL transaction row locking and unique constraints |

---

## 16. Implementation Scope & Modules to Create

```
backend/src/modules/attendance/
    ├── attendance.schemas.js
    ├── attendance.repository.js
    ├── attendance.service.js
    ├── attendance.controller.js
    └── attendance.routes.js

backend/tests/
    ├── unit/attendance/
    │   ├── attendance.schemas.test.js
    │   ├── attendance.service.test.js
    │   └── attendance.concurrency.test.js
    ├── integration/attendance/
    │   └── attendance-endpoints.test.js
    └── security/
        └── attendance-tenant-isolation.test.js
```

---

## 17. Final Classification

**`READY FOR IMPLEMENTATION`**

All prerequisites are complete, schema models are fully defined, live database state is validated (0 records / clean slate), and contracts are fully specified. Standing by for user review and approval before proceeding to implementation.
