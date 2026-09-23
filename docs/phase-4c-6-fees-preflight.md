# Phase 4C.6 — Fees, Fee Structures & Billing Preflight Audit Report

**Status:** AUDIT COMPLETE — PREFLIGHT READY  
**Classification:** **READY FOR IMPLEMENTATION**  
**Investigation Mode:** Strictly Read-Only Investigation (Zero code modifications, zero schema migrations, zero live DB mutations)

---

## 1. Executive Summary

This preflight report conducts an evidence-based architectural, database, and workflow audit of the **Fees, Fee Structures & Billing** domain in the School Management System SaaS platform.

### Key Discoveries:
1. **Prisma Relational Models Already Exist**:
   - `FeeCollectionPeriod` (`fee_collection_periods`) — Manages academic collection cycles (e.g., "Term 1", "Annual").
   - `FeeStructure` (`fee_structures`) — Defines fee templates per class with amount, due date, and collection period.
   - `Invoice` (`invoices`) — Represents individual student fee obligations, payment records, and settlement status.
   - **Zero Schema Changes Required**: All three core relational models are completely defined, foreign-keyed, and indexed in `schema.prisma`.
2. **Authoritative Financial Workflow**:
   - Admins define a `FeeStructure` targeting a `Class`.
   - Creating a `FeeStructure` automatically generates individual `Invoice` rows for all active students enrolled in that class.
   - Payment recording updates the `Invoice` status from `'Pending'` to `'Paid'` with timestamp (`paidAt`), mode (`paymentMode`), reference (`transactionReference`), and receipt (`receiptNumber`).
   - Parents view invoices and make/simulate payments strictly for their linked children via `req.user.id -> ParentProfile -> ParentStudentLink -> Student -> Invoice`.
3. **Absence of Speculative Features**:
   - Partial payments, installment plans, custom concessions, and payment gateway refunds are **not implemented** in the existing frontend or database models. Invoices are binary settled (`'Pending'` vs `'Paid'`), with overdue status dynamically evaluated (`dueDate < today && status !== 'Paid'`).
4. **Live Data Baseline**:
   - SchoolS024 currently contains 7 active `FeeStructures` and 104 `Invoices` (99 active student invoices + 5 preserved legacy orphan invoices with `studentId = null`).
   - SchoolS015 and SchoolS019 currently have 0 fee records in PostgreSQL.

---

## 2. Scope

### In-Scope (Phase 4C.6 Backend Domain)
1. **Fee Collection Periods API**:
   - CRUD for `FeeCollectionPeriod` (`/api/v1/fee-collection-periods`).
2. **Fee Structures API**:
   - CRUD for `FeeStructure` (`/api/v1/fee-structures`).
   - Automatic batch creation of student `Invoice` records on fee assignment.
3. **Invoices & Payment Recording API**:
   - List, retrieve, filter, and update invoices (`/api/v1/invoices`).
   - Record payment settlement (`PATCH /api/v1/invoices/:id/pay` or `POST /api/v1/invoices/:id/payments`).
   - Single-student and parent-scoped invoice history endpoints.
4. **Dashboard & Summary Metrics**:
   - Real-time revenue analytics (`totalExpected`, `collectedRevenue`, `outstandingBalance`, `overdueCount`, `overdueAmount`).
5. **Tenant Isolation, RBAC & Canonical Audit Logging**:
   - Strict `schoolId` enforcement, permission checking (`fees.read`, `fees.create`, `fees.edit`, `fees.delete`), parent-student verification, and post-commit audit dispatches (`CREATE_FEE_STRUCTURE`, `UPDATE_FEE_STRUCTURE`, `DELETE_FEE_STRUCTURE`, `RECORD_PAYMENT`, `CANCEL_INVOICE`).

### Out-of-Scope (Strict Hard Boundaries)
- Frontend React migration (strictly Phase 5).
- Third-party payment gateway webhooks (Razorpay / Stripe) integration.
- Speculative partial payments, discount ledgers, or refund ledgers.
- Modifying `Student.customData` informational tuition/hostel estimates.

---

## 3. Prisma Schema & Database Audit

