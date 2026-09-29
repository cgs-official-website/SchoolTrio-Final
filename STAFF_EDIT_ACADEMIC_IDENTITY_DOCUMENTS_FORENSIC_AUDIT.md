# Staff Edit — Education, Identity/Banking & Documents Persistence Forensic Audit

## 1. Executive Summary
- **Module**: Staff Directory
- **Sub-Module**: Edit Staff Details (`/admin/staff`)
- **Issue**: Values entered in **Education & Work**, **Identity & Banking**, and **Documents** were failing to persist or display when reopening the staff member after saving changes.
- **Root Cause Classifications**:
  - **Education & Work**: `F (customData replacement / overwrite bug)` & `B (Save payload partial mapping)`
  - **Identity & Banking**: `F (customData replacement / overwrite bug)` & `B (Save payload partial mapping)`
  - **Documents**: `F (customData replacement / overwrite bug)` & `J (Document category metadata omission during save)`

---

## 2. Exact Affected Components
1. **Frontend**:
   - Component: `StaffAssignment` in `frontend/src/pages/Admin/StaffAssignment.jsx`
   - Save Handler: `handleSaveStaffEdit`
   - Normalizer: `normalizeStaffMember`
   - Edit Modal: `viewStaffModalOpen && isStaffEditMode`
2. **Backend**:
   - Service: `updateStaff` and `serializeStaff` in `backend/src/modules/staff/staff.service.js`
   - Controller: `updateStaff` in `backend/src/modules/staff/staff.controller.js`
   - Schemas: `updateStaffSchema` in `backend/src/modules/staff/staff.schemas.js`
   - Repository: `updateStaffProfile` in `backend/src/modules/staff/staff.repository.js`

---

## 3. Data Flow Traces

### A. Education & Work Data Flow
```
Edit UI (highestQualification, degreeSpecialization, universityName, yearOfPassing, previousExperience, previousOrganization, subjectSpecialization, gradesClassesHandled, professionalCertifications)
  ↓
React Form State (editStaffData)
  ↓
Save Handler (handleSaveStaffEdit constructs updatePayload.qualifications and updatePayload.experience)
  ↓
PATCH /api/v1/staff/:id
  ↓
Backend Schema (updateStaffSchema allows qualifications and experience records)
  ↓
Staff Service (updateStaff merges qualifications and experience into newCustom)
  ↓
Prisma (tx.staffProfile.update saves customData JSONB)
  ↓
PostgreSQL (StaffProfile.customData column)
  ↓
GET /api/v1/staff/:id
  ↓
Serializer (serializeStaff maps customData.qualifications & customData.experience to top-level + customData)
  ↓
Frontend Normalization (normalizeStaffMember maps to top-level properties)
  ↓
Edit Modal Hydration (setEditStaffData({ ...selectedStaffToView }))
  ↓
Displayed Field
```

### B. Identity & Banking Data Flow
```
Edit UI (govtIdType, govtIdNumber, aadharNumber, panNumber, pfNumber, esicNumber, uanNumber, taxIdDetails, bankName, bankAccountNumber, branchName, ifscCode)
  ↓
React Form State (editStaffData)
  ↓
Save Handler (handleSaveStaffEdit constructs updatePayload.financial and updatePayload.customData)
  ↓
PATCH /api/v1/staff/:id
  ↓
Backend Schema (updateStaffSchema allows financial and customData records)
  ↓
Staff Service (updateStaff deep merges financial and identity keys into newCustom)
  ↓
Prisma (tx.staffProfile.update saves customData JSONB)
  ↓
PostgreSQL (StaffProfile.customData)
  ↓
GET /api/v1/staff/:id
  ↓
Serializer (serializeStaff maps financial object with all identity & banking fields)
  ↓
Frontend Normalization (normalizeStaffMember maps financial & govt fields)
  ↓
Edit Modal Hydration (setEditStaffData({ ...selectedStaffToView }))
  ↓
Displayed Field
```

### C. Documents Data Flow
```
File Selection / Existing Docs (academicCertificates, markSheets, experienceCertificates, relievingLetter, resume, referenceLetters, govtIdDocument, salarySlips)
  ↓
Upload to Cloudinary / Firebase Storage
  ↓
State Aggregation (mergedDocs combines all 8 categories with existing + newly uploaded documents)
  ↓
Save Handler (handleSaveStaffEdit constructs updatePayload.documents: mergedDocs)
  ↓
PATCH /api/v1/staff/:id
  ↓
Backend Schema (updateStaffSchema allows documents record)
  ↓
Staff Service (updateStaff merges documents into newCustom.documents)
  ↓
Prisma (StaffProfile.customData)
  ↓
PostgreSQL (StaffProfile.customData.documents)
  ↓
GET /api/v1/staff/:id
  ↓
Serializer (serializeStaff returns documents object)
  ↓
Frontend Normalization (normalizeStaffMember maps all 8 categories to top-level arrays)
  ↓
Documents UI
```

---

## 4. Root Causes & Exact Data-Loss Points

### Defect 1: Backend `customData` Overwrite in `staff.service.js`
In `backend/src/modules/staff/staff.service.js`:
```javascript
  directCustomKeys.forEach(k => {
    if (data[k] !== undefined) {
      newCustom[k] = data[k];
      customDataChanged = true;
    }
  });

  if (data.customData) {
    Object.assign(newCustom, data.customData);
    customDataChanged = true;
  }
```
When the frontend submitted `updatePayload.customData = { ...(selectedStaffToView.customData || {}), ... }`, `Object.assign(newCustom, data.customData)` ran **after** `directCustomKeys.forEach`, clobbering the freshly updated `qualifications`, `experience`, `financial`, and `documents` objects with the stale properties present in `data.customData`.

### Defect 2: Document Categories Omission During Save
In `StaffAssignment.jsx`:
`docUpdates` only contained categories where **new** files were uploaded in that edit session. For categories with existing files where no new upload occurred, `docUpdates[cat]` was undefined. Spreading `selectedStaffToView.customData?.documents` was incomplete if `customData.documents` was unhydrated, causing existing documents to be stripped on subsequent saves.

### Defect 3: Shallow Object Replacement vs Deep Merge
If a partial update updated only `Education & Work`, direct assignment `newCustom[k] = data[k]` without deep merging would replace existing fields within nested sub-objects if partial keys were sent.

---

## 5. Safe Resolution Plan
1. **Backend (`staff.service.js`)**:
   - Merge `data.customData` non-structured keys first, excluding `qualifications`, `experience`, `financial`, `documents`, `assignments`.
   - Deep merge `directCustomKeys` objects (`qualifications`, `experience`, `financial`, `documents`) into `newCustom`.
   - Ensure `serializeStaff` safely includes all financial and identity keys in `serialized.financial`.
2. **Frontend (`StaffAssignment.jsx`)**:
   - In `handleSaveStaffEdit`, iterate over all 8 document categories and construct a complete `mergedDocs` map preserving existing files + new uploaded files.
   - Clean up `updatePayload.customData` to only include custom properties and identity IDs, preventing stale `qualifications`/`experience`/`financial` propagation.
   - Ensure `financial` payload includes all 12 identity & banking fields.
3. **Preservation Requirements**:
   - Personal Details remain completely removed from Edit mode.
   - Class Teacher assignment, Classes Taught, Subjects Taught, and Registration Link visibility remain 100% intact.
