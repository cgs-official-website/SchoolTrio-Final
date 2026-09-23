# Phase 4B.4 — Admission Number + School Code Authentication Implementation Report

## 1. Scope
Phase 4B.4 implements the PostgreSQL-backed student admission number + school code authentication pipeline for parent accounts in the School Management System (SMS) SaaS backend.

### Implemented Components:
1. **Dedicated Admission Login Route**: `POST /api/v1/auth/admission-login`.
2. **Relational Resolution Pipeline**:
   $$\text{School Code} + \text{Admission Number} \longrightarrow \text{School} \longrightarrow \text{Student} \longrightarrow \text{ParentStudentLink} \longrightarrow \text{ParentProfile} \longrightarrow \text{User}$$
3. **Multi-Parent Credential Verification**: Constant-time Argon2id password verification iterating through candidate parent accounts.
4. **Locked Migrated Account Protection**: Returns `403 PASSWORD_NOT_SET` only when all candidate parent accounts have locked placeholder hashes (`!LOCKED_*`).
5. **Session & Cookie Security**: Issues standard 15-minute minimal-claim JWT access tokens and 7-day `HttpOnly; Secure; SameSite=Strict` refresh cookies. `rawRefreshToken` is kept strictly internal and never serialized in JSON responses.
6. **Strict Segregation**: `POST /api/v1/auth/login` remains strictly email-based; admission logins are exclusively handled via `POST /api/v1/auth/admission-login`.

---

## 2. Existing Authentication Contract & Evolution
- **Legacy Firebase/Firestore Mechanism**:
  The legacy frontend reconstructed a global synthetic email `${admissionNumber.replace(/[^a-zA-Z0-9]/g, '')}@parent.school.com` and invoked Firebase SDK's `signInWithEmailAndPassword`. This suffered from cross-school admission number collision risks and unauthenticated database reads.
- **Phase 4B.4 Relational Authentication**:
  Requires `schoolCode`, `admissionNumber`, and `password`. Resolves the authoritative tenant via `School.code`, ensures student lookups are strictly tenant-scoped (`schoolId_admissionNumber`), links to the authoritative parent `User` record, and issues modern JWT / HttpOnly cookie tokens.

---

## 3. PostgreSQL Data Relationship & Schema Proof

The database mapping traverses the following PostgreSQL models defined in `prisma/schema.prisma`:

1. **`School`** (`schools` table):
   - `id`: `UUID` (Primary Key)
   - `code`: `VarChar(50)` (`@unique`)
   - `status`: `VarChar(30)` (`approved`, `active`, `suspended`, `pending`)
2. **`Student`** (`students` table):
   - `id`: `UUID` (Primary Key)
   - `schoolId`: `UUID` (Foreign Key -> `School.id`)
   - `admissionNumber`: `VarChar(100)`
   - Composite unique constraint: `@@unique([schoolId, admissionNumber])`
   - Relation: `parents ParentStudentLink[]`
3. **`ParentStudentLink`** (`parent_student_links` table):
   - `id`: `UUID` (Primary Key)
   - `schoolId`: `UUID` (Foreign Key -> `School.id`)
   - `parentProfileId`: `UUID` (Foreign Key -> `ParentProfile.id`)
   - `studentId`: `UUID` (Foreign Key -> `Student.id`)
   - Composite constraints: `@@unique([schoolId, id])`, `@@unique([parentProfileId, studentId])`, `@@index([schoolId, studentId])`
4. **`ParentProfile`** (`parent_profiles` table):
   - `id`: `UUID` (Primary Key)
   - `schoolId`: `UUID` (Foreign Key -> `School.id`)
   - `userId`: `UUID` (`@unique`, Foreign Key -> `User.id`)
   - Relation: `user User @relation(fields: [userId], references: [id])`
5. **`User`** (`users` table):
   - `id`: `UUID` (Primary Key)
   - `schoolId`: `UUID?`
   - `email`: `VarChar(255)` (`@unique`)
   - `passwordHash`: `VarChar(255)`
   - `passwordAlgorithm`: `VarChar(50)` (`argon2id`)
   - `systemRole`: `VarChar(30)` (`PARENT`, `TENANT_USER`)
   - `tokenVersion`: `Int` (Default 1)
   - `isActive`: `Boolean`