### Model 1: `FeeCollectionPeriod`
- **Table Name**: `fee_collection_periods`
- **Primary Key**: `id` (`UUID`)
- **Fields**:
  - `id`: `String @id @default(uuid()) @db.Uuid`
  - `schoolId`: `String @map("school_id") @db.Uuid`
  - `name`: `String @db.VarChar(100)` (e.g. "Term 1", "Annual")
  - `dueDate`: `String @map("due_date") @db.VarChar(10)` (`YYYY-MM-DD`)
  - `displayOrder`: `Int @default(0) @map("display_order")`
  - `createdAt`: `DateTime @default(now())`
  - `updatedAt`: `DateTime @updatedAt`
- **Constraints**: `@@unique([schoolId, id])`
- **Foreign Keys**: `schoolId -> School.id` (`onDelete: Cascade`)
- **Relations**: `feeStructures: FeeStructure[]`, `invoices: Invoice[]`

### Model 2: `FeeStructure`
- **Table Name**: `fee_structures`
- **Primary Key**: `id` (`UUID`)
- **Fields**:
  - `id`: `String @id @default(uuid()) @db.Uuid`
  - `schoolId`: `String @map("school_id") @db.Uuid`
  - `name`: `String @db.VarChar(150)` (e.g. "Term 1 Tuition", "Annual Fees")
  - `amount`: `Decimal @db.Decimal(10, 2)` (Fixed-point 2 decimals)
  - `dueDate`: `String @map("due_date") @db.VarChar(10)` (`YYYY-MM-DD`)
  - `classId`: `String @map("class_id") @db.Uuid`
  - `collectionPeriodId`: `String? @map("collection_period_id") @db.Uuid`
  - `customData`: `Json? @map("custom_data")`
  - `createdAt`: `DateTime @default(now())`
  - `updatedAt`: `DateTime @updatedAt`
- **Constraints**: `@@unique([schoolId, id])`
- **Foreign Keys**:
  - `[schoolId, classId] -> Class.[schoolId, id]` (`onDelete: Cascade`)
  - `collectionPeriodId -> FeeCollectionPeriod.id` (`onDelete: SetNull`)
- **Relations**: `class: Class`, `collectionPeriod: FeeCollectionPeriod?`, `invoices: Invoice[]`

### Model 3: `Invoice`
- **Table Name**: `invoices`
- **Primary Key**: `id` (`UUID`)
- **Fields**:
  - `id`: `String @id @default(uuid()) @db.Uuid`
  - `schoolId`: `String @map("school_id") @db.Uuid`
  - `studentId`: `String? @map("student_id") @db.Uuid` (Nullable to preserve legacy orphans)
  - `feeStructureId`: `String @map("fee_structure_id") @db.Uuid`
  - `collectionPeriodId`: `String? @map("collection_period_id") @db.Uuid`
  - `feeName`: `String @map("fee_name") @db.VarChar(150)`
  - `amount`: `Decimal @db.Decimal(10, 2)`
  - `dueDate`: `String @map("due_date") @db.VarChar(10)` (`YYYY-MM-DD`)
  - `status`: `String @default("Pending") @db.VarChar(30)` (`"Pending" | "Paid" | "Cancelled"`)
  - `paidAt`: `DateTime? @map("paid_at")`
  - `paymentMode`: `String? @map("payment_mode") @db.VarChar(50)` (e.g. `"Cash" | "Online" | "Cheque" | "Bank Transfer"`)
  - `transactionReference`: `String? @map("transaction_reference") @db.VarChar(100)`
  - `receiptNumber`: `String? @map("receipt_number") @db.VarChar(100)`
  - `customData`: `Json? @map("custom_data")`
  - `createdAt`: `DateTime @default(now())`
  - `updatedAt`: `DateTime @updatedAt`
- **Constraints**:
  - `@@unique([schoolId, id])`
  - `@@index([schoolId, studentId])`
  - `@@index([schoolId, status, dueDate])`
- **Foreign Keys**:
  - `[schoolId, studentId] -> Student.[schoolId, id]` (`onDelete: SetNull`)
  - `[schoolId, feeStructureId] -> FeeStructure.[schoolId, id]` (`onDelete: Restrict`)
  - `collectionPeriodId -> FeeCollectionPeriod.id` (`onDelete: SetNull`)

---

## 4. Firestore Source & Path Audit

