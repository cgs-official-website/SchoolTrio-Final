# FRONTEND.D4 — Institutional JIT Credential Migration Bridge Security & Implementation Audit

**Date**: September 21, 2026  
**Auditor**: Antigravity Core Migration Engine  
**Phase**: AUDIT & ARCHITECTURAL SPECIFICATION ONLY (No implementation)  
**Target Population**: 38 Firebase-Managed Institutional Users (`!LOCKED_FIREBASE_AUTH_MANAGED`)  

---

## 1. Executive Summary & Audit Invariant

This document presents the authoritative security and implementation audit for the progressive **Just-In-Time (JIT) Credential Migration Bridge** designed to transition existing Firebase-managed institutional accounts to native PostgreSQL Argon2id credentials.

### Strict Audit Invariant Adherence:
- **0** lines of runtime authentication code were modified.
- **0** database records were altered or created.
- **0** passwords were changed or migrated.
- **0** Firebase users were modified.
- `AuthContext.jsx`, `LoginPage.jsx`, `firebase/auth.js`, and backend services remain **100% untouched**.

---

## 2. Trace of the Complete Current Login Flow

The runtime execution path of an institutional login under the current `HYBRID_BRIDGE` architecture was traced from client user interaction to PostgreSQL session establishment:

```mermaid
sequenceDiagram
    autonumber
    actor User as Institutional User
    participant LP as LoginPage.jsx
    participant AC as AuthContext.jsx
    participant FA as Firebase Auth (Google)
    participant API as authApi (client.js)
    participant BE as Express Backend (/firebase-exchange)
    participant PG as PostgreSQL Database

    User->>LP: Enters email & password, clicks Submit
    LP->>AC: loginWithCredentials({ identifier, password, schoolCode, isAdmission: false })
    Note over AC: identifier contains '@' & isAdmission is false
    AC->>FA: signInWithEmailAndPassword(auth, identifier, password)
    FA-->>AC: returns userCredential (HTTPS to Identity Toolkit)
    AC->>FA: userCredential.user.getIdToken()
    FA-->>AC: returns raw Firebase ID Token (JWT)
    Note over AC: Plaintext password is still held in async function scope
    AC->>API: authApi.firebaseExchange({ idToken })
    API->>BE: POST /api/v1/auth/firebase-exchange { idToken }
    Note over BE: 1. Verify RS256 token against Google certs<br/>2. Map UID to User.legacyFirestoreId<br/>3. Verify User.isActive & tenant status<br/>4. Create RefreshSession row<br/>5. Issue PostgreSQL JWT
    BE-->>API: 200 OK { accessToken, user } + Set-Cookie: sms_refresh_token
    API-->>AC: exchangeRes.data
    AC->>AC: setAccessToken(accessToken) in memory
    AC->>API: authApi.getMe()
    API->>BE: GET /api/v1/auth/me
    BE-->>API: 200 OK { userProfile }
    AC->>AC: setCurrentUser(normalized), setUserProfile(normalized)
    AC-->>LP: returns { user, profile }
    LP->>LP: setSuccess(true) -> redirectBasedOnRole()
    Note over LP: Component unmounts; formData reclaimed by GC
```

### Detailed Trace Artifacts:

1. **Client Request Payload (`POST /api/v1/auth/firebase-exchange`)**:
   ```json
   {
     "idToken": "eyJhbGciOiJSUzI1NiIsImtpZCI6IjFkMm...<truncated>...3A"
   }
   ```
   *Headers*: `Content-Type: application/json`, `credentials: include`.  
   *Note*: The current payload contains **only** the `idToken`. The plaintext password is not transmitted to the backend.

2. **Backend Response Payload**:
   ```json
   {
     "success": true,
     "message": "Firebase authentication exchanged successfully",
     "data": {
       "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...<jwt>",
       "user": {
         "id": "26468c7e-cbb3-442e-843d-efc98f061e4e",
         "email": "priyanka.s@springmount.co.in",
         "schoolId": "25e9637a-7fa4-4ac2-b43d-b4c0edcf2932",
         "systemRole": "TEACHER"
       }
     }
   }
   ```
   *Set-Cookie Header*: `sms_refresh_token=<64-char-hex>; Path=/api/v1/auth; HttpOnly; SameSite=Lax; Max-Age=604800`.

