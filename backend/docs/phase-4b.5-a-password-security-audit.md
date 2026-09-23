# Phase 4B.5-A — Password Setup & Reset Security Audit & Architecture Specification

## 1. Scope
This document provides the authoritative security audit and architectural design for **Phase 4B.5: Password Setup, Reset, and Account Ownership Verification** for the School Management System (SMS) SaaS backend.

### Audit Invariant:
- **READ-ONLY AUDIT ONLY**: No database writes, no schema migrations, no account unlocks, no credential mutations, and no code implementations were performed during this phase.

---

## 2. Existing Implementation Audit

| Component | Current Implementation File | Existing Status & Capabilities | Gaps / Required Additions |
|---|---|---|---|
| **Password Policy & Hashing** | `backend/src/modules/auth/password.service.js` | RFC 9106 Argon2id (64MB, 3 iterations, 4 threads), constant-time verify, `isLockedPassword()` checking `!LOCKED_*`, 8–128 character policy (uppercase, lowercase, number). | Fully capable. Reusable without modification. |
| **Token Generation & JWT** | `backend/src/modules/auth/token.service.js` | Minimal-claim JWT access tokens (15m TTL), deterministic SHA-256 token hashing (`crypto.createHash('sha256')`). | Needs reset token generation helper (`generateResetToken()`). |
| **Session & Revocation** | `backend/src/modules/auth/session.service.js` | RefreshSession creation, atomic rotation, user-wide revocation (`revokeAllUserSessions`), atomic `tokenVersion` increment. | Reusable for post-reset session invalidation. |
| **Authentication Repository** | `backend/src/modules/auth/auth.repository.js` | User lookups (`findUserById`, `findUserByEmail`, `findUserByLegacyFirestoreId`), `findSchoolByCode`, `findStudentWithParentsByAdmissionNumber`, session CRUD. | Needs reset token repository operations. |
| **Rate Limiting** | `backend/src/middleware/rate-limit.middleware.js` | Atomic Redis INCR + TTL with in-memory sliding window fallback. | Reusable with dedicated key prefixes for reset requests and OTP verifications. |
| **Prisma Schema** | `backend/prisma/schema.prisma` | `User`, `RefreshSession`, `School`, `Student`, `ParentProfile`, `ParentStudentLink`, `StaffProfile`. | Contains **NO** `PasswordResetToken` table. |
| **Email / SMS Delivery** | None | No email or SMS packages installed in `package.json`. | External infrastructure dependency. |
| **Redis Infrastructure** | `backend/src/database/redis.client.js` | ioredis client configured with fail-open error handling. | Fully capable for rate limiting and ephemeral OTP attempt throttling. |

---

## 3. Migrated Account State Audit (Read-Only Findings)

A read-only audit of the migrated PostgreSQL database across all tenants (`SchoolS024`, `SchoolS015`, `SchoolS019`, `SYSTEM_TEMPLATE`) yielded the following aggregate facts:

### Account & Password Distribution:
- **Total User Records in PostgreSQL**: **686**
- **Locked Accounts (`passwordHash.startsWith('!LOCKED_')`)**: **686 (100.0%)**
- **Active Real Passwords**: **0 (0.0%)**
- **Password Algorithm Field**: `argon2id` (100% of rows)
- **Active Status**: `isActive: true` for 100% of accounts.

### Exact Locked Placeholder Breakdown:
1. `!LOCKED_PARENT_NO_DIRECT_AUTH` (**643 users**):
   - Migrated parent accounts across S015 (315 users) and S024 (328 users).
2. `!LOCKED_FIREBASE_AUTH_MANAGED` (**38 users**):
   - Migrated staff/teacher accounts in S024 whose credentials live in Firebase Authentication.
3. `!LOCKED_FUTURE_AUTH_REQUIRED` (**5 users**):
   - School Admin and institutional template accounts.

### Email & Contact Breakdown by School:
1. **School S015 (`TrustITec College`)**:
   - `ParentProfile` records: 317 (linked 1:1 to User).
   - Profile Phone numbers: 315 present, 2 empty.
   - Profile Emails: 317 synthetic emails (e.g. `p_phone_9750158760@s015.parent.local`).
   - `User.legacyFirestoreId`: 0 populated (all null).
   - Linked Students: 375 students across 317 parents (58 parents have >1 student).
