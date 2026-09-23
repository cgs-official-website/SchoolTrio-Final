# Phase 4C.5 — Attendance & Daily Operations Targeted Preflight Report

**Classification**: READY FOR IMPLEMENTATION  
**Date**: September 10, 2026  
**Target Environment**: Node.js 24.x, Express, Prisma ORM, PostgreSQL 16+  
**Scope**: Targeted Concurrency, Status Semantics, Academic Year, Absentee Lifecycle, and Authorization Clarification for Attendance Domain  

---

## 1. Concurrent Attendance Session Creation & Update Protocol

### A. The 5 Concurrency Scenarios Analyzed:

#### Scenario A: First Teacher Creates a Session (Does Not Yet Exist)
1. Teacher client submits `POST /api/v1/attendance/sessions` with `(classId, date, session, records)`.
2. Inside `prisma.$transaction`:
   - Checks if session already exists for `(schoolId, classId, date, session)`.
   - If not found, attempts `prisma.attendanceSession.create(...)`.
   - If no race condition occurred, inserts batch `AttendanceRecord`s and calculates student stats.

#### Scenario B: Two Concurrent Requests Create the Same `(schoolId, classId, date, session)`
1. Request 1 and Request 2 both check existence simultaneously and see no session.
2. Request 1 successfully inserts the `AttendanceSession` row.
3. Request 2 attempts insertion and PostgreSQL immediately raises `P2002` (Unique constraint violation on `[schoolId, classId, date, session]`).
4. The service catches `P2002`, acquires a row lock on the session created by Request 1 (`SELECT id, school_id FROM attendance_sessions WHERE school_id = $1 AND class_id = $2 AND date = $3 AND session = $4 FOR UPDATE`), and seamlessly executes an update for any new/modified student records.
5. Zero duplicate sessions created; zero unhandled crashes.

#### Scenario C: Two Concurrent Requests Update the Same Existing Session
1. Both requests enter a `$transaction`.
2. Both execute:
   ```sql
   SELECT id, school_id, class_id, date, session
   FROM attendance_sessions
   WHERE school_id = $1::uuid AND id = $2::uuid
   FOR UPDATE
   ```
3. Request 1 acquires the row lock; Request 2 blocks until Request 1 commits.
4. Request 1 writes record modifications, recomputes stats for affected students, and commits.
5. Request 2 unblocks, reads the updated state, applies its modifications, recomputes stats, and commits.

#### Scenario D: Two Concurrent Requests Update Different Students in the Same Session
- Handled via the same session-level row lock (`FOR UPDATE` on `AttendanceSession`).
- Record updates use `@@unique([schoolId, sessionId, studentId])`, upserting or modifying student status atomically.

#### Scenario E: Two Concurrent Requests Affect the Same Student's `AttendanceStat`
- *Example*: Morning teacher marks FN session while Afternoon teacher marks AN session for the same student simultaneously.
- **Protocol**:
  - To prevent lost updates or incremental math drift on `AttendanceStat`:
  - The transaction sorts affected `studentId`s deterministically (`[...studentIds].sort()`) to prevent deadlock.
  - Acquires student stat row locks:
    ```sql
    SELECT id, student_id
    FROM attendance_stats
    WHERE school_id = $1::uuid AND student_id = $2::uuid AND academic_year = $3
    FOR UPDATE
    ```
  - Recomputes `totalDays, presentDays, absentDays, lateDays, percentage` by **aggregating source `AttendanceRecord`s** for that student across the active academic year, rather than applying naive `+1 / -1` math.
  - This aggregate recomputation guarantees mathematical idempotency and total resilience against race drift.

---

## 2. Attendance Status Semantics & Statistics Formulas

### Verified Statuses in Current Frontend Codebase:
Inspection of `src/pages/Admin/Attendance.jsx`, `src/pages/Teacher/Attendance.jsx`, `src/pages/Parent/Attendance.jsx`, and `src/firebase/firestore.js` confirms that the active system uses **strictly 3 operational statuses**:

| Status | Contributes to `totalDays` | Contributes to `presentDays` | Contributes to `absentDays` | Contributes to `lateDays` | Contributes to Percentage? | Contributes to Absentee Flag? |
|---|---|---|---|---|---|---|
| **`Present`** | **+1** | **+1** | 0 | 0 | **Positive** (`present + late / total`) | **No** |
| **`Absent`** | **+1** | 0 | **+1** | 0 | **Negative** (reduces percentage) | **Yes (+1 toward monthly threshold)** |
| **`Late`** | **+1** | 0 | 0 | **+1** | **Positive** (`present + late / total`) | **No** |

### Clarification on Speculative Statuses:
- **`Excused`** and **`Half Day`**:
  - Neither `Excused` nor `Half Day` exists in the current React/Vite UI or Firestore code (the UI only renders `Present`, `Absent`, `Late` buttons).
  - If `Excused` is ever provided in future payloads: `totalDays + 1`, `absentDays + 0`, `presentDays + 1` (or neutral exemption).
  - If `Half Day` is provided: `totalDays + 1`, `lateDays + 1` (integer representation without fractional drift).
- **Authoritative Mathematical Formula**:
  ```javascript
  totalDays = presentDays + absentDays + lateDays;
  attendancePercentage = totalDays === 0 ? 100 : Number((((presentDays + lateDays) / totalDays) * 100).toFixed(1));
  ```

---

## 3. Academic Year Derivation

### Evidence from Codebase:
1. **Frontend Calculation** (`src/pages/Admin/Attendance.jsx` lines 164-168 & `Teacher/Attendance.jsx` lines 186-194):
   - Uses the standard Indian academic calendar year boundary (April 1 to March 31):
     ```javascript
     const recordMonth = recordDate.getMonth(); // 0-indexed: 0 = Jan, 3 = April
     let startYear = recordDate.getFullYear();
     if (recordMonth < 3) {
       startYear -= 1;
     }
     const academicYear = `${startYear}-${String(startYear + 1).slice(-2)}`; // e.g. "2026-27"
     ```
2. **School Configuration** (`SchoolSetting` where `category = 'academicConfig'`):
   - Stores configured `academicYear` (e.g. `{ "academicYear": "2026-27" }`).
3. **Backend Resolution Order**:
   - Step 1: Use explicit `academicYear` from request if provided.
   - Step 2: Query `SchoolSetting` (`category: 'academicConfig'`) for tenant.
   - Step 3: Default to deterministic April 1 – March 31 boundary calculation from session `date`.

---

## 4. Absentee Flag Lifecycle

### State Transition & Rules:
- **Threshold Source**: `SchoolSetting` (`category: 'attendanceSettings'`, field: `absenteeThreshold`, defaults to `2`).
- **Counting Window**: Calendar month extracted from session date (`YYYY-MM`, e.g., `"2026-09"`).
- **Counted Status**: `status === 'Absent'` only (`Late` and `Present` do not count).

```
   [Normal State: absentCount < threshold]
              │
              │ (Student marked Absent, count >= threshold)
              ▼
   [THRESHOLD_REACHED: AbsenteeFlag Created/Updated with absentCount]
              │
      ┌───────┴────────────────────────┐
      │ (Admin contacts parent)        │ (Teacher corrects attendance:
      │                                │  Absent -> Present, count < threshold)
      ▼                                ▼
[RESOLVED: isResolved = true]    [BELOW_THRESHOLD: AbsenteeFlag Deleted]
      │
      │ (Student marked Absent again in same month)
      ▼
[THRESHOLD_REACHED: Reopened / absentCount incremented]
```

---

## 5. Attendance Session Deletion / Void Policy

- **UI Exposure**: The frontend UI does not expose a "Delete Attendance" button; attendance is corrected in-place by teachers and admins.
- **Administrative API Capability**:
  - `DELETE /api/v1/attendance/sessions/:id` is supported exclusively for `SCHOOL_ADMIN` / `SUPER_ADMIN` with `attendance.delete`.
  - Transaction locks `AttendanceSession` via `SELECT ... FOR UPDATE`.
  - Cascade deletes associated `AttendanceRecord`s.
  - Automatically triggers stat and absentee flag recalculations for all affected students in the session.
  - Dispatches `DELETE_ATTENDANCE_SESSION` audit log.

---

## 6. Class vs Section Semantics

