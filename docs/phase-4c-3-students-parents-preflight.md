# Phase 4C.3 — Students & Parents Preflight Audit

## 1. Executive Summary

This preflight audit provides an exhaustive, evidence-backed analysis of the **Students & Parents Domain** in preparation for backend implementation (Phase 4C.3).

### Key Findings:
1. **Relational Architecture & Normalization:**
   - In legacy Firestore, a student document (`schools/{schoolId}/students/{studentId}`) contains both student demographic data and embedded parent information (`parentName`, `parentPhone`, `parentEmail`, etc.).
   - In PostgreSQL, this structure is normalized into three distinct models:
     - `Student`: Core demographic and academic enrollment record.
     - `ParentProfile` (1:1 with `User`): Authenticated guardian profile.
     - `ParentStudentLink` (M:N): Relational join model allowing multiple parents per student (e.g. Father, Mother, Guardian) and multiple students per parent (e.g. siblings).
2. **Current Migrated PostgreSQL Data State:**
   - **SchoolS024 (Spring Mount):** 340 Students, 328 ParentProfiles, 340 ParentStudentLinks, 99 Invoices.
   - **SchoolS015 (TrustITec):** 375 Students, 317 ParentProfiles, 375 ParentStudentLinks, 0 Invoices.
   - **Total Active Database Records:** 715 Students, 645 ParentProfiles, 715 ParentStudentLinks. All records are active and mapped 1:1 via `MigrationIdMap`.
3. **Authentication & Admission Login Integration:**
   - Completed in Phase 4B.4: Parents authenticate either via email or via the student's admission number (`POST /api/v1/auth/admission-login`), which resolves `(schoolCode + admissionNumber) -> School -> Student -> ParentStudentLink -> ParentProfile -> User`.
4. **Deletion & Concurrency Safety:**
   - A `Student` is referenced by **12 child models** in PostgreSQL (Attendance, Invoices, Grades, Report Cards, Homework, Book Issues, Chat Rooms, PTM, Canteen, etc.).
   - Hard deletion of an active student with financial, attendance, or academic history threatens statutory compliance and data integrity.
   - **Verdict:** Status transitions (`Active`, `Inactive`, `Transferred`, `Graduated`, `Alumni`) must serve as the primary lifecycle mechanism. Hard DELETE must only be permitted for zero-dependency draft/accidental records, guarded by explicit `FOR UPDATE` row locking.

---

## 2. Current Architecture

```
React / Vite Frontend (StudentManagement.jsx, MyChildren.jsx)
        ↓
REST API (/api/v1/students, /api/v1/parents)
        ↓
Express Middleware Stack: authenticate → tenantContext → requirePermission → validate
        ↓
Student & Parent Controllers
        ↓
Student & Parent Services (Lifecycle, Uniqueness, Dependency Guards, AuditLog)
        ↓
Student & Parent Repositories (Prisma Client + Parameterized $queryRaw)
        ↓
PostgreSQL 16 Database
```

