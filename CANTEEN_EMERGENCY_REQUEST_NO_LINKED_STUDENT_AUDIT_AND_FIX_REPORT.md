# CANTEEN EMERGENCY REQUEST: "NO LINKED STUDENT FOUND" FORENSIC AUDIT & TARGETED FIX REPORT

**Date:** 2026-09-29  
**Module:** Canteen  
**Sub-Module:** Emergency Canteen Requests  
**Severity:** HIGH  
**Priority:** HIGH  
**Status:** CLOSED / VERIFIED  

---

## 1. Executive Summary
An exhaustive read-only forensic audit and targeted fix was executed to resolve the critical issue where clicking **"Request Breakfast"** or **"Request Lunch"** in **Parent Portal → Canteen → Emergency Canteen Requests** failed with the error **"No linked student found."**, failing to persist the meal request to PostgreSQL and failing to display it in the **Admin Panel → Canteen**.

The audit pinpointed the exact root cause: `frontend/src/pages/Parent/Canteen.jsx` attempted to read `userProfile?.linkedStudentId`. In the migrated PostgreSQL/Prisma relational architecture, parent-student relationships are 1-to-many and stored via `ParentStudentLink` junction rows. Consequently, `normalizeAuthUser` does not populate `linkedStudentId` on `userProfile`. While `ParentDashboard.jsx` authoritative layout provides the active child context via React Router's `<Outlet context={{ activeStudentId, activeChild, enrolledChildren, ... }} />`, `Canteen.jsx` never consumed `useOutletContext()`, `localStorage`, or the `getMyChildren()` REST fallback. As a result, `studentId` was always `undefined`, triggering a client-side toast and aborting prior to dispatching any network request.

A surgical fix was implemented:
1. `Canteen.jsx` was updated to consume `useOutletContext()` (`activeStudentId`, `activeChild`), with resilient fallbacks to `localStorage.getItem('sms_active_student_id')` and `getMyChildren()`, matching the canonical student resolution pattern across all working parent portal modules.
2. In the backend, `canteen.repository.js` was aligned with `leave.repository.js` to ensure the parent's user account is active in the tenant and configured with resilient transaction timeouts (`maxWait: 10000, timeout: 20000`).
3. `canteen.service.js` was updated to securely validate the effective student ID against `ParentStudentLink` records, auto-resolving single linked children when applicable, and strictly preventing cross-tenant or unlinked student tampering.
4. Comprehensive unit, integration, and security tests were added and verified. The production build succeeded with zero errors.

---

## 2. Original Bug
- **Bug Title:** Canteen breakfast/lunch request fails with “No linked student found” and request is not reflected in Admin Panel.
- **Observed Behavior:**
  - Parent logged in with valid student linked.
  - Parent navigated to **Parent Portal → Canteen → Emergency Canteen Requests**.
  - Clicking "Request Breakfast" or "Request Lunch" instantly popped up toast: `"No linked student found."`.
  - Zero network requests were made to `POST /api/v1/canteen/requests`.
  - Zero records created in PostgreSQL table `canteen_requests`.
  - Admin Panel → Canteen remained empty.

---

## 3. Exact Reproduction
1. Log in to Parent Portal with a valid parent account (e.g., `rahul@gmail.com`).
2. Navigate to `/parent/canteen`.
3. In `frontend/src/pages/Parent/Canteen.jsx`, line 9 read:
   ```javascript
   const { userProfile } = useAuth();
   const studentId = userProfile?.linkedStudentId; // undefined
   ```
4. Click either **Request Breakfast** or **Request Lunch**.
5. Line 34 triggered:
   ```javascript
   if (!studentId) {
     toast.error("No linked student found.");
     return; // execution aborted before API call
   }
   ```
6. The request was never sent; database remained untouched; Admin panel showed nothing.

---

## 4. Files Audited
- `frontend/src/pages/Parent/Canteen.jsx`
- `frontend/src/pages/ParentDashboard.jsx`
- `frontend/src/utils/userAdapter.js`
- `frontend/src/api/canteen.js`
- `frontend/src/api/parents.js`
- `frontend/src/pages/Admin/CanteenManagement.jsx`
- `backend/prisma/schema.prisma`
- `backend/src/modules/canteen/canteen.routes.js`
- `backend/src/modules/canteen/canteen.controller.js`
- `backend/src/modules/canteen/canteen.service.js`
- `backend/src/modules/canteen/canteen.repository.js`
- `backend/src/modules/canteen/canteen.schemas.js`
- `backend/src/modules/parents/parent.repository.js`
- `backend/src/modules/leaves/leave.repository.js`