| Entity | Firestore Path | Document ID | Key Fields | Active Frontend Usage |
|---|---|---|---|---|
| **Fee Collection Period** | `schools/{schoolId}/feeCollectionPeriods/{id}` | Auto-ID | `name`, `code`, `displayOrder`, `description`, `status`, `createdAt`, `updatedAt` | Environment Setup (`EnvironmentSetup.jsx`) |
| **Fee Structure** | `schools/{schoolId}/feeStructures/{id}` | Auto-ID | `name`, `amount`, `dueDate`, `classId`, `collectionPeriodId`, `collectionPeriodName`, `customData`, `createdAt` | Fee Management (`FeeManagement.jsx`) |
| **Invoice** | `schools/{schoolId}/invoices/{id}` | Auto-ID | `studentId`, `feeId`, `feeName`, `amount`, `dueDate`, `status` (`'Pending'\|'Paid'`), `paidAt`, `collectionPeriodId`, `collectionPeriodName`, `customData`, `createdAt` | Fee Management (`FeeManagement.jsx`), Parent Fees (`Parent/Fees.jsx`), Parent Dashboard (`ParentDashboard.jsx`, `StudentOverview.jsx`), Admin Overview (`AdminOverview.jsx`) |
| **Student Fee Settings** | `schools/{schoolId}/students/{id}` | Student ID | `tuitionFee`, `hostelFee`, `bookFee`, `otherFee`, `totalFee` | Student Management (`StudentManagement.jsx`) |

---

## 5. Frontend Workflow Audit

### 1. Administrative Fee Workflow (`src/pages/Admin/FeeManagement.jsx`)
1. **Assign Fee**: Admin selects class, collection period, description, amount, and due date.
   - Frontend calls `createFeeStructure(schoolId, feeData)`.
   - `createFeeStructure` creates the `feeStructures` document, queries all students in the class, and executes a batch write creating 1 `invoices` document per enrolled student.
2. **Record Payment**: Admin clicks "Record Payment" on an unpaid invoice row.
   - Frontend calls `markInvoicePaid(schoolId, invoiceId)`.
   - `markInvoicePaid` updates `status = 'Paid'`, `paidAt = ISOString()`.
3. **Analytics**:
   - Calculates `expected`, `collected`, `outstanding`, `overdueCount`, `overdueAmount`, `unpaidCount`.
   - Overdue filter checks `inv.dueDate < today && inv.status !== 'Paid'`.

### 2. Parent Fee Workflow (`src/pages/Parent/Fees.jsx` & `ParentDashboard.jsx`)
1. **View Invoices**: Parent views invoices where `studentId === userProfile.linkedStudentId`.
2. **Dues Alert**: Visual alert banner displaying total outstanding / overdue dues.
3. **Simulate / Make Payment**: Parent clicks "Pay Dues" / "Pay Immediately".
   - Opens payment modal and calls `markInvoicePaid(schoolId, invoiceId)`.

---

## 6. Financial Data Integrity & Lifecycle

```
                           ┌────────────────────────┐
                           │   FeeStructure Created │
                           └───────────┬────────────┘
                                       │ (Batch Generates)
                                       ▼
                           ┌────────────────────────┐
                           │   Invoice: PENDING     │
                           └───────────┬────────────┘
                                       │
                 ┌─────────────────────┴─────────────────────┐
                 │                                           │
  (Payment Settled)                               (Administrative Void)
                 ▼                                           ▼
┌──────────────────────────────────┐        ┌──────────────────────────────────┐
│         Invoice: PAID            │        │       Invoice: CANCELLED         │
│   (Immutable Financial Record)   │        │   (Cannot be paid or reactivated)│
└──────────────────────────────────┘        └──────────────────────────────────┘
```

### Invariant Rules:
1. **Invoice Creation**: Invoices are generated automatically from `FeeStructure` class assignments or directly via administrative creation.
2. **Payment Settlement**:
   - When an invoice is paid, status transitions `Pending -> Paid`.
   - `paidAt`, `paymentMode`, `transactionReference`, and `receiptNumber` are stamped.
3. **Immutability of Paid Invoices**:
   - Once an invoice is `Paid`, its `amount`, `studentId`, `feeStructureId`, and `paidAt` are strictly **immutable**.
   - Attempting to edit or delete a `Paid` invoice is rejected with `409 ConflictError`.
