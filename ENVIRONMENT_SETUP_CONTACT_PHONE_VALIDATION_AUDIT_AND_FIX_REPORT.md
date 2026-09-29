# ENVIRONMENT SETUP — CONTACT PHONE 10-DIGIT VALIDATION FORENSIC AUDIT & FIX REPORT

## 1. Executive Summary
- **Module:** Environment Setup
- **Sub-Module:** School Information / Contact Details
- **Issue:** Contact Phone field accepted inputs longer than 10 digits (such as 13-digit number `9876543210111`) without validation or restriction on either the frontend UI or the backend REST API boundary.
- **Resolution:**
  - Hardened backend Zod schema ([settings.schemas.js](file:///c:/Projects/SMS/backend/src/modules/settings/settings.schemas.js)) to enforce strict 10-digit regex validation (`/^[0-9]{10}$/`).
  - Hardened frontend input and form handler ([EnvironmentSetup.jsx](file:///c:/Projects/SMS/frontend/src/pages/Admin/EnvironmentSetup.jsx)) with `maxLength={10}`, `inputMode="numeric"`, `pattern="[0-9]{10}"`, digit-only `onChange` sanitization, field-level error indicators, and pre-submit validation.
  - Added unit, integration, and UI tests across frontend and backend suites.
- **Status:** **RESOLVED & VERIFIED**

---

## 2. Original Bug & Reproduction
- **Navigation:** Admin Portal → Environment Setup (`/admin/setup`) → School Information → Contact Phone.
- **Reproduction Steps:**
  1. Navigate to `/admin/setup`.
  2. Input `9876543210111` into the Contact Phone input field.
  3. Click Save Settings.
- **Observed (Before Fix):**
  - The frontend accepted all 13 digits and dispatched payload `{ contactPhone: "9876543210111" }` to `PATCH /api/v1/settings/school`.
  - The backend schema allowed up to 30 characters (`.max(30)`), persisted `9876543210111` into the PostgreSQL `School.phone` VARCHAR(20) column, and returned HTTP 200 without validation error.

---

## 3. Root Cause Classification
- **Classification:**
  - **A. Frontend input configuration missing:** `<input type="tel">` lacked `maxLength={10}`, `inputMode="numeric"`, and `pattern="[0-9]{10}"`.
  - **B. Frontend validation missing:** `handleSave` did not validate 10 digits before dispatching API request.
  - **C. Frontend sanitization missing:** `onChange` did not strip non-numeric characters.
  - **D. Backend schema validation missing:** `updateSchoolSettingsSchema` in `settings.schemas.js` only defined `contactPhone: z.string().trim().max(30).optional().nullable()`, with no regex or exact length constraints.

---

## 4. Frontend Findings
- **File:** [frontend/src/pages/Admin/EnvironmentSetup.jsx](file:///c:/Projects/SMS/frontend/src/pages/Admin/EnvironmentSetup.jsx)
- **Form State:** `formData.contactPhone` stored as a string.
- **Form Submission:** `updateSchoolSettings` in [frontend/src/api/settings.js](file:///c:/Projects/SMS/frontend/src/api/settings.js) calling `PATCH /api/v1/settings/school`.
- **Changes Implemented:**
  - `onChange`: Cleans non-digits and truncates to 10 characters: `e.target.value.replace(/\D/g, '').slice(0, 10)`.
  - HTML attributes: Added `maxLength={10}`, `inputMode="numeric"`, `pattern="[0-9]{10}"`, `placeholder="10-digit mobile number"`.
  - Visual validation state: Border switches to rose/red with error message if entered length is > 0 and !== 10.
  - Pre-submit validation in `handleSave`: Displays toast error `"Contact phone must be exactly 10 digits."` and aborts save if phone is not valid.

---

## 5. Backend Findings
- **Route:** `PATCH /api/v1/settings/school` in [backend/src/modules/settings/settings.routes.js](file:///c:/Projects/SMS/backend/src/modules/settings/settings.routes.js)
- **Pipeline:** `authenticate` → `tenantContext` → `requireRole` → `validate(settingsSchemas.updateSchoolSettingsSchema)` → `settingsController.updateSchoolSettings` → `settingsService.updateSchoolSettings` → `settingsRepo.updateSchool`.
- **Validation Schema Hardened ([settings.schemas.js](file:///c:/Projects/SMS/backend/src/modules/settings/settings.schemas.js)):**
  ```javascript
  contactPhone: z.string().trim().regex(/^[0-9]{10}$/, 'Contact phone must be exactly 10 digits').optional().nullable(),
  phone: z.string().trim().regex(/^[0-9]{10}$/, 'Contact phone must be exactly 10 digits').optional().nullable(),
  ```

---

## 6. Database Findings
- **Prisma Schema:** [backend/prisma/schema.prisma](file:///c:/Projects/SMS/backend/prisma/schema.prisma#L28)
- **Model:** `School`
- **Field:** `phone String? @db.VarChar(20)`
- **Database Modification Required:** **NO**. The PostgreSQL column is `VARCHAR(20)` which accommodates 10-digit phone strings. Application-layer schema validation enforces the exact 10-digit constraint without requiring migrations or database schema changes.

---

## 7. Exact Files Modified
1. [backend/src/modules/settings/settings.schemas.js](file:///c:/Projects/SMS/backend/src/modules/settings/settings.schemas.js) — Added 10-digit regex constraint to `contactPhone` and `phone`.
2. [frontend/src/pages/Admin/EnvironmentSetup.jsx](file:///c:/Projects/SMS/frontend/src/pages/Admin/EnvironmentSetup.jsx) — Added `inputMode`, `maxLength`, `pattern`, `onChange` digit sanitization, inline validation warning, and `handleSave` guard.
3. [backend/tests/unit/settings/settings.schemas.test.js](file:///c:/Projects/SMS/backend/tests/unit/settings/settings.schemas.test.js) — Added unit test coverage for valid 10-digit and all invalid formats (<10, >10, 13-digit, non-numeric, symbols, empty string).
4. [backend/tests/unit/settings/settings.service.test.js](file:///c:/Projects/SMS/backend/tests/unit/settings/settings.service.test.js) — Updated test mocks to use standard 10-digit format.
5. [backend/tests/integration/settings/settings.integration.test.js](file:///c:/Projects/SMS/backend/tests/integration/settings/settings.integration.test.js) — Added HTTP 400 validation rejection tests for 13-digit and invalid phone numbers.
6. [frontend/src/pages/Admin/__tests__/EnvironmentSetupSettings.test.jsx](file:///c:/Projects/SMS/frontend/src/pages/Admin/__tests__/EnvironmentSetupSettings.test.jsx) — Added tests for frontend sanitization and validation.

---

## 8. Validation Behavior Matrix

| Input | Frontend Behavior | Backend API Response | Result |
|---|---|---|---|
| `9876543210` | Accepted (10 digits) | HTTP 200 OK | **ACCEPT** |
| `987654321` (9 digits) | Shows warning; blocked on save | HTTP 400 Validation Error | **REJECT** |
| `98765432101` (11 digits) | Truncated to 10 on typing; blocked if bypassed | HTTP 400 Validation Error | **REJECT** |
| `9876543210111` (13 digits) | Truncated to `9876543210`; blocked if bypassed | HTTP 400 Validation Error | **REJECT** |
| `abc9876543210` | Non-digits stripped to `9876543210` | HTTP 400 if sent raw | **REJECT / SANITIZED** |
| `+919876543210` | `+` stripped, clamped to 10 digits | HTTP 400 Validation Error | **REJECT / SANITIZED** |
| `98765 43210` | Space stripped to 10 digits | HTTP 400 Validation Error | **REJECT / SANITIZED** |
| `""` (empty string) | Blocked or cleared | HTTP 400 (if string provided) | **REJECT** |

---

## 9. Security, Tenant Isolation & RBAC Verification
- **Tenant Isolation:** Settings endpoints strictly bind updates to `req.tenant.schoolId` extracted from the verified JWT in `tenantContext` middleware. Client-supplied IDs in body are rejected by Zod `.strict()`.
- **RBAC:** Settings modification requires `SUPER_ADMIN`, `SCHOOL_ADMIN`, or `PRINCIPAL`. Other roles receive HTTP 403 Forbidden.
- **Firebase:** Environment Setup is 100% PostgreSQL REST API; zero Firebase/Firestore operations.

---

## 10. Test Results

### A. Focused Settings Tests (Backend)
```
 ✓ tests/unit/settings/settings.schemas.test.js (15 tests)
 ✓ tests/unit/settings/settings.service.test.js (10 tests)
 ✓ tests/integration/settings/settings.integration.test.js (9 tests)

Test Files: 3 passed (3)
Tests:      34 passed (34)
```

### B. Full Frontend Test Suite
```
Test Files: 132 passed (132)
Tests:      1260 passed (1260)
```

### C. Frontend Production Build
```
vite v8.3.1 building client environment for production...
✓ built in 26.93s
```

---

## 11. Final Status
**RESOLVED & VERIFIED**