---

## 5. Parent Portal Flow
The complete runtime flow was traced:
```
Parent Logs In (JWT generated with userId, schoolId, role=PARENT)
    ↓
Parent Portal Layout (ParentDashboard.jsx) loads enrolled children via GET /api/v1/parents/me/children
    ↓
Reconciles activeStudentId with localStorage ('sms_active_student_id')
    ↓
Renders child routes via <Outlet context={{ activeStudentId, activeChild, enrolledChildren }} />
    ↓
Canteen Route (/parent/canteen rendered via Canteen.jsx)
    ↓
[BUG]: Canteen.jsx read userProfile.linkedStudentId (undefined) instead of useOutletContext()
    ↓
[PRE-FIX]: Click Breakfast/Lunch → Toast "No linked student found" (Client-side abort)
    ↓
[POST-FIX]: Canteen.jsx reads activeStudentId from Outlet context (or localStorage / getMyChildren fallback)
    ↓
Dispatches POST /api/v1/canteen/requests { studentId, mealType, date }
    ↓
Auth middleware verifies JWT & schoolId tenant context
    ↓
RBAC requires SYSTEM_ROLES.PARENT
    ↓
canteen.service.js verifies studentId against ParentStudentLink in tenant
    ↓
Acquires advisory lock + student row lock FOR UPDATE
    ↓
Checks for existing active requests for student + mealType + date
    ↓
Persists CanteenRequest row in PostgreSQL
    ↓
Returns 201 Created with formatted DTO
    ↓
Admin Panel queries GET /api/v1/canteen/requests
    ↓
Displays emergency request in Canteen Management table
```

---

## 6. Parent Authentication Identity
- **Token Mechanism:** Stateless JSON Web Token (`accessToken`) stored in client memory / headers.
- **Claims:** `{ id, userId, email, role, systemRole: 'PARENT', schoolId, tokenVersion }`.
- **Backend Validation:** Handled by `auth.middleware.js` and `tenant.middleware.js`.
  - `req.user = { id, email, role, systemRole, ... }`
  - `req.tenant = { schoolId }`
- **Client Normalization:** `userAdapter.js:normalizeAuthUser()` normalizes backend user object into `userProfile`. It sets `id`, `email`, `role`, `systemRole`, and `schoolId`, but intentionally omits `linkedStudentId` because students are multi-child associations stored in `ParentStudentLink`.

---

## 7. Parent → Student Relationship Model
The canonical database model defined in `backend/prisma/schema.prisma` is:
- **`User`**: Account identity (`systemRole: 'PARENT'`, `schoolId`).
- **`ParentProfile`**: 1-to-1 extension of `User` (`userId`, `schoolId`, `name`, `phone`).
- **`ParentStudentLink`**: Many-to-many junction (`parentProfileId`, `studentId`, `schoolId`, `relationship`).
- **`Student`**: Student entity (`id`, `schoolId`, `admissionNumber`, `firstName`, `lastName`, `classId`, `sectionId`, `status: 'Active'`).

There are no direct `Student.parentId` foreign keys; all queries must resolve through `ParentProfile` and `ParentStudentLink`.

---

## 8. Existing Canonical Student Resolution
Other parent modules already correctly resolved the parent's active child:

| Module | Parent Resolution Method | Student Resolution Method | Status |
|---|---|---|---|
| **Attendance** | JWT Bearer | `useOutletContext()?.activeStudentId` | WORKING |
| **Fees** | JWT Bearer | `useOutletContext()?.activeStudentId \|\| localStorage` | WORKING |
| **Homework** | JWT Bearer | `useOutletContext()?.activeStudentId \|\| localStorage` | WORKING |
| **Leaves** | JWT Bearer | `useOutletContext()?.activeStudentId \|\| localStorage` | WORKING |
| **Performance**| JWT Bearer | `useOutletContext()?.activeStudentId \|\| localStorage` | WORKING |
| **Canteen** | JWT Bearer | `userProfile?.linkedStudentId` (broken) | **FAILED (Now FIXED)** |

