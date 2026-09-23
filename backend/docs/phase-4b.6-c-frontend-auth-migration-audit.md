# PHASE 4B.6-C — FRONTEND AUTHENTICATION MIGRATION AUDIT
## INVESTIGATION & READINESS REPORT (READ-ONLY)

---

## 1. Executive Summary

This report delivers the comprehensive architectural audit of the School Management System React/Vite frontend authentication system for **Phase 4B.6-C**. 

### Baseline State
- **Frontend Framework**: React 19, Vite 8, React Router v7, Tailwind CSS v4.
- **Current Authentication Provider**: Client-side Firebase Authentication SDK (`firebase/auth` v12.16.0) coupled with Cloud Firestore (`firebase/firestore`).
- **Target Backend Foundation (Phase 4B.6-B Completed & Verified)**:
  - `POST /api/v1/auth/firebase-exchange`: Exchanges verified Firebase ID token for authoritative PostgreSQL JWT + HttpOnly `sms_refresh_token` cookie.
  - `POST /api/v1/auth/admission-login`: Direct PostgreSQL-backed login using student admission number + school code + password.
  - `POST /api/v1/auth/login`: Direct PostgreSQL-backed login using email + password.
  - `POST /api/v1/auth/refresh`: Rotates refresh token via HttpOnly cookie and issues new access JWT.
  - `POST /api/v1/auth/logout` / `logout-all`: Revokes PostgreSQL refresh sessions.
  - `GET /api/v1/auth/me`: Returns authoritative PostgreSQL user profile, school membership, and RBAC role.

### Key Audit Findings
1. **Single Entry Point for Auth State**: `src/context/AuthContext.jsx` is the centralized auth state container in the frontend. It listens to Firebase `onAuthStateChanged`, optimistically reads `localStorage` cached profiles via `CacheService`, and performs background profile fetching via `getUserProfile` from Firestore.
2. **Zero Global API Client**: The frontend currently does not possess a shared Axios or Fetch API client with HTTP interceptors. All data operations currently interact directly with Cloud Firestore client SDK.
3. **No Backend JWT Consumption**: The frontend currently does not call backend auth endpoints (`/auth/login`, `/auth/firebase-exchange`, `/auth/refresh`, `/auth/me`).
4. **Synthetic Parent Email Construction**: `src/firebase/auth.js` and `src/pages/ParentRegistration.jsx` construct synthetic emails using `${admissionNumber.replace(/[^a-zA-Z0-9]/g, '')}@parent.School.com`.toLowerCase().
5. **Direct Role and Permission Derivation**: `src/hooks/usePermissions.js` and `src/firebase/auth.js` read Firestore collections (`users/{uid}`, `schools/{schoolId}/teachers`, `schools/{schoolId}/roles`) directly to resolve roles and module permissions.
6. **Migration Readiness**: The frontend authentication layer is cleanly modularized in `src/context/AuthContext.jsx`, `src/firebase/auth.js`, and `src/pages/LoginPage.jsx`, making the upcoming Phase 4B.6-D cutover straightforward and low-risk when managed via feature-flagged routing and a centralized API client.

---

## 2. Current Authentication Architecture

```
                               CURRENT ARCHITECTURE
                               
     +--------------------------------------------------------+
     |                       LoginPage.jsx                    |
     +--------------------------------------------------------+
                  |                                 |
        (Identifier has @)               (Admission Number)
                  |                                 |
                  v                                 v
        loginUser(email, pass)         loginWithAdmissionNumber(adm, pass)
                  |                                 |
                  |                       [Constructs Synthetic Email:
                  |                        ${adm}@parent.school.com]
                  |                                 |
                  +----------------+----------------+
                                   |
                                   v
                   signInWithEmailAndPassword(auth, ...)
                                   |
                                   v
                    Firebase Auth Server (Google)
                                   | (auth state change)
                                   v
                   AuthContext: onAuthStateChanged(user)
                                   |
                   +---------------+---------------+
                   |                               |
                   v                               v
         Optimistic Cache Read            getUserProfile(uid)
         (CacheService / LocalStorage)             |
                   |                               v
                   |                  Firestore: doc("users", uid)
                   |                               |
                   |                  (If Teacher/Staff: queries
                   |                   schools/{schoolId}/teachers
                   |                   and schools/{schoolId}/roles)
                   |                               |
                   +---------------+---------------+
                                   |
                                   v
                 AuthContext State: { currentUser, userProfile }
                                   |
        +--------------------------+--------------------------+
        |                                                     |
        v                                                     v
ProtectedRoute.jsx                                    usePermissions.js
(Checks userProfile.role)                       (Listens to Firestore roles)
        |                                                     |
        v                                                     v
Renders Admin/Teacher/Parent Panels            Module UI Actions (Read/Edit/Delete)
```