2. **School S024 (`Spring Mount Valley School`)**:
   - `ParentProfile` records: 328 (linked 1:1 to User).
   - Profile Phone numbers: 157 present, 171 empty (`null`).
   - Profile Emails: 0 present (`null`).
   - `User.email`: 328 synthetic internal emails (`parent.<name>_<docId>@s024.sms.internal`).
   - `User.legacyFirestoreId`: 328 populated with original Firestore document IDs.
   - Linked Students: 340 students across 328 parents (12 parents have >1 student).
   - Staff Users: 38 teachers with real institutional emails (`@springmount.co.in`) and Firebase Auth UIDs in `legacyFirestoreId`.

---

## 4. Account Ownership & Recovery Evidence

### Verification Status Classification:
| Identifier / Attribute | Storage Location | Population Count | Verification Status | Trustworthiness for Out-of-Band Reset |
|---|---|---|---|---|
| **Institutional Staff Emails** | `User.email` (`@springmount.co.in`, `@trustitec.com`) | 40 staff | **VERIFIED** | **HIGH**: Can receive standard email password reset links. |
| **Synthetic Parent Emails** | `User.email` (`*.sms.internal`, `*.parent.local`) | 643 parents | **SYNTHETIC (UNVERIFIED)** | **ZERO**: Cannot receive SMTP emails. Non-routable internal domains. |
| **Parent Mobile Numbers (S015)** | `ParentProfile.phone` | 315 parents | **UNKNOWN** | **MEDIUM**: Sourced from legacy SIS records. Requires SMS OTP challenge. |
| **Parent Mobile Numbers (S024)** | `ParentProfile.phone` | 157 parents (171 missing) | **UNKNOWN / INCOMPLETE** | **LOW/INSUFFICIENT**: Over 52% of parents lack a phone number entirely. |
| **Firebase Auth Session** | Client SDK / Firebase ID Token | S024 staff & parents | **VERIFIED** | **HIGH**: Proves active live possession of Firebase credential. |
| **Admission Number + School Code** | `Student.admissionNumber` + `School.code` | All students | **INSTITUTIONAL METADATA** | **INSUFFICIENT ALONE**: Proves student identity, not parent account ownership. |

### Conclusion on Account Ownership:
1. **Staff / Admin Users**: Can use standard email-based password reset via verified institutional email.
2. **Migrated Parents**: Cannot use email reset due to synthetic email addresses. Account ownership must be established through:
   - **Primary Bridge Flow (Phase 4B.6)**: Firebase Token Exchange (`POST /auth/firebase/exchange`) for users currently logging in via Firebase Auth.
   - **Institutional Setup Flow**: School Administrator-generated invitation tokens OR Student Admission Number + Registered Mobile SMS OTP challenge (where mobile exists) OR School Admin in-person onboarding.

---

## 5. First-Time Password Setup Design

### Target Flow for First-Time Setup:
```
[User / Parent / Staff]
        │
        ├── Case A: Live Firebase Session (Phase 4B.6 Bridge)
        │      ↳ Client exchanges Firebase ID Token -> Sets initial Argon2id password
        │
        └── Case B: Administrator-Issued Setup Invitation Link
               ↳ Link: https://app.sms.com/setup-password?token=<rawSetupToken>
                      │
                      ▼
               POST /api/v1/auth/password-setup/complete
               Body: { token: "<rawSetupToken>", newPassword: "NewSecurePassword123!" }
```

### Security Properties of First-Time Setup:
1. **Initiation**: Triggered by verified Firebase session OR by School Admin issuing an invitation from the admin portal.
2. **Setup Token Specification**:
   - 32 bytes cryptographically secure random bytes (`crypto.randomBytes(32).toString('hex')` -> 64 hex characters, 256 bits entropy).
   - Stored in PostgreSQL `password_reset_tokens` table hashed with SHA-256 (`tokenHash`).
   - Short TTL: 24 hours for invitations, 15 minutes for reset requests.
   - Single-use consumption enforced via atomic query:
     `UPDATE password_reset_tokens SET used_at = NOW() WHERE token_hash = :hash AND used_at IS NULL AND expires_at > NOW()`.
3. **Atomic Execution**:
   - Sets `User.passwordHash = newArgon2idHash`.
   - Increments `User.tokenVersion = tokenVersion + 1`.
   - Marks `token.usedAt = NOW()`.
   - Revokes all active `RefreshSession` rows.