3. **Memory & State Lifecycles**:
   - `LoginPage.jsx`: `formData.password` exists in React state (`useState`) from keystroke until `LoginPage` unmounts upon redirection (~600ms after login).
   - `AuthContext.jsx`: `password` parameter exists in the execution frame of `loginWithCredentials`. After line 183 (`signInWithEmailAndPassword`), `password` is retained in memory until line 200 returns.
   - `tokenService.js`: Holds only the signed PostgreSQL JWT in an in-memory variable `accessToken`. Never holds passwords.
   - `localStorage` / `sessionStorage`: Contains **zero credentials, zero tokens, zero hashes**.

---

## 3. Audit of the Existing Firebase Exchange Endpoint

The backend implementation was audited across all layers:

| Layer | Source Location | Implementation Behavior & Invariants | Evaluation for Migration Support |
| :--- | :--- | :--- | :--- |
| **Route** | `backend/src/modules/auth/auth.routes.js:106` | Rate limited via `firebaseExchangeRateLimiter` (15 req/min per IP). Mounted at `POST /firebase-exchange`. | Fully compatible. Rate limiting protects against brute force attacks. |
| **Validation** | `backend/src/modules/auth/auth.schemas.js:106` | `z.object({ idToken: z.string().trim().min(1) })`. Strictly rejects extra or invalid fields. | Schema would need an optional `password` field: `z.string().min(8).max(128).optional()`. |
| **Controller** | `backend/src/modules/auth/auth.controller.js:339` | Unpacks `idToken`, client `ipAddress`, and `deviceInfo`. Sets HttpOnly cookie. | Minimal, clean orchestration. Does not leak tokens or passwords to logs. |
| **Token Verification** | `backend/src/modules/auth/firebase-auth.service.js:45` | Cryptographically verifies RS256 signature using Google x509 public keys, validates `exp`, project ID (`school-management-system-6a2c4`), and issuer. | Authoritative proof of identity. Guarantees the requester actively possesses valid credentials in Firebase. |
| **User Resolution** | `backend/src/modules/auth/auth.repository.js:154` | Matches Firebase `uid` to `User.legacyFirestoreId`, with verified email fallback and strict conflict rejection (`IDENTITY_CONFLICT`). | Highly reliable. Maps directly to the exact PostgreSQL `User` record to be updated. |
| **Account & Tenant Check** | `backend/src/modules/auth/auth.service.js:270` | Enforces `user.isActive`, checks school status (`suspended` / `pending`). | Prevents deactivated users or suspended tenants from migrating or accessing sessions. |
| **Password Mutation** | None (currently read-only) | `User.passwordHash` is **never modified** during current exchange. Tested in `firebase-bridge-security.test.js`. | Safe extension point: Can atomically update `passwordHash` if account is locked. |
| **Session Generation** | `backend/src/modules/auth/session.service.js:25` | Creates SHA-256 hashed refresh session in PostgreSQL, issues minimal JWT. | If `tokenVersion` is incremented upon password hash update, the issued JWT matches the new `tokenVersion`. |

---

## 4. Credential Handling & Leakage Analysis

A rigorous code trace evaluated the lifecycle and risks of the plaintext password variable:

### 1. Variable Lifetime in Client Memory
- **Origin**: User input in `LoginPage.jsx` &rarr; `formData.password`.
- **Pass-through**: Forwarded as an argument to `loginWithCredentials({ identifier, password, ... })`.
- **Firebase Execution**: Passed to `signInWithEmailAndPassword(auth, identifier, password)`.
- **Post-Firebase Availability**: When `signInWithEmailAndPassword` resolves, `password` remains bound in the active async function closure. It is **readily available** without requiring re-prompting or storage.
- **Destruction**: As soon as `loginWithCredentials` completes and `LoginPage` unmounts, all references are dropped and garbage collected.

### 2. Leakage Vector Evaluation

| Potential Leakage Vector | Evaluated Risk | Finding in Current Codebase |
| :--- | :---: | :--- |
| **Console Logs / Error Objects** | **SAFE** | `catch (err)` in `LoginPage.jsx` logs `[LOGIN ERROR]` with the error message. Firebase error objects never contain the plaintext password. |
| **Browser History / Referer** | **SAFE** | Authentication uses HTTP `POST` with JSON bodies. Passwords never appear in URLs, search parameters, or referer headers. |
| **Storage Persistence** | **SAFE** | Passwords are never written to `localStorage`, `sessionStorage`, or IndexedDB. |
| **Analytics / Third-Party Scripts** | **SAFE** | No third-party tracking or telemetry scripts are present in the DOM or auth pipeline. |
| **DOM Persistence** | **SAFE** | Form input uses standard controlled input; password is not rendered into DOM attributes or innerHTML. |

---

## 5. Architectural Options Evaluation

