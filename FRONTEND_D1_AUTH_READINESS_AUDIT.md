# FRONTEND.D1 — AUTHENTICATION & SESSION REST MIGRATION READINESS AUDIT

## Executive Summary
This document provides an exhaustive, source-of-truth audit of the authentication and session management architecture across the frontend and backend of the School Management System.

* **Audit Mode**: Strict Audit-Only. Zero production code, zero authentication flows, and zero database schemas were altered.
* **Core Finding**: The application is currently in **`HYBRID_BRIDGE` mode**.
  * **Already 100% PostgreSQL REST**: Session restoration on startup/reload, token refresh rotation via HttpOnly cookies, Parent Admission Login, user profile identity resolution (`GET /api/v1/auth/me`), session termination (`POST /api/v1/auth/logout`), and all 58 SaaS domain APIs.
  * **Firebase Auth Dependency**: Institutional Email/Password Login (Admin, Teacher, Staff, SuperAdmin) relies on Firebase Auth to verify credentials before exchanging the Firebase ID token for a PostgreSQL session (`POST /api/v1/auth/firebase-exchange`). In addition, `ForgotPassword.jsx` falls back to a legacy Firebase action URL.
  * **Backend Native Readiness**: The backend already has a complete, fully tested, rate-limited, Argon2id native REST authentication suite (`/login`, `/admission-login`, `/refresh`, `/logout`, `/me`, `/password-reset/request`, `/password-reset/confirm`, `/password-setup/confirm`, `/change-password`). 203 backend auth tests and 10 frontend auth tests pass at 100%.

---

## 1. Authentication Entry-Point & Call-Path Inventory

| Operation | Current Runtime Path | Dependency Layer | State / Protocol |
| :--- | :--- | :--- | :--- |
| **Parent Admission Login** | `LoginPage.jsx` &rarr; `AuthContext.loginWithCredentials` &rarr; `authApi.admissionLogin` | **100% PostgreSQL REST** | `POST /api/v1/auth/admission-login`<br>Issues JWT + HttpOnly refresh cookie |
| **Institutional Login**<br>*(Staff/Admin/Teacher)* | `LoginPage.jsx` &rarr; `AuthContext.loginWithCredentials` &rarr; `signInWithEmailAndPassword` &rarr; `authApi.firebaseExchange` | **Hybrid Bridge** | Firebase Auth (credential verify) &rarr; `POST /api/v1/auth/firebase-exchange`<br>Issues PostgreSQL JWT + HttpOnly cookie |
| **Session Restoration**<br>*(App mount / Page reload)* | `AuthContext` useEffect &rarr; `tokenService.getAccessToken` / `authApi.refreshSession` &rarr; `authApi.getMe` | **100% PostgreSQL REST** | In-memory token check or `POST /api/v1/auth/refresh` &rarr; `GET /api/v1/auth/me`<br>**Zero Firebase Auth calls** |
| **Token Refresh Rotation** | `apiClient` 401 interceptor &rarr; `authApi.refreshSession` | **100% PostgreSQL REST** | `POST /api/v1/auth/refresh`<br>HttpOnly cookie rotation, single-flight |
| **Session Termination**<br>*(Logout)* | Dashboard / Layout &rarr; `AuthContext.logoutUser` &rarr; `authApi.logout` + `signOut(auth)` | **Dual / Hybrid** | Primary: `POST /api/v1/auth/logout` (revokes DB session, clears cookie)<br>Secondary cleanup: `signOut(auth)` |
| **Profile Data Refresh** | `AuthContext.updateProfileData` &rarr; `authApi.getMe` | **100% PostgreSQL REST** | `GET /api/v1/auth/me` |
| **Password Reset (UI)** | `ForgotPassword.jsx` &rarr; legacy `/api/forgot-password` / fallback Firebase action URL | **Legacy Firebase** | Currently falls back to Firebase reset link.<br>*(Backend REST reset endpoints exist but not yet wired to UI)* |
| **User Registration** | Self-Service School Register (`/register`) | **100% PostgreSQL REST** | `POST /api/v1/public/schools/register`<br>Argon2id password hashing in PostgreSQL |

---

## 2. Detailed Audit Dimensions