4. **Transition from `!LOCKED_*`**:
   - When new password is saved, the old `!LOCKED_PARENT_NO_DIRECT_AUTH` or `!LOCKED_FIREBASE_AUTH_MANAGED` placeholder is overwritten with the valid `$argon2id$...` hash.
   - Account immediately becomes eligible for standard email login and admission-number login.
5. **Replay & Concurrency Protection**:
   - Double setup attempts fail because `used_at IS NOT NULL`.
   - Concurrent setup attempts fail via database row-level locking or atomic update return count (`count === 1`).

---

## 6. Password Reset Design

### Target Endpoints:
1. `POST /api/v1/auth/password-reset/request`
2. `POST /api/v1/auth/password-reset/confirm`

### 1. Reset Request (`POST /api/v1/auth/password-reset/request`):
- **Auth**: Public
- **Rate Limit**: 5 requests / minute per IP and per email/account.
- **Request Body**:
  ```json
  {
    "email": "priyanka.s@springmount.co.in"
  }
  ```
- **Execution**:
  1. Validate email format.
  2. Query `User` by lowercase trimmed email.
  3. If user does NOT exist, is inactive, or has a synthetic unroutable email:
     - Return identical generic 200 OK response (prevents account/email enumeration).
  4. If user exists and has a deliverable email:
     - Invalidate any existing unused reset tokens for this user (`UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = :userId AND used_at IS NULL`).
     - Generate 32-byte raw token `rawToken`.
     - Compute `tokenHash = sha256(rawToken)`.
     - Insert `PasswordResetToken` record (`userId`, `tokenHash`, `expiresAt = NOW() + 15m`).
     - Dispatch email with link `https://app.sms.com/reset-password?token=${rawToken}`.
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "If the account exists and is eligible, password reset instructions have been dispatched."
  }
  ```

### 2. Reset Confirmation (`POST /api/v1/auth/password-reset/confirm`):
- **Auth**: Public
- **Rate Limit**: 10 requests / minute per IP.
- **Request Body**:
  ```json
  {
    "token": "64_character_hex_raw_token",
    "newPassword": "NewSecurePassword123!"
  }
  ```
- **Execution**:
  1. Validate `token` length (64 hex) and `newPassword` against password policy.
  2. Compute `tokenHash = sha256(token)`.
  3. Atomic verification & consumption in PostgreSQL:
     ```sql
     UPDATE password_reset_tokens
     SET used_at = NOW()
     WHERE token_hash = :tokenHash
       AND used_at IS NULL
       AND expires_at > NOW()
     RETURNING user_id;
     ```
  4. If no row updated: throw `UnauthorizedError('Invalid or expired password reset token', ERROR_CODES.INVALID_TOKEN)`.
  5. Check user: `user = await findUserById(userId)`. Ensure `user.isActive === true`.
  6. Hash `newPassword` via `hashPassword(newPassword)` (Argon2id).
  7. Atomic User update:
     - `UPDATE users SET password_hash = :newHash, token_version = token_version + 1 WHERE id = :userId`.
     - `UPDATE refresh_sessions SET revoked_at = NOW() WHERE user_id = :userId AND revoked_at IS NULL`.
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Password has been successfully updated. Please log in with your new credentials."
  }
  ```

---

## 7. Password Change Assessment (`POST /api/v1/auth/change-password`)

### Assessment:
Password Change for an **already authenticated user** who knows their current password is an essential credential management feature.

### Security Requirements:
- **Auth**: Authenticated (Requires valid Bearer access token).
- **Request Body**:
  ```json
  {
    "currentPassword": "OldPassword123!",
    "newPassword": "NewPassword456!"
  }
  ```
- **Execution**:
  1. Load authenticated user from DB (`req.auth.userId`).
  2. Verify current account is not locked (`!isLockedPassword(user.passwordHash)`).
  3. Verify `currentPassword` against `user.passwordHash` using `verifyPassword`.
  4. Verify `newPassword` meets password policy.
  5. Verify `newPassword !== currentPassword` (prevent identical password reuse).
  6. Hash `newPassword` with Argon2id.
  7. Atomic update: `User.passwordHash = newHash`, `User.tokenVersion = tokenVersion + 1`.
  8. Revoke all active `RefreshSession` records for this user.