---

## 3. Login Flow Inventory

| Flow | Current Mechanism | Firebase Dependency | Firestore Dependency | Target Backend Endpoint | Migration Complexity |
|---|---|---|---|---|---|
| **Staff / Teacher Login** | Email + Password | `signInWithEmailAndPassword` | `users/{uid}`, `schools/{schoolId}/teachers`, `schools/{schoolId}/roles` | Firebase Auth &rarr; `POST /api/v1/auth/firebase-exchange` &rarr; PostgreSQL JWT | Medium |
| **School Admin Login** | Email + Password | `signInWithEmailAndPassword` | `users/{uid}` | Firebase Auth &rarr; `POST /api/v1/auth/firebase-exchange` &rarr; PostgreSQL JWT | Medium |
| **SuperAdmin Login** | Email + Password | `signInWithEmailAndPassword` | `users/{uid}` (`role: 'superadmin'`) | Firebase Auth &rarr; `POST /api/v1/auth/firebase-exchange` &rarr; PostgreSQL JWT | Low |
| **Parent Admission Login** | Admission No. + Password | Synthetic Email (`${adm}@parent.school.com`) &rarr; `signInWithEmailAndPassword` | `users/{uid}` | `POST /api/v1/auth/admission-login` (Native PostgreSQL) | Medium |
| **Parent Direct Email Login** | Email + Password | `signInWithEmailAndPassword` | `users/{uid}` | Firebase Auth &rarr; `POST /api/v1/auth/firebase-exchange` &rarr; PostgreSQL JWT | Low |
| **Password Reset** | Email submission | `sendPasswordResetEmail` / `/api/forgot-password` (Resend) | `users/{email}` timestamp update | `POST /api/v1/auth/password-reset/request` & `/confirm` | Medium |
| **Parent Registration** | Admission No. + Password | `createUserWithEmailAndPassword` | `users/{uid}`, `schools/{schoolId}/parents` | Phase 4B.5-B Password Setup / Setup Token | High (Deferred) |
| **Teacher Registration** | School Code + Email + Password | `createUserWithEmailAndPassword` | `users/{uid}`, `schools/{schoolId}/teachers` | Phase 4B.5-B Password Setup / Setup Token | High (Deferred) |
| **School Registration** | Admin Email + Password | `createUserWithEmailAndPassword` | `users/{uid}`, `schools/{schoolId}` | Future School Onboarding Endpoint | High (Deferred) |

---

## 4. Authentication State Management

### 4.1 State Container (`src/context/AuthContext.jsx`)
`AuthContext` provides the authoritative authentication state via React Context:
- **`currentUser`**: Raw Firebase User object (`uid`, `email`, `emailVerified`, etc.).
- **`userProfile`**: Normalized application user profile object:
  - `uid`: User unique identifier
  - `email`: User email address
  - `role`: Normalized lower-case role (`'admin'`, `'teacher'`, `'parent'`, `'staff'`, `'superadmin'`)
  - `schoolId`: Associated school/tenant UUID
  - `schoolName`: School display name
  - `loginPanel`: Target panel override (`'admin'` or `'teacher'`)
  - `assignedClassId`: (For teachers) Assigned class section
  - `linkedStudentId` / `linkedStudents`: (For parents) Enrolled children identifiers
  - `permittedModules`: Permitted feature list
- **`loading`**: Boolean indicating whether initialization/profile resolution is in progress.
- **`updateProfileData()`**: Helper function to re-fetch and refresh `userProfile` from Firestore.

