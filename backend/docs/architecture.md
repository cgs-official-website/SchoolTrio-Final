# School Management System SaaS — Backend Architecture Specification

## 1. System Overview & Technology Stack

The School Management System (SMS) SaaS backend provides a multi-tenant REST API engineered for institutional schools.

- **Runtime**: Node.js 24.x (ES Modules)
- **Language**: JavaScript (Strict ES6+)
- **Web Framework**: Express.js 4.x
- **Database ORM**: Prisma Client 6.x
- **Relational Database**: PostgreSQL 16+ (56 tenant-scoped models + 7 global/system models)
- **Cache & Message Broker**: Redis 7+ via `ioredis`
- **Schema Validation**: Zod
- **Structured Logging**: Pino & Pino-HTTP with secret redaction
- **Test Suite**: Vitest & Supertest

---

## 2. Directory Structure

```
backend/
├── prisma/
│   ├── schema.prisma                 # Authoritative 63-model relational schema
│   ├── seed.js                       # Idempotent platform seeds (Plans & Template Roles)
│   ├── migrations/                   # Verified PostgreSQL migration history
│   ├── dry-run/                      # Historical migration dry-run artifacts
│   └── reports/                      # Verification and reconciliation reports
│
├── src/
│   ├── app.js                        # Express application bootstrap & middleware assembly
│   ├── server.js                     # HTTP server lifecycle & graceful shutdown hooks
│   │
│   ├── config/
│   │   ├── env.js                    # Canonical Zod-validated environment configuration
│   │   ├── env.config.js             # Backwards-compatible re-export for migration scripts
│   │   ├── constants.js              # Application roles, error codes, HTTP statuses, regex
│   │   ├── database.config.js        # Prisma database datasource configuration
│   │   ├── redis.config.js           # Redis connection parameters & retry strategy
│   │   └── cloudinary.js             # Cloudinary configuration reader
│   │
│   ├── database/
│   │   ├── prisma.client.js          # Singleton basePrisma, prisma extended client, AsyncLocalStorage
│   │   ├── tenant-extension.js       # 56-model query interceptor enforcing strict multi-tenancy
│   │   └── redis.client.js           # Resilient Redis client with fail-open error handling
│   │
│   ├── middleware/
│   │   ├── auth.middleware.js        # Authentication boundary interface (Phase 4A contract)
│   │   ├── tenant.middleware.js      # Authoritative tenant resolution via req.user.schoolId
│   │   ├── rbac.middleware.js        # requireRole & requirePermission middleware factories
│   │   ├── validate.middleware.js    # Zod schema request validation (body, params, query)
│   │   ├── error.middleware.js       # Centralized error handler with Prisma error translation
│   │   ├── rate-limit.middleware.js  # Redis-backed rate limiter with sliding window & memory fallback
│   │   ├── request-id.middleware.js  # X-Request-Id correlation generator and propagator
│   │   └── cors.middleware.js        # Whitelisted CORS policy enforcement
│   │
│   ├── routes/
│   │   └── index.js                  # Versioned /api/v1 router mounting health & domain routes
│   │
│   ├── services/
│   │   ├── redis-cache.service.js    # Production caching wrapper (get, set, del, wrap) with fail-open
│   │   ├── cloudinary.service.js     # Cloudinary service abstraction & signing helper
│   │   └── realtime.service.js       # In-memory realtime event dispatcher abstraction
│   │
│   ├── utils/
│   │   ├── api-response.js           # Standardized response envelopes (success, paginated)
│   │   ├── app-error.js              # Structured AppError class hierarchy
│   │   ├── pagination.js             # Pagination parser with bounds (limit 20, max 100) & metadata
│   │   ├── logger.js                 # Pino structured logger with secret redaction
│   │   └── validators.js             # Reusable Zod schemas (UUID, email, phone, date, pagination)
│   │
│   └── jobs/
│       └── attendance-cutoff.job.js  # Attendance cutoff job interface stub (Inactive in Phase 4A)
│
├── tests/
│   ├── unit/                         # Utility and service isolation unit tests
│   ├── integration/                  # Express bootstrap, routing, validation, health probes
│   └── security/                     # Tenant isolation, anti-spoofing, RBAC, error redaction
│
└── docs/
    ├── architecture.md               # This architectural specification
    └── phase-4a-foundation-report.md # Formal Phase 4A completion report
```

---

## 3. Request Lifecycle

Every incoming HTTP request executes through a deterministic, secure middleware chain:

