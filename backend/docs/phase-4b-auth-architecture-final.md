# Phase 4B — Authentication & User Identity Final Architecture & Implementation Plan

## 1. Executive Summary

This document defines the authoritative, finalized architecture and implementation plan for **Phase 4B: Authentication & User Identity** for the School Management System (SMS) SaaS backend.

Following the successful completion of Phase 4A (Backend Foundation & Migration Runtime Isolation) and the pre-implementation audit, this plan establishes a production-grade, multi-tenant authentication engine.

### Core Architecture Highlights:
- **Authoritative Source of Truth**: PostgreSQL 16+ via Prisma is the persistent source of truth for users, sessions, roles, permissions, and tenant associations.
- **Minimal Access Token JWT**: JWT access tokens (15-minute TTL) contain minimal identity claims (`sub`, `schoolId`, `systemRole`, `tokenVersion`, `jti`, `iat`, `exp`). The dynamic permission matrix is resolved on-demand from PostgreSQL (accelerated by short-lived Redis caching) to eliminate stale permissions.
- **Zero-Schema-Change Refresh Token Rotation**: Utilizes the existing `RefreshSession` table with single-use refresh token rotation, SHA-256 token hashing, and immediate family revocation on reuse detection.
- **Strict Super Admin Tenant Switching**: Super Admin users can switch tenant contexts **only** when authenticated via a valid `SUPER_ADMIN` JWT and after explicitly validating that the requested target school exists and is active. Client-provided `schoolId` / `X-Tenant-Id` headers from regular institutional users are strictly rejected.
- **Argon2id Password Security**: All new and updated passwords use RFC 9106 Argon2id hashing. All 686 existing migrated users possess `!LOCKED_FIREBASE_AUTH_MANAGED` placeholder hashes, preventing unauthenticated access until onboarding or bridging.
- **Tenant-Scoped Admission Number Resolution**: Replaces legacy synthetic emails with a database resolution pipeline: `(admissionNumber, schoolCode) -> Student -> ParentStudentLink -> ParentProfile -> User`.
- **Firebase Coexistence Bridge**: Primary identity lookup maps `Firebase UID -> User.legacyFirestoreId` (with fallback to verified email), enabling zero-downtime transition while legacy Firebase remains active.

---

## 2. Current Authentication Architecture (As-Is State)

```
[React 19 / Vite Frontend]
       │
       ▼
[Firebase Auth Client SDK]
   ├── Direct Email Login: signInWithEmailAndPassword(email, password)
   └── Parent Login: loginWithAdmissionNumber(admNo, password)
          ↳ Synthesizes: {admNo}@parent.school.com
       │
       ▼
[Firestore Profile Resolution: getUserProfile(uid)]
   ├── 1. Reads users/{uid}
   └── 2. If staff: queries schools/{schoolId}/teachers where userId == uid
       │
       ▼
[Client State & LocalStorage]
   ├── currentUser (Firebase User)
   └── userProfile (Firestore document + resolved role)
       │
       ▼
[Client-Side Route Guard: ProtectedRoute.jsx]
   ├── Checks userProfile.role
   └── Checks usePermissions() hook (real-time listener on schools/{id}/roles)
```

### Verified As-Is Facts:
- **[VERIFIED]**: Firebase Authentication manages all live user credentials.
- **[VERIFIED]**: No custom claims are set on Firebase ID tokens; role and school scoping live entirely in Firestore documents.
- **[VERIFIED]**: All 686 migrated users in PostgreSQL have `passwordHash: '!LOCKED_FIREBASE_AUTH_MANAGED'`.
- **[VERIFIED]**: 367 migrated users have their original Firebase UID in `User.legacyFirestoreId`.

---

## 3. Verified Current Database Identity Model

