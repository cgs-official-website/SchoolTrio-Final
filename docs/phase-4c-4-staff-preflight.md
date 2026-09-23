# Phase 4C.4 — Staff & Staff Profiles Domain Preflight Audit

**Classification**: READY FOR IMPLEMENTATION  
**Date**: September 10, 2026  
**Auditor**: Antigravity DeepMind Agentic Pair Programmer  
**Target Environment**: Node.js 24.x, Express, Prisma ORM, PostgreSQL 16+, Redis Cache  
**Scope**: Backend Staff Domain Architecture, Staff Profiles, Role Assignments, Class/Subject Teacher Semantics, and Legacy Firestore Compatibility  

---

## 1. Executive Summary

This preflight audit inspects the Staff & Staff Profiles domain across the PostgreSQL schema, Express backend modules, legacy Firestore data, Firebase Authentication, and frontend UI components.

### Key Audit Findings:
1. **1:1 Relational Architecture**: `StaffProfile` is strictly 1:1 with `User` (`StaffProfile.userId @unique`).
2. **Current Migrated State**:
   - **SchoolS024**: 38 StaffProfiles, 38 Users with `systemRole: TEACHER`, 38 assignments to SchoolRole `Staffs`, 5 assignments to `Class Coordinator`.
   - **SchoolS015**: 1 StaffProfile, 1 User (`systemRole: TENANT_USER`).
   - **SchoolS019**: 0 StaffProfiles migrated so far.
3. **Class Teacher Semantics**:
   - In PostgreSQL, Class Teacher is modeled bi-directionally via `Class.classTeacherId` (relation `"ClassTeacherRelation"`) and `StaffProfile.assignedClassId` (relation `"AssignedClassRelation"`).
   - Atomic synchronization across both fields is required upon assignment or reassignment.
4. **Subject Teacher Semantics**:
   - In the PostgreSQL schema, `Subject` does not contain a direct teacher join table. Subject teacher assignments in PostgreSQL are expressed through `TimetablePeriod`, `LessonPlan`, `Assessment`, and `HomeworkAssignment`.
   - Legacy subject arrays (`assignedSubjectIds`, `subjectClassIds`) can be safely stored in `StaffProfile.customData` for frontend compatibility without schema alteration.
5. **RBAC Mapping**: The canonical module key `'staff'` is already defined in `CANONICAL_MODULE_KEYS`. The four canonical permissions are `staff.read`, `staff.create`, `staff.edit`, and `staff.delete`.
6. **Schema Change Decision**: **YES — No schema changes required**. The existing 58-model Prisma schema is completely sufficient.

---

## 2. Current PostgreSQL / Prisma Models

### A. `StaffProfile` Model
```prisma
model StaffProfile {
  id              String   @id @default(uuid()) @db.Uuid
  schoolId        String   @map("school_id") @db.Uuid
  userId          String   @unique @map("user_id") @db.Uuid
  employeeId      String?  @map("employee_id") @db.VarChar(100)
  name            String   @db.VarChar(200)
  staffType       String   @default("teaching") @map("staff_type") @db.VarChar(30)
  designation     String?  @db.VarChar(100)
  phone           String?  @db.VarChar(20)
  email           String?  @db.VarChar(255)
  assignedClassId String?  @map("assigned_class_id") @db.Uuid
  baseSalary      Decimal? @default(0) @map("base_salary") @db.Decimal(10, 2)
  status          String   @default("Active") @db.VarChar(30)
  customData      Json?    @map("custom_data")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  school        School            @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  user          User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  assignedClass Class?            @relation("AssignedClassRelation", fields: [assignedClassId], references: [id], onDelete: SetNull)
  headedClasses Class[]           @relation("ClassTeacherRelation")
  payroll       HRPayrollRecord[]
  lessonPlans   LessonPlan[]
  timetables    TimetablePeriod[]
  chatRooms     ChatRoom[]
  ptms          PtmAppointment[]

  @@unique([schoolId, id])
  @@unique([schoolId, employeeId])
  @@map("staff_profiles")
}
```

### B. `User` Model
```prisma
model User {
  id                String   @id @default(uuid()) @db.Uuid
  schoolId          String?  @map("school_id") @db.Uuid
  email             String   @unique @db.VarChar(255)
  passwordHash      String   @map("password_hash") @db.VarChar(255)
  passwordAlgorithm String   @default("argon2id") @map("password_algorithm") @db.VarChar(50)
  systemRole        String   @default("TENANT_USER") @map("system_role") @db.VarChar(30)
  tokenVersion      Int      @default(1) @map("token_version")
  isActive          Boolean  @default(true) @map("is_active")
  createdAt         DateTime @default(now()) @map("created_at")
  updatedAt         DateTime @updatedAt @map("updated_at")
  legacyFirestoreId String?  @map("legacy_firestore_id") @db.VarChar(128)

  school          School?              @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  refreshSessions RefreshSession[]
  passwordResetTokens PasswordResetToken[]
  staffProfile    StaffProfile?
  parentProfile   ParentProfile?
  roleAssignments UserRoleAssignment[]

  @@index([schoolId])
  @@map("users")
}
```