- **Runtime:** Node.js 24.x, Express.
- **ORM & DB:** Prisma ORM, PostgreSQL 16+ with tenant isolation via `schoolId` AsyncLocalStorage context (`runWithTenantContext`).
- **Authorization:** Canonical PostgreSQL RBAC (`students.read`, `students.create`, `students.edit`, `students.delete`).
- **Audit Logging:** Canonical [`createAuditLog`](file:///c:/Projects/SMS/backend/src/modules/audit/audit.repository.js) recording structured deltas.

---

## 3. PostgreSQL / Prisma Models

The Students & Parents domain encompasses the following core models in [`backend/prisma/schema.prisma`](file:///c:/Projects/SMS/backend/prisma/schema.prisma):

```
┌─────────────────┐       1:1       ┌──────────────────┐
│      User       │ ─────────────── │  ParentProfile   │
└─────────────────┘                 └──────────────────┘
                                             │ 1
                                             │
                                             │ M
                                    ┌──────────────────┐
                                    │ParentStudentLink │
                                    └──────────────────┘
                                             │ M
                                             │
                                             │ 1
┌─────────────────┐       N:1       ┌──────────────────┐
│     Class       │ ◄────────────── │     Student      │
└─────────────────┘                 └──────────────────┘
         ▲                                   │
         │ N:1                               │ 1:N
┌─────────────────┐                          ▼
│     Section     │                 12 Relational Child Tables
└─────────────────┘                 (Attendance, Invoices, Grades...)
```

---

## 4. Student Model Analysis

### Schema Definition (`prisma/schema.prisma` lines 457–503)
- **Table Name:** `"students"`
- **Primary Key:** `id` (UUID v4)
- **Tenant Scope:** `schoolId` (UUID v4, NOT NULL)

| Field | Type | Modifiers | Description |
|---|---|---|---|
| `id` | `UUID` | `@id @default(uuid())` | Primary key |
| `schoolId` | `UUID` | `@map("school_id")` | Tenant reference to `School.id` |
| `classId` | `UUID` | `@map("class_id")`, Nullable | Foreign key to `Class.id` (`onDelete: SetNull`) |
| `sectionId` | `UUID` | `@map("section_id")`, Nullable | Foreign key to `Section.id` (`onDelete: SetNull`) |
| `transportRouteId`| `UUID` | `@map("transport_route_id")`, Nullable | Foreign key to `TransportRoute.id` (`onDelete: SetNull`) |
| `pickupStopId` | `UUID` | `@map("pickup_stop_id")`, Nullable | Foreign key to `RouteStop.id` (`onDelete: SetNull`) |
| `admissionNumber` | `VarChar(100)` | `@map("admission_number")`, NOT NULL | Institutional student ID |
| `rollNumber` | `VarChar(50)` | `@map("roll_number")`, Nullable | Class roll number |
| `firstName` | `VarChar(100)` | `@map("first_name")`, NOT NULL | Student given name |
| `lastName` | `VarChar(100)` | `@map("last_name")`, Nullable | Student family name |
| `dob` | `VarChar(10)` | Nullable | Date of birth (`YYYY-MM-DD`) |
| `gender` | `VarChar(20)` | Nullable | Gender (`Male`, `Female`, `Other`) |
| `bloodGroup` | `VarChar(10)` | `@map("blood_group")`, Nullable | Blood group (e.g. `A+`, `O+`, `B+Ve`) |
| `aadhaarNumber` | `VarChar(12)` | `@map("aadhaar_number")`, Nullable | 12-digit Indian national UID |
| `photoUrl` | `Text` | `@map("photo_url")`, Nullable | Public/Cloudinary photo asset URL |
| `status` | `VarChar(30)` | `@default("Active")` | `Active`, `Inactive`, `Transferred`, `Graduated`, `Alumni` |
| `customData` | `Json` | `@map("custom_data")`, Nullable | Arbitrary schema fields & legacy attributes |
| `createdAt` | `DateTime` | `@default(now()) @map("created_at")` | Creation timestamp |
| `updatedAt` | `DateTime` | `@updatedAt @map("updated_at")` | Update timestamp |
| `legacyFirestoreId`| `VarChar(128)`| `@map("legacy_firestore_id")`, Nullable | Legacy Firestore Document ID |

### Database Constraints & Indexes:
- `@@unique([schoolId, id])` — Composite primary tenant isolation guarantee.
- `@@unique([schoolId, admissionNumber])` — Enforces institutional uniqueness per school.
- `@@index([schoolId, classId])` — Optimized class roster query performance.
- `@@index([schoolId, legacyFirestoreId])` — Legacy document resolution index.

---

## 5. Parent Model Analysis

### Schema Definition (`prisma/schema.prisma` lines 505–523)
- **Table Name:** `"parent_profiles"`
- **Primary Key:** `id` (UUID v4)
- **User Link:** `userId` (UUID v4, `@unique`, 1:1 with `User.id`)

| Field | Type | Modifiers | Description |
|---|---|---|---|
| `id` | `UUID` | `@id @default(uuid())` | Primary key |
| `schoolId` | `UUID` | `@map("school_id")` | Tenant reference to `School.id` |
| `userId` | `UUID` | `@unique @map("user_id")` | 1:1 link to authenticated `User.id` |
| `name` | `VarChar(200)` | NOT NULL | Guardian full name (e.g. "Father: X | Mother: Y") |
| `phone` | `VarChar(20)` | Nullable | Primary contact phone |
| `email` | `VarChar(255)` | Nullable | Primary contact email |
| `address` | `Text` | Nullable | Residential address |
| `emergencyContact`| `VarChar(20)`| `@map("emergency_contact")`, Nullable | Emergency phone number |
| `createdAt` | `DateTime` | `@default(now())` | Record creation timestamp |
| `updatedAt` | `DateTime` | `@updatedAt` | Record update timestamp |

### Database Constraints:
- `@@unique([schoolId, id])`
- `@@unique([userId])`

---

## 6. User / Auth Relationships

```
┌─────────────────────────────────────────────────────────────┐
│                         User Table                          │
│ id, email, passwordHash, systemRole='PARENT', isActive=true │
└─────────────────────────────────────────────────────────────┘
                               ▲
                               │ 1:1 (Cascade Delete)
┌─────────────────────────────────────────────────────────────┐
│                    ParentProfile Table                      │
│ id, schoolId, userId, name, phone, email, emergencyContact  │
└─────────────────────────────────────────────────────────────┘
                               ▲
                               │ 1:N (Cascade Delete)
┌─────────────────────────────────────────────────────────────┐
│                  ParentStudentLink Table                    │
│ schoolId, parentProfileId, studentId, relationship          │
└─────────────────────────────────────────────────────────────┘
```

1. **User Identity:** Every `ParentProfile` is backed by a row in `users`.
2. **Role:** `systemRole` is set to `'PARENT'` (or `'TENANT_USER'`).
3. **Admission Login:** In [`admission-auth.service.js`](file:///c:/Projects/SMS/backend/src/modules/auth/admission-auth.service.js), when a parent logs in using `admissionNumber`:
   - It queries `Student` where `schoolId = school.id AND admissionNumber = normalizedNumber`.
   - Traverses `student.parents -> link.parent.user`.
   - Validates credentials against `candidateUsers`.
   - Issues a standard JWT access token with `sub: user.id`, `schoolId: school.id`, `systemRole: 'PARENT'`.

---

## 7. Parent-Student Relationship (`ParentStudentLink`)

### Schema Definition (`prisma/schema.prisma` lines 220–235)
- **Table Name:** `"parent_student_links"`
- **Join Cardinality:** M:N (Many Parents to Many Students)

| Field | Type | Modifiers | Description |
|---|---|---|---|
| `id` | `UUID` | `@id @default(uuid())` | Primary key |
| `schoolId` | `UUID` | `@map("school_id")` | Tenant reference |
| `parentProfileId` | `UUID` | `@map("parent_profile_id")` | Reference to `ParentProfile.id` |
| `studentId` | `UUID` | `@map("student_id")` | Reference to `Student.id` |
| `relationship` | `VarChar(50)` | Nullable | e.g. `'Father'`, `'Mother'`, `'Guardian'`, `'Parent'` |
| `createdAt` | `DateTime` | `@default(now())` | Timestamp |

### Referential Integrity & Uniqueness:
- `@@unique([schoolId, id])`
- `@@unique([parentProfileId, studentId])` — Strictly prevents duplicate links between the same parent and student within a school.
- `@@index([schoolId, studentId])` — Fast lookup for all parents linked to a given student.
- Foreign Keys:
  - `parent`: `REFERENCES parent_profiles(school_id, id) ON DELETE CASCADE`
  - `student`: `REFERENCES students(school_id, id) ON DELETE CASCADE`

---

## 8. Firestore Data Model

### Legacy Collection Hierarchy:
1. **Student Document:** `schools/{schoolId}/students/{studentId}`
   - **Student Identity:** `firstName`, `lastName`, `admissionNumber`, `dob`, `gender`, `bloodGroup`, `aadharNumber`, `photoUrl`, `status`.
   - **Embedded Parent Attributes:** `parentName`, `parentPhone`, `parentEmail`, `parentRelationship`, `parentOccupation`, `emergencyContact`, `annualIncome`, `homeAddress`, `city`, `state`, `pincode`.
   - **Embedded Academic & Fees:** `classId`, `section`, `busRoute`, `tuitionFee`, `hostelFee`, `bookFee`, `otherFee`, `totalFee`.
   - **Custom Fields:** `customData` (Map).
2. **Parent User Profile:** `users/{uid}`
   - `role`: `'parent'`
   - `linkedStudentId`: String (Active child in parent portal)
   - `linkedStudents`: Array of `{ studentId, classId, name }`
   - `children`: Array of manual sibling objects

---

## 9. Frontend Usage

| Component / Page | File | Read / Write | Operations | Fields Used |
|---|---|---|---|---|
| **Student Management** | [`src/pages/Admin/StudentManagement.jsx`](file:///c:/Projects/SMS/src/pages/Admin/StudentManagement.jsx) | Read / Write | List, Search, Filter, Create Student, Edit Student, Delete Student, Reassign Class, Export XLSX, Bulk Import | `firstName`, `lastName`, `admissionNumber`, `classId`, `sectionId`, `dob`, `gender`, `bloodGroup`, `aadharNumber`, `photoUrl`, `status`, `customData`, parent fields |
| **Admission Applications** | `StudentManagement.jsx` (Tab 2) | Read / Write | Review applications, Approve (creates Student), Reject | `studentName`, `dob`, `targetClassId`, `parentName`, `parentPhone`, `parentEmail`, `assignedAdmissionNumber` |
| **Parent Portal (My Children)** | [`src/pages/Parent/MyChildren.jsx`](file:///c:/Projects/SMS/src/pages/Parent/MyChildren.jsx) | Read / Write | View linked children, Link enrolled student by `admissionNumber` + `dob`, Unlink student, Switch active child | `admissionNumber`, `dob`, `studentId`, `classId`, `name` |
| **Teacher Class Roster** | [`src/pages/Teacher/ClassRoster.jsx`](file:///c:/Projects/SMS/src/pages/Teacher/ClassRoster.jsx) | Read | View class roster, student demographics, parent contact | `studentId`, `firstName`, `lastName`, `rollNumber`, `parentPhone` |
| **Attendance Marking** | `src/pages/Admin/Attendance.jsx`, `src/pages/Teacher/Attendance.jsx` | Read / Write | Record daily attendance per student | `studentId`, `classId`, `sectionId`, `status`, `date` |
| **Fee Collection & Invoicing** | `src/pages/Admin/FeeManagement.jsx`, `src/pages/Parent/Fees.jsx` | Read / Write | Generate invoices, record payments, view fee ledger | `studentId`, `classId`, `invoiceId`, `amount`, `status` |
| **Grades & Report Cards** | `src/pages/Teacher/Grades.jsx`, `src/pages/Parent/Grades.jsx` | Read / Write | Record marks, calculate GPA, publish report cards | `studentId`, `assessmentId`, `marksObtained`, `grade` |
| **Homework Management** | `src/pages/Teacher/HomeworkManagement.jsx`, `src/pages/Parent/HomeworkOverview.jsx` | Read / Write | Homework submissions and grading | `studentId`, `homeworkId`, `submissionUrl`, `status` |
| **Transport Management** | `src/pages/Admin/TransportManagement.jsx`, `src/pages/Teacher/TransportDetails.jsx` | Read / Write | Assign student to bus route and pickup stop | `studentId`, `transportRouteId`, `pickupStopId` |
| **Library Management** | `src/pages/Admin/LibraryManagement.jsx` | Read / Write | Issue books to students, track returns | `studentId`, `bookId`, `issueDate`, `returnDate` |
| **PTM Appointments** | `src/pages/Teacher/PTMScheduler.jsx`, `src/pages/Parent/PTM.jsx` | Read / Write | Schedule parent-teacher conferences | `studentId`, `teacherId`, `date`, `timeSlot`, `status` |
| **Parent-Teacher Chat** | `src/pages/Teacher/Chat.jsx`, `src/pages/Parent/Chat.jsx` | Read / Write | Direct messaging between teacher and parent regarding student | `studentId`, `teacherId`, `chatRoomId`, `messages` |

---

## 10. Dependency Graph

```
Student (Parent Entity)
 ├── Class (N:1, SetNull)
 ├── Section (N:1, SetNull)
 ├── TransportRoute (N:1, SetNull)
 ├── RouteStop (N:1, SetNull)
 ├── ParentStudentLink (1:N, ON DELETE CASCADE)
 │    └── ParentProfile (N:1)
 │         └── User (1:1)
 ├── AttendanceRecord (1:N, ON DELETE CASCADE)
 ├── AttendanceStat (1:N, ON DELETE CASCADE)
 ├── AbsenteeFlag (1:N, ON DELETE CASCADE)
 ├── AssessmentGrade (1:N, ON DELETE CASCADE)
 ├── ReportCard (1:N, ON DELETE CASCADE)
 ├── HomeworkSubmission (1:N, ON DELETE CASCADE)
 ├── Invoice (1:N, ON DELETE SET NULL)
 ├── LibraryBookIssue (1:N, ON DELETE RESTRICT)
 ├── ChatRoom (1:N, ON DELETE CASCADE)
 ├── PtmAppointment (1:N, ON DELETE CASCADE)
 └── CanteenRequest (1:N, ON DELETE CASCADE)
```

---

## 11. Delete / Update Safety Audit

### Classification of Downstream Dependencies:

| Child Model | Actual DB Action | Deletion Impact | Classification |
|---|---|---|---|
| **`Invoice`** | `ON DELETE SET NULL` | Leaves unattached financial transactions; audit trail corrupted | **A (Must Block Deletion if invoices exist)** |
| **`AttendanceRecord` / `Stat`** | `ON DELETE CASCADE` | Statutory attendance records destroyed | **A (Must Block Deletion if records exist)** |
| **`AssessmentGrade` / `ReportCard`**| `ON DELETE CASCADE` | Academic history permanently destroyed | **A (Must Block Deletion if grades exist)** |
| **`LibraryBookIssue`** | `ON DELETE RESTRICT` | PostgreSQL will actively reject delete if book issues exist | **A (Must Block Deletion)** |
| **`HomeworkSubmission`** | `ON DELETE CASCADE` | Homework history destroyed | **A (Must Block Deletion)** |
| **`ParentStudentLink`** | `ON DELETE CASCADE` | Removes link; ParentProfile and User remain intact | **B (Safely Cascade on Link only)** |
| **`ChatRoom` / `PTM` / `Canteen`** | `ON DELETE CASCADE` | Communication logs destroyed | **A (Must Block Deletion if active records exist)** |

### Deletion Policy Conclusion:
1. **Primary Mechanism:** **Status Transition** (`PATCH /api/v1/students/:id` with `{ status: 'Inactive' | 'Transferred' | 'Graduated' | 'Alumni' }`).
2. **Hard Deletion (`DELETE /api/v1/students/:id`):** Only permitted if the student has **zero dependent records** across all 12 modules. If any dependencies exist, returns `409 Conflict` (`DEPENDENCY_CONFLICT`).

---

## 12. Concurrency Analysis

To prevent the race condition identified in Phase 4C.2-B (where concurrent child record inserts occur between dependency counting and deletion under `READ COMMITTED`), Student deletion and Parent unlinking must enforce:

### Concurrency Model for `DELETE /api/v1/students/:id`:
```sql
BEGIN;
-- 1. Explicit row lock on Student
SELECT id FROM "students"
WHERE "school_id" = $1::uuid AND "id" = $2::uuid
FOR UPDATE;

-- 2. Count dependencies while holding lock
SELECT COUNT(*) FROM "invoices" WHERE "school_id" = $1 AND "student_id" = $2;
SELECT COUNT(*) FROM "attendance_records" WHERE "school_id" = $1 AND "student_id" = $2;
SELECT COUNT(*) FROM "assessment_grades" WHERE "school_id" = $1 AND "student_id" = $2;
SELECT COUNT(*) FROM "library_book_issues" WHERE "school_id" = $1 AND "student_id" = $2;
-- (If any count > 0 -> ROLLBACK & throw ConflictError)

-- 3. Delete student (cascades only to ParentStudentLink)
DELETE FROM "students" WHERE "school_id" = $1 AND "id" = $2;
COMMIT;
```

---

## 13. Tenant Isolation Audit

1. **All queries MUST be tenant-scoped:** `where: { schoolId: req.tenant.schoolId }`.
2. **Cross-Tenant Linking Protection:** When linking a Parent to a Student (`POST /api/v1/students/:id/parents`), both the `studentId` and `parentProfileId` must be verified to belong to `req.tenant.schoolId`.
3. **Cross-Tenant Entity Access:** Attempting to fetch or update a Student/Parent belonging to another school returns `404 Not Found`.
4. **SuperAdmin Tenant Switching:** Fully supported via `X-Tenant-Id` header through [`tenantContext`](file:///c:/Projects/SMS/backend/src/middleware/tenant.middleware.js).

---

## 14. RBAC Audit

- Canonical Module Key: `'students'` in [`backend/src/modules/rbac/rbac.constants.js`](file:///c:/Projects/SMS/backend/src/modules/rbac/rbac.constants.js).
- Permissions Mapping:
  - `students.read`: `GET /api/v1/students`, `GET /api/v1/students/:id`, `GET /api/v1/students/:id/parents`, `GET /api/v1/parents`, `GET /api/v1/parents/:id`
  - `students.create`: `POST /api/v1/students`, `POST /api/v1/students/:id/parents`, `POST /api/v1/parents`
  - `students.edit`: `PATCH /api/v1/students/:id`, `PATCH /api/v1/parents/:id`, `PATCH /api/v1/students/:id/class`
  - `students.delete`: `DELETE /api/v1/students/:id`, `DELETE /api/v1/students/:id/parents/:parentId`
- **Parent Portal Self-Access:**
  - `GET /api/v1/parents/me/children`: Permitted for any authenticated user with `systemRole === 'PARENT'` (scoped to their own `userId` $\rightarrow$ `ParentProfile` $\rightarrow$ `ParentStudentLink`).

---

## 15. Validation Requirements

### Student Schemas (Zod):
- `admissionNumber`: String, required, trimmed, 1–100 characters.
- `firstName`: String, required, trimmed, 1–100 characters.
- `lastName`: String, optional/nullable, trimmed, 1–100 characters.
- `dob`: String, optional/nullable, format `YYYY-MM-DD`.
- `gender`: Enum (`'Male'`, `'Female'`, `'Other'`), optional.
- `bloodGroup`: String, optional/nullable, max 10 chars (`A+`, `A-`, `B+`, `B-`, `O+`, `O-`, `AB+`, `AB-`, `B+Ve`).
- `aadhaarNumber`: String, optional/nullable, 12 numeric digits.
- `classId`: UUID, optional/nullable.
- `sectionId`: UUID, optional/nullable (must belong to `classId`).
- `status`: Enum (`'Active'`, `'Inactive'`, `'Transferred'`, `'Graduated'`, `'Alumni'`), default `'Active'`.
- `customData`: Object/JSON, optional.

### Parent Schemas (Zod):
- `name`: String, required, trimmed, 1–200 characters.
- `phone`: String, optional/nullable, format `^\+?[1-9]\d{1,14}$`.
- `email`: String, optional/nullable, valid email format.
- `relationship`: String, optional, e.g. `'Father'`, `'Mother'`, `'Guardian'`, `'Parent'`.

---

## 16. Media & Documents

- **Student Photos:** Uploaded to Cloudinary (`uploadFileToCloudinaryOrFirebase`) or Firebase Storage path: `{schoolName}/Students/{studentName}/photo_{filename}`.
- **Backend Responsibility:** Accepts validated `photoUrl` in request payload and stores text URL in `Student.photoUrl`.
- **Identity & Documents:** Certificates and Aadhaar images stored in `customData` as JSON document references.

---

## 17. Bulk Import & Export

1. **Frontend Export:** Handled on the client using `xlsx` (`XLSX.utils.json_to_sheet`). Backend pagination `GET /api/v1/students?limit=100` supports multi-page export streaming.
2. **Bulk Import:** Should be implemented as a dedicated endpoint (`POST /api/v1/students/bulk-import`) in a subsequent batch after core CRUD is verified.

---

## 18. Existing Migrated Data Audit (Live Database)

| School Identifier | UUID | Students | ParentProfiles | ParentStudentLinks | Invoices | Status |
|---|---|---|---|---|---|---|
| **SchoolS024** | `25e9637a-7fa4-4ac2-b43d-b4c0edcf2932` | **340** | **328** | **340** | **99** | Verified Intact |
| **SchoolS015** | `e2638de0-cf88-4cef-96db-74c353c6e43d` | **375** | **317** | **375** | **0** | Verified Intact |
| **SchoolS019** | `4e2c7fdf-46c1-4bc7-927f-e3382e8c579d` | **0** | **0** | **0** | **0** | Zero Records |
| **SYSTEM_TEMPLATE** | `86e6e8b1-f3be-44fb-9759-268027ec2802` | **0** | **0** | **0** | **0** | Zero Records |

- **Multi-Child Parents:** In SchoolS024, 328 parents represent 340 students (12 sibling links). In SchoolS015, 317 parents represent 375 students (58 sibling links).
- **MigrationIdMap Entries:** S024 has 340 student map records; S015 has 375 student map records.

---

## 19. Migration Mappings

- `MigrationIdMap`:
  - `collectionName = 'students'`: Maps Firestore `studentId` $\rightarrow$ PostgreSQL `Student.id`.
  - Legacy Firestore IDs are preserved in `Student.legacyFirestoreId` and indexed.
- Backend implementation MUST NOT alter or overwrite `MigrationIdMap` records.

---

## 20. Existing vs Proposed APIs

### Proposed API Surface (Batch 4C.3-A):

| Method | Route | Permission | Description |
|---|---|---|---|
| `GET` | `/api/v1/students` | `students.read` | List students with search, class/section filter, status filter, pagination |
| `GET` | `/api/v1/students/:id` | `students.read` | Get student details by ID (including class, section, parents) |
| `POST` | `/api/v1/students` | `students.create` | Register new student with optional embedded parent creation & atomic linking |
| `PATCH` | `/api/v1/students/:id` | `students.edit` | Update student demographic, status, or academic details |
| `DELETE` | `/api/v1/students/:id` | `students.delete` | Concurrency-safe dependency-guarded deletion (0 dependencies only) |
| `GET` | `/api/v1/students/:id/parents` | `students.read` | List parents linked to a student |
| `POST` | `/api/v1/students/:id/parents` | `students.create` | Link an existing or new parent to a student |
| `DELETE` | `/api/v1/students/:id/parents/:parentId` | `students.delete` | Unlink a parent from a student (`ParentStudentLink` deletion) |
| `GET` | `/api/v1/parents` | `students.read` | List parent profiles within tenant |
| `GET` | `/api/v1/parents/:id` | `students.read` | Get parent profile and linked children |
| `PATCH` | `/api/v1/parents/:id` | `students.edit` | Update parent profile details |
| `GET` | `/api/v1/parents/me/children` | Authenticated Parent | Get children linked to the currently logged-in parent |

---

## 21. Audit Logging

Canonical AuditLog actions:
- `CREATE_STUDENT`: Logs created student snapshot and linked parent IDs.
- `UPDATE_STUDENT`: Logs field-level deltas (`{ status: { old: 'Active', new: 'Transferred' } }`).
- `DELETE_STUDENT`: Logs deleted student snapshot.
- `LINK_PARENT_STUDENT`: Logs parent-student link establishment.
- `UNLINK_PARENT_STUDENT`: Logs parent-student unlink event.
- `UPDATE_PARENT`: Logs parent profile changes.

---

## 22. Realtime Requirements

- Legacy Frontend used Firestore `subscribeToSubCollection(schoolId, 'students')`.
- For Phase 5 frontend migration, standard REST query caching via **TanStack React Query** (with invalidation on mutations) is completely sufficient. No WebSocket/SSE infrastructure is required for standard student directory operations.

---

## 23. Security Findings

| Finding | Severity | Analysis | Mitigation |
|---|---|---|---|
| **Cross-Tenant Admission Number Collision** | `LOW` (Handled) | Two schools can use admission number `"101"` without conflict. | Schema has `@@unique([schoolId, admissionNumber])`. |
| **Admission Number Spoofing** | `MEDIUM` | User might try to query another school's student. | Repository strictly enforces `where: { schoolId, admissionNumber }`. |
| **Parent IDOR** | `HIGH` | Parent attempting to access records of non-linked student. | `/parents/me/children` strictly derives student IDs from authenticated `userId` join. |
| **Cross-Tenant Parent Linking** | `HIGH` | Admin in School A attempting to link a Parent from School B. | Service validates that both `Student.schoolId` and `ParentProfile.schoolId` match `req.tenant.schoolId`. |
| **Accidental Cascade Deletion** | `CRITICAL` | Hard delete destroying invoices/grades. | Interactive transaction with `FOR UPDATE` lock blocking deletion when dependencies exist. |

---

## 24. Design Decisions

1. **Admission Number Uniqueness:** Enforced at tenant level (`@@unique([schoolId, admissionNumber])`).
2. **Student Lifecycle Management:** Status transitions (`Active`, `Inactive`, `Transferred`, `Graduated`, `Alumni`) are the standard operational path.
3. **Hard Deletion:** Blocked if any academic, financial, or attendance dependencies exist.
4. **Parent-Student Decoupling:** `ParentProfile` is not deleted when unlinked from a student; only the `ParentStudentLink` record is deleted.
5. **Class & Section Reassignment:** Reassignment is executed via `PATCH /api/v1/students/:id` validating that `sectionId` belongs to `classId` within the same tenant.

---

## 25. Open Questions Answered

1. **Should Student DELETE exist?** Yes, but strictly restricted to zero-dependency records (drafts/accidental entries).
2. **Can a parent have multiple students?** Yes, via multiple `ParentStudentLink` records.
3. **Can a student have multiple parents?** Yes (e.g. Father, Mother, Guardian).
4. **Is ParentProfile always backed by User?** Yes, 1:1 relation with `users` table.
5. **Can class/section be null?** Yes (`classId` and `sectionId` are nullable in schema, e.g. newly admitted students pending class allocation).

---

## 26. Implementation Dependencies

- Existing Classes domain (`class.repository.js`) for validating class and section references.
- Existing Auth domain (`auth.repository.js`, `password.service.js`) for managing Parent `User` records.
- Existing RBAC domain (`rbac.middleware.js`) for checking `students.*` permissions.
- Canonical Audit domain (`audit.repository.js`).

---

## 27. Recommended Implementation Sequence

1. **Batch 4C.3-A:** Core Student CRUD & Schemas (`students.routes.js`, `students.controller.js`, `students.service.js`, `students.repository.js`).
2. **Batch 4C.3-B:** Parent Management & Parent-Student Linking APIs (`parents.routes.js`, `parent-link.service.js`, `parents.repository.js`).
3. **Batch 4C.3-C:** Dependency-Guarded Deletion with `FOR UPDATE` Concurrency Protection & AuditLog Integration.
4. **Batch 4C.3-D:** Comprehensive Unit, Integration, Security, and Concurrency Test Suites.

---

---

## 29. Targeted Pre-Implementation Corrections

### 29.1 Complete Student Dependency Matrix

Verified against PostgreSQL migration SQL ([`backend/prisma/migrations/20260908000000_init_multi_tenant_schema/migration.sql`](file:///c:/Projects/SMS/backend/prisma/migrations/20260908000000_init_multi_tenant_schema/migration.sql) & [`20260908183000_make_invoice_student_id_nullable/migration.sql`](file:///c:/Projects/SMS/backend/prisma/migrations/20260908183000_make_invoice_student_id_nullable/migration.sql)):

| # | Child Model Table | Foreign Key Column(s) | Actual PostgreSQL Constraint Name | PostgreSQL ON DELETE Action | Must Block Hard Delete? | Business / Statutory Criticality | Concurrent Insert Race Protection |
|---|---|---|---|---|---|---|---|
| 1 | `invoices` | `("school_id", "student_id")` | `invoices_school_id_student_id_fkey` | **`SET NULL`** | **YES** | Financial audit ledger integrity | `FOR UPDATE` on `students` blocks `INSERT INTO invoices` (`FOR KEY SHARE`) |
| 2 | `attendance_records` | `("school_id", "student_id")` | `attendance_records_school_id_student_id_fkey` | **`CASCADE`** | **YES** | Statutory attendance history | `FOR UPDATE` on `students` blocks `INSERT INTO attendance_records` |
| 3 | `attendance_stats` | `("school_id", "student_id")` | `attendance_stats_school_id_student_id_fkey` | **`CASCADE`** | **YES** | Aggregated attendance stats | `FOR UPDATE` on `students` blocks `INSERT INTO attendance_stats` |
| 4 | `absentee_flags` | `("school_id", "student_id")` | `absentee_flags_school_id_student_id_fkey` | **`CASCADE`** | **YES** | Disciplinary/truancy tracking | `FOR UPDATE` on `students` blocks `INSERT INTO absentee_flags` |
| 5 | `assessment_grades` | `("school_id", "student_id")` | `assessment_grades_school_id_student_id_fkey` | **`CASCADE`** | **YES** | Historical exam marks/grades | `FOR UPDATE` on `students` blocks `INSERT INTO assessment_grades` |
| 6 | `report_cards` | `("school_id", "student_id")` | `report_cards_school_id_student_id_fkey` | **`CASCADE`** | **YES** | Official published transcripts | `FOR UPDATE` on `students` blocks `INSERT INTO report_cards` |
| 7 | `homework_submissions` | `("school_id", "student_id")` | `homework_submissions_school_id_student_id_fkey` | **`CASCADE`** | **YES** | Student homework deliverables | `FOR UPDATE` on `students` blocks `INSERT INTO homework_submissions` |
| 8 | `library_book_issues` | `("school_id", "student_id")` | `library_book_issues_school_id_student_id_fkey` | **`RESTRICT`** | **YES** | Physical school assets/inventory | `RESTRICT` at DB level + `FOR UPDATE` lock |
| 9 | `chat_rooms` | `("school_id", "student_id")` | `chat_rooms_school_id_student_id_fkey` | **`CASCADE`** | **YES** | Parent-teacher communication log | `FOR UPDATE` on `students` blocks `INSERT INTO chat_rooms` |
| 10 | `ptm_appointments` | `("school_id", "student_id")` | `ptm_appointments_school_id_student_id_fkey` | **`CASCADE`** | **YES** | Official parent-teacher meetings | `FOR UPDATE` on `students` blocks `INSERT INTO ptm_appointments` |
| 11 | `canteen_requests` | `("school_id", "student_id")` | `canteen_requests_school_id_student_id_fkey` | **`CASCADE`** | **YES** | Canteen orders / billing trail | `FOR UPDATE` on `students` blocks `INSERT INTO canteen_requests` |
| 12 | `parent_student_links` | `("school_id", "student_id")` | `parent_student_links_school_id_student_id_fkey` | **`CASCADE`** | **NO** (Safe on draft delete) | Relational link to parent profile | `FOR UPDATE` on `students` blocks `INSERT INTO parent_student_links` |

---

### 29.2 Student Delete Concurrency Determination

#### Mathematical Locking Proof:
In PostgreSQL MVCC, when any child table inserts or updates a row with a foreign key referencing `students("school_id", "id")` or `students("id")`, PostgreSQL's internal referential integrity engine obtains a **`FOR KEY SHARE`** row lock on the referenced row in `"students"`.

Because **`FOR UPDATE`** and **`FOR KEY SHARE`** are **mutually exclusive (conflicting) locks**:
1. When `deleteStudent` begins:
   ```sql
   SELECT id FROM "students"
   WHERE "school_id" = $1::uuid AND "id" = $2::uuid
   FOR UPDATE;
   ```
2. Any racing concurrent transaction attempting to insert into `invoices`, `attendance_records`, `assessment_grades`, `homework_submissions`, `library_book_issues`, `chat_rooms`, `ptm_appointments`, `canteen_requests`, or `parent_student_links` is **BLOCKED** at its `INSERT` statement until the `deleteStudent` transaction commits or rolls back.
3. While holding the lock, `countStudentDependencies` checks counts across all models:
   - If any count $> 0$, the delete transaction aborts (`ROLLBACK`), releasing the `FOR UPDATE` lock. The blocked child `INSERT` unblocks and completes normally.
   - If count $== 0$, `DELETE FROM "students"` executes and commits. The blocked child `INSERT` unblocks, sees that the referenced parent row has been deleted, and fails with `23503 foreign_key_violation`, preventing any accidental cascade deletion or silent data loss.

---

### 29.3 Parent Data Destination Mapping

| Legacy Firestore Field (in `students/{id}`) | PostgreSQL Destination Table & Column | Transformation / Formatting | Preserved Status | Technical Rationale |
|---|---|---|---|---|
| `parentName` | `parent_profiles.name` | Trimmed string, max 200 chars | **PRESERVED** | First-class column in `ParentProfile` |
| `parentPhone` | `parent_profiles.phone` | Validated phone string (E.164 / Indian) | **PRESERVED** | First-class column in `ParentProfile` |
| `parentEmail` | `parent_profiles.email` & `users.email` | Trimmed lowercase email string | **PRESERVED** | First-class column in `ParentProfile` & `User` |
| `parentRelationship` | `parent_student_links.relationship` | e.g. `'Father'`, `'Mother'`, `'Guardian'` | **PRESERVED** | First-class column in `ParentStudentLink` |
| `emergencyContact` | `parent_profiles.emergency_contact` | Trimmed phone string, max 20 chars | **PRESERVED** | First-class column in `ParentProfile` |
| `homeAddress` | `parent_profiles.address` | Consolidated residential address text | **PRESERVED** | First-class column in `ParentProfile` |
| `parentOccupation` | `students.custom_data.parentOccupation` | String under `customData.parentOccupation` | **PRESERVED** | No column in `ParentProfile`; preserved in `Student.customData` |
| `annualIncome` | `students.custom_data.annualIncome` | String under `customData.annualIncome` | **PRESERVED** | No column in `ParentProfile`; preserved in `Student.customData` |
| `city` | `students.custom_data.address.city` | Sub-object under `customData.address.city` | **PRESERVED** | Preserved in structured `customData` |
| `state` | `students.custom_data.address.state` | Sub-object under `customData.address.state` | **PRESERVED** | Preserved in structured `customData` |
| `pincode` | `students.custom_data.address.pincode` | Sub-object under `customData.address.pincode`| **PRESERVED** | Preserved in structured `customData` |

---

### 29.4 Parent User Creation Contract

When creating a new parent (either standalone via `POST /api/v1/parents` or atomically within `POST /api/v1/students`):
1. **Email Resolution:**
   - If client provides `email`: validate uniqueness in `users` table.
   - If client provides no email (phone-only guardian): generate deterministic institutional placeholder: `parent.<phone>_<randomHex>@<schoolCode>.parent.internal`.
2. **User Record Creation:**
   - `schoolId`: `req.tenant.schoolId`
   - `email`: Resolved email / placeholder
   - `systemRole`: `'PARENT'`
   - `passwordHash`: `!LOCKED_NO_PASSWORD_SET` (locked prefix prevents unauthenticated access until password setup)
   - `isActive`: `true`
   - `tokenVersion`: `1`
3. **ParentProfile Record Creation:**
   - `userId`: `user.id` (1:1 link)
   - `schoolId`: `req.tenant.schoolId`
   - `name`: `data.name`
   - `phone`: `data.phone || null`
   - `email`: `data.email || user.email`
   - `address`: `data.address || null`
   - `emergencyContact`: `data.emergencyContact || null`
4. **ParentStudentLink Creation:**
   - `parentProfileId`: `parentProfile.id`
   - `studentId`: `student.id`
   - `relationship`: `data.relationship || 'Guardian'`
5. **Existing Parent Reuse:**
   - If a parent with the same phone or email already exists in `schoolId`, the service reuses the existing `ParentProfile` and simply creates a new `ParentStudentLink` for the new student.

---

### 29.5 Migration ID Mapping Clarification

- **`Student` Mapping:**
  - `MigrationIdMap`: `{ schoolId, collectionName: 'students', firestoreId: <docId>, postgresId: <Student.id> }`.
  - Also recorded in `Student.legacyFirestoreId`.
- **`ParentProfile` & `User` Mapping:**
  - In Firestore, parents did not exist in an independent subcollection `schools/{id}/parents`. They were embedded inside student documents or in root `users/{uid}` with `role: 'parent'`.
  - During migration:
    - `ParentProfile` records were synthesized and deduplicated by parent phone/email.
    - If a corresponding `users/{uid}` document existed in Firestore, `MigrationIdMap` recorded `{ collectionName: 'users', firestoreId: <uid>, postgresId: <User.id> }`.
    - There are zero `MigrationIdMap` records for `collectionName = 'parents'` because no such subcollection existed.
- **`ParentStudentLink` Mapping:**
  - Generated relationally during migration to link the synthesized `ParentProfile` to the migrated `Student`.

---

### 29.6 Student Delete Policy

| Student Status | Hard Delete Allowed? | Policy Explanation |
|---|---|---|
| **Active** | **CONDITIONAL** | Allowed **ONLY** if all 11 dependency counts are zero (e.g. newly created draft or accidental registration). Blocked with `409 Conflict` if any academic/financial/attendance records exist. |
| **Inactive** | **NO** | Inactive students retain statutory attendance and fee payment ledgers. Deletion is blocked. |
| **Transferred** | **NO** | Transferred students retain complete transcript history for regulatory transfer certificates. |
| **Graduated** | **NO** | Graduated students retain official academic records for alumni verification. |
| **Alumni** | **NO** | Permanent historical institutional record. |

**Standard Student Exit Flow:** Update `Student.status` via `PATCH /api/v1/students/:id` with `{ status: 'Transferred' | 'Graduated' | 'Inactive' | 'Alumni' }`.

---

### 29.7 Parent Unlinking Semantics

- **Operation:** `DELETE /api/v1/students/:studentId/parents/:parentId`
- **What it does:** Deletes the specific `ParentStudentLink` record matching `(schoolId, studentId, parentProfileId)`.
- **Semantic Distinctions:**
  - **Unlink Parent (`DELETE /students/:id/parents/:parentId`):** Disassociates guardian from student. Does NOT delete `ParentProfile` or `User`.
  - **Disable Parent Login (`PATCH /parents/:id` with `{ isActive: false }`):** Sets `User.isActive = false` and increments `tokenVersion`, invalidating active refresh tokens.
  - **Delete Parent Profile:** Only permitted if the parent has **zero** remaining `ParentStudentLink` records.
  - **Delete User:** Handled when `ParentProfile` is deleted (cascades or cleans up linked user).

---

### 29.8 Parent Portal Authorization Rules

1. **Self-Access to Children (`GET /api/v1/parents/me/children`):**
   - Derived strictly from authenticated JWT: `req.user.id` $\rightarrow$ `ParentProfile.userId` $\rightarrow$ `ParentStudentLink` $\rightarrow$ `Student`.
   - Never trusts any client-supplied `parentId` or `schoolId`.
2. **Direct Student Access by Parent (`GET /api/v1/students/:id`):**
   - If requester has `systemRole === 'PARENT'`, the service validates that an active `ParentStudentLink` exists between `req.user.parentProfile.id` and `params.id`.
   - If not linked, returns `404 Not Found` (preventing student enumeration).

---

### 29.9 RBAC Contract & Endpoint Classification

| HTTP Method | Route | Permission Key | Status | Applicable Roles |
|---|---|---|---|---|
| `GET` | `/api/v1/students` | `students.read` | **PROPOSED** | SchoolAdmin, Principal, Teachers, Staff |
| `GET` | `/api/v1/students/:id` | `students.read` (or Parent Link) | **PROPOSED** | SchoolAdmin, Teachers, Linked Parent |
| `POST` | `/api/v1/students` | `students.create` | **PROPOSED** | SchoolAdmin, Administrative Officer |
| `PATCH` | `/api/v1/students/:id` | `students.edit` | **PROPOSED** | SchoolAdmin, Principal, Class Incharge |
| `DELETE` | `/api/v1/students/:id` | `students.delete` | **PROPOSED** | SchoolAdmin only (0 dependencies) |
| `GET` | `/api/v1/students/:id/parents` | `students.read` | **PROPOSED** | SchoolAdmin, Teachers |
| `POST` | `/api/v1/students/:id/parents` | `students.create` | **PROPOSED** | SchoolAdmin, Administrative Officer |
| `DELETE` | `/api/v1/students/:id/parents/:parentId`| `students.delete` | **PROPOSED** | SchoolAdmin |
| `GET` | `/api/v1/parents` | `students.read` | **PROPOSED** | SchoolAdmin, Staff |
| `GET` | `/api/v1/parents/:id` | `students.read` | **PROPOSED** | SchoolAdmin |
| `PATCH` | `/api/v1/parents/:id` | `students.edit` | **PROPOSED** | SchoolAdmin |
| `GET` | `/api/v1/parents/me/children` | Authenticated Session | **PROPOSED** | Parent (`systemRole: 'PARENT'`) |

---

### 29.10 Transaction Boundaries

The following operations MUST execute inside interactive transactions (`prisma.$transaction`):
1. **Student Registration with Embedded Parent:**
   `Student.create` + `User.create` (if new) + `ParentProfile.create` (if new) + `ParentStudentLink.create`.
2. **Parent Linking:**
   `ParentProfile.findFirst/create` + `ParentStudentLink.create`.
3. **Student Deletion:**
   `SELECT Student FOR UPDATE` + 11 dependency counts + `Student.delete`.
4. **Parent Unlink:**
   `ParentStudentLink.deleteMany({ where: { schoolId, studentId, parentProfileId } })`.
5. **Class/Section Reassignment:**
   Validate `Class` and `Section` exist in tenant + `Student.update`.

---

## 30. Final Readiness Classification

### **READY FOR IMPLEMENTATION**

All targeted architectural, concurrency, dependency, and parent user lifecycle requirements are completely resolved with verifiable evidence.