### 1. Operations Still Dependent on Firebase Authentication
* **Institutional Credential Verification**: Line 183 of `AuthContext.jsx` invokes `signInWithEmailAndPassword(auth, identifier, password)` for email-based accounts.
* **Firebase Token Generation**: Line 184 of `AuthContext.jsx` invokes `userCredential.user.getIdToken()` to pass to the backend exchange endpoint.
* **Secondary Client SignOut**: Line 228 of `AuthContext.jsx` and line 72 of `firebase/auth.js` call `signOut(auth)` on user logout.
* **Password Reset Fallback in UI**: Lines 48-55 of `ForgotPassword.jsx` generate a Firebase reset URL (`https://school-management-system-6a2c4.firebaseapp.com/__/auth/action...`).
* **Support Tickets (Category E)**: `SupportTickets.jsx` and `RaiseTicketModal.jsx` initialize a secondary Firebase app instance for the standalone tickets Firestore.

### 2. Operations Already PostgreSQL REST-Backed
* **Session Restoration**: When the user opens or refreshes the page, `AuthContext.jsx` uses `getAccessToken()` and HttpOnly refresh cookies via `POST /api/v1/auth/refresh` and `GET /api/v1/auth/me`. **Firebase Auth is not invoked during session restoration in `HYBRID_BRIDGE` mode.**
* **Token Refresh**: Token expiry is handled transparently by `apiClient` (`src/api/client.js`) invoking `POST /api/v1/auth/refresh`.
* **Parent Admission Authentication**: `POST /api/v1/auth/admission-login` validates admission number, school code, and password against PostgreSQL.
* **Identity & Scope Authority**: `GET /api/v1/auth/me` provides the authoritative role, school tenant UUID, active status, and permissions.
* **Database Session Revocation**: `POST /api/v1/auth/logout` invalidates the PostgreSQL `RefreshSession` row and clears cookies.
* **Data Access**: All 58 PostgreSQL models and SaaS modules use PostgreSQL JWT Bearer tokens.

### 3. Firebase Auth Dependencies in Current Hybrid Bridge
* The hybrid bridge was designed as an evolutionary step:
  1. Frontend authenticates with Firebase Auth &rarr; gets raw Firebase ID token.
  2. Backend endpoint `POST /api/v1/auth/firebase-exchange` cryptographically verifies the token (RS256 against Google public keys), extracts UID/email, maps it to a PostgreSQL `User` record, generates an authoritative PostgreSQL JWT access token, and sets an HttpOnly refresh cookie.
  3. All subsequent requests use the PostgreSQL JWT.

### 4. Can Firebase Auth Be Removed Safely?
* **Session Restoration & In-App Navigation**: Safe immediately; Firebase Auth is not used.
* **Parent Login**: Safe immediately; Firebase Auth is not used.
* **Institutional Login (Staff/Admin/Teacher)**:
  * **Blocker / Dependency**: Migrated accounts originally created in Firebase have their PostgreSQL `User.passwordHash` set to a placeholder: `!LOCKED_FIREBASE_AUTH_MANAGED_<hash>`.
  * If the frontend switches institutional login directly to `POST /api/v1/auth/login`, PostgreSQL will evaluate `isLockedPassword(user.passwordHash)` and return error `PASSWORD_NOT_SET: "Password is not set for this account. Please use password setup or reset."`.
  * Accounts created recently via REST registration (`POST /api/v1/public/schools/register`) have valid Argon2id password hashes in PostgreSQL and can log in via `POST /api/v1/auth/login` today.
  * **Safe Removal Strategy**: To safely retire Firebase Auth for institutional logins, existing users must either:
    1. Complete a one-time password setup/reset via the existing backend `POST /api/v1/auth/password-reset/request` flow; OR
    2. A progressive credential capture transition is executed during a deprecation window.

### 5. Work Required for a Future Native REST Authentication Architecture
#### Frontend:
1. `AuthContext.jsx`:
   - In `loginWithCredentials`, replace `signInWithEmailAndPassword` + `firebaseExchange` with `authApi.login({ identifier, password })`.
   - Remove `import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'`.
   - Remove `auth?.currentUser` and `signOut(auth)` cleanup.
2. `ForgotPassword.jsx`:
   - Replace the old serverless `/api/forgot-password` and Firebase URL fallback with `authApi.passwordResetRequest({ email })`.
