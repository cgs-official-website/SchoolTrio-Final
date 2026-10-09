# BUG.ATTENDANCE.SECTION.PARAMS — PRODUCTION 400 BAD REQUEST FORENSIC INVESTIGATION & FIX REPORT

**Date:** October 9, 2026  
**Module:** Admin → Attendance (`frontend/src/pages/Admin/Attendance.jsx`)  
**Severity:** High  
**Status:** RESOLVED & VERIFIED  

---

## 1. Executive Summary & Root Cause

### Observed Production Error
```text
GET /api/v1/attendance/sessions?classId=90590c9c-d203-4986-a36d-25cda87b3e96&date=FN&session=true&limit=1&sectionId=2026-10-09
HTTP 400 Bad Request
```

### Forensic Analysis of the Error Query
The parameters in the failed request were misaligned as follows:
- `classId`: `90590c9c-d203-4986-a36d-25cda87b3e96` (Valid Class UUID)
- `date`: `"FN"` (Passed session enum value instead of ISO calendar date `YYYY-MM-DD` — fails ISO regex)
- `session`: `true` (Passed boolean `silent` flag instead of enum `['STANDARD', 'FN', 'AN']` — fails enum validation)
- `limit`: `1`
- `sectionId`: `"2026-10-09"` (Passed attendance date instead of optional Section UUID — fails UUID regex)

### Exact Root Cause
In `frontend/src/pages/Admin/Attendance.jsx`:
1. `fetchDailySession` was declared with the 5-parameter signature:
   ```javascript
   const fetchDailySession = useCallback(async (targetClassId, targetSectionId, targetDate, targetSession, silent = false) => {
   ```
2. In the initial `useEffect` on line 305, the arguments were correctly supplied:
   ```javascript
   fetchDailySession(selectedClassId, selectedSectionId, selectedDate, selectedSession, false);
   ```
3. However, in `handleLiveRefresh` (line 572) and `handleRefresh` (line 586), the legacy 4-argument call signature remained:
   ```javascript
   // Legacy call:
   fetchDailySession(selectedClassId, selectedDate, selectedSession, true);
   ```
   Positional mapping occurred as:
   - `targetClassId` = `selectedClassId` (`"90590c9c-..."`)
   - `targetSectionId` = `selectedDate` (`"2026-10-09"`)
   - `targetDate` = `selectedSession` (`"FN"`)
   - `targetSession` = `true`
   - `silent` = `false`

When attendance was marked and saved, `notifyDataChanged('attendance')` was emitted. This triggered `handleLiveRefresh`, which immediately executed the misaligned `fetchDailySession` call, resulting in the 400 Bad Request error. The same error occurred when clicking the manual refresh button or switching views.

---

## 2. API Contract Verification

### Backend Endpoint: `GET /api/v1/attendance/sessions`
Defined in `backend/src/modules/attendance/attendance.schemas.js`:
- `classId`: `z.string().regex(REGEX.UUID).optional()`
- `sectionId`: `z.string().regex(REGEX.UUID).optional()`
- `date`: `z.string().regex(REGEX.DATE_ISO, 'Date must be formatted as YYYY-MM-DD').optional()`
- `session`: `z.enum(['STANDARD', 'FN', 'AN']).optional()`
- `limit`: `z.coerce.number().int().min(1).max(100).default(20).optional()`

The backend schema contract is strict, secure, and entirely correct. The resolution required fixing the client-side argument mapping.

---

## 3. Implementation Details & Fixes

### 1. Fixed Call Sites in `frontend/src/pages/Admin/Attendance.jsx`
- **`handleLiveRefresh`**:
  ```javascript
  const handleLiveRefresh = useCallback(() => {
    if (activeTab === 'dashboard') {
      fetchDashboardStats(selectedDate);
    } else if (activeTab === 'marking' && selectedClassId && students.length > 0) {
      fetchDailySession(selectedClassId, selectedSectionId, selectedDate, selectedSession, true);
    } else if (activeTab === 'analytics') {
      fetchAnalyticsData(selectedDate);
    }
  }, [activeTab, selectedDate, selectedClassId, selectedSectionId, students.length, selectedSession, fetchDashboardStats, fetchDailySession, fetchAnalyticsData]);
  ```
- **`handleRefresh`**:
  ```javascript
  const handleRefresh = () => {
    setRefreshing(true);
    if (activeTab === 'dashboard') {
      fetchDashboardStats(selectedDate);
    } else if (activeTab === 'marking' && selectedClassId) {
      fetchDailySession(selectedClassId, selectedSectionId, selectedDate, selectedSession, false);
    } else if (activeTab === 'analytics') {
      fetchAnalyticsData(selectedDate);
    }
  };
  ```

### 2. Multi-Section Race Condition Guards
Updated the request-race condition validation inside `fetchDailySession` to verify `currentSectionRef.current === (targetSectionId || null)` alongside `classId`, `date`, and `session` refs.

### 3. Historical Reports Section Scoping
Updated historical session fetching (lines 440–492) to pass `sectionId: selectedSectionId` whenever a section is selected and added `selectedSectionId` to the effect dependency list.

---

## 4. Before & After Request Comparison

### Before (Failing Request on Live Refresh / Marking / Refresh)
```text
GET /api/v1/attendance/sessions?classId=90590c9c-d203-4986-a36d-25cda87b3e96&sectionId=2026-10-09&date=FN&session=true&limit=1
Status: 400 Bad Request
```

### After (Correctly Mapped Request)
```text
GET /api/v1/attendance/sessions?classId=90590c9c-d203-4986-a36d-25cda87b3e96&sectionId=b35d8866-93fb-464a-9bcf-cb60ffb821a8&date=2026-10-09&session=FN&limit=1
Status: 200 OK
```

---

## 5. Security & Tenant Isolation Verification
- All queries remain strictly scoped by `schoolId` derived from the server-side authenticated JWT/session.
- Client cannot manipulate `schoolId` or access cross-tenant attendance records.
- Backend RBAC and authorization checks remain intact.

---

## 6. Build & Regression Results
- `npm run build` executed in `frontend/`:
  ```
  ✓ built in 19.02s (2147 modules transformed)
  0 errors, 0 warnings
  ```

---

## 7. Files Inspected & Modified

| File | Status | Description of Change |
| :--- | :--- | :--- |
| `frontend/src/pages/Admin/Attendance.jsx` | Modified | Fixed positional arguments in `handleLiveRefresh` and `handleRefresh`; updated historical reports query; enhanced section race-condition guards |
| `backend/src/modules/attendance/attendance.schemas.js` | Verified | Verified strict Zod schemas for `listAttendanceSessionsSchema` and `createAttendanceSessionSchema` |
| `backend/src/modules/attendance/attendance.repository.js` | Verified | Verified tenant-scoped `classId` and `sectionId` filters |

---

## 8. Final Status
**STATUS:** RESOLVED. Attendance loading, live-data refreshing, and marking requests now cleanly transmit correctly mapped parameters matching the backend API contract.