### Model: `User` (`prisma/schema.prisma` lines 90–111)
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
  staffProfile    StaffProfile?
  parentProfile   ParentProfile?
  roleAssignments UserRoleAssignment[]

  @@index([schoolId])
  @@map("users")
}
```

### Verified Field Properties:
- **`schoolId` is Nullable**: `schoolId` is `null` for platform SuperAdmin users and populated with the school UUID for institutional users.
- **Email Uniqueness**: `email` is globally unique across the platform (`@unique`).
- **`systemRole`**: Distinguishes system-level privilege (`'SUPER_ADMIN'`, `'TENANT_ADMIN'`, `'TENANT_USER'`, `'TEACHER'`, `'PARENT'`).
- **`tokenVersion`**: Integer counter (default 1) enabling instant platform-wide or user-wide session invalidation.
- **`legacyFirestoreId`**: Stores original Firebase UID or Firestore doc ID.

---

## 4. Verified Multi-Tenant RBAC Model

### Model Relationships:
```
┌──────────────────┐       1..N       ┌────────────────────────┐       N..1       ┌──────────────────┐
│       User       ├──────────────────┤   UserRoleAssignment   ├──────────────────┤    SchoolRole    │
│ (Global Identity)│                  │(Tenant Scoped Junction)│                  │ (Tenant Scoped)  │
└──────────────────┘                  └────────────────────────┘                  └────────┬─────────┘
                                                                                           │ 1
                                                                                           │
                                                                                           │ N
                                                                                  ┌────────┴─────────┐
                                                                                  │  RolePermission  │
                                                                                  │  (Role Scoped)   │
                                                                                  └──────────────────┘
```

### Structural Verification:
- **[VERIFIED] `SchoolRole`**: Tenant-scoped model (`schoolId UUID`). Represents institutional roles (e.g. `'Principal'`, `'Staffs'`, `'Class Coordinator'`). Unique per tenant on `@@unique([schoolId, slug])`.
- **[VERIFIED] `RolePermission`**: Role-scoped junction model (`schoolRoleId UUID`). Maps module keys (e.g. `'students'`, `'fees'`, `'attendance'`) to boolean flags (`canRead`, `canCreate`, `canEdit`, `canDelete`). Unique on `@@unique([schoolRoleId, moduleKey])`.
- **[VERIFIED] `UserRoleAssignment`**: Tenant-scoped junction model (`schoolId UUID`, `userId UUID`, `schoolRoleId UUID`). Links users to roles within a specific school. Unique on `@@unique([userId, schoolRoleId])`.

---

## 5. Final Authentication Architecture (Target State)

```
[Client App]
     │
     ├── 1. POST /api/v1/auth/login (email/admNo + password)
     │      └── Rate Limiter -> User Lookup -> Argon2id Verify -> Issue JWT Pair
     │
     ├── 2. POST /api/v1/auth/refresh (HttpOnly Refresh Cookie)
     │      └── Rate Limiter -> Validate Session -> Rotate Session -> Issue New Pair
     │
     ├── 3. POST /api/v1/auth/firebase/exchange (Firebase ID Token)
     │      └── Verify Firebase Token -> Map UID -> Issue Backend JWT Pair
     │
     └── 4. Authenticated API Requests (Header: Authorization: Bearer <AccessToken>)
            └── Auth Middleware -> Tenant Middleware -> RBAC -> Controller