- **Recommendation**: Implement `POST /api/v1/auth/change-password` as part of Phase 4B.5 implementation.

---

## 8. Token / OTP Architecture Comparison

| Property | Opaque Random Token (Recommended for Email Links) | Numeric OTP (Recommended for SMS/WhatsApp) | Signed JWT Reset Token |
|---|---|---|---|
| **Entropy** | 256 bits (32 random bytes) | 20 bits (6 decimal digits: 100,000–999,999) | Cryptographic signature |
| **Storage at Rest** | SHA-256 hash in PostgreSQL | SHA-256 hash in Redis with attempt counter | Stateless (in token) or DB blacklist |
| **Brute-Force Risk** | Impossible ($2^{256}$ space) | High without strict attempt rate limiter (max 5 attempts) | Low against signature, high against secret |
| **Replay Protection** | Atomic DB `usedAt` flag | Atomic Redis DEL on first verification | Requires DB blacklist table or `tokenVersion` coupling |
| **URL Suitability** | Excellent for clickable email links | Poor for links; requires manual code typing | Long URL query string |
| **Recommendation** | **Primary choice for email reset & admin invitation setup links**. | **Secondary choice for future SMS mobile recovery**. | **NOT recommended** (creates unnecessary secret complexity and requires DB state anyway for single-use). |

---

## 9. Redis vs PostgreSQL Responsibilities

```
┌────────────────────────────────────────────────────────────────────────┐
│                              POSTGRESQL                                │
│  (Persistent Source of Truth, ACID Transactions, Durable Auditability) │
├────────────────────────────────────────────────────────────────────────┤
│  • PasswordResetToken Table (durable tokenHash, expiresAt, usedAt)     │
│  • User passwordHash and tokenVersion updates                          │
│  • RefreshSession revocation                                           │
│  • AuditLog recording                                                  │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                                 REDIS                                  │
│         (Ephemeral State, Rate Limiting, Brute-Force Defense)          │
├────────────────────────────────────────────────────────────────────────┤
│  • Rate Limiting: rl:pwd_reset:ip:<ip> (5 req/min)                     │
│  • Account Throttling: rl:pwd_reset:account:<email> (3 req/15min)      │
│  • OTP Brute-Force Throttle: rl:otp_attempts:<id> (max 5 attempts)     │
│  • In-Memory Fallback when Redis is offline (Fail-Open)                │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Rate Limiting Strategy

| Endpoint / Operation | Rate Limit Window | Max Requests | Redis Key Pattern | Action on Limit Exceeded |
|---|---|---|---|---|
| `POST /password-reset/request` (IP) | 60 seconds | 5 requests | `rl:pwd_reset_req:ip:<ip>` | HTTP 429 `RATE_LIMIT_EXCEEDED` |
| `POST /password-reset/request` (Account) | 900 seconds (15m) | 3 requests | `rl:pwd_reset_req:acc:<email>` | Returns generic 200 OK (silent drop to prevent enumeration) |
| `POST /password-reset/confirm` (IP) | 60 seconds | 10 requests | `rl:pwd_reset_conf:ip:<ip>` | HTTP 429 `RATE_LIMIT_EXCEEDED` |
| `POST /password-setup/complete` (IP) | 60 seconds | 10 requests | `rl:pwd_setup:ip:<ip>` | HTTP 429 `RATE_LIMIT_EXCEEDED` |
| `POST /change-password` (Authenticated) | 60 seconds | 5 requests | `rl:pwd_change:user:<userId>` | HTTP 429 `RATE_LIMIT_EXCEEDED` |

---

## 11. Session Invalidation Invariant

Upon any successful password modification (First-Time Setup, Password Reset, Password Change):

1. **`User.tokenVersion` is incremented**:
   ```sql
   UPDATE users SET token_version = token_version + 1, password_hash = :newHash WHERE id = :userId;
   ```
   - **Effect**: All existing JWT access tokens (which contain the previous `tokenVersion`) are immediately rejected by `auth.middleware.js` with HTTP 401 `INVALID_TOKEN`.
2. **All active `RefreshSession` rows are revoked**:
   ```sql
   UPDATE refresh_sessions SET revoked_at = NOW() WHERE user_id = :userId AND revoked_at IS NULL;
   ```
   - **Effect**: Any attempt to rotate an existing refresh token is rejected with HTTP 401.
3. **Client Flow**:
   - Client is instructed to log in freshly with the new password.
   - For `change-password`, an updated JWT and fresh refresh cookie may optionally be issued to maintain active session on the modifying device.

---

## 12. Tenant Isolation Invariants

1. **Global vs Tenant Identity**:
   - `User` is a global model, with `schoolId` populated for institutional users.
   - Password reset request operates globally by verified email (`where: { email: normalizedEmail }`).
   - The resolved `User.schoolId` must be checked against `School.status`: if the school is `suspended`, password reset is rejected with `403 TENANT_ACCESS_ERROR`.
2. **No Client-Supplied Tenant Authority**:
   - Client-provided `schoolId`, `tenantId`, `X-Tenant-Id`, or `X-School-Id` headers are completely ignored.
   - A School A administrator cannot initiate or complete a password setup for a School B user.

---

## 13. Multi-Parent Recovery Strategy

- In the multi-tenant relational schema:
  `Student` 1:N `ParentStudentLink` N:1 `ParentProfile` 1:1 `User`.
- **Critical Security Invariant**: Password reset CANNOT be requested via Student Admission Number alone without identifying which parent is requesting the reset.
- **Disambiguation Rules**:
  1. If reset is initiated via email: `User.email` uniquely identifies the parent account.
  2. If reset is initiated via student admission number in an institutional portal:
     - The portal lists candidate parent names/masked phones (e.g. `Father: AN*** (***-***-8760)`).
     - The user selects their specific parent profile and submits the challenge to their registered mobile.
     - Reset applies strictly to that parent `User` record without affecting other linked parents.

---

## 14. Firebase Transition Dependency (Phase 4B.6 Interaction)

- The frontend currently authenticates users against Firebase Auth.
- All 38 S024 teachers have valid Firebase UIDs stored in `User.legacyFirestoreId`.
- **Interaction with Phase 4B.6**:
  - Phase 4B.6 will introduce `POST /api/v1/auth/firebase/exchange`.
  - Migrated users with Firebase credentials can exchange their Firebase token to establish backend JWTs and subsequently call `POST /api/v1/auth/change-password` or first-time setup without requiring email delivery.
  - Phase 4B.5 password reset/setup endpoints will be fully operational standalone (via database tokens) and will seamlessly integrate with the Phase 4B.6 bridge.

---

## 15. Email / SMS Provider Dependency

### Current Status:
- No email library (e.g. `nodemailer`, `resend`) or SMS provider SDK (e.g. `twilio`) is currently present in `backend/package.json`.
- In test and local development environments, a **mock/noop notification service** will log the reset URL (`logger.info({ resetUrl })`) to allow automated test execution and local testing.
- For production deployment, a dedicated email transport module (`backend/src/services/email.service.js`) using standard SMTP or modern transactional API will be plugged in via configuration (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`).