```
Incoming Request
      ↓
[1. Request ID Middleware]             → Assigns/preserves X-Request-Id; attaches to req.id
      ↓
[2. Security Headers (Helmet)]        → Enforces CSP, X-Frame-Options, HSTS, Sniff protection
      ↓
[3. CORS Policy Middleware]           → Validates origin against environment whitelist
      ↓
[4. Pino HTTP Logging]                → Structured request logging (suppresses noisy probes)
      ↓
[5. Body / URL Parsers]               → Parses JSON (limit 10MB) & urlencoded bodies
      ↓
[6. Rate Limiting Middleware]         → Redis/Memory sliding window limiter (fails open)
      ↓
[7. Authentication Boundary]          → Verifies JWT Bearer tokens; sets req.user (Phase 4B)
      ↓
[8. Tenant Isolation Middleware]      → Extracts authoritative req.user.schoolId into AsyncLocalStorage
      ↓
[9. RBAC Middleware]                  → Evaluates requireRole / requirePermission (Phase 4C)
      ↓
[10. Request Validation (Zod)]        → Validates and coerces body, params, query schemas
      ↓
[11. Route Controller & Services]     → Executes domain business logic within tenant context
      ↓
[12. Prisma Tenant-Extended Client]   → Enforces WHERE schoolId = context.schoolId on all 56 models
      ↓
[13. Standard API Response]           → Formats response via ApiResponse.success / paginated
      ↓
[14. Centralized Error Handler]       → Intercepts errors, maps Prisma codes, redacts in prod
```

---

## 4. Multi-Tenant Isolation Strategy

### A. Authoritative Source of Identity
- The user's authenticated tenant identity (`req.user.schoolId`) is the **sole authoritative boundary**.
- Client-supplied `req.body.schoolId`, `req.query.schoolId`, or `req.params.schoolId` are **never trusted** for authorization.
- Any conflicting `schoolId` parameter provided by a client is immediately rejected with HTTP 403 `TenantAccessError`.

### B. Execution Context Propagation
- Node.js `AsyncLocalStorage` (`tenantStorage`) propagates the active tenant context (`{ schoolId, userId, role, bypassTenant }`) across asynchronous call stacks.
- `runWithTenantContext(context, callback)` guarantees thread-safe, isolated execution without polluting global state.

### C. Prisma Query Extension Interceptor
- All database operations on the 56 tenant-scoped models pass through `tenant-extension.js`.
- Queries (`findMany`, `findFirst`, `count`, `aggregate`, `groupBy`) automatically inject `{ schoolId: activeSchoolId }` into criteria.
- Single-record mutations (`findUnique`, `update`, `delete`, `upsert`) rewrite simple ID criteria into compound `{ schoolId_id: { schoolId, id } }` criteria and prevent reassigning `schoolId`.
- Mutations without an active tenant context are strictly blocked unless `bypassTenant: true` is explicitly set (e.g. system seeds or migrations).

### D. Model Classification (63 Models)
- **Platform Global Models (7)**: `School`, `SubscriptionPlan`, `User`, `RefreshSession`, `MigrationIdMap`, `AuditLog`, `RolePermission`.
- **Tenant-Scoped Domain Models (56)**: All remaining models contain `schoolId String @map("school_id") @db.Uuid`.

---

## 5. Error Handling & Response Contracts

### A. Success Envelope
```json
{
  "success": true,
  "data": { ... }
}
```

### B. Paginated Envelope
```json
{
  "success": true,
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

### C. Error Envelope
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error description",
    "details": null,
    "requestId": "c1f7a834-8c19-4f3e-bc5d-3d4455667788",
    "timestamp": "2026-09-09T10:30:00.000Z"
  }
}
```

### D. Prisma Database Error Mapping
| Prisma Code | Condition | HTTP Status | App Error Code | Safe Message |
|---|---|---|---|---|
| `P2002` | Unique constraint violation | 409 Conflict | `CONFLICT` | "A record with this field already exists" |
| `P2025` | Record not found | 404 Not Found | `NOT_FOUND` | "Requested record was not found" |
| `P2003` | Foreign key constraint failure | 409 Conflict | `RELATIONSHIP_CONFLICT` | "Invalid reference: referenced entity does not exist or has dependent records" |
| `P2000` | Column length/range overflow | 400 Bad Request | `VALIDATION_ERROR` | "Input value exceeds allowable column length or range" |
| Unhandled | Internal database error | 500 Server Error | `INTERNAL_SERVER_ERROR` | "An unexpected internal server error occurred" (Redacted in Prod) |

---

## 6. Migration Runtime Isolation

To protect existing migrated tenant data (SchoolS024, SchoolS015, SchoolS019), the application runtime is completely decoupled from migration infrastructure:

1. **Zero Runtime Imports**: `src/app.js`, `src/server.js`, and `src/routes/` do not import any modules from `src/migration/`.
2. **Zero Startup Hooks**: `npm start` and `npm run dev` invoke `src/server.js` directly without executing preflight migration checks, candidate discovery, or Firestore scans.
3. **Read-Only Tenant Fixtures**: Existing PostgreSQL tenant records are treated as immutable integration fixtures.