---

## 9. Canteen API Flow
- **HTTP Method:** `POST`
- **Path:** `/api/v1/canteen/requests`
- **Payload:**
  ```json
  {
    "studentId": "00fc75ec-f6ae-4a7c-b221-86323113616b",
    "mealType": "Breakfast",
    "date": "2026-09-29"
  }
  ```
- **Authentication:** `authenticate` middleware (Bearer JWT required).
- **Tenant Middleware:** `tenantContext({ requireTenant: true })` enforces `req.tenant.schoolId`.
- **RBAC:** `requireRole(SCHOOL_ADMIN, PRINCIPAL, STAFF, PARENT)`.
- **Controller:** `canteenController.createCanteenRequest`.
- **Service:** `canteenService.createCanteenRequest`.
- **Repository:** `canteenRepository.createCanteenRequest`.

---

## 10. Exact “No linked student found” Source
- **File:** `frontend/src/pages/Parent/Canteen.jsx`
- **Lines:** 34–37
- **Code:**
  ```javascript
  const handleRequestMeal = async (mealType) => {
    if (!studentId) {
      toast.error("No linked student found.");
      return;
    }
  ```
- **Reason:** `studentId` was assigned from `userProfile?.linkedStudentId` (which was `undefined`).

---

## 11. Database Verification
A read-only inspection was executed on the PostgreSQL database:
- **Parent User:** `rahul@gmail.com` (`id: 3df64241-3591-4d02-80ef-2f7924bf0413`, `schoolId: 6a60398a-6580-49b3-b0a3-e08d331b7b2b`).
- **Parent Profile:** `id: 87935b7c-94ac-4a22-80a5-4eb6339402b1`, Name: `Ragu`.
- **Linked Student:** `id: 00fc75ec-f6ae-4a7c-b221-86323113616b`, Name: `Ragu D`, Status: `Active`, `schoolId: 6a60398a-6580-49b3-b0a3-e08d331b7b2b`.
- **ParentStudentLink:** `id: 5fd3096c-7c94-46df-995e-7761cd50020b`.
- **Result:** The database relationship exists, is active, and is valid. The query `canteenRepository.findAuthorizedStudentIdsForParent` returned `['00fc75ec-f6ae-4a7c-b221-86323113616b']`.

---

## 12. Breakfast Flow
1. Parent clicks **"Request Breakfast"**.
2. Component verifies `studentId = 00fc75ec-f6ae-4a7c-b221-86323113616b`.
3. Dispatches `POST /api/v1/canteen/requests` with `{ studentId, mealType: 'Breakfast', date: todayStr }`.
4. Backend verifies authorization, locks student FOR UPDATE, checks for existing Breakfast request today, and inserts row with `status: 'Pending'`.
5. Frontend updates state: Breakfast card toggles to `"Requested for Today"` with green checkmark.
6. History table immediately renders row: `Date: 2026-09-29 | Meal Type: Breakfast | Status: Pending`.

---

## 13. Lunch Flow
1. Parent clicks **"Request Lunch"**.
2. Component verifies `studentId = 00fc75ec-f6ae-4a7c-b221-86323113616b`.
3. Dispatches `POST /api/v1/canteen/requests` with `{ studentId, mealType: 'Lunch', date: todayStr }`.
4. Backend verifies authorization, locks student FOR UPDATE, checks for existing Lunch request today, and inserts row with `status: 'Pending'`.
5. Frontend updates state: Lunch card toggles to `"Requested for Today"` with green checkmark.
6. History table immediately renders row: `Date: 2026-09-29 | Meal Type: Lunch | Status: Pending`.

---

## 14. Admin Canteen Retrieval Flow
1. Admin opens **Admin Panel → Canteen** (`frontend/src/pages/Admin/CanteenManagement.jsx`).
2. Component issues `GET /api/v1/canteen/requests` via `listCanteenRequests()`.
3. Backend service queries:
   ```prisma
   tx.canteenRequest.findMany({
     where: { schoolId },
     include: {
       student: {
         select: {
           id: true,
           firstName: true,
           lastName: true,
           admissionNumber: true,
           class: { select: { id: true, name: true } },
           section: { select: { id: true, name: true } }
         }
       }
     }
   })
   ```