- **Audited Schema**: `AttendanceSession` has `classId UUID` (mandatory) and `sectionId UUID?` (optional).
- **Unique Constraint**: `@@unique([schoolId, classId, date, session])`.
- **Finding**:
  - In the SMS system architecture, each `Class` entity represents the enrolled student cohort (e.g., `Class.name = "Grade 10 - Section A"` or `Class.name = "Grade 10"`, with `Student.classId` pointing directly to `Class.id`).
  - Attendance is taken at the **Class cohort level**.
  - `sectionId` is an optional relational link when sections are normalized under a master class.
  - There is **no schema conflict**; uniqueness guarantees one morning (`FN`), one afternoon (`AN`), or one `STANDARD` session per class cohort per calendar date.

---

## 7. Teacher Authorization Matrix

| Role / User Type | `attendance.read` | `attendance.create` | `attendance.edit` | `attendance.delete` | Access Scope |
|---|---|---|---|---|---|
| **SUPER_ADMIN** | Allowed | Allowed | Allowed | Allowed | **ALL Classes** across tenants |
| **SCHOOL_ADMIN** | Allowed | Allowed | Allowed | Allowed | **ALL Classes** in tenant |
| **Class Teacher** (`Class.classTeacherId == req.user.staffProfile.id`) | Allowed | Allowed | Allowed | Denied (403) | **ASSIGNED Class ONLY** |
| **Teacher without Class** | Denied (unless Role has `attendance.create`) | Denied (unless Role has `attendance.create`) | Denied | Denied | **None** (or institutional role scope) |
| **Vice Principal / Principal** | Allowed | Allowed | Allowed | Allowed (if Admin role) | **ALL Classes** |
| **PARENT** | Allowed (via Child Link) | Denied (403) | Denied (403) | Denied (403) | **OWN Linked Children ONLY** |
| **STUDENT** | Denied (No Auth User yet) | Denied (403) | Denied (403) | Denied (403) | **None** |

---

## 8. Student Self-Access Determination

- **Authentication State**:
  - In the authoritative backend schema, `Student` models do **not** have associated `User` accounts or authentication credentials (only `ParentProfile` and `StaffProfile` link to `User`).
- **Policy**:
  - `GET /api/v1/attendance/students/:studentId` will support **Institutional Staff** (`attendance.read`) and **Linked Parents** (`PARENT` validated against `ParentStudentLink`).
  - **Student self-access will NOT be implemented** during Phase 4C.5.

---

## 9. Dashboard Source of Truth

- **Daily Dashboard Metrics** (`GET /api/v1/attendance/dashboard-stats?date=YYYY-MM-DD`):
  - Computed on-the-fly from **`AttendanceSession` and `AttendanceRecord`** for the requested date.
  - Authoritative calculation:
    - Total classes = `prisma.class.count({ where: { schoolId } })`
    - Classes marked = `prisma.attendanceSession.count({ where: { schoolId, date } })`
    - School-wide / Grade-wise / Section-wise counts = aggregated from `AttendanceRecord`s joined to `AttendanceSession`.
- **Cumulative Student Metrics**:
  - Sourced from **`AttendanceStat`** for academic year totals and percentages.

---

## 10. Firestore Document Key & Date Representation

### Clarification of Discrepancy:
- **Firestore Implementation**:
  - For session-specific marking: Document ID is `${classId}_${date}_${session}` (e.g. `class123_2026-09-10_FN`) and document field `date` is stored as `"2026-09-10_FN"`.
  - For legacy single-session: Document ID is `${classId}_${date}` and field `date` is `"2026-09-10"`.
- **PostgreSQL Relational Normalization**:
  - `date`: `"2026-09-10"` (`VarChar(10)`, pure ISO date `YYYY-MM-DD`).
  - `session`: `"FN"` | `"AN"` | `"STANDARD"` (`VarChar(20)`).
  - Uniqueness: `@@unique([schoolId, classId, date, session])`.
  - This provides clean relational normalization while absorbing both Firestore key formats without ambiguity.

---

## 11. Static Analysis & Schema Validation Checks

- `npm run lint`: **0 errors**
- `npx prisma validate`: **Schema is valid**
- Source code / Schema modifications: **0 files modified**

---

## 12. Final Classification

**`READY FOR IMPLEMENTATION`**

All concurrency scenarios, status semantics, academic year derivations, absentee lifecycles, class/section semantics, and authorization boundaries are mathematically and architecturally resolved. Standing by for approval to begin Phase 4C.5 backend implementation.