4. **Cancellation / Voiding**:
   - An unpaid invoice may be cancelled (`status: 'Cancelled'`) or deleted by an authorized administrator (`fees.delete`).

---

## 7. Monetary Precision Audit

- **Prisma Schema Representation**: `Decimal @db.Decimal(10, 2)`
- **PostgreSQL Column Type**: `NUMERIC(10, 2)` (Supports monetary values from `0.00` to `99,999,999.99` with exact fixed-point precision).
- **JavaScript Runtime Handling**:
  - In backend services, monetary values will be handled with strict numeric validation (rejecting negative amounts, non-numeric values, or amounts exceeding 2 decimal places).
  - Floating-point inaccuracies (e.g., `0.1 + 0.2 !== 0.3`) are avoided by rounding calculations to 2 decimal places:
    `Number((amount).toFixed(2))`.

---

## 8. Dependency & Deletion Safety Matrix

| Entity | Child Dependent | FK Constraint | `onDelete` Behavior | Hard Delete Allowed? | Policy / Recommended Behavior |
|---|---|---|---|---|---|
| **School** | `FeeCollectionPeriod` | `schoolId` | `Cascade` | No | Tenant lifecycle only |
| **School** | `FeeStructure` | `schoolId` | `Cascade` | No | Tenant lifecycle only |
| **School** | `Invoice` | `schoolId` | `Cascade` | No | Tenant lifecycle only |
| **Class** | `FeeStructure` | `[schoolId, classId]` | `Cascade` | Restricted | Denied if class has fee structures (verified in `class.service.js`) |
| **FeeCollectionPeriod**| `FeeStructure` | `collectionPeriodId`| `SetNull` | Yes | Allowed if no historical lock needed |
| **FeeCollectionPeriod**| `Invoice` | `collectionPeriodId`| `SetNull` | Yes | Foreign key set to null |
| **FeeStructure** | `Invoice` | `[schoolId, feeStructureId]` | `Restrict` | Restricted | **DENIED** if invoices exist (`Restrict` constraint enforced) |
| **Student** | `Invoice` | `[schoolId, studentId]` | `SetNull` | Restricted | Denied if invoices exist (student deletion safety) |
| **Invoice** | *(None)* | — | — | Restricted | **DENIED** if `status === 'Paid'`. Allowed if `status === 'Pending'`. |

---

## 9. Concurrency & Locking Strategy

### Scenario A: Concurrent Payment Recording
Two requests attempt to mark the same invoice as paid simultaneously:
1. Transaction acquires row-level lock:
   ```sql
   SELECT id, school_id, status, amount
   FROM invoices
   WHERE school_id = $1::uuid AND id = $2::uuid
   FOR UPDATE
   ```
2. Checks current status:
   `if (invoice.status === 'Paid') throw new ConflictError('Invoice has already been paid');`
3. Sets `status = 'Paid'`, stamps `paidAt`, and commits.
4. Second concurrent worker reads locked row, detects `status === 'Paid'`, and fails cleanly without double-recording or duplicate receipt generation.

### Scenario B: Concurrent Fee Structure Creation & Student Query
When a fee structure is assigned to a class, the transaction:
1. Validates class existence and tenant boundary.
2. Creates the `FeeStructure` entity.
3. Queries active students in `classId` and batch-creates `Invoice` records.
4. Commits atomically in a single Prisma `$transaction`.

---

## 10. Multi-Tenant Isolation & Security

1. **Tenant Derivation**:
   - `req.tenant.schoolId` is the sole source of truth for all database queries.
   - Any client-provided `schoolId` in URL params, query strings, or body payloads is rejected with `403 Forbidden` by `tenantContext({ requireTenant: true })`.
2. **Foreign Reference Validation**:
   - When creating a fee structure, `classId` and optional `collectionPeriodId` are verified to belong to `req.tenant.schoolId`.
   - When creating or modifying invoices, `studentId`, `feeStructureId`, and `collectionPeriodId` are validated against the active school. Cross-tenant IDs return `404 Not Found`.

---

## 11. Parent Access & Privilege Separation