```

---

## 6. JWT Architecture & Design

### A. Access Token Claims (Minimal & Deterministic)
```json
{
  "sub": "e9c4e270-26e1-43ac-8279-886ec13f4776",
  "email": "priyanka.s@springmount.co.in",
  "schoolId": "25e9637a-7fa4-4ac2-b43d-b4c0edcf2932",
  "systemRole": "TENANT_USER",
  "tokenVersion": 1,
  "jti": "b5a92a18-6014-4eb9-923f-5d6666870d4f",
  "iat": 1788950000,
  "exp": 1788950900
}
```

### B. Claim Trust & Verification Rules:
1. **`sub`**: Subject user UUID (trusted after signature verification).
2. **`schoolId`**: Authoritative school UUID for tenant-scoped users; `null` for SuperAdmin.
3. **`systemRole`**: User's platform system role.
4. **`tokenVersion`**: Must match current `User.tokenVersion` in PostgreSQL (or short-lived Redis cache). If tokenVersion is stale, request is rejected with HTTP 401.
5. **`exp`**: 15-minute expiration time.

### C. Stale Permission Resolution Strategy:
- **No Permissions in JWT**: Granular module permissions (`students:read`, `fees:edit`) are **never** embedded in the JWT.
- **On-Demand RBAC Evaluation**: RBAC middleware resolves active permissions from PostgreSQL via `UserRoleAssignment -> SchoolRole -> RolePermission`.
- **Redis Cache Acceleration (Optional)**: User permissions may be cached in Redis with a 60-second TTL (`cache:perms:user:<userId>`). Any role assignment change immediately deletes this cache key.

---

## 7. Password Architecture & Policy

### A. Hashing Specifications:
- **Algorithm**: Argon2id (RFC 9106)
- **Parameters (OWASP Recommended)**:
  - Memory cost: 65536 KB (64 MB)
  - Time cost: 3 iterations
  - Parallelism: 4 threads
  - Hash length: 32 bytes
- **Package**: `argon2` npm library.

### B. Password Policy & Normalization:
- **Format**: UTF-8 string, max 128 characters (prevents CPU exhaustion DoS attacks).
- **Complexity**: Minimum 8 characters, at least 1 uppercase letter, 1 lowercase letter, 1 number.
- **Verification**: Executed directly via `argon2.verify(hash, plainPassword)` with internal constant-time comparisons.
- **Locked Password Protection**: If `passwordHash` starts with `'!LOCKED_'`, verification immediately returns `false` without executing Argon2 computations.
- **API Redaction**: `passwordHash` is excluded from all Prisma queries selecting user data and never serialized in API responses.

---

## 8. Refresh Token & Session Architecture (Zero Schema Changes)

### Model: `RefreshSession` (`prisma/schema.prisma` lines 113–127)
```prisma
model RefreshSession {
  id         String    @id @default(uuid()) @db.Uuid
  userId     String    @map("user_id") @db.Uuid
  tokenHash  String    @unique @map("token_hash") @db.VarChar(255)
  deviceInfo String?   @map("device_info") @db.Text
  ipAddress  String?   @map("ip_address") @db.VarChar(45)
  expiresAt  DateTime  @map("expires_at")
  revokedAt  DateTime? @map("revoked_at")
  createdAt  DateTime  @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("refresh_sessions")
}
```

### Rotation & Theft Detection Algorithm (Option A - Zero Schema Changes):
1. Client generates/receives a cryptographically random refresh token `rawToken` (64 hex characters).
2. Backend computes `tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')`.
3. Lookup `RefreshSession` by `tokenHash`:
   - **Not Found**: Return HTTP 401 `INVALID_REFRESH_TOKEN`.
   - **Revoked (`revokedAt !== null`)**: **Token Theft Detected!** Immediately revoke all active sessions for this user:
     ```sql
     UPDATE refresh_sessions SET revoked_at = NOW() WHERE user_id = :userId AND revoked_at IS NULL;
     UPDATE users SET token_version = token_version + 1 WHERE id = :userId;
     ```
     Return HTTP 401 `TOKEN_REUSE_DETECTED`.
   - **Expired (`expiresAt < NOW()`)**: Return HTTP 401 `REFRESH_TOKEN_EXPIRED`.
4. If valid and unrevoked:
   - Mark current session revoked: `UPDATE refresh_sessions SET revoked_at = NOW() WHERE id = :sessionId`.
   - Generate new refresh token `newRawToken` and create new `RefreshSession` record (`expiresAt = NOW() + 7 days`).
   - Issue new 15-minute Access Token.
   - Return new Access Token in response body and new Refresh Token in `HttpOnly`, `Secure`, `SameSite=Strict` cookie.

### Logout Behaviors:
- **Single Session Logout (`POST /auth/logout`)**: Marks active session `revokedAt = NOW()`.
- **All Devices Logout (`POST /auth/logout-all`)**: Marks all user sessions `revokedAt = NOW()` and increments `User.tokenVersion = tokenVersion + 1`.

---

## 9. Firebase Authentication Bridge

To support smooth transition without breaking the live frontend:

```
[Frontend Client] ──► Logs in via Firebase Auth ──► Receives Firebase ID Token
       │
       ▼
[POST /api/v1/auth/firebase/exchange]
   ├── 1. Backend verifies Firebase ID Token signature
   ├── 2. Extracts firebaseUid and email
   ├── 3. Primary Lookup: User.findFirst({ where: { legacyFirestoreId: firebaseUid } })
   ├── 4. Fallback Lookup: User.findUnique({ where: { email: email.toLowerCase() } })
   │        ↳ If matched by email, updates legacyFirestoreId = firebaseUid
   ├── 5. Checks User.isActive === true and School.status !== 'suspended'
   └── 6. Issues SMS Backend Access Token + Refresh Token Pair
```

### Edge Case Handling:
- **UID Found**: Normal exchange -> issues tokens.
- **UID Not Found, Email Found**: Binds `legacyFirestoreId` -> issues tokens.
- **User Not in PostgreSQL**: Returns HTTP 404 `USER_NOT_MIGRATED` ("Account not found in PostgreSQL. Contact school administrator.").
- **User Disabled**: Returns HTTP 403 `ACCOUNT_DISABLED`.
- **School Suspended**: Returns HTTP 403 `TENANT_SUSPENDED`.

---

## 10. Admission-Number Authentication (Database Pipeline)

Replaces synthetic `@parent.school.com` emails with a direct relational resolution:

```
[Parent Login Form]
   Input: { admissionNumber: "ADM-2024-001", schoolCode: "SchoolS024", password: "..." }
       │
       ▼
[POST /api/v1/auth/login]
   ├── 1. Resolve School by code: School.findUnique({ where: { code: schoolCode } })
   │        ↳ If not found: Reject HTTP 401 (Generic "Invalid credentials")
   ├── 2. Resolve Student: Student.findUnique({ where: { schoolId_admissionNumber: { schoolId, admissionNumber } } })
   │        ↳ If not found: Reject HTTP 401
   ├── 3. Resolve Parent Links: ParentStudentLink.findMany({ where: { schoolId, studentId } })
   │        ↳ Links to ParentProfile -> User
   ├── 4. Single Parent Linked: Load User record.
   │      Multiple Parents Linked: Check password against candidate Parent Users.
   ├── 5. Verify User.isActive === true.
   ├── 6. Verify password via Argon2id (or reject if !LOCKED_).
   └── 7. Issue Access Token (with schoolId) + Refresh Token.
```

---

## 11. SuperAdmin Tenant Switching Security Specification

### Strict Security Rules:
1. **No Arbitrary Header Switching**: An unauthenticated request or a normal user request sending `X-Tenant-Id: <school-id>` is **completely ignored or rejected**.
2. **Verification Prerequisites**: Tenant switching is permitted **ONLY** when:
   - Request includes a valid verified backend JWT.
   - JWT `systemRole === 'SUPER_ADMIN'`.
   - Target school exists in PostgreSQL (`School.findUnique({ where: { id: targetSchoolId } })`).
   - Target school is not deleted.
3. **Execution Context**:
   - If SuperAdmin supplies valid `X-Tenant-Id`: execution context is `{ schoolId: targetSchool.id, userId: user.id, role: 'SUPER_ADMIN', bypassTenant: false }`.
   - If SuperAdmin does not supply `X-Tenant-Id`: execution context is `{ schoolId: null, userId: user.id, role: 'SUPER_ADMIN', bypassTenant: true }` (grants access to global platform models).

---

## 12. Complete Request Lifecycle & Middleware Order

```
[Incoming HTTP Request]
       ↓
[1. Request ID Middleware]           → Injects X-Request-Id correlation ID
       ↓
[2. Rate Limiting Middleware]        → Limits failed login/public attempts (Redis / Memory fallback)
       ↓
[3. CORS & Helmet Middlewares]       → Security headers and whitelisted origins
       ↓
[4. Body Parser Middlewares]         → express.json({ limit: '10mb' })
       ↓
[5. Authenticate Middleware]         → Verifies JWT Bearer token; sets req.user
       ↓
[6. Tenant Context Middleware]       → Sets AsyncLocalStorage context:
                                         - SuperAdmin + X-Tenant-Id -> Validates school & sets tenant
                                         - SuperAdmin (no header) -> Sets bypassTenant: true
                                         - Normal User -> Sets user.schoolId (rejects client overrides)
       ↓
[7. RBAC Middleware]                 → Evaluates requireRole / requirePermission via DB/Redis cache
       ↓
[8. Validate Middleware]             → Validates request body, params, query via Zod
       ↓
[9. Route Controller & Services]     → Domain business logic within tenant context
       ↓
[10. Centralized Error Middleware]   → Uniform error envelopes, Prisma translation, prod redaction
```

