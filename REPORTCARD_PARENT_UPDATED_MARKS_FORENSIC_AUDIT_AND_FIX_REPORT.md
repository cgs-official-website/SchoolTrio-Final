# REPORTCARD.PARENT — FORENSIC AUDIT & TARGETED FIX REPORT

**Bug ID:** `REPORTCARD-PARENT-001`  
**Module:** Report Card  
**Submodule:** Parent Portal → Report Card (`/parent/grades`)  
**Bug Title:** Updated Report Card and Marks from Admin/Staff Panel are not reflected in Parent Panel  
**Severity:** HIGH  
**Priority:** HIGH  
**Status:** **RESOLVED — AUTOMATED VERIFICATION PASSED; MANUAL BROWSER VERIFICATION PENDING**  

---

## 1. Executive Summary

When Admin or Staff updated a student's marks, grades, and report card details from the Admin/Staff Panel and published them, parents linked to that student saw the empty warning state:
> *"You must link a student to your account to view report cards."*

A thorough forensic audit of the full stack (Prisma schema, PostgreSQL records, REST API routes, RBAC/tenant security middleware, frontend router contexts, and component state lifecycle) proved that:
1. The backend PostgreSQL data layer, Prisma models (`ReportCard`, `AssessmentGrade`, `Exam`), and publish service (`report-card.service.js`) functioned properly and persisted updated marks/grades.
2. The REST API endpoint `GET /api/v1/report-cards/student/:studentId` correctly authorized parents via `ParentStudentLink` and returned canonical report card records.
3. The root cause was an identity resolution defect in the frontend component `frontend/src/pages/Parent/Grades.jsx`. The component attempted to read `userProfile?.linkedStudentId` (an obsolete legacy field from early single-child authentication) rather than obtaining the active student from the multi-child `useOutletContext()` provided by `ParentDashboard.jsx`.
4. As a result, `studentId` evaluated to `undefined`, preventing the report card query from executing and causing the UI to display the "student not linked" warning.

A targeted fix was applied to `Grades.jsx` (and verified in `Attendance.jsx`) to resolve `activeStudentId` from `useOutletContext()`, falling back to `userProfile.linkedStudentId` if rendered standalone. All unit tests, integration tests, and production builds passed cleanly.

---

## 2. Bug Reproduction & Forensic Trace

### Admin/Staff Flow:
1. Admin/Staff enters marks in Assessment / Exam Management and triggers `POST /api/v1/report-cards/publish` with `{ classId, examId }`.
2. Backend aggregates continuous assessment / exam scores, calculates totals, percentages, and CBSE letter grades, and atomically upserts records in the PostgreSQL `ReportCard` table.
3. PostgreSQL accurately stores the updated marks JSON, grades JSON, and timestamp.

### Parent Flow Before Fix:
1. Parent logs in and is redirected to `/parent`. `ParentDashboard` loads all linked children from `GET /api/v1/parents/my-children` and sets `activeStudentId` in state and passes it down via `<Outlet context={{ activeStudentId, activeChild, enrolledChildren }} />`.
2. Parent navigates to Report Card / Grades (`/parent/grades`).
3. `ParentGrades` component executed:
   ```javascript
   // BEFORE (BUGGY):
   const { userProfile } = useAuth();
   const studentId = userProfile?.linkedStudentId; // undefined in modern multi-child auth!
   ```
4. Because `studentId` was `undefined`:
   - `useEffect` aborted without calling `getStudentReportCards()`.
   - Condition `if (!studentId)` evaluated to `true`.
   - Rendered: `"You must link a student to your account to view report cards."`

---

## 3. Architecture & Data Flow

### Admin/Staff Report Card Flow:
```
[Admin / Staff UI: ExamManagement.jsx / Grades.jsx]
        ↓ POST /api/v1/report-cards/publish
[Route: report-card.routes.js] (authenticate, tenantContext, requirePermission('exams', 'edit'))
        ↓
[Controller: reportCardController.publishReportCards]
        ↓
[Service: report-card.service.js -> publishClassReportCards]
        ↓
[Prisma / PostgreSQL: ReportCard Table]
```