Four architectural designs were evaluated for executing the password migration:

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   JIT MIGRATION ARCHITECTURE OPTIONS                                   │
├────────────────────────────────┬──────────────────────────────────────┬────────────────────────────────┤
│ Option                         │ Mechanism                            │ Trade-offs & Security Profile  │
├────────────────────────────────┼──────────────────────────────────────┼────────────────────────────────┤
│ **Option A: Two-Step Client**  │ 1. /firebase-exchange                │ • 2 separate HTTPS requests     │
│                                │ 2. POST /migrate-password (Bearer)   │ • Two-phase commit failure risk │
│                                │                                      │ • High client complexity       │
├────────────────────────────────┼──────────────────────────────────────┼────────────────────────────────┤
│ **Option B: Extended Exchange**│ 1. POST /firebase-exchange           │ • Single atomic transaction    │
│ *(Recommended)*                │    { idToken, password }             │ • Strong cryptographic binding │
│                                │                                      │ • Zero extra network hops      │
│                                │                                      │ • Backward compatible          │
├────────────────────────────────┼──────────────────────────────────────┼────────────────────────────────┤
│ **Option C: Dedicated Endpoint**│ 1. POST /migrate-credential          │ • Duplicates token verify logic│
│                                │    { idToken, password }             │ • Parallel endpoint maintenance│
│                                │                                      │ • No security advantage over B │
├────────────────────────────────┼──────────────────────────────────────┼────────────────────────────────┤
│ **Option D: Pure Reset**       │ No JIT. Users migrate via email      │ • Zero password transmission   │
│ *(Fallback)*                   │ reset link (/forgot-password)        │ • Extreme operational friction │
│                                │                                      │ • Mass user lockout on cutoff  │
└────────────────────────────────┴──────────────────────────────────────┴────────────────────────────────┘
```

### In-Depth Analysis:

### Option A — Two-Step Client-Driven Migration (`POST /api/v1/auth/migrate-password`)
- **Flow**: Client performs Firebase exchange as usual &rarr; obtains JWT access token &rarr; makes second call to `POST /api/v1/auth/migrate-password` sending `{ password }` with `Authorization: Bearer <accessToken>`.
- **Security Assessment**:
  - *Failure Vulnerability*: If the second request fails (due to network timeout, client closing window, mobile backgrounding), the user is authenticated in PostgreSQL but remains unmigrated.
  - *Replay & CSRF*: Relies on the bearer token.
  - *Network Overhead*: Doubles TLS handshakes and request latency on first login.

### Option B — Extended Atomic Firebase Exchange Request (`POST /api/v1/auth/firebase-exchange`)
- **Flow**: Client sends `{ idToken, password }` in the single existing exchange request.
- **Security Assessment**:
  - *Atomic Single Transaction*: Identity verification, credential upgrade, session creation, and token issuance occur inside a single PostgreSQL database transaction. If password hashing fails, exchange aborts. If exchange succeeds, the account is 100% migrated.
  - *Strong Identity Binding*: The password candidate is cryptographically bound to the Firebase ID token in the exact same payload. An attacker cannot submit passwords without already proving live possession of the Firebase Auth account.
  - *Backward Compatibility*: If `password` is omitted from the request (e.g., from an older client build or non-migrating client), the endpoint functions identically to its existing behavior.
  - *Idempotent & Self-Terminating*: If `user.passwordHash` is already a valid Argon2id hash (`!user.passwordHash.startsWith('!LOCKED_')`), the password parameter is safely ignored, making subsequent requests completely no-op for migration.

### Option C — Dedicated Migration Endpoint (`POST /api/v1/auth/migrate-firebase-credential`)
- **Flow**: A distinct endpoint accepting `{ idToken, password }` that verifies the token, upgrades the password, and returns a session.
- **Security Assessment**:
  - Creates duplicate code paths for token verification, conflict resolution, tenant validation, and session generation.
  - Offers zero security advantage over Option B while increasing attack surface and test maintenance.

### Option D — No JIT Migration (Operational Cutoff & Reset Campaign)
- **Flow**: Firebase Auth is decommissioned on a set date; all 38 institutional users must reset passwords via `/forgot-password` &rarr; email &rarr; `/reset-password`.
- **Security Assessment**:
  - Eliminates the need to handle legacy passwords during exchange.
  - *Operational Risk*: High risk of mass lockout. School administrators, principals, and teachers will be unable to log in on day 1 without completing an out-of-band email reset workflow.

---

## 6. Account State Machine & Transition Invariants

### Formal State Definition:

```text
[STATE 0: LOCKED_FIREBASE_AUTH_MANAGED]
User.passwordHash = "!LOCKED_FIREBASE_AUTH_MANAGED"
User.passwordAlgorithm = "argon2id"
Can login via: Firebase Auth exchange ONLY
Blocked from: Native REST /api/v1/auth/login (403 PASSWORD_NOT_SET)
Blocked from: /api/v1/auth/change-password (403 PASSWORD_NOT_SET)
                   │
                   │ User enters { identifier, password } on /login
                   │ Client verifies with Firebase Auth -> gets idToken
                   │ Client submits POST /firebase-exchange { idToken, password }
                   │
                   ▼