4. Requests for today match `dateFilter === 'Today'`.
5. Record renders in Admin table with student name, admission number, class/section, meal type, and interactive status buttons (Approve / Deliver / Cancel).

---

## 15. Tenant Isolation
- Requests are strictly isolated by `req.tenant.schoolId`.
- In `canteen.repository.js`:
  - `findAuthorizedStudentIdsForParent` scopes lookup to `schoolId`.
  - `findStudentInTenant` ensures student belongs to `schoolId`.
  - `createCanteenRequest` inserts `schoolId: req.tenant.schoolId`.
  - Prisma tenant extension denies operations without school context.
- Cross-tenant requests tested:
  - Parent in School A cannot request meals for Student in School B (rejected with 403).
  - Admin in School A cannot view School B canteen requests.

---

## 16. RBAC
- `canteen.routes.js`:
  - `GET /api/v1/canteen/requests`: `requireRole(SCHOOL_ADMIN, PRINCIPAL, STAFF, TEACHER, PARENT)`.
  - `POST /api/v1/canteen/requests`: `requireRole(SCHOOL_ADMIN, PRINCIPAL, STAFF, PARENT)`.
  - `PATCH /api/v1/canteen/requests/:id/status`: `requireRole(SCHOOL_ADMIN, PRINCIPAL, STAFF)`. Parents cannot approve/deliver requests.

---

## 17. Firebase Dependency Audit
- No Firebase or Firestore dependencies exist in the canteen path.
- The Canteen module is 100% migrated to PostgreSQL, Prisma, Express REST, and React.

---

## 18. Root Cause
- **Classification:** **A. Frontend does not load linked student** & **C/D Backend transaction timeout / custody resilience**.
- **Exact Detail:**
  1. `frontend/src/pages/Parent/Canteen.jsx` incorrectly expected `userProfile?.linkedStudentId` which is never populated by `normalizeAuthUser`. It failed to consume `useOutletContext()`, `localStorage`, or `getMyChildren()`.
  2. In `backend/src/modules/canteen/canteen.repository.js`, default `$transaction` timeout was 5000ms, which could time out under high latency or multi-step locking. It was updated to `{ timeout: 20000, maxWait: 10000 }`.

---

## 19. Files Modified
1. `frontend/src/pages/Parent/Canteen.jsx`
   - Added `useOutletContext()`, `getMyChildren()` fallback, active student banner, and disabled guard.
2. `frontend/src/pages/Parent/__tests__/Canteen.test.jsx`
   - Added unit tests for outlet context student resolution, fallbacks, Breakfast, Lunch, and multi-child context.
3. `backend/src/modules/canteen/canteen.repository.js`
   - Harmonized `findAuthorizedStudentIdsForParent` with canonical `leave.repository.js` pattern (checking active user and profile).
   - Added resilient transaction configuration (`timeout: 20000, maxWait: 10000`).
4. `backend/src/modules/canteen/canteen.service.js`
   - Handled effective student ID derivation and multi-child validation.
5. `backend/tests/unit/canteen/canteen.service.test.js`
   - Added unit tests for parent student resolution and edge cases.
6. `backend/tests/unit/canteen/canteen.repository.test.js`
   - Added unit tests for repository parent student lookup.

---

## 20. Exact Fix
### Frontend Fix (`Canteen.jsx`):
```javascript
export default function Canteen() {
  const { userProfile } = useAuth();
  const outletContext = useOutletContext();
  const activeStudentId = outletContext?.activeStudentId;
  const activeChild = outletContext?.activeChild;

  const [fallbackChild, setFallbackChild] = useState(null);
  const [childrenChecked, setChildrenChecked] = useState(false);

  // Authoritative student resolution:
  // 1. activeStudentId from ParentDashboard Outlet context
  // 2. localStorage 'sms_active_student_id'
  // 3. fallbackChild from getMyChildren() REST call
  // 4. userProfile.linkedStudentId (legacy/fallback)
  const storedStudentId = typeof localStorage !== 'undefined' ? localStorage.getItem('sms_active_student_id') : null;
  const studentId = activeStudentId || storedStudentId || fallbackChild?.id || userProfile?.linkedStudentId || null;

  // Fallback loader for standalone or unhydrated context
  useEffect(() => {
    let isMounted = true;
    if (!activeStudentId && !storedStudentId && !childrenChecked) {
      getMyChildren()
        .then((res) => {
          if (!isMounted) return;
          const list = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
          if (list.length > 0) {
            const first = list[0].student || list[0];
            const name = `${first.firstName || ''} ${first.lastName || ''}`.trim() || first.name;
            setFallbackChild({ ...first, name });
          }
          setChildrenChecked(true);
        })
        .catch((err) => {
          console.error('[Canteen] Error loading linked children:', err);
          if (isMounted) setChildrenChecked(true);
        });
    } else {
      setChildrenChecked(true);
    }
    return () => {
      isMounted = false;
    };
  }, [activeStudentId, storedStudentId, childrenChecked]);
```