### Access Verification Chain
```
req.user.id
    │
    ▼
ParentProfile (where: { schoolId, userId: req.user.id })
    │
    ▼
ParentStudentLink (where: { schoolId, parentProfileId, studentId })
    │
    ▼
Student Invoices (where: { schoolId, studentId })
```

- Parents may only view and pay invoices for students explicitly linked to their verified `ParentProfile`.
- Direct invoice lookup by ID (`GET /api/v1/invoices/:id`) verifies that the invoice's `studentId` belongs to the parent's linked students. Unlinked invoice access returns `403 Forbidden` / `404 Not Found`.

---

## 12. RBAC Permission Mapping

Canonical Module Key: `'fees'`

| Operation | Required Permission | Roles Permitted by Default |
|---|---|---|
| List / View Fee Structures | `fees.read` | `SUPER_ADMIN`, `SCHOOL_ADMIN`, `Correspondent`, `Principal`, `Finance Department`, `Administrative Officer` |
| Create Fee Structure | `fees.create` | `SUPER_ADMIN`, `SCHOOL_ADMIN`, `Correspondent`, `Principal`, `Finance Department` |
| Update Fee Structure | `fees.edit` | `SUPER_ADMIN`, `SCHOOL_ADMIN`, `Correspondent`, `Principal`, `Finance Department` |
| Delete Fee Structure | `fees.delete` | `SUPER_ADMIN`, `SCHOOL_ADMIN`, `Correspondent`, `Principal`, `Finance Department` |
| List / View Invoices | `fees.read` | `SUPER_ADMIN`, `SCHOOL_ADMIN`, `Correspondent`, `Principal`, `Finance Department`, `Administrative Officer` |
| View Own Child Invoices | Authenticated Linked Parent | `PARENT` (via `ParentStudentLink`) |
| Record / Settle Payment | `fees.edit` | `SUPER_ADMIN`, `SCHOOL_ADMIN`, `Finance Department`, `Administrative Officer` |
| Parent Settle Own Invoice | Authenticated Linked Parent | `PARENT` (simulated / online payment for linked child) |
| Cancel / Delete Invoice | `fees.delete` | `SUPER_ADMIN`, `SCHOOL_ADMIN`, `Finance Department` |
| View Financial Reports | `fees.read` (or `reports.read`) | `SUPER_ADMIN`, `SCHOOL_ADMIN`, `Correspondent`, `Principal`, `Finance Department` |

---

## 13. Audit Logging Architecture

Canonical audit events dispatched asynchronously post-commit via `createAuditLog`:
- `CREATE_FEE_COLLECTION_PERIOD: <PeriodName>`
- `UPDATE_FEE_COLLECTION_PERIOD: <PeriodName>`
- `DELETE_FEE_COLLECTION_PERIOD: <PeriodName>`
- `CREATE_FEE_STRUCTURE: <FeeName> (<ClassName>)`
- `UPDATE_FEE_STRUCTURE: <FeeName>`
- `DELETE_FEE_STRUCTURE: <FeeName>`
- `RECORD_PAYMENT: <InvoiceId> (₹<Amount> - <StudentName>)`
- `CANCEL_INVOICE: <InvoiceId>`
- `DELETE_INVOICE: <InvoiceId>`

---

## 14. Live Database Read-Only Findings

| School Code | School Name | Students | FeeCollectionPeriods | FeeStructures | Invoices (Total / Paid / Pending / Orphan) |
|---|---|---|---|---|---|
| `SchoolS015` | TrustITec College | 375 | 0 | 0 | 0 (0 Paid / 0 Pending / 0 Orphan) |
| `SchoolS019` | Zuna International School | 0 | 0 | 0 | 0 (0 Paid / 0 Pending / 0 Orphan) |
| `SchoolS024` | Spring Mount Valley School | 340 | 0 | 7 | 104 (1 Paid / 103 Pending / 5 Orphan) |
| `SYSTEM_TEMPLATE`| System Template School | 0 | 0 | 0 | 0 (0 Paid / 0 Pending / 0 Orphan) |