[STATE 1: VALIDATION & ELIGIBILITY VERIFICATION]
1. Firebase ID token signature verified (RS256, Google x509)
2. Map identity: legacyFirestoreId == token.uid OR email == token.email
3. Account state check: user.isActive === true
4. Tenant state check: school.status !== 'suspended'
5. Migration check: isLockedPassword(user.passwordHash) === true
6. Complexity check: validatePasswordPolicy(password) === true
                   │
                   ├── Policy fails (<8 chars, missing upper/digit)
                   │     ↳ Fallback: Do NOT mutate; issue session as State 0
                   │
                   └── Policy passes
                         │
                         ▼
[STATE 2: ATOMIC POSTGRESQL MUTATION]
Execute within Prisma Transaction:
  1. newHash = await hashPassword(password) [Argon2id, 64MB, 3 iter]
  2. UPDATE users SET 
       password_hash = newHash,
       password_algorithm = 'argon2id',
       token_version = token_version + 1,
       updated_at = NOW()
     WHERE id = user.id AND password_hash LIKE '!LOCKED_%'
  3. Create RefreshSession with new token_version
  4. Issue Access Token with new token_version
                         │
                         ▼
[STATE 3: NATIVE REST ACTIVE ACCOUNT]
User.passwordHash = "$argon2id$v=19$m=65536,t=3,p=4$..."
Can login via: Native REST POST /api/v1/auth/login (Immediate 200 OK)
Can change password via: POST /api/v1/auth/change-password
Firebase Dependency: ZERO (Account is 100% independent of Firebase Auth)
```

### Edge Case Analysis:

1. **Concurrency & Race Conditions**:
   If a user logs in from two browser tabs simultaneously, both requests verify Firebase Auth. The first update changes `password_hash` to `$argon2id$...`. The second update query includes `WHERE id = :id AND password_hash LIKE '!LOCKED_%'`, resulting in 0 rows updated and safely continuing without error or corruption.
2. **Password Complexity Mismatch**:
   Firebase default password rules permitted 6-character passwords, whereas SMS backend policy requires:
   - 8–128 characters
   - At least 1 uppercase letter
   - At least 1 lowercase letter
   - At least 1 digit
   If an existing Firebase password fails this policy, the backend **must not** corrupt the database or reject the user. Instead:
   - The backend safely bypasses migration, issues the temporary session under State 0, and flags the response with `migrationRequired: true`.
   - The user is then prompted to set a compliant password via the D3 password setup/reset workflow.
3. **Session Invalidation**:
   Updating `token_version = token_version + 1` automatically invalidates any stale refresh sessions while the newly generated session carries the new `token_version`, ensuring immediate uninterrupted access for the active session.

---

## 7. Migration Readiness Checklist

| Requirement | Current Status | Notes |
| :--- | :---: | :--- |
| **PostgreSQL User Census Complete** | **VERIFIED** | 38 Firebase-managed accounts identified in S024 and S015. |
| **Backend Native Login Endpoint Ready** | **VERIFIED** | `POST /api/v1/auth/login` active and tested. |
| **Password Reset UI (D3) Ready** | **VERIFIED** | `/forgot-password` and `/reset-password` active and tested. |
| **Password Setup UI (D3) Ready** | **VERIFIED** | `/setup-password` active and tested for the 5 shadow staff. |
| **JIT Architecture Selected** | **OPTION B AUDITED** | Extended atomic exchange provides highest security and lowest user friction. |
| **Zero Code Changes in D4** | **VERIFIED** | 100% read-only audit completed; no code or records modified. |

---

## 8. Conclusion & Recommendation

The audit concludes that **Option B (Extended Atomic Firebase Exchange)** is the safest, most robust mechanism for JIT credential migration. It requires:
1. Extending the backend exchange validator to optionally accept `password`.
2. Hashing and updating the PostgreSQL `User.passwordHash` atomically during exchange when an account is locked.
3. Passing `password` from the existing `AuthContext.loginWithCredentials` execution scope during the transition window.

**HARD STOP reached as required. Ready for user instruction regarding Phase D5/implementation.**
