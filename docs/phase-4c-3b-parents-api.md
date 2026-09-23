# Phase 4C.3-B — Parents & Parent-Student Links API Implementation Report

**Classification**: COMPLETE — VERIFIED WITH LIMITATIONS  
**Date**: September 10, 2026  
**Target Environment**: Node.js 24.x, Express, Prisma ORM, PostgreSQL 16+  
**Scope**: Backend API Implementation for Parents, Parent-Student Links, and Parent Self-Service Children Discovery  

---

## 1. Implementation Summary

Phase 4C.3-B implements the multi-tenant REST API surface for Parent Profile management, M:N Parent-Student Links, and authenticated Parent Portal self-service children discovery.

### Key Architectural Highlights:
1. **1:1 User-ParentProfile Relationship**: `ParentProfile` links strictly to `User` via unique `userId`.
2. **M:N Student Linking**: Sibling relationships and multi-parent households are represented via `ParentStudentLink` constrained by `@@unique([parentProfileId, studentId])`.
3. **Identity Reuse**: Creating links via Mode B checks normalized email and phone within the current tenant, preventing duplicate user accounts for siblings while preserving the 70 existing multi-child parent profiles in migrated data.
4. **Collision-Safe Institutional Placeholder Email**: If email is omitted, generates `parent.<phone || uuid>_<hex8>@<schoolCode>.parent.internal` and initializes the user with `passwordHash = '!LOCKED_NO_PASSWORD_SET'`.
5. **Atomic Deactivation & Token Invalidation**: Updating `isActive: false` updates `User.isActive = false` and atomically increments `User.tokenVersion`, invalidating active sessions.
6. **Parent Self-Service Isolation**: `GET /api/v1/parents/me/children` strictly uses `req.user.id` to discover linked children and prohibits query-parameter tampering.
7. **Canonical Audit Logging**: Dispatches `CREATE_PARENT`, `UPDATE_PARENT`, `LINK_PARENT_STUDENT`, `UNLINK_PARENT_STUDENT`, `DISABLE_PARENT`, and `ENABLE_PARENT` non-blockingly without polluting no-ops.

---

## 2. Files Changed