3. Reset Password Confirmation View:
   - Create or route a reset confirmation screen accepting `token` from query parameters and calling `authApi.passwordResetConfirm({ token, newPassword })`.
4. Dashboard Logouts:
   - Refactor `TeacherDashboard`, `SuperAdminDashboard`, `ParentDashboard`, `AdminDashboard`, `SuperAdmin/Layout` to call `useAuth().logout()` instead of direct import from `firebase/auth.js`.
5. Remove `src/firebase/auth.js`.

#### Backend:
* **Zero endpoint additions needed**. The backend already contains:
  - `POST /api/v1/auth/login` (Rate-limited, Argon2id, tenant status validation)
  - `POST /api/v1/auth/admission-login`
  - `POST /api/v1/auth/refresh`
  - `POST /api/v1/auth/logout`
  - `POST /api/v1/auth/logout-all`
  - `GET /api/v1/auth/me`
  - `POST /api/v1/auth/password-reset/request`
  - `POST /api/v1/auth/password-reset/confirm`
  - `POST /api/v1/auth/password-setup/confirm`
  - `POST /api/v1/auth/change-password`

### 6. Reachability of Legacy Firebase Paths
* `VITE_AUTH_MODE === 'FIREBASE_LEGACY'`: Still present as an environment branch in `AuthContext.jsx`, `whatsappService.js`, and `src/firebase/auth.js`. In standard production (`HYBRID_BRIDGE`), this branch is inactive.
* `ForgotPassword.jsx`: Active fallback reaches Firebase auth reset link generation.

### 7. Dependency Status of Key Operations

| Operation | Firebase-Dependent? | Current Mechanism |
| :--- | :---: | :--- |
| **Session Restoration** | **NO** | `POST /api/v1/auth/refresh` + `GET /api/v1/auth/me` |
| **Token Refresh** | **NO** | `POST /api/v1/auth/refresh` |
| **Parent Login** | **NO** | `POST /api/v1/auth/admission-login` |
| **Institutional Login** | **YES (UI flow)** | `signInWithEmailAndPassword` &rarr; `/api/v1/auth/firebase-exchange` |
| **Logout** | **MINIMAL** | Primary: `POST /api/v1/auth/logout`. Secondary cleanup: `signOut(auth)`. |
| **Password Reset** | **YES (in UI)** | Falls back to Firebase action link URL in `ForgotPassword.jsx`. |

### 8. Security, Tenant-Isolation & RBAC Invariants to Preserve
1. **Zero-Trust Client Tenant Claims**: The tenant `schoolId` is strictly resolved server-side from the authenticated PostgreSQL `User` record or the parent/admission context. It is never taken from client requests.
2. **In-Memory JWT Access Token**: The access token lives only in runtime memory (`tokenService.js`), never in `localStorage` or `sessionStorage`.
3. **HttpOnly Refresh Cookies**: Refresh tokens are stored in HttpOnly, SameSite, Secure cookies, protected against XSS.
4. **Argon2id Password Storage**: Passwords in PostgreSQL use Argon2id with RFC 9106 parameters.
5. **Single-Use Hashed Reset Tokens**: Password reset tokens are 256-bit entropy, stored as SHA-256 hashes, with 15-minute expiration and atomic single-use invalidation.
6. **Unified RBAC**: Permissions are evaluated authoritatively on every API call via `requirePermission(module, op)` checking PostgreSQL `SchoolRole` and `RolePermission` tables.

---

## 3. Test & Verification Evidence
* **Backend Authentication Suite**:
  * 7 integration test files (48 tests) passed:
    `auth-me`, `auth-refresh`, `auth-logout`, `auth-login`, `auth-admission-login`, `auth-firebase-exchange`, `auth-password-reset`.
  * 9 unit test files (155 tests) passed:
    `token.service`, `password.service`, `admission-auth.service`, `auth.repository`, `session.service`, `password-reset.service`, `auth.service`, `email.service`, `firebase-auth.service`.
  * **Total Backend Auth Tests: 203 passed (100%)**.
* **Frontend Authentication Suite**:
  * `src/api/__tests__/auth.test.js` (5 tests) passed.
  * `src/context/__tests__/AuthContext.test.jsx` (5 tests) passed.
  * **Total Frontend Auth Tests: 10 passed (100%)**.