---

## 13. Account States Matrix

| Account State | Database Field Condition | Login Allowed? | API Request Allowed? | Response / Action |
|---|---|---|---|---|
| **Active** | `User.isActive === true` & `School.status === 'active'/'approved'` | **YES** | **YES** | 200 OK + JWT tokens |
| **Disabled User** | `User.isActive === false` | **NO** | **NO** | HTTP 403 `ACCOUNT_DISABLED` |
| **Locked Firebase Placeholder** | `User.passwordHash` starts with `'!LOCKED_'` | **NO** (Direct) | N/A | HTTP 403 `PASSWORD_NOT_SET` -> Directs user to password reset/setup |
| **Suspended School Tenant** | `School.status === 'suspended'` | **NO** (Except SuperAdmin) | **NO** (Except SuperAdmin) | HTTP 403 `TENANT_SUSPENDED` |
| **Pending School Approval** | `School.status === 'pending'` | **NO** (Except SuperAdmin) | **NO** (Except SuperAdmin) | HTTP 403 `TENANT_PENDING_APPROVAL` |

---

## 14. Password Reset & Account Setup Architecture

```
[1. User Requests Password Reset]
   POST /api/v1/auth/password-reset/request { email: "user@school.edu" }
       │
       ▼
   ├── Look up User where email == targetEmail
   ├── Generate 32-byte cryptographically secure random token (rawToken)
   ├── Compute tokenHash = sha256(rawToken)
   ├── Store in Redis / Ephemeral Table with 15-minute TTL: reset:token:<tokenHash> -> userId
   └── Dispatch Email via emailService with link: https://app.sms.com/reset-password?token=<rawToken>
       (Always returns generic 200 OK to prevent email enumeration)
       │
       ▼
[2. User Submits New Password]
   POST /api/v1/auth/password-reset/confirm { token: "<rawToken>", newPassword: "..." }
       │
       ▼
   ├── Compute tokenHash = sha256(token)
   ├── Retrieve userId from Redis/Table (if expired or invalid -> HTTP 400 INVALID_OR_EXPIRED_TOKEN)
   ├── Validate newPassword against password policy
   ├── Hash newPassword with Argon2id -> newPasswordHash
   ├── Atomic Transaction:
   │     ├── UPDATE users SET password_hash = :newPasswordHash, token_version = token_version + 1 WHERE id = :userId
   │     └── UPDATE refresh_sessions SET revoked_at = NOW() WHERE user_id = :userId
   ├── Delete reset token (single-use enforcement)
   └── Return HTTP 200 OK ("Password updated successfully. Please log in with your new password.")
```

---

## 15. Redis Authentication Responsibilities

| Responsibility | Storage Mechanism | Fallback on Redis Outage | Security Invariant |
|---|---|---|---|
| **Rate Limiting** | Redis atomic INCR + EXPIRE (`rl:ip:<ip>`, `rl:login:<email>`) | In-memory sliding window Map | Requests continue with in-memory limits; never crashes. |
| **Ephemeral Reset Tokens** | `reset:token:<hash>` with 900s (15m) TTL | Fail-open / fallback DB table | Reset requests fail safely if token cannot be persisted. |
| **Hot Token Version Cache** | `cache:token_version:<userId>` (300s TTL) | Query PostgreSQL `User.tokenVersion` directly | Zero security degradation; falls back to authoritative DB. |
| **Permissions Cache** | `cache:perms:user:<userId>` (60s TTL) | Query PostgreSQL `UserRoleAssignment` directly | Zero security degradation; falls back to authoritative DB. |

---

## 16. Security Threat Model & Mitigations

