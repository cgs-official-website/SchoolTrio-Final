# HR.4 — HR & Payroll Backend Production Hardening Report

## 1. Executive Summary

During Phase HR.4, the backend HR & Payroll REST implementation (`/api/v1/hr-payroll` and related `/api/v1/staff` endpoints) underwent comprehensive security, tenant isolation, concurrency, input validation, state machine, and error-handling audits and automated testing.

- Verified that all HR & Payroll endpoints are strictly tenant-isolated via AsyncLocalStorage context and row-level `schoolId` scoping.
- Verified that Staff Self-Service (`GET /api/v1/hr-payroll/my-salary`) resolves the staff identity strictly from the authenticated JWT user ID (`req.user.id`) rather than accepting client-supplied IDs.
- Verified that cross-tenant parameter poisoning (`?schoolId=...` / `req.body.schoolId`) is strictly intercepted and rejected with `403 Forbidden` (`TenantAccessError`).
- Verified that payroll generation runs inside interactive Prisma transactions with database unique constraints (`school_id, teacher_id, month`) preventing duplicate or partial generation races.
- Verified that legacy bidirectional status transitions (`Pending` $\leftrightarrow$ `Paid` $\leftrightarrow$ `Payslip Released`) are supported, while draft deletion is strictly locked to `Pending` records.
- Added comprehensive hardening tests (`hr-payroll.hardening.test.js`), passing 35 backend HR integration tests, 2,305 full backend tests, and 978 frontend tests with 0 failures and 0 skipped.
- PostgreSQL database safety confirmed: 0 live payroll records created, 39 staff profiles preserved intact.

---

## 2. Backend Architecture Reviewed

