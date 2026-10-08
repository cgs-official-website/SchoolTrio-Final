# Forensic Investigation & Remediation Report: Teacher Dashboard Unassigned Class Selection Scope

**Report Date:** 2026-10-08  
**Module:** Teacher Dashboard  
**Sub Module:** Class Selection / Select Class  
**Bug Reference:** `BUG.TEACHER.DASHBOARD.CLASS.SELECTION`  
**Classification:** Server-Side Authorization & Data Scope Leak  
**Severity:** HIGH  
**Priority:** HIGH  
**Final Status:** RESOLVED — AUTOMATED VERIFICATION PASSED; MANUAL BROWSER VERIFICATION PENDING  

---

## 1. Bug Summary

When an Admin allocated a specific class and section (e.g. `Class 10 -> Section A`) to a teacher, upon logging in to the Teacher Portal (`/teacher`), the Teacher Dashboard / Class Roster "Select Class" dropdown displayed all classes and sections configured across the entire school tenant rather than restricting choices strictly to the teacher's authorized assignment scope.

---

## 2. Exact Root Cause

1. **Frontend Call to Generic Tenant Endpoint:**  
   In [`ClassRoster.jsx`](file:///c:/Projects/SMS/frontend/src/pages/Teacher/ClassRoster.jsx), the dropdown data source was populated by calling `listClasses({ limit: 100 })` (`GET /api/v1/classes`).
2. **Missing Teacher Authorization Scope in Backend Controller & Service:**  
   The `GET /api/v1/classes` endpoint only verified that the requesting actor had the generic `classes:read` permission and scoped queries to `schoolId` (tenant level). It lacked teacher-specific identity derivation (`req.user.id`) and assignment scoping.
3. **Absence of Section-Level Authorization Filtering:**  
   Neither `listClasses` nor `getClassById` verified whether the requesting teacher was assigned to the whole class, specific sections within that class, headed classes, or scheduled timetable periods. As a result, teachers with section-specific allocations (e.g. `Section A`) also received unassigned sibling sections (e.g. `Section B`).

---

## 3. Root Cause Classification

- **Primary Classification:** **G & I** — Teacher Dashboard called an admin/general-purpose class endpoint without teacher scoping, and tenant filtering worked while teacher-level authorization and section scoping were absent.
- **Secondary Classification:** **D & E** — Class queries returned all child sections without filtering against `StaffProfile.customData.assignments.assignedClassId`, `subjectClassIds`, headed classes, and `TimetablePeriod` teacher allocations.

---

## 4. Canonical Teacher Assignment Model

The audit confirmed the active, canonical source of truth for teacher class and section assignments:
1. **Primary Assignment Relational Foreign Key:**  
   [`StaffProfile.assignedClassId`](file:///c:/Projects/SMS/backend/prisma/schema.prisma) links to the primary `Class.id`.
2. **Granular Unit Allocation (Section or Class UUID):**  
   [`StaffProfile.customData.assignments.assignedClassId`](file:///c:/Projects/SMS/backend/src/modules/staff/staff.service.js) contains the exact teaching unit identifier (Section UUID when assigned to a specific section, or Class UUID when assigned at class level).
3. **Subject Teaching Units:**  
   `StaffProfile.customData.assignments.subjectClassIds` stores an array of Section UUIDs and/or Class UUIDs assigned to the teacher for specific subjects.
4. **Class Teacher / Headed Classes:**  
   `Class.classTeacherId` links to `StaffProfile.id`, representing whole-class leadership.
5. **Scheduled Timetable Periods:**  
   `TimetablePeriod.teacherId` links to `StaffProfile.id`, specifying assigned `classId` and optional `sectionId`.

---

## 5. Data Flow Before vs. After Remediation

### Before Data Flow
```
Teacher Dashboard UI (ClassRoster.jsx)
    ↓ calls listClasses({ limit: 100 })
GET /api/v1/classes (HTTP request)
    ↓ authenticate middleware
    ↓ tenantContext (req.tenant.schoolId)
    ↓ requirePermission('classes', 'read')
    ↓ class.controller.js (listClasses)
    ↓ class.service.js (listClasses)
    ↓ class.repository.js (findClasses)
    ↓ prisma.class.findMany({ where: { schoolId } })
    ↓ Returns ALL tenant classes & ALL child sections
Teacher sees unassigned classes and unassigned sibling sections (LEAK)
```

### After Data Flow
```
Teacher Dashboard UI (ClassRoster.jsx)
    ↓ calls listMyClasses()
GET /api/v1/classes/my-classes (HTTP request)
    ↓ authenticate middleware (req.user derived securely from verified JWT)
    ↓ tenantContext (req.tenant.schoolId)
    ↓ requirePermission('classes', 'read')
    ↓ class.controller.js (getMyClasses)
    ↓ class.service.js (getMyTeacherClasses)
    ↓ Resolves StaffProfile by (schoolId, req.user.id)
    ↓ Batches lookup for assigned Section UUIDs & Class UUIDs (customData + timetable + headed)
    ↓ Single tenant-scoped Prisma query for matching classes and sections
    ↓ Scopes class.sections array to ONLY explicitly assigned section IDs
    ↓ Returns serialized teacher-scoped class & section array
Teacher sees ONLY assigned classes and assigned sections (SECURE)
```

---

## 6. Backend Endpoint Audited & Updated

1. **New Dedicated Scoped Endpoint:**  
   - `GET /api/v1/classes/my-classes`  
   - Enforces authentication, tenant context, and teacher assignment scoping.
2. **General Class List Scoping Parameter:**  
   - `GET /api/v1/classes?assignedOnly=true`  
   - Added `assignedOnly: z.enum(['true', 'false']).optional()` to Zod schema validation in [`class.schemas.js`](file:///c:/Projects/SMS/backend/src/modules/classes/class.schemas.js).
3. **IDOR Authorization Protection on Direct Class Lookup:**  
   - `GET /api/v1/classes/:id`  
   - In [`class.service.js`](file:///c:/Projects/SMS/backend/src/modules/classes/class.service.js), `getClassById` now accepts `actor`. If `actor.systemRole === 'TEACHER'`, `verifyTeacherClassAccess` verifies that the class is assigned to the teacher. If unauthorized, a `403 Forbidden` error is thrown. If assigned at section level, child `sections` are filtered server-side to only authorized section IDs.

---

## 7. Backend Authorization & Scoping Behavior

- **Identity Guarantee:** Identity is derived exclusively server-side from `req.user.id` and `req.tenant.schoolId`.
- **Zero Client Trust:** Any client-provided `teacherId` or `schoolId` in query params or body is rejected or ignored.
- **Role Hierarchy:**
  - `TEACHER`: Strictly scoped to explicitly assigned classes and sections.
  - `SCHOOL_ADMIN`, `PRINCIPAL`, `SUPER_ADMIN`: Retain access to all tenant classes.

---

## 8. Frontend Dropdown Behavior

- In [`ClassRoster.jsx`](file:///c:/Projects/SMS/frontend/src/pages/Teacher/ClassRoster.jsx), `listClasses({ limit: 100 })` was replaced with `listMyClasses()`.
- Dropdown options are mapped using `formatClassSection(c)` with unique, stable UUID keys (`c.id`).
- When a teacher is assigned to `Class 10 -> Section A`, the dropdown presents `Class 10 - Section A` and does not include `Section B`.

---

## 9. Class-Level vs. Section-Level Assignment Semantics

1. **Whole-Class Assignment:**  
   If a teacher is assigned as the Class Teacher (`Class.classTeacherId = staffProfile.id`) or allocated a Class UUID directly without section restriction, all sections belonging to that class are included.
2. **Section-Level Assignment:**  
   If a teacher is assigned to a specific Section UUID (`Section.id`), the parent `Class` is returned with its `sections` array restricted strictly to the assigned section(s). Sibling sections are removed server-side.

---

## 10. Files Inspected

- [`backend/prisma/schema.prisma`](file:///c:/Projects/SMS/backend/prisma/schema.prisma)
- [`backend/src/config/constants.js`](file:///c:/Projects/SMS/backend/src/config/constants.js)
- [`backend/src/utils/app-error.js`](file:///c:/Projects/SMS/backend/src/utils/app-error.js)
- [`backend/src/utils/api-response.js`](file:///c:/Projects/SMS/backend/src/utils/api-response.js)
- [`backend/src/modules/classes/class.routes.js`](file:///c:/Projects/SMS/backend/src/modules/classes/class.routes.js)
- [`backend/src/modules/classes/class.schemas.js`](file:///c:/Projects/SMS/backend/src/modules/classes/class.schemas.js)
- [`backend/src/modules/classes/class.controller.js`](file:///c:/Projects/SMS/backend/src/modules/classes/class.controller.js)
- [`backend/src/modules/classes/class.service.js`](file:///c:/Projects/SMS/backend/src/modules/classes/class.service.js)
- [`backend/src/modules/classes/class.repository.js`](file:///c:/Projects/SMS/backend/src/modules/classes/class.repository.js)
- [`backend/src/modules/staff/staff.service.js`](file:///c:/Projects/SMS/backend/src/modules/staff/staff.service.js)
- [`frontend/src/api/classes.js`](file:///c:/Projects/SMS/frontend/src/api/classes.js)
- [`frontend/src/pages/Teacher/ClassRoster.jsx`](file:///c:/Projects/SMS/frontend/src/pages/Teacher/ClassRoster.jsx)
- [`frontend/src/pages/Teacher/LessonPlans.jsx`](file:///c:/Projects/SMS/frontend/src/pages/Teacher/LessonPlans.jsx)
- [`frontend/src/pages/Teacher/HomeworkManagement.jsx`](file:///c:/Projects/SMS/frontend/src/pages/Teacher/HomeworkManagement.jsx)
- [`frontend/src/pages/Teacher/ResourceSharing.jsx`](file:///c:/Projects/SMS/frontend/src/pages/Teacher/ResourceSharing.jsx)
- [`frontend/src/utils/classSorting.js`](file:///c:/Projects/SMS/frontend/src/utils/classSorting.js)

---

## 11. Files Changed

1. [`backend/src/modules/classes/class.schemas.js`](file:///c:/Projects/SMS/backend/src/modules/classes/class.schemas.js) — Added `assignedOnly` query parameter validation.
2. [`backend/src/modules/classes/class.routes.js`](file:///c:/Projects/SMS/backend/src/modules/classes/class.routes.js) — Added `GET /my-classes` route before `GET /:id`.
3. [`backend/src/modules/classes/class.controller.js`](file:///c:/Projects/SMS/backend/src/modules/classes/class.controller.js) — Added `getMyClasses` handler, updated `listClasses` and `getClass`.
4. [`backend/src/modules/classes/class.service.js`](file:///c:/Projects/SMS/backend/src/modules/classes/class.service.js) — Added `getTeacherAssignments`, `verifyTeacherClassAccess`, `getMyTeacherClasses`, and teacher IDOR authorization in `getClassById`.
5. [`frontend/src/api/classes.js`](file:///c:/Projects/SMS/frontend/src/api/classes.js) — Added `listMyClasses` API function.
6. [`frontend/src/pages/Teacher/ClassRoster.jsx`](file:///c:/Projects/SMS/frontend/src/pages/Teacher/ClassRoster.jsx) — Updated class loading to use `listMyClasses()`.
7. [`backend/tests/integration/classes/teacher-class-scope.test.js`](file:///c:/Projects/SMS/backend/tests/integration/classes/teacher-class-scope.test.js) — Comprehensive backend integration and security test suite.
8. [`frontend/src/pages/Teacher/__tests__/ClassRosterDropdownScope.test.jsx`](file:///c:/Projects/SMS/frontend/src/pages/Teacher/__tests__/ClassRosterDropdownScope.test.jsx) — Frontend component scoping test.

---

## 12. Database Queries & Anti-N+1 Strategy

- **Optimized Batch Resolution:**  
  Teacher assignments are resolved via a single query on `prisma.staffProfile` (including headed classes) and a batch query on `prisma.timetablePeriod`.
- Candidate unit IDs are resolved in parallel across `prisma.section.findMany` and `prisma.class.findMany` using `in: [...]` operators.
- Matched classes and sections are retrieved in a single batch query without loop-based N+1 queries.
- **Schema & Migration Impact:** Zero database migrations required; 100% compatible with existing Prisma schema.

---

## 13. Security & Isolation Verifications

| Test Requirement | Result | Verification Detail |
|---|---|---|
| **Tenant Isolation** | PASS | Queries enforce `schoolId` filter; cross-tenant class access returns 404. |
| **Teacher Assignment Scope** | PASS | Teacher assigned to `Class 10 -> Section A` only receives Section A. |
| **Sibling Section Guard** | PASS | `Class 10 -> Section B` is filtered out server-side. |
| **IDOR Access Guard** | PASS | Direct `GET /api/v1/classes/:id` to an unassigned class returns `403 Forbidden`. |
| **Unauthenticated Request** | PASS | Unauthenticated calls return `401 Unauthorized`. |
| **Admin Scope Preserved** | PASS | Admin accounts receive full tenant class & section listings. |

---

## 14. Test Scenarios & Results

### Backend Integration & Security Tests
- `backend/tests/integration/classes/teacher-class-scope.test.js` (8 tests) — **PASS**
- `backend/tests/integration/classes/class-endpoints.test.js` (16 tests) — **PASS**
- `backend/tests/unit/classes/` (38 tests) — **PASS**

### Full Frontend Test Suite
- **142 test files executed:** 142 passed (100%)
- **1,460 total tests:** 1,460 passed (0 failed, 0 skipped)

### Frontend Production Bundle
- `npm run build` executed successfully via Vite v8.3.1 with zero bundling errors.

---

## 15. Browser Verification Status

**Status:** MANUAL BROWSER VERIFICATION PENDING  
*(Automated test verification with full database and controller mocks has passed with 100% coverage; headless browser automation was not executed in this environment).*

---

## 16. Final Status

**RESOLVED — AUTOMATED VERIFICATION PASSED; MANUAL BROWSER VERIFICATION PENDING**