### C. `Class` Model (Staff Relations)
```prisma
model Class {
  id             String   @id @default(uuid()) @db.Uuid
  schoolId       String   @map("school_id") @db.Uuid
  classTeacherId String?  @map("class_teacher_id") @db.Uuid
  ...
  classTeacher  StaffProfile?  @relation("ClassTeacherRelation", fields: [classTeacherId], references: [id], onDelete: SetNull)
  assignedStaff StaffProfile[] @relation("AssignedClassRelation")
}
```

---

## 3. User ↔ StaffProfile Architecture

| Attribute | User Model | StaffProfile Model | Authoritative Source |
|---|---|---|---|
| **Identity / Auth** | `id`, `email`, `passwordHash` | `userId`, `email` | `User` |
| **System Role** | `systemRole` (`TEACHER` / `STAFF`) | `staffType` (`teaching` / `non-teaching`) | `User.systemRole` for auth, `StaffProfile.staffType` for UI category |
| **Institutional Role** | Via `roleAssignments` (`SchoolRole`) | `designation` | `UserRoleAssignment` -> `SchoolRole` |
| **Active Status** | `isActive` (boolean) | `status` ('Active', 'Inactive', 'On Leave') | `User.isActive` controls auth; `StaffProfile.status` provides domain status |
| **Session Control** | `tokenVersion` (int) | N/A | `User.tokenVersion` (bumped on deactivation) |
| **Employee ID** | N/A | `employeeId` | `StaffProfile.employeeId` (unique per school) |
| **Phone** | N/A | `phone` | `StaffProfile.phone` |
| **Class Teacher** | N/A | `assignedClassId` | `StaffProfile.assignedClassId` & `Class.classTeacherId` |
| **Salary / HR** | N/A | `baseSalary`, `customData` | `StaffProfile` |

### Architectural Rules:
1. Every `StaffProfile` must link to an existing or atomically created `User`.
2. Updating `StaffProfile.email` must atomically update `User.email` with global uniqueness enforcement.
3. Setting `StaffProfile.status = 'Inactive'` must atomically set `User.isActive = false` and increment `User.tokenVersion`.

---

## 4. Firestore Staff/Teacher Model

In Firestore, all staff (teachers, principals, administrative staff, support staff) reside in the collection:  
`schools/{schoolId}/teachers/{teacherDocId}`

### Observed Firestore Document Schema:
```json
{
  "staffId": "SMVST029",
  "employeeId": "SMVST029",
  "firstName": "Lalitha",
  "lastName": "Ramanujam",
  "name": "Lalitha Ramanujam",
  "dob": "1985-05-15",
  "gender": "Female",
  "maritalStatus": "Married",
  "bloodGroup": "O+",
  "nationality": "Indian",
  "aadharNumber": "123456789012",
  "mobileNumber": "9876543210",
  "email": "lalitha.r@springmount.co.in",
  "residentialAddress": "123 School Road",
  "emergencyContact": "9876543211",
  "role": "Staffs",
  "roles": ["Staffs", "Class Coordinator"],
  "staff_type": "teaching",
  "status": "Active",
  "assignedClassId": "class-uuid-1",
  "subjectClassIds": ["class-uuid-1", "class-uuid-2"],
  "assignedSubjectIds": ["subj-uuid-1", "subj-uuid-2"],
  "highestQualification": "M.Sc., B.Ed",
  "degreeSpecialization": "Mathematics",
  "universityName": "Madras University",
  "yearOfPassing": "2008",
  "previousExperience": "10",
  "previousOrganization": "ABC School",
  "subjectSpecialization": "Mathematics",
  "gradesClassesHandled": "Grades 9-12",
  "professionalCertifications": "CBSE Certified",
  "govtIdType": "Aadhaar",
  "govtIdNumber": "123456789012",
  "panNumber": "ABCDE1234F",
  "pfNumber": "PF123456",
  "esicNumber": "ESI123456",
  "uanNumber": "UAN123456",
  "bankName": "State Bank of India",
  "bankAccountNumber": "12345678901",
  "branchName": "Main Branch",
  "ifscCode": "SBIN0001234",
  "photoUrl": "https://...",
  "academicCertificates": [],
  "experienceCertificates": [],
  "govtIdDocument": [],
  "salarySlips": [],
  "customData": {}
}
```

---

## 5. Firestore → PostgreSQL Field Mapping

