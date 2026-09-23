# SCHOOL S024 ORPHAN INVOICE SCHEMA FIX

## Previous Constraint

studentId:
NOT NULL

## New Constraint

studentId:
NULLABLE

## Previous Delete Behavior

ON DELETE RESTRICT

## New Delete Behavior

ON DELETE SET NULL

## Tenant Isolation

Preserved

Composite foreign key `(school_id, student_id)` referencing `students(school_id, id)` remains strictly enforced.
`school_id` remains `NOT NULL` in the `invoices` table.
An orphan invoice with `student_id = NULL` remains strictly partitioned and bound to `SchoolS024` via its mandatory `school_id` foreign key.

## Migration SQL Review

PASS

### Generated and Reviewed Migration SQL
```sql
-- DropForeignKey
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_school_id_student_id_fkey";

-- AlterTable
ALTER TABLE "invoices" ALTER COLUMN "student_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_school_id_student_id_fkey" FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id") ON DELETE SET NULL ON UPDATE CASCADE;
```

Verification against safety rules:
- `DROP TABLE`: None
- `DROP DATABASE`: None
- `TRUNCATE`: None
- `DELETE`: None
- Unrelated `ALTER`: None
- Unrelated tables modified: None

## Database Migration

PASS

- Target Environment: Railway PostgreSQL Dev Database (`mainline.proxy.rlwy.net:33442/railway`)
- PostgreSQL Version: `PostgreSQL 18.6 (Debian 18.6-1.pgdg13+2)`
- Migration Tool: `npx prisma migrate deploy`
- Migration Identifier: `20260908183000_make_invoice_student_id_nullable`
- Applied Status: SUCCESS (recorded in `_prisma_migrations`)

## Data Rows Modified

0

- Pre-migration Invoice Count: 0
- Post-migration Invoice Count: 0
- Pre-migration Student Count: 0
- Post-migration Student Count: 0
- Existing rows updated or deleted: 0

## Firestore Writes

0

- Read-only Firestore inspection during preflight.
- Zero document creates, updates, or deletes.

## Firebase Auth Writes

0

- Zero user creates, updates, or deletes.

## Tests

59/59 PASS

Executed: `npm test` (`vitest run`)
- `tests/env.test.js` (4 tests) - PASS
- `tests/migration-dry-run.test.js` (15 tests) - PASS
- `tests/school-s024-recovery.test.js` (11 tests) - PASS
- `tests/tenant-isolation.test.js` (12 tests) - PASS
- `tests/schema.test.js` (7 tests) - PASS
- `tests/error.test.js` (4 tests) - PASS
- `tests/health.test.js` (6 tests) - PASS

Total: 59 passed across 7 test files.

## Lint

PASS

Executed: `npm run lint` (`eslint .`)
- Errors: 0
- Warnings: 0

## Prisma Validation

PASS

Executed: `npx prisma validate`
- Schema syntax: VALID
- Prisma Client regenerated: `npx prisma generate` (v6.19.3)