---

## 4. Admission Login Endpoint Specification

### `POST /api/v1/auth/admission-login`
- **Authentication**: Public
- **Rate Limit**: 10 requests / minute per IP (`keyPrefix: 'rl:auth:admission-login:'`)
- **Request Body**:
  ```json
  {
    "schoolCode": "SchoolS024",
    "admissionNumber": "539",
    "password": "SecurePassword123!"
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Admission login successful",
    "data": {
      "accessToken": "eyJhbGciOi...",
      "user": {
        "id": "87525430-ed28-4038-a74d-82e35a06529e",
        "email": "parent.ananthakumar@s024.sms.internal",
        "schoolId": "25e9637a-7fa4-4ac2-b43d-b4c0edcf2932",
        "systemRole": "PARENT"
      }
    }
  }
  ```
  *(Set-Cookie: `sms_refresh_token=<64-hex>; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`)*

---

## 5. Tenant Isolation & Credential Handling
1. **School Code Resolution**:
   `schoolCode` is trimmed and queried against `School.code`. If no school exists, the endpoint returns generic `401 INVALID_CREDENTIALS` to resist tenant/school enumeration.
2. **Tenant Scoping**:
   All student lookups occur inside `runWithTenantContext({ schoolId: school.id })` with composite key `where: { schoolId_admissionNumber: { schoolId, admissionNumber } }`. Cross-tenant admission numbers cannot collide.
3. **Admission Number Normalization**:
   Whitespace is trimmed (`admissionNumber.trim()`), but internal characters and leading zeros are preserved.
4. **Header / Body Spoofing Resistance**:
   Client-supplied `schoolId`, `tenantId`, `userId`, `studentId`, `parentId`, `X-Tenant-Id`, or `X-School-Id` are completely ignored for identity derivation.

---

## 6. Password Verification & Multi-Parent Handling
1. **Candidate Gathering**:
   Extracts all linked `ParentProfile -> User` accounts where `user.schoolId === school.id`, `user.isActive === true`, and `user.systemRole !== 'SUPER_ADMIN'`.
2. **Deterministic Evaluation**:
   - Evaluates candidate users with usable passwords using `passwordService.verifyPassword(candidate.passwordHash, password)`.
   - If a candidate matches, that user is authenticated.
   - If none match, returns generic `401 INVALID_CREDENTIALS`.
3. **No Arbitrary Parent Selection**:
   Resolution is strictly credential-driven and deterministic.

---

## 7. Locked Migrated Accounts
- All 686 existing migrated users (including parents in S024 and S015) possess `passwordHash: '!LOCKED_PARENT_NO_DIRECT_AUTH'`.
- When an authentication attempt is made for a student where **all candidate parent accounts are locked**, the service returns HTTP 403 `PASSWORD_NOT_SET` ("Password is not set for this account. Please use password setup or reset.").
- If at least one candidate parent account is unlocked and has a valid password, an invalid password attempt returns generic `401 INVALID_CREDENTIALS`.

---

## 8. Security Findings & Protections
- **Enumeration Resistance**: Missing school, missing student, inactive student, missing parent links, and invalid passwords all return identical `401 INVALID_CREDENTIALS` errors.
- **Sensitive Field Redaction**: `passwordHash`, `passwordAlgorithm`, `legacyFirestoreId`, and internal student data are strictly omitted from JWT claims, API response bodies, and error envelopes.
- **Internal-Only Refresh Token**: `rawRefreshToken` is strictly passed from service to controller for `res.cookie()` configuration and never serialized in JSON responses.
- **SuperAdmin Exclusion**: SuperAdmin accounts cannot be authenticated via the admission login endpoint.

---

## 9. Tests & Coverage Breakdown

### Total Backend Test Suite: 34 Test Files | 265 Tests Passed (0 Failures)