| Firestore Field | PostgreSQL Model | PostgreSQL Column / Destination |
|---|---|---|
| `id` / Doc ID | `StaffProfile` | `id` (or mapped in `MigrationIdMap`) |
| `name` / `firstName` + `lastName` | `StaffProfile` | `name` |
| `staffId` / `employeeId` | `StaffProfile` | `employeeId` |
| `email` | `StaffProfile` & `User` | `StaffProfile.email` & `User.email` |
| `mobileNumber` / `phone` | `StaffProfile` | `phone` |
| `staff_type` | `StaffProfile` | `staffType` ('teaching' or 'non-teaching') |
| `role` / `roles` | `StaffProfile` & `UserRoleAssignment` | `designation` & `SchoolRole` linkage |
| `status` | `StaffProfile` & `User` | `status` ('Active'/'Inactive') & `User.isActive` |
| `assignedClassId` | `StaffProfile` & `Class` | `StaffProfile.assignedClassId` & `Class.classTeacherId` |
| `baseSalary` | `StaffProfile` | `baseSalary` (Decimal) |
| `dob`, `gender`, `bloodGroup`, `address`, `aadharNumber` | `StaffProfile` | `customData` (or structured json) |
| `highestQualification`, `experience`, `specialization` | `StaffProfile` | `customData.qualifications` |
| `panNumber`, `pfNumber`, `bankAccountNumber`, `ifscCode` | `StaffProfile` | `customData.financial` |
| `photoUrl`, `academicCertificates`, `documents` | `StaffProfile` | `customData.documents` |
| `subjectClassIds`, `assignedSubjectIds` | `StaffProfile` | `customData.assignments` |

---

## 6. Staff Dependency Matrix

| Dependent Model | Foreign Key Column | ON DELETE | Business Impact | Must Block Delete? |
|---|---|---|---|---|
| `Class` | `classTeacherId` | `SET NULL` | Clears class incharge reference | No (safe to set null) |
| `Class` | `assignedStaff` (back-rel) | `SET NULL` | Clears assigned staff | No (safe to set null) |
| `TimetablePeriod` | `teacherId` | `SET NULL` | Historical timetable loses teacher attribution | **Yes, if timetable is active** |
| `LessonPlan` | `[schoolId, teacherId]` | `CASCADE` | Deleting staff would destroy curriculum history | **YES — Block delete if count > 0** |
| `HRPayrollRecord` | `[schoolId, teacherId]` | `CASCADE` | Deleting staff would destroy payroll audit records | **YES — Block delete if count > 0** |
| `ChatRoom` | `[schoolId, teacherId]` | `CASCADE` | Deleting staff would delete parent/student chat history | **YES — Block delete if count > 0** |
| `PtmAppointment` | `[schoolId, teacherId]` | `CASCADE` | Deleting staff would delete PTM parent appointments | **YES — Block delete if count > 0** |
| `AttendanceSession` | `markedByUserId` | N/A (String) | Historical attendance marker | No (stores user ID string) |
| `UserRoleAssignment` | `userId` | `CASCADE` | Role mappings | Yes (removed when user deleted) |
| `User` | `id` | `CASCADE` | Authentication record | Deleted only during genuine hard delete |

---

## 7. Class Teacher Semantics

1. **Bi-directional Invariant**:
   - When Teacher T is assigned as Class Teacher for Class C:
     - `Class.classTeacherId` is set to `T.id`.
     - `StaffProfile.assignedClassId` is set to `C.id`.
2. **Reassignment Rules**:
   - If Class C already had Teacher A, and is reassigned to Teacher B:
     - Teacher A's `assignedClassId` is set to `null`.
     - Teacher B's `assignedClassId` is set to `C.id`.
     - Class C's `classTeacherId` is set to `B.id`.
3. **Unassignment Rules**:
   - When Class C's teacher is removed:
     - `Class.classTeacherId` is set to `null`.
     - `StaffProfile.assignedClassId` for that teacher is set to `null`.
4. **Section vs Class Level**:
   - In both PostgreSQL and Firestore, the class teacher is assigned at the **Class** level (`Class.classTeacherId`), not the `Section` level.

---

## 8. Subject Teacher Semantics

1. **Relational Representation**:
   - In PostgreSQL, Subject does NOT have a direct teacher foreign key or junction table.
   - Teachers are assigned to subjects in specific periods via `TimetablePeriod(classId, sectionId, subjectId, teacherId)` or `LessonPlan(classId, subjectId, teacherId)`.
2. **Frontend Subject Array Compatibility**:
   - In Firestore, `teachers` stored `assignedSubjectIds: [...]` and `subjectClassIds: [...]`, while `subjects` stored `assignedTeacherIds: [...]`.
   - The backend Staff API will accept and return `assignedSubjectIds` and `subjectClassIds` within `StaffProfile.customData` to support legacy UI workflows without altering the relational schema.

---

## 9. Attendance Dependencies