---

## 16. Audit Logging

Security-critical password events will be recorded via `backend/src/utils/logger.js` (and optionally `AuditLog` table for tenant admin actions):

| Event Name | Log Level | Logged Attributes (Safe) | Redacted / Forbidden Attributes |
|---|---|---|---|
| `PASSWORD_SETUP_REQUESTED` | `INFO` | `userId`, `schoolId`, `ipAddress` | `token`, `password` |
| `PASSWORD_SETUP_COMPLETED` | `INFO` | `userId`, `schoolId`, `ipAddress` | `password`, `passwordHash` |
| `PASSWORD_RESET_REQUESTED` | `INFO` | `ipAddress`, `emailDomain` | `rawToken`, `fullEmail` (if non-existent) |
| `PASSWORD_RESET_COMPLETED` | `INFO` | `userId`, `schoolId`, `ipAddress` | `password`, `rawToken` |
| `PASSWORD_RESET_FAILED` | `WARN` | `reason`, `ipAddress` | `token` |
| `PASSWORD_CHANGED` | `INFO` | `userId`, `schoolId`, `ipAddress` | `currentPassword`, `newPassword` |

---

## 17. Security Threat Model & Mitigations

| # | Threat | Severity | Mitigation Strategy in Phase 4B.5 |
|---|---|---|---|
| 1 | **Account Enumeration via Reset** | High | Generic response for existing and non-existing accounts ("If account exists, instructions sent"). Identical response times. |
| 2 | **Brute-Force Reset Tokens** | Critical | 256-bit cryptographically random tokens ($2^{256}$ search space). Impossible to guess. |
| 3 | **Token Leakage in Logs/DB** | High | Tokens are SHA-256 hashed before saving to PostgreSQL. Raw tokens exist only in memory and in the dispatched link. |
| 4 | **Reset Token Replay / Reuse** | High | Atomic single-use consumption (`WHERE used_at IS NULL`). Second attempt is rejected. |
| 5 | **Expired Token Exploitation** | Medium | 15-minute TTL strictly enforced in SQL query (`expires_at > NOW()`). |
| 6 | **Session Fixation / Lingering Sessions** | Critical | Instant `tokenVersion` increment + all active `RefreshSession` revocation on password update. |
| 7 | **Weak Password Choice** | Medium | Enforces 8–128 chars, uppercase, lowercase, numeric policy via `validatePasswordPolicy()`. |
| 8 | **Concurrent Reset Race Condition** | High | Atomic single-query `UPDATE ... WHERE used_at IS NULL RETURNING user_id` prevents duplicate consumption. |
| 9 | **Cross-Tenant Reset Attack** | Critical | User lookup verifies tenant eligibility and school status; client tenant headers are ignored. |
| 10 | **Locked Account Downgrade** | Critical | Overwrites `!LOCKED_*` only with verified Argon2id hash; never unlocks without valid password policy compliance. |