### 4.2 State Persistence & Cache Layer
- **Memory**: React state in `AuthProvider`.
- **LocalStorage (`CacheService`)**: Key `global_userProfile_${uid}` stores the cached profile for up to 24 hours to eliminate UI blocking on page load.
- **Firebase Persistence**: IndexedDB managed automatically by Firebase Auth SDK.

---

## 5. Firebase Dependency Inventory

| File Path | Firebase API / Symbol | Purpose | Classification | Future Replacement |
|---|---|---|---|---|
| `src/firebase/config.js` | `initializeApp`, `getAuth`, `initializeFirestore`, `getStorage` | SDK Initialization | Infrastructure | Keep for bridge & storage; isolate auth |
| `src/firebase/auth.js` | `signInWithEmailAndPassword` | Email login & synthetic parent login | Auth | Replace with Backend Exchange & Admission Login |
| `src/firebase/auth.js` | `createUserWithEmailAndPassword` | User registration | Auth | Replace with Backend Setup / Provisioning |
| `src/firebase/auth.js` | `signOut` | User logout | Auth | Replace with Backend `POST /auth/logout` |
| `src/firebase/auth.js` | `onAuthStateChanged` | Session change listener | Auth | Replace with Backend Session Restoration / Cookie Refresh |
| `src/firebase/auth.js` | `sendPasswordResetEmail` | Reset password email | Auth | Replace with Backend `POST /auth/password-reset/request` |
| `src/context/AuthContext.jsx` | `onAuthStateChanged` | Session lifecycle listener | Auth | Replace with Token State + `/auth/me` bootstrap |
| `src/pages/LoginPage.jsx` | `loginUser`, `loginWithAdmissionNumber` | Login execution | Auth UI | Replace with Auth API Service |
| `src/pages/AdminDashboard.jsx` | `logoutUser` | Logout action | Auth UI | Call Backend `authService.logout()` |
| `src/pages/TeacherDashboard.jsx` | `logoutUser` | Logout action | Auth UI | Call Backend `authService.logout()` |
| `src/pages/ParentDashboard.jsx` | `logoutUser` | Logout action | Auth UI | Call Backend `authService.logout()` |
| `src/pages/SuperAdminDashboard.jsx`| `logoutUser` | Logout action | Auth UI | Call Backend `authService.logout()` |
| `src/pages/SuperAdmin/Layout.jsx` | `logoutUser` | Logout action | Auth UI | Call Backend `authService.logout()` |
| `src/pages/PendingApproval.jsx` | `logoutUser` | Logout action | Auth UI | Call Backend `authService.logout()` |
| `src/services/whatsappService.js` | `auth.currentUser.getIdToken()` | Token header for WhatsApp API | API Header | Replace with Backend Access Token |

---

## 6. Firestore Authentication Dependency Inventory

| File Path | Firestore Collection / Document | Purpose | Type | Future Replacement |
|---|---|---|---|---|
| `src/firebase/auth.js` | `users/{uid}` | User identity, role, schoolId | Auth Profile | Backend `GET /api/v1/auth/me` |
| `src/firebase/auth.js` | `schools/{schoolId}/teachers` | Teacher assignedClassId & staff role | Auth Profile | Backend `/auth/me` / Staff Profile API |
| `src/firebase/auth.js` | `schools/{schoolId}/roles/{roleName}` | Panel routing override (`loginPanel`) | Auth / UI | Backend RBAC / `/auth/me` |
| `src/context/AuthContext.jsx` | `users/{uid}` | Profile background refresh | Auth Profile | Backend `GET /api/v1/auth/me` |
| `src/hooks/usePermissions.js` | `schools/{schoolId}/teachers` | Listen to assigned roles for staff | Authorization | Backend RBAC / User Permissions API |
| `src/hooks/usePermissions.js` | `schools/{schoolId}/roles` | Compute merged module permissions | Authorization | Backend RBAC / User Permissions API |
| `src/pages/Parent/MyChildren.jsx` | `users/{uid}.linkedStudents` | Parent linked children list | Profile / Domain | Backend Parent Domain API |
| `src/pages/Admin/AdminOverview.jsx`| `users/{uid}.dashboardConfig` | Admin widget preferences | UI Preference | User Preferences API / LocalStorage |
| `src/pages/PendingApproval.jsx` | `schools/{schoolId}` | Check school approval status | Tenant State | Backend `/auth/me` (`school.status`) |

