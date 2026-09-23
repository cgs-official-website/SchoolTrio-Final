# Phase 4C.3-B — Parents & Parent-Student Links API Preflight Audit

## 1. Executive Summary
This document provides a comprehensive pre-implementation preflight audit for **Phase 4C.3-B: Parents & Parent-Student Links API**.

Phase 4C.3-A (Student Core CRUD) is complete and verified. Phase 4C.3-B builds upon this foundation by establishing the relational link between `User`, `ParentProfile`, `ParentStudentLink`, and `Student`, enabling:
1. Parent profile management (`GET`, `PATCH /api/v1/parents`).
2. Parent-to-Student association (`GET`, `POST`, `DELETE /api/v1/students/:studentId/parents`).
3. Parent Portal self-service discovery (`GET /api/v1/parents/me/children`).
4. Concurrency-safe identity reuse (preventing duplicate parent users for siblings) and transaction-serialized linking.

This audit is **strictly read-only**: no backend source code, Prisma schema, migrations, frontend files, or database records have been modified.

---

## 2. Current Prisma Schema Findings

### Model Definitions:
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

model ParentProfile {
  id               String   @id @default(uuid()) @db.Uuid
  schoolId         String   @map("school_id") @db.Uuid
  userId           String   @unique @map("user_id") @db.Uuid
  name             String   @db.VarChar(200)
  phone            String?  @db.VarChar(20)
  email            String?  @db.VarChar(255)
  address          String?  @db.Text
  emergencyContact String?  @map("emergency_contact") @db.VarChar(20)
  createdAt        DateTime @default(now()) @map("created_at")
  updatedAt        DateTime @updatedAt @map("updated_at")

  school   School              @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  user     User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  children ParentStudentLink[]

  @@unique([schoolId, id])
  @@map("parent_profiles")
}

model ParentStudentLink {
  id              String   @id @default(uuid()) @db.Uuid
  schoolId        String   @map("school_id") @db.Uuid
  parentProfileId String   @map("parent_profile_id") @db.Uuid
  studentId       String   @map("student_id") @db.Uuid
  relationship    String?  @db.VarChar(50)
  createdAt       DateTime @default(now()) @map("created_at")

  parent  ParentProfile @relation(fields: [schoolId, parentProfileId], references: [schoolId, id], onDelete: Cascade)
  student Student       @relation(fields: [schoolId, studentId], references: [schoolId, id], onDelete: Cascade)

  @@unique([schoolId, id])
  @@unique([parentProfileId, studentId])
  @@index([schoolId, studentId])
  @@map("parent_student_links")
}
```

### Relational Invariants:
1. **1:1 User to ParentProfile**: `ParentProfile.userId` is `@unique`. A `User` can have at most one `ParentProfile`.
2. **M:N ParentProfile to Student**: Joined via `ParentStudentLink`.
3. **Compound Unique Link Constraint**: `@@unique([parentProfileId, studentId])` prevents duplicate links between the same parent and student.
4. **Tenant-Scoped Cascading Foreign Keys**: Both FKs on `ParentStudentLink` reference `[schoolId, parentProfileId]` and `[schoolId, studentId]`, preventing cross-tenant links at the PostgreSQL level.
5. **Global User Email Uniqueness**: `User.email` is `@unique` globally across the database.

---

## 3. Current Backend Findings
1. **Existing Student API**: Fully tenant-isolated in `backend/src/modules/students/`. Returns class and section objects and supports `_count.parents`.
2. **Admission Auth Resolution**: `backend/src/modules/auth/admission-auth.service.js` already resolves:
   `schoolCode + admissionNumber -> School -> Student -> ParentStudentLink -> ParentProfile -> User -> verifyPassword`.
3. **Password Security**: Supports `!LOCKED_` prefix for migrated placeholders (`isLockedPassword`). Password setup and reset flows operate through `PasswordResetToken` and Argon2id hashing.
4. **RBAC Infrastructure**: Canonical module key `'students'` covers student and parent operations. `requireRole` supports `SYSTEM_ROLES.PARENT`.

---

## 4. Current Frontend / Firebase Findings
1. **Legacy Firestore Model**:
   - Parents were embedded in Firestore student documents (`schools/{schoolId}/students/{studentId}` with fields `parentName`, `parentPhone`, `parentEmail`, `parentRelationship`, `emergencyContact`, `homeAddress`, `parentOccupation`, `annualIncome`).
   - Sibling linking was managed in client state via `linkedStudentId` on the user profile.
2. **Parent Portal Navigation**:
   - `src/pages/ParentDashboard.jsx` and `src/pages/Parent/MyChildren.jsx` expect parent users to view and switch between their linked children.
   - Frontend currently reads `userProfile.linkedStudentId` or queries links.
3. **Admission Login**:
   - Parents log in at `/login` using `schoolCode + admissionNumber + password`.

---

## 5. Live Database Read-Only Findings
Inspection of the live Railway PostgreSQL database revealed the following verified counts and consistency metrics:

| Metric | SchoolS024 | SchoolS015 | SchoolS019 | Global Total |
| :--- | :--- | :--- | :--- | :--- |
| **Total Users** | 367 | 319 | 0 | 686 |
| **Parent Role Users** | 328 | 0 (mapped as TENANT_USER) | 0 | 328 |
| **ParentProfiles** | 328 | 317 | 0 | 645 |
| **Students** | 340 | 375 | 0 | 715 |
| **ParentStudentLinks** | 340 | 375 | 0 | 715 |
| **Orphan Profiles (no User)** | 0 | 0 | 0 | 0 |
| **Broken Student Links** | 0 | 0 | 0 | 0 |
| **Broken Profile Links** | 0 | 0 | 0 | 0 |
| **Multi-Child Parents (Siblings)** | 12 | 58 | 0 | 70 |
| **Multi-Parent Students** | 0 | 0 | 0 | 0 |
| **Locked Parent Passwords** | 328 | 317 | 0 | 645 (100%) |

### Observations:
- **Zero Inconsistencies**: No orphan parent profiles, broken links, or missing users.
- **Sibling Links**: 70 parent profiles are already linked to multiple students (siblings) in PostgreSQL.
- **Passcode State**: 100% of migrated parent user accounts have `!LOCKED_` passwords awaiting password setup/reset.
- **SystemRole in S015**: SchoolS015 parent users have `systemRole = 'TENANT_USER'`, whereas SchoolS024 parent users have `systemRole = 'PARENT'`. New parent creation must standardize on `systemRole = 'PARENT'`.

---

## 6. Parent/User Relationship Model

```
       ┌──────────────────┐
       │      School      │
       └─────────┬────────┘
                 │ (schoolId)
    ┌────────────┴────────────┐
    │                         │