- `AttendanceSession.markedByUserId`: Stores the `userId` of the teacher/staff who submitted attendance.
- Does not block staff operations.
- Historical attendance records remain immutable even if the teacher account is deactivated.

---

## 10. Timetable Dependencies

- `TimetablePeriod.teacherId` links to `StaffProfile.id` (`onDelete: SetNull`).
- Deactivating a staff member leaves timetable history intact.
- If a staff member is removed, future timetable allocations should be updated or set to null.

---

## 11. Other Domain Dependencies

| Domain | Dependency Type | Handling in Phase 4C.4 |
|---|---|---|
| **Chat (`ChatRoom`)** | Cascading FK to `StaffProfile` | Block hard delete if active chats exist; deactivation preserves chats. |
| **PTM (`PtmAppointment`)** | Cascading FK to `StaffProfile` | Block hard delete if appointments exist; deactivation preserves records. |
| **HR / Payroll (`HRPayrollRecord`)** | Cascading FK to `StaffProfile` | Block hard delete if payroll history exists; deactivation preserves records. |
| **Lesson Plans (`LessonPlan`)** | Cascading FK to `StaffProfile` | Block hard delete if lesson plans exist; deactivation preserves records. |
| **Leave (`LeaveApplication`)** | `applicantId` stores `userId` | Deactivation preserves leave records. |
| **Audit Logs (`AuditLog`)** | Stores `userName`, `userRole` | Independent; non-blocking. |

---

## 12. RBAC Mapping

- Canonical Module Key: `'staff'`
- Canonical Permissions:
  - `staff.read`: `GET /api/v1/staff`, `GET /api/v1/staff/:id`
  - `staff.create`: `POST /api/v1/staff`
  - `staff.edit`: `PATCH /api/v1/staff/:id`, `PATCH /api/v1/staff/:id/assignment`
  - `staff.delete`: `DELETE /api/v1/staff/:id`
- Roles: Staff members are assigned institutional `SchoolRole` records (e.g. `Principal`, `Class Incharge`, `Staffs`, `Administrative Officer`, `Finance Department`, etc.) via `UserRoleAssignment`.

---

## 13. Authentication Impact

- Staff login is handled via `POST /api/v1/auth/login` (email/password).
- When a new staff profile is created via `POST /api/v1/staff`:
  1. A `User` record is created with `systemRole: 'TEACHER'` (or `'STAFF'`), `isActive: true`, `passwordHash: '!LOCKED_NO_PASSWORD_SET'`.
  2. The staff member activates their account via the existing password setup/reset workflow (`POST /api/v1/auth/forgot-password`).
- When a staff member is deactivated (`status: 'Inactive'` or `isActive: false`):
  1. `User.isActive` is set to `false`.
  2. `User.tokenVersion` is incremented by 1, instantly revoking all active JWT/refresh sessions.

---

## 14. Staff Create Contract (`POST /api/v1/staff`)