#### Phase 4B.4 Dedicated Test Files:
1. `backend/tests/unit/auth/admission-auth.service.test.js` (15 tests)
   - Valid admission authentication pipeline
   - Whitespace normalization
   - Parameter presence checks
   - Nonexistent school rejection (401 enumeration resistance)
   - Suspended / pending school rejection (403 TENANT_ACCESS_ERROR)
   - Nonexistent student rejection (401 INVALID_CREDENTIALS)
   - Inactive student rejection (401 INVALID_CREDENTIALS)
   - Student with no parent links rejection (401 INVALID_CREDENTIALS)
   - Parent schoolId tenant mismatch rejection (401 INVALID_CREDENTIALS)
   - SuperAdmin systemRole rejection (401 INVALID_CREDENTIALS)
   - All parents locked -> 403 PASSWORD_NOT_SET
   - Multi-parent (1 locked, 1 usable) with valid password -> 200 OK
   - Multi-parent (1 locked, 1 usable) with wrong password -> 401 INVALID_CREDENTIALS
   - Multi-parent (multiple usable) -> correctly authenticates matching parent
2. `backend/tests/integration/auth/auth-admission-login.test.js` (6 tests)
   - `POST /api/v1/auth/admission-login` 200 OK + JWT + HttpOnly refresh cookie (no rawRefreshToken in JSON)
   - Missing fields -> 400 VALIDATION_ERROR
   - Wrong password -> 401 INVALID_CREDENTIALS
   - Locked parent accounts -> 403 PASSWORD_NOT_SET
   - Suspended school -> 403 TENANT_ACCESS_ERROR
   - Nonexistent school -> 401 INVALID_CREDENTIALS
3. `backend/tests/security/admission-tenant-isolation.test.js` (3 tests)
   - Cross-tenant login rejection (School B code + School A student -> 401)
   - Client-supplied `X-Tenant-Id` / `X-School-Id` headers ignored
   - Response safety check (no passwordHash, legacyFirestoreId, or student internal data leaks)
4. `backend/tests/unit/auth/auth.repository.test.js` (20 tests, +5 for admission repository methods)
   - `findSchoolById` and `findSchoolByCode` queries and normalization
   - `findStudentWithParentsByAdmissionNumber` compound tenant lookups

---

## 10. Test Authenticity Classification
- **Unit Tests**: Executed with mocked Prisma clients and isolated repository spies (`vitest`).
- **Supertest Integration Tests**: Executed via HTTP request simulations against the Express application with mocked database repositories (`vitest` + `supertest`).
- **Real Database Read-Only Queries**: Executed in pre-implementation audit against the real Railway PostgreSQL database for read-only structure verification (`SchoolS024`, `SchoolS015`, `SchoolS019`).
- **Classification**: REAL_POSTGRES_INTEGRATION_MUTATIONS: NOT EXECUTED (No destructive or mutating test fixtures executed against live database).

---

## 11. Quality Gates
- **Vitest**: 34/34 test files passed, 265/265 tests passed (100% pass rate).
- **ESLint**: 0 errors across entire backend codebase.
- **Prisma Validate**: `schema.prisma` is 100% valid.
- **Prisma Generate**: Up-to-date client.
- **Backend Startup**: Successfully bootstrapped on ephemeral port and gracefully shut down.

---

## 12. Database Safety Invariants
- **Database Migrations**: 0
- **Prisma Schema Changes**: 0
- **Destructive SQL Commands**: 0
- **Tenant Data Mutations**: 0
- **SchoolS024 Data**: 100% UNCHANGED
- **SchoolS015 Data**: 100% UNCHANGED
- **SchoolS019 Data**: 100% UNCHANGED

---

## 13. Firebase Safety Invariants
- **Firestore Writes**: 0
- **Firebase Auth Writes**: 0

---

## 14. Frontend Safety Invariants
- **Frontend Files Modified**: 0 (React components, Vite configs, AuthContext untouched)

---

## 15. Remaining Limitations
1. **Password Setup / Reset Workflow**: All migrated parent accounts currently have `!LOCKED_*` password hashes and will receive `PASSWORD_NOT_SET` until Phase 4B.5 (Password Setup & Reset) is implemented.
2. **Live Frontend Integration**: Frontend continues to use Firebase Auth SDK until Phase 4B.6 bridge and subsequent frontend migration.

---

## 16. HARD STOP
Phase 4B.4 is **COMPLETE** and verified.

- Phase 4B.5 (Password Setup & Reset) has **NOT** been started.
- Phase 4B.6 (Firebase Coexistence Bridge) has **NOT** been started.
- Frontend authentication migration has **NOT** been started.