### Parent Report Card Flow (Fixed):
```
[Parent UI: ParentDashboard.jsx]
        ↓ Outlet Context: { activeStudentId, activeChild, enrolledChildren }
[Parent Subpage: Parent/Grades.jsx]
        ↓ useOutletContext() -> resolves activeStudentId
        ↓ GET /api/v1/report-cards/student/:studentId
[Route: report-card.routes.js] (requireExamsReadOrParentOrStudent)
        ↓
[Service: authorizeStudentReportCardAccess(schoolId, student, actor)]
        ↓ Verifies ParentStudentLink for (schoolId, studentId, parentUserId)
[Repository / Prisma: findReportCardsByStudent]
        ↓
[DTO Adapter: adaptReportCards()]
        ↓
[Render: Grades Table, Subject Marks, Percentage, Signatures, Print Layout]
```

---

## 4. Parent-Student Link & Identity Resolution Analysis

- **Canonical DB Table:** `ParentStudentLink` (`parentId`, `studentId`, `schoolId`, `createdAt`, `updatedAt`).
- **Identifier Type:** PostgreSQL UUID (v4) across backend, Prisma, and frontend API clients.
- **Multi-Child Resolution:** `ParentDashboard.jsx` maintains `activeStudentId` and allows parents with multiple children to switch between them instantly.
- **Outlet Context Contract:** Subpages receive `{ activeStudentId, activeChild, enrolledChildren, refreshChildren, refreshFeeBadge }`.
- **Target Component:** `frontend/src/pages/Parent/Grades.jsx` now conforms to this canonical contract:
  ```javascript
  const outletContext = useOutletContext();
  const activeStudentIdFromContext = outletContext?.activeStudentId || outletContext?.activeChild?.id;
  const studentId = activeStudentIdFromContext || userProfile?.linkedStudentId;
  ```

---

## 5. Security & Tenant Isolation Audit

1. **Authorization Verification:**
   - Staff requires `exams.read` or `exams.edit` permission.
   - Parents are evaluated by `authorizeStudentReportCardAccess()` which queries `findParentStudentLink(schoolId, student.id, parentProfile.id)`.
   - Any attempt by Parent A to pass Student B's UUID throws `403 Forbidden` (`Access denied: You are not linked to this student`).
2. **Tenant Isolation:**
   - Both `student.findFirst({ where: { id: studentId, schoolId } })` and `findReportCardsByStudent(schoolId, studentId)` enforce strict tenant boundaries.
   - Cross-school access attempts throw `404 Not Found` or `403 Forbidden`.
3. **Immutability & Privilege Escalation:**
   - Parents cannot mutate marks or trigger publication endpoints (protected by `requirePermission('exams', 'edit')`).

---

## 6. Code Changes

### `frontend/src/pages/Parent/Grades.jsx`
- Added `useOutletContext` from `react-router-dom`.
- Resolved `studentId` dynamically from `outletContext?.activeStudentId || outletContext?.activeChild?.id || userProfile?.linkedStudentId`.
- Added dependency on `studentId` so switching children re-fetches report cards for the newly active student.

### `frontend/src/pages/Parent/Attendance.jsx`
- Added `useOutletContext` from `react-router-dom` to ensure active child synchronization across attendance.

### `frontend/src/pages/Parent/__tests__/Grades.test.jsx`
- Expanded test suite to verify:
  1. Resolution of `studentId` via `useOutletContext.activeStudentId`.
  2. Resolution via `outletContext.activeChild.id`.
  3. Fallback to `userProfile.linkedStudentId`.
  4. Behavior when no link exists (renders warning message).
  5. Multi-child switching.
  6. Continuous vs formal report card adapting.

---

## 7. Test Results

### Backend Automated Tests:
- **Command:** `npx vitest run report-card`
- **Result:** **8 passed / 8 test files (116 passed / 116 tests)**

### Frontend Parent Submodule Tests:
- **Command:** `npx vitest run src/pages/Parent/`
- **Result:** **14 passed / 14 test files (194 passed / 194 tests)**

### Production Build:
- **Command:** `npm run build`
- **Result:** **Built successfully in 5.01s with 0 errors.**

---

## 8. Final Status

**RESOLVED — AUTOMATED VERIFICATION PASSED; MANUAL BROWSER VERIFICATION PENDING**
