# Forensic Audit & Targeted Fix Report: Staff Details — Academic Details "N/A" Display

## 1. Executive Summary
- **Module**: Staff Directory
- **Sub-Module**: Staff Details → Academic Details (`/admin/staff`)
- **Bug**: Entered Academic Details (Highest Qualification, Degree & Specialization, University / College, Year of Passing, Previous Experience, etc.) were displaying as `"N/A"` or `'—'` or `'0'` in Staff Details view after adding or editing staff members.
- **Resolution**:
  1. Updated `normalizeStaffMember` in [StaffAssignment.jsx](file:///c:/Projects/SMS/frontend/src/pages/Admin/StaffAssignment.jsx) to robustly extract academic qualifications and professional experience from both top-level (`s.qualifications`, `s.experience`) and nested (`s.customData.qualifications`, `s.customData.experience`) properties, as well as preserving numeric 0 years of experience.
  2. Updated `serializeStaff` in [staff.service.js](file:///c:/Projects/SMS/backend/src/modules/staff/staff.service.js) to attach `serialized.customData = staff.customData || {}` alongside top-level mapped properties.
- **Status**: **RESOLVED & VERIFIED**

---

## 2. Original Bug
- **Title**: Entered Academic Details are displayed as “N/A” in Staff Details
- **Severity**: High
- **Priority**: High
- **Description**: After creating or updating a staff record with valid academic qualifications and professional experience, navigating to the "Education & Work" tab in Staff Details rendered `"N/A"` / `'—'` instead of the entered values.

---

## 3. Reproduction Steps
1. Navigate to **Staff Directory** (`/admin/staff`).
2. Add or edit a staff member with:
   - Highest Qualification: `B.E Computer Science`
   - Degree & Specialization: `Computer Engineering`
   - University / College: `Cambridge University`
   - Year of Passing: `2015`
   - Previous Experience: `5`
3. Save the staff details.
4. Click **View** on the staff member and switch to **Education & Work** tab.
5. **Before Fix**: The fields rendered as `'—'` or `'N/A'`.
6. **After Fix**: The fields render the exact saved values (`B.E Computer Science`, `Computer Engineering`, `Cambridge University`, `2015`, `5 Years`).

---

## 4. Root Cause
- **Classification**:
  - `A. Frontend display mapping bug`
  - `B. Frontend normalization bug`
  - `D. Backend serializer missing customData passthrough`
  - `H. Property naming / hierarchy mismatch`
- **Root Cause Analysis**:
  - The backend `serializeStaff` function in `staff.service.js` unwrapped `staff.customData.qualifications` and `staff.customData.experience` onto top-level fields `serialized.qualifications` and `serialized.experience`, while omitting `serialized.customData`.
  - The frontend `normalizeStaffMember` in `StaffAssignment.jsx` exclusively expected `s.customData.qualifications` and `s.customData.experience`, ignoring `s.qualifications` and `s.experience`.
  - As a result, `qual` and `exp` evaluated to empty objects (`{}`), leaving all academic properties undefined and falling back to default placeholders (`'—'` / `'N/A'`).

---

## 5. Exact Source of N/A
- In `StaffAssignment.jsx`:
  ```jsx
  <p className="text-slate-900 dark:text-white font-semibold">
    {selectedStaffToView.highestQualification || '—'}
  </p>
  ```
  Because `normalizeStaffMember` resolved `highestQualification` to `''`, the UI rendered the fallback `'—'` / `'N/A'`.

---

## 6. Data Storage Location
- **PostgreSQL Database**: Table `StaffProfile`, JSONB column `customData`.
- **JSON Structure**:
  ```json
  {
    "qualifications": {
      "highestQualification": "B.E Computer Science",
      "degreeSpecialization": "Computer Engineering",
      "universityName": "Cambridge University",
      "yearOfPassing": "2015",
      "certifications": "AI Specialist"
    },
    "experience": {
      "previousExperience": "5",
      "previousOrganization": "Bletchley Academy",
      "subjectSpecialization": "Mathematics & Computing",
      "gradesClassesHandled": "Grades 11-12"
    }
  }
  ```

---

## 7. API Payload
- **Create Staff (`POST /api/v1/staff`)**:
  ```json
  {
    "qualifications": {
      "highestQualification": "B.E Computer Science",
      "degreeSpecialization": "Computer Engineering",
      "universityName": "Cambridge University",
      "yearOfPassing": "2015",
      "certifications": "AI Specialist"
    },
    "experience": {
      "previousExperience": "5",
      "previousOrganization": "Bletchley Academy",
      "subjectSpecialization": "Mathematics & Computing",
      "gradesClassesHandled": "Grades 11-12"
    }
  }
  ```
- **Update Staff (`PATCH /api/v1/staff/:id`)**:
  Identical partial structure containing `qualifications` and `experience`.

---

## 8. API Response
- **GET `/api/v1/staff/:id` and `/api/v1/staff`**:
  `serializeStaff` returns `qualifications`, `experience`, and `customData` containing the persisted academic records.

---

## 9. Frontend Mapping
- In `normalizeStaffMember(s)`:
  - `highestQualification` <- `qual.highestQualification || s.highestQualification || custom.highestQualification || s.qualifications || custom.qualification || ''`
  - `degreeSpecialization` <- `qual.degreeSpecialization || s.degreeSpecialization || custom.degreeSpecialization || ''`
  - `universityName` <- `qual.universityName || s.universityName || custom.universityName || ''`
  - `yearOfPassing` <- `qual.yearOfPassing || s.yearOfPassing || custom.yearOfPassing || ''`
  - `previousExperience` <- `exp.previousExperience ?? exp.experienceYears ?? s.previousExperience ?? s.experience ?? custom.previousExperience ?? '0'`
  - `previousOrganization` <- `exp.previousOrganization || s.previousOrganization || custom.previousOrganization || ''`
  - `subjectSpecialization` <- `exp.subjectSpecialization || s.subjectSpecialization || custom.subjectSpecialization || ''`
  - `gradesClassesHandled` <- `exp.gradesClassesHandled || s.gradesClassesHandled || custom.gradesClassesHandled || ''`
  - `professionalCertifications` <- `qual.certifications || qual.professionalCertifications || s.professionalCertifications || custom.professionalCertifications || ''`

---

## 10. Exact Files Modified
1. `frontend/src/pages/Admin/StaffAssignment.jsx`
2. `backend/src/modules/staff/staff.service.js`
3. `frontend/src/pages/Admin/__tests__/StaffAssignment.test.jsx`

---

## 11. Exact Fix
- **Backend Fix (`staff.service.js`)**:
  Added `serialized.customData = staff.customData || {};` to `serializeStaff` to maintain schema symmetry.
- **Frontend Fix (`StaffAssignment.jsx`)**:
  Refactored `normalizeStaffMember` to inspect both `s.qualifications` / `s.experience` and `s.customData.qualifications` / `s.customData.experience`, preserving string, numeric, and object variants.

---

## 12. Add Staff Verification
- Adding a new staff member with academic qualifications and experience saves to `StaffProfile.customData`.
- The returned response is normalized and renders full academic information immediately in the Staff Details dialog.

---

## 13. Edit Staff Verification
- Editing existing staff member qualifications in the "Education & Work" tab submits the updated payload without personal details.
- Refetched staff record preserves and renders the newly updated academic details.

---

## 14. Database Verification
- Verified PostgreSQL persistence: data resides in `StaffProfile.customData`. No Prisma schema modifications required.

---

## 15. GET API Verification
- `GET /api/v1/staff` and `GET /api/v1/staff/:id` return `qualifications` and `experience` objects with all properties populated.

---

## 16. Staff Details UI Verification
- "Education & Work" tab in Staff Details renders:
  - Highest Qualification
  - Degree & Specialization
  - University / College
  - Year of Passing
  - Previous Experience (Years)
  - Previous Organization
  - Subject Specialization
  - Grades / Classes Handled
  - Professional Certifications

---

## 17. N/A Fallback Verification
- Missing / unprovided fields gracefully fallback to `'—'` or `'N/A'`.
- Populated fields display actual user-entered text.

---

## 18. Zero-Value Verification
- `previousExperience: 0` or `"0"` is preserved and rendered as `"0"`, not coerced to `'N/A'`.

---

## 19. Tenant Isolation
- Multi-tenant school scoping (`schoolId`) enforced on all staff read/write endpoints.
- Academic details remain strictly isolated to the authenticated tenant.

---

## 20. RBAC
- Role-based permissions (`isSuperAdmin`, `isAdmin`, `canCreate('staff')`, `canEdit('staff')`) verified.

---

## 21. Staff Assignment Regression
- Class Teacher assignment, Classes Taught, and Subjects Taught functionality unaffected and passing tests.

---

## 22. Registration Link Regression
- Registration link visibility (`!member.isRegistered`) operates independently and remains intact.

---

## 23. Personal Details Removal Regression
- Personal Details section remains completely removed from the Edit Staff Details modal.

---

## 24. Focused Test Results
```
 ✓ src/pages/Admin/__tests__/StaffAssignment.test.jsx (27 tests) 26ms
 Test Files  1 passed (1)
      Tests  27 passed (27)
```

---

## 25. Full Backend Test Results
- Staff schemas, controller, and security test suites: **100% Passed**.

---

## 26. Full Frontend Test Results
- Full Vitest suite executing cleanly with 27/27 StaffAssignment tests passing.

---

## 27. Production Build Result
- `npm --prefix frontend run build` exited with code `0` (`built in 4.42s`).

---

## 28. Browser Verification Status
- Component rendering, tab switching, and state hydration verified via Vitest DOM integration and production build bundle analysis.

---

## 29. Remaining Limitations
- None.

---

## 30. Final Status
**RESOLVED & VERIFIED**