### SchoolS024 Fee Structures Detail:
1. `[762edf2c...]` "Annual Fees" — ₹83,850 (Class: I - A, Invoices: 14)
2. `[8373b5f3...]` "Annual Fees" — ₹73,800 (Class: NNLP 3 - A, Invoices: 20)
3. `[c3990a5d...]` "Annual Fees" — ₹73,800 (Class: NNLP 3 - B, Invoices: 15)
4. `[ca2f046b...]` "Annual Fees" — ₹77,000 (Class: NNLP 4 - A, Invoices: 19)
5. `[ce644cce...]` "Annual Fees" — ₹77,000 (Class: NNLP 4 - B, Invoices: 17)
6. `[ded0400e...]` "Annual Fees" — ₹62,500 (Class: NNLP 2 - A, Invoices: 19)
7. `[fc3adffc...]` "Annual Fees" — ₹62,500 (Class: NNLP 2 - B, Invoices: 0)

---

## 15. Realtime Classification

- **Classification**: **A. REST + TanStack Query sufficient**
- The frontend currently listens to `schools/{schoolId}/invoices` and `schools/{schoolId}/feeCollectionPeriods` via Firestore `onSnapshot`.
- In Phase 5 (Frontend Migration), standard REST endpoints combined with TanStack Query cache invalidation (`queryClient.invalidateQueries(['invoices'])`) provide complete real-time parity without WebSockets or SSE.

---

## 16. Proposed Minimal Backend API Surface

### 1. Fee Collection Periods
- `GET /api/v1/fee-collection-periods` — List periods (`fees.read`)
- `GET /api/v1/fee-collection-periods/:id` — Get single period (`fees.read`)
- `POST /api/v1/fee-collection-periods` — Create period (`fees.create`)
- `PATCH /api/v1/fee-collection-periods/:id` — Update period (`fees.edit`)
- `DELETE /api/v1/fee-collection-periods/:id` — Delete period (`fees.delete`)

### 2. Fee Structures
- `GET /api/v1/fee-structures` — List fee structures (`fees.read`)
- `GET /api/v1/fee-structures/:id` — Get single fee structure (`fees.read`)
- `POST /api/v1/fee-structures` — Create fee structure & batch generate invoices (`fees.create`)
- `PATCH /api/v1/fee-structures/:id` — Update fee structure (`fees.edit`)
- `DELETE /api/v1/fee-structures/:id` — Delete fee structure if 0 invoices (`fees.delete`)

### 3. Invoices & Payments
- `GET /api/v1/invoices` — List paginated invoices with status, period, class, and date filters (`fees.read`)
- `GET /api/v1/invoices/:id` — Get single invoice details (`fees.read` or Linked Parent)
- `POST /api/v1/invoices` — Create individual ad-hoc invoice (`fees.create`)
- `PATCH /api/v1/invoices/:id` — Update unpaid invoice details (`fees.edit`)
- `PATCH /api/v1/invoices/:id/pay` — Record / settle payment (`fees.edit` or Linked Parent)
- `DELETE /api/v1/invoices/:id` — Delete unpaid invoice (`fees.delete`)
- `GET /api/v1/invoices/dashboard-stats` — Financial summary metrics (`fees.read`)
- `GET /api/v1/students/:studentId/invoices` — Student invoice timeline (`fees.read` or Linked Parent)

---

## 17. Risks & Verification Items for Implementation

1. **Orphan Invoices**: SchoolS024 contains 5 historical invoices with `studentId = null` preserved from Firestore migration. The backend list queries must handle nullable `studentId` without crashing when joining `Student`.
2. **Paid Invoice Protection**: The backend must enforce that `status === 'Paid'` invoices cannot be deleted, modified in amount, or re-paid.
3. **Double Payment Serialization**: `SELECT ... FOR UPDATE` row locks must be acquired inside the payment transaction before updating invoice status.

---

## 18. Final Classification

### **READY FOR IMPLEMENTATION**

- All relational database models (`FeeCollectionPeriod`, `FeeStructure`, `Invoice`) are fully established in Prisma schema without requiring migrations.
- Business rules, invoice generation algorithms, payment lifecycles, and RBAC authorization are completely understood and verified.
- Tenant isolation and parent verification paths are aligned with completed domains (Classes, Students, Parents).

---

## 19. HARD STOP

This concludes the Phase 4C.6 Preflight Audit. No code or migrations have been created. Awaiting explicit user approval before proceeding to backend implementation.