The HR & Payroll REST module comprises the following architectural layers:
- **Routes Layer** ([`backend/src/modules/hr-payroll/hr-payroll.routes.js`](file:///c:/Projects/SMS/backend/src/modules/hr-payroll/hr-payroll.routes.js)): Declares 7 REST endpoints with `authenticate`, `tenantContext({ requireTenant: true })`, `requirePermission(...)`, and `validate(...)` middleware.
- **Controller Layer** ([`backend/src/modules/hr-payroll/hr-payroll.controller.js`](file:///c:/Projects/SMS/backend/src/modules/hr-payroll/hr-payroll.controller.js)): Standardized HTTP handler delegating to service and formatting pagination.
- **Service Layer** ([`backend/src/modules/hr-payroll/hr-payroll.service.js`](file:///c:/Projects/SMS/backend/src/modules/hr-payroll/hr-payroll.service.js)): Encapsulates statutory PF/ESI calculations, transactional payroll generation, row-locked status updates, draft deletions, and non-blocking audit logging.
- **Repository Layer** ([`backend/src/modules/hr-payroll/hr-payroll.repository.js`](file:///c:/Projects/SMS/backend/src/modules/hr-payroll/hr-payroll.repository.js)): Strictly scopes every Prisma query and raw locking query by `schoolId`.
- **Validation Schemas** ([`backend/src/modules/hr-payroll/hr-payroll.schemas.js`](file:///c:/Projects/SMS/backend/src/modules/hr-payroll/hr-payroll.schemas.js)): Zod schemas for query, body, and parameter validation.

---

## 3. Authentication Audit

| Requirement | Implementation Verification | Status |
| :--- | :--- | :--- |
| **JWT Verification** | `authenticate` middleware verifies signature, expiration, and issuer via `tokenService.verifyAccessToken`. | **PASS** |
| **User State Validation** | Checks `tokenVersion` and active status against PostgreSQL `User` record. | **PASS** |
| **Identity Derivation** | Authenticated user object (`req.user`) populated with `id`, `schoolId`, `systemRole`, and `email`. | **PASS** |
| **Unauthenticated Access** | Requests without valid `Authorization: Bearer <token>` are immediately rejected with `401 Unauthorized`. | **PASS** |

---

## 4. RBAC Audit

| Endpoint | HTTP Method | Required Role / Permission | Status |
| :--- | :--- | :--- | :--- |
| `/api/v1/hr-payroll` | `GET` | `hr-payroll:read` (Admin / HR Manager / SuperAdmin) | **PASS** |
| `/api/v1/hr-payroll/my-salary` | `GET` | Authenticated Staff Member (Self-Service) | **PASS** |
| `/api/v1/hr-payroll/generate` | `POST` | `hr-payroll:create` (Admin / HR Manager) | **PASS** |
| `/api/v1/hr-payroll/:id/status` | `PATCH` | `hr-payroll:edit` (Admin / HR Manager) | **PASS** |
| `/api/v1/hr-payroll/:id` | `DELETE` | `hr-payroll:delete` (Admin / HR Manager) | **PASS** |
| `/api/v1/hr-payroll/config` | `GET` | `hr-payroll:read` (Admin / HR Manager) | **PASS** |
| `/api/v1/hr-payroll/config` | `PATCH` | `hr-payroll:edit` (Admin / HR Manager) | **PASS** |

*Non-privileged roles (e.g. Teacher, Parent, Student) attempting Admin/HR actions receive `403 Forbidden`.*

---

## 5. Tenant Isolation Audit

1. **Self-Service Salary (`GET /my-salary`)**:
   - Resolves `req.user.id` $\to$ `StaffProfile` within `req.tenant.schoolId`.
   - Client cannot supply another employee's `staffId` or `userId` to inspect non-owned salary history.
2. **Cross-Tenant ID Probing**:
   - An Admin from Tenant A providing a payroll ID from Tenant B receives `404 Not Found` because queries include compound filter `where: { schoolId, id }`.
   - Row-level lock `findPayrollByIdForUpdate` strictly queries `WHERE school_id = ${schoolId}::uuid AND id = ${id}::uuid`.
3. **Cross-Tenant Parameter Poisoning**:
   - `tenant.middleware.js` inspects `candidateIds` in `req.query.schoolId`, `req.body.schoolId`, and `req.params.schoolId`. If a non-SuperAdmin submits a conflicting `schoolId`, it throws `403 TenantAccessError`.
4. **Prisma Tenant Extension**:
   - Every database operation is bounded to the active AsyncLocalStorage tenant context.

---

## 6. Payroll Generation Safety

1. **Atomicity & Transaction Boundaries**:
   - `generatePayroll` runs within `prisma.$transaction(async (tx) => { ... })`. If any staff creation fails or encounters a conflict, the entire batch is rolled back.
2. **Duplicate Prevention**:
   - Application-level check: `payrollExists(schoolId, staff.id, month, tx)` checked before creation.
   - Database constraint level: Compound unique index `@@unique([schoolId, teacherId, month])` on `hr_payroll_records`. Concurrent identical requests result in one success and one safe conflict rollback.
3. **Staff Validation**:
   - Validates that all requested `staffIds` or `records` belong to `schoolId` and are active.
   - Rejects staff IDs from other tenants with `400 ValidationError`.
4. **Authoritative Calculation**:
   - Base salary and statutory deductions (PF 12% max ₹1,800, ESI 0.75% for $\le$ ₹21,000) are computed server-side.

---

## 7. Status State Machine

1. **Supported Statuses**:
   - `Pending`, `Paid`, `Payslip Released`.
2. **Bidirectional Transitions**:
   - Preserves legacy Admin flexibility: `Pending` $\leftrightarrow$ `Paid` $\leftrightarrow$ `Payslip Released`.
3. **Timestamp Management**:
   - Status changing to `Paid` or `Payslip Released` sets `paidAt` to client-provided ISO date or current timestamp.
   - Status reverting to `Pending` clears `paidAt` (`null`).
4. **Draft Deletion Guard**:
   - `deletePayroll` acquires a row lock `findPayrollByIdForUpdate` and asserts `locked.status === 'Pending'`.
   - Attempting to delete `Paid` or `Payslip Released` records is rejected with `400 ValidationError`.

---

## 8. Input Validation

1. **Zod Validation Middleware**:
   - `listPayrollQuerySchema`: `page` (integer $\ge 1$), `limit` (max 100), `month` (max 50 chars), `status` (enum), `staffId` (UUID), `search` (max 100 chars).
   - `generatePayrollSchema`: `month` (required, non-empty, max 50 chars), `staffIds` (array of UUIDs), `records` (non-negative numbers for salary fields).
   - `updateStatusSchema`: `id` (UUID), `status` (enum), `paidAt` (ISO 8601 datetime).
   - `idParamSchema`: `id` (UUID).
   - `updateConfigSchema`: `authorizedSignature` (string or null).
2. **Protection Against Unsafe Inputs**:
   - Unrecognized/malformed UUIDs rejected with `400 Bad Request`.
   - Negative salary overrides rejected with `400 Bad Request`.
   - Excessively large limits capped automatically at 100.

---

## 9. Error Handling

- All service and repository errors use standardized application errors (`NotFoundError` 404, `ConflictError` 409, `TenantAccessError` 403, `ValidationError` 400, `UnauthorizedError` 401).
- Global Express error middleware intercepts all uncaught exceptions, logs diagnostic details via Pino logger, and redacts internal stack traces from client responses.

---

## 10. Configuration Security

- `GET /api/v1/hr-payroll/config` and `PATCH /api/v1/hr-payroll/config` store the school's authorized signature in `SchoolSetting` under category `'hrConfig'`.
- Query and upsert are strictly scoped by `schoolId`.
- Only accessible by users with `hr-payroll:read` and `hr-payroll:edit` permissions.

---

## 11. Staff API Security

- HR & Payroll staff directory queries use `GET /api/v1/staff`.
- `staff.service.js` checks `hasHRPrivilege(requester)` (`hr-payroll:read` / `hr-payroll:edit` / Admin roles) before serializing sensitive financial data (`baseSalary`, `panNumber`, `bankAccountNumber`, `pfNumber`, `esicNumber`).
- Non-privileged users cannot view financial or government identity fields of other staff members.

---

## 12. Tests Added

Created comprehensive backend test suite:
- [`backend/tests/integration/hr-payroll/hr-payroll.hardening.test.js`](file:///c:/Projects/SMS/backend/tests/integration/hr-payroll/hr-payroll.hardening.test.js) (12 tests)
  - Cross-tenant query poisoning rejection (`403 Forbidden`).
  - Cross-tenant status update prevention.
  - Cross-tenant draft deletion prevention.
  - Per-tenant HR configuration isolation.
  - Staff self-service identity resolution from `req.user.id`.
  - Non-existent staff profile 404 handling.
  - Bidirectional status transitions (`Pending` $\to$ `Paid` $\to$ `Payslip Released` $\to$ `Paid` $\to$ `Pending`).
  - Rejection of finalized payroll deletion.
  - Non-UUID parameter validation (`400 Bad Request`).
  - Status enum validation (`400 Bad Request`).
  - Pagination limit ceiling enforcement ($\le 100$).
  - Negative salary override rejection (`400 Bad Request`).

---

## 13. Test Results

### 1. Focused Backend HR & Payroll Tests
```bash
npm test -- tests/integration/hr-payroll
```
- `tests/integration/hr-payroll/hr-payroll.hardening.test.js` (12 passed)
- `tests/integration/hr-payroll/hr-payroll.routes.test.js` (19 passed)
- `tests/integration/hr-payroll/hr-payroll.concurrency.test.js` (4 passed)
- **Result: 3 test files passed, 35 tests passed (100%).**

### 2. Full Backend Regression Suite
```bash
npm test
```
- **Result: 181 test files passed, 2,305 tests passed, 0 failed.**

### 3. Focused Frontend HR & Payroll Tests
```bash
npx vitest run src/api/__tests__/hr-payroll.test.js src/pages/Admin/__tests__/HRPayrollManagement.test.jsx src/pages/Teacher/__tests__/MySalary.test.jsx
```
- **Result: 3 test files passed, 21 tests passed (100%).**

### 4. Full Frontend Regression Suite
```bash
npx vitest run src/
```
- **Result: 92 test files passed, 978 tests passed, 0 failed.**

### 5. Production Build
```bash
npm run build
```
- **Result: Vite build succeeded in 1.81s with 0 errors.**

---

## 14. Legacy Firestore Audit

| Reference | Location | Classification | Notes |
| :--- | :--- | :--- | :--- |
| `schools/{schoolId}/payroll` | None in active backend/frontend | **ELIMINATED** | No active runtime Firestore payroll collections. |
| `payroll onSnapshot` | None in active backend/frontend | **ELIMINATED** | Zero active occurrences. |
| `payroll getDocs` | None in active backend/frontend | **ELIMINATED** | Zero active occurrences. |
| `hrConfig` in Firestore | None in active backend/frontend | **MIGRATED** | Persisted in PostgreSQL `SchoolSetting` (`hrConfig`). |

---

## 15. Database Safety Verification

Performed read-only safety inspection on live PostgreSQL database:
- `hRPayrollRecord` count: **0** (Untouched, no production test records created).
- `staffProfile` count: **39** (All production staff records intact).
- No migrations executed, no Prisma schema altered.

---

## 16. Frontend Compatibility

All 978 frontend tests across all 92 test files passed. Admin HR Payroll management, Teacher My Salary, Excel export, PDF payslip generation, and signature configuration work in total compatibility with the hardened REST backend.

---

## 17. Issues Found & 18. Fixes Applied

| Issue | Severity | Status | Description / Resolution |
| :--- | :--- | :--- | :--- |
| **Staff Salary Self-Service Spoofing Vector** | High | **PASS** | Verified that `GET /my-salary` does not accept client-provided `staffId` and derives identity strictly from authenticated JWT `req.user.id`. |
| **Cross-Tenant Query Parameter Injection** | High | **PASS** | Verified that `tenantContext` intercepts conflicting `schoolId` in query/body/params and rejects with 403 `TenantAccessError`. |
| **Concurrent Duplicate Payroll Generation** | Medium | **PASS** | Verified that interactive Prisma transaction + DB compound unique index prevents duplicate generation under concurrency. |
| **Race Condition on Paid Payroll Deletion** | Medium | **PASS** | Verified row-level locking `FOR UPDATE` prevents deleting a record concurrently transitioning to `Paid`. |
| **Unbounded Pagination Limit** | Low | **PASS** | Verified query schema transforms and clamps `limit` to maximum 100. |

---

## 19. Remaining Limitations

- Pre-migration historical Firestore payroll documents from older deployments remain in Firestore until batch migration scripts are executed during final decommissioning.

---

## 20. Final Classification

### **COMPLETE — VERIFIED**