---

## 18. Proposed API Endpoints for Phase 4B.5-B

1. **`POST /api/v1/auth/password-reset/request`** (Public, Rate-Limited)
   - Input: `{ "email": "string" }`
   - Output: `{ "success": true, "message": "If the account exists..." }`
2. **`POST /api/v1/auth/password-reset/confirm`** (Public, Rate-Limited)
   - Input: `{ "token": "string", "newPassword": "string" }`
   - Output: `{ "success": true, "message": "Password updated successfully." }`
3. **`POST /api/v1/auth/password-setup/complete`** (Public, Rate-Limited)
   - Input: `{ "token": "string", "newPassword": "string" }`
   - Output: `{ "success": true, "message": "Account setup complete. Please log in." }`
4. **`POST /api/v1/auth/change-password`** (Authenticated)
   - Input: `{ "currentPassword": "string", "newPassword": "string" }`
   - Output: `{ "success": true, "message": "Password changed successfully." }`

---

## 19. Proposed Database Changes (for Phase 4B.5-B)

To support durable, auditable, and replay-resistant password reset and invitation tokens, a dedicated `PasswordResetToken` model in `prisma/schema.prisma` is proposed for Phase 4B.5-B:

```prisma
model PasswordResetToken {
  id        String    @id @default(uuid()) @db.Uuid
  userId    String    @map("user_id") @db.Uuid
  tokenHash String    @unique @map("token_hash") @db.VarChar(255)
  tokenType String    @default("RESET") @map("token_type") @db.VarChar(30) // RESET | SETUP_INVITE
  ipAddress String?   @map("ip_address") @db.VarChar(45)
  expiresAt DateTime  @map("expires_at")
  usedAt    DateTime? @map("used_at")
  createdAt DateTime  @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([tokenHash, usedAt, expiresAt])
  @@map("password_reset_tokens")
}
```

*Note: In `tenant-extension.js`, `PasswordResetToken` will be added to `GLOBAL_MODELS` since reset tokens are keyed by global `userId`.*

---

## 20. Proposed File Structure for Phase 4B.5-B

```
backend/src/
├── modules/auth/
│   ├── password-reset.service.js             # Password reset & setup domain orchestration
│   ├── password-reset.schemas.js             # Zod validation schemas
│   ├── auth.controller.js                    # Handlers for reset-request, reset-confirm, setup, change-password
│   ├── auth.repository.js                    # CRUD queries for PasswordResetToken
│   └── auth.routes.js                        # Mounted routes under /api/v1/auth/*
└── services/
    └── email.service.js                      # Email delivery abstraction (mock in dev/test)
```

---

## 21. Required Test Matrix for Phase 4B.5-B