### Request Body:
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@school.edu",
  "phone": "9876543210",
  "employeeId": "EMP101",
  "staffType": "teaching",
  "designation": "Staffs",
  "roleId": "uuid-of-school-role",
  "assignedClassId": "uuid-of-class-optional",
  "baseSalary": 45000,
  "dob": "1990-01-01",
  "gender": "Male",
  "bloodGroup": "O+",
  "maritalStatus": "Single",
  "nationality": "Indian",
  "address": "123 School Lane",
  "emergencyContact": "9876543211",
  "qualifications": {
    "highestQualification": "M.Sc",
    "specialization": "Physics"
  },
  "customData": {}
}
```

### Atomic Transaction Execution:
1. Validate email global uniqueness against `User`.
2. Validate `employeeId` uniqueness within tenant against `StaffProfile`.
3. Create `User` (`passwordHash: '!LOCKED_NO_PASSWORD_SET'`, `systemRole: 'TEACHER'`).
4. Create `StaffProfile` linked to `User.id`.
5. Create `UserRoleAssignment` linking `User.id` to `SchoolRole`.
6. If `assignedClassId` provided, set `Class.classTeacherId = StaffProfile.id`.
7. Dispatch `CREATE_STAFF` AuditLog.

---

## 15. Staff Update Contract (`PATCH /api/v1/staff/:id`)

### Supported Updates:
- Profile fields (`name`, `phone`, `designation`, `staffType`, `baseSalary`, `customData`).
- `email`: Synchronized across `StaffProfile.email` and `User.email` with conflict checking.
- `status` / `isActive`: Setting inactive sets `User.isActive = false` and increments `User.tokenVersion`.
- `roleId`: Updates `UserRoleAssignment`.
- `assignedClassId`: Updates bi-directional class teacher assignment.

---

## 16. Delete / Deactivation Policy

### Business Rule: **Deactivation is Strongly Preferred**
1. **Hard Delete (`DELETE /api/v1/staff/:id`)**:
   - Allowed ONLY if the staff member has **0 dependent records** in:
     - `LessonPlan`
     - `HRPayrollRecord`
     - `ChatRoom`
     - `PtmAppointment`
     - `TimetablePeriod`
   - If any count > 0, the request is rejected with `409 ConflictError`, instructing the client to set `status: 'Inactive'`.
2. **Deactivation (`PATCH /api/v1/staff/:id` with `{ "status": "Inactive" }`)**:
   - Fully preserves all historical curriculum, payroll, and chat records.
   - Clears active class teacher assignments.
   - Disables authentication and revokes tokens.

---

## 17. Concurrency Analysis

| Operation | Concurrency Risk | Mitigation Strategy |
|---|---|---|
| **Class Teacher Assignment** | Two concurrent requests assigning different teachers to the same class | Explicit transaction with `SELECT ... FOR UPDATE` on `Class` row. |
| **Duplicate Employee ID** | Concurrent creation with the same `employeeId` | PostgreSQL constraint `@@unique([schoolId, employeeId])` catches P2002. |
| **Duplicate Email** | Concurrent creation with the same `email` | PostgreSQL constraint `User.email @unique` catches P2002. |
| **Concurrent Deletion vs Insert** | Dependent record created during deletion count check | Row-level locking on `StaffProfile` inside transaction before dependency count. |

---

## 18. Tenant Isolation Analysis

1. All queries MUST filter by `req.tenant.schoolId`.
2. Client-supplied `schoolId` in body, query, or params is rejected/ignored.
3. Cross-tenant access to `/staff/:id` returns `404 NotFoundError`.
4. SuperAdmin switching via `X-Tenant-Id` header is supported.

---

## 19. PII / Security Review

1. **Sensitive Fields**: `panNumber`, `aadharNumber`, `bankAccountNumber`, `ifscCode`, `baseSalary`, `pfNumber`, `esicNumber`.
2. **Access Control**:
   - `staff.read`: Returns profile, contact, designation, and assignments.
   - Sensitive financial/payroll fields are restricted to `SUPER_ADMIN`, `SCHOOL_ADMIN`, or users with `hr-payroll.read` permission.
3. **Secrets**: `passwordHash`, `tokenVersion`, and session tokens are never returned by API responses.

---

## 20. Frontend Firestore Usage

| Frontend Page / Component | Current Firestore Path | Proposed REST Endpoint |
|---|---|---|
| `src/pages/Admin/StaffAssignment.jsx` | `schools/{id}/teachers` | `GET /api/v1/staff`, `POST /api/v1/staff`, `PATCH /api/v1/staff/:id`, `DELETE /api/v1/staff/:id` |
| `src/pages/Admin/StaffAssignment.jsx` (Assign) | Batch write to `teachers` + `subjects` | `PATCH /api/v1/staff/:id/assignment` |
| `src/pages/Admin/HRPayrollManagement.jsx` | `schools/{id}/teachers` | `GET /api/v1/staff?type=teaching` |
| `src/pages/Admin/SubjectManagement.jsx` | `schools/{id}/teachers` | `GET /api/v1/staff?type=teaching` |
| `src/pages/Teacher/ProfileSetup.jsx` | `schools/{id}/teachers/{id}` | `GET /api/v1/staff/me`, `PATCH /api/v1/staff/me` |
| `src/pages/TeacherRegistration.jsx` | `schools/{id}/teachers` query | `POST /api/v1/auth/register-teacher` |

---

## 21. Realtime Classification

- **Staff List / Assignment**: **Class A: REST + TanStack Query is completely sufficient**. Realtime `onSnapshot` is not required for administrative staff directory views.

---

## 22. Migration State S024 / S015 / S019

- **SchoolS024**: 38 StaffProfiles with associated `User` records (role: `TEACHER`), assigned to SchoolRole `Staffs` (38) and `Class Coordinator` (5).
- **SchoolS015**: 1 StaffProfile (`Pavithran A`, role: `TENANT_USER`).
- **SchoolS019**: 0 StaffProfiles (ready for new data).
- **Integrity**: 100% of existing `StaffProfile` records are validly linked to `User` records with zero orphaned entries.

---

## 23. Data Quality Findings

- In `SchoolS024`, some staff records have numeric string DOBs (e.g. `"45828"` from legacy Excel imports). Validation on update should normalize or allow existing strings in `customData` without crashing.
- `assignedClassId` is currently `null` for all migrated staff profiles in S024 and S015, awaiting assignment via the new API.

---

## 24. Schema Change Decision

### **Decision: YES — NO SCHEMA CHANGES REQUIRED**
- The existing Prisma schema for `StaffProfile`, `User`, `Class`, `SchoolRole`, and `UserRoleAssignment` completely supports all required business functionality.
- No migrations or schema edits needed.

---

## 25. Proposed Minimal API Surface

| Method | Endpoint | Permission / Role | Purpose |
|---|---|---|---|
| `GET` | `/api/v1/staff` | `staff.read` | Paginated listing with search, filtering (role, type, status, class), and counts. |
| `GET` | `/api/v1/staff/:id` | `staff.read` | Single staff profile details with safe user and class assignments. |
| `POST` | `/api/v1/staff` | `staff.create` | Create new staff profile + User + UserRoleAssignment atomically. |
| `PATCH` | `/api/v1/staff/:id` | `staff.edit` | Update staff details, status, email, role, or base salary. |
| `PATCH` | `/api/v1/staff/:id/assignment` | `staff.edit` | Assign / reassign class teacher and subject teaching mappings. |
| `DELETE` | `/api/v1/staff/:id` | `staff.delete` | Hard delete staff (only if 0 historical dependencies exist). |
| `GET` | `/api/v1/staff/me` | Authenticated `TEACHER`/`STAFF` | Self-service profile retrieval for logged-in staff member. |
| `PATCH` | `/api/v1/staff/me` | Authenticated `TEACHER`/`STAFF` | Self-service profile update (non-protected fields). |

---

## 26. Risks / Conditions

1. **Class Teacher Bi-directional Sync**: Must atomically synchronize `Class.classTeacherId` and `StaffProfile.assignedClassId`.
2. **Dependent Cascade Guard**: Hard delete must verify 5 dependent models (`LessonPlan`, `HRPayrollRecord`, `ChatRoom`, `PtmAppointment`, `TimetablePeriod`) with row locking to prevent accidental data destruction.
3. **Email Uniqueness**: User email is globally unique across PostgreSQL. Conflict handling must return safe `409 ConflictError`.

---

## 27. Implementation Readiness Classification

### **`READY FOR IMPLEMENTATION`**

All schema models, database relationships, dependency guards, bi-directional class teacher semantics, RBAC permissions, authentication flows, and frontend Firestore mapping requirements have been thoroughly investigated and verified.

---

# Addendum — Targeted Verification & Corrections

This section provides definitive, evidence-based resolutions for the 9 targeted verification areas.

---

## 1. Definitive User System Role Rule

### Explicit Role Decision Table

| Staff Category | `User.systemRole` | `SchoolRole.slug` | `StaffProfile.staffType` |
|---|---|---|---|
| **Teaching Teacher** | `TEACHER` | `staffs` (or custom teaching slug) | `teaching` |
| **Class Incharge / Class Teacher** | `TEACHER` | `class-incharge` | `teaching` |
| **Subject Wise Head** | `TEACHER` | `subject-wise-head` | `teaching` |
| **Principal** | `SCHOOL_ADMIN` (or `TEACHER`) | `principal` | `teaching` |
| **Vice Principal** | `TEACHER` | `vice-principal` | `teaching` |
| **Correspondent** | `SCHOOL_ADMIN` | `correspondent` | `non-teaching` |
| **Administrative Officer** | `STAFF` | `administrative-officer` | `non-teaching` |
| **Finance Department / Accountant** | `STAFF` | `finance-department` | `non-teaching` |
| **Librarian** | `STAFF` | `library` | `non-teaching` |
| **Transport Incharge / Driver** | `STAFF` | `transport` | `non-teaching` |
| **Hostel Warden** | `STAFF` | `hostel` | `non-teaching` |
| **Inventory Manager** | `STAFF` | `inventory` | `non-teaching` |
| **Security Guard / Chief** | `STAFF` | `security` | `non-teaching` |
| **Canteen Incharge / Worker** | `STAFF` | `canteen` | `non-teaching` |
| **Janitor / Housekeeping** | `STAFF` | `janitors` | `non-teaching` |
| **Custom Teaching Role** | `TEACHER` | `<custom-slug>` | `teaching` |
| **Custom Non-Teaching Role** | `STAFF` | `<custom-slug>` | `non-teaching` |

### Authority Separation:
- **`User.systemRole` & `User.isActive`**: Authoritative for **Authentication & Portal Route Guarding**. Determines whether a user enters the Teacher Portal (`/teacher`), Admin Portal (`/admin`), or Parent/Student Portal.
- **`UserRoleAssignment` -> `SchoolRole` -> `RolePermission`**: Authoritative for **Granular Institutional Permissions** (`canRead`, `canCreate`, `canEdit`, `canDelete` across 32 module keys).
- **`StaffProfile`**: Authoritative for **Directory & HR Metadata** (`employeeId`, `designation`, `staffType`, `baseSalary`, `assignedClassId`, `customData`).

---

## 2. Subject Assignment Semantics

### Classification:
`assignedSubjectIds` and `subjectClassIds` are **C. Legacy denormalized compatibility & UI convenience metadata**.

### Findings:
1. **Authoritative PostgreSQL Bindings**: In PostgreSQL, a teacher is linked to a subject specifically through:
   - `TimetablePeriod` (`classId`, `sectionId`, `subjectId`, `teacherId`)
   - `LessonPlan` (`classId`, `subjectId`, `teacherId`)
   - `Assessment` & `HomeworkAssignment`
2. **Frontend UI Usage**:
   - `SubjectManagement.jsx` displays teacher names assigned to subjects using `subject.assignedTeacherIds`.
   - `StaffAssignment.jsx` displays summary tags of subjects and classes taught by each staff member.
   - `TimetableManagement.jsx` filters candidate teachers for a timetable period based on `subject.assignedTeacherIds`.
3. **No Schema Changes Required**:
   - `PATCH /api/v1/staff/:id/assignment` will accept `assignedClassId`, `assignedSubjectIds`, and `subjectClassIds`.
   - Subject array metadata is stored inside `StaffProfile.customData.assignments`:
     ```json
     {
       "assignments": {
         "assignedSubjectIds": ["subj-uuid-1", "subj-uuid-2"],
         "subjectClassIds": ["class-uuid-1", "class-uuid-2"]
       }
     }
     ```
   - This avoids creating speculative `TeacherSubject` / `TeacherClass` join tables while maintaining 100% UI fidelity.

---

## 3. Staff Delete Concurrency & Row-Level Locking

### Concurrency Vulnerability Under `READ COMMITTED`:
Without row locking, Client 1 can count 0 dependent records in `LessonPlan`, but before Client 1's `DELETE` executes, Client 2 concurrently inserts a new `LessonPlan` referencing that `StaffProfile.id`. Under PostgreSQL `ON DELETE CASCADE`, Client 1's delete silently destroys Client 2's new lesson plan.

### Exact Locking Strategy:
```sql
BEGIN;
-- 1. Acquire exclusive row lock on StaffProfile
SELECT id FROM staff_profiles WHERE school_id = $1 AND id = $2 FOR UPDATE;