---

## 7. API Client Audit

- **Current HTTP Client State**: There is **no shared Axios or Fetch API client instance** in `src/`.
- **Existing Fetch Usages**:
  - `src/services/whatsappService.js`: Calls `/api/whatsapp-service` using `fetch` with `Bearer ${getIdToken()}`.
  - `src/services/emailService.js`: Calls `/api/send-email` or Resend API.
  - `src/pages/ForgotPassword.jsx`: Calls `/api/forgot-password`.
  - `src/utils/cloudinary.js`: Calls Cloudinary upload API directly.
- **Missing Capabilities (To Be Built in 4B.6-D)**:
  - Centralized API client module (`src/api/client.js` or `src/services/api.js`).
  - Request interceptor: Injects `Authorization: Bearer <accessToken>` from memory.
  - Response interceptor: Catches `401 Unauthorized`, initiates `/api/v1/auth/refresh` using credentials/cookies, queues pending requests, retries failed requests upon successful refresh, and executes clean logout upon terminal refresh failure.
  - Credentials configuration: `credentials: 'include'` on all backend requests to ensure `sms_refresh_token` cookie is transmitted.

---

## 8. Admission Login Audit

### Current Admission Login Flow
1. **User Input**: In `src/pages/LoginPage.jsx`, parent enters student admission number (e.g. `2024-ADM-001`) and password.
2. **Detection**: `identifier.includes('@')` returns `false`.
3. **Synthetic Email Generation** (`src/firebase/auth.js:49`):
   ```javascript
   const syntheticEmail = `${admissionNumber.replace(/[^a-zA-Z0-9]/g, '')}@parent.School.com`.toLowerCase();
   ```
4. **Firebase Sign-In**: Calls `signInWithEmailAndPassword(auth, syntheticEmail, password)`.
5. **Profile Lookup**: Reads `users/{uid}` to extract `schoolId`, `linkedStudentId`, and `role: 'parent'`.
6. **Navigation**: Redirects to `/parent`.

### Critical Migration Note
- The backend already provides native PostgreSQL admission authentication via:
  ```http
  POST /api/v1/auth/admission-login
  Content-Type: application/json
  
  {
    "schoolCode": "SchoolS024",
    "admissionNumber": "2024-ADM-001",
    "password": "..."
  }
  ```
- In the current frontend, the login form does not currently prompt for `schoolCode` because Firebase synthetic emails are globally unique strings.
- **Migration Strategy for 4B.6-D**:
  - For standard Email / Password: Use Firebase Auth &rarr; `POST /api/v1/auth/firebase-exchange`.
  - For Admission Number Login:
    - Option A: Frontend prompts for School Code when Admission Number is selected, calling `POST /api/v1/auth/admission-login`.
    - Option B: Use Firebase Auth bridge using the reconstructed synthetic email (`@parent.school.com`), which maps via verified UID to the PostgreSQL parent record.
    - **Recommended**: Support both seamlessly in Phase 4B.6-D.

---

## 9. Protected Routes Audit

- **Guard File**: `src/components/ProtectedRoute.jsx`
- **Route Guard Wrapping**: Configured in `src/App.jsx` for:
  - `/superadmin/*`: `allowedRoles={['superadmin']}`
  - `/admin/*`: `allowedRoles={['admin', 'staff', 'teacher']}` (with per-subroute `moduleKey` checks)
  - `/teacher/*`: `allowedRoles={['admin', 'staff', 'teacher']}` (with per-subroute `moduleKey` checks)
  - `/parent/*`: `allowedRoles={['parent']}`
- **Evaluation Flow**:
  1. `if (authLoading || permissionsLoading)` &rarr; Renders `<GlobalLoader />`.
  2. `if (!currentUser)` &rarr; `<Navigate to="/login" replace />`.
  3. `if (allowedRoles)` &rarr; Checks `userProfile.role`. If missing or disallowed &rarr; `<Navigate to="/unauthorized" replace />`.
  4. `if (moduleKey)` &rarr; Calls `canRead(moduleKey)`. If false &rarr; `<Navigate to="/unauthorized" replace />`.