| Threat | Risk Level | Mitigation in Phase 4B |
|---|---|---|
| **Brute-Force Password Guessing** | High | Redis rate limiter (5 failed attempts/min per IP and per account); Argon2id computational cost. |
| **Credential Stuffing** | High | Rate limiting + generic error messages ("Invalid email/admission number or password"). |
| **Refresh Token Theft & Replay** | High | Single-use rotation; SHA-256 token hashing; immediate revocation of all sessions upon reuse detection. |
| **Cross-Tenant Access / IDOR** | Critical | `tenant.middleware.js` derives tenant context strictly from verified JWT `schoolId`; rejects body/query spoofing. |
| **Forged `X-Tenant-Id` Header** | Critical | Tenant middleware validates user has verified `SUPER_ADMIN` system role and target school exists before switching context. |
| **Stale Permissions on Role Change** | Medium | Permissions evaluated on-demand from PostgreSQL; role modifications bust Redis permissions cache. |
| **Account Takeover via Reset Token** | High | Cryptographically random 32-byte tokens, 15-minute TTL, single-use consumption, session invalidation on reset. |
| **Timing Attacks on Authentication** | Medium | Native Argon2 constant-time verification; constant-time token comparison. |
| **Credential Leakage in Logs** | High | Pino logger automated redaction for `password`, `token`, `authorization`, `cookie`. |

---

## 17. Proposed API Contracts

### 1. `POST /api/v1/auth/login`
- **Auth**: Public
- **Rate Limit**: 5 req / min
- **Request Body**:
  ```json
  {
    "identifier": "user@school.edu", // Or admission number "ADM-001"
    "password": "SecurePassword123!",
    "schoolCode": "SchoolS024" // Required if logging in via admission number
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": "e9c4e270-26e1-43ac-8279-886ec13f4776",
        "email": "user@school.edu",
        "schoolId": "25e9637a-7fa4-4ac2-b43d-b4c0edcf2932",
        "systemRole": "TENANT_USER",
        "roles": ["Staffs"]
      },
      "accessToken": "eyJhbGciOi..."
    }
  }
  ```
  *(Refresh Token set in `HttpOnly; Secure; SameSite=Strict` cookie)*

### 2. `POST /api/v1/auth/refresh`
- **Auth**: Public (Requires Refresh Token Cookie or Body)
- **Success Response (200 OK)**: Returns new `accessToken` and rotates refresh cookie.

### 3. `POST /api/v1/auth/logout`
- **Auth**: Authenticated (Revokes active session record)
- **Success Response (200 OK)**: Clears refresh cookie and returns `{ success: true, message: "Logged out successfully" }`.

### 4. `POST /api/v1/auth/logout-all`
- **Auth**: Authenticated (Bumps `tokenVersion`, revokes all user sessions)
- **Success Response (200 OK)**: `{ success: true, message: "All sessions terminated" }`.

### 5. `GET /api/v1/auth/me`
- **Auth**: Authenticated (Bearer Token)
- **Success Response (200 OK)**: Returns full user profile, school details, assigned roles, and module permissions.

### 6. `POST /api/v1/auth/firebase/exchange`
- **Auth**: Public
- **Request Body**: `{ "firebaseToken": "eyJhbGciOi..." }`
- **Success Response (200 OK)**: Returns SMS Backend Access Token + sets Refresh Cookie.

### 7. `POST /api/v1/auth/password-reset/request`
- **Auth**: Public (Rate limited)
- **Request Body**: `{ "email": "user@school.edu" }`
- **Success Response (200 OK)**: `{ success: true, message: "If account exists, reset link has been dispatched" }`.

### 8. `POST /api/v1/auth/password-reset/confirm`
- **Auth**: Public
- **Request Body**: `{ "token": "...", "newPassword": "NewSecurePassword123!" }`
- **Success Response (200 OK)**: `{ success: true, message: "Password reset successful" }`.

---

## 18. Target Phase 4B File Structure