### Backend Source Modules Created:
- [`backend/src/modules/parents/parent.schemas.js`](file:///c:/Projects/SMS/backend/src/modules/parents/parent.schemas.js): Zod validation schemas for query filters, route params, update payloads, and linking modes.
- [`backend/src/modules/parents/parent.repository.js`](file:///c:/Projects/SMS/backend/src/modules/parents/parent.repository.js): Tenant-isolated Prisma queries for `ParentProfile`, `User`, and `ParentStudentLink`.
- [`backend/src/modules/parents/parent.service.js`](file:///c:/Projects/SMS/backend/src/modules/parents/parent.service.js): Business domain logic for listing, details, delta updates, identity reuse, placeholder email generation, linking, unlinking, and audit logs.
- [`backend/src/modules/parents/parent.controller.js`](file:///c:/Projects/SMS/backend/src/modules/parents/parent.controller.js): Express controllers returning standard `ApiResponse` envelopes.
- [`backend/src/modules/parents/parent.routes.js`](file:///c:/Projects/SMS/backend/src/modules/parents/parent.routes.js): Parent router mounted with authentication, tenant resolution, and RBAC guards.

### Existing Backend Modules Updated:
- [`backend/src/modules/students/student.routes.js`](file:///c:/Projects/SMS/backend/src/modules/students/student.routes.js): Mounted `/:studentId/parents` endpoints (GET with `students.read` or parent self-access, POST with `students.create`, DELETE with `students.delete`).
- [`backend/src/routes/index.js`](file:///c:/Projects/SMS/backend/src/routes/index.js): Mounted `/parents` under API v1 router.

### Test Suites Created:
- [`backend/tests/unit/parents/parent.schemas.test.js`](file:///c:/Projects/SMS/backend/tests/unit/parents/parent.schemas.test.js): 17 unit tests for Zod validation schemas.
- [`backend/tests/unit/parents/parent.service.test.js`](file:///c:/Projects/SMS/backend/tests/unit/parents/parent.service.test.js): 18 unit tests for service business logic.
- [`backend/tests/unit/parents/parent.concurrency.test.js`](file:///c:/Projects/SMS/backend/tests/unit/parents/parent.concurrency.test.js): 3 unit tests verifying PostgreSQL P2002 conflict handling.
- [`backend/tests/integration/parents/parent-endpoints.test.js`](file:///c:/Projects/SMS/backend/tests/integration/parents/parent-endpoints.test.js): 12 integration tests across all 7 endpoints.
- [`backend/tests/security/parent-tenant-isolation.test.js`](file:///c:/Projects/SMS/backend/tests/security/parent-tenant-isolation.test.js): 10 security tests verifying multi-tenant isolation, tampering rejection, and SuperAdmin switching.

---

## 3. API Endpoints

| Method | Path | Required Auth / Role | Permission | Description |
|---|---|---|---|---|
| `GET` | `/api/v1/parents` | Authenticated Institutional | `students.read` | List paginated parent profiles with search and child count. |
| `GET` | `/api/v1/parents/:id` | Authenticated Institutional | `students.read` | Get single parent profile with safe user details and linked children. |
| `PATCH` | `/api/v1/parents/:id` | Authenticated Institutional | `students.edit` | Update parent profile fields or toggle active status. |
| `GET` | `/api/v1/students/:studentId/parents` | Authenticated Staff / Linked Parent | `students.read` / Self | List parents linked to a student (or self for linked parent). |
| `POST` | `/api/v1/students/:studentId/parents` | Authenticated Institutional | `students.create` | Link existing parent (Mode A) or create & link new parent (Mode B). |
| `DELETE` | `/api/v1/students/:studentId/parents/:parentId` | Authenticated Institutional | `students.delete` | Unlink parent from student (deletes only `ParentStudentLink`). |
| `GET` | `/api/v1/parents/me/children` | Authenticated PARENT | Role `PARENT` | Self-service endpoint to view linked children. |

---

## 4. Request/Response Contracts

### A. `GET /api/v1/parents`
- **Query Params**: `search`, `phone`, `email`, `page`, `limit`, `sort`, `order`
- **Response**:
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Parents retrieved successfully",
  "data": [
    {
      "id": "uuid",
      "schoolId": "uuid",
      "userId": "uuid",
      "name": "Jane Doe",
      "phone": "9876543210",
      "email": "jane.doe@example.com",
      "address": "123 Main St",
      "emergencyContact": "9876543211",
      "createdAt": "2026-09-10T00:00:00.000Z",
      "updatedAt": "2026-09-10T00:00:00.000Z",
      "user": {
        "id": "uuid",
        "email": "jane.doe@example.com",
        "systemRole": "PARENT",
        "isActive": true,
        "tokenVersion": 1
      },
      "_count": { "children": 2 }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

### B. `GET /api/v1/parents/:id`
- **Response**: Single parent object with detailed `children` list containing student admission numbers, names, classes, and sections.

### C. `PATCH /api/v1/parents/:id`
- **Body**:
```json
{
  "name": "Jane Doe Updated",
  "phone": "9876543210",
  "email": "new.email@example.com",
  "address": "456 Oak St",
  "emergencyContact": "9876543212",
  "isActive": false
}
```

### D. `POST /api/v1/students/:studentId/parents`
- **Mode A (Existing Parent)**:
```json
{
  "parentProfileId": "c5d1e2f3-1111-4111-8111-111111111111",
  "relationship": "Mother"
}
```
- **Mode B (New Parent with Identity Reuse)**:
```json
{
  "name": "John Doe",
  "phone": "9876543210",
  "email": "john.doe@example.com",
  "relationship": "Father",
  "address": "123 Main St",
  "emergencyContact": "9876543211"
}
```

### E. `DELETE /api/v1/students/:studentId/parents/:parentId`
- **Response**: `200 OK` with `data: null`, unlinking student and parent while leaving both entities intact.

### F. `GET /api/v1/parents/me/children`
- **Headers**: `Authorization: Bearer <Parent_JWT>`
- **Response**: Array of student objects with enrollment class/section details.

---

## 5. Validation

- Validated using Zod schemas in [`parent.schemas.js`](file:///c:/Projects/SMS/backend/src/modules/parents/parent.schemas.js).
- Protected fields (`id`, `schoolId`, `userId`, `createdAt`, `updatedAt`, `legacyFirestoreId`, `passwordHash`, `systemRole`, `tokenVersion`) are stripped from request bodies.
- String fields are trimmed; emails are normalized to lowercase; phone numbers and relationships are bounded.

---

## 6. Identity Reuse

When calling Mode B `POST /api/v1/students/:studentId/parents`:
1. The service searches for an existing `ParentProfile` in the current tenant by normalized `email`.
2. If not matched, it searches by `phone`.
3. If an existing profile is found, the system reuses that `ParentProfile` and creates a `ParentStudentLink` for the new student.
4. If neither matches, a new `User`, `ParentProfile`, and `ParentStudentLink` are created atomically.

---

## 7. Placeholder Email Strategy

If a parent is created without an email address:
- **Format**: `parent.<phone || uuid>_<hex8>@<schoolCode>.parent.internal`
- **Tenant Scope**: Authorized `<schoolCode>` is fetched directly from the database `School` record (never trusted from client input).
- **Security**: Account created with `passwordHash: '!LOCKED_NO_PASSWORD_SET'`, preventing unauthorized logins until explicit credentials are setup.

---

## 8. Tenant Isolation

1. Tenant identity is strictly derived from `req.tenant.schoolId`.
2. All database queries include `schoolId` in the `where` clause.
3. Cross-tenant reads return `404 NotFoundError` without disclosing entity existence.
4. Tampered `schoolId`, `parentId`, or `studentId` in headers, query strings, or route parameters are caught and rejected.
5. SuperAdmin tenant switching via `X-Tenant-Id` header is supported.

---

## 9. RBAC

Permissions map to canonical existing keys:
- `students.read`: `GET /parents`, `GET /parents/:id`, `GET /students/:studentId/parents`
- `students.edit`: `PATCH /parents/:id`
- `students.create`: `POST /students/:studentId/parents`
- `students.delete`: `DELETE /students/:studentId/parents/:parentId`
- Role `PARENT`: `GET /parents/me/children` and self-access on `GET /students/:studentId/parents`

---

## 10. Parent Authentication Compatibility

- Parent accounts created by the API are compatible with `POST /api/v1/auth/admission-login` and `POST /api/v1/auth/login`.
- Accounts with `!LOCKED_NO_PASSWORD_SET` are securely locked out from password authentication until password setup or reset is initiated.

---

## 11. ParentStudentLink Semantics

- M:N relationship junction.
- `DELETE /students/:studentId/parents/:parentId` deletes **only** the link row.
- Neither `ParentProfile` nor `User` is deleted or deactivated during an unlink operation.
- Siblings linked to other students remain intact.

---

## 12. Deactivation Semantics

When `PATCH /parents/:id` is submitted with `{ "isActive": false }`:
1. `User.isActive` is set to `false`.
2. `User.tokenVersion` is incremented by 1 atomically.
3. Any active refresh sessions or subsequent token exchanges are immediately invalidated.
4. Audit log event `DISABLE_PARENT` is dispatched.

---

## 13. Audit Logging

Non-blocking dispatch via `createAuditLog` from `audit.repository.js`:
- `CREATE_PARENT`: Dispatched on new parent creation.
- `UPDATE_PARENT`: Dispatched on profile update.
- `LINK_PARENT_STUDENT`: Dispatched on parent-to-student linking.
- `UNLINK_PARENT_STUDENT`: Dispatched on unlinking.
- `DISABLE_PARENT` / `ENABLE_PARENT`: Dispatched on status toggles.
- No-op updates trigger 0 database writes and 0 audit entries.

---

## 14. Transaction Boundaries

- `linkParentToStudent` (Mode B): Uses `prisma.$transaction` to guarantee atomic creation of `User`, `ParentProfile`, and `ParentStudentLink`.
- `updateParent`: Uses `prisma.$transaction` to atomically update `ParentProfile` and `User` (for email and `isActive`/`tokenVersion` changes).

---

## 15. Concurrency Protection

- **Duplicate Links**: Protected by PostgreSQL constraint `@@unique([parentProfileId, studentId])`. P2002 errors are caught and converted to clean `409 ConflictError`.
- **Duplicate User Emails**: Protected by PostgreSQL `User.email @unique`. P2002 errors are caught and converted to clean `409 ConflictError`.
- **Student Verification**: Student existence in current tenant is verified prior to linking.

---

## 16. Tests

### Test Execution Summary:
- **Parent Unit Tests**: 38 tests (`parent.schemas.test.js`: 17, `parent.service.test.js`: 18, `parent.concurrency.test.js`: 3).
- **Parent Integration Tests**: 12 tests (`parent-endpoints.test.js`).
- **Parent Security & Tenant Isolation Tests**: 10 tests (`parent-tenant-isolation.test.js`).
- **Total Parent Domain Tests**: 60 passed (0 failed).

---

## 17. Regression Results

Full backend regression suite execution:
- **Total Test Files**: 71 passed (71 total)
- **Total Tests**: 743 passed (743 total)
- **Failures**: 0
- **Duration**: 22.32s

---

## 18. Lint

- `npm run lint`: **0 errors**, 1 pre-existing warning in migration utility (`school-s019-actual-migrator.js`).

---

## 19. Prisma Validation

- `npx prisma validate`: **Schema is valid**.
- Schema and migrations were not modified during this phase.

---

## 20. Live DB Safety

- Railway PostgreSQL database was kept strictly read-only.
- No destructive writes, schema migrations, or data alterations were performed against live data.

---

## 21. Git Diff Review

- `backend/src/modules/parents/*`: 5 new files created.
- `backend/tests/*parents*`: 5 new test files created.
- `backend/src/routes/index.js`: Mounted `/parents` route.
- `backend/src/modules/students/student.routes.js`: Mounted `/:studentId/parents` routes.
- Frontend files: 0 modified.
- Prisma schema: 0 modified.
- Migrations: 0 modified.

---

## 22. Known Limitations

- **Real Multi-Connection PostgreSQL Concurrency Test**: Not executed against a dedicated disposable PostgreSQL cluster (preventing destructive writes on shared live data). Concurrency behaviors are verified via transaction boundaries, mock unit tests catching Prisma P2002 exceptions, and integration tests.

---

## 23. Final Classification

**`COMPLETE — VERIFIED WITH LIMITATIONS`**  
All required API endpoints, schemas, repositories, services, controllers, route guards, integration tests, tenant security tests, and regression tests are implemented and 100% passing. Hard scope boundaries respected.
