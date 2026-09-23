# Phase 4C.6-B1 — Invoice Read & Query APIs Management Documentation

## 1. Executive Summary & Scope
Phase 4C.6-B1 implements the read-only and query data access layer for Invoice Management in the multi-tenant School Management System SaaS backend.

### In Scope (Batch 1):
1. **`GET /api/v1/invoices`**: Paginated listing of invoices with multi-attribute filtering (class, student, fee structure, collection period, status, overdue) and multi-field search.
2. **`GET /api/v1/invoices/stats`**: Institutional aggregate financial statistics calculated directly in PostgreSQL (`totalExpected`, `collectedAmount`, `outstandingAmount`, `overdueAmount`, `overdueCount`, `unpaidCount`).
3. **`GET /api/v1/invoices/:id`**: Single invoice detail with historical snapshot preservation and tenant-safe relation joins (`student`, `feeStructure`, `collectionPeriod`).
4. **`GET /api/v1/students/:studentId/invoices`**: Student invoice history timeline ordered by due date, accompanied by a dynamic financial balance summary.

### Out of Scope (Deferred):
- Invoice cancellation (`PATCH /api/v1/invoices/:id/cancel` — Phase 4C.6-B2).
- Payment settlement, parent payments, receipts, refunds, and partial payments (Phase 4C.6-C).
- Generic Invoice `PATCH` / `DELETE`.
- Frontend UI modifications (Phase 5).
- Database migrations or schema changes.

---

## 2. Endpoints & Route Architecture

| Method | Path | Authentication | Authorization | Description |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/invoices` | Required | `fees.read` OR `PARENT` (child-scoped) | List invoices with pagination, filtering & search |
| `GET` | `/api/v1/invoices/stats` | Required | `fees.read` (Strict institutional only) | Institutional aggregate financial statistics |
| `GET` | `/api/v1/invoices/:id` | Required | `fees.read` OR `PARENT` (linked child only) | Single invoice detail with snapshot relations |
| `GET` | `/api/v1/students/:studentId/invoices` | Required | `fees.read` OR `PARENT` (linked child only) | Student invoice timeline & balance summary |

### Route Ordering & Collision Prevention:
In `invoice.routes.js`, `/stats` is mounted **before** `/:id` to ensure Express evaluates the static path segment first and never shadows `/stats` as an `:id` parameter.

---

## 3. Query Filters & Pagination

### Supported Filters on `GET /api/v1/invoices`:
- `page` (integer, $\ge 1$, default: `1`)
- `limit` (integer, $1..100$, default: `50`)
- `classId` (UUID) — filters invoices by target class
- `studentId` (UUID) — filters invoices for a specific student
- `feeStructureId` (UUID) — filters invoices generated from a specific FeeStructure
- `collectionPeriodId` (UUID) — filters invoices assigned to a collection period
- `status` (`Pending` | `Paid` | `Cancelled`)
- `overdue` (boolean: `true` | `false` | `1` | `0`) — filters invoices based on pending status and due date relative to `CURRENT_DATE`
- `search` (string, max 100 chars) — case-insensitive match across `feeName`, `student.firstName`, `student.lastName`, and `student.admissionNumber`
- `order` (`asc` | `desc`, default: `desc`) — orders by `createdAt` with deterministic `id ASC` tie-breaking

---

## 4. Parent Authorization & Security Model

Parent authorization is strictly enforced through dynamic relation traversal rather than role bypass:

```
JWT Token (User ID)
       ↓
ParentProfile (schoolId = req.tenant.schoolId)
       ↓
ParentStudentLink (active links in tenant)
       ↓
authorizedStudentIds: [studentId_1, studentId_2, ...]
```

### Security Invariants:
1. **Zero Existence Disclosure**: If a parent requests an invoice ID (`GET /invoices/:id`) or student history (`GET /students/:studentId/invoices`) for a student not linked to them, the service throws `NotFoundError` (`404 Not Found`). The existence of another parent's child or invoice is never disclosed.
2. **Scoping on Lists**: When listing invoices (`GET /invoices`), queries executed by a parent are strictly constrained to `{ studentId: { in: authorizedStudentIds } }`. If an unauthorized `studentId` filter is provided, an empty result (`total: 0`) is returned.
3. **Institutional Stats Denial**: Parents requesting `GET /invoices/stats` receive `403 Forbidden` (`requirePermission('fees', 'read')`).
4. **Orphan Invoices**: Invoices with `studentId = null` are strictly inaccessible to parents (return 404).

---

## 5. Multi-Tenant Isolation
- Authoritative tenant ID (`req.tenant.schoolId`) is enforced on every database query.
- Conflicting tenant IDs passed in query parameters or request bodies are rejected immediately by tenant middleware with `403 Forbidden`.
- Relations (`student`, `feeStructure`, `collectionPeriod`) are scoped to the authenticated tenant.

---

## 6. Financial Aggregations & Precision
All financial aggregations are computed directly in PostgreSQL using `NUMERIC(10,2)` / `Decimal` arithmetic via parameterized SQL queries to prevent JavaScript floating-point rounding errors:

### Institutional Statistics (`GET /invoices/stats`):
- `totalExpected`: $\sum \text{amount} \quad (\text{status} \ne \text{'Cancelled'})$
- `collectedAmount`: $\sum \text{amount} \quad (\text{status} = \text{'Paid'})$
- `outstandingAmount`: $\sum \text{amount} \quad (\text{status} = \text{'Pending'})$
- `overdueAmount`: $\sum \text{amount} \quad (\text{status} = \text{'Pending'} \land \text{dueDate} < \text{CURRENT\_DATE})$
- `overdueCount`: $\text{COUNT} \quad (\text{status} = \text{'Pending'} \land \text{dueDate} < \text{CURRENT\_DATE})$
- `unpaidCount`: $\text{COUNT} \quad (\text{status} = \text{'Pending'})$

### Dynamic Overdue Evaluation:
- `isOverdue` is calculated dynamically during read serialization:
  $$\text{isOverdue} = (\text{status} === \text{'Pending'} \land \text{dueDate} < \text{CURRENT\_DATE})$$
- Paid and Cancelled invoices always evaluate to `isOverdue = false`.

---

## 7. Historical Snapshot Preservation & Orphan Tolerance
- **Snapshot Immutability**: Historical invoice fields (`feeName`, `amount`, `dueDate`, `collectionPeriodId`, `customData`) are returned directly from `Invoice` without being overridden by any future modifications to the template `FeeStructure`.
- **Orphan Invoice Compatibility**: Invoices with `studentId = null` or `collectionPeriodId = null` serialize cleanly as `student: null` or `collectionPeriod: null` without serializer exceptions.

---

## 8. Audit Logging & Concurrency
- Read-only operations (`GET`) generate **zero** audit logs in compliance with project audit guidelines.
- Plain read queries do not require row locks (`FOR UPDATE`), allowing high-throughput concurrent reads.

---

## 9. Verification & Test Coverage
- **Unit Tests (Schemas)**: `tests/unit/invoices/invoice.schemas.test.js` (14 tests passed).
- **Unit Tests (Service)**: `tests/unit/invoices/invoice.service.test.js` (21 tests passed).
- **Integration Tests (Endpoints)**: `tests/integration/invoices/invoice-endpoints.test.js` (14 tests passed).
- **Security & Tenant Isolation Tests**: `tests/security/invoices-tenant-isolation.test.js` (8 tests passed).
- **Targeted Suite**: 57/57 tests passed (100%).
- **Full Regression**: 90 test files, 971/971 tests passed (100%).
- **Linting**: 0 errors.
- **Prisma Schema Validation**: Valid.