```
backend/src/
├── config/
│   ├── env.js                                (Add JWT secret configs)
│   └── constants.js                          (Add auth error codes & token expiries)
│
├── modules/
│   └── auth/
│       ├── auth.controller.js                # Route handlers (login, refresh, logout, me, reset)
│       ├── auth.service.js                   # Authentication orchestration logic
│       ├── auth.repository.js                # Prisma database operations for users & sessions
│       ├── auth.routes.js                    # Router mounting /api/v1/auth/*
│       ├── auth.schemas.js                   # Zod validation schemas
│       ├── token.service.js                  # JWT issuance, verification, token hashing
│       ├── password.service.js               # Argon2id password hashing and policy checks
│       ├── session.service.js                # Session rotation, invalidation, reuse detection
│       ├── admission-auth.service.js         # Student admission number -> Parent user resolution
│       └── firebase-bridge.service.js        # Firebase ID token verification and exchange
│
├── middleware/
│   ├── auth.middleware.js                    # Updated: verifies JWT, validates tokenVersion, sets req.user
│   └── tenant.middleware.js                  # Updated: strict SuperAdmin tenant switching validation
│
└── tests/
    ├── unit/
    │   ├── password.service.test.js
    │   ├── token.service.test.js
    │   ├── session.service.test.js
    │   └── admission-auth.service.test.js
    ├── integration/
    │   ├── auth-login.test.js
    │   ├── auth-refresh.test.js
    │   ├── auth-me.test.js
    │   ├── auth-password-reset.test.js
    │   └── firebase-bridge.test.js
    └── security/
        ├── token-reuse-revocation.test.js
        ├── superadmin-tenant-switch.test.js
        └── brute-force-rate-limit.test.js
```

---

## 19. Prisma Schema Impact

- **Database Schema Changes Required**: **ZERO (0)**
- The existing Prisma schema (`User`, `RefreshSession`, `School`, `SchoolRole`, `UserRoleAssignment`, `RolePermission`, `ParentProfile`, `ParentStudentLink`, `Student`) completely and natively supports all Phase 4B requirements.
- No database migrations, alterations, or schema pushes are needed.

---

## 20. Comprehensive Test Strategy

### A. Unit Tests:
- `password.service.test.js`: Hashing correctness, valid verification, bad password rejection, rejection of `!LOCKED_*` placeholders, policy enforcement.
- `token.service.test.js`: Access token issuance, 15m expiry calculation, signature tampering rejection, refresh token hashing.
- `session.service.test.js`: Session creation, rotation, revocation, reuse detection family revocation.
- `admission-auth.service.test.js`: Resolution from admission number + schoolCode to parent user.

### B. Integration Tests:
- `auth-login.test.js`: Email login, admission number login, invalid credentials (401), disabled account (403), locked placeholder account (403).
- `auth-refresh.test.js`: Valid refresh token rotation, expired refresh token (401), revoked refresh token (401).
- `auth-me.test.js`: Authenticated profile retrieval, role and permission resolution.
- `auth-password-reset.test.js`: Request reset token, confirm reset, session revocation verification.
- `firebase-bridge.test.js`: Firebase token exchange for valid UID mapping, fallback email mapping, unknown user rejection.

### C. Security Tests:
- `token-reuse-revocation.test.js`: Replaying old refresh token immediately invalidates all user sessions and bumps `tokenVersion`.
- `superadmin-tenant-switch.test.js`: Valid SuperAdmin tenant switching with `X-Tenant-Id`; rejection of non-existent school; rejection of tenant switching attempt by regular institutional user.
- `brute-force-rate-limit.test.js`: 5 failed login attempts trigger HTTP 429 `RATE_LIMIT_EXCEEDED` with `Retry-After` header.

---