### Unit Tests:
- `password-reset.service.test.js`:
  - Reset token generation with SHA-256 hash.
  - Reset request for valid user -> token created, email dispatched.
  - Reset request for unknown email -> generic response, 0 tokens created.
  - Reset request for inactive user -> generic response.
  - Reset confirm with valid token & valid password -> password updated, `tokenVersion` incremented, sessions revoked.
  - Reset confirm with expired token -> rejected.
  - Reset confirm with already used token -> rejected.
  - Reset confirm with weak password -> rejected by policy.
  - First-time setup with valid invitation token -> unlocks `!LOCKED_*` account to Argon2id.
  - Change password with valid current password -> password updated, sessions revoked.
  - Change password with invalid current password -> rejected.
  - Change password with identical new password -> rejected.

### Integration Tests:
- `auth-password-reset.test.js`:
  - `POST /password-reset/request` returns 200 OK without email leakage.
  - `POST /password-reset/confirm` with valid token returns 200 OK.
  - `POST /password-reset/confirm` with invalid token returns 401.
  - `POST /password-setup/complete` returns 200 OK.
  - `POST /change-password` requires Bearer auth and updates credentials.

### Security Tests:
- Rate limit enforcement on reset request (5 req/min) and confirm (10 req/min).
- Session invalidation proof: previous access JWT rejected after password reset.
- Token hashing proof: raw token never stored in database.

---

## 22. Implementation Dependencies
1. **Prisma Schema Update & Migration**: Addition of `PasswordResetToken` table to `prisma/schema.prisma` and execution of `prisma migrate deploy`.
2. **Email Delivery Configuration**: Standard SMTP or mock transport for staging/production delivery.

---

## 23. Security Decisions Requiring Approval
1. **PasswordResetToken Table Addition**: Adding the `PasswordResetToken` table to PostgreSQL vs storing purely in Redis. *(Recommendation: PostgreSQL table with SHA-256 hash for durability and auditability)*.
2. **First-Time Parent Onboarding Flow**: Supporting Admin Invitation Tokens + Firebase Bridge Exchange (Phase 4B.6) as the authoritative channels for unlocking migrated parents. *(Recommendation: Approved)*.
3. **Inclusion of Authenticated `/change-password`**: Including `POST /api/v1/auth/change-password` within Phase 4B.5 scope. *(Recommendation: Approved)*.

---

## 24. Implementation Plan for Phase 4B.5-B (Ordered Steps)

1. **Step 1: Schema & Model Setup**:
   - Add `PasswordResetToken` model to `schema.prisma`.
   - Update `tenant-extension.js` `GLOBAL_MODELS` to include `PasswordResetToken`.
   - Generate Prisma Client (`prisma generate`).
2. **Step 2: Repository Operations**:
   - Add `createPasswordResetToken`, `findValidResetTokenByHash`, `markResetTokenUsed`, `invalidateUserResetTokens` in `auth.repository.js`.
3. **Step 3: Service Implementation**:
   - Implement `password-reset.service.js` covering `requestPasswordReset`, `confirmPasswordReset`, `completePasswordSetup`, and `changePassword`.
4. **Step 4: Schemas & Controllers**:
   - Create Zod validation schemas in `password-reset.schemas.js`.
   - Add controller actions in `auth.controller.js`.
5. **Step 5: Routes & Rate Limiting**:
   - Mount routes in `auth.routes.js` with dedicated rate limiters.
6. **Step 6: Comprehensive Testing & Verification**:
   - Unit, integration, security, and full regression test execution.

---

## 25. Safety Verification

During this Phase 4B.5-A audit:
- **PostgreSQL Database Writes**: **0**
- **Prisma Schema Changes**: **0**
- **Database Migrations Created**: **0**
- **Firebase / Firestore Writes**: **0**
- **Firebase Auth Writes**: **0**
- **Frontend Files Modified**: **0**
- **School S024 Data Mutations**: **0 (100% UNCHANGED)**
- **School S015 Data Mutations**: **0 (100% UNCHANGED)**
- **School S019 Data Mutations**: **0 (100% UNCHANGED)**
- **User Accounts Unlocked**: **0 (All 686 accounts remain locked)**

---

## 26. HARD STOP

**Phase 4B.5-A security audit and architectural specification is COMPLETE.**

- No password setup/reset implementation was performed.
- No accounts were unlocked.
- No credentials were changed.
- Phase 4B.5-B implementation has **NOT** started.
- Phase 4B.6 Firebase bridge has **NOT** started.