- **Potential Race Conditions**:
  - When `currentUser` arrives before `userProfile` is loaded from Firestore, `ProtectedRoute` relies on `permissionsLoading` / `authLoading`. If cache is empty, a brief spinner is shown.

---

## 10. Logout & Session Restoration

### Current Behavior
- **Logout**: Dashboard components invoke `logoutUser()`, calling `signOut(auth)`. React state resets when `onAuthStateChanged` fires.
- **Session Restoration**: On page refresh, Firebase Auth SDK restores user from IndexedDB, firing `onAuthStateChanged`. `AuthContext` reads `localStorage` cache for instant UI rendering.

### Target Backend-Compatible Behavior (Phase 4B.6-D)
```
Browser Page Load / Refresh
           |
           v
AuthContext / App Bootstrap
           |
           v
Check for active Access Token in memory
           |
   +-------+-------+
   | (No Token)    | (Token Exists)
   v               v
POST /auth/refresh  GET /auth/me (with Bearer token)
(with credentials/cookie)
   |
   +-------+-------+
   | (Success 200) | (Failed 401 / No Session)
   v               v
Set Access Token   Set unauthenticated state (currentUser = null)
Fetch /auth/me     Redirect to /login if on protected route
Set Auth State
```

---

## 11. Role & Permission Audit

### Role Hierarchy & Mapping
| System Role (PostgreSQL) | Frontend `userProfile.role` | Target Route | Allowed Dashboard Panels |
|---|---|---|---|
| `SUPER_ADMIN` | `superadmin` | `/superadmin` | SuperAdmin Portal |
| `SCHOOL_ADMIN` | `admin` | `/admin` | Admin Dashboard (Full access to all modules) |
| `PRINCIPAL` | `staff` / `admin` | `/admin` | Admin Dashboard (Configured modules) |
| `TEACHER` | `teacher` | `/teacher` | Teacher Dashboard (Teaching modules) |
| `STAFF` | `staff` | `/admin` or `/teacher` | Based on `loginPanel` setting |
| `PARENT` | `parent` | `/parent` | Parent Portal |

### Authorization Invariant
- Frontend permission checks (`canRead`, `canEdit`, `allowedRoles`) are **UI visibility controls only**.
- Authoritative access control is strictly enforced by PostgreSQL backend middleware (`requireAuth`, `requireTenant`, `requireRole`, `requirePermissions`).

---

## 12. Multi-Tenant Security Audit

- **Client Influence Check**:
  - `userProfile.schoolId` is derived exclusively from the authenticated user profile.
  - In public forms (`/admission/:schoolId`, `/leads/form/:schoolId/:formId`), `schoolId` is a public routing parameter for multi-tenant form submission.
- **Header Security**:
  - For normal staff/admins, backend derives tenant membership directly from JWT `schoolId`. Client cannot tamper with tenant scope.
  - For `SUPER_ADMIN`, tenant switching requires explicit `X-Tenant-Id` validated against active PostgreSQL School records.

---

## 13. Security Findings

| Finding ID | Severity | Description | File Reference | Recommended Mitigation |
|---|---|---|---|---|
| **SEC-01** | **HIGH** | Hard-coded mock admin credentials automatically injected in DEV mode if Firebase auth fails to load | `src/context/AuthContext.jsx:21-39` | Remove hard-coded mock admin bypass; require explicit backend authentication |
| **SEC-02** | **MEDIUM** | Debug bypass button allows unapproved school users to navigate directly to `/admin` | `src/pages/PendingApproval.jsx:68` | Remove debug bypass button in production builds |
| **SEC-03** | **MEDIUM** | Cached user profile in LocalStorage (`CacheService`) is not purged on logout | `src/services/CacheService.js` | Clear `localStorage` auth cache on explicit logout |
| **SEC-04** | **LOW** | Missing API proxy in Vite dev configuration leads to CORS or routing failure when calling `/api` | `vite.config.js` | Add `/api` proxy targeting backend server (`http://localhost:5000`) |
| **SEC-05** | **INFORMATIONAL**| Vite environment variables (`.env`) expose Firebase API keys (standard for client-side Firebase) | `.env` | Safe for client SDK; backend credentials remain isolated in `backend/.env` |

---

## 14. Migration File Classification

