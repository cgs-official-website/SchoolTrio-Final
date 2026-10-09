# ADMIN NOTICEBOARD READ RECEIPTS NAME FIX FORENSIC REPORT

**Module:** Admin Portal & Teacher Portal  
**Submodule:** Notice Board → Read Receipts Modal  
**Date:** 2026-10-09  
**Status:** IMPLEMENTED & TESTED  

---

## 1. Executive Summary

In the Admin Noticeboard read receipts modal, parent-linked student receipts were displaying both parent and student names in bracketed format (e.g., `bala a (nisha a)`), instead of displaying the student's name alone (e.g., `nisha a`).

This issue has been resolved:
1. **Frontend Formatting:** Updated the read receipts modal in [Noticeboard.jsx](file:///c:/Projects/SMS/frontend/src/pages/Admin/Noticeboard.jsx) and [TeacherNoticeboard.jsx](file:///c:/Projects/SMS/frontend/src/pages/Teacher/TeacherNoticeboard.jsx) to prioritize `viewer.studentName` for parent-linked receipts, falling back to safe extraction / single identity names without showing bracketed parent-child combinations.
2. **Backend Preservation:** Ensured `batchEnrichNoticeViewers` in [notice.service.js](file:///c:/Projects/SMS/backend/src/modules/notices/notice.service.js) explicitly passes down `studentName` and `parentName` fields on each viewer receipt object.
3. **Multi-Student & Parent Isolation:** Verified that multiple children under the same parent remain two distinct read receipt rows and that Parent Portal active-child filtering remains strictly intact.

---

## 2. Root Cause Analysis

- **Storage vs Presentation Format:** Stored `viewedBy` records retain individual child linkages (`studentId`, `studentName`, `parentName`). However, `notice.service.js` serialized a combined display string `Parent (Student)` into `viewer.name` for generic notice consumers.
- **Frontend Direct Binding:** The Admin read receipts modal was rendering `{viewer.name || viewer.userName || 'Staff Member'}` directly. Because `viewer.name` contained `bala a (nisha a)`, it displayed the bracketed parent prefix instead of the clean student name.

---

## 3. Files Changed

1. **`frontend/src/pages/Admin/Noticeboard.jsx`**
   - Updated read receipts modal display name resolver to:
     ```javascript
     const displayName = viewer.studentName || (viewer.role?.toLowerCase() === 'parent' && viewer.name?.match(/\(([^)]+)\)$/)?.[1]?.trim()) || viewer.name || viewer.userName || 'Staff Member';
     ```

2. **`frontend/src/pages/Teacher/TeacherNoticeboard.jsx`**
   - Updated read receipts modal display name resolver with identical robust fallback logic.

3. **`backend/src/modules/notices/notice.service.js`**
   - Enriched notice viewers in `batchEnrichNoticeViewers` to explicitly preserve `studentName: resolvedStudent?.name || v.studentName` and `parentName: resolved?.name || v.parentName`.

4. **`backend/src/modules/notices/notice.service.test.js`**
   - Added focused automated test suite covering all 7 required scenarios.

---

## 4. Exact Display Formatting Behavior

| Receipt Type | Underlying Data | Display in Admin Read Receipts |
|---|---|---|
| Parent-linked receipt for Nisha A | `parentName: "Bala A"`, `studentName: "Nisha A"` | `Nisha A` |
| Parent-linked receipt for Bala A | `parentName: "Bala A"`, `studentName: "Bala A"` | `Bala A` |
| Staff receipt | `name: "Sarah Connor"`, `role: "teacher"` | `Sarah Connor` |
| Student's own receipt | `name: "David Miller"`, `role: "student"` | `David Miller` |
| Legacy receipt with bracketed format | `name: "bala a (nisha a)"`, `role: "parent"` | `nisha a` |
| Legacy receipt with single parent name | `name: "Bala A"`, `role: "parent"` | `Bala A` |

---

## 5. Verification & Test Results

### A. Automated Backend Tests
- **Command:** `npx vitest run src/modules/notices/notice.service.test.js`
- **Result:** 10 / 10 tests passed (100%)
  ```text
  RUN  v3.2.7 C:/Projects/SMS/backend
  ✓ src/modules/notices/notice.service.test.js (10 tests) 19ms
  Test Files  1 passed (1)
       Tests  10 passed (10)
  ```

### B. Frontend Production Build
- **Command:** `npm run build` in `frontend/`
- **Result:** Successfully built in 5.83s with 0 errors or warnings.

### C. Multi-Student and Parent Portal Verification
- **Multiple Children:** Separate receipt entries for siblings linked to one parent are preserved as separate rows with unique `studentId`s.
- **Parent Portal Active-Child Filtering:** Unaffected (Parent Portal still filters notices by `activeStudentId`/`activeClassId`).
- **Database & Schemas:** Zero DB schema modifications or migrations.

### D. Manual Browser Verification Status
- **Status:** **PENDING** (In accordance with Section 5 of requirements, browser verification is marked as PENDING since live browser session was not launched in this environment).

---

## 6. Conclusion

The Admin Noticeboard Read Receipts modal now renders pure student names alone for parent-linked receipts without bracketed parent prefixes, maintaining complete backward compatibility, multi-student tracking, and tenant isolation.