## 21. Sub-Phase Implementation Breakdown

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Phase 4B.1: Core Crypto & Token Services                                │
│ Scope: Install argon2, jsonwebtoken; implement password.service.js,     │
│        token.service.js, session.service.js, auth.repository.js + tests │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
┌────────────────────────────────────▼────────────────────────────────────┐
│ Phase 4B.2: Primary Authentication APIs                                 │
│ Scope: auth.schemas.js, auth.service.js, auth.controller.js,           │
│        auth.routes.js (/login, /refresh, /logout, /logout-all, /me)     │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
┌────────────────────────────────────▼────────────────────────────────────┐
│ Phase 4B.3: Middleware Integration & SuperAdmin Tenant Switching        │
│ Scope: Update auth.middleware.js (JWT verification & req.user binding), │
│        update tenant.middleware.js (verified SuperAdmin tenant switch)  │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
┌────────────────────────────────────▼────────────────────────────────────┐
│ Phase 4B.4: Admission-Number Authentication & Resolution Pipeline       │
│ Scope: admission-auth.service.js, integration with /login endpoint     │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
┌────────────────────────────────────▼────────────────────────────────────┐
│ Phase 4B.5: Password Reset & First-Time Account Setup                   │
│ Scope: /password-reset/request, /password-reset/confirm, email dispatch │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
┌────────────────────────────────────▼────────────────────────────────────┐
│ Phase 4B.6: Firebase Coexistence Bridge & Security Hardening           │
│ Scope: firebase-bridge.service.js (/firebase/exchange), rate limiters,  │
│        security test suites, full quality gates verification            │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 22. Risks, Mitigations & Rollback Strategy

| Risk | Mitigation | Rollback Strategy |
|---|---|---|
| **100% of migrated users have locked password hashes** | Provide Firebase Token Exchange Bridge + Password Reset onboarding workflow. | Live frontend continues using Firebase Auth seamlessly during transition. |
| **Adversary attempts to guess admission numbers** | Rate limit login endpoint; return uniform error responses without disclosing whether student/school exists. | In-memory and Redis rate limiting blocks brute-force. |
| **Adversary attempts to forge `X-Tenant-Id`** | Enforce that `X-Tenant-Id` is strictly ignored unless JWT is verified as `SUPER_ADMIN`. | Tenant middleware rejects all non-SuperAdmin overrides. |

---

## 23. Explicit Assumptions

1. **[PROPOSED]**: SuperAdmin users have `User.schoolId = null` and `systemRole = 'SUPER_ADMIN'`.
2. **[PROPOSED]**: Access tokens expire in 15 minutes; Refresh tokens expire in 7 days.
3. **[VERIFIED]**: All regular institutional staff and parents belong to exactly one primary school tenant.
4. **[VERIFIED]**: The PostgreSQL database schema requires zero modifications for Phase 4B.

---

## 24. Open Questions & Resolutions

| # | Question | Resolution in Architecture |
|---|---|---|
| 1 | Should Refresh Tokens be delivered via Cookies or Response JSON? | **Resolution**: Deliver via `HttpOnly; Secure; SameSite=Strict` cookies to prevent XSS exfiltration, while also supporting response JSON for mobile/programmatic clients. |
| 2 | How to handle multi-parent households linked to the same student admission number? | **Resolution**: If multiple parents are linked to a student, the login service evaluates credentials against candidate accounts or requests parent email for disambiguation. |
| 3 | Should Firebase Admin SDK be added to backend dependencies for token exchange? | **Resolution**: Yes, in Phase 4B.6, `firebase-admin` will be utilized solely inside `firebase-bridge.service.js` to verify legacy Firebase ID tokens. |

---

## 25. Phase 4B Acceptance Criteria

Phase 4B implementation will be considered complete only when:
1. `POST /api/v1/auth/login` successfully authenticates email and admission number credentials and returns valid JWTs.
2. `POST /api/v1/auth/refresh` rotates refresh tokens and enforces reuse detection (theft revokes all sessions).
3. `POST /api/v1/auth/logout` and `/logout-all` revoke sessions and invalidate tokens via `tokenVersion`.
4. `GET /api/v1/auth/me` returns verified user identity, school details, roles, and permissions.
5. `auth.middleware.js` verifies JWT signatures, validates `tokenVersion`, and attaches `req.user`.
6. `tenant.middleware.js` strictly permits tenant switching for verified SuperAdmins while rejecting client overrides for regular users.
7. `POST /api/v1/auth/firebase/exchange` bridges Firebase Auth users into backend JWT sessions.
8. Zero regressions on existing tenant fixture data (S024: 340 students, 104 invoices, 328 parents; S015: 375 students, 317 parents).
9. Full test suite passes with 100% success rate (`npm test`), 0 lint errors (`npm run lint`), and valid Prisma schema (`npm run prisma:validate`).