| File Path | Classification | Rationale |
|---|---|---|
| `src/context/AuthContext.jsx` | **MUST CHANGE** | Must orchestrate Firebase exchange, backend session restoration, access token storage, and `/auth/me` integration. |
| `src/firebase/auth.js` | **MUST CHANGE** | Must add exchange helper calling `POST /api/v1/auth/firebase-exchange` after Firebase sign-in. |
| `src/pages/LoginPage.jsx` | **MUST CHANGE** | Must handle backend exchange flow and admission login integration. |
| `src/api/client.js` | **NEW FILE (MUST CREATE)** | Shared Axios/Fetch client with auth header injection, 401 interception, and token refresh. |
| `vite.config.js` | **MAY CHANGE** | Add development proxy for `/api` pointing to backend port 5000. |
| `src/components/ProtectedRoute.jsx` | **MAY CHANGE** | Ensure compatibility with PostgreSQL `userProfile` structure. |
| `src/pages/AdminDashboard.jsx` | **MAY CHANGE** | Update logout handler to invoke backend logout. |
| `src/pages/TeacherDashboard.jsx` | **MAY CHANGE** | Update logout handler to invoke backend logout. |
| `src/pages/ParentDashboard.jsx` | **MAY CHANGE** | Update logout handler to invoke backend logout. |
| `src/pages/SuperAdminDashboard.jsx`| **MAY CHANGE** | Update logout handler to invoke backend logout. |
| `src/pages/SuperAdmin/Layout.jsx` | **MAY CHANGE** | Update logout handler to invoke backend logout. |
| `src/pages/PendingApproval.jsx` | **MAY CHANGE** | Remove debug bypass; use PostgreSQL school status. |
| `src/services/whatsappService.js` | **MAY CHANGE** | Update `getAuthHeaders` to use access token from memory. |
| `src/firebase/config.js` | **MUST REMAIN** | Required for Firebase Client SDK initialization during bridge phase. |
| `src/firebase/firestore.js` | **DO NOT TOUCH** | Business Firestore queries remain active during this bridge phase. |
| `src/hooks/usePermissions.js` | **MUST REMAIN** | Keep existing permission listener until backend RBAC endpoints are deployed. |

---

## 15. Recommended Future Migration Architecture (Phase 4B.6-D)

```
                            RECOMMENDED ARCHITECTURE
                            
+-------------------------------------------------------------------------------+
|                                 LoginPage.jsx                                 |
+-------------------------------------------------------------------------------+
        |                                                               |
(Email / Password)                                            (Admission Number)
        |                                                               |
        v                                                               v
Firebase signInWithEmailAndPassword                      POST /api/v1/auth/admission-login
        |                                                               |
        v (Firebase ID Token)                                           |
POST /api/v1/auth/firebase-exchange                                     |
        |                                                               |
        +-------------------------------+-------------------------------+
                                        |
                                        v
                    Backend Returns: { accessToken, user }
                    + Sets HttpOnly Cookie: sms_refresh_token
                                        |
                                        v
                            src/api/auth-client.js
                      (Stores accessToken in memory)
                                        |
                                        v
                             AuthContext State Update
                            { accessToken, userProfile }
                                        |
                                        v
                           Authorized React Dashboard
```

---

## 16. Feature Flag & Rollback Strategy

To ensure zero downtime and instant rollback capability during frontend cutover in Phase 4B.6-D:

```env
# .env (Frontend Configuration)
VITE_AUTH_MODE="HYBRID_BRIDGE"  # Options: 'FIREBASE_LEGACY' | 'HYBRID_BRIDGE' | 'BACKEND_NATIVE'
VITE_API_BASE_URL="http://localhost:5000"
```

- **`FIREBASE_LEGACY`**: Runs pure Firebase Auth + Firestore profiles (exact current behavior).
- **`HYBRID_BRIDGE`** (Default for 4B.6-D): Firebase Auth &rarr; Backend Exchange (`/auth/firebase-exchange`) &rarr; Backend JWT + Refresh Session.
- **`BACKEND_NATIVE`** (Future Phase 4B.7): Pure backend login (`/auth/login`) bypassing Firebase client SDK entirely.

---

## 17. Implementation Plan for Next Phase (Phase 4B.6-D)