┌───▼───────────┐      ┌──────▼────────┐
│     User      │      │    Student    │
│ (Auth & Role) │      │ (Core Record) │
└───┬───────────┘      └──────▲────────┘
    │ 1:1                     │
    │ (userId)                │ M:N
┌───▼───────────┐      ┌──────┴──────────────┐
│ ParentProfile ├──────►  ParentStudentLink  │
│ (Demographics)│ M:N  │    (Relationship)   │
└───────────────┘      └─────────────────────┘
```

1. **User Entity**:
   - Handles credentials, JWT issuance, `tokenVersion`, `isActive`, password reset tokens, and refresh sessions.
   - Global uniqueness on `User.email`.
2. **ParentProfile Entity**:
   - Stores contact and demographic information: `name`, `phone`, `email`, `address`, `emergencyContact`.
   - Strictly 1:1 with `User` (`userId @unique`).
3. **ParentStudentLink Entity**:
   - M:N join table between `ParentProfile` and `Student`.
   - Stores the specific `relationship` (e.g. "Father", "Mother", "Guardian").
   - Compound unique constraint `@@unique([parentProfileId, studentId])`.

---

## 7. ParentStudentLink Semantics

1. **Relationship Values**:
   - Stored as free text up to 50 characters (e.g., `Father`, `Mother`, `Guardian`, `Parent`, `Sibling`, `Other`).
   - Normalizes whitespace.
2. **Link Uniqueness**:
   - `@@unique([parentProfileId, studentId])`: A parent cannot be linked to the same student multiple times.
3. **Unlinking vs Deleting**:
   - `DELETE /api/v1/students/:studentId/parents/:parentId` removes **only** the `ParentStudentLink` record.
   - Does **NOT** delete the `ParentProfile` or `User`.
   - Does **NOT** disable parent authentication or revoke credentials.
   - If a parent has multiple children, unlinking from child A leaves child B untouched.

---

## 8. Parent Authentication Semantics
1. **Admission Login**:
   - Parents log in via `POST /api/v1/auth/admission-login` supplying `schoolCode`, `admissionNumber`, and `password`.
   - `admission-auth.service.js` finds the active student, resolves all linked parent users, skips locked accounts (`!LOCKED_`), and verifies the password against candidate accounts.
2. **Direct Email Login**:
   - Parents with a real email and configured password can also log in via `POST /api/v1/auth/login`.
3. **Password Setup / Reset**:
   - Migrated parents or newly created parents without passwords initiate the password setup flow via `POST /api/v1/auth/forgot-password` (or admin invitation setup).

---

## 9. Parent Portal Semantics
1. **Self-Service Child Retrieval (`GET /api/v1/parents/me/children`)**:
   - Strictly derives the parent identity from the authenticated JWT session (`req.user.id`).
   - Traverses: `req.user.id -> ParentProfile -> ParentStudentLink -> Student (with class & section)`.
   - Client-supplied `parentId` or `schoolId` query parameters are strictly forbidden.
2. **Parent Access to Student Details (`GET /api/v1/students/:id`)**:
   - If requester's role is `PARENT`, access is permitted only if an active `ParentStudentLink` exists between the parent's `ParentProfile` and `params.id` in `req.tenant.schoolId`.
   - Unauthorized attempts return `404 Not Found` (preventing ID enumeration).

---

## 10. Legacy Field Mapping
The mapping between legacy Firestore student documents and PostgreSQL is verified:

| Legacy Firestore Field | PostgreSQL Destination | Type / Destination Key | Transformation |
| :--- | :--- | :--- | :--- |
| `parentName` | `ParentProfile.name` | `VarChar(200)` | Trimmed string |
| `parentPhone` | `ParentProfile.phone` | `VarChar(20)` | Cleaned phone digits |
| `parentEmail` | `ParentProfile.email` & `User.email` | `VarChar(255)` | Lowercased, trimmed (or synthetic placeholder if omitted) |
| `parentRelationship` | `ParentStudentLink.relationship`| `VarChar(50)` | Trimmed string |
| `emergencyContact` | `ParentProfile.emergencyContact`| `VarChar(20)` | Cleaned phone digits |
| `homeAddress` | `ParentProfile.address` | `Text` | Trimmed text |
| `parentOccupation` | `Student.customData` | `customData.parentOccupation` | Preserved in JSON |
| `annualIncome` | `Student.customData` | `customData.annualIncome` | Preserved in JSON |
| `city` / `state` / `pincode` | `Student.customData` | `customData.address.*` | Preserved in JSON |

---

## 11. Proposed API Surface

All endpoints are mounted under `/api/v1/` and enforce JWT authentication + tenant context resolution:

### 1. `GET /api/v1/parents`
- **Purpose**: List parents for the institution with pagination, searching, and filtering.
- **RBAC**: `requirePermission('students', 'read')`
- **Query**: `search`, `phone`, `email`, `page`, `limit`, `sort`, `order`
- **Response**: Paginated list of parent profiles including linked children summary.

### 2. `GET /api/v1/parents/:id`
- **Purpose**: Retrieve single parent profile by UUID.
- **RBAC**: `requirePermission('students', 'read')`
- **Response**: Parent profile object with `user` info (`isActive`, `email`, `systemRole`) and list of linked `children`.

### 3. `PATCH /api/v1/parents/:id`
- **Purpose**: Update parent contact info (`name`, `phone`, `email`, `address`, `emergencyContact`, `isActive`).
- **RBAC**: `requirePermission('students', 'edit')`
- **Deltas**: Field-level delta logging; no-op updates produce 0 audit logs. If `isActive` changes to `false`, increments `User.tokenVersion` to revoke active sessions.

### 4. `GET /api/v1/students/:studentId/parents`
- **Purpose**: List all parent profiles linked to a specific student.
- **RBAC**: `requirePermission('students', 'read')`
- **Response**: Array of linked parents with relationship and contact information.

### 5. `POST /api/v1/students/:studentId/parents`
- **Purpose**: Link a parent to a student (supports either linking an existing parent by ID or creating a new parent user + profile + link atomically).
- **RBAC**: `requirePermission('students', 'create')`
- **Body**:
  - **Option A (Existing)**: `{ parentProfileId: UUID, relationship: string }`
  - **Option B (New)**: `{ name: string, phone?: string, email?: string, relationship: string, address?: string, emergencyContact?: string }`
- **Response**: Created `ParentStudentLink` object with parent details (HTTP 201).

### 6. `DELETE /api/v1/students/:studentId/parents/:parentId`
- **Purpose**: Unlink a parent from a student.
- **RBAC**: `requirePermission('students', 'delete')`
- **Behavior**: Deletes `ParentStudentLink` only. Returns 200 OK.

### 7. `GET /api/v1/parents/me/children`
- **Purpose**: Self-service endpoint for logged-in parent to view their linked children.
- **RBAC**: `requireRole('PARENT')` + Session resolution.
- **Response**: List of linked students with class and section details.

---

## 12. RBAC Matrix

| Endpoint | Method | Required RBAC Permission / Role | Parent Self-Service | Tenant Behavior |
| :--- | :--- | :--- | :--- | :--- |
| `/api/v1/parents` | `GET` | `students.read` | No | Scoped to `req.tenant.schoolId` |
| `/api/v1/parents/:id` | `GET` | `students.read` | No (Parent uses `/me/children`) | 404 for cross-tenant ID |
| `/api/v1/parents/:id` | `PATCH` | `students.edit` | No | 404 for cross-tenant ID |
| `/api/v1/students/:studentId/parents` | `GET` | `students.read` | Allowed if parent is linked | Scoped to `req.tenant.schoolId` |
| `/api/v1/students/:studentId/parents` | `POST` | `students.create` | No | Atomic link in `req.tenant.schoolId` |
| `/api/v1/students/:studentId/parents/:parentId` | `DELETE` | `students.delete` | No | Unlinks in `req.tenant.schoolId` |
| `/api/v1/parents/me/children` | `GET` | `requireRole('PARENT')` | Yes (Authoritative JWT session) | Resolves strictly from `req.user.id` |

---

## 13. Tenant Isolation Analysis
1. **Repository Queries**: Every query on `ParentProfile`, `ParentStudentLink`, `User`, and `Student` MUST include `where: { schoolId }`.
2. **Cross-Tenant Linking Prevention**:
   - `POST /api/v1/students/:studentId/parents`: Validates both `studentId` and `parentProfileId` belong to `req.tenant.schoolId`. PostgreSQL foreign key constraint `[schoolId, parentProfileId]` provides an unbreakable database-level barrier.
3. **Parameter Poisoning Defense**: `tenant.middleware.js` automatically rejects conflicting `schoolId` in body or query params with `403 TenantAccessError`.

---

## 14. Transaction Boundaries

| Operation | Models Touched | Transaction Boundary (`prisma.$transaction`) | Concurrency Guard |
| :--- | :--- | :--- | :--- |
| **Create Parent + Link** | `User`, `ParentProfile`, `ParentStudentLink` | Interactive Transaction (Atomic) | Unique constraint on `User.email`, Unique link constraint |
| **Link Existing Parent** | `ParentStudentLink` | Interactive Transaction | `@@unique([parentProfileId, studentId])` handles concurrent duplicate link attempts |
| **Unlink Parent** | `ParentStudentLink` | Single statement / Transaction | Tenant-scoped delete where `parentProfileId`, `studentId`, `schoolId` match |
| **Update Parent Profile & User Status** | `ParentProfile`, `User` | Interactive Transaction | Field deltas, tokenVersion bump if deactivated |

---

## 15. Concurrency / Race Analysis

| Scenario | Concurrency Risk | Protection Mechanism |
| :--- | :--- | :--- |
| **Concurrent duplicate parent creation with same email** | Two requests attempt to create a parent with the same email simultaneously | PostgreSQL `User.email` global `@unique` constraint rejects second request with `P2002` -> caught and returned as `409 ConflictError`. |
| **Concurrent linking of same parent to same student** | Two requests attempt to link Parent P to Student S simultaneously | PostgreSQL `ParentStudentLink` `@@unique([parentProfileId, studentId])` constraint rejects second request with `P2002` -> caught and returned as `409 ConflictError`. |
| **Student deleted concurrently while linking parent** | Student deleted during parent linking transaction | Student row `SELECT ... FOR UPDATE` during deletion blocks foreign key link creation until transaction resolves; FK check in link fails with `404/409`. |
| **Parent profile unlinked concurrently with second unlink** | Multiple unlink requests | First deletes row, second finds 0 rows and returns `404 Not Found` idempotently/safely. |

---

## 16. Delete / Disable Policy
1. **Unlinking (`DELETE /students/:studentId/parents/:parentId`)**:
   - Removes relationship only.
   - Does **not** delete `ParentProfile` or `User`.
2. **Parent Disablement (`PATCH /parents/:id` with `{ isActive: false }`)**:
   - Sets `User.isActive = false`.
   - Increments `User.tokenVersion` to immediately invalidate all existing access and refresh tokens.
3. **Hard Deletion of ParentProfile / User**:
   - Hard deletion of `ParentProfile` / `User` is **strictly prohibited** in this phase to protect historical audit logs, communications, and relational integrity.

---

## 17. AuditLog Requirements
Audit logging utilizes the canonical `createAuditLog` abstraction from `backend/src/modules/audit/audit.repository.js`:

| Event Name | Trigger | Recorded Data |
| :--- | :--- | :--- |
| `CREATE_PARENT` | New parent user & profile created | Created snapshot (`id`, `name`, `phone`, `email`, `userId`) |
| `UPDATE_PARENT` | Parent profile updated | Field-level `{ old, new }` deltas |
| `LINK_PARENT_STUDENT` | Parent linked to student | `parentProfileId`, `studentId`, `relationship`, `studentName` |
| `UNLINK_PARENT_STUDENT` | Parent unlinked from student | `parentProfileId`, `studentId`, `studentName` |
| `DISABLE_PARENT` | Parent account deactivated | `userId`, `parentProfileId`, `reason` |

---

## 18. Migration Safety
1. **Zero Modifications to Legacy Records**: Existing migrated `ParentProfile`, `ParentStudentLink`, and `User` records will not be altered during normal CRUD operations.
2. **Placeholder Email Isolation**: Synthetic emails (e.g. `p_phone_...` or `parent....@<school>.parent.internal`) are never exposed across tenant boundaries.
3. **No Migration Map Modifications**: The `MigrationIdMap` table remains immutable.

---

## 19. Test Strategy
Implementation must include comprehensive test suites across 4 categories:

1. **Unit Tests**:
   - `parent.schemas.test.js`: Input validation, email normalization, phone formatting, relationship string bounds.
   - `parent.service.test.js`: Business logic, identity reuse, placeholder email generation, field deltas, no-op handling, and AuditLog dispatch.
   - `parent.concurrency.test.js`: Transaction serialization, duplicate link collisions, email race handling.
2. **Integration Tests**:
   - `parent-endpoints.test.js`: `GET /parents`, `GET /parents/:id`, `PATCH /parents/:id`, `GET /students/:id/parents`, `POST /students/:id/parents`, `DELETE /students/:id/parents/:parentId`, `GET /parents/me/children`.
3. **Security Tests**:
   - `parent-tenant-isolation.test.js`: Cross-tenant read/update/unlink blocking, cross-tenant link injection prevention, parameter tampering rejection, SuperAdmin tenant switching, and RBAC permission checks.
4. **Regression Tests**:
   - Verify all 66 existing backend test files (683 tests) remain 100% passing.

---

## 20. Blockers
**None**. No architectural, schema, or infrastructure blockers exist.

---

## 21. Conditions
1. **Global Email Collision Handling**: Because `User.email` is `@unique` globally, the service layer must catch unique constraint violations on email and return a clean `409 ConflictError` without revealing whether another tenant owns the email.
2. **Placeholder Email Format**: When a parent is created without an email, deterministic/collision-safe placeholder emails must follow: `parent.<phone || uuid>_<hex8>@<schoolCode>.parent.internal`.
3. **Initial Password State**: All newly generated parent `User` accounts must initialize `passwordHash = '!LOCKED_NO_PASSWORD_SET'` and `systemRole = 'PARENT'`.
4. **Parent Portal Authorization**: `GET /api/v1/parents/me/children` must derive access exclusively from `req.user.id` and never accept client-supplied parent identifiers.

---

## 22. Explicit Out-of-Scope Items
- Frontend React migration (Parent portal UI integration is deferred to Phase 4E).
- Firebase/Firestore rule removal.
- Bulk parent Excel/CSV import and export.
- WhatsApp / SMS direct notification triggers.

---

## 23. Final Classification

### **READY FOR IMPLEMENTATION**

The Parents & Parent-Student Links domain is fully audited, all relational and concurrency invariants are resolved, and the backend is ready for Phase 4C.3-B implementation upon user approval.