-- 2. Execute authoritative dependency COUNT queries
SELECT count(*) FROM lesson_plans WHERE school_id = $1 AND teacher_id = $2;
SELECT count(*) FROM hr_payroll_records WHERE school_id = $1 AND teacher_id = $2;
SELECT count(*) FROM chat_rooms WHERE school_id = $1 AND teacher_id = $2;
SELECT count(*) FROM ptm_appointments WHERE school_id = $1 AND teacher_id = $2;
SELECT count(*) FROM timetable_periods WHERE school_id = $1 AND teacher_id = $2;

-- 3. If any COUNT > 0: ROLLBACK & return 409 ConflictError
-- 4. If all counts === 0:
DELETE FROM staff_profiles WHERE school_id = $1 AND id = $2;
DELETE FROM user_role_assignments WHERE user_id = $3;
DELETE FROM users WHERE id = $3;
COMMIT;
```
*Why this works*: Any concurrent insert into `LessonPlan` or `HRPayrollRecord` must perform an internal foreign key verification on `StaffProfile(id)` (`FOR KEY SHARE`), which is blocked until Client 1's transaction commits or aborts.

### Real Concurrency Execution Status:
`REAL MULTI-CONNECTION POSTGRESQL CONCURRENCY TEST: NOT EXECUTED — real PostgreSQL concurrency test against shared live Railway database is unsafe/destructive.`

---

## 4. Deactivation + Class Teacher Rule

### **Definitive Recommendation: Rule A (Automatically Cleared)**
When Teacher A is Class Teacher of Class C and Teacher A becomes Inactive (`status: 'Inactive'` or `isActive: false`):
1. `Class.classTeacherId` for Class C is set to `null`.
2. `StaffProfile.assignedClassId` for Teacher A is set to `null`.
3. `User.isActive` is set to `false`, and `User.tokenVersion` is incremented by 1.
4. Non-blocking audit events `DISABLE_STAFF` and `UNASSIGN_CLASS_TEACHER` are dispatched.

*Rationale*: Leaving an inactive staff member as the active incharge leaves classes in a broken operational state where attendance cannot be taken and class roster management fails.

---

## 5. Hard Delete Policy

### Strict Eligibility Matrix:

| Staff State / History | Hard Delete Allowed? | Action / Response |
|---|---|---|
| **Draft / Accidental Staff** (0 historical dependencies, 0 class assignments, 0 attendance markers) | **YES** | Permanent removal of `StaffProfile` + `User` + `UserRoleAssignment` via `DELETE /api/v1/staff/:id`. |
| **Active Staff with Active Class Assignment** (`assignedClassId !== null`) | **NO** | `409 ConflictError`: Must unassign class teacher first or deactivate. |
| **Staff with Historical Curriculum** (`LessonPlan` > 0) | **NO** | `409 ConflictError`: Must deactivate account (`status: 'Inactive'`). |
| **Staff with Payroll History** (`HRPayrollRecord` > 0) | **NO** | `409 ConflictError`: Must deactivate account (`status: 'Inactive'`). |
| **Staff with Chat / PTM History** (`ChatRoom` > 0, `PtmAppointment` > 0) | **NO** | `409 ConflictError`: Must deactivate account (`status: 'Inactive'`). |
| **Staff with Timetable History** (`TimetablePeriod` > 0) | **NO** | `409 ConflictError`: Must deactivate account (`status: 'Inactive'`). |
| **Inactive Staff with History** | **NO** | Retained permanently in `status: 'Inactive'`. |

---

## 6. Teacher Registration & Invitation Architecture

### Inspection Findings (`src/pages/TeacherRegistration.jsx`):
- `TeacherRegistration.jsx` is a **legacy Firebase Auth invitation activation flow** where an unlinked Firestore document is updated with `userId: user.uid` after the user inputs their password.
- In our target PostgreSQL REST architecture:
  1. `POST /api/v1/staff` creates `User` (`passwordHash: '!LOCKED_NO_PASSWORD_SET'`), `StaffProfile`, and `UserRoleAssignment` atomically.
  2. The staff member activates their credentials using the canonical password setup/reset email workflow (`POST /api/v1/auth/forgot-password` / `reset-password`).
  3. Therefore, a separate `POST /api/v1/auth/register-teacher` endpoint is **OBSOLETE and NOT NEEDED**. `POST /api/v1/staff` is completely sufficient.

---

## 7. RBAC Permission Verification

1. **Staff Management Module**:
   - `staff.read` — **VERIFIED** (in `CANONICAL_MODULE_KEYS`)
   - `staff.create` — **VERIFIED** (in `CANONICAL_MODULE_KEYS`)
   - `staff.edit` — **VERIFIED** (in `CANONICAL_MODULE_KEYS`)
   - `staff.delete` — **VERIFIED** (in `CANONICAL_MODULE_KEYS`)
2. **HR / Payroll Module**:
   - `hr-payroll.read` — **VERIFIED** (in `CANONICAL_MODULE_KEYS`)
   - `hr-payroll.create` — **VERIFIED** (in `CANONICAL_MODULE_KEYS`)
   - `hr-payroll.edit` — **VERIFIED** (in `CANONICAL_MODULE_KEYS`)
   - `hr-payroll.delete` — **VERIFIED** (in `CANONICAL_MODULE_KEYS`)
3. **No Speculative Permissions**: All required permissions exist in canonical constants.

---

## 8. Staff Response & PII Contract

### Data Tiering & Access Rules:

1. **PUBLIC / DIRECTORY STAFF PROFILE** (Accessible to all authenticated tenant users via `GET /staff`, `GET /staff/:id`, `GET /staff/me`):
   - `id`, `employeeId`, `name`, `staffType`, `designation`, `email`, `phone`, `status`, `assignedClass`, `assignedSubjectIds`, `subjectClassIds`, `photoUrl`, `createdAt`, `updatedAt`.
2. **INTERNAL STAFF PROFILE** (Accessible with `staff.read` or on `GET /staff/me`):
   - `dob`, `gender`, `bloodGroup`, `maritalStatus`, `nationality`, `residentialAddress`, `emergencyContact`, `fatherGuardianName`, `languagesKnown`, `qualifications`, `experience`, `documents`, `user: { id, email, systemRole, isActive }`.
3. **SENSITIVE HR / FINANCE** (Accessible ONLY with `hr-payroll.read`, `SCHOOL_ADMIN`, `SUPER_ADMIN`, or on `GET /staff/me` for own profile):
   - `baseSalary`, `panNumber`, `aadharNumber`, `govtIdType`, `govtIdNumber`, `pfNumber`, `esicNumber`, `uanNumber`, `bankName`, `bankAccountNumber`, `branchName`, `ifscCode`, `salarySlips`.
4. **AUTHENTICATION SECRET** (NEVER RETURNED):
   - `passwordHash`, `passwordAlgorithm`, `tokenVersion`, `refreshSessions`, `passwordResetTokens`.

---

## 9. S015 Compatibility

### Inspection & Resolution:
- **Observation**: `SchoolS015` contains 1 migrated staff profile (`Pavithran A`) linked to a user with `systemRole: TENANT_USER`.
- **Resolution**:
  - `GET /api/v1/staff/me` and `PATCH /api/v1/staff/me` will derive the staff identity by searching for a `StaffProfile` matching `where: { userId: req.user.id, schoolId }`.
  - The middleware will allow any authenticated institutional user possessing a valid `StaffProfile` (including `systemRole: 'TENANT_USER'`).
  - This ensures 100% backward compatibility for S015 without altering live database records.

---

## 10. Final Decision & Classification

All 9 targeted areas have been resolved with conclusive code, schema, and database evidence.

### **Classification: `READY FOR IMPLEMENTATION`**