1. **Step 1 — Configure Vite Dev Proxy**:
   Update `vite.config.js` to proxy `/api` requests to backend server (`http://localhost:5000`).
2. **Step 2 — Implement Centralized Auth API Client (`src/api/auth.js`)**:
   Implement standard fetch/axios wrapper with `credentials: 'include'`, token injection, and automatic `/auth/refresh` on 401.
3. **Step 3 — Implement Token Manager (`src/services/tokenService.js`)**:
   In-memory access token storage with getter/setter and subscriber notification for refresh events.
4. **Step 4 — Update `src/firebase/auth.js` with Exchange Helper**:
   Add `exchangeFirebaseToken(idToken)` calling backend bridge.
5. **Step 5 — Update `src/context/AuthContext.jsx`**:
   Integrate token manager, session restoration on mount via `/auth/refresh` or `/auth/me`, and bridge exchange upon Firebase sign-in.
6. **Step 6 — Update `src/pages/LoginPage.jsx`**:
   Wire email login to Firebase &rarr; Backend Exchange, and admission login to backend admission-login.
7. **Step 7 — Update Logout Flow**:
   Update `logoutUser` in `src/firebase/auth.js` to call `POST /api/v1/auth/logout` + `signOut(auth)`.
8. **Step 8 — Verification & E2E Testing**:
   Execute end-to-end browser login, refresh, role authorization, and logout flows.

---

## 18. Test Plan for Next Phase

| Test Category | Target Component | Description | Expected Outcome |
|---|---|---|---|
| **Unit** | `tokenService.js` | In-memory token storage & clearing | Stores and clears token without localStorage leaks |
| **Unit** | `api/auth.js` | 401 interceptor & refresh queue | Automatically refreshes and retries queued requests |
| **Integration** | `LoginPage.jsx` | Staff login via Firebase Exchange | Receives 200, sets access token, redirects to `/admin` |
| **Integration** | `LoginPage.jsx` | Admission number login | Receives 200, sets access token, redirects to `/parent` |
| **Integration** | `AuthContext.jsx` | Session restoration on page refresh | Silently calls `/auth/refresh`, recovers user profile |
| **Security** | `AuthContext.jsx` | Inactive / Suspended account handling | Displays error message, prevents dashboard access |
| **Security** | Dashboard Logout | Logout execution | Revokes backend session, clears cookie, signs out of Firebase |
| **E2E** | Full Browser Flow | Complete staff, teacher, and parent login & navigation | Validated via headless browser subagent |

---

## 19. Risk Register

| Risk | Severity | Evidence | Impact | Mitigation | Phase |
|---|---|---|---|---|---|
| **Vite Dev Server Proxy Gap** | High | `vite.config.js` lacks proxy | `/api` calls fail in local Vite dev mode | Add proxy configuration in `vite.config.js` | 4B.6-D |
| **Dev Mode Mock Admin Leak** | High | `AuthContext.jsx:21-39` hard-coded admin | Security loophole if config fails in dev | Remove hard-coded mock admin logic | 4B.6-D |
| **Cookie Domain & SameSite in Local Dev** | Medium | HttpOnly cookie across ports 5173 and 5000 | Cookies dropped without Vite proxy | Use Vite reverse proxy so frontend and backend share origin | 4B.6-D |
| **Stale LocalStorage Cache** | Low | `CacheService` caches user profile | Potential role mismatch after backend update | Clear cache on logout; validate cache version | 4B.6-D |

---

## 20. Verification & Audit Invariant Checklist

- [x] **Zero source files modified**: Verified read-only investigation.
- [x] **Zero package changes**: `package.json` and `package-lock.json` untouched.
- [x] **Zero Firebase writes**: No users or Firestore documents created/modified.
- [x] **Zero database writes**: PostgreSQL user state and migrations untouched.
- [x] **Zero auth behavior changed**: Existing application runtime unchanged.

---

## 21. Final Decision

**READY FOR PHASE 4B.6-D**

The frontend authentication architecture is completely mapped, the bridge integration path is verified, and the implementation sequence is defined.

---

# HARD STOP
No further actions or modifications are taken. Awaiting explicit user approval for Phase 4B.6-D.