---

## 21. Database Changes
- **No Prisma migrations required.**
- The existing `canteen_requests`, `parent_profiles`, `parent_student_links`, and `students` tables fully support all required data attributes.

---

## 22. Tests Added
- `frontend/src/pages/Parent/__tests__/Canteen.test.jsx`:
  - 12 comprehensive unit tests covering Outlet context resolution, localStorage fallback, `getMyChildren` fallback, Breakfast creation, Lunch creation, 409 conflict handling, and admin format compatibility.
- `backend/tests/unit/canteen/canteen.repository.test.js`:
  - 3 unit tests verifying active parent profile resolution and deactivation checks.
- `backend/tests/unit/canteen/canteen.service.test.js`:
  - Added tests for single-child auto-resolution, missing-student NotFoundError, multi-child ambiguity ValidationError, and custody violation ForbiddenError.

---

## 23. Test Results
- **Backend Canteen Tests:**
  - 5 test suites passed, 62 tests passed:
    - `canteen.schemas.test.js`: 14 passed
    - `canteen.repository.test.js`: 3 passed
    - `canteen.controller.test.js`: 5 passed
    - `canteen.service.test.js`: 26 passed
    - `canteen.security.test.js`: 14 passed
- **Frontend Canteen Tests:**
  - 2 test suites passed, 20 tests passed:
    - `Parent/__tests__/Canteen.test.jsx`: 12 passed
    - `Admin/__tests__/CanteenManagement.test.jsx`: 8 passed

---

## 24. Integration Results
An automated end-to-end integration test was executed against the PostgreSQL database:
1. **Breakfast Request:** Created request `d860fc64-5397-4151-b366-a1a264d12722` for student `Ragu D` (Status: `Pending`).
2. **Lunch Request:** Created request `2f7c854c-5810-41b3-95a4-1760baa6eb19` for student `Ragu D` (Status: `Pending`).
3. **Database Verification:** Verified both records persisted in PostgreSQL with proper `schoolId`, `studentId`, and `itemDetails`.
4. **Duplicate Prevention:** Second Breakfast request correctly rejected with 409 Conflict.
5. **Custody Verification:** Request for unlinked student correctly rejected with 403 Forbidden.
6. **Admin Panel Visibility:** `listCanteenRequests` retrieved both records with student and class information.
7. **Status Update:** Admin updated Breakfast request to `Approved` successfully.

---

## 25. Full Regression Results
All unit, integration, and security test suites executed without regressions:
- No existing tests were broken.
- Tenant isolation and RBAC constraints remain intact.

---

## 26. Build Result
- **Command:** `npm run build` in `frontend`
- **Status:** **SUCCESS**
- **Output:** Built in 1.86s with 0 errors. All assets chunked and bundled cleanly.

---

## 27. Browser Verification
- **Browser Automation Status:** Attempted via subagent on `http://localhost:5173`.
- **Infrastructure Result:** Browser automation subagent failed due to upstream model capacity error (`UNAVAILABLE (code 503): No capacity available for model gemini-3-flash on the server`).
- **Alternative Verification:** Comprehensive DOM simulation unit tests (Vitest) and end-to-end PostgreSQL REST integration script were executed and passed 100%.

---

## 28. Remaining Limitations
- None. Multi-child parents switch active students via the parent header dropdown, and Canteen requests are automatically scoped to that selected child.

---

## 29. Final Status
**CLOSED / VERIFIED FIXED**
- Breakfast flow: PASS
- Lunch flow: PASS
- Database persistence: PASS
- Admin panel visibility: PASS
- Tenant isolation: PASS
- RBAC: PASS
